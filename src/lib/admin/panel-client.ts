// The admin control-room client: the audits table (publish toggle, two-step
// remove), the signing-console counts and the booking /health line. Every
// string comes from the page's dataset so both languages share this module;
// every row is built with textContent, never innerHTML, because titles ride
// in from R2.

export interface AdminClientStrings {
  visibilityPublic: string;
  visibilityPrivate: string;
  findingsLine: string;
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
}

interface AdminRowFindings {
  total: number;
  open: number;
}

interface AdminRowJson {
  slug: string;
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

function auditHref(slug: string, visibility: string): string {
  return visibility === 'public' ? `/workbench/audits/${slug}/` : `/audits/${slug}/`;
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
        body: JSON.stringify({ slug: row.slug, visibility: target }),
      });
    } catch {
      showError();
      return;
    }
    if (res.status === 409) {
      const data = await readJson(res);
      const reason = typeof data?.['reason'] === 'string' ? (data['reason'] as string) : '';
      cells.note.textContent = fill(s.refused, { reason });
      return;
    }
    if (!res.ok) {
      showError();
      return;
    }
    row.visibility = target;
    cells.link.href = auditHref(row.slug, row.visibility);
    cells.vis.textContent = row.visibility === 'public' ? s.visibilityPublic : s.visibilityPrivate;
    btn.textContent = row.visibility === 'public' ? s.unpublish : s.publish;
    cells.note.textContent = '';
  };

  const removeRow = async (row: AdminRowJson, tr: HTMLElement, btn: HTMLButtonElement): Promise<void> => {
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
        body: JSON.stringify({ slug: row.slug, confirm: true }),
      });
    } catch {
      showError();
      return;
    }
    if (!res.ok) {
      showError();
      return;
    }
    tr.remove();
    if (list && list.childElementCount === 0 && empty) empty.hidden = false;
  };

  const renderRows = (rows: AdminRowJson[]): void => {
    list.textContent = '';
    if (empty) empty.hidden = rows.length !== 0;
    for (const row of rows) {
      const tr = document.createElement('tr');
      const audit = document.createElement('td');
      const link = document.createElement('a');
      link.href = auditHref(row.slug, row.visibility);
      link.textContent = row.title === '' ? row.slug : `${row.title} — ${row.slug}`;
      audit.appendChild(link);
      const date = document.createElement('td');
      date.textContent = row.date;
      const vis = document.createElement('td');
      vis.textContent = row.visibility === 'public' ? s.visibilityPublic : s.visibilityPrivate;
      const findings = document.createElement('td');
      findings.textContent = fill(s.findingsLine, { open: String(row.findings.open), total: String(row.findings.total) });
      const doi = document.createElement('td');
      if (row.doi) {
        const a = document.createElement('a');
        a.href = `https://doi.org/${row.doi}`;
        a.textContent = row.doi;
        doi.appendChild(a);
      } else {
        doi.textContent = '—';
      }
      const action = document.createElement('td');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = row.visibility === 'public' ? s.unpublish : s.publish;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = s.remove;
      const note = document.createElement('p');
      note.className = 'admin-note';
      toggle.addEventListener('click', () => void toggleRow(row, { link, vis, action, note }, toggle));
      remove.addEventListener('click', () => void removeRow(row, tr, remove));
      action.append(toggle, ' ', remove, note);
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
}
