/**
 * The admin panel actions against the real handlers: every row the panel
 * lists — old bare-slug layout or new system/edition layout — publishes,
 * unpublishes and removes through the exact stored object it came from.
 * Removals touch only their own keys, the list is re-read after a removal
 * (a system heading drops with its last edition), and a failed action names
 * the failure on the row it belongs to, never the panel-wide error.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { TextDecoder as NodeTextDecoder } from 'node:util';
import { formatBytes } from '../lib/audit/util';

// The jsdom sandbox here ships no TextDecoder, no SubtleCrypto and no
// File.arrayBuffer; the panel client only needs them at event time, so
// the test scope lends the Node ones (jsdom's window.crypto is a
// getter-only accessor, hence the redefine) and hands each File its bytes.
const testGlobals = globalThis as Record<string, unknown>;
if (typeof testGlobals['TextDecoder'] === 'undefined') testGlobals['TextDecoder'] = NodeTextDecoder;
if (typeof (testGlobals['crypto'] as { subtle?: unknown } | undefined)?.subtle === 'undefined') {
  Object.defineProperty(testGlobals, 'crypto', { value: webcrypto, configurable: true, writable: true });
}

// Minimal fetch-API stand-ins: the jsdom sandbox ships no Request or
// Response, and the admin handlers only need headers, a JSON body, and a
// status with a JSON payload — exactly what the edge hands them.
class StubHeaders {
  private readonly map: Map<string, string>;
  constructor(init?: Record<string, string>) {
    this.map = new Map(Object.entries(init ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  }
  get(name: string): string | null {
    return this.map.get(name.toLowerCase()) ?? null;
  }
}

class StubRequest {
  readonly headers: StubHeaders;
  private readonly bodyText: string;
  constructor(url: string, init?: { headers?: Record<string, string>; method?: string; body?: string }) {
    void url;
    void init?.method;
    this.headers = new StubHeaders(init?.headers);
    this.bodyText = init?.body ?? '';
  }
  async json(): Promise<unknown> {
    return JSON.parse(this.bodyText) as unknown;
  }
}

class StubResponse {
  readonly status: number;
  readonly ok: boolean;
  private readonly payload: string;
  constructor(body: string, init?: { status?: number }) {
    this.payload = body;
    this.status = init?.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
  }
  async json(): Promise<unknown> {
    return JSON.parse(this.payload) as unknown;
  }
  async text(): Promise<string> {
    return this.payload;
  }
}

(globalThis as Record<string, unknown>)['Request'] = StubRequest;
(globalThis as Record<string, unknown>)['Response'] = StubResponse;
import {
  handleListAudits,
  handleRemoveAudit,
  handleSetVisibility,
  type AdminDeps,
  type AdminEnv,
} from '../lib/admin/handlers';
import { initAdminPage, type AdminClientStrings, type AdminUploadStrings } from '../lib/admin/panel-client';
import type { AdminR2Bucket } from '../lib/admin/summary';

const FIXTURE = resolve(__dirname, 'fixtures', 'audit-contract', 'audit.json');
const OWNER = 'owner@univerlab.org';

type Doc = Record<string, unknown>;

function fixtureDoc(): Doc {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Doc;
}

/** A valid audit document with the panel-visible fields pinned per test. */
function auditDoc(opts: {
  title: string;
  issued: string;
  visibility: 'public' | 'private';
  fixFindings?: boolean;
}): Doc {
  const doc = fixtureDoc();
  (doc['meta'] as Doc)['title'] = opts.title;
  doc['badge'] = { issued: opts.issued, scope: 'Panel actions fixture' };
  doc['visibility'] = opts.visibility;
  if (opts.visibility === 'private') doc['access'] = { emails: ['reader@example.com'] };
  if (opts.fixFindings) for (const f of doc['findings'] as { status: string }[]) f.status = 'fixed';
  return doc;
}

type Bucket = AdminR2Bucket & { files: Map<string, string> };

/** In-memory bucket with the four shapes the panel must handle: an old
 *  layout next to a same-prefixed sibling (`legacy/*`, `legacy-other/*`),
 *  an old layout sharing its system with an edition (`shared/*` plus
 *  `shared/ed-1/*`), and a pure two-edition system (`sys/ed-1`, `sys/ed-2`). */
