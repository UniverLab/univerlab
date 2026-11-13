// The owner's console for signing requests: upload the PDF, name the
// signer, send the link by hand. Static shell; every row and upload goes
// through /api/sign-request with the owner's Access JWT (cookies ride along).

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
}

interface OwnerRequest {
  id: string;
  title: string;
  signerName: string;
  signerEmail: string;
  origHash: string;
  createdAt: string;
  state: 'ready' | 'signed' | 'expired';
  signedHash: string | null;
}

export function initOwnerPage(s: OwnerStrings): void {
  const list = document.getElementById('sign-requests');
  const empty = document.getElementById('sign-empty');
  const form = document.getElementById('sign-create') as HTMLFormElement | null;
  const error = document.getElementById('sign-create-error');
  const linkBox = document.getElementById('sign-created-link') as HTMLAnchorElement | null;
  const linkWrap = document.getElementById('sign-created');
  if (!list || !form) return;

  const stateLabel = (state: OwnerRequest['state']): string =>
    state === 'signed' ? s.stateSigned : state === 'expired' ? s.stateExpired : s.statePending;

  const render = (reqs: OwnerRequest[]): void => {
    list.textContent = '';
    if (empty) empty.hidden = reqs.length > 0;
    for (const r of reqs) {
      const tr = document.createElement('tr');
      const tdTitle = document.createElement('td');
      tdTitle.textContent = r.title;
      const tdSigner = document.createElement('td');
      tdSigner.textContent = `${r.signerName} · ${r.signerEmail}`;
      const tdState = document.createElement('td');
      tdState.textContent = stateLabel(r.state);
      const tdActions = document.createElement('td');
      if (r.state === 'signed') {
        const a = document.createElement('a');
        a.href = `/api/sign-file?id=${encodeURIComponent(r.id)}&signed=1`;
        a.textContent = s.download;
        tdActions.append(a);
      } else {
        const a = document.createElement('a');
        const base = document.documentElement.lang === 'es' ? '/es' : '';
        a.href = `${base}/sign/${encodeURIComponent(r.id)}`;
        a.textContent = r.id.slice(0, 8);
        tdActions.append(a);
      }
      tr.append(tdTitle, tdSigner, tdState, tdActions);
      list.append(tr);
    }
  };

  fetch('/api/sign-request')
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { ok?: boolean; requests?: OwnerRequest[] };
      if (!body.ok || !Array.isArray(body.requests)) throw new Error('bad response');
      render(body.requests);
    })
    .catch(() => {
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
        const again = await fetch('/api/sign-request');
        const relist = (await again.json()) as { ok?: boolean; requests?: OwnerRequest[] };
        if (relist.ok && Array.isArray(relist.requests)) render(relist.requests);
      })
      .catch((e: unknown) => {
        if (error) {
          error.textContent = e instanceof Error ? `${s.upError} (${e.message})` : s.upError;
          error.hidden = false;
        }
      });
  });
}
