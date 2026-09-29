/**
 * Roadmap contract tests — run against the real worker, not a copy of it.
 *
 * @jest-environment node
 *
 * Harness notes, each one earned:
 * - `cloudflare:workers` only exists inside workerd, so it is mocked virtually
 *   (written above the import; jest hoists it anyway).
 * - workerd's `crypto.subtle.timingSafeEqual` does not exist in Node, and every
 *   auth path calls it — even the one that is about to answer 401. Polyfilled
 *   below before any request runs, or every authenticated test dies with a
 *   TypeError instead of the status it was checking for.
 * - The SQL side of `shipped_at` stamping lives in LogHub and only runs under
 *   `wrangler dev`/prod. Here `computeShippedAt` is tested directly and the
 *   router is checked to forward the `state` change that triggers it; the DO's
 *   own `tsc --noEmit` covers the SQL. Jest proves the seam, not the database.
 */
jest.mock('cloudflare:workers', () => ({ DurableObject: class DurableObject {} }), { virtual: true });

import worker, {
  ROADMAP_PUBLIC_COLS,
  computeShippedAt,
  summarizeEntries,
  toPublicRoadmapItem,
} from '../../workers/announcements/src/index';

const subtle = globalThis.crypto.subtle as SubtleCrypto & {
  timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean;
};
if (typeof subtle.timingSafeEqual !== 'function') {
  subtle.timingSafeEqual = (a: ArrayBuffer, b: ArrayBuffer) => {
    const left = new Uint8Array(a);
    const right = new Uint8Array(b);
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
    return diff === 0;
  };
}

const ORIGIN = 'https://announcements.univerlab.org';
const AUTH = { Authorization: 'Bearer secret' };

interface PublicItem {
  id: string;
  title: string;
  state: string;
  topic: string | null;
  essence_hex: string | null;
  blocked_reason: string | null;
  pos: number;
  archived_at: number | null;
  updatedAt: string;
  summary: string | null;
  shipped_at: string | null;
}

function publicItem(overrides: Partial<PublicItem> = {}): PublicItem {
  return {
    id: 'r1',
    title: 'Ship the roadmap API',
    state: 'now',
    topic: 'general',
    essence_hex: null,
    blocked_reason: null,
    pos: 0,
    archived_at: null,
    updatedAt: '2026-09-28T10:00:00.000Z',
    summary: 'The roadmap API becomes the source of truth.',
    shipped_at: null,
    ...overrides,
  };
}

const PRIVATE_FIELDS = {
  notes: '## internal\n- Intelligence node `n-7`',
  refs: [
    { kind: 'pr', id: '123', label: 'roadmap contract' },
    { kind: 'intelligence', id: 'node-7' },
  ],
};

function fakeKV(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    put: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

const HUB_METHODS = [
  'getRoadmapAll',
  'getRoadmapItem',
  'roadmapItemExists',
  'createRoadmapItem',
  'patchRoadmapItem',
  'reorderRoadmap',
  'addEntry',
  'updateEntryMeta',
  'removeEntry',
  'removeRoadmapItem',
] as const;

/**
 * Stub of the LogHub stub: every method records its calls and, unless a test
 * installs behaviour with `on()`, throws — so "this path must not reach the DO"
 * is asserted by the test failing, not by a green test that never went there.
 */
function fakeHub() {
  const calls: Record<string, unknown[][]> = {};
  const impl: Record<string, (...args: unknown[]) => unknown> = {};
  const hub: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of HUB_METHODS) {
    hub[name] = (...args: unknown[]) => {
      calls[name] = [...(calls[name] ?? []), args];
      if (!impl[name]) throw new Error(`${name} must not be reached in this test`);
      return impl[name](...args);
    };
  }
  return {
    hub,
    calls,
    on(name: string, fn: (...args: unknown[]) => unknown) {
      impl[name] = fn;
    },
  };
}

