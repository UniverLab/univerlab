/**
 * The Zenodo deposit for published audits: who may publish, what flies,
 * how a re-audit becomes a new version, and the DOI writeback.
 *
 * @jest-environment node
 *
 * Node: the CLI is exercised end to end (child process, stub HTTP server,
 * fake wrangler), and the refusal/file-set/metadata units run here too.
 * Every Zenodo call in this file goes through an injected fetch or a local
 * stub server: nothing here may touch the real network, and a test that
 * needs the network fails instead.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  AUDIT_COMMUNITY,
  depositAssetIds,
  depositAudit,
  depositMetadata,
  depositRefusal,
  findDepositionByConceptDoi,
  md5Hex,
  sha256Hex,
} from '../lib/audit/zenodo.ts';
import type { AuditDocument } from '../lib/audit/types.ts';

const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'audit-contract');

type Doc = Record<string, unknown>;

function fixtureDoc(): Doc {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'audit.json'), 'utf8')) as Doc;
}

function asAudit(doc: Doc): AuditDocument {
  return doc as unknown as AuditDocument;
}

/** A depositable copy of the fixture: findings fixed, badge issued, the
 *  client's consent to a permanent deposit recorded, and one public plus
 *  one private annex. */
function depositableDoc(): Doc {
  const doc = fixtureDoc();
  for (const f of doc['findings'] as Doc[]) f['status'] = 'fixed';
  doc['badge'] = { issued: '2026-06-15', scope: 'Fixture scope' };
  doc['deposit'] = { consent: true };
  doc['annexes'] = [
    { id: 'repro', title: 'Repro', description: 'Public repro.', assets: ['chart-data', 'snippet-py'], visibility: 'public' },
    { id: 'internal', title: 'Internal', description: 'Private notes.', assets: ['clip-mp4'] },
  ];
  return doc;
}

describe('deposit refusal', () => {
  it('refuses a private audit', () => {
    const doc = depositableDoc();
    doc['visibility'] = 'private';
    (doc as Doc)['access'] = { emails: ['reader@example.com'] };
    expect(depositRefusal(asAudit(doc))).toMatch(/private/);
  });

  it('refuses open critical and high findings, but not fixed ones', () => {
    const openCrit = depositableDoc();
    (openCrit['findings'] as Doc[])[0]['status'] = 'open';
    (openCrit['findings'] as Doc[])[0]['severity'] = 'critical';
    expect(depositRefusal(asAudit(openCrit))).toMatch(/F-01/);

    const openHigh = depositableDoc();
    (openHigh['findings'] as Doc[])[0]['status'] = 'open';
    (openHigh['findings'] as Doc[])[0]['severity'] = 'high';
    expect(depositRefusal(asAudit(openHigh))).toMatch(/open/);

    expect(depositRefusal(asAudit(depositableDoc()))).toBeNull();
  });

  it('refuses without the recorded permanent-deposit consent', () => {
    const missing = depositableDoc();
    delete (missing as Doc)['deposit'];
    expect(depositRefusal(asAudit(missing))).toMatch(/consent/);

    const declined = depositableDoc();
    (declined['deposit'] as Doc)['consent'] = false;
    expect(depositRefusal(asAudit(declined))).toMatch(/consent/);
  });

  it('refuses an audit that already carries a version DOI', () => {
    const done = depositableDoc();
    (done['deposit'] as Doc)['versionDoi'] = '10.5281/zenodo.1';
    expect(depositRefusal(asAudit(done))).toMatch(/already deposited/);
  });
});

describe('deposit file set', () => {
  it('uploads the TeXForge PDF plus the public annexes only', () => {
    const ids = depositAssetIds(asAudit(depositableDoc()));
    expect(ids).not.toBeNull();
    expect(ids!.report).toBe('report-pdf');
    expect(ids!.files).toEqual(['report-pdf', 'chart-data', 'snippet-py']);
  });

  it('returns null without a TeXForge PDF report', () => {
    const doc = depositableDoc();
    delete (doc['deliverables'] as Doc)['report'];
    expect(depositAssetIds(asAudit(doc))).toBeNull();
  });

  it('never duplicates the PDF when a public annex bundles it', () => {
    const doc = depositableDoc();
    ((doc['annexes'] as Doc[])[0]['assets'] as string[]).push('report-pdf');
    expect(depositAssetIds(asAudit(doc))!.files).toEqual(['report-pdf', 'chart-data', 'snippet-py']);
  });
});

