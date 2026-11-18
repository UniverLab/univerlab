// The owner's signing control room: summary chips count and filter by
// state, the search box narrows by title or signer, every row shows its
// dates (and days left while pending) with copy/resend/revoke/download/
// verify actions; creating a request keeps the POST-link-reset-refetch
// flow with the server message on failure.
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
  stateRevoked: 'Revoked',
  filterAll: 'All',
  searchPh: 'Search…',
  copyLink: 'Copy link',
  copied: 'Copied',
  resend: 'Resend',
  revoke: 'Revoke',
  confirmRevoke: 'Revoke?',
  daysLeft: '{n} days left',
  openVerify: 'Verify',
  downloadOriginal: 'Original',
};

const NOW_ISO = new Date().toISOString();

const ROWS = [
  { id: 'aaaabbbbccccdddd', title: 'Audit A', signerName: 'Ann', signerEmail: 'a@x.co', origHash: 'h', createdAt: NOW_ISO, state: 'ready', status: 'pending', signedAt: null, signedHash: null },
  { id: 'eeeeffff00001111', title: 'Audit B', signerName: 'Bob', signerEmail: 'b@x.co', origHash: 'h', createdAt: '2026-11-01T10:00:00.000Z', state: 'signed', status: 'signed', signedAt: '2026-11-02T10:00:00.000Z', signedHash: 's' },
  { id: '2222333344445555', title: 'Audit C', signerName: 'Cid', signerEmail: 'c@x.co', origHash: 'h', createdAt: '2026-09-01T10:00:00.000Z', state: 'expired', status: 'expired', signedAt: null, signedHash: null },
  { id: '6666777788889999', title: 'Audit D', signerName: 'Dan', signerEmail: 'd@x.co', origHash: 'h', createdAt: '2026-11-10T10:00:00.000Z', state: 'revoked', status: 'revoked', signedAt: null, signedHash: null },
];