function fakeEnv(kv: ReturnType<typeof fakeKV>, hub: unknown) {
  return {
    ANNOUNCEMENTS: kv,
    LOG_HUB: { getByName: () => hub },
    AUTH_TOKEN: 'secret',
  };
}

function get(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

function send(path: string, method: string, body: unknown, headers: Record<string, string> = AUTH): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function call(req: Request, env: unknown): Promise<{ status: number; raw: string; body: any }> {
  const res = await worker.fetch(req, env as never);
  const raw = await res.text();
  return { status: res.status, raw, body: raw ? JSON.parse(raw) : null };
}

function mirror(items: unknown[], version = 1): string {
  return JSON.stringify({ version, items });
}

describe('roadmap public mirror', () => {
  it('never exposes notes/refs, even from a poisoned KV row', async () => {
    const kv = fakeKV({
      roadmap: mirror([{ ...publicItem(), ...PRIVATE_FIELDS }], 7),
      entries: JSON.stringify([]),
    });
    const { status, raw, body } = await call(get('/roadmap'), fakeEnv(kv, fakeHub().hub));

    expect(status).toBe(200);
    expect(raw).not.toContain('notes');
    expect(raw).not.toContain('refs');
    expect(raw).not.toContain('internal');
    expect(body.items[0]).not.toHaveProperty('notes');
    expect(body.items[0]).not.toHaveProperty('refs');
    expect(body.items[0].summary).toBe('The roadmap API becomes the source of truth.');
    expect(body.items[0].shipped_at).toBeNull();
    expect(body.items[0].entries).toEqual({ count: 0, last_date: null, last_id: null });
    expect(body.version).toBe(7);
  });

  it('stays a KV read even when a valid token is presented', async () => {
    const kv = fakeKV({ roadmap: mirror([publicItem()]), entries: JSON.stringify([]) });
    const stub = fakeHub();
    const res = await call(new Request(`${ORIGIN}/roadmap`, { headers: AUTH }), fakeEnv(kv, stub.hub));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    // A stub method would have thrown; assert the read came from KV as well.
    expect(stub.calls.getRoadmapAll).toBeUndefined();
    expect(kv.get).toHaveBeenCalledWith('roadmap');
  });

  it('rolls up entries.count from announcements linked by roadmap_id', async () => {
    const kv = fakeKV({
      roadmap: mirror([publicItem({ id: 'r1' }), publicItem({ id: 'r2', pos: 1 }), publicItem({ id: 'r3', pos: 2 })]),
      entries: JSON.stringify([
        { id: 'e3', date: '2026-09-20T00:00:00.000Z', title: 't3', body: 'b', type: 'update', topic: 'general', roadmap_id: 'r1' },
        { id: 'e2', date: '2026-09-19T00:00:00.000Z', title: 't2', body: 'b', type: 'note', topic: 'general', roadmap_id: 'r1' },
        { id: 'e1', date: '2026-09-18T00:00:00.000Z', title: 't1', body: 'b', type: 'note', topic: 'general', roadmap_id: 'r1' },
        { id: 'e0', date: '2026-09-17T00:00:00.000Z', title: 't0', body: 'b', type: 'note', topic: 'general' },
        { id: 'e5', date: '2026-09-16T00:00:00.000Z', title: 't5', body: 'b', type: 'update', topic: 'general', roadmap_id: 'r2' },
      ]),
    });
    const { status, body } = await call(get('/roadmap?limit=50'), fakeEnv(kv, fakeHub().hub));

    expect(status).toBe(200);
    const byId = Object.fromEntries(body.items.map((item: any) => [item.id, item.entries]));
    expect(byId.r1).toEqual({ count: 3, last_date: '2026-09-20T00:00:00.000Z', last_id: 'e3' });
    expect(byId.r2).toEqual({ count: 1, last_date: '2026-09-16T00:00:00.000Z', last_id: 'e5' });
    expect(byId.r3).toEqual({ count: 0, last_date: null, last_id: null });
  });
});

describe('roadmap private reads', () => {
  it('answers 401 for ?private=1 without a token', async () => {
    const kv = fakeKV({ roadmap: mirror([publicItem()]) });
    const stub = fakeHub();
    const res = await call(get('/roadmap?private=1'), fakeEnv(kv, stub.hub));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(stub.calls.getRoadmapAll).toBeUndefined();
  });

  it('includes notes and refs for ?private=1 with a token', async () => {
    const kv = fakeKV({});
    const stub = fakeHub();
    stub.on('getRoadmapAll', () => ({
      version: 3,
      items: [{ ...publicItem(), ...PRIVATE_FIELDS, entries: { count: 2, last_date: '2026-09-20T00:00:00.000Z', last_id: 'e3' } }],
    }));

    const res = await call(new Request(`${ORIGIN}/roadmap?private=1`, { headers: AUTH }), fakeEnv(kv, stub.hub));

    expect(res.status).toBe(200);
    expect(res.body.items[0].notes).toBe(PRIVATE_FIELDS.notes);
    expect(res.body.items[0].refs).toEqual(PRIVATE_FIELDS.refs);
    expect(res.body.items[0].entries.count).toBe(2);
    expect(res.body.version).toBe(3);
    // Nothing was read from KV: this answer came from the DO.
    expect(kv.get).not.toHaveBeenCalled();
  });

  it('keeps ?state=all Bearer-gated and projected to public fields', async () => {
    const stub = fakeHub();
    stub.on('getRoadmapAll', () => ({ version: 4, items: [{ ...publicItem(), ...PRIVATE_FIELDS }] }));
    const env = fakeEnv(fakeKV({}), stub.hub);

    const denied = await call(get('/roadmap?state=all'), env);
    expect(denied.status).toBe(401);

    const allowed = await call(new Request(`${ORIGIN}/roadmap?state=all`, { headers: AUTH }), env);
    expect(allowed.status).toBe(200);
    expect(allowed.body.items[0]).not.toHaveProperty('notes');
    expect(allowed.body.items[0]).not.toHaveProperty('refs');
    expect(allowed.body.items[0].summary).toBe('The roadmap API becomes the source of truth.');
  });
});

describe('GET /roadmap/:id', () => {
  const entries = JSON.stringify([
    { id: 'e3', date: '2026-09-20T00:00:00.000Z', title: 'third', body: 'b', type: 'update', topic: 'general', roadmap_id: 'r1' },
    { id: 'e1', date: '2026-09-18T00:00:00.000Z', title: 'first', body: 'b', type: 'note', topic: 'general', roadmap_id: 'r1' },
    { id: 'e2', date: '2026-09-19T00:00:00.000Z', title: 'second', body: 'b', type: 'launch', topic: 'general', roadmap_id: 'r1' },
    { id: 'e9', date: '2026-09-21T00:00:00.000Z', title: 'elsewhere', body: 'b', type: 'note', topic: 'general', roadmap_id: 'r2' },
  ]);

  it('returns the item with its linked announcements, newest first', async () => {
    const kv = fakeKV({ roadmap: mirror([{ ...publicItem(), summary: 'One line.' }]), entries });
    const { status, body } = await call(get('/roadmap/r1'), fakeEnv(kv, fakeHub().hub));

    expect(status).toBe(200);
    expect(body.item.id).toBe('r1');
    expect(body.item.summary).toBe('One line.');
    expect(body.item).not.toHaveProperty('notes');
    expect(body.item.entries).toEqual({ count: 3, last_date: '2026-09-20T00:00:00.000Z', last_id: 'e3' });
    expect(body.announcements.map((entry: any) => entry.id)).toEqual(['e3', 'e2', 'e1']);
    expect(Object.keys(body.announcements[0]).sort()).toEqual(['date', 'id', 'title', 'type']);
  });

  it('breaks announcement ties on id DESC when dates collide', async () => {
    const same = '2026-09-20T00:00:00.000Z';
    const kv = fakeKV({
      roadmap: mirror([publicItem({ id: 'r1' })]),
      entries: JSON.stringify([
        { id: 'e1', date: same, title: 'first', body: 'b', type: 'note', topic: 'general', roadmap_id: 'r1' },
        { id: 'e9', date: same, title: 'ninth', body: 'b', type: 'update', topic: 'general', roadmap_id: 'r1' },
        { id: 'e2', date: same, title: 'second', body: 'b', type: 'launch', topic: 'general', roadmap_id: 'r1' },
      ]),
    });
    const { status, body } = await call(get('/roadmap/r1'), fakeEnv(kv, fakeHub().hub));

    expect(status).toBe(200);
    expect(body.announcements.map((entry: any) => entry.id)).toEqual(['e9', 'e2', 'e1']);
    expect(body.item.entries).toEqual({ count: 3, last_date: same, last_id: 'e9' });
  });

  it('404s an unknown id and refuses `order` as an id', async () => {
    const kv = fakeKV({ roadmap: mirror([publicItem()]), entries });
    const env = fakeEnv(kv, fakeHub().hub);

    expect((await call(get('/roadmap/nope'), env)).status).toBe(404);
    expect((await call(get('/roadmap/order'), env)).status).toBe(400);
  });

  it('requires a token for ?private=1 and then serves private + archived items', async () => {
    const kv = fakeKV({});
    const stub = fakeHub();
    stub.on('getRoadmapItem', () => ({
      item: { ...publicItem({ id: 'archived-1', archived_at: 1758000000000, state: 'done' }), ...PRIVATE_FIELDS },
      announcements: [{ id: 'e1', date: '2026-09-18T00:00:00.000Z', title: 'first', type: 'note' }],
      entries: { count: 1, last_date: '2026-09-18T00:00:00.000Z', last_id: 'e1' },
    }));
    const env = fakeEnv(kv, stub.hub);

    expect((await call(get('/roadmap/archived-1?private=1'), env)).status).toBe(401);

    const res = await call(new Request(`${ORIGIN}/roadmap/archived-1?private=1`, { headers: AUTH }), env);
    expect(res.status).toBe(200);
    expect(res.body.item.notes).toBe(PRIVATE_FIELDS.notes);
    expect(res.body.item.refs).toEqual(PRIVATE_FIELDS.refs);
    expect(res.body.item.archived_at).toBe(1758000000000);
    expect(res.body.announcements).toHaveLength(1);
  });
});

describe('roadmap writes', () => {
  it('stamps shipped_at exactly like the DO does', () => {
    const now = new Date('2026-09-29T00:00:00.000Z');
    expect(computeShippedAt('now', 'done', null, now)).toBe('2026-09-29T00:00:00.000Z');
    expect(computeShippedAt('done', 'done', '2026-09-01T00:00:00.000Z', now)).toBe('2026-09-01T00:00:00.000Z');
    expect(computeShippedAt('done', 'next', '2026-09-01T00:00:00.000Z', now)).toBeNull();
    expect(computeShippedAt('idea', 'idea', null, now)).toBeNull();
  });

  it('forwards state=done to the DO, where it gets stamped', async () => {
    const stub = fakeHub();
    stub.on('patchRoadmapItem', (_id, patch) => ({ ...publicItem(), ...(patch as object) }));
    const env = fakeEnv(fakeKV({}), stub.hub);

    const res = await call(send('/roadmap/r1', 'PATCH', { state: 'done' }), env);
    expect(res.status).toBe(200);
    expect(stub.calls.patchRoadmapItem[0]).toEqual(['r1', { state: 'done' }]);
  });

  it('rejects unknown fields on POST, and shipped_at on both POST and PATCH', async () => {
    const stub = fakeHub();
    const env = fakeEnv(fakeKV({}), stub.hub);

    expect((await call(send('/roadmap', 'POST', { title: 'x', position: 1 }), env)).status).toBe(400);
    expect((await call(send('/roadmap', 'POST', { title: 'x', shipped_at: '2026-09-29' }), env)).status).toBe(400);
    expect((await call(send('/roadmap/r1', 'PATCH', { shipped_at: '2026-09-29' }), env)).status).toBe(400);
    expect(stub.calls.createRoadmapItem).toBeUndefined();
    expect(stub.calls.patchRoadmapItem).toBeUndefined();
  });

  it('validates summary and refs per entry', async () => {
    const stub = fakeHub();
    stub.on('patchRoadmapItem', (_id, patch) => ({ ...publicItem(), ...(patch as object) }));
    const env = fakeEnv(fakeKV({}), stub.hub);

    expect((await call(send('/roadmap/r1', 'PATCH', { summary: 'x'.repeat(281) }), env)).status).toBe(413);
    expect((await call(send('/roadmap/r1', 'PATCH', { notes: 'x'.repeat(4001) }), env)).status).toBe(413);
    expect(
      (await call(send('/roadmap/r1', 'PATCH', { refs: [{ kind: 'jira', id: 'X-1' }] }), env)).status
    ).toBe(400);
    expect((await call(send('/roadmap/r1', 'PATCH', { refs: [{ kind: 'pr' }] }), env)).status).toBe(400);
    expect(
      (await call(send('/roadmap/r1', 'PATCH', { refs: [{ kind: 'pr', id: 'ok', nope: 1 }] }), env)).status
    ).toBe(400);
    expect(
      (await call(send('/roadmap/r1', 'PATCH', { refs: Array.from({ length: 31 }, (_, i) => ({ kind: 'pr', id: String(i) })) }), env)).status
    ).toBe(413);

    const ok = await call(
      send('/roadmap/r1', 'PATCH', { summary: 'Shipped.', refs: [{ kind: 'pr', id: ' 12 ' }] }),
      env
    );
    expect(ok.status).toBe(200);
    expect(ok.body.summary).toBe('Shipped.');
    expect(ok.body.refs).toEqual([{ kind: 'pr', id: '12' }]);
    expect(stub.calls.patchRoadmapItem).toHaveLength(1);
  });

  it('refuses to link an announcement to an unknown roadmap item', async () => {
    const stub = fakeHub();
    stub.on('roadmapItemExists', (id) => id === 'r1');
    stub.on('addEntry', (input) => ({ id: 'e1', date: '2026-09-29T00:00:00.000Z', ...(input as object) }));
    const env = fakeEnv(fakeKV({}), stub.hub);

    const bad = await call(send('/', 'PUT', { title: 't', body: 'b', roadmap_id: 'missing' }), env);
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'unknown roadmap_id' });

    const good = await call(send('/', 'PUT', { title: 't', body: 'b', roadmap_id: 'r1' }), env);
    expect(good.status).toBe(201);
    expect(stub.calls.addEntry[0][0]).toMatchObject({ title: 't', body: 'b', roadmap_id: 'r1' });
  });
});