function seedBucket(legacyVisibility: 'public' | 'private' = 'public', fixLegacy = false): Bucket {
  const entries: Record<string, Doc> = {
    'legacy/audit.json': auditDoc({ title: 'Legacy audit', issued: '2024-01-01', visibility: legacyVisibility, fixFindings: fixLegacy }),
    'legacy-other/audit.json': auditDoc({ title: 'Legacy other audit', issued: '2024-02-01', visibility: 'public' }),
    'shared/audit.json': auditDoc({ title: 'Shared legacy audit', issued: '2024-03-01', visibility: 'public' }),
    'shared/ed-1/audit.json': auditDoc({ title: 'Shared edition one', issued: '2024-04-01', visibility: 'public' }),
    'sys/ed-1/audit.json': auditDoc({
      title: 'Sys edition one',
      issued: '2024-05-01',
      visibility: 'private',
      fixFindings: true,
    }),
    'sys/ed-2/audit.json': auditDoc({ title: 'Sys edition two', issued: '2024-06-01', visibility: 'public' }),
  };
  const extras: Record<string, string> = {
    'legacy/notes.txt': 'legacy notes',
    'shared/notes.txt': 'shared legacy notes',
    'shared/ed-1/notes.txt': 'shared edition notes',
  };
  const files = new Map<string, string>();
  for (const [key, doc] of Object.entries(entries)) files.set(key, JSON.stringify(doc));
  for (const [key, text] of Object.entries(extras)) files.set(key, text);
  return {
    files,
    async get(key: string) {
      const text = files.get(key);
      if (text === undefined) return null;
      return { text: async () => text };
    },
    async put(key: string, value: Uint8Array | ArrayBuffer | string) {
      if (typeof value === 'string') files.set(key, value);
      else files.set(key, Buffer.from(value as Uint8Array).toString('utf8'));
    },
    async delete(key: string) {
      files.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      return { objects: [...files.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

const deps: AdminDeps = {
  verify: async (token: string) => (token === 'owner-jwt' ? OWNER : null),
};

function envOf(bucket: AdminR2Bucket): AdminEnv {
  return { AUDITS: bucket, SIGN_OWNER_EMAILS: OWNER };
}

function strings(): AdminClientStrings & Partial<AdminUploadStrings> {
  return {
    visibilityPublic: 'public',
    visibilityPrivate: 'private',
    findingsLine: '{open}/{total}',
    auditCountsPubOne: '{n} pub1',
    auditCountsPubOther: '{n} pubs',
    auditCountsPrivOne: '{n} priv1',
    auditCountsPrivOther: '{n} privs',
    auditCountsHighOne: '{n} high1',
    auditCountsHighOther: '{n} highs',
    thAudit: 'Audit',
    thDate: 'Date',
    thVisibility: 'Visibility',
    thFindings: 'Findings',
    thDoi: 'DOI',
    thActions: 'Actions',
    publish: 'Publish',
    unpublish: 'Unpublish',
    refused: 'refused {reason}',
    remove: 'Remove',
    confirmRemove: 'remove {slug}?',
    signCounts: '{pending}/{signed}',
    bookingOk: 'up',
    bookingDown: 'down',
    bookingLine: 'booking: {status}',
    loadError: 'load error',
    auditsEmpty: 'empty',
    actionMissing: 'missing',
    actionNetwork: 'network',
    actionFailed: 'failed {status}',
    uploadCancelled: 'cancelled',
    uploadInvalidOne: '1 invalid problem',
    uploadInvalidOther: '{n} invalid problems',
    uploadIssuesOne: '1 refusal problem',
    uploadIssuesOther: '{n} refusal problems',
    uploadFilesOne: '{n} file',
    uploadFilesOther: '{n} files',
    uploadPreviewTitle: 'Title',
    uploadPreviewClient: 'Client',
    uploadPreviewLanguage: 'Language',
    uploadPreviewVersion: 'Version',
    uploadPreviewFindings: 'Findings',
    uploadPreviewFiles: 'Files',
    severityCritical: 'crit',
    severityHigh: 'high',
    severityMedium: 'med',
    severityLow: 'low',
    severityInfo: 'info',
  };
}

function mount(): void {
  document.body.innerHTML =
    '<table><tbody id="admin-audits"></tbody></table>' +
    '<p id="admin-audits-counts"></p>' +
    '<p id="admin-error" hidden></p>' +
    '<p id="admin-empty" hidden></p>' +
    '<p id="admin-sign-counts"></p>' +
    '<p id="admin-booking-status" data-booking-api="https://booking.univerlab.org"></p>' +
    '<section id="admin-upload">' +
    '<input type="file" id="admin-upload-folder" />' +
    '<input type="file" id="admin-upload-zip" />' +
    '<button type="button" id="admin-upload-pick-folder"></button>' +
    '<button type="button" id="admin-upload-pick-zip"></button>' +
    '<div id="admin-upload-preview" hidden></div>' +
    '<div id="admin-upload-target" hidden>' +
    '<input type="text" id="admin-upload-system" list="admin-upload-systems" />' +
    '<datalist id="admin-upload-systems"></datalist>' +
    '<input type="text" id="admin-upload-edition" />' +
    '</div>' +
    '<progress id="admin-upload-progress" hidden max="100" value="0"></progress>' +
    '<button type="button" id="admin-upload-send" disabled></button>' +
    '<button type="button" id="admin-upload-replace" hidden></button>' +
    '<button type="button" id="admin-upload-cancel" hidden></button>' +
    '<ul id="admin-upload-errors" hidden></ul>' +
    '<p id="admin-upload-note"></p>' +
    '</section>';
}

function flush(rounds = 8): Promise<void> {
  let chain = Promise.resolve();
  for (let i = 0; i < rounds; i += 1) chain = chain.then(() => new Promise((r) => setTimeout(r, 0)));
  return chain;
}

/** The panel's fetch wired to the real handlers over the bucket. Rejections
 *  stand in for a dropped network on the named actions. */
function bridgeFetch(bucket: Bucket, fail?: { visibility?: boolean; remove?: boolean }): jest.Mock {
  const env = envOf(bucket);
  const authed = { 'Cf-Access-Jwt-Assertion': 'owner-jwt' };
  const fetchMock = jest.fn().mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    const u = String(url);
    if (u.endsWith('/health')) return { ok: true, status: 200, text: async () => 'ok' };
    if (u.endsWith('/api/sign-request')) return { ok: true, status: 200, json: async () => ({ requests: [] }) };
    if (u.endsWith('/api/admin-audits')) {
      return handleListAudits(
        new StubRequest('https://univerlab.org/api/admin-audits', { headers: authed }) as unknown as Request,
        env,
        deps,
      );
    }
    if (u.endsWith('/api/admin-visibility') && fail?.visibility) throw new Error('network down');
    if (u.endsWith('/api/admin-remove') && fail?.remove) throw new Error('network down');
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    const req = new StubRequest('https://univerlab.org/action', {
      method: 'POST',
      headers: { ...authed, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as Request;
    if (u.endsWith('/api/admin-visibility')) return handleSetVisibility(req, env, deps);
    if (u.endsWith('/api/admin-remove')) return handleRemoveAudit(req, env, deps);
    throw new Error(`unexpected fetch ${u}`);
  });
  (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
  return fetchMock;
}

function dataRows(): HTMLTableRowElement[] {
  return [...document.querySelectorAll('#admin-audits tr')]
    .filter((tr) => !tr.classList.contains('admin-system'))
    .map((tr) => tr as HTMLTableRowElement);
}

function headings(): string[] {
  return [...document.querySelectorAll('#admin-audits tr.admin-system th')].map((th) => th.textContent ?? '');
}

/** The data row whose audit link names the slug: the suffix match keeps
 *  `legacy` apart from `legacy-other`. */
function rowBySlug(slug: string): HTMLTableRowElement | undefined {
  return dataRows().find((tr) => tr.querySelector('a')?.textContent?.endsWith(`— ${slug}`) ?? false);
}

function cellsOf(row: HTMLTableRowElement): {
  toggle: HTMLButtonElement;
  remove: HTMLButtonElement;
  note: HTMLElement;
  vis: HTMLElement;
} {
  const [toggle, remove] = [...row.querySelectorAll('button')] as HTMLButtonElement[];
  return { toggle, remove, note: row.querySelector('.admin-note') as HTMLElement, vis: row.querySelectorAll('td')[2] };
}

function visibilityBody(fetchMock: jest.Mock, slug: string): Record<string, unknown> | undefined {
  for (const [url, init] of fetchMock.mock.calls as [string, { body?: string }][]) {
    if (String(url).endsWith('/api/admin-visibility')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      if (body['slug'] === slug || body['edition'] === slug) return body;
    }
  }
  return undefined;
}

function storedVisibility(bucket: Bucket, key: string): string | undefined {
  const text = bucket.files.get(key);
  if (!text) return undefined;
  return (JSON.parse(text) as Doc)['visibility'] as string;
}

function panelError(): HTMLElement {
  return document.getElementById('admin-error') as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

describe('admin panel actions over both layouts', () => {
  it('publishes and unpublishes an old-layout and a new-layout row', async () => {
    const bucket = seedBucket();
    const fetchMock = bridgeFetch(bucket);
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();
    // The old-layout row addresses its stored object as its bare slug.
    const legacy = rowBySlug('legacy');
    expect(legacy).toBeDefined();
    expect(cellsOf(legacy as HTMLTableRowElement).toggle.textContent).toBe('Unpublish');
    cellsOf(legacy as HTMLTableRowElement).toggle.click();
    await flush();
    expect(visibilityBody(fetchMock, 'legacy')).toEqual({ slug: 'legacy', visibility: 'private' });
    expect(storedVisibility(bucket, 'legacy/audit.json')).toBe('private');
    expect(cellsOf(legacy as HTMLTableRowElement).toggle.textContent).toBe('Publish');

    // A new-layout edition goes as its system/edition pair.
    const ed1 = rowBySlug('ed-1');
    expect(ed1).toBeDefined();
    const sysEd1 = dataRows().find(
      (tr) => tr.querySelector('a')?.textContent === 'Sys edition one — ed-1',
    ) as HTMLTableRowElement;
    cellsOf(sysEd1).toggle.click();
    await flush();
    const sent = (fetchMock.mock.calls as [string, { body?: string }][]).map(([, init]) => init?.body ?? '');
    expect(sent).toContain(JSON.stringify({ system: 'sys', edition: 'ed-1', visibility: 'public' }));
    expect(storedVisibility(bucket, 'sys/ed-1/audit.json')).toBe('public');
    expect(cellsOf(sysEd1).toggle.textContent).toBe('Unpublish');
  });

  it('removing an old-layout audit keeps a same-prefixed sibling', async () => {
    const bucket = seedBucket();
    bridgeFetch(bucket);
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();

    const row = rowBySlug('legacy') as HTMLTableRowElement;
    const { remove } = cellsOf(row);
    remove.click(); // The first click only arms the two-step confirmation.
    expect(bucket.files.has('legacy/audit.json')).toBe(true);
    remove.click();
    await flush();

    expect(bucket.files.has('legacy/audit.json')).toBe(false);
    expect(bucket.files.has('legacy/notes.txt')).toBe(false);
    expect(bucket.files.has('legacy-other/audit.json')).toBe(true);
    expect(rowBySlug('legacy')).toBeUndefined();
    expect(rowBySlug('legacy-other')).toBeDefined();
  });

  it('removing a legacy system that also has an edition keeps the edition', async () => {
    const bucket = seedBucket();
    bridgeFetch(bucket);
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();

    const shared = dataRows().find(
      (tr) => tr.querySelector('a')?.textContent === 'Shared legacy audit — shared',
    ) as HTMLTableRowElement;
    const { remove } = cellsOf(shared);
    remove.click();
    remove.click();
    await flush();

    expect(bucket.files.has('shared/audit.json')).toBe(false);
    expect(bucket.files.has('shared/notes.txt')).toBe(false);
    expect(bucket.files.has('shared/ed-1/audit.json')).toBe(true);
    expect(bucket.files.has('shared/ed-1/notes.txt')).toBe(true);
    expect(headings()).toContain('shared');
  });

  it('removing editions drops the system heading with its last edition', async () => {
    const bucket = seedBucket();
    bridgeFetch(bucket);
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();
    expect(headings()).toContain('sys');

    const ed1 = dataRows().find(
      (tr) => tr.querySelector('a')?.textContent === 'Sys edition one — ed-1',
    ) as HTMLTableRowElement;
    cellsOf(ed1).remove.click();
    cellsOf(ed1).remove.click();
    await flush();

    expect(bucket.files.has('sys/ed-1/audit.json')).toBe(false);
    expect(bucket.files.has('sys/ed-2/audit.json')).toBe(true);
    expect(headings()).toContain('sys');

    const ed2 = dataRows().find(
      (tr) => tr.querySelector('a')?.textContent === 'Sys edition two — ed-2',
    ) as HTMLTableRowElement;
    cellsOf(ed2).remove.click();
    cellsOf(ed2).remove.click();
    await flush();

    expect(bucket.files.has('sys/ed-2/audit.json')).toBe(false);
    expect(headings()).not.toContain('sys');
    expect(headings()).toContain('shared');
  });

  it('shows not-found on the row when the audit is already gone', async () => {
    const bucket = seedBucket();
    bridgeFetch(bucket);
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();

    bucket.files.delete('legacy/audit.json');
    const row = rowBySlug('legacy') as HTMLTableRowElement;
    cellsOf(row).toggle.click();
    await flush();

    expect(cellsOf(row).note.textContent).toBe('missing');
    expect(panelError().hidden).toBe(true);
    expect(panelError().textContent).toBe('');
  });

  it('shows the refusal on the row when publishing is refused', async () => {
    const bucket = seedBucket('private');
    bridgeFetch(bucket);
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();

    // The fixture keeps one open critical finding, so publishing refuses.
    const row = rowBySlug('legacy') as HTMLTableRowElement;
    expect(cellsOf(row).toggle.textContent).toBe('Publish');
    cellsOf(row).toggle.click();
    await flush();

    expect(cellsOf(row).note.textContent).toContain('refused');
    expect(cellsOf(row).note.textContent).toContain('F-01');
    expect(storedVisibility(bucket, 'legacy/audit.json')).toBe('private');
    expect(panelError().hidden).toBe(true);
    expect(panelError().textContent).toBe('');
  });

  it('shows a network error on the row when the request fails', async () => {
    const bucket = seedBucket();
    bridgeFetch(bucket, { visibility: true, remove: true });
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();

    const legacy = rowBySlug('legacy') as HTMLTableRowElement;
    cellsOf(legacy).toggle.click();
    await flush();
    expect(cellsOf(legacy).note.textContent).toBe('network');

    const other = rowBySlug('legacy-other') as HTMLTableRowElement;
    cellsOf(other).remove.click();
    cellsOf(other).remove.click();
    await flush();
    expect(cellsOf(other).note.textContent).toBe('network');
    expect(bucket.files.has('legacy-other/audit.json')).toBe(true);
    expect(panelError().hidden).toBe(true);
    expect(panelError().textContent).toBe('');
  });

  it('counts visibility and open high findings, dates rows with time, and labels cells', async () => {
    const bucket = seedBucket();
    bridgeFetch(bucket);
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();

    // Five public rows, one private row; every fixture row but sys/ed-1
    // keeps one open critical finding, and the glance picks the singular
    // form only for the single private count.
    expect(document.getElementById('admin-audits-counts')?.textContent).toBe('5 pubs · 1 priv1 · 5 highs');

    const row = rowBySlug('legacy') as HTMLTableRowElement;
    const time = row.querySelector('time');
    expect(time).not.toBeNull();
    expect(time?.getAttribute('datetime')).toBe('2024-01-01');
    expect(time?.textContent).not.toBe('2024-01-01');
    expect(row.querySelector('.admin-sev')).not.toBeNull();

    // Every data cell names its column for the narrow card layout.
    const cells = [...row.querySelectorAll('td')];
    expect(cells.map((td) => td.dataset['label'])).toEqual([
      'Audit',
      'Date',
      'Visibility',
      'Findings',
      'DOI',
      'Actions',
    ]);

    // The publish toggle and the remove button no longer compete: the
    // publish sits in the shared row-action group, removal apart from it.
    const buttons = row.querySelector('.sign-row-actions.admin-row-actions');
    expect(buttons).not.toBeNull();
    expect(buttons?.querySelector('.admin-publish')).toBe(cellsOf(row).toggle);
    expect(row.querySelector('.admin-remove')).toBe(cellsOf(row).remove);
  });

  it('previews a selection as a definition list and reveals the target', async () => {
    bridgeFetch(seedBucket());
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();
    selectFiles(uploadSelection().files);
    await flush();

    const preview = document.getElementById('admin-upload-preview') as HTMLElement;
    expect(preview.hidden).toBe(false);
    const dl = preview.querySelector('dl.admin-preview');
    expect(dl).not.toBeNull();
    // Compact summary rows, never loose paragraphs.
    expect(preview.querySelectorAll('dl > div').length).toBeGreaterThan(0);
    expect(preview.querySelector('p')).toBeNull();
    const terms = [...preview.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(terms).toEqual(['Title', 'Client', 'Language', 'Version', 'Findings', 'Files']);
    const defs = [...preview.querySelectorAll('dd')].map((dd) => dd.textContent);
    expect(defs[0]).toBe('Sys audit');
    // Severities with findings share the table chips; empty severities
    // are left out.
    const sevs = preview.querySelector('.admin-sevs');
    expect(sevs).not.toBeNull();
    expect([...(sevs as HTMLElement).querySelectorAll('.admin-sev')].map((c) => c.textContent)).toEqual([
      'crit 1',
      'high 1',
      'info 1',
    ]);
    const total = uploadSelection().total;
    expect(defs[5]).toBe(
      `6 files · ${formatBytes(total, document.documentElement.lang === '' ? undefined : document.documentElement.lang)}`,
    );
    // System and edition appear with the title proposal applied.
    const target = document.getElementById('admin-upload-target') as HTMLElement;
    expect(target.hidden).toBe(false);
    expect(systemInput().value).toBe('sys');
    expect(editionInput().value).toBe('sys-2026-03');
    expect((document.getElementById('admin-upload-send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the edition following the system until edited by hand', async () => {
    bridgeFetch(seedBucket());
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();
    selectFiles(uploadSelection().files);
    await flush();
    expect(editionInput().value).toBe('sys-2026-03');

    systemInput().value = 'sys2';
    systemInput().dispatchEvent(new Event('input', { bubbles: true }));
    expect(editionInput().value).toBe('sys2-2026-03');

    editionInput().value = 'custom-edition';
    editionInput().dispatchEvent(new Event('input', { bubbles: true }));
    systemInput().value = 'sys3';
    systemInput().dispatchEvent(new Event('input', { bubbles: true }));
    expect(editionInput().value).toBe('custom-edition');
  });

  it('shows progress while uploading and cancels on request', async () => {
    const fetchMock = bridgeUpload({ hangFiles: true });
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();
    selectFiles(uploadSelection().files);
    await flush();

    sendButton().click();
    await flush(2);
    const progress = document.getElementById('admin-upload-progress') as HTMLProgressElement;
    const cancel = document.getElementById('admin-upload-cancel') as HTMLButtonElement;
    expect(progress.hidden).toBe(false);
    expect(progress.max).toBe(6);
    expect(cancel.hidden).toBe(false);

    cancel.click();
    await flush();
    expect(noteEl().textContent).toBe('cancelled');
    expect(progress.hidden).toBe(true);
    expect(cancel.hidden).toBe(true);
    // The cancel click aborts the in-flight request and tells the server
    // to drop the staging area for this upload id.
    const bodies = fetchMock.mock.calls
      .map((c) => String((c[1] as { body?: unknown } | undefined)?.body ?? ''))
      .filter((b) => b.includes('"cancel"'));
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some((b) => b.includes('"uploadId":"u1"'))).toBe(true);
  });

  it('lists refusal problems with the path of each one', async () => {
    bridgeUpload({ refuseFiles: [{ path: '$.assets', message: 'asset file is missing' }] });
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();
    selectFiles(uploadSelection().files);
    await flush();

    sendButton().click();
    await flush();
    const errors = document.getElementById('admin-upload-errors') as HTMLElement;
    expect(errors.hidden).toBe(false);
    expect([...errors.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '$.assets: asset file is missing',
    ]);
    expect(noteEl().textContent).toBe('1 refusal problem');
  });

  it('reads a dropped set of files like a picked folder', async () => {
    bridgeFetch(seedBucket());
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();
    const section = document.getElementById('admin-upload') as HTMLElement;
    const drop = new Event('drop', { bubbles: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: uploadSelection().files } });
    section.dispatchEvent(drop);
    await flush();

    expect((document.getElementById('admin-upload-preview') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('admin-upload-target') as HTMLElement).hidden).toBe(false);
    expect(section.classList.contains('is-dragover')).toBe(false);
  });

  it('completes an upload, resets the form, and reloads the audit list', async () => {
    const fetchMock = bridgeUpload({ succeed: true });
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();
    selectFiles(uploadSelection().files);
    await flush();

    sendButton().click();
    await flush(16);
    expect(noteEl().textContent).toBe('Stored: sys-2026-03');
    expect(systemInput().value).toBe('');
    expect(editionInput().value).toBe('');
    expect(sendButton().disabled).toBe(true);
    const listCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/api/admin-audits'));
    expect(listCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('offers replace when an edition exists and replaces on confirmation', async () => {
    const fetchMock = bridgeUpload({ succeed: true, existsOnFirstInit: true });
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();
    selectFiles(uploadSelection().files);
    await flush();

    sendButton().click();
    await flush();
    const replaceBtn = document.getElementById('admin-upload-replace') as HTMLButtonElement;
    expect(replaceBtn.hidden).toBe(false);
    expect(noteEl().textContent).toContain('sys-2026-03');

    replaceBtn.click();
    await flush(16);
    expect(replaceBtn.hidden).toBe(true);
    expect(noteEl().textContent).toBe('Stored: sys-2026-03');
    const finalizeBodies = fetchMock.mock.calls
      .map((c) => String((c[1] as { body?: unknown } | undefined)?.body ?? ''))
      .filter((b) => b.includes('"finalize"'));
    expect(finalizeBodies.some((b) => b.includes('"replace":true'))).toBe(true);
  });

  it('reports init, finalize, network, and selection errors cleanly', async () => {
    // Selection without audit.json, with invalid JSON, with non-object JSON, and bad .zip
    bridgeFetch(seedBucket());
    mount();
    initAdminPage(strings(), { bookingApi: 'https://booking.univerlab.org' });
    await flush();

    const makeFile = (name: string, text: string, rel?: string): File => {
      const bytes = new Uint8Array(Buffer.from(text, 'utf8'));
      const f = new File([bytes as unknown as BlobPart], name);
      (f as unknown as Record<string, unknown>)['arrayBuffer'] = async () => bytes.buffer;
      if (rel !== undefined) Object.defineProperty(f, 'webkitRelativePath', { value: rel, configurable: true });
      return f;
    };

    selectFiles([makeFile('notes.txt', 'hi', 'top/notes.txt')]);
    await flush();
    expect(document.getElementById('admin-upload-errors')?.textContent).toContain('audit.json');

    selectFiles([makeFile('audit.json', '{bad', 'top/audit.json')]);
    await flush();
    expect(document.getElementById('admin-upload-errors')?.textContent).toContain('not valid JSON');

    selectFiles([makeFile('audit.json', '[]', 'top/audit.json')]);
    await flush();
    expect(document.getElementById('admin-upload-errors')?.textContent).toContain('not a JSON object');

    const zipInput = document.getElementById('admin-upload-zip') as HTMLInputElement;
    Object.defineProperty(zipInput, 'files', { value: [makeFile('broken.zip', 'not-a-zip')], configurable: true });
    zipInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(document.getElementById('admin-upload-errors')?.textContent).toContain('not a readable .zip');

    // Init failure
    bridgeUpload({ initStatus: 500 });
    selectFiles(uploadSelection().files);
    await flush();
    sendButton().click();
    await flush();
    expect(noteEl().textContent).toBe('failed 500');

    // Finalize 409 conflict
    bridgeUpload({ succeed: true, finalizeStatus: 409 });
    sendButton().click();
    await flush(16);
    expect((document.getElementById('admin-upload-replace') as HTMLButtonElement).hidden).toBe(false);

    // Finalize 400 with issues
    bridgeUpload({ succeed: true, finalizeStatus: 400, finalizeIssues: [{ path: '$.meta', message: 'bad meta' }] });
    sendButton().click();
    await flush(16);
    expect(document.getElementById('admin-upload-errors')?.textContent).toContain('$.meta: bad meta');

    // Network failure
    bridgeUpload({ throwNetwork: true });
    sendButton().click();
    await flush();
    expect(noteEl().textContent).toBe('network');
  });
});

/** A valid upload selection: the contract fixture retitled, dated, and
 *  read with its real asset bytes so catalogue checks pass. */
function uploadSelection(): { files: File[]; total: number } {
  const doc = fixtureDoc();
  (doc['meta'] as Doc)['title'] = 'Sys audit';
  doc['badge'] = { issued: '2026-03-15', scope: 'Panel actions fixture' };
  const assetsDir = resolve(__dirname, 'fixtures', 'audit-contract');
  const entries: { name: string; bytes: Uint8Array }[] = [
    { name: 'audit.json', bytes: new Uint8Array(Buffer.from(`${JSON.stringify(doc)}\n`, 'utf8')) },
    ...((doc['assets'] as { path: string }[]).map((a) => ({
      name: a.path,
      bytes: new Uint8Array(readFileSync(resolve(assetsDir, a.path))),
    }))),
  ];
  const files = entries.map((e) => {
    const copy = Uint8Array.from(e.bytes);
    const file = new File([copy as unknown as BlobPart], e.name);
    (file as unknown as Record<string, unknown>)['arrayBuffer'] = async () => Uint8Array.from(copy).buffer;
    // A real folder pick reports `folder/<path>` here and the bare file
    // name in `name`; jsdom keeps only the basename, so lend the path.
    Object.defineProperty(file, 'webkitRelativePath', { value: `top/${e.name}`, configurable: true });
    return file;
  });
  return { files, total: entries.reduce((n, e) => n + e.bytes.length, 0) };
}

function selectFiles(files: File[]): void {
  const folder = document.getElementById('admin-upload-folder') as HTMLInputElement;
  Object.defineProperty(folder, 'files', { value: files, configurable: true });
  folder.dispatchEvent(new Event('change', { bubbles: true }));
}

function systemInput(): HTMLInputElement {
  return document.getElementById('admin-upload-system') as HTMLInputElement;
}

function editionInput(): HTMLInputElement {
  return document.getElementById('admin-upload-edition') as HTMLInputElement;
}

function sendButton(): HTMLButtonElement {
  return document.getElementById('admin-upload-send') as HTMLButtonElement;
}

function noteEl(): HTMLElement {
  return document.getElementById('admin-upload-note') as HTMLElement;
}

/** Upload fetch stub: supports happy path, cancel hang, refusal issues,
 *  existing-edition conflict, finalize errors, and network failures. */
function bridgeUpload(opts: {
  hangFiles?: boolean;
  refuseFiles?: { path: string; message: string }[];
  succeed?: boolean;
  existsOnFirstInit?: boolean;
  initStatus?: number;
  finalizeStatus?: number;
  finalizeIssues?: { path: string; message: string }[];
  throwNetwork?: boolean;
}): jest.Mock {
  let initCalls = 0;
  const fetchMock = jest.fn().mockImplementation(async (url: string, init?: { signal?: AbortSignal; body?: string }) => {
    const u = String(url);
    if (u.endsWith('/health')) return { ok: true, status: 200, text: async () => 'ok' };
    if (u.endsWith('/api/sign-request')) return { ok: true, status: 200, json: async () => ({ requests: [] }) };
    if (u.endsWith('/api/admin-audits')) return { ok: true, status: 200, json: async () => ({ audits: [] }) };
    if (opts.throwNetwork) throw new Error('network down');
    if (u.includes('action=file')) {
      if (opts.hangFiles) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      }
      if (opts.succeed) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      return { ok: false, status: 400, json: async () => ({ issues: opts.refuseFiles ?? [] }) };
    }
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (body['action'] === 'init') {
      initCalls += 1;
      if (opts.initStatus) return { ok: false, status: opts.initStatus, json: async () => ({}) };
      const exists = Boolean(opts.existsOnFirstInit && initCalls === 1);
      return { ok: true, status: 200, json: async () => ({ uploadId: 'u1', exists }) };
    }
    if (body['action'] === 'finalize') {
      if (opts.finalizeStatus) {
        return {
          ok: false,
          status: opts.finalizeStatus,
          json: async () => (opts.finalizeIssues ? { issues: opts.finalizeIssues } : {}),
        };
      }
      return { ok: true, status: 200, json: async () => ({ slug: 'sys-2026-03' }) };
    }
    return { ok: true, status: 200, json: async () => ({ uploadId: 'u1' }) };
  });
  (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
  return fetchMock;
}
