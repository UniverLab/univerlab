// The signing page: the button stays disabled until name >= 2 chars, an ID
// number and the acceptance tick are all done; a disabled submit never
// fetches; success swaps the form for the hash receipt with the download
// link; name/id/other errors each surface their own message and re-enable.
import { initSignPage } from '../lib/sign/client';

function mount(extra = ''): {
  form: HTMLFormElement;
  name: HTMLInputElement;
  idnum: HTMLInputElement;
  accept: HTMLInputElement;
  submit: HTMLButtonElement;
  error: HTMLElement;
} {
  document.body.innerHTML =
    `<form id="sign-form" data-id="abc123" data-hash="deadbeef" data-err-form="form bad" ` +
    `data-err-name="name bad" data-err-id="id bad" data-done="done!" data-hashlabel="SHA" ` +
    `data-download="Get it" data-submitting="Sending…">${extra}` +
    '<input id="sign-name" type="text">' +
    '<input id="sign-idnum" type="text">' +
    '<input id="sign-accept" type="checkbox">' +
    '<button id="sign-submit" type="submit">Send</button>' +
    '<p data-error hidden></p></form>';
  return {
    form: document.getElementById('sign-form') as HTMLFormElement,
    name: document.getElementById('sign-name') as HTMLInputElement,
    idnum: document.getElementById('sign-idnum') as HTMLInputElement,
    accept: document.getElementById('sign-accept') as HTMLInputElement,
    submit: document.getElementById('sign-submit') as HTMLButtonElement,
    error: document.querySelector('[data-error]') as HTMLElement,
  };
}

function fill(w: ReturnType<typeof mount>, n = 'Ada Lovelace', id = '123', ok = true): void {
  w.name.value = n;
  w.idnum.value = id;
  w.accept.checked = ok;
  for (const el of [w.name, w.idnum, w.accept]) el.dispatchEvent(new Event('input', { bubbles: true }));
  w.accept.dispatchEvent(new Event('change', { bubbles: true }));
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.lang = 'es';
  jest.restoreAllMocks();
});

describe('initSignPage wiring', () => {
  it('bails when the form or the inputs are missing', () => {
    expect(() => initSignPage()).not.toThrow();
    document.body.innerHTML = '<form id="sign-form"></form>';
    expect(() => initSignPage()).not.toThrow();
  });

  it('stays disabled until name >= 2 chars, an id and the tick are all done', () => {
    const w = mount();
    initSignPage();
    expect(w.submit.disabled).toBe(true);
    fill(w, 'A', '123', true);
    expect(w.submit.disabled).toBe(true);
    fill(w, 'Ada', '', true);
    expect(w.submit.disabled).toBe(true);
    fill(w, 'Ada', '123', false);
    expect(w.submit.disabled).toBe(true);
    fill(w, 'Ada', '123', true);
    expect(w.submit.disabled).toBe(false);
  });

  it('a disabled submit never fetches', () => {
    const w = mount();
    initSignPage();
    const spy = jest.fn();
    (globalThis as Record<string, unknown>)['fetch'] = spy;
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('posts id, name, idNumber, accept, hash and lang, then shows the receipt', async () => {
    const w = mount();
    initSignPage();
    fill(w);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, signedHash: 'cafe01' }),
    });
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('/api/sign-complete');
    const body = JSON.parse(opts.body) as Record<string, unknown>;
    expect(body).toMatchObject({ id: 'abc123', name: 'Ada Lovelace', idNumber: '123', accept: true, hash: 'deadbeef', lang: 'es' });
    const done = document.querySelector('.sign-done');
    expect(done?.textContent).toContain('done!');
    expect(done?.textContent).toContain('cafe01');
    const link = document.querySelector('.sign-download') as HTMLAnchorElement;
    expect(link.href).toContain('/api/sign-file?id=abc123&signed=1');
    expect(link.textContent).toBe('Get it');
  });

  it('sends lang en when the document is English', async () => {
    document.documentElement.lang = 'en';
    const w = mount();
    initSignPage();
    fill(w);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, signedHash: 'h' }),
    });
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    const [, opts] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect((JSON.parse(opts.body) as Record<string, unknown>)['lang']).toBe('en');
  });

  it.each([
    ['name', 'name bad'],
    ['id', 'id bad'],
    ['other', 'form bad'],
  ])('maps error code %s to its own message and re-enables', async (code, message) => {
    const w = mount();
    initSignPage();
    fill(w);
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: code }),
    });
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(w.error.textContent).toBe(message);
    expect(w.error.hidden).toBe(false);
    expect(w.submit.disabled).toBe(false);
    expect(w.submit.textContent).toBe('Send');
  });

  it('treats a non-JSON error body as HTTP 500 and restores the button', async () => {
    const w = mount();
    initSignPage();
    fill(w);
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('no json'); },
    });
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(w.error.textContent).toBe('form bad');
    expect(w.submit.disabled).toBe(false);
    expect(w.submit.textContent).toBe('Send');
  });

  it('treats a rejected fetch as a form error and re-enables', async () => {
    const w = mount();
    initSignPage();
    fill(w);
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockRejectedValue(new Error('down'));
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(w.error.textContent).toBe('form bad');
    expect(w.submit.disabled).toBe(false);
  });

  it('falls back to default messages when dataset attributes are absent', async () => {
    document.body.innerHTML =
      '<form id="sign-form">' +
      '<input id="sign-name" type="text">' +
      '<input id="sign-idnum" type="text">' +
      '<input id="sign-accept" type="checkbox">' +
      '<button id="sign-submit" type="submit">Send</button></form>';
    initSignPage();
    const form = document.getElementById('sign-form') as HTMLFormElement;
    const name = document.getElementById('sign-name') as HTMLInputElement;
    const idnum = document.getElementById('sign-idnum') as HTMLInputElement;
    const accept = document.getElementById('sign-accept') as HTMLInputElement;
    name.value = 'Ada';
    idnum.value = '1';
    accept.checked = true;
    for (const el of [name, idnum, accept]) el.dispatchEvent(new Event('input', { bubbles: true }));
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, signedHash: 'h1' }),
    });
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    const done = document.querySelector('.sign-done');
    expect(done?.textContent).toContain('signed');
    expect(done?.textContent).toContain('SHA-256');
    const link = document.querySelector('.sign-download') as HTMLAnchorElement;
    expect(link.textContent).toBe(link.href);
    expect(link.href).toContain('id=&signed=1');
  });

  it('survives a non-Error rejection with no error element present', async () => {
    document.body.innerHTML =
      '<form id="sign-form">' +
      '<input id="sign-name" type="text">' +
      '<input id="sign-idnum" type="text">' +
      '<input id="sign-accept" type="checkbox">' +
      '<button id="sign-submit" type="submit">Send</button></form>';
    initSignPage();
    (document.getElementById('sign-name') as HTMLInputElement).value = 'Ada';
    (document.getElementById('sign-idnum') as HTMLInputElement).value = '1';
    (document.getElementById('sign-accept') as HTMLInputElement).checked = true;
    for (const id of ['sign-name', 'sign-idnum', 'sign-accept']) {
      document.getElementById(id)?.dispatchEvent(new Event('input', { bubbles: true }));
    }
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockRejectedValue('gone');
    (document.getElementById('sign-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect((document.getElementById('sign-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports the HTTP status when the body carries no error', async () => {
    const w = mount();
    initSignPage();
    fill(w);
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ ok: false }),
    });
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(w.error.textContent).toBe('form bad');
  });
});