describe('announcement PATCH with roadmap_id', () => {
  it('rejects an unknown link', async () => {
    const stub = fakeHub();
    stub.on('roadmapItemExists', () => false);
    const res = await call(send('/e1', 'PATCH', { roadmap_id: 'missing' }), fakeEnv(fakeKV({}), stub.hub));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'unknown roadmap_id' });
    expect(stub.calls.updateEntryMeta).toBeUndefined();
  });

  it('does not touch topic when only roadmap_id is sent (trap: it used to reset to general)', async () => {
    const stub = fakeHub();
    stub.on('roadmapItemExists', () => true);
    stub.on('updateEntryMeta', (_id, patch) => ({ id: 'e1', date: '2026-09-19T00:00:00.000Z', title: 't', body: 'b', type: 'note', topic: 'canopy', ...(patch as object) }));
    const env = fakeEnv(fakeKV({}), stub.hub);

    const res = await call(send('/e1', 'PATCH', { roadmap_id: 'r1' }), env);
    expect(res.status).toBe(200);
    const [id, patch] = stub.calls.updateEntryMeta[0] as [string, Record<string, unknown>];
    expect(id).toBe('e1');
    expect(patch).toEqual({ roadmap_id: 'r1' });
    expect(patch).not.toHaveProperty('topic');
  });

  it('still reclassifies as general when neither key is present', async () => {
    const stub = fakeHub();
    stub.on('updateEntryMeta', (_id, patch) => ({ id: 'e1', date: '2026-09-19T00:00:00.000Z', title: 't', body: 'b', type: 'note', ...(patch as object) }));
    const res = await call(send('/e1', 'PATCH', {}), fakeEnv(fakeKV({}), stub.hub));

    expect(res.status).toBe(200);
    expect(stub.calls.updateEntryMeta[0][1]).toEqual({ topic: 'general' });
  });
});

