// Browser behaviour for the signing page: the button stays disabled until
// the full name, the ID number and the acceptance tick are all done (FR5),
// and the submit posts JSON to /api/sign-complete. Server-side checks rule;
// this is progressive enhancement only.

export function initSignPage(): void {
  const form = document.getElementById('sign-form') as HTMLFormElement | null;
  if (!form) return;
  const name = document.getElementById('sign-name') as HTMLInputElement | null;
  const idnum = document.getElementById('sign-idnum') as HTMLInputElement | null;
  const accept = document.getElementById('sign-accept') as HTMLInputElement | null;
  const submit = document.getElementById('sign-submit') as HTMLButtonElement | null;
  const error = form.querySelector('[data-error]') as HTMLElement | null;
  if (!name || !idnum || !accept || !submit) return;

  const sync = (): void => {
    submit.disabled = !(name.value.trim().length >= 2 && idnum.value.trim() !== '' && accept.checked);
  };
  for (const el of [name, idnum, accept]) el.addEventListener('input', sync);
  accept.addEventListener('change', sync);
  sync();

  const errForm = form.dataset['errForm'] ?? 'error';
  const errName = form.dataset['errName'] ?? errForm;
  const errId = form.dataset['errId'] ?? errForm;
  const submitting = form.dataset['submitting'] ?? null;
  const submitLabel = submit.textContent;
  const messageFor = (code: string): string => {
    if (code === 'name') return errName;
    if (code === 'id') return errId;
    return errForm;
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    if (submitting) submit.textContent = submitting;
    if (error) error.hidden = true;
    const id = form.dataset['id'] ?? '';
    const hash = form.dataset['hash'] ?? '';
    fetch('/api/sign-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name: name.value.trim(),
        idNumber: idnum.value.trim(),
        accept: accept.checked,
        hash,
        lang: document.documentElement.lang === 'en' ? 'en' : 'es',
      }),
    })
      .then(async (res) => {
        let body: { ok?: boolean; error?: string; signedHash?: string } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          body = {};
        }
        if (!res.ok || !body.ok || !body.signedHash) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const done = document.createElement('div');
        done.className = 'sign-done';
        const title = document.createElement('p');
        title.className = 'sign-state';
        title.textContent = form.dataset['done'] ?? 'signed';
        const hashLine = document.createElement('p');
        hashLine.className = 'sign-hash';
        const label = document.createElement('span');
        label.textContent = (form.dataset['hashlabel'] ?? 'SHA-256') + ' ';
        const code = document.createElement('code');
        code.textContent = body.signedHash ?? '';
        hashLine.append(label, code);
        const dl = document.createElement('p');
        const link = document.createElement('a');
        link.className = 'sign-download';
        link.href = `/api/sign-file?id=${encodeURIComponent(id)}&signed=1`;
        link.textContent = form.dataset['download'] ?? link.href;
        dl.append(link);
        done.append(title, hashLine, dl);
        form.replaceWith(done);
      })
      .catch((e: unknown) => {
        if (error) {
          error.textContent = messageFor(e instanceof Error ? e.message : '');
          error.hidden = false;
        }
        if (submitLabel !== null) submit.textContent = submitLabel;
        sync();
      });
  });
}
