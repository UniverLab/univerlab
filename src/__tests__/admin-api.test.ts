/**
 * The admin control-room API: list every audit, flip visibility and remove
 * an audit, owner-only behind Cloudflare Access. A fake R2 bucket and a stub
 * verifier stand in for the edge; the fixture audit contract stands in for
 * the bucket documents.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleListAudits, handleRemoveAudit, handleSetVisibility, type AdminDeps, type AdminEnv } from '../lib/admin/handlers';
import { countSignRequests } from '../lib/admin/panel-client';
import { loadAdminAuditDoc, type AdminR2Bucket } from '../lib/admin/summary';

const FIXTURE = resolve(__dirname, 'fixtures', 'audit-contract', 'audit.json');
const OWNER = 'owner@univerlab.org';

type Doc = Record<string, unknown>;

function fixtureDoc(): Doc {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Doc;
}

/** A private audit always carries its reader allowlist — the contract
 *  refuses a private document without one. */
function privateDoc(): Doc {
  const doc = fixtureDoc();
  doc['visibility'] = 'private';
  doc['access'] = { emails: ['reader@example.com'] };
  return doc;
}

function makeBucket(seeds: Record<string, Doc> = {}): AdminR2Bucket & { files: Map<string, string> } {
  const files = new Map<string, string>();
  for (const [slug, doc] of Object.entries(seeds)) files.set(`${slug}/audit.json`, JSON.stringify(doc));
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

const verify = async (token: string): Promise<string | null> => {
  if (token === 'owner-jwt') return OWNER;
  if (token === 'stranger-jwt') return 'stranger@example.com';
  return null;
};

const deps: AdminDeps = { verify };

function envOf(bucket: AdminR2Bucket): AdminEnv {
  return { AUDITS: bucket, SIGN_OWNER_EMAILS: OWNER };
}

function get(url: string, token: string | null): Request {
  const headers: Record<string, string> = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  return new Request(`https://univerlab.org${url}`, { headers });
}

function post(url: string, token: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  return new Request(`https://univerlab.org${url}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('admin API auth', () => {
  it('answers 401 without a token and 403 to a non-owner', async () => {
    const bucket = makeBucket({ demo: fixtureDoc() });
    for (const req of [
      get('/api/admin-audits', null),
      post('/api/admin-visibility', null, { slug: 'demo', visibility: 'private' }),
      post('/api/admin-remove', null, { slug: 'demo', confirm: true }),
    ]) {
      const res =
        req.method === 'GET'
          ? await handleListAudits(req, envOf(bucket), deps)
          : req.url.endsWith('visibility')
            ? await handleSetVisibility(req, envOf(bucket), deps)
            : await handleRemoveAudit(req, envOf(bucket), deps);
      expect(res.status).toBe(401);
    }
    const listed = await handleListAudits(get('/api/admin-audits', 'stranger-jwt'), envOf(bucket), deps);
    expect(listed.status).toBe(403);
    const flipped = await handleSetVisibility(
      post('/api/admin-visibility', 'stranger-jwt', { slug: 'demo', visibility: 'private' }),
      envOf(bucket),
      deps,
    );
    expect(flipped.status).toBe(403);
    const removed = await handleRemoveAudit(
      post('/api/admin-remove', 'stranger-jwt', { slug: 'demo', confirm: true }),
      envOf(bucket),
      deps,
    );
    expect(removed.status).toBe(403);
  });
});

describe('admin audits list', () => {
  it('lists every audit as panel rows, private and public', async () => {
    const pub = fixtureDoc();
    pub['access'] = { emails: ['reader@example.com'] };
    const bucket = makeBucket({ aaa: pub, zzz: privateDoc() });
    const res = await handleListAudits(get('/api/admin-audits', 'owner-jwt'), envOf(bucket), deps);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; audits: Record<string, unknown>[] };
    expect(data.ok).toBe(true);
    expect(data.audits.map((a) => a['slug'])).toEqual(['aaa', 'zzz']);
    const row = data.audits[0] as Record<string, unknown>;
    expect(row['title']).toBe('Contract fixture audit (not a real audit)');
    expect(row['visibility']).toBe('public');
    expect(row['date']).toBe('');
    expect(row['doi']).toBeNull();
    const findings = row['findings'] as Record<string, unknown>;
    expect(findings['total']).toBe(3);
    expect(findings['open']).toBe(1);
    expect(findings['bySeverity']).toEqual({ critical: 1, high: 1, medium: 0, low: 0, info: 1 });
    expect(findings['openBySeverity']).toEqual({ critical: 1, high: 0, medium: 0, low: 0, info: 0 });
  });
});

describe('admin visibility flip', () => {
  it('refuses to publish while a critical finding is open, naming it', async () => {
    const bucket = makeBucket({ demo: privateDoc() });
    const res = await handleSetVisibility(
      post('/api/admin-visibility', 'owner-jwt', { slug: 'demo', visibility: 'public' }),
      envOf(bucket),
      deps,
    );
    expect(res.status).toBe(409);
    const data = (await res.json()) as { ok: boolean; error: string; reason: string };
    expect(data.error).toBe('refused');
    expect(data.reason).toContain('F-01');
    // The refusal changed nothing: the stored document is still private.
    expect((await loadAdminAuditDoc(bucket, 'demo'))?.visibility).toBe('private');
  });

  it('publishes once the open critical and high findings are fixed', async () => {
    const doc = privateDoc();
    for (const f of doc['findings'] as { id: string; status: string }[]) f.status = 'fixed';
    const bucket = makeBucket({ demo: doc });
    const res = await handleSetVisibility(
      post('/api/admin-visibility', 'owner-jwt', { slug: 'demo', visibility: 'public' }),
      envOf(bucket),
      deps,
    );
    expect(res.status).toBe(200);
    // The flip is written to audit.json: the routes reflect it with no redeploy.
    expect((await loadAdminAuditDoc(bucket, 'demo'))?.visibility).toBe('public');
  });

  it('unpublishes with 200 even with open findings, and rejects bad bodies', async () => {
    const pub = fixtureDoc();
    pub['access'] = { emails: ['reader@example.com'] };
    const bucket = makeBucket({ demo: pub });
    const res = await handleSetVisibility(
      post('/api/admin-visibility', 'owner-jwt', { slug: 'demo', visibility: 'private' }),
      envOf(bucket),
      deps,
    );
    expect(res.status).toBe(200);
    expect((await loadAdminAuditDoc(bucket, 'demo'))?.visibility).toBe('private');
    for (const body of [{ slug: 'demo' }, { slug: 'demo', visibility: 'draft' }, { slug: '../x', visibility: 'public' }]) {
      const bad = await handleSetVisibility(post('/api/admin-visibility', 'owner-jwt', body), envOf(bucket), deps);
      expect(bad.status).toBe(400);
    }
    const missing = await handleSetVisibility(
      post('/api/admin-visibility', 'owner-jwt', { slug: 'ghost', visibility: 'private' }),
      envOf(bucket),
      deps,
    );
    expect(missing.status).toBe(404);
  });

  it('unpublishing an allowlist-less public audit keeps a valid private document', async () => {
    // The contract fixture is public with no access list, like a real public
    // audit. A bare visibility flip would store an invalid private document
    // that the panel and the private route both read as missing.
    const bucket = makeBucket({ demo: fixtureDoc() });
    const res = await handleSetVisibility(
      post('/api/admin-visibility', 'owner-jwt', { slug: 'demo', visibility: 'private' }),
      envOf(bucket),
      deps,
    );
    expect(res.status).toBe(200);
    const stored = await loadAdminAuditDoc(bucket, 'demo');
    expect(stored?.visibility).toBe('private');
    expect(stored?.access?.emails).toEqual([OWNER]);
  });

  it('unpublishing keeps an existing reader allowlist untouched', async () => {
    const pub = fixtureDoc();
    pub['access'] = { emails: ['reader@example.com'] };
    const bucket = makeBucket({ demo: pub });
    const res = await handleSetVisibility(
      post('/api/admin-visibility', 'owner-jwt', { slug: 'demo', visibility: 'private' }),
      envOf(bucket),
      deps,
    );
    expect(res.status).toBe(200);
    expect((await loadAdminAuditDoc(bucket, 'demo'))?.access?.emails).toEqual(['reader@example.com']);
  });
});

describe('admin signing counts', () => {
  it('counts pending through linkState ready, like the owner console', () => {
    // The list API reports state via linkState: a pending request reads
    // 'ready', never 'pending' — filtering on 'pending' counts zero.
    expect(
      countSignRequests([
        { status: 'pending', state: 'ready' },
        { status: 'pending', state: 'expired' },
        { status: 'signed', state: 'signed' },
        { status: 'expired', state: 'expired' },
        { state: 'ready' },
      ]),
    ).toEqual({ pending: 2, signed: 1 });
  });
});

describe('admin remove', () => {
  it('refuses without confirm: true', async () => {
    const bucket = makeBucket({ demo: fixtureDoc() });
    for (const body of [{ slug: 'demo' }, { slug: 'demo', confirm: false }, { slug: 'demo', confirm: 'yes' }]) {
      const res = await handleRemoveAudit(post('/api/admin-remove', 'owner-jwt', body), envOf(bucket), deps);
      expect(res.status).toBe(400);
    }
    expect(await loadAdminAuditDoc(bucket, 'demo')).not.toBeNull();
  });

  it('deletes the audit and every key under its prefix', async () => {
    const bucket = makeBucket({ demo: fixtureDoc(), other: fixtureDoc() });
    const res = await handleRemoveAudit(
      post('/api/admin-remove', 'owner-jwt', { slug: 'demo', confirm: true }),
      envOf(bucket),
      deps,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; slug: string; deleted: number };
    expect(data.deleted).toBeGreaterThanOrEqual(1);
    expect(await loadAdminAuditDoc(bucket, 'demo')).toBeNull();
    expect(await loadAdminAuditDoc(bucket, 'other')).not.toBeNull();
  });
});
