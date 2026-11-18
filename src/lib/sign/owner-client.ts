// The owner's console for signing requests: a small control room. The
// summary chips count requests by state and filter the list, the search
// box narrows by title or signer, and every row carries its dates plus
// the actions: copy the signing link, resend the invitation, revoke a
// pending request, download the original or the signed PDF, and open the
// public verification page. Everything goes through the owner API with
// the owner's Access JWT (cookies ride along).

type DisplayState = 'pending' | 'signed' | 'expired' | 'revoked';

interface OwnerStrings {
  listEmpty: string;
  thTitle: string;
  thSigner: string;
  thState: string;
  thActions: string;
  download: string;
  upError: string;
  upLink: string;
  statePending: string;
  stateSigned: string;
  stateExpired: string;
  stateRevoked: string;
  filterAll: string;
  searchPh: string;
  copyLink: string;
  copied: string;
  resend: string;
  revoke: string;
  confirmRevoke: string;
  daysLeft: string;
  openVerify: string;
  downloadOriginal: string;
}

interface OwnerRequest {
  id: string;
  title: string;
  signerName: string;
  signerEmail: string;
  origHash: string;
  createdAt: string;
  state: 'ready' | 'signed' | 'expired' | 'revoked';
  status?: 'pending' | 'signed' | 'expired' | 'revoked';
  signedAt?: string | null;
  signedHash: string | null;
}

/** Milliseconds of signing time in the 30-day window. */
const SIGN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The control-room state. The stored `status` wins, except a request the
 *  lab never marked still ages out: `state` says expired while `status`
 *  reads pending, and the room shows it as expired. Older list payloads
 *  predate `status` and fall back to `state` alone. */
function displayOf(r: OwnerRequest): DisplayState {
  if (r.status === 'pending') return r.state === 'expired' ? 'expired' : 'pending';
  if (r.status === 'signed' || r.status === 'expired' || r.status === 'revoked') {
    return r.status;
  }
  return r.state === 'ready' ? 'pending' : r.state;
}

function langPrefix(): string {
  return document.documentElement.lang === 'es' ? '/es' : '';
}

