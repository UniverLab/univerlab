// The admin control-room client: the audits table (publish toggle, two-step
// remove), the signing-console counts and the booking /health line. Every
// string comes from the page's dataset so both languages share this module;
// every row is built with textContent, never innerHTML, because titles ride
// in from R2.
import { validateAuditDocument } from '../audit/validate-document';
import {
  forcePrivate,
  parseZipCentralDirectory,
  proposeTarget,
  summarizeUpload,
  unwrapZipRoot,
  validateUploadEntries,
  type UploadFile,
} from './upload';

export interface AdminClientStrings {
  visibilityPublic: string;
  visibilityPrivate: string;
  findingsLine: string;
  auditCounts?: string;
  thAudit?: string;
  thDate?: string;
  thVisibility?: string;
  thFindings?: string;
  thDoi?: string;
  thActions?: string;
  publish: string;
  unpublish: string;
  refused: string;
  remove: string;
  confirmRemove: string;
  signCounts: string;
  bookingOk: string;
  bookingDown: string;
  bookingLine: string;
  loadError: string;
  auditsEmpty: string;
  actionMissing: string;
  actionNetwork: string;
  actionFailed: string;
}

/** The "New audit" intake strings: a partial because older pages only
 *  carry the table strings. Missing keys fall back to plain words. */
export interface AdminUploadStrings {
  uploadSystem: string;
  uploadEdition: string;
  uploadSend: string;
  uploadReplace: string;
  uploadCancel: string;
  uploadStored: string;
  uploadExists: string;
  uploadInvalid: string;
  uploadEmpty: string;
  uploadReading: string;
  uploadSending: string;
}

interface AdminRowFindings {
  total: number;
  open: number;
  bySeverity?: Partial<Record<string, number>>;
  openBySeverity?: Partial<Record<string, number>>;
}

interface AdminRowJson {
  slug: string;
  system: string;
  edition: string;
  legacy?: boolean;
  isLatest: boolean;
  title: string;
  date: string;
  visibility: 'public' | 'private';
  doi: string | null;
  findings: AdminRowFindings;
}

interface SignRequestJson {
  state?: unknown;
  status?: unknown;
}

/** Pending and signed counts for the signing-console card. The list API
 *  reports `state` through linkState — a pending request reads `ready`, never
 *  `pending` — so pending derives the same way the owner console shows it:
 *  the stored `status` wins, with `ready` as the pending fallback for older
 *  payloads that predate `status`. */
export function countSignRequests(reqs: SignRequestJson[]): { pending: number; signed: number } {
  let pending = 0;
  let signed = 0;
  for (const r of reqs) {
    if (r.status === 'signed' || r.state === 'signed') {
      signed += 1;
    } else if (r.status === 'pending' ? r.state !== 'expired' : r.state === 'ready') {
      pending += 1;
    }
  }
  return { pending, signed };
}

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** One edition's own address: the stable system page shows the latest, and
 *  every edition opens under it. */
function auditHref(system: string, edition: string, visibility: string): string {
  return visibility === 'public'
    ? `/workbench/audits/${system}/${edition}/`
    : `/audits/${system}/${edition}/`;
}

/** The request body addressing the stored object the row came from: a
 *  legacy old-layout row goes back as its bare slug, a new-layout row as
 *  its system/edition pair. Older rows without system/edition fall back
 *  to the bare slug. */
function editionBody(row: AdminRowJson): Record<string, string> {
  if (
    !row.legacy &&
    typeof row.system === 'string' &&
    row.system !== '' &&
    typeof row.edition === 'string' &&
    row.edition !== ''
  ) {
    return { system: row.system, edition: row.edition };
  }
  return { slug: row.slug };
}

/** The per-row failure line for a visibility or remove request: 404 names
 *  the missing audit, 409 keeps the refusal with its reason, anything else
 *  names the status. */
function rowErrorText(
  s: AdminClientStrings,
  res: Response,
  data: Record<string, unknown> | null,
): string {
  if (res.status === 404) return s.actionMissing;
  if (res.status === 409) {
    const reason = typeof data?.['reason'] === 'string' ? (data['reason'] as string) : '';
    return fill(s.refused, { reason });
  }
  return fill(s.actionFailed, { status: String(res.status) });
}

