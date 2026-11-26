// The admin control-room client: the audits table (publish toggle, two-step
// remove), the signing-console counts and the booking /health line. Every
// string comes from the page's dataset so both languages share this module;
// every row is built with textContent, never innerHTML, because titles ride
// in from R2.
import { validateAuditDocument } from '../audit/validate-document';
import { formatBytes } from '../audit/util';
import { coarseClientClass } from './analytics';
import {
  forcePrivate,
  formatEdition,
  parseZipCentralDirectory,
  proposeAuditTarget,
  summarizeUpload,
  unwrapZipRoot,
  validateUploadEntries,
  type UploadFile,
} from './upload';

export interface AdminClientStrings {
  visibilityPublic: string;
  visibilityPrivate: string;
  findingsLine: string;
  auditCountsPubOne?: string;
  auditCountsPubOther?: string;
  auditCountsPrivOne?: string;
  auditCountsPrivOther?: string;
  auditCountsHighOne?: string;
  auditCountsHighOther?: string;
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

/** The analytics section strings: every user-visible word of the
 *  funnel/installs tables rides in the page dataset so both languages
 *  share this module. */
export interface AdminAnalyticsStrings {
  analyticsUnconfigured: string;
  analyticsEmpty: string;
  analyticsSummary: string;
  analyticsFunnelTitle: string;
  analyticsInstallsTitle: string;
  thEvent: string;
  thSource: string;
  thMedium: string;
  thCampaign: string;
  thTool: string;
  thClient: string;
  thCount: string;
  thPage: string;
  thStatus: string;
  analyticsFilterReal: string;
  analyticsFilterProbes: string;
  analyticsFilterAll: string;
  analyticsClientInstaller: string;
  analyticsClientBrowser: string;
  analyticsClientOther: string;
}

/** The "New audit" intake strings: a partial because older pages only
 *  carry the table strings. Missing keys fall back to plain words. */
export interface AdminUploadStrings {
  uploadSystem: string;
  uploadEdition: string;
  uploadSend: string;
  uploadReplace: string;
  uploadCancel: string;
  uploadCancelled?: string;
  uploadStored: string;
  uploadExists: string;
  uploadInvalidOne?: string;
  uploadInvalidOther?: string;
  uploadIssuesOne?: string;
  uploadIssuesOther?: string;
  uploadFilesOne?: string;
  uploadFilesOther?: string;
  uploadPreviewTitle?: string;
  uploadPreviewClient?: string;
  uploadPreviewLanguage?: string;
  uploadPreviewVersion?: string;
  uploadPreviewFindings?: string;
  uploadPreviewFiles?: string;
  uploadEmpty: string;
  uploadReading: string;
  uploadSending: string;
  severityCritical?: string;
  severityHigh?: string;
  severityMedium?: string;
  severityLow?: string;
  severityInfo?: string;
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

/** One count in singular or plural: the page's language decides, with a
 *  plain-English fallback for older pages that only carry the table
 *  strings. */
function pluralCount(one: string | undefined, other: string | undefined, n: number, fallback: string): string {
  return fill(n === 1 ? (one ?? fallback) : (other ?? fallback), { n: String(n) });
}

/** Wire the control room. Bails without throwing when the table is absent. */
export function initAdminPage(
  s: AdminClientStrings & Partial<AdminUploadStrings> & Partial<AdminAnalyticsStrings>,
  opts: { bookingApi: string },
): void {
  const list = document.getElementById('admin-audits');
  if (!list) return;
  const error = document.getElementById('admin-error');
  const empty = document.getElementById('admin-empty');
  const counts = document.getElementById('admin-sign-counts');
  const booking = document.getElementById('admin-booking-status');
  let knownSystems: string[] = [];

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
      const sevNames: Record<string, string> = {
        critical: s.severityCritical || 'critical',
        high: s.severityHigh || 'high',
        medium: s.severityMedium || 'medium',
        low: s.severityLow || 'low',
        info: s.severityInfo || 'info',
      };
      const sevs = document.createElement('span');
      sevs.className = 'admin-sevs';
      for (const sev of ['critical', 'high', 'medium', 'low', 'info'] as const) {
        const n = row.findings.openBySeverity?.[sev] ?? 0;
        if (n > 0) {
          const chip = document.createElement('span');
          chip.className = `admin-sev admin-sev-${sev}`;
          chip.textContent = `${sevNames[sev]} ${n}`;
          sevs.appendChild(chip);
        }
      }
      if (sevs.childNodes.length > 0) findings.appendChild(sevs);
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
    // The systems the table already holds: the upload form suggests them
    // while typing, so an existing audit keeps its system name.
    knownSystems = [...new Set(rows.map((row) => row.system).filter((sys) => sys !== ''))].sort();
    const datalist = document.getElementById('admin-upload-systems');
    if (datalist) {
      datalist.textContent = '';
      for (const sys of knownSystems) {
        const option = document.createElement('option');
        option.value = sys;
        datalist.appendChild(option);
      }
    }
    const glance = document.getElementById('admin-audits-counts');
    if (glance) {
      let pub = 0;
      let priv = 0;
      let high = 0;
      for (const row of rows) {
        if (row.visibility === 'public') pub += 1;
        else priv += 1;
        high += (row.findings.openBySeverity?.['critical'] ?? 0) + (row.findings.openBySeverity?.['high'] ?? 0);
      }
      glance.textContent = [
        pluralCount(s.auditCountsPubOne, s.auditCountsPubOther, pub, '{n} public'),
        pluralCount(s.auditCountsPrivOne, s.auditCountsPrivOther, priv, '{n} private'),
        pluralCount(s.auditCountsHighOne, s.auditCountsHighOther, high, '{n} open high or critical'),
      ].join(' · ');
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
  initAnalytics(s);
  void initUpload(
    s,
    () => {
      void loadAudits();
    },
    () => knownSystems,
  );
}

interface FunnelPayloadRow {
  event?: unknown;
  tool?: unknown;
  path?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  count?: unknown;
}

interface InstallPayloadRow {
  tool?: unknown;
  clientClass?: unknown;
  outcome?: unknown;
  count?: unknown;
}

/** The installer downloads filter: real tool redirects by default so bot
 *  404 probes never inflate the table; `probes` audits the 404s, `all`
 *  shows every recorded outcome. */
export type InstallsFilter = 'real' | 'probes' | 'all';

let installsFilter: InstallsFilter = 'real';

/** The recorded `blob6` outcome as a clear HTTP status: real tool
 *  redirects and root hits are 302s, unknown tools and missing Windows
 *  installers are 404s; any other non-empty outcome shows verbatim so
 *  unexpected responses are never hidden. */
export function statusFor(outcome: string): string {
  if (outcome === 'redirect' || outcome === 'root') return '302';
  if (outcome === 'unknown-tool' || outcome === 'no-windows') return '404';
  return outcome;
}

export function getInstallsFilter(): InstallsFilter {
  return installsFilter;
}

export function setInstallsFilter(next: InstallsFilter): void {
  installsFilter = next;
}

/** One analytics window: fetch the aggregates and render both tables with
 *  textContent only (UTM values ride in from visitors). Unconfigured or
 *  empty answers show the notice string — never zero-filled rows. */
export async function renderAnalytics(s: Pick<AdminClientStrings, 'loadError'> & Partial<AdminAnalyticsStrings>, win: number): Promise<void> {
  const section = document.getElementById('admin-analytics');
  if (!section) return;
  const notice = document.getElementById('admin-analytics-notice');
  const funnelTable = document.getElementById('admin-analytics-funnel-table');
  const installsTable = document.getElementById('admin-analytics-installs-table');
  const funnelBody = document.getElementById('admin-analytics-funnel');
  const installsBody = document.getElementById('admin-analytics-installs');
  const glance = document.getElementById('admin-analytics-counts');
  if (!notice || !funnelBody || !installsBody) return;
  const say = (text: string): void => {
    notice.textContent = text;
    notice.hidden = text === '';
  };
  const showTables = (show: boolean): void => {
    if (funnelTable) funnelTable.hidden = !show;
    if (installsTable) installsTable.hidden = !show;
    if (!show && glance) glance.textContent = '';
  };
  let res: Response;
  try {
    res = await fetch(`/api/admin-analytics?window=${win}`);
  } catch {
    say(s.loadError);
    showTables(false);
    return;
  }
  if (!res.ok) {
    say(s.loadError);
    showTables(false);
    return;
  }
  const data = await readJson(res);
  if (!data || typeof data !== 'object') {
    say(s.loadError);
    showTables(false);
    return;
  }
  if ((data as Record<string, unknown>)['state'] === 'unconfigured' || (data as Record<string, unknown>)['ok'] === false) {
    say(s.analyticsUnconfigured ?? 'Analytics is not configured.');
    showTables(false);
    return;
  }
  const funnel = Array.isArray((data as Record<string, unknown>)['funnel'])
    ? ((data as Record<string, unknown>)['funnel'] as FunnelPayloadRow[])
    : [];
  const installs = Array.isArray((data as Record<string, unknown>)['installs'])
    ? ((data as Record<string, unknown>)['installs'] as InstallPayloadRow[])
    : [];
  if (funnel.length === 0 && installs.length === 0) {
    say(s.analyticsEmpty ?? 'No analytics yet.');
    showTables(false);
    return;
  }
  say('');
  const headers = {
    event: s.thEvent ?? 'Event',
    page: s.thPage ?? 'Page',
    source: s.thSource ?? 'Source',
    medium: s.thMedium ?? 'Medium',
    campaign: s.thCampaign ?? 'Campaign',
    tool: s.thTool ?? 'Tool',
    client: s.thClient ?? 'Client',
    status: s.thStatus ?? 'Status',
    count: s.thCount ?? 'Count',
  };
  const cell = (text: string, label?: string): HTMLTableCellElement => {
    const td = document.createElement('td');
    td.textContent = text;
    if (label) td.dataset['label'] = label;
    return td;
  };
  funnelBody.textContent = '';
  let funnelTotal = 0;
  for (const row of funnel) {
    const count = typeof row.count === 'number' && Number.isFinite(row.count) ? row.count : 0;
    funnelTotal += count;
    const path = typeof row.path === 'string' ? row.path : '';
    const tool = typeof row.tool === 'string' ? row.tool : '';
    const page = path !== '' && tool !== '' ? `${path} (${tool})` : path !== '' || tool !== '' ? path + tool : '—';
    const tr = document.createElement('tr');
    tr.append(
      cell(typeof row.event === 'string' ? row.event : '', headers.event),
      cell(page, headers.page),
      cell(typeof row.utm_source === 'string' && row.utm_source !== '' ? row.utm_source : '—', headers.source),
      cell(typeof row.utm_medium === 'string' && row.utm_medium !== '' ? row.utm_medium : '—', headers.medium),
      cell(typeof row.utm_campaign === 'string' && row.utm_campaign !== '' ? row.utm_campaign : '—', headers.campaign),
      cell(String(count), headers.count),
    );
    funnelBody.appendChild(tr);
  }
  // Installs group by tool, coarse client class and outcome: installer
  // CLIs together, browsers together, everything else together — the
  // outcome stays on the group so 404 probes never merge into real rows.
  const coarseName = (c: string): string => {
    if (c === 'installer') return s.analyticsClientInstaller ?? 'installer';
    if (c === 'browser') return s.analyticsClientBrowser ?? 'browser';
    return s.analyticsClientOther ?? 'other';
  };
  const grouped = new Map<
    string,
    { tool: string; coarse: 'installer' | 'browser' | 'other'; outcome: string; count: number }
  >();
  for (const row of installs) {
    const count = typeof row.count === 'number' && Number.isFinite(row.count) ? row.count : 0;
    const tool = typeof row.tool === 'string' ? row.tool : '';
    const outcome = typeof row.outcome === 'string' ? row.outcome : '';
    const coarse = coarseClientClass(typeof row.clientClass === 'string' ? row.clientClass : '');
    const key = JSON.stringify([tool, coarse, outcome]);
    const prev = grouped.get(key);
    grouped.set(key, { tool, coarse, outcome, count: (prev?.count ?? 0) + count });
  }
  const entries = [...grouped.values()].sort((a, b) => b.count - a.count);
  const redirectTotal = entries.filter((e) => e.outcome === 'redirect').reduce((sum, e) => sum + e.count, 0);
  const renderInstalls = (): void => {
    installsBody.textContent = '';
    for (const entry of entries) {
      if (installsFilter === 'real' && entry.outcome !== 'redirect') continue;
      if (installsFilter === 'probes' && entry.outcome !== 'unknown-tool' && entry.outcome !== 'no-windows') continue;
      const status = entry.outcome === '' ? '—' : `${statusFor(entry.outcome)} · ${entry.outcome}`;
      const tr = document.createElement('tr');
      tr.append(
        cell(entry.tool, headers.tool),
        cell(coarseName(entry.coarse), headers.client),
        cell(status, headers.status),
        cell(String(entry.count), headers.count),
      );
      installsBody.appendChild(tr);
    }
  };
  renderInstalls();
  for (const btn of section.querySelectorAll<HTMLButtonElement>('[data-installs-filter]')) {
    const mode = btn.dataset['installsFilter'];
    btn.onclick = (): void => {
      installsFilter = mode === 'probes' || mode === 'all' ? mode : 'real';
      for (const peer of section.querySelectorAll<HTMLButtonElement>('[data-installs-filter]')) {
        if (peer === btn) peer.setAttribute('aria-current', 'true');
        else peer.removeAttribute('aria-current');
      }
      renderInstalls();
    };
  }
  showTables(true);
  if (glance) {
    glance.textContent = fill(s.analyticsSummary ?? '{funnel} funnel · {installs} installs', {
      funnel: String(funnelTotal),
      installs: String(redirectTotal),
    });
  }
  for (const btn of section.querySelectorAll<HTMLButtonElement>('[data-analytics-window]')) {
    if (btn.dataset['analyticsWindow'] === String(win)) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  }
}

/** The analytics section: window buttons re-render the tables. Absent
 *  without throwing when the page carries no analytics section. */
function initAnalytics(s: Pick<AdminClientStrings, 'loadError'> & Partial<AdminAnalyticsStrings>): void {
  const section = document.getElementById('admin-analytics');
  if (!section) return;
  let current = 30;
  for (const btn of section.querySelectorAll<HTMLButtonElement>('[data-analytics-window]')) {
    btn.addEventListener('click', () => {
      const next = Number.parseInt(btn.dataset['analyticsWindow'] ?? '', 10);
      current = next === 7 || next === 30 || next === 90 ? next : 30;
      void renderAnalytics(s, current);
    });
  }
  void renderAnalytics(s, current);
}

async function postUploadJson(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ res: Response; data: Record<string, unknown> | null }> {
  const res = await fetch('/api/admin-audits/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  return { res, data: await readJson(res) };
}

/** One file travels as the raw request body, never base64 inside JSON. */
async function postUploadFile(
  uploadId: string,
  name: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<{ res: Response; data: Record<string, unknown> | null }> {
  const res = await fetch(
    `/api/admin-audits/upload?action=file&uploadId=${encodeURIComponent(uploadId)}&name=${encodeURIComponent(name)}`,
    { method: 'POST', body: bytes as unknown as BodyInit, ...(signal ? { signal } : {}) },
  );
  return { res, data: await readJson(res) };
}

/** The "New audit" intake: a folder (webkitdirectory) or a .zip is read
 *  locally, previewed as a compact summary (title, client, language,
 *  version, findings by severity, files, total size) with the
 *  system/edition the title and the known systems propose, then sent one
 *  file per request and confirmed. The new edition joins the list through
 *  loadAudits. Absent when the page carries no upload section. */
function initUpload(
  u: AdminClientStrings & Partial<AdminUploadStrings>,
  reload: () => void,
  getSystems: () => string[],
): void {
  const section = document.getElementById('admin-upload');
  if (!section) return;
  const folder = document.getElementById('admin-upload-folder') as HTMLInputElement | null;
  const zip = document.getElementById('admin-upload-zip') as HTMLInputElement | null;
  const pickFolder = document.getElementById('admin-upload-pick-folder') as HTMLButtonElement | null;
  const pickZip = document.getElementById('admin-upload-pick-zip') as HTMLButtonElement | null;
  const preview = document.getElementById('admin-upload-preview');
  const target = document.getElementById('admin-upload-target');
  const systemInput = document.getElementById('admin-upload-system') as HTMLInputElement | null;
  const editionInput = document.getElementById('admin-upload-edition') as HTMLInputElement | null;
  const send = document.getElementById('admin-upload-send') as HTMLButtonElement | null;
  const replace = document.getElementById('admin-upload-replace') as HTMLButtonElement | null;
  const cancel = document.getElementById('admin-upload-cancel') as HTMLButtonElement | null;
  const progress = document.getElementById('admin-upload-progress') as HTMLProgressElement | null;
  const errorsEl = document.getElementById('admin-upload-errors');
  const note = document.getElementById('admin-upload-note');
  if (
    !folder || !zip || !pickFolder || !pickZip || !preview || !target ||
    !systemInput || !editionInput || !send || !replace || !cancel || !progress || !errorsEl || !note
  ) {
    return;
  }

  let files: UploadFile[] = [];
  let issues: { path: string; message: string }[] = [];
  let parsedDoc: unknown = null;
  let lastProposed: { system: string; edition: string } | null = null;
  let lastIssued: string | undefined;
  let editionEdited = false;
  let aborter: AbortController | null = null;
  let activeUploadId: string | null = null;
  let busy = false;

  const say = (text: string): void => {
    note.textContent = text;
  };

  const clearErrors = (): void => {
    errorsEl.textContent = '';
    errorsEl.hidden = true;
  };

  /** After a refusal the problems read as a list, one item per path. */
  const showErrorList = (items: { path: string; message: string }[]): void => {
    errorsEl.textContent = '';
    for (const item of items) {
      const li = document.createElement('li');
      li.textContent = `${item.path}: ${item.message}`;
      errorsEl.appendChild(li);
    }
    errorsEl.hidden = items.length === 0;
    if (items.length > 0) {
      say(
        pluralCount(
          u.uploadIssuesOne,
          u.uploadIssuesOther,
          items.length,
          '{n} problems keep this upload from being stored:',
        ),
      );
    }
  };

  const sevName = (sev: string): string => {
    switch (sev) {
      case 'critical':
        return u.severityCritical || 'critical';
      case 'high':
        return u.severityHigh || 'high';
      case 'medium':
        return u.severityMedium || 'medium';
      case 'low':
        return u.severityLow || 'low';
      default:
        return u.severityInfo || 'info';
    }
  };

  const chipFor = (sev: string, n: number): HTMLSpanElement => {
    const chip = document.createElement('span');
    chip.className = `admin-sev admin-sev-${sev}`;
    chip.textContent = `${sevName(sev)} ${n}`;
    return chip;
  };

  const renderPreview = (): void => {
    preview.textContent = '';
    // System and edition stay hidden until a readable selection exists.
    target.hidden = files.length === 0 || parsedDoc === null;
    if (files.length === 0 || parsedDoc === null) {
      preview.hidden = true;
      send.disabled = true;
      return;
    }
    const locale = document.documentElement.lang || undefined;
    const summary = summarizeUpload(parsedDoc, files);
    const dl = document.createElement('dl');
    dl.className = 'admin-preview';
    const addRow = (label: string | undefined, fallback: string, value: string): void => {
      if (value === '') return;
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label || fallback;
      const dd = document.createElement('dd');
      dd.textContent = value;
      wrap.append(dt, dd);
      dl.appendChild(wrap);
    };
    addRow(u.uploadPreviewTitle, 'Title', summary.title);
    addRow(u.uploadPreviewClient, 'Client', summary.client);
    addRow(u.uploadPreviewLanguage, 'Language', summary.language);
    addRow(u.uploadPreviewVersion, 'Version', summary.version);
    const findingsWrap = document.createElement('div');
    const findingsDt = document.createElement('dt');
    findingsDt.textContent = u.uploadPreviewFindings || 'Findings';
    const findingsDd = document.createElement('dd');
    const sevs = document.createElement('span');
    sevs.className = 'admin-sevs';
    for (const sev of ['critical', 'high', 'medium', 'low', 'info'] as const) {
      const n = summary.findings.bySeverity[sev] ?? 0;
      if (n > 0) sevs.appendChild(chipFor(sev, n));
    }
    if (sevs.childNodes.length > 0) findingsDd.appendChild(sevs);
    else findingsDd.textContent = '0';
    findingsWrap.append(findingsDt, findingsDd);
    dl.appendChild(findingsWrap);
    const filesWrap = document.createElement('div');
    const filesDt = document.createElement('dt');
    filesDt.textContent = u.uploadPreviewFiles || 'Files';
    const filesDd = document.createElement('dd');
    filesDd.textContent = `${pluralCount(u.uploadFilesOne, u.uploadFilesOther, summary.files, '{n} files')} · ${formatBytes(summary.totalSize, locale)}`;
    filesWrap.append(filesDt, filesDd);
    dl.appendChild(filesWrap);
    preview.appendChild(dl);
    if (issues.length > 0) {
      const head = document.createElement('p');
      head.textContent = pluralCount(
        u.uploadInvalidOne,
        u.uploadInvalidOther,
        issues.length,
        'The document holds {n} problems:',
      );
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

  /** Title and issue date from a freshly read document, for the proposal. */
  const docTitle = (doc: unknown): string | undefined => {
    if (typeof doc !== 'object' || doc === null) return undefined;
    const meta = (doc as Record<string, unknown>)['meta'];
    if (typeof meta !== 'object' || meta === null) return undefined;
    const title = (meta as Record<string, unknown>)['title'];
    return typeof title === 'string' && title !== '' ? title : undefined;
  };

  /** The issue date, or the end of the audit period while no badge exists. */
  const docIssued = (doc: unknown): string | undefined => {
    const d = doc as { badge?: { issued?: unknown }; meta?: { auditPeriod?: { end?: unknown } } } | null;
    return [d?.badge?.issued, d?.meta?.auditPeriod?.end].find((v): v is string => typeof v === 'string' && v !== '');
  };

  const readSelection = async (picked: File[], baseName: string): Promise<void> => {
    say(u.uploadReading ?? 'Reading…');
    replace.hidden = true;
    clearErrors();
    editionEdited = false;
    parsedDoc = null;
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
      showErrorList(issues);
      renderPreview();
      return;
    }
    const raw = files.find((f) => f.name === 'audit.json');
    if (!raw) {
      issues = [{ path: 'audit.json', message: u.uploadEmpty ?? 'The selection holds no audit.json.' }];
      showErrorList(issues);
      renderPreview();
      return;
    }
    let doc: unknown;
    try {
      doc = JSON.parse(new TextDecoder().decode(raw.bytes)) as unknown;
    } catch {
      issues = [{ path: 'audit.json', message: 'audit.json is not valid JSON' }];
      showErrorList(issues);
      renderPreview();
      return;
    }
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
      issues = [{ path: 'audit.json', message: 'audit.json is not a JSON object' }];
      showErrorList(issues);
      renderPreview();
      return;
    }
    parsedDoc = doc;
    lastIssued = docIssued(doc);
    // The preview checks the stored form: the upload is always private.
    const stored = forcePrivate(doc as Record<string, unknown>, 'owner@univerlab.org');
    issues = [
      ...validateAuditDocument(stored).errors.map((e) => ({ path: e.path, message: e.message })),
      ...(await validateUploadEntries(files, stored)),
    ];
    const proposed = proposeAuditTarget({
      baseName,
      title: docTitle(doc),
      issued: lastIssued,
      existingSystems: getSystems(),
    });
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

  // The two visible choices open the hidden inputs; a folder or a .zip
  // can also be dropped anywhere on the form.
  pickFolder.addEventListener('click', () => folder.click());
  pickZip.addEventListener('click', () => zip.click());
  section.addEventListener('dragover', (event) => {
    event.preventDefault();
    section.classList.add('is-dragover');
  });
  section.addEventListener('dragleave', () => {
    section.classList.remove('is-dragover');
  });
  section.addEventListener('drop', (event) => {
    event.preventDefault();
    section.classList.remove('is-dragover');
    const picked = [...(event.dataTransfer?.files ?? [])] as File[];
    if (picked.length === 0 || busy) return;
    if (picked.length === 1 && picked[0].name.toLowerCase().endsWith('.zip')) {
      const name = picked[0].name;
      void readSelection(picked, name.slice(0, -4));
      return;
    }
    const first = (picked[0] as File & { webkitRelativePath?: string })?.webkitRelativePath ?? '';
    void readSelection(picked, first.includes('/') ? first.slice(0, first.indexOf('/')) : 'audit');
  });

  // The edition follows the system field until it is edited by hand.
  systemInput.addEventListener('input', () => {
    if (!editionEdited) editionInput.value = formatEdition(systemInput.value, lastIssued);
  });
  editionInput.addEventListener('input', () => {
    editionEdited = true;
  });
  cancel.addEventListener('click', () => {
    aborter?.abort();
    // Tell the server to drop the staging area; the in-flight request is
    // already aborted, so this cleanup rides on its own request.
    if (activeUploadId) void postUploadJson({ action: 'cancel', uploadId: activeUploadId }).catch(() => {});
  });

  const listedIssues = (data: Record<string, unknown> | null | undefined): { path: string; message: string }[] | null => {
    const raw = data?.['issues'];
    if (!Array.isArray(raw)) return null;
    return (raw as { path: string; message: string }[]).filter(
      (i) => typeof i?.path === 'string' && typeof i?.message === 'string',
    );
  };

  const sendAll = async (withReplace: boolean): Promise<void> => {
    if (busy || files.length === 0) return;
    busy = true;
    send.disabled = true;
    replace.hidden = true;
    clearErrors();
    const controller = new AbortController();
    aborter = controller;
    cancel.hidden = false;
    progress.hidden = false;
    progress.max = files.length;
    progress.value = 0;
    try {
      const init = await postUploadJson(
        { action: 'init', system: systemInput.value, edition: editionInput.value },
        controller.signal,
      );
      if (!init.res.ok || init.data?.['uploadId'] == null) {
        say(fill(u.actionFailed ?? 'Action failed ({status}).', { status: String(init.res.status) }));
        return;
      }
      const uploadId = String(init.data['uploadId']);
      activeUploadId = uploadId;
      if (init.data['exists'] === true && !withReplace) {
        say(fill(u.uploadExists ?? 'Edition {slug} already exists.', { slug: editionInput.value }));
        replace.hidden = false;
        return;
      }
      let done = 0;
      for (const file of files) {
        say(fill(u.uploadSending ?? 'Sending {done}/{total}…', { done: String(done), total: String(files.length) }));
        progress.value = done;
        const sent = await postUploadFile(uploadId, file.name, file.bytes, controller.signal);
        if (!sent.res.ok) {
          const refused = listedIssues(sent.data);
          if (refused) showErrorList(refused);
          else {
            say(fill(u.actionFailed ?? 'Action failed ({status}).', { status: String(sent.res.status) }));
          }
          return;
        }
        done += 1;
        progress.value = done;
      }
      const fin = await postUploadJson(
        withReplace ? { action: 'finalize', uploadId, replace: true } : { action: 'finalize', uploadId },
        controller.signal,
      );
      if (!fin.res.ok) {
        if (fin.res.status === 409) {
          say(fill(u.uploadExists ?? 'Edition {slug} already exists.', { slug: editionInput.value }));
          replace.hidden = false;
          return;
        }
        const refused = listedIssues(fin.data);
        if (refused) showErrorList(refused);
        else say(fill(u.actionFailed ?? 'Action failed ({status}).', { status: String(fin.res.status) }));
        return;
      }
      say(fill(u.uploadStored ?? 'Stored: {slug}', { slug: String((fin.data as Record<string, unknown>)?.['slug'] ?? editionInput.value) }));
      files = [];
      issues = [];
      parsedDoc = null;
      lastProposed = null;
      lastIssued = undefined;
      editionEdited = false;
      folder.value = '';
      zip.value = '';
      systemInput.value = '';
      editionInput.value = '';
      renderPreview();
      reload();
    } catch (error) {
      if (controller.signal.aborted) say(u.uploadCancelled ?? 'Upload cancelled.');
      else say(u.actionNetwork ?? 'Network error. Try again.');
    } finally {
      busy = false;
      aborter = null;
      activeUploadId = null;
      progress.hidden = true;
      cancel.hidden = true;
      renderPreview();
    }
  };

  send.addEventListener('click', () => void sendAll(false));
  replace.addEventListener('click', () => void sendAll(true));
}