export function initOwnerPage(s: OwnerStrings): void {
  const list = document.getElementById('sign-requests');
  const empty = document.getElementById('sign-empty');
  const form = document.getElementById('sign-create') as HTMLFormElement | null;
  const error = document.getElementById('sign-create-error');
  const linkBox = document.getElementById('sign-created-link') as HTMLAnchorElement | null;
  const linkWrap = document.getElementById('sign-created');
  const counts = document.getElementById('sign-counts');
  const search = document.getElementById('sign-search') as HTMLInputElement | null;
  if (!list || !form) return;
  if (search && s.searchPh) search.placeholder = s.searchPh;

  let all: OwnerRequest[] = [];
  let filter: DisplayState | 'all' = 'all';
  let query = '';

  const stateLabel = (state: DisplayState): string =>
    state === 'signed'
      ? s.stateSigned
      : state === 'expired'
        ? s.stateExpired
        : state === 'revoked'
          ? s.stateRevoked
          : s.statePending;

  /** Whole days of the 30-day window left for a pending request. */
  const daysLeft = (r: OwnerRequest): number => {
    const created = Date.parse(r.createdAt);
    if (!Number.isFinite(created)) return 0;
    return Math.max(0, Math.ceil((created + SIGN_TTL_MS - Date.now()) / DAY_MS));
  };

  const isoDay = (iso: string | null | undefined): string =>
    typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : '';

  const fail = (e: unknown): void => {
    if (error) {
      error.textContent = e instanceof Error ? `${s.upError} (${e.message})` : s.upError;
      error.hidden = false;
    }
  };

  const reload = async (): Promise<void> => {
    const res = await fetch('/api/sign-request');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { ok?: boolean; requests?: OwnerRequest[] };
    if (!body.ok || !Array.isArray(body.requests)) throw new Error('bad response');
    all = body.requests;
    render();
  };

  const flash = (btn: HTMLButtonElement, text: string): void => {
    const prev = btn.textContent;
    btn.textContent = text;
    window.setTimeout(() => {
      btn.textContent = prev;
    }, 2000);
  };

  const postAction = async (path: '/api/sign-resend' | '/api/sign-revoke', id: string, btn: HTMLButtonElement): Promise<void> => {
    btn.disabled = true;
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      await reload();
    } catch (e: unknown) {
      btn.disabled = false;
      fail(e);
    }
  };

  const actionButton = (label: string, onClick: (btn: HTMLButtonElement) => void): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sign-row-action';
    btn.textContent = label;
    btn.addEventListener('click', () => onClick(btn));
    return btn;
  };

  const actionLink = (label: string, href: string): HTMLAnchorElement => {
    const a = document.createElement('a');
    a.className = 'sign-row-action';
    a.href = href;
    a.textContent = label;
    return a;
  };

  const renderRow = (r: OwnerRequest): HTMLTableRowElement => {
    const tr = document.createElement('tr');
    const display = displayOf(r);
    const base = langPrefix();
    const signUrl = `${base}/sign/${encodeURIComponent(r.id)}`;

    const tdTitle = document.createElement('td');
    const title = document.createElement('div');
    title.textContent = r.title;
    tdTitle.append(title);
    const created = document.createElement('small');
    created.textContent = isoDay(r.createdAt);
    tdTitle.append(created);

    const tdSigner = document.createElement('td');
    tdSigner.textContent = `${r.signerName} · ${r.signerEmail}`;

    const tdState = document.createElement('td');
    const state = document.createElement('div');
    state.textContent = stateLabel(display);
    tdState.append(state);
    const sub = document.createElement('small');
    if (display === 'signed' && r.signedAt) {
      sub.textContent = isoDay(r.signedAt);
      tdState.append(sub);
    } else if (display === 'pending') {
      sub.textContent = s.daysLeft.replace('{n}', String(daysLeft(r)));
      tdState.append(sub);
    }

    const tdActions = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'sign-row-actions';
    wrap.append(
      actionButton(s.copyLink, (btn) => {
        const url = new URL(signUrl, window.location.origin).href;
        const done = (): void => flash(btn, s.copied);
        // No clipboard in this browser: open the link instead of a dead click.
        const openInstead = (): void => {
          window.open(url, '_blank', 'noopener');
        };
        try {
          const clip = navigator.clipboard;
          if (!clip) {
            openInstead();
            return;
          }
          clip.writeText(url).then(done, openInstead);
        } catch {
          openInstead();
        }
      }),
    );
    if (display === 'pending') {
      wrap.append(
        actionButton(s.resend, (btn) => {
          void postAction('/api/sign-resend', r.id, btn);
        }),
      );
      wrap.append(
        actionButton(s.revoke, (btn) => {
          if (!window.confirm(s.confirmRevoke)) return;
          void postAction('/api/sign-revoke', r.id, btn);
        }),
      );
    }
    wrap.append(actionLink(s.downloadOriginal, `/api/sign-file?id=${encodeURIComponent(r.id)}`));
    if (display === 'signed') {
      wrap.append(actionLink(s.download, `/api/sign-file?id=${encodeURIComponent(r.id)}&signed=1`));
    }
    wrap.append(actionLink(s.openVerify, `${base}/sign/verify/${encodeURIComponent(r.id)}`));
    tdActions.append(wrap);

    tr.append(tdTitle, tdSigner, tdState, tdActions);
    return tr;
  };

  const renderCounts = (): void => {
    if (!counts) return;
    const n: Record<DisplayState | 'all', number> = { all: all.length, pending: 0, signed: 0, expired: 0, revoked: 0 };
    for (const r of all) n[displayOf(r)] += 1;
    counts.textContent = '';
    const order: Array<DisplayState | 'all'> = ['all', 'pending', 'signed', 'expired', 'revoked'];
    for (const key of order) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sign-count';
      btn.setAttribute('aria-pressed', String(filter === key));
      btn.textContent = `${key === 'all' ? s.filterAll : stateLabel(key)} (${n[key]})`;
      btn.addEventListener('click', () => {
        filter = filter === key ? 'all' : key;
        render();
      });
      counts.append(btn);
    }
  };

  const render = (): void => {
    renderCounts();
    list.textContent = '';
    const q = query.trim().toLowerCase();
    const rows = all.filter((r) => {
      if (filter !== 'all' && displayOf(r) !== filter) return false;
      if (q === '') return true;
      return `${r.title} ${r.signerName} ${r.signerEmail}`.toLowerCase().includes(q);
    });
    if (empty) empty.hidden = rows.length > 0;
    for (const r of rows) list.append(renderRow(r));
  };

  if (search) {
    search.addEventListener('input', () => {
      query = search.value;
      render();
    });
  }

  reload().catch(() => {
    if (empty) {
      empty.textContent = s.upError;
      empty.hidden = false;
    }
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (error) error.hidden = true;
    if (linkWrap) linkWrap.hidden = true;
    fetch('/api/sign-request', { method: 'POST', body: new FormData(form) })
      .then(async (res) => {
        const body = (await res.json()) as { ok?: boolean; id?: string; link?: string; error?: string };
        if (!res.ok || !body.ok || !body.link) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (linkBox && linkWrap) {
          linkBox.href = body.link;
          linkBox.textContent = body.link;
          linkWrap.hidden = false;
        }
        form.reset();
        await reload();
      })
      .catch((e: unknown) => {
        fail(e);
      });
  });
}