describe('deposit metadata', () => {
  it('carries title, creators, client subject, date, language, report type, license and community', () => {
    const doc = depositableDoc();
    (doc as Doc)['x-license'] = 'CC-BY-4.0';
    const metadata = depositMetadata(asAudit(doc));
    expect(metadata['title']).toBe((doc['meta'] as Doc)['title']);
    expect(metadata['creators']).toEqual([{ name: 'Contract Test Team' }]);
    expect(metadata['subjects']).toEqual([{ term: 'Fixture Client (not a real client)' }]);
    expect(metadata['publication_date']).toBe('2026-06-15');
    expect(metadata['language']).toBe('eng');
    expect(metadata['upload_type']).toBe('publication');
    expect(metadata['publication_type']).toBe('report');
    expect(metadata['license']).toBe('CC-BY-4.0');
    expect(metadata['communities']).toEqual([{ identifier: AUDIT_COMMUNITY }]);
  });

  it('omits the license when the document names none', () => {
    expect('license' in depositMetadata(asAudit(depositableDoc()))).toBe(false);
  });
});

describe('deposit hash helpers', () => {
  it('computes the known digests', () => {
    const data = Buffer.from('abc');
    expect(sha256Hex(data)).toBe(createHash('sha256').update(data).digest('hex'));
    expect(md5Hex(data)).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});

/** In-process Zenodo double: records every call, answers the deposit flow
 *  from memory, and fails any URL outside the injected base. */
function mockZenodo(opts?: {
  conceptDoi?: string;
  versionDoi?: string;
  recordId?: number;
  searchHits?: { id: number }[];
  inherited?: { id: number; filename: string }[];
  publishFails?: number;
}): { fetchImpl: typeof fetch; calls: string[]; uploaded: Map<string, Uint8Array>; metadataSeen: Doc[] } {
  const calls: string[] = [];
  const uploaded = new Map<string, Uint8Array>();
  const metadataSeen: Doc[] = [];
  const base = 'https://zenodo.test/api';
  const versionDoi = opts?.versionDoi ?? '10.5281/zenodo.100';
  const conceptDoi = opts?.conceptDoi ?? '10.5281/zenodo.99';
  const recordId = opts?.recordId ?? 5;

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const fetchImpl = (async (url: unknown, init?: RequestInit): Promise<Response> => {
    const raw = String(url);
    if (!raw.startsWith(base)) throw new Error(`unexpected zenodo host: ${raw}`);
    const u = new URL(raw);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push(`${method} ${u.pathname}`);
    if (method === 'POST' && u.pathname === '/api/deposit/depositions') {
      return json({ id: 11, links: { bucket: `${base}/bucket/11` } }, 201);
    }
    if (method === 'GET' && u.pathname === '/api/deposit/depositions') {
      return json(opts?.searchHits ?? []);
    }
    const newVersion = /^\/api\/deposit\/depositions\/(\d+)\/actions\/newversion$/.exec(u.pathname);
    if (method === 'POST' && newVersion) {
      return json({ id: 12, links: { bucket: `${base}/bucket/12` }, files: opts?.inherited ?? [] }, 201);
    }
    const draft = /^\/api\/deposit\/depositions\/(\d+)$/.exec(u.pathname);
    if (method === 'GET' && draft) {
      return json({ id: Number(draft[1]), files: opts?.inherited ?? [] });
    }
    if (method === 'PUT' && draft) {
      metadataSeen.push(JSON.parse(String(init?.body)) as Doc);
      return json({ id: Number(draft[1]) });
    }
    if (method === 'DELETE' && draft) return new Response(null, { status: 204 });
    const fileDelete = /^\/api\/deposit\/depositions\/(\d+)\/files\/(\d+)$/.exec(u.pathname);
    if (method === 'DELETE' && fileDelete) return new Response(null, { status: 204 });
    const publish = /^\/api\/deposit\/depositions\/(\d+)\/actions\/publish$/.exec(u.pathname);
    if (method === 'POST' && publish) {
      if (opts?.publishFails) return new Response('closed for maintenance', { status: opts.publishFails });
      return json({ doi: versionDoi, conceptdoi: conceptDoi, record_id: recordId });
    }
    const bucketPut = /^\/api\/bucket\/(\d+)\/(.+)$/.exec(u.pathname);
    if (method === 'PUT' && bucketPut) {
      const body = init?.body;
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
      uploaded.set(decodeURIComponent(bucketPut[2]), bytes);
      return json({ checksum: `md5:${md5Hex(bytes)}` });
    }
    if (method === 'GET' && u.pathname === `/api/records/${recordId}`) {
      return json({
        files: [...uploaded.entries()].map(([key, bytes]) => ({
          key,
          checksum: `md5:${md5Hex(bytes)}`,
          filesize: bytes.length,
        })),
      });
    }
    return new Response(`no mock for ${method} ${u.pathname}`, { status: 500 });
  }) as typeof fetch;
  return { fetchImpl, calls, uploaded, metadataSeen };
}

describe('findDepositionByConceptDoi', () => {
  it('picks the latest deposition carrying the concept', async () => {
    const { fetchImpl, calls } = mockZenodo({ searchHits: [{ id: 3 }, { id: 7 }] });
    await expect(
      findDepositionByConceptDoi({ apiBase: 'https://zenodo.test/api', token: 't', conceptDoi: '10.5281/zenodo.9', fetchImpl }),
    ).resolves.toBe(7);
    expect(calls[0]).toMatch(/^GET \/api\/deposit\/depositions/);
  });

  it('returns null when the concept has no deposition', async () => {
    const { fetchImpl } = mockZenodo({ searchHits: [] });
    await expect(
      findDepositionByConceptDoi({ apiBase: 'https://zenodo.test/api', token: 't', conceptDoi: '10.5281/zenodo.9', fetchImpl }),
    ).resolves.toBeNull();
  });

  it('fails loudly when the search fails', async () => {
    const fetchImpl = (async () => new Response('down', { status: 503 })) as typeof fetch;
    await expect(
      findDepositionByConceptDoi({ apiBase: 'https://zenodo.test/api', token: 't', conceptDoi: '10.5281/zenodo.9', fetchImpl }),
    ).rejects.toThrow(/search/);
  });
});

describe('depositAudit', () => {
  const pdf = new Uint8Array(Buffer.from('%PDF-1.4 fixture'));

  it('creates, uploads, sets metadata, publishes and verifies the record', async () => {
    const { fetchImpl, calls, uploaded, metadataSeen } = mockZenodo();
    const result = await depositAudit({
      apiBase: 'https://zenodo.test/api',
      token: 'token',
      metadata: { title: 'T', upload_type: 'publication' },
      files: [{ filename: 'report.pdf', data: pdf, contentType: 'application/pdf' }],
      fetchImpl,
    });
    expect(result).toEqual({ versionDoi: '10.5281/zenodo.100', conceptDoi: '10.5281/zenodo.99', recordId: 5 });
    expect(uploaded.get('report.pdf')).toEqual(pdf);
    expect(metadataSeen).toHaveLength(1);
    expect(metadataSeen[0]['metadata']).toMatchObject({ title: 'T' });
    expect(calls).toEqual([
      'POST /api/deposit/depositions',
      'GET /api/deposit/depositions/11',
      'PUT /api/bucket/11/report.pdf',
      'PUT /api/deposit/depositions/11',
      'POST /api/deposit/depositions/11/actions/publish',
      'GET /api/records/5',
    ]);
  });

  it('sends every request to the injected base and fails a checksum mismatch', async () => {
    const inner = mockZenodo();
    const lying: typeof fetch = (async (url: unknown, init?: RequestInit) => {
      const raw = String(url);
      if (!raw.startsWith('https://zenodo.test/api')) throw new Error(`unexpected zenodo host: ${raw}`);
      if (raw.includes('/api/records/')) {
        return new Response(JSON.stringify({ files: [{ key: 'report.pdf', checksum: 'md5:00000000000000000000000000000000' }] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return inner.fetchImpl(raw, init);
    }) as typeof fetch;
    await expect(
      depositAudit({
        apiBase: 'https://zenodo.test/api',
        token: 'token',
        metadata: {},
        files: [{ filename: 'report.pdf', data: pdf, contentType: 'application/pdf' }],
        fetchImpl: lying,
      }),
    ).rejects.toThrow(/checksum mismatch/);
  });

  it('routes a re-audit through newversion and replaces the inherited file', async () => {
    const { fetchImpl, calls } = mockZenodo({ inherited: [{ id: 99, filename: 'report.pdf' }] });
    await depositAudit({
      apiBase: 'https://zenodo.test/api',
      token: 'token',
      metadata: {},
      files: [{ filename: 'report.pdf', data: pdf, contentType: 'application/pdf' }],
      priorDepositionId: 7,
      fetchImpl,
    });
    expect(calls).toEqual([
      'POST /api/deposit/depositions/7/actions/newversion',
      'GET /api/deposit/depositions/12',
      'DELETE /api/deposit/depositions/12/files/99',
      'PUT /api/bucket/12/report.pdf',
      'PUT /api/deposit/depositions/12',
      'POST /api/deposit/depositions/12/actions/publish',
      'GET /api/records/5',
    ]);
  });

  it('removes the draft when publishing fails', async () => {
    const { fetchImpl, calls } = mockZenodo({ publishFails: 500 });
    await expect(
      depositAudit({
        apiBase: 'https://zenodo.test/api',
        token: 'token',
        metadata: {},
        files: [{ filename: 'report.pdf', data: pdf, contentType: 'application/pdf' }],
        fetchImpl,
      }),
    ).rejects.toThrow(/publish/);
    expect(calls).toContain('DELETE /api/deposit/depositions/11');
  });
});

// --- The operator CLI, end to end against a stub Zenodo and a fake bucket. ---

const FAKE_WRANGLER = `#!/bin/bash
echo "$@" >> "$FAKE_LOG"
file_arg() {
  local prev=""
  for a in "$@"; do
    if [ "$prev" = "--file" ]; then printf '%s' "$a"; return; fi
    prev="$a"
  done
}
if [ "$1" = "r2" ] && [ "$2" = "object" ] && [ "$3" = "put" ]; then
  key="\${4#*/}"
  mkdir -p "$FAKE_BUCKET_DIR/$(dirname "$key")"
  cp "$(file_arg "$@")" "$FAKE_BUCKET_DIR/$key"
  exit 0
fi
if [ "$1" = "r2" ] && [ "$2" = "object" ] && [ "$3" = "get" ]; then
  key="\${4#*/}"
  if [ -f "$FAKE_BUCKET_DIR/$key" ]; then
    cp "$FAKE_BUCKET_DIR/$key" "$(file_arg "$@")"
    exit 0
  else
    echo "ERROR: object not found" >&2
    exit 1
  fi
fi
echo "unknown command $*" >&2
exit 1
`;

function fakeWranglerEnv(): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(join(tmpdir(), 'audit-deposit-wrangler-'));
  writeFileSync(join(dir, 'wrangler'), FAKE_WRANGLER);
  chmodSync(join(dir, 'wrangler'), 0o755);
  writeFileSync(join(dir, 'calls.log'), '');
  return {
    dir,
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ''}`,
      FAKE_BUCKET_DIR: join(dir, 'bucket'),
      FAKE_LOG: join(dir, 'calls.log'),
    },
  };
}

/** Run the CLI without blocking the event loop: the Zenodo stub lives in
 *  this process, so a blocking spawn (execFileSync) would starve it and
 *  every fetch would hang until it times out. */
function runDeposit(args: string[], env: NodeJS.ProcessEnv, input?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    // Note: ExecFileOptions carries no `input` field, so stdin is written
    // through the returned handle instead.
    const child = execFile(
      process.execPath,
      ['scripts/audit.ts', ...args],
      { env, cwd: join(__dirname, '..', '..'), encoding: 'utf8' },
      (err: unknown, stdout: unknown, stderr: unknown) => {
        if (err) {
          // execFile reports the exit through `code`, not `status`.
          const e = err as { code?: unknown; status?: unknown };
          const code = typeof e.code === 'number' ? e.code : typeof e.status === 'number' ? e.status : 99;
          resolve({ code, out: `${String(stdout ?? '')}${String(stderr ?? '')}` });
        } else {
          resolve({ code: 0, out: String(stdout) });
        }
      },
    );
    child.stdin?.end(input ?? '');
  });
}

/** A stub Zenodo speaking just enough of the API for the deposit command. */
async function startStub(opts?: {
  conceptDoi?: string;
  versionDoi?: string;
  searchHits?: { id: number }[];
  inherited?: { id: number; filename: string }[];
}): Promise<{ base: string; calls: string[]; uploaded: Map<string, Uint8Array>; close: () => Promise<void> }> {
  const calls: string[] = [];
  const uploaded = new Map<string, Uint8Array>();
  const versionDoi = opts?.versionDoi ?? '10.5281/zenodo.100';
  const conceptDoi = opts?.conceptDoi ?? '10.5281/zenodo.99';
  const json = (res: import('node:http').ServerResponse, body: unknown, status = 200): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server: Server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://stub');
    calls.push(`${req.method} ${u.pathname}`);
    if (req.method === 'POST' && u.pathname === '/api/deposit/depositions') {
      req.resume();
      json(res, { id: 11, links: { bucket: `http://127.0.0.1:${(server.address() as { port: number }).port}/api/bucket/11` } }, 201);
    } else if (req.method === 'GET' && u.pathname === '/api/deposit/depositions') {
      json(res, opts?.searchHits ?? []);
    } else if (req.method === 'POST' && /^\/api\/deposit\/depositions\/\d+\/actions\/newversion$/.test(u.pathname)) {
      req.resume();
      json(res, {
        id: 12,
        links: { bucket: `http://127.0.0.1:${(server.address() as { port: number }).port}/api/bucket/12` },
        files: opts?.inherited ?? [],
      }, 201);
    } else if (req.method === 'GET' && /^\/api\/deposit\/depositions\/\d+$/.test(u.pathname)) {
      json(res, { id: 11, files: opts?.inherited ?? [] });
    } else if (req.method === 'PUT' && /^\/api\/deposit\/depositions\/\d+$/.test(u.pathname)) {
      req.resume();
      json(res, { id: 11 });
    } else if (req.method === 'DELETE' && u.pathname.startsWith('/api/deposit/depositions/')) {
      req.resume();
      res.writeHead(204);
      res.end();
    } else if (req.method === 'POST' && /\/actions\/publish$/.test(u.pathname)) {
      req.resume();
      json(res, { doi: versionDoi, conceptdoi: conceptDoi, record_id: 5 });
    } else if (req.method === 'GET' && u.pathname === '/api/records/5') {
      json(res, {
        files: [...uploaded.entries()].map(([key, bytes]) => ({
          key,
          checksum: `md5:${md5Hex(bytes)}`,
          filesize: bytes.length,
        })),
      });
    } else if (req.method === 'PUT' && u.pathname.startsWith('/api/bucket/')) {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        uploaded.set(decodeURIComponent(u.pathname.split('/').pop() ?? ''), Buffer.concat(chunks));
        json(res, {});
      });
    } else {
      req.resume();
      res.writeHead(500);
      res.end(`no stub for ${req.method} ${u.pathname}`);
    }
  });
  await new Promise<void>((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
  const port = (server.address() as { port: number }).port;
  return {
    base: `http://127.0.0.1:${port}/api`,
    calls,
    uploaded,
    close: () => new Promise<void>((resolveClose, rejectClose) => server.close((e) => (e ? rejectClose(e) : resolveClose()))),
  };
}

function depositableFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'audit-deposit-folder-'));
  cpSync(FIXTURE_DIR, folder, { recursive: true });
  writeFileSync(join(folder, 'audit.json'), JSON.stringify(depositableDoc()));
  return folder;
}