/** Wire the control room. Bails without throwing when the table is absent. */
export function initAdminPage(s: AdminClientStrings, opts: { bookingApi: string }): void {
  const list = document.getElementById('admin-audits');
  if (!list) return;
  const error = document.getElementById('admin-error');
  const empty = document.getElementById('admin-empty');
  const counts = document.getElementById('admin-sign-counts');
  const booking = document.getElementById('admin-booking-status');

  const showError = (): void => {
    if (error) {
      error.textContent = s.loadError;
      error.hidden = false;
    }
  };

  const toggleRow = async (row: AdminRowJson, cells: { link: HTMLAnchorElement; vis: HTMLElement; action: HTMLElement; note: HTMLElement }, btn: HTMLButtonElement): Promise<void> => {
    const target = row.visibility === 'public' ? 'private' : 'public';
    let res: Response;
    try {
      res = await fetch('/api/admin-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editionBody(row), visibility: target }),
      });
    } catch {
      cells.note.textContent = s.actionNetwork;
      return;
    }
    if (!res.ok) {
      const data = await readJson(res);
      cells.note.textContent = rowErrorText(s, res, data);
      return;
    }
    row.visibility = target;
    cells.link.href = auditHref(row.system ?? row.slug, row.edition ?? row.slug, row.visibility);
    cells.vis.textContent = row.visibility === 'public' ? s.visibilityPublic : s.visibilityPrivate;
    btn.textContent = row.visibility === 'public' ? s.unpublish : s.publish;
    cells.note.textContent = '';
  };

  const removeRow = async (
    row: AdminRowJson,
    _tr: HTMLElement,
    btn: HTMLButtonElement,
    note: HTMLElement,
  ): Promise<void> => {
    if (!btn.dataset['armed']) {
      btn.dataset['armed'] = '1';
      btn.textContent = fill(s.confirmRemove, { slug: row.slug });
      return;
    }
    let res: Response;
    try {
      res = await fetch('/api/admin-remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editionBody(row), confirm: true }),
      });
    } catch {
      note.textContent = s.actionNetwork;
      return;
    }
    if (!res.ok) {
      const data = await readJson(res);
      note.textContent = rowErrorText(s, res, data);
      return;
    }
    await loadAudits();
  };

  const formatDate = (iso: string): string => {
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return iso;
    try {
      return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(time));
    } catch {
      return iso;
    }
  };

  const renderRows = (rows: AdminRowJson[]): void => {
    list.textContent = '';
    if (empty) empty.hidden = rows.length !== 0;
    let system: string | null = null;
    for (const row of rows) {
      const group = typeof row.system === 'string' && row.system !== '' ? row.system : null;
      if (group !== null && group !== system) {
        system = group;
        const header = document.createElement('tr');
        header.className = 'admin-system';
        const cell = document.createElement('th');
        cell.colSpan = 6;
        cell.textContent = system;
        header.appendChild(cell);
        list.appendChild(header);
      }
      const tr = document.createElement('tr');
      const audit = document.createElement('td');
      if (s.thAudit) audit.dataset['label'] = s.thAudit;
      const link = document.createElement('a');
      link.href = auditHref(row.system ?? row.slug, row.edition ?? row.slug, row.visibility);
      link.textContent = row.title === '' ? row.slug : `${row.title} — ${row.slug}`;
      audit.appendChild(link);
      const date = document.createElement('td');
      if (s.thDate) date.dataset['label'] = s.thDate;
      const time = document.createElement('time');
      time.dateTime = row.date;
      time.textContent = formatDate(row.date);
      date.appendChild(time);
      const vis = document.createElement('td');
      if (s.thVisibility) vis.dataset['label'] = s.thVisibility;
      vis.textContent = row.visibility === 'public' ? s.visibilityPublic : s.visibilityPrivate;
      const findings = document.createElement('td');
      if (s.thFindings) findings.dataset['label'] = s.thFindings;
      findings.textContent = fill(s.findingsLine, { open: String(row.findings.open), total: String(row.findings.total) });
      for (const sev of ['critical', 'high', 'medium', 'low', 'info'] as const) {
        const n = row.findings.openBySeverity?.[sev] ?? 0;
        if (n > 0) {
          const chip = document.createElement('span');
          chip.className = `admin-sev admin-sev-${sev}`;
          chip.textContent = `${sev} ${n}`;
          findings.appendChild(chip);
        }
      }
      const doi = document.createElement('td');
      if (s.thDoi) doi.dataset['label'] = s.thDoi;
      if (row.doi) {
        const a = document.createElement('a');
        a.href = `https://doi.org/${row.doi}`;
        a.textContent = row.doi;
        doi.appendChild(a);
      } else {
        doi.textContent = '—';
      }
      const action = document.createElement('td');
      if (s.thActions) action.dataset['label'] = s.thActions;
      const buttons = document.createElement('div');
      buttons.className = 'sign-row-actions admin-row-actions';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'sign-row-action admin-publish';
      toggle.textContent = row.visibility === 'public' ? s.unpublish : s.publish;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'sign-row-action admin-remove';
      remove.textContent = s.remove;
      const note = document.createElement('p');
      note.className = 'admin-note';
      toggle.addEventListener('click', () => void toggleRow(row, { link, vis, action, note }, toggle));
      remove.addEventListener('click', () => void removeRow(row, tr, remove, note));
      buttons.append(toggle, remove);
      action.append(buttons, note);
      tr.append(audit, date, vis, findings, doi, action);
      list.appendChild(tr);
    }
  };

  const loadAudits = async (): Promise<void> => {
    let res: Response;
    try {
      res = await fetch('/api/admin-audits');
    } catch {
      showError();
      return;
    }
    if (!res.ok) {
      showError();
      return;
    }
    const data = await readJson(res);
    const rows = Array.isArray(data?.['audits']) ? (data['audits'] as AdminRowJson[]) : null;
    if (!rows) {
      showError();
      return;
    }
    renderRows(rows);
    const glance = document.getElementById('admin-audits-counts');
    if (glance && s.auditCounts) {
      let pub = 0;
      let priv = 0;
      let high = 0;
      for (const row of rows) {
        if (row.visibility === 'public') pub += 1;
        else priv += 1;
        high += (row.findings.openBySeverity?.['critical'] ?? 0) + (row.findings.openBySeverity?.['high'] ?? 0);
      }
      glance.textContent = fill(s.auditCounts, {
        pub: String(pub),
        priv: String(priv),
        high: String(high),
      });
    }
  };

  const loadSignCounts = async (): Promise<void> => {
    if (!counts) return;
    try {
      const res = await fetch('/api/sign-request');
      if (!res.ok) return;
      const data = await readJson(res);
      const reqs = Array.isArray(data?.['requests']) ? (data['requests'] as SignRequestJson[]) : [];
      const { pending, signed } = countSignRequests(reqs);
      counts.textContent = fill(s.signCounts, { pending: String(pending), signed: String(signed) });
    } catch {
      // The counts are a courtesy: the console link below them always works.
    }
  };

  const loadBooking = async (): Promise<void> => {
    if (!booking) return;
    let status = s.bookingDown;
    try {
      const res = await fetch(`${opts.bookingApi}/health`);
      if (res.ok && (await res.text()).trim() === 'ok') status = s.bookingOk;
    } catch {
      // Offline stays offline: the line below names it.
    }
    booking.textContent = fill(s.bookingLine, { status });
  };

  void loadAudits();
  void loadSignCounts();
  void loadBooking();
  void initUpload(s as AdminClientStrings & Partial<AdminUploadStrings>, () => {
    void loadAudits();
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

async function postUpload(body: Record<string, unknown>): Promise<{ res: Response; data: Record<string, unknown> | null }> {
  const res = await fetch('/api/admin-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, data: await readJson(res) };
}

/** The "New audit" intake: a folder (webkitdirectory) or a .zip is read
 *  locally, previewed (title, client, language, version, findings by
 *  severity, files, total size) with the system/edition the CLI rule
 *  proposes, then sent one file per request and confirmed. The new edition
 *  joins the list through loadAudits — no reload. Absent when the page
 *  carries no upload section. */
function initUpload(u: AdminClientStrings & Partial<AdminUploadStrings>, reload: () => void): void {
  const section = document.getElementById('admin-upload');
  if (!section) return;
  const folder = document.getElementById('admin-upload-folder') as HTMLInputElement | null;
  const zip = document.getElementById('admin-upload-zip') as HTMLInputElement | null;
  const preview = document.getElementById('admin-upload-preview');
  const systemInput = document.getElementById('admin-upload-system') as HTMLInputElement | null;
  const editionInput = document.getElementById('admin-upload-edition') as HTMLInputElement | null;
  const send = document.getElementById('admin-upload-send') as HTMLButtonElement | null;
  const replace = document.getElementById('admin-upload-replace') as HTMLButtonElement | null;
  const note = document.getElementById('admin-upload-note');
  if (!folder || !zip || !preview || !systemInput || !editionInput || !send || !replace || !note) return;

  let files: UploadFile[] = [];
  let issues: { path: string; message: string }[] = [];
  let lastProposed: { system: string; edition: string } | null = null;
  let busy = false;

  const say = (text: string): void => {
    note.textContent = text;
  };

  const renderPreview = (): void => {
    preview.textContent = '';
    if (files.length === 0) {
      preview.hidden = true;
      send.disabled = true;
      return;
    }
    const raw = files.find((f) => f.name === 'audit.json');
    let doc: unknown = null;
    try {
      doc = raw ? (JSON.parse(new TextDecoder().decode(raw.bytes)) as unknown) : null;
    } catch {
      doc = null;
    }
    const summary = summarizeUpload(doc, files);
    const lines = [
      `${summary.title}`,
      `${summary.client} · ${summary.language} · v${summary.version}`,
      Object.entries(summary.findings.bySeverity)
        .map(([sev, n]) => `${sev}: ${n}`)
        .join(' · '),
      `${summary.files} files · ${summary.totalSize} bytes`,
    ];
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      preview.appendChild(p);
    }
    if (issues.length > 0) {
      const head = document.createElement('p');
      head.textContent = fill(u.uploadInvalid ?? 'The document holds {n} problem(s).', { n: String(issues.length) });
      preview.appendChild(head);
      const list = document.createElement('ul');
      for (const issue of issues) {
        const item = document.createElement('li');
        item.textContent = `${issue.path}: ${issue.message}`;
        list.appendChild(item);
      }
      preview.appendChild(list);
    }
    preview.hidden = false;
    send.disabled = issues.length > 0 || busy;
  };

  const readSelection = async (picked: File[], baseName: string): Promise<void> => {
    say(u.uploadReading ?? 'Reading…');
    replace.hidden = true;
    try {
      if (picked.length === 1 && picked[0].name.toLowerCase().endsWith('.zip')) {
        files = unwrapZipRoot(await parseZipCentralDirectory(new Uint8Array(await picked[0].arrayBuffer())));
      } else {
        files = [];
        for (const file of picked) {
          const rel = typeof file.webkitRelativePath === 'string' && file.webkitRelativePath !== ''
            ? file.webkitRelativePath
            : file.name;
          const name = rel.includes('/') ? rel.slice(rel.indexOf('/') + 1) : rel;
          if (name === '') continue;
          files.push({ name, bytes: new Uint8Array(await file.arrayBuffer()) });
        }
      }
    } catch {
      files = [];
      issues = [{ path: 'audit.json', message: 'not a readable .zip archive' }];
      say(u.uploadEmpty ?? 'The selection holds no audit.json.');
      renderPreview();
      return;
    }
    const raw = files.find((f) => f.name === 'audit.json');
    if (!raw) {
      issues = [{ path: 'audit.json', message: 'audit.json is missing from the upload' }];
      say(u.uploadEmpty ?? 'The selection holds no audit.json.');
      renderPreview();
      return;
    }
    let doc: unknown;
    try {
      doc = JSON.parse(new TextDecoder().decode(raw.bytes)) as unknown;
    } catch {
      issues = [{ path: 'audit.json', message: 'audit.json is not valid JSON' }];
      say(u.uploadEmpty ?? 'The selection holds no audit.json.');
      renderPreview();
      return;
    }
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
      issues = [{ path: 'audit.json', message: 'audit.json is not a JSON object' }];
      renderPreview();
      return;
    }
    // The preview checks the stored form: the upload is always private.
    const stored = forcePrivate(doc as Record<string, unknown>, 'owner@univerlab.org');
    issues = [
      ...validateAuditDocument(stored).errors.map((e) => ({ path: e.path, message: e.message })),
      ...(await validateUploadEntries(files, stored)),
    ];
    const proposed = proposeTarget(baseName);
    if (proposed) {
      if (systemInput.value === '' || systemInput.value === lastProposed?.system) systemInput.value = proposed.system;
      if (editionInput.value === '' || editionInput.value === lastProposed?.edition) editionInput.value = proposed.edition;
      lastProposed = proposed;
    }
    say('');
    renderPreview();
  };

  folder.addEventListener('change', () => {
    const picked = [...(folder.files ?? [])] as File[];
    const first = (picked[0] as File & { webkitRelativePath?: string })?.webkitRelativePath ?? '';
    void readSelection(picked, first.includes('/') ? first.slice(0, first.indexOf('/')) : 'audit');
  });
  zip.addEventListener('change', () => {
    const picked = [...(zip.files ?? [])] as File[];
    const name = picked[0]?.name ?? 'audit.zip';
    void readSelection(picked, name.toLowerCase().endsWith('.zip') ? name.slice(0, -4) : name);
  });

  const sendAll = async (withReplace: boolean): Promise<void> => {
    if (busy || files.length === 0) return;
    busy = true;
    send.disabled = true;
    try {
      const init = await postUpload({ action: 'init', system: systemInput.value, edition: editionInput.value });
      if (!init.res.ok || init.data?.['uploadId'] == null) {
        say(fill(u.actionFailed ?? 'Action failed ({status}).', { status: String(init.res.status) }));
        return;
      }
      const uploadId = String(init.data['uploadId']);
      if (init.data['exists'] === true && !withReplace) {
        say(fill(u.uploadExists ?? 'Edition {slug} already exists.', { slug: editionInput.value }));
        replace.hidden = false;
        return;
      }
      replace.hidden = true;
      let done = 0;
      for (const file of files) {
        say(fill(u.uploadSending ?? 'Sending {done}/{total}…', { done: String(done), total: String(files.length) }));
        const sent = await postUpload({ action: 'file', uploadId, name: file.name, bytes: bytesToBase64(file.bytes) });
        if (!sent.res.ok) {
          const rawIssues = (sent.data as Record<string, unknown> | null)?.['issues'];
          say(
            Array.isArray(rawIssues)
              ? (rawIssues as { path: string; message: string }[]).map((i) => `${i.path}: ${i.message}`).join('; ')
              : fill(u.actionFailed ?? 'Action failed ({status}).', { status: String(sent.res.status) }),
          );
          return;
        }
        done += 1;
      }
      const fin = await postUpload(withReplace ? { action: 'finalize', uploadId, replace: true } : { action: 'finalize', uploadId });
      if (!fin.res.ok) {
        if (fin.res.status === 409) {
          say(fill(u.uploadExists ?? 'Edition {slug} already exists.', { slug: editionInput.value }));
          replace.hidden = false;
          return;
        }
        const listed = Array.isArray((fin.data as Record<string, unknown> | null)?.['issues'])
          ? ((fin.data as Record<string, unknown>)['issues'] as { path: string; message: string }[]).map((i) => `${i.path}: ${i.message}`).join('; ')
          : fill(u.actionFailed ?? 'Action failed ({status}).', { status: String(fin.res.status) });
        say(listed);
        return;
      }
      say(fill(u.uploadStored ?? 'Stored: {slug}', { slug: String((fin.data as Record<string, unknown>)?.['slug'] ?? editionInput.value) }));
      files = [];
      issues = [];
      lastProposed = null;
      folder.value = '';
      zip.value = '';
      systemInput.value = '';
      editionInput.value = '';
      renderPreview();
      reload();
    } catch {
      say(u.actionNetwork ?? 'Network error. Try again.');
    } finally {
      busy = false;
      renderPreview();
    }
  };

  send.addEventListener('click', () => void sendAll(false));
  replace.addEventListener('click', () => void sendAll(true));
}
