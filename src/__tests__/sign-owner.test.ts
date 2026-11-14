// The owner's signing console: bails without list/form; lists the GET rows
// with per-state labels (signed rows download, others link); GET failures
// surface upError; POST success links, unhides, resets and refetches; POST
// failure surfaces upError with the message.
import { initOwnerPage } from '../lib/sign/owner-client';

const STRINGS = {
  listEmpty: 'empty',
  thTitle: 'Title',
  thSigner: 'Signer',
  thState: 'State',
  thActions: 'Actions',
  download: 'Download',
  upError: 'Upload failed',
  upLink: 'Link',
  statePending: 'Pending',
  stateSigned: 'Signed',
  stateExpired: 'Expired',
};

const ROWS = [
  { id: 'aaaabbbbccccdddd', title: 'Audit A', signerName: 'Ann', signerEmail: 'a@x.co', origHash: 'h', createdAt: 't', state: 'ready', signedHash: null },
  { id: 'eeeeffff00001111', title: 'Audit B', signerName: 'Bob', signerEmail: 'b@x.co', origHash: 'h', createdAt: 't', state: 'signed', signedHash: 's' },
  { id: '2222333344445555', title: 'Audit C', signerName: 'Cid', signerEmail: 'c@x.co', origHash: 'h', createdAt: 't', state: 'expired', signedHash: null },
];

function mount(): { list: HTMLElement; empty: HTMLElement; form: HTMLFormElement; error: HTMLElement; link: HTMLAnchorElement; wrap: HTMLElement } {
  document.body.innerHTML =
    '<table><tbody id="sign-requests"></tbody></table>' +
    '<p id="sign-empty">empty</p>' +
    '<form id="sign-create"><input name="title" value="T"></form>' +
    '<p id="sign-create-error" hidden></p>' +
    '<p id="sign-created" hidden><a id="sign-created-link"></a></p>';
  return {
    list: document.getElementById('sign-requests') as HTMLElement,
    empty: document.getElementById('sign-empty') as HTMLElement,
    form: document.getElementById('sign-create') as HTMLFormElement,
    error: document.getElementById('sign-create-error') as HTMLElement,
    link: document.getElementById('sign-created-link') as HTMLAnchorElement,
    wrap: document.getElementById('sign-created') as HTMLElement,
  };
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function okJson(body: unknown, ok = true): { ok: boolean; json: () => Promise<unknown> } {
  return { ok, json: async () => body };
}

beforeEach(() => {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

describe('initOwnerPage list', () => {
  it('bails without the list or the form', () => {
    expect(() => initOwnerPage(STRINGS)).not.toThrow();
    document.body.innerHTML = '<tbody id="sign-requests"></tbody>';
    expect(() => initOwnerPage(STRINGS)).not.toThrow();
    document.body.innerHTML = '<form id="sign-create"></form>';
    expect(() => initOwnerPage(STRINGS)).not.toThrow();
  });

  it('prefixes pending links with /es on the Spanish page', async () => {
    document.documentElement.lang = 'es';
    const w = mount();
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue(
      okJson({ ok: true, requests: [ROWS[0]] }),
    );
    initOwnerPage(STRINGS);
    await flush();
    const link = w.list.querySelector('a') as HTMLAnchorElement;
    expect(link.href).toContain('/es/sign/aaaabbbb');
    document.documentElement.lang = '';
  });

  it('renders rows with state labels, downloads for signed and links otherwise', async () => {
    const w = mount();
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue(
      okJson({ ok: true, requests: ROWS }),
    );
    initOwnerPage(STRINGS);
    await flush();
    const trs = w.list.querySelectorAll('tr');
    expect(trs).toHaveLength(3);
    expect(trs[0].textContent).toContain('Pending');
    expect(trs[1].textContent).toContain('Signed');
    expect(trs[2].textContent).toContain('Expired');
    const signedLink = trs[1].querySelector('a') as HTMLAnchorElement;
    expect(signedLink.href).toContain('/api/sign-file?id=eeeeffff00001111&signed=1');
    expect(signedLink.textContent).toBe('Download');
    const pendingLink = trs[0].querySelector('a') as HTMLAnchorElement;
    expect(pendingLink.href).toContain('/sign/aaaabbbb');
    expect(w.empty.hidden).toBe(true);
  });

  it.each([
    ['non-ok GET', okJson({ ok: true }, false)],
    ['ok:false GET', okJson({ ok: false, requests: [] })],
    ['bad-shape GET', okJson({ ok: true, requests: 'nope' })],
    ['rejected GET', null],
  ])('surfaces upError on %s', async (_name, res) => {
    const w = mount();
    (globalThis as Record<string, unknown>)['fetch'] = res === null
      ? jest.fn().mockRejectedValue(new Error('down'))
      : jest.fn().mockResolvedValue(res);
    initOwnerPage(STRINGS);
    await flush();
    expect(w.empty.textContent).toBe('Upload failed');
    expect(w.empty.hidden).toBe(false);
  });
});

describe('initOwnerPage create', () => {
  it('POSTs the form, links the URL, unhides, resets and refetches', async () => {
    const w = mount();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(okJson({ ok: true, requests: [] }))
      .mockResolvedValueOnce(okJson({ ok: true, id: 'new1', link: 'https://x/sign/new1' }))
      .mockResolvedValueOnce(okJson({ ok: true, requests: [ROWS[0]] }));
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    initOwnerPage(STRINGS);
    await flush();
    const reset = jest.spyOn(w.form, 'reset');
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    await flush();
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/sign-request');
    expect((fetchMock.mock.calls[1]?.[1] as { method: string }).method).toBe('POST');
    expect(w.link.href).toBe('https://x/sign/new1');
    expect(w.link.textContent).toBe('https://x/sign/new1');
    expect(w.wrap.hidden).toBe(false);
    expect(reset).toHaveBeenCalled();
    expect(w.list.querySelectorAll('tr')).toHaveLength(1);
  });

  it('surfaces upError with the server message on POST failure', async () => {
    const w = mount();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(okJson({ ok: true, requests: [] }))
      .mockResolvedValueOnce(okJson({ ok: false, error: 'too big' }, false));
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    initOwnerPage(STRINGS);
    await flush();
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(w.error.textContent).toBe('Upload failed (too big)');
    expect(w.error.hidden).toBe(false);
  });

  it('keeps the old rows when the refetch after POST is bad', async () => {
    const w = mount();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(okJson({ ok: true, requests: [ROWS[0]] }))
      .mockResolvedValueOnce(okJson({ ok: true, id: 'new1', link: 'https://x/sign/new1' }))
      .mockResolvedValueOnce(okJson({ ok: false }));
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    initOwnerPage(STRINGS);
    await flush();
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    await flush();
    expect(w.link.href).toBe('https://x/sign/new1');
    expect(w.list.querySelectorAll('tr')).toHaveLength(1);
  });

  it('surfaces plain upError on POST rejection', async () => {
    const w = mount();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(okJson({ ok: true, requests: [] }))
      .mockRejectedValueOnce(new Error('down'));
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    initOwnerPage(STRINGS);
    await flush();
    w.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(w.error.textContent).toBe('Upload failed (down)');
    expect(w.error.hidden).toBe(false);
  });
});