describe('deposit command', () => {
  it('prints the plan, asks before publishing, and writes the DOIs back', async () => {
    const stub = await startStub();
    const { dir, env } = fakeWranglerEnv();
    const folder = depositableFolder();
    try {
      const { code, out } = await runDeposit(
        ['deposit', folder, '--slug', 'doi-slug'],
        { ...env, ZENODO_TOKEN: 'operator-token', ZENODO_API_BASE: stub.base },
        'y\n',
      );
      expect(code).toBe(0);
      expect(out).toContain('sandbox.zenodo.org');
      expect(out).toContain('report.pdf');
      expect(out).toContain('chart-data.json');
      expect(out).toContain('snippet.py');
      expect(out).not.toContain('clip.mp4');
      expect(out).toContain('Deposited audit');
      expect(out).toContain('10.5281/zenodo.100');
      // Only the PDF and the public annex files cross the wire.
      expect([...stub.uploaded.keys()].sort()).toEqual(['chart-data.json', 'report.pdf', 'snippet.py']);
      // The DOIs land in the folder document and back in R2.
      const written = JSON.parse(readFileSync(join(folder, 'audit.json'), 'utf8')) as Doc;
      expect((written['deposit'] as Doc)).toMatchObject({
        versionDoi: '10.5281/zenodo.100',
        conceptDoi: '10.5281/zenodo.99',
        consent: true,
      });
      expect(typeof (written['deposit'] as Doc)['depositedAt']).toBe('string');
      const remote = JSON.parse(readFileSync(join(dir, 'bucket', 'doi-slug', 'audit.json'), 'utf8')) as Doc;
      expect((remote['deposit'] as Doc)).toMatchObject({ versionDoi: '10.5281/zenodo.100' });
    } finally {
      rmSync(folder, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
      await stub.close();
    }
  });

  it('publishes nothing when the operator does not confirm', async () => {
    const stub = await startStub();
    const { dir, env } = fakeWranglerEnv();
    const folder = depositableFolder();
    try {
      const before = readFileSync(join(folder, 'audit.json'), 'utf8');
      const { code, out } = await runDeposit(
        ['deposit', folder, '--slug', 'abort-slug'],
        { ...env, ZENODO_TOKEN: 'operator-token', ZENODO_API_BASE: stub.base },
        'n\n',
      );
      expect(code).toBe(1);
      expect(out).toContain('Aborted');
      expect(stub.calls).not.toContain('POST /api/deposit/depositions');
      expect(readFileSync(join(folder, 'audit.json'), 'utf8')).toBe(before);
      expect(existsSync(join(dir, 'bucket', 'abort-slug', 'audit.json'))).toBe(false);
    } finally {
      rmSync(folder, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
      await stub.close();
    }
  });

  it('routes a re-audit to a new version under the earlier concept', async () => {
    const stub = await startStub({ searchHits: [{ id: 77 }], conceptDoi: '10.5281/zenodo.77', versionDoi: '10.5281/zenodo.78' });
    const { dir, env } = fakeWranglerEnv();
    const folder = depositableFolder();
    try {
      // The earlier audit lives in R2 carrying its concept DOI.
      const prev = depositableDoc();
      (prev['deposit'] as Doc)['versionDoi'] = '10.5281/zenodo.76';
      (prev['deposit'] as Doc)['conceptDoi'] = '10.5281/zenodo.77';
      const prevDir = join(dir, 'bucket', 'prev-slug');
      cpSync(FIXTURE_DIR, prevDir, { recursive: true });
      writeFileSync(join(prevDir, 'audit.json'), JSON.stringify(prev));
      const doc = JSON.parse(readFileSync(join(folder, 'audit.json'), 'utf8')) as Doc;
      ((doc['badge'] as Doc))['previous'] = 'prev-slug';
      writeFileSync(join(folder, 'audit.json'), JSON.stringify(doc));
      const { code, out } = await runDeposit(
        ['deposit', folder, '--slug', 'reaudit-slug'],
        { ...env, ZENODO_TOKEN: 'operator-token', ZENODO_API_BASE: stub.base },
        'y\n',
      );
      expect(code).toBe(0);
      expect(stub.calls).toContain('POST /api/deposit/depositions/77/actions/newversion');
      expect(out).toContain('10.5281/zenodo.77');
      const written = JSON.parse(readFileSync(join(folder, 'audit.json'), 'utf8')) as Doc;
      expect((written['deposit'] as Doc)).toMatchObject({
        versionDoi: '10.5281/zenodo.78',
        conceptDoi: '10.5281/zenodo.77',
      });
    } finally {
      rmSync(folder, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
      await stub.close();
    }
  });

  it('refuses a private audit before touching the network', async () => {
    const stub = await startStub();
    const { dir, env } = fakeWranglerEnv();
    const folder = depositableFolder();
    try {
      const doc = JSON.parse(readFileSync(join(folder, 'audit.json'), 'utf8')) as Doc;
      doc['visibility'] = 'private';
      (doc as Doc)['access'] = { emails: ['reader@example.com'] };
      writeFileSync(join(folder, 'audit.json'), JSON.stringify(doc));
      const { code, out } = await runDeposit(
        ['deposit', folder, '--slug', 'private-slug'],
        { ...env, ZENODO_TOKEN: 'operator-token', ZENODO_API_BASE: stub.base },
        'y\n',
      );
      expect(code).toBe(1);
      expect(out).toMatch(/private/);
      expect(stub.calls).toEqual([]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
      await stub.close();
    }
  });

  it('needs the token from the environment and rejects unknown flags', async () => {
    const stub = await startStub();
    const { dir, env } = fakeWranglerEnv();
    const folder = depositableFolder();
    try {
      const { code, out } = await runDeposit(['deposit', folder], { ...env, ZENODO_API_BASE: stub.base }, 'y\n');
      expect(code).toBe(1);
      expect(out).toMatch(/ZENODO_TOKEN/);

      const bad = await runDeposit(['deposit', folder, '--sandboxx'], env, 'y\n');
      expect(bad.code).toBe(2);
      expect(bad.out).toContain('unknown flag');
    } finally {
      rmSync(folder, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
      await stub.close();
    }
  });
});