function mount(): { list: HTMLElement; empty: HTMLElement; form: HTMLFormElement; error: HTMLElement; link: HTMLAnchorElement; wrap: HTMLElement; counts: HTMLElement; search: HTMLInputElement } {
  document.body.innerHTML =
    '<div id="sign-counts"></div>' +
    '<input id="sign-search" type="search">' +
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
    counts: document.getElementById('sign-counts') as HTMLElement,
    search: document.getElementById('sign-search') as HTMLInputElement,
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
  document.documentElement.lang = '';
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

  it('renders rows with dates, days left and per-state actions', async () => {
    const w = mount();
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue(
      okJson({ ok: true, requests: ROWS }),
    );
    initOwnerPage(STRINGS);
    await flush();
    const trs = w.list.querySelectorAll('tr');
    expect(trs).toHaveLength(4);
    expect(trs[0].textContent).toContain('Pending');
    expect(trs[0].textContent).toContain('30 days left');
    expect(trs[1].textContent).toContain('Signed');
    expect(trs[2].textContent).toContain('Expired');
    expect(trs[3].textContent).toContain('Revoked');
    // Dates travel with the rows: created everywhere, signed once signed.
    expect(trs[0].textContent).toContain(NOW_ISO.slice(0, 10));
    expect(trs[1].textContent).toContain('2026-11-02');
    const pendingActions = [...trs[0].querySelectorAll('button')].map((b) => b.textContent);
    expect(pendingActions).toEqual(['Copy link', 'Resend', 'Revoke']);
    const signedActions = [...trs[1].querySelectorAll('button')].map((b) => b.textContent);
    expect(signedActions).toEqual(['Copy link']);
    const signedLinks = [...trs[1].querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(signedLinks).toEqual([
      '/api/sign-file?id=eeeeffff00001111',
      '/api/sign-file?id=eeeeffff00001111&signed=1',
      '/sign/verify/eeeeffff00001111',
    ]);
    expect(w.empty.hidden).toBe(true);
  });

  it('prefixes signing and verify links with /es on the Spanish page', async () => {
    document.documentElement.lang = 'es';
    const w = mount();
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue(
      okJson({ ok: true, requests: [ROWS[0]] }),
    );
    initOwnerPage(STRINGS);
    await flush();
    const hrefs = [...w.list.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/es/sign/verify/aaaabbbbccccdddd');
  });

  it('counts every state and filters on chip click', async () => {
    const w = mount();
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue(
      okJson({ ok: true, requests: ROWS }),
    );
    initOwnerPage(STRINGS);
    await flush();
    const chips = [...w.counts.querySelectorAll('button')].map((b) => b.textContent);
    expect(chips).toEqual(['All (4)', 'Pending (1)', 'Signed (1)', 'Expired (1)', 'Revoked (1)']);
    const pendingChip = w.counts.querySelectorAll('button')[1];
    pendingChip.dispatchEvent(new Event('click', { bubbles: true }));
    expect(w.list.querySelectorAll('tr')).toHaveLength(1);
    expect(w.list.textContent).toContain('Audit A');
    pendingChip.dispatchEvent(new Event('click', { bubbles: true }));
    expect(w.list.querySelectorAll('tr')).toHaveLength(4);
  });

  it('treats an aged-out pending request as expired', async () => {
    const w = mount();
    const aged = {
      id: '9999000011112222',
      title: 'Audit Old',
      signerName: 'Olga',
      signerEmail: 'o@x.co',
      origHash: 'h',
      createdAt: '2026-09-01T10:00:00.000Z',
      state: 'expired',
      status: 'pending',
      signedAt: null,
      signedHash: null,
    };
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue(
      okJson({ ok: true, requests: [aged] }),
    );
    initOwnerPage(STRINGS);
    await flush();
    const trs = w.list.querySelectorAll('tr');
    expect(trs).toHaveLength(1);
    expect(trs[0].textContent).toContain('Expired');
    expect(trs[0].textContent).not.toContain('days left');
    const chips = [...w.counts.querySelectorAll('button')].map((b) => b.textContent);
    expect(chips).toEqual(['All (1)', 'Pending (0)', 'Signed (0)', 'Expired (1)', 'Revoked (0)']);
    expect([...trs[0].querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Copy link']);
  });

  it('narrows the list by title or signer', async () => {
    const w = mount();
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue(
      okJson({ ok: true, requests: ROWS }),
    );
    initOwnerPage(STRINGS);
    await flush();
    expect(w.search.placeholder).toBe('Search…');
    w.search.value = 'bob';
    w.search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(w.list.querySelectorAll('tr')).toHaveLength(1);
    expect(w.list.textContent).toContain('Audit B');
    w.search.value = 'audit';
    w.search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(w.list.querySelectorAll('tr')).toHaveLength(4);
    w.search.value = 'nobody here';
    w.search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(w.list.querySelectorAll('tr')).toHaveLength(0);
    expect(w.empty.hidden).toBe(false);
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

describe('initOwnerPage actions', () => {
  it('resends the invitation and refetches the list', async () => {
    const w = mount();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(okJson({ ok: true, requests: [ROWS[0]] }))
      .mockResolvedValueOnce(okJson({ ok: true, id: ROWS[0].id, link: 'https://x/sign/aaa' }))
      .mockResolvedValueOnce(okJson({ ok: true, requests: [ROWS[0]] }));
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    initOwnerPage(STRINGS);
    await flush();
    const resend = [...w.list.querySelectorAll('button')].find((b) => b.textContent === 'Resend')!;
    resend.dispatchEvent(new Event('click', { bubbles: true }));
    await flush();
    await flush();
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/sign-resend');
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as { body: string }).body))).toEqual({ id: ROWS[0].id });
    expect(w.list.querySelectorAll('tr')).toHaveLength(1);
  });

  it('revokes after confirm and shows the revoked row', async () => {
    const w = mount();
    const revoked = { ...ROWS[0], state: 'revoked', status: 'revoked' };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(okJson({ ok: true, requests: [ROWS[0]] }))
      .mockResolvedValueOnce(okJson({ ok: true, id: ROWS[0].id, status: 'revoked' }))
      .mockResolvedValueOnce(okJson({ ok: true, requests: [revoked] }));
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    (window as unknown as Record<string, unknown>)['confirm'] = jest.fn(() => true);
    initOwnerPage(STRINGS);
    await flush();
    const revokeBtn = [...w.list.querySelectorAll('button')].find((b) => b.textContent === 'Revoke')!;
    revokeBtn.dispatchEvent(new Event('click', { bubbles: true }));
    await flush();
    await flush();
    expect((window as unknown as Record<string, jest.Mock>)['confirm']).toHaveBeenCalledWith('Revoke?');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/sign-revoke');
    expect(w.list.textContent).toContain('Revoked');
    expect([...w.list.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Copy link']);
    delete (window as unknown as Record<string, unknown>)['confirm'];
  });

  it('skips the revoke POST when the confirm is dismissed', async () => {
    const w = mount();
    const fetchMock = jest.fn().mockResolvedValueOnce(okJson({ ok: true, requests: [ROWS[0]] }));
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    (window as unknown as Record<string, unknown>)['confirm'] = jest.fn(() => false);
    initOwnerPage(STRINGS);
    await flush();
    const revokeBtn = [...w.list.querySelectorAll('button')].find((b) => b.textContent === 'Revoke')!;
    revokeBtn.dispatchEvent(new Event('click', { bubbles: true }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    delete (window as unknown as Record<string, unknown>)['confirm'];
  });

  it('surfaces the server message when resend fails', async () => {
    const w = mount();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(okJson({ ok: true, requests: [ROWS[0]] }))
      .mockResolvedValueOnce(okJson({ ok: false, error: 'expired' }, false));
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    initOwnerPage(STRINGS);
    await flush();
    const resend = [...w.list.querySelectorAll('button')].find((b) => b.textContent === 'Resend')!;
    resend.dispatchEvent(new Event('click', { bubbles: true }));
    await flush();
    await flush();
    expect(w.error.textContent).toBe('Upload failed (expired)');
    expect(w.error.hidden).toBe(false);
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
