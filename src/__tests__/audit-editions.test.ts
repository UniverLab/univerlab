/**
 * Stable audit addresses: one system (`/audits/<system>/`), many editions.
 * The system page shows the newest edition and lists every earlier one;
 * legacy dated addresses redirect to it; visibility and removal work per
 * edition in the admin room.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { onRequest } from '../../functions/_middleware';
import {
  handleListAudits,
  handleRemoveAudit,
  handleSetVisibility,
  type AdminDeps,
  type AdminEnv,
} from '../lib/admin/handlers';
import type { AdminR2Bucket } from '../lib/admin/summary';

const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'audit-contract');
const OWNER = 'owner@univerlab.org';

type Doc = Record<string, unknown>;

function fixtureDoc(): Doc {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'audit.json'), 'utf8')) as Doc;
}

/** One edition of a system: distinct subtitle, version, badge date and
 *  status so the tests can tell editions apart in the rendered page. */
function editionDoc(opts: {
  language: 'en' | 'es';
  subtitle: string;
  version: string;
  issued: string;
  visibility: 'public' | 'private';
}): Doc {
  const doc = fixtureDoc();
  (doc['meta'] as Doc)['language'] = opts.language;
  (doc['meta'] as Doc)['subtitle'] = opts.subtitle;
  (doc['meta'] as Doc)['version'] = opts.version;
  doc['badge'] = { issued: opts.issued, scope: 'Editions fixture' };
  doc['visibility'] = opts.visibility;
  if (opts.visibility === 'private') doc['access'] = { emails: ['reader@example.com'] };
  return doc;
}

/** In-memory bucket: `sys/ed/audit.json` plus the fixture assets under
 *  every edition, with a prefix-aware `list`. */