describe('guards', () => {
  it('keeps private columns out of the mirror column list', () => {
    const cols = ROADMAP_PUBLIC_COLS.split(',').map((col) => col.trim());
    expect(cols).toContain('summary');
    expect(cols).toContain('shipped_at');
    expect(cols).not.toContain('notes');
    expect(cols).not.toContain('refs');
  });

  it('summarizeEntries ignores rows without a roadmap_id and finds the newest', () => {
    const summary = summarizeEntries([
      { id: 'a', date: '2026-01-01T00:00:00.000Z', roadmap_id: 'r1' },
      { id: 'b', date: '2026-01-03T00:00:00.000Z' },
      { id: 'c', date: '2026-01-02T00:00:00.000Z', roadmap_id: 'r1' },
      { id: 'd', date: '2026-01-04T00:00:00.000Z', roadmap_id: null },
    ]);
    // 'b' (newer) has no link and 'd' has null: neither may win over 'c'.
    expect(summary).toEqual({ r1: { count: 2, last_date: '2026-01-02T00:00:00.000Z', last_id: 'c' } });
  });

  it('summarizeEntries breaks equal dates on id DESC (matches DO ORDER BY)', () => {
    // Arrival order must not matter: 'e1' is first in the array but loses to 'e9'.
    const summary = summarizeEntries([
      { id: 'e1', date: '2026-09-20T00:00:00.000Z', roadmap_id: 'r1' },
      { id: 'e9', date: '2026-09-20T00:00:00.000Z', roadmap_id: 'r1' },
      { id: 'e2', date: '2026-09-20T00:00:00.000Z', roadmap_id: 'r1' },
    ]);
    expect(summary).toEqual({
      r1: { count: 3, last_date: '2026-09-20T00:00:00.000Z', last_id: 'e9' },
    });
  });

  it('toPublicRoadmapItem rebuilds the item without private fields', () => {
    const item = toPublicRoadmapItem({
      ...publicItem(),
      ...PRIVATE_FIELDS,
      entries: { count: 1, last_date: '2026-09-20T00:00:00.000Z', last_id: 'e3' },
    } as never);
    expect(item).not.toHaveProperty('notes');
    expect(item).not.toHaveProperty('refs');
    expect(item.entries.count).toBe(1);

    // A legacy mirror row (no new columns yet) degrades to nulls, never undefined.
    const legacy = toPublicRoadmapItem({
      id: 'old',
      title: 'From before the migration',
      state: 'next',
      topic: null,
      essence_hex: null,
      blocked_reason: null,
      pos: 3,
      archived_at: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as never);
    expect(legacy.summary).toBeNull();
    expect(legacy.shipped_at).toBeNull();
    expect(legacy.entries).toEqual({ count: 0, last_date: null, last_id: null });
  });
});