function makeAudits(entries: { system: string; edition: string; doc: Doc }[]) {
  const files = new Map<string, Uint8Array>();
  const assets = (fixtureDoc()['assets'] ?? []) as { path: string }[];
  for (const { system, edition, doc } of entries) {
    files.set(`${system}/${edition}/audit.json`, Buffer.from(JSON.stringify(doc)));
    for (const a of assets) {
      files.set(`${system}/${edition}/${a.path}`, new Uint8Array(readFileSync(join(FIXTURE_DIR, a.path))));
    }
  }
  return {
    async get(key: string) {
      const bytes = files.get(key);
      if (!bytes) return null;
      return {
        body: bytes,
        size: bytes.length,
        etag: '"editions-fixture"',
        httpMetadata: {},
        text: async () => Buffer.from(bytes).toString('utf8'),
      };
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      return { objects: [...files.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

const SHELL =
  '<html lang="en"><head><title>Audit — UniverLab</title>' +
  '<meta name="description" content="A UniverLab audit.">' +
  '<meta name="robots" content="noindex, nofollow">' +
  '<link rel="canonical" href="https://univerlab.org/audit-shell/">' +
  '</head><body><div id="audit"></div></body></html>';

function context(pathname: string, audits: ReturnType<typeof makeAudits>, accept = 'text/html') {
  return {
    request: new Request(`https://univerlab.org${pathname}`, { headers: { Accept: accept } }),
    env: {
      ASSETS: {
        fetch: jest.fn(async (input: string | Request) => {
          const url = String(input);
          if (url.endsWith('/audits/') || url.endsWith('/audit-shell/')) return new Response(SHELL, { status: 200 });
          return new Response('not found', { status: 404 });
        }),
      },
      AUDITS: audits,
    },
    next: jest.fn(async () => new Response('site 404', { status: 404 })),
  };
}

const CANOPY = [
  {
    system: 'canopy',
    edition: 'canopy-2026-10',
    doc: editionDoc({ language: 'en', subtitle: 'First canopy edition', version: '1.0', issued: '2026-10-15', visibility: 'public' }),
  },
  {
    system: 'canopy',
    edition: 'canopy-2026-11',
    doc: editionDoc({ language: 'en', subtitle: 'Second canopy edition', version: '2.0', issued: '2026-11-15', visibility: 'public' }),
  },
];

const TIENDA = [
  {
    system: 'tienda',
    edition: 'tienda-2026-01',
    doc: editionDoc({ language: 'es', subtitle: 'Primera edición', version: '1.0', issued: '2026-01-15', visibility: 'public' }),
  },
  {
    system: 'tienda',
    edition: 'tienda-2026-06',
    doc: editionDoc({ language: 'es', subtitle: 'Segunda edición', version: '2.0', issued: '2026-06-15', visibility: 'public' }),
  },
];

const MIXTO = [
  {
    system: 'mixto',
    edition: 'mixto-2026-01',
    doc: editionDoc({ language: 'en', subtitle: 'Old public edition', version: '1.0', issued: '2026-01-15', visibility: 'public' }),
  },
  {
    system: 'mixto',
    edition: 'mixto-2026-06',
    doc: editionDoc({ language: 'en', subtitle: 'New private edition', version: '2.0', issued: '2026-06-15', visibility: 'private' }),
  },
];

describe('stable system addresses', () => {
  it('serves the newest edition at the bare system address, private and public', async () => {
    const audits = makeAudits(CANOPY);
    const priv = await onRequest(context('/audits/canopy/', audits));
    expect(priv.status).toBe(200);
    expect(await priv.text()).toContain('Second canopy edition');

    const pub = await onRequest(context('/workbench/audits/canopy/', audits));
    expect(pub.status).toBe(200);
    const body = await pub.text();
    expect(body).toContain('Second canopy edition');
    expect(body).toContain('https://univerlab.org/workbench/audits/canopy/');
  });

  it('serves a named edition at system/edition', async () => {
    const audits = makeAudits(CANOPY);
    const res = await onRequest(context('/audits/canopy/canopy-2026-10/', audits));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('First canopy edition');

    const pub = await onRequest(context('/workbench/audits/canopy/canopy-2026-10/', audits));
    expect(pub.status).toBe(200);
    expect(await pub.text()).toContain('First canopy edition');
  });

  it('lists editions newest-first, each opening its own page', async () => {
    const audits = makeAudits(CANOPY);
    const body = await (await onRequest(context('/audits/canopy/', audits))).text();
    expect(body).toContain('Editions');
    const latest = body.indexOf('/audits/canopy/canopy-2026-11/');
    const older = body.indexOf('/audits/canopy/canopy-2026-10/');
    expect(latest).toBeGreaterThanOrEqual(0);
    expect(older).toBeGreaterThanOrEqual(0);
    expect(latest).toBeLessThan(older);
    expect(body).toContain('Latest');
    expect(body).toContain('2.0');
    expect(body).toContain('1.0');
  });

  it('renders the edition list with Spanish labels when the edition is Spanish', async () => {
    const audits = makeAudits(TIENDA);
    const body = await (await onRequest(context('/workbench/audits/tienda/', audits))).text();
    expect(body).toContain('Ediciones');
    expect(body).toContain('Última');
    expect(body).toContain('Abrir esta edición');
    expect(body).not.toContain('>Editions<');
  });

  it('redirects a legacy dated address to the stable system, both prefixes', async () => {
    const audits = makeAudits(CANOPY);
    const priv = await onRequest(context('/audits/canopy-2026-11/', audits));
    expect(priv.status).toBe(301);
    expect(priv.headers.get('Location')).toBe('https://univerlab.org/audits/canopy/');

    const pub = await onRequest(context('/workbench/audits/canopy-2026-10/', audits));
    expect(pub.status).toBe(301);
    expect(pub.headers.get('Location')).toBe('https://univerlab.org/workbench/audits/canopy/');
  });

  it('keeps a private edition off the public route while the older edition stays public', async () => {
    const audits = makeAudits(MIXTO);
    // The public system page, markdown twin and un-editioned asset fall back
    // to the newest *public* edition.
    const page = await onRequest(context('/workbench/audits/mixto/', audits));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Old public edition');

    const twin = await onRequest(context('/workbench/audits/mixto/index.md', audits));
    expect(twin.status).toBe(200);
    expect(await twin.text()).toContain('Old public edition');

    const pubAsset = await onRequest(context('/workbench/audits/mixto/assets/figure.svg', audits));
    expect(pubAsset.status).toBe(200);

    // The private edition itself never serves publicly — page, twin, badge, asset.
    expect((await onRequest(context('/workbench/audits/mixto/mixto-2026-06/', audits))).status).toBe(404);
    expect((await onRequest(context('/workbench/audits/mixto/mixto-2026-06/index.md', audits))).status).toBe(404);
    expect((await onRequest(context('/workbench/audits/mixto/mixto-2026-06/badge.svg', audits))).status).toBe(404);
    expect((await onRequest(context('/workbench/audits/mixto/mixto-2026-06/assets/figure.svg', audits))).status).toBe(404);

    // The system badge follows the public edition.
    const badge = await onRequest(context('/workbench/audits/mixto/badge.svg', audits));
    expect(badge.status).toBe(200);

    // The private edition still serves on the private route only with access;
    // without a token it answers as if missing.
    const ctx = context('/audits/mixto/mixto-2026-06/', audits);
    expect((await onRequest(ctx)).status).toBe(404);
    expect(ctx.next).toHaveBeenCalled();
  });

  it('serves assets of the named edition', async () => {
    const audits = makeAudits(CANOPY);
    const res = await onRequest(context('/audits/canopy/canopy-2026-10/assets/figure.svg', audits));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<svg');
  });
});

/** Admin bucket fake with writes, seeded by edition path. */
function makeAdminBucket(seeds: Record<string, Doc>): AdminR2Bucket & { files: Map<string, string> } {
  const files = new Map<string, string>();
  for (const [path, doc] of Object.entries(seeds)) files.set(`${path}/audit.json`, JSON.stringify(doc));
  return {
    files,
    async get(key: string) {
      const text = files.get(key);
      if (text === undefined) return null;
      return { text: async () => text };
    },
    async put(key: string, value: Uint8Array | ArrayBuffer | string) {
      if (typeof value === 'string') files.set(key, value);
      else files.set(key, Buffer.from(new Uint8Array(value)).toString('utf8'));
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

const verify = async (token: string): Promise<string | null> => (token === 'owner-jwt' ? OWNER : null);
const deps: AdminDeps = { verify };
const envOf = (bucket: AdminR2Bucket): AdminEnv => ({ AUDITS: bucket, SIGN_OWNER_EMAILS: OWNER });
const post = (url: string, body: unknown): Request =>
  new Request(`https://univerlab.org${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cf-Access-Jwt-Assertion': 'owner-jwt' },
    body: JSON.stringify(body),
  });

describe('admin per-edition', () => {
  const seeds = (): Record<string, Doc> => ({
    'canopy/canopy-2026-10': editionDoc({ language: 'en', subtitle: 'First', version: '1.0', issued: '2026-10-15', visibility: 'public' }),
    'canopy/canopy-2026-11': editionDoc({ language: 'en', subtitle: 'Second', version: '2.0', issued: '2026-11-15', visibility: 'public' }),
  });

  it('groups rows by system with the newest edition first and marked latest', async () => {
    const bucket = makeAdminBucket({ ...seeds(), 'otra/solo': editionDoc({ language: 'en', subtitle: 'Solo', version: '1.0', issued: '2026-05-01', visibility: 'public' }) });
    const res = await handleListAudits(
      new Request('https://univerlab.org/api/admin-audits', { headers: { 'Cf-Access-Jwt-Assertion': 'owner-jwt' } }),
      envOf(bucket),
      deps,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; audits: Record<string, unknown>[] };
    expect(data.ok).toBe(true);
    expect(data.audits.map((a) => `${a['system']}/${a['edition']}`)).toEqual([
      'canopy/canopy-2026-11',
      'canopy/canopy-2026-10',
      'otra/solo',
    ]);
    expect(data.audits.map((a) => a['isLatest'])).toEqual([true, false, true]);
    expect(data.audits[0]['slug']).toBe('canopy-2026-11');
  });

  it('flips visibility per edition, leaving its sibling untouched', async () => {
    const bucket = makeAdminBucket(seeds());
    const res = await handleSetVisibility(post('/api/admin-visibility', { system: 'canopy', edition: 'canopy-2026-10', visibility: 'private' }), envOf(bucket), deps);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; system: string; edition: string };
    expect(data.system).toBe('canopy');
    expect(data.edition).toBe('canopy-2026-10');
    expect(JSON.parse(bucket.files.get('canopy/canopy-2026-10/audit.json')!).visibility).toBe('private');
    expect(JSON.parse(bucket.files.get('canopy/canopy-2026-11/audit.json')!).visibility).toBe('public');
  });

  it('removes one edition while its sibling survives', async () => {
    const bucket = makeAdminBucket(seeds());
    const res = await handleRemoveAudit(post('/api/admin-remove', { system: 'canopy', edition: 'canopy-2026-10', confirm: true }), envOf(bucket), deps);
    expect(res.status).toBe(200);
    expect(bucket.files.has('canopy/canopy-2026-10/audit.json')).toBe(false);
    expect(bucket.files.has('canopy/canopy-2026-11/audit.json')).toBe(true);
  });

  it('addresses the newest edition through the bare system slug', async () => {
    const bucket = makeAdminBucket(seeds());
    const res = await handleRemoveAudit(post('/api/admin-remove', { slug: 'canopy', confirm: true }), envOf(bucket), deps);
    expect(res.status).toBe(200);
    // A bare system names the whole system: both editions go.
    expect(bucket.files.has('canopy/canopy-2026-10/audit.json')).toBe(false);
    expect(bucket.files.has('canopy/canopy-2026-11/audit.json')).toBe(false);
  });
});
