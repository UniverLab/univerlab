/**
 * The control-room audit intake: a new audit reaches the site through
 * POST /api/admin-audits/upload — init and finalize as JSON bodies, each
 * file as the raw request body — checked against the catalogue as each
 * file is stored and always stored private. The real handler runs over a
 * fake bucket; both intake paths (a folder's files and a .zip's bytes)
 * are exercised end to end.
 *
 * @jest-environment node
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';
import { handleAdminUpload, type AdminDeps, type AdminEnv } from '../lib/admin/handlers';
import { listAdminAudits, loadAdminAuditDoc, resolveAdminAudit, type AdminR2Bucket } from '../lib/admin/summary';
import { auditContentType } from '../lib/audit/content-type';
import {
  auditRoutePrefix,
  findEditionSystem,
  listEditions,
  listPublicAudits,
  loadAuditDoc,
  resolveAuditEdition,
  type AuditR2Bucket as EdgeBucket,
} from '../../functions/audit-editions';
import {
  deriveEdition,
  deriveSystem,
  forcePrivate,
  formatEdition,
  parseZipCentralDirectory,
  proposeAuditTarget,
  proposeTarget,
  unwrapZipRoot,
  validateUploadEntries,
  MAX_FILE,
  MAX_FILES,
  type UploadFile,
} from '../lib/admin/upload';
import { formatBytes } from '../lib/audit/util';

const FIXTURE = resolve(__dirname, 'fixtures', 'audit-contract', 'audit.json');
const ASSETS = resolve(__dirname, 'fixtures', 'audit-contract');
const OWNER = 'owner@univerlab.org';

type Doc = Record<string, unknown>;

function fixtureDoc(): Doc {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Doc;
}

/** A valid private document with a badge date, like a real upload. */
function uploadDoc(issued: string, mutate?: (doc: Doc) => void): Doc {
  const doc = fixtureDoc();
  doc['badge'] = { issued, scope: 'Upload fixture' };
  if (mutate) mutate(doc);
  return forcePrivate(doc, OWNER);
}

function assetBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(ASSETS, path)));
}

function uploadFiles(doc: Doc, extra: UploadFile[] = []): UploadFile[] {
  const files: UploadFile[] = [
    { name: 'audit.json', bytes: new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`) },
  ];
  for (const a of (doc['assets'] as { path: string }[])) {
    files.push({ name: a.path, bytes: assetBytes(a.path) });
  }
  return [...files, ...extra];
}

function makeBucket(): AdminR2Bucket & { files: Map<string, Uint8Array>; contentTypes: Map<string, string | undefined> } {
  const files = new Map<string, Uint8Array>();
  const contentTypes = new Map<string, string | undefined>();
  return {
    files,
    contentTypes,
    async get(key: string) {
      const bytes = files.get(key);
      if (!bytes) return null;
      return {
        text: async () => new TextDecoder().decode(bytes),
        arrayBuffer: async () => Uint8Array.from(bytes).buffer as ArrayBuffer,
      };
    },
    async put(key: string, value: Uint8Array | ArrayBuffer | string, opts?: { httpMetadata?: { contentType?: string } }) {
      if (typeof value === 'string') files.set(key, new TextEncoder().encode(value));
      else if (value instanceof Uint8Array) files.set(key, Uint8Array.from(value));
      else files.set(key, new Uint8Array(value));
      contentTypes.set(key, opts?.httpMetadata?.contentType);
    },
    async delete(key: string) {
      files.delete(key);
      contentTypes.delete(key);
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

function post(token: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  return new Request('https://univerlab.org/api/admin-audits/upload', { method: 'POST', headers, body: JSON.stringify(body) });
}

/** One file travels as the raw request body on the query-string step. */
function postFile(token: string | null, uploadId: string, name: string, bytes: Uint8Array): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  const url = `https://univerlab.org/api/admin-audits/upload?action=file&uploadId=${encodeURIComponent(uploadId)}&name=${encodeURIComponent(name)}`;
  return new Request(url, { method: 'POST', headers, body: bytes as unknown as BodyInit });
}

async function respond(res: Response): Promise<{ status: number; data: Record<string, unknown> }> {
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
}

/** Drive the whole intake the way the panel does: init, one file per
 *  request, finalize. */
async function uploadAll(
  bucket: AdminR2Bucket,
  token: string | null,
  initBody: Record<string, unknown>,
  files: UploadFile[],
  replace = false,
): Promise<{ status: number; data: Record<string, unknown>; uploadId: string }> {
  const init = await respond(await handleAdminUpload(post(token, { action: 'init', ...initBody }), envOf(bucket), deps));
  const uploadId = String(init.data['uploadId'] ?? '');
  for (const file of files) {
    const sent = await respond(await handleAdminUpload(postFile(token, uploadId, file.name, file.bytes), envOf(bucket), deps));
    if (sent.status !== 200) return { ...sent, uploadId };
  }
  const fin = await respond(
    await handleAdminUpload(post(token, { action: 'finalize', uploadId, ...(replace ? { replace: true } : {}) }), envOf(bucket), deps),
  );
  return { ...fin, uploadId };
}

// --- A minimal .zip writer for the tests (stored + deflate). ---

function crc32(bytes: Uint8Array): number {
  let table = (crc32 as { table?: number[] }).table;
  if (!table) {
    table = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as { table?: number[] }).table = table;
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}

function u32(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A .zip holding the files: `deflate` names are compressed with
 *  deflate-raw, every other name is stored. */
function makeZip(files: UploadFile[], deflate: string[] = []): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const raw = file.bytes;
    const comp = deflate.includes(file.name) ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = deflate.includes(file.name) ? 8 : 0;
    const local = concat([
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0x0800),
      u16(method),
      u16(0),
      u16(0),
      u32(crc32(raw)),
      u32(comp.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      name,
      comp,
    ]);
    locals.push(local);
    centrals.push(
      concat([
        new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(method),
        u16(0),
        u16(0),
        u32(crc32(raw)),
        u32(comp.length),
        u32(raw.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const cd = concat(centrals);
  const cdOffset = offset;
  return concat([
    ...locals,
    cd,
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(cd.length),
    u32(cdOffset),
    u16(0),
  ]);
}

describe('upload naming rules', () => {
  it('derives the system by stripping the audit date, like the CLI', () => {
    expect(deriveSystem('canopy-2026-11')).toBe('canopy');
    expect(deriveSystem('canopy-2026-11-25')).toBe('canopy');
    expect(deriveEdition('canopy-2026-11')).toBe('canopy-2026-11');
    expect(deriveSystem('canopy')).toBe('canopy');
    expect(proposeTarget('canopy-2026-11')).toEqual({ system: 'canopy', edition: 'canopy-2026-11' });
    expect(proposeTarget('../escape')).toBeNull();
  });

  it('always stores the document as private with the owner allowlisted', () => {
    const pub = fixtureDoc();
    expect(pub['visibility']).toBe('public');
    const stored = forcePrivate(pub, OWNER);
    expect(stored['visibility']).toBe('private');
    expect((stored['access'] as { emails: string[] }).emails).toEqual([OWNER]);
    const already = uploadDoc('2026-01-01');
    (already['access'] as { emails: string[] }).emails = ['reader@example.com'];
    expect((forcePrivate(already, OWNER)['access'] as { emails: string[] }).emails).toEqual(['reader@example.com']);
  });
});

describe('zip intake path', () => {
  it('reads stored and deflated entries out of a .zip', async () => {
    const doc = uploadDoc('2026-03-01');
    const files = uploadFiles(doc);
    const zip = makeZip(files, ['audit.json']);
    const parsed = await parseZipCentralDirectory(zip);
    expect(parsed.map((f) => f.name).sort()).toEqual(files.map((f) => f.name).sort());
    for (const file of files) {
      const back = parsed.find((f) => f.name === file.name)!;
      expect(Buffer.from(back.bytes).toString('hex')).toBe(Buffer.from(file.bytes).toString('hex'));
    }
  });

  it('refuses what is not a plain .zip', async () => {
    await expect(parseZipCentralDirectory(new TextEncoder().encode('not a zip'))).rejects.toThrow();
    const doc = uploadDoc('2026-03-01');
    const files = uploadFiles(doc);
    const zip = makeZip(files);
    // A comment appended past the end of the central directory corrupts it.
    await expect(parseZipCentralDirectory(concat([zip, new Uint8Array([1, 2, 3])]))).rejects.toThrow();
  });

  it('unwraps a .zip whose entries sit inside the audit folder', async () => {
    const doc = uploadDoc('2026-03-01');
    const nested = uploadFiles(doc).map((f) => ({ name: `canopy-2026-11/${f.name}`, bytes: f.bytes }));
    const parsed = unwrapZipRoot(await parseZipCentralDirectory(makeZip(nested, ['canopy-2026-11/audit.json'])));
    expect(parsed.some((f) => f.name === 'audit.json')).toBe(true);
    expect(parsed.some((f) => f.name === 'assets/report.pdf')).toBe(true);
  });

  it('uploads a .zip read through the real handler', async () => {
    const bucket = makeBucket();
    const doc = uploadDoc('2026-03-01');
    const parsed = await parseZipCentralDirectory(makeZip(uploadFiles(doc), ['audit.json']));
    const done = await uploadAll(bucket, 'owner-jwt', { folder: 'canopy-2026-11' }, parsed);
    expect(done.status).toBe(200);
    expect(done.data['system']).toBe('canopy');
    expect(done.data['edition']).toBe('canopy-2026-11');
    expect(done.data['href']).toBe('/audits/canopy/canopy-2026-11/');
    const stored = await loadAdminAuditDoc(bucket, 'canopy/canopy-2026-11');
    expect(stored?.visibility).toBe('private');
  });
});

describe('accepted folder upload', () => {
  it('stores the edition private, lists it with its link, latest first', async () => {
    const bucket = makeBucket();
    const done = await uploadAll(bucket, 'owner-jwt', { folder: 'canopy-2026-11' }, uploadFiles(uploadDoc('2026-11-01')));
    expect(done.status).toBe(200);
    expect(done.data['ok']).toBe(true);
    const stored = await loadAdminAuditDoc(bucket, 'canopy/canopy-2026-11');
    expect(stored?.visibility).toBe('private');
    expect(stored?.access?.emails).toEqual([OWNER]);
    // A public document stays private: publishing is a separate action.
    const pub = fixtureDoc();
    pub['badge'] = { issued: '2026-10-01', scope: 'Upload fixture' };
    const older = await uploadAll(bucket, 'owner-jwt', { system: 'canopy', edition: 'canopy-2026-10' }, uploadFiles(pub));
    expect(older.status).toBe(200);
    const rows = await listAdminAudits(bucket);
    expect(rows.map((r) => r.edition)).toEqual(['canopy-2026-11', 'canopy-2026-10']);
    expect(rows[0].isLatest).toBe(true);
    expect(rows[0].slug).toBe('canopy-2026-11');
    expect(rows[0].title).toBe('Contract fixture audit (not a real audit)');
    // The system's own address serves the latest edition.
    expect((await resolveAdminAudit(bucket, 'canopy'))?.edition).toBe('canopy-2026-11');
  });

  it('accepts explicit system and edition names', async () => {
    const bucket = makeBucket();
    const done = await uploadAll(bucket, 'owner-jwt', { system: 'acme', edition: 'acme-2026-01' }, uploadFiles(uploadDoc('2026-01-02')));
    expect(done.status).toBe(200);
    expect(await loadAdminAuditDoc(bucket, 'acme/acme-2026-01')).not.toBeNull();
  });
});

describe('upload auth', () => {
  it('refuses every step without a token and to a non-owner', async () => {
    const bucket = makeBucket();
    const initAnon = await respond(await handleAdminUpload(post(null, { action: 'init', folder: 'x' }), envOf(bucket), deps));
    expect(initAnon.status).toBe(401);
    const initStranger = await respond(
      await handleAdminUpload(post('stranger-jwt', { action: 'init', folder: 'x' }), envOf(bucket), deps),
    );
    expect(initStranger.status).toBe(403);
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'x' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const fileAnon = await respond(
      await handleAdminUpload(postFile(null, uploadId, 'audit.json', new Uint8Array([1])), envOf(bucket), deps),
    );
    expect(fileAnon.status).toBe(401);
    const fileStranger = await respond(
      await handleAdminUpload(postFile('stranger-jwt', uploadId, 'audit.json', new Uint8Array([1])), envOf(bucket), deps),
    );
    expect(fileStranger.status).toBe(403);
    const finAnon = await respond(
      await handleAdminUpload(post(null, { action: 'finalize', uploadId }), envOf(bucket), deps),
    );
    expect(finAnon.status).toBe(401);
  });
});

describe('upload refusals store nothing', () => {
  it('rejects a document that breaks the contract, naming each path', async () => {
    const bucket = makeBucket();
    const bad = uploadDoc('2026-01-01', (doc) => {
      delete (doc['meta'] as Doc)['title'];
    });
    const done = await uploadAll(bucket, 'owner-jwt', { system: 'bad', edition: 'bad-1' }, uploadFiles(bad));
    expect(done.status).toBe(422);
    const issues = done.data['issues'] as { path: string; message: string }[];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].path).toBeTruthy();
    expect(await loadAdminAuditDoc(bucket, 'bad/bad-1')).toBeNull();
    expect(await listAdminAudits(bucket)).toEqual([]);
  });

  it('rejects names that escape the folder at the file step and deletes the staging', async () => {
    const bucket = makeBucket();
    for (const name of ['../evil.json', '/abs.json', 'a\\b.json', 'a/../b.json']) {
      const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'esc' }), envOf(bucket), deps));
      const uploadId = String(init.data['uploadId']);
      const sent = await respond(
        await handleAdminUpload(postFile('owner-jwt', uploadId, name, new Uint8Array([1])), envOf(bucket), deps),
      );
      expect(sent.status).toBe(400);
      expect(sent.data['error']).toBe('escape');
      // The refused upload leaves no staged file and no manifest behind.
      expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
    }
    expect(await listAdminAudits(bucket)).toEqual([]);
  });

  it('rejects an escaped catalogue path and an unlisted file at finalize', async () => {
    const bucket = makeBucket();
    const escaped = uploadDoc('2026-01-01');
    const evilFiles = uploadFiles(escaped);
    (escaped['assets'] as Doc[]).push({ id: 'evil', path: '../escape.svg', kind: 'data', title: 'Evil', bytes: 1, sha256: '0'.repeat(64) });
    evilFiles[0] = { name: 'audit.json', bytes: new TextEncoder().encode(`${JSON.stringify(escaped, null, 2)}\n`) };
    const done = await uploadAll(bucket, 'owner-jwt', { system: 'esc', edition: 'esc-1' }, evilFiles);
    expect(done.status).toBe(422);
    expect(JSON.stringify(done.data['issues'])).toContain('escapes');

    const bucket2 = makeBucket();
    const listed = await uploadAll(
      bucket2,
      'owner-jwt',
      { system: 'extra', edition: 'extra-1' },
      uploadFiles(uploadDoc('2026-01-01'), [{ name: 'notes.txt', bytes: new TextEncoder().encode('not catalogued') }]),
    );
    expect(listed.status).toBe(422);
    expect(JSON.stringify(listed.data['issues'])).toContain('not in the catalogue');
    expect(await listAdminAudits(bucket2)).toEqual([]);
  });

  it('rejects more than 300 files', async () => {
    const bucket = makeBucket();
    const doc = uploadDoc('2026-01-01');
    const base = uploadFiles(doc).filter((f) => f.name !== 'audit.json');
    const extras: UploadFile[] = [];
    for (let i = 0; i < MAX_FILES; i += 1) {
      const bytes = new Uint8Array([i % 256]);
      extras.push({ name: `extra-${i}.txt`, bytes });
      (doc['assets'] as Doc[]).push({
        id: `extra-${i}`,
        path: `extra-${i}.txt`,
        kind: 'data',
        title: `Extra ${i}`,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    const files = [
      { name: 'audit.json', bytes: new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`) },
      ...base,
      ...extras,
    ];
    const done = await uploadAll(bucket, 'owner-jwt', { system: 'many', edition: 'many-1' }, files);
    expect(done.status).toBe(422);
    expect(JSON.stringify(done.data['issues'])).toContain(String(MAX_FILES));
    expect(await listAdminAudits(bucket)).toEqual([]);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
  });

  it('rejects one file over 25 MB at the file step and deletes the staging', async () => {
    const bucket = makeBucket();
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'big' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const sent = await respond(
      await handleAdminUpload(postFile('owner-jwt', uploadId, 'big.bin', new Uint8Array(MAX_FILE + 1)), envOf(bucket), deps),
    );
    expect(sent.status).toBe(413);
    expect(await listAdminAudits(bucket)).toEqual([]);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
  });

  it('rejects a total over 200 MB', async () => {
    const oversized = { name: 'big.bin', bytes: { length: 200 * 1024 * 1024 } as unknown as Uint8Array };
    const issues = await validateUploadEntries(
      [{ name: 'audit.json', bytes: new Uint8Array([1]) }, oversized],
      { assets: [] },
    );
    expect(issues.some((i) => i.message.includes('in total'))).toBe(true);
  });

  it('rejects a hash and a size that do not match the catalogue', async () => {
    const bucket = makeBucket();
    const doc = uploadDoc('2026-01-01');
    const files = uploadFiles(doc);
    const target = files.find((f) => f.name !== 'audit.json')!;
    target.bytes = new TextEncoder().encode('tampered bytes, wrong hash and size');
    const done = await uploadAll(bucket, 'owner-jwt', { system: 'tampered', edition: 'tampered-1' }, files);
    expect(done.status).toBe(422);
    expect(JSON.stringify(done.data['issues'])).toContain('hash does not match');
    expect(await listAdminAudits(bucket)).toEqual([]);
  });

  it('rejects a tampered file at the file step, once audit.json is staged', async () => {
    const bucket = makeBucket();
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'early-2026-01' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const doc = uploadDoc('2026-01-01');
    const staged = await respond(
      await handleAdminUpload(
        postFile('owner-jwt', uploadId, 'audit.json', new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`)),
        envOf(bucket),
        deps,
      ),
    );
    expect(staged.status).toBe(200);
    const target = uploadFiles(doc).find((f) => f.name !== 'audit.json')!;
    const sent = await respond(
      await handleAdminUpload(
        postFile('owner-jwt', uploadId, target.name, new TextEncoder().encode('tampered bytes, wrong hash and size')),
        envOf(bucket),
        deps,
      ),
    );
    expect(sent.status).toBe(422);
    expect(JSON.stringify(sent.data['issues'])).toContain('hash does not match');
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
  });

  it('rejects a missing audit.json without storing and deletes the staging', async () => {
    const bucket = makeBucket();
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'nojson' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    await handleAdminUpload(
      postFile('owner-jwt', uploadId, 'notes.txt', new TextEncoder().encode('x')),
      envOf(bucket),
      deps,
    );
    const fin = await respond(await handleAdminUpload(post('owner-jwt', { action: 'finalize', uploadId }), envOf(bucket), deps));
    expect(fin.status).toBe(400);
    expect(await listAdminAudits(bucket)).toEqual([]);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
  });
});

describe('existing editions and half-finished uploads', () => {
  it('asks before replacing, then replaces without stale files', async () => {
    const bucket = makeBucket();
    const first = await uploadAll(bucket, 'owner-jwt', { system: 'sys', edition: 'ed-1' }, uploadFiles(uploadDoc('2026-01-01')));
    expect(first.status).toBe(200);
    bucket.files.set('sys/ed-1/old-report.pdf', new TextEncoder().encode('superseded'));
    const again = await uploadAll(bucket, 'owner-jwt', { system: 'sys', edition: 'ed-1' }, uploadFiles(uploadDoc('2026-02-01')));
    expect(again.status).toBe(409);
    expect(again.data['error']).toBe('exists');
    // The refused replace changed nothing.
    expect((await loadAdminAuditDoc(bucket, 'sys/ed-1'))?.badge?.issued).toBe('2026-01-01');
    const replaced = await uploadAll(bucket, 'owner-jwt', { system: 'sys', edition: 'ed-1' }, uploadFiles(uploadDoc('2026-02-01')), true);
    expect(replaced.status).toBe(200);
    expect(replaced.data['replaced']).toBe(true);
    expect((await loadAdminAuditDoc(bucket, 'sys/ed-1'))?.badge?.issued).toBe('2026-02-01');
    expect(bucket.files.has('sys/ed-1/old-report.pdf')).toBe(false);
  });

  it('leaves no edition visible when the upload stops half way, then retries fresh', async () => {
    const bucket = makeBucket();
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'half-2026-01' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const doc = uploadDoc('2026-01-01');
    await handleAdminUpload(
      postFile('owner-jwt', uploadId, 'audit.json', new TextEncoder().encode(JSON.stringify(doc))),
      envOf(bucket),
      deps,
    );
    // The assets never arrived and finalize was never called: no row, no address.
    expect(await listAdminAudits(bucket)).toEqual([]);
    expect(await resolveAdminAudit(bucket, 'half/half-2026-01')).toBeNull();
    expect(await loadAdminAuditDoc(bucket, 'half/half-2026-01')).toBeNull();
    // A failed finalize stores nothing and deletes the staging at once, so
    // the retry starts a fresh upload.
    const bad = await respond(await handleAdminUpload(post('owner-jwt', { action: 'finalize', uploadId }), envOf(bucket), deps));
    expect(bad.status).toBe(422);
    expect(await listAdminAudits(bucket)).toEqual([]);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
    const retry = await uploadAll(bucket, 'owner-jwt', { system: 'half', edition: 'half-2026-01' }, uploadFiles(doc));
    expect(retry.status).toBe(200);
    expect((await listAdminAudits(bucket)).map((r) => r.slug)).toEqual(['half-2026-01']);
  });

  it('keeps an unrelated edition while a sibling upload fails', async () => {
    const bucket = makeBucket();
    const good = await uploadAll(bucket, 'owner-jwt', { system: 'sys', edition: 'ed-1' }, uploadFiles(uploadDoc('2026-01-01')));
    expect(good.status).toBe(200);
    const bad = uploadDoc('2026-01-02', (doc) => {
      delete (doc['meta'] as Doc)['title'];
    });
    const failed = await uploadAll(bucket, 'owner-jwt', { system: 'sys', edition: 'ed-2' }, uploadFiles(bad));
    expect(failed.status).toBe(422);
    expect((await listAdminAudits(bucket)).map((r) => r.edition)).toEqual(['ed-1']);
  });
});

describe('upload entry checks', () => {
  it('checksums staged bytes, not text', async () => {
    const sha = createHash('sha256').update(assetBytes('assets/report.pdf')).digest('hex');
    const issues = await validateUploadEntries(
      [
        { name: 'audit.json', bytes: new TextEncoder().encode('{}') },
        { name: 'assets/report.pdf', bytes: assetBytes('assets/report.pdf') },
      ],
      { assets: [{ path: 'assets/report.pdf', bytes: 206, sha256: sha }] },
    );
    expect(issues).toEqual([]);
  });
});

describe('stored content types', () => {
  it('serves each extension with the type the command-line push stores', async () => {
    expect(auditContentType('assets/report.pdf')).toBe('application/pdf');
    expect(auditContentType('assets/figure.svg')).toBe('image/svg+xml');
    expect(auditContentType('assets/figure.png')).toBe('image/png');
    expect(auditContentType('photo.jpg')).toBe('image/jpeg');
    expect(auditContentType('photo.jpeg')).toBe('image/jpeg');
    expect(auditContentType('photo.webp')).toBe('image/webp');
    expect(auditContentType('anim.gif')).toBe('image/gif');
    expect(auditContentType('photo.avif')).toBe('image/avif');
    expect(auditContentType('assets/clip.mp4')).toBe('video/mp4');
    expect(auditContentType('clip.webm')).toBe('video/webm');
    expect(auditContentType('clip.mp3')).toBe('audio/mpeg');
    expect(auditContentType('clip.ogg')).toBe('audio/ogg');
    expect(auditContentType('clip.wav')).toBe('audio/wav');
    expect(auditContentType('audit.json')).toBe('application/json; charset=utf-8');
    expect(auditContentType('archive.zip')).toBe('application/zip');
    expect(auditContentType('notes.txt')).toBe('text/plain; charset=utf-8');
    expect(auditContentType('notes.md')).toBe('text/plain; charset=utf-8');
    expect(auditContentType('assets/snippet.py')).toBe('application/octet-stream');
  });

  it('stores every uploaded file with its extension content type', async () => {
    const bucket = makeBucket();
    const done = await uploadAll(bucket, 'owner-jwt', { system: 'ct', edition: 'ct-1' }, uploadFiles(uploadDoc('2026-01-01')));
    expect(done.status).toBe(200);
    expect(bucket.contentTypes.get('ct/ct-1/audit.json')).toBe('application/json; charset=utf-8');
    expect(bucket.contentTypes.get('ct/ct-1/assets/report.pdf')).toBe('application/pdf');
    expect(bucket.contentTypes.get('ct/ct-1/assets/figure.svg')).toBe('image/svg+xml');
    expect(bucket.contentTypes.get('ct/ct-1/assets/clip.mp4')).toBe('video/mp4');
    expect(bucket.contentTypes.get('ct/ct-1/assets/chart-data.json')).toBe('application/json; charset=utf-8');
    expect(bucket.contentTypes.get('ct/ct-1/assets/snippet.py')).toBe('application/octet-stream');
  });
});

describe('staged and hidden systems stay unreachable', () => {
  /** A staged upload whose document declares public visibility: half the
   *  files are stored, finalize never ran. */
  async function stagePublicUpload(bucket: AdminR2Bucket): Promise<string> {
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'pub-2026-01' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const pub = fixtureDoc();
    pub['badge'] = { issued: '2026-01-01', scope: 'Staged fixture' };
    expect(pub['visibility']).toBe('public');
    for (const file of uploadFiles(pub)) {
      const sent = await respond(await handleAdminUpload(postFile('owner-jwt', uploadId, file.name, file.bytes), envOf(bucket), deps));
      expect(sent.status).toBe(200);
    }
    return uploadId;
  }

  it('hides a staged public document from every panel and edge route', async () => {
    const bucket = makeBucket();
    const uploadId = await stagePublicUpload(bucket);
    const edgeEnv = { AUDITS: bucket as unknown as EdgeBucket };
    // Panel routes.
    expect(await listAdminAudits(bucket)).toEqual([]);
    expect(await resolveAdminAudit(bucket, `_staging/${uploadId}`)).toBeNull();
    expect(await loadAdminAuditDoc(bucket, `_staging/${uploadId}`)).toBeNull();
    // Edge routes: listing, pages, assets, badges, twins, feeds, edition
    // lookup all read through these helpers.
    expect(await listPublicAudits(edgeEnv)).toEqual([]);
    expect(await listEditions(edgeEnv, '_staging')).toEqual([]);
    expect(await findEditionSystem(edgeEnv, uploadId)).toBeNull();
    expect(await resolveAuditEdition(edgeEnv, '_staging', null)).toBeNull();
    expect(await resolveAuditEdition(edgeEnv, '_staging', uploadId)).toBeNull();
    expect(await auditRoutePrefix(edgeEnv, '_staging', uploadId)).toBeNull();
    expect(await auditRoutePrefix(edgeEnv, '_staging', null)).toBeNull();
    expect(await loadAuditDoc(edgeEnv, `_staging/${uploadId}`)).toBeNull();
  });

  it('hides every underscore system from every panel and edge route', async () => {
    const bucket = makeBucket();
    const pub = fixtureDoc();
    pub['badge'] = { issued: '2026-01-01', scope: 'Hidden fixture' };
    const text = `${JSON.stringify(pub, null, 2)}\n`;
    bucket.files.set('_priv/ed1/audit.json', new TextEncoder().encode(text));
    const edgeEnv = { AUDITS: bucket as unknown as EdgeBucket };
    expect(await listAdminAudits(bucket)).toEqual([]);
    expect(await resolveAdminAudit(bucket, '_priv/ed1')).toBeNull();
    expect(await resolveAdminAudit(bucket, '_priv')).toBeNull();
    expect(await loadAdminAuditDoc(bucket, '_priv/ed1')).toBeNull();
    expect(await listPublicAudits(edgeEnv)).toEqual([]);
    expect(await listEditions(edgeEnv, '_priv')).toEqual([]);
    expect(await findEditionSystem(edgeEnv, 'ed1')).toBeNull();
    expect(await resolveAuditEdition(edgeEnv, '_priv', 'ed1')).toBeNull();
    expect(await auditRoutePrefix(edgeEnv, '_priv', 'ed1')).toBeNull();
    expect(await loadAuditDoc(edgeEnv, '_priv/ed1')).toBeNull();
  });
});

describe('cancelled uploads and stale sweeps', () => {
  it('deletes the staging at once when an upload is cancelled', async () => {
    const bucket = makeBucket();
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'gone-2026-01' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const doc = uploadDoc('2026-01-01');
    const sent = await respond(
      await handleAdminUpload(postFile('owner-jwt', uploadId, 'audit.json', new TextEncoder().encode(JSON.stringify(doc))), envOf(bucket), deps),
    );
    expect(sent.status).toBe(200);
    const cancelled = await respond(await handleAdminUpload(post('owner-jwt', { action: 'cancel', uploadId }), envOf(bucket), deps));
    expect(cancelled.status).toBe(200);
    expect(cancelled.data['ok']).toBe(true);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
    expect(await listAdminAudits(bucket)).toEqual([]);
  });

  it('refuses to cancel a missing upload, or another owner’s', async () => {
    const bucket = makeBucket();
    const missing = await respond(
      await handleAdminUpload(post('owner-jwt', { action: 'cancel', uploadId: '0'.repeat(32) }), envOf(bucket), deps),
    );
    expect(missing.status).toBe(404);
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'kept-2026-01' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const stranger = await respond(
      await handleAdminUpload(post('stranger-jwt', { action: 'cancel', uploadId }), envOf(bucket), deps),
    );
    expect(stranger.status).toBe(403);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).not.toEqual([]);
  });

  it('deletes uploads older than 24 hours when the next upload starts', async () => {
    const bucket = makeBucket();
    const first = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'stale-2026-01' }), envOf(bucket), deps));
    const staleId = String(first.data['uploadId']);
    const doc = uploadDoc('2026-01-01');
    await handleAdminUpload(postFile('owner-jwt', staleId, 'audit.json', new TextEncoder().encode(JSON.stringify(doc))), envOf(bucket), deps);
    const manifestKey = `_staging/${staleId}.manifest.json`;
    const manifest = JSON.parse(new TextDecoder().decode(bucket.files.get(manifestKey)!)) as Record<string, unknown>;
    manifest['createdAt'] = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    bucket.files.set(manifestKey, new TextEncoder().encode(JSON.stringify(manifest)));
    const second = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'fresh-2026-02' }), envOf(bucket), deps));
    expect(second.status).toBe(200);
    expect(bucket.files.has(manifestKey)).toBe(false);
    expect([...bucket.files.keys()].filter((k) => k.startsWith(`_staging/${staleId}/`))).toEqual([]);
    expect(bucket.files.has(`_staging/${String(second.data['uploadId'])}.manifest.json`)).toBe(true);
  });
});

describe('finalize storage failures', () => {
  it('reports the upload as stored when only the temp cleanup fails', async () => {
    const bucket = makeBucket();
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'warn-2026-01' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const doc = uploadDoc('2026-01-01');
    for (const file of uploadFiles(doc)) {
      const sent = await respond(await handleAdminUpload(postFile('owner-jwt', uploadId, file.name, file.bytes), envOf(bucket), deps));
      expect(sent.status).toBe(200);
    }
    const deleting = { ...bucket, delete: async (_key: string): Promise<void> => { throw new Error('r2 down'); } };
    const fin = await respond(await handleAdminUpload(post('owner-jwt', { action: 'finalize', uploadId }), envOf(deleting), deps));
    expect(fin.status).toBe(200);
    expect(fin.data['ok']).toBe(true);
    expect(fin.data['warning']).toBe('cleanup');
    // The edition itself is stored and readable.
    expect((await loadAdminAuditDoc(bucket, 'warn/warn-2026-01'))?.badge?.issued).toBe('2026-01-01');
  });

  it('leaves the previous edition readable when replacing fails before audit.json', async () => {
    const bucket = makeBucket();
    const first = await uploadAll(bucket, 'owner-jwt', { system: 'sys', edition: 'ed-1' }, uploadFiles(uploadDoc('2026-01-01')));
    expect(first.status).toBe(200);
    const next = uploadDoc('2026-02-01');
    const extraBytes = assetBytes('assets/report.pdf');
    const base = uploadFiles(next).filter((f) => f.name !== 'audit.json');
    (next['assets'] as Doc[]).push({
      id: 'added-pdf',
      path: 'assets/added.pdf',
      kind: 'pdf',
      title: 'Added in the re-audit',
      bytes: extraBytes.length,
      sha256: createHash('sha256').update(extraBytes).digest('hex'),
    });
    // audit.json goes last, so the staged audit.json carries the new catalogue.
    const files = [
      ...base,
      { name: 'assets/added.pdf', bytes: extraBytes },
      { name: 'audit.json', bytes: new TextEncoder().encode(`${JSON.stringify(next, null, 2)}\n`) },
    ];
    const init = await respond(
      await handleAdminUpload(post('owner-jwt', { action: 'init', system: 'sys', edition: 'ed-1' }), envOf(bucket), deps),
    );
    const uploadId = String(init.data['uploadId']);
    for (const file of files) {
      const sent = await respond(await handleAdminUpload(postFile('owner-jwt', uploadId, file.name, file.bytes), envOf(bucket), deps));
      expect(sent.status).toBe(200);
    }
    // The live audit.json put fails: nothing before it may show.
    let armed = true;
    const failing = {
      ...bucket,
      put: async (key: string, value: Uint8Array | ArrayBuffer | string, opts?: { httpMetadata?: { contentType?: string } }): Promise<void> => {
        if (armed && key === 'sys/ed-1/audit.json') throw new Error('r2 down');
        return bucket.put(key, value, opts);
      },
    };
    const fin = await respond(
      await handleAdminUpload(post('owner-jwt', { action: 'finalize', uploadId, replace: true }), envOf(failing), deps),
    );
    expect(fin.status).toBe(500);
    armed = false;
    // The previous document and every file it names still read.
    const kept = await loadAdminAuditDoc(bucket, 'sys/ed-1');
    expect(kept?.badge?.issued).toBe('2026-01-01');
    for (const path of (kept?.assets ?? []).map((a) => (a as { path: string }).path)) {
      expect(bucket.files.has(`sys/ed-1/${path}`)).toBe(true);
    }
    // The new file written before the failure is rolled back, and the
    // staging is gone.
    expect(bucket.files.has('sys/ed-1/assets/added.pdf')).toBe(false);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
  });
});

describe('failed uploads leave no staging', () => {
  it('deletes the staging when the store refuses a file', async () => {
    const bucket = makeBucket();
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'boom-2026-01' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const failing = {
      ...bucket,
      put: async (): Promise<void> => {
        throw new Error('r2 down');
      },
    };
    const sent = await respond(
      await handleAdminUpload(postFile('owner-jwt', uploadId, 'audit.json', new TextEncoder().encode('{}')), envOf(failing), deps),
    );
    expect(sent.status).toBe(500);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
  });

  it('deletes the staging when the init existence check fails', async () => {
    const bucket = makeBucket();
    const failing = {
      ...bucket,
      get: async (_key: string): Promise<null> => {
        throw new Error('r2 down');
      },
    };
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'init-2026-01' }), envOf(failing), deps));
    expect(init.status).toBe(500);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
  });

  it('deletes the staging when the finalize existence check fails', async () => {
    const bucket = makeBucket();
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'gone-2026-01' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const doc = uploadDoc('2026-01-01');
    for (const file of uploadFiles(doc)) {
      const sent = await respond(await handleAdminUpload(postFile('owner-jwt', uploadId, file.name, file.bytes), envOf(bucket), deps));
      expect(sent.status).toBe(200);
    }
    const failing = {
      ...bucket,
      get: async (key: string) => {
        if (!key.startsWith('_staging/')) throw new Error('r2 down');
        return bucket.get(key);
      },
    };
    const fin = await respond(await handleAdminUpload(post('owner-jwt', { action: 'finalize', uploadId }), envOf(failing), deps));
    expect(fin.status).toBe(500);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
    expect(await listAdminAudits(bucket)).toEqual([]);
  });

  it('deletes the staging when the finalize snapshot fails', async () => {
    const bucket = makeBucket();
    const init = await respond(await handleAdminUpload(post('owner-jwt', { action: 'init', folder: 'snap-2026-01' }), envOf(bucket), deps));
    const uploadId = String(init.data['uploadId']);
    const doc = uploadDoc('2026-01-01');
    for (const file of uploadFiles(doc)) {
      const sent = await respond(await handleAdminUpload(postFile('owner-jwt', uploadId, file.name, file.bytes), envOf(bucket), deps));
      expect(sent.status).toBe(200);
    }
    const failing = {
      ...bucket,
      list: async (options?: { prefix?: string }): Promise<{ objects: { key: string }[] }> => {
        // Only the live edition listing fails; staging still lists so the
        // failed finalize can clear it at once.
        if ((options?.prefix ?? '').startsWith('_staging/')) return bucket.list!(options);
        throw new Error('r2 down');
      },
    };
    const fin = await respond(await handleAdminUpload(post('owner-jwt', { action: 'finalize', uploadId }), envOf(failing), deps));
    expect(fin.status).toBe(500);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
    expect(await listAdminAudits(bucket)).toEqual([]);
  });

  it('proposes <system>-<YYYY-MM> editions from the issue date', () => {
    expect(formatEdition('canopy', '2026-03-15')).toBe('canopy-2026-03');
    expect(formatEdition('canopy', '2025-11-02T10:00:00Z')).toBe('canopy-2025-11');
    expect(formatEdition('canopy')).toBe('canopy');
    expect(formatEdition('canopy', '')).toBe('canopy');
    expect(formatEdition('canopy', 'not-a-date')).toBe('canopy');
  });

  it('prefers the title and the known systems over the folder name', () => {
    // A folder like `canopy-audit-es` never becomes the system when the
    // title or an existing system gives a better match.
    expect(
      proposeAuditTarget({ baseName: 'canopy-audit-es', title: 'Canopy', issued: '2026-03-15', existingSystems: ['canopy'] }),
    ).toEqual({ system: 'canopy', edition: 'canopy-2026-03' });
    // Title alone slugifies to the system when nothing is known yet.
    expect(proposeAuditTarget({ baseName: 'misc', title: 'New System', issued: '2025-11-02' })).toEqual({
      system: 'new-system',
      edition: 'new-system-2025-11',
    });
    // A known system inside the folder name beats the raw folder segment.
    expect(proposeAuditTarget({ baseName: 'canopy-audit-es', existingSystems: ['canopy'] })).toEqual({
      system: 'canopy',
      edition: 'canopy',
    });
    // A bare folder name with generic suffixes never becomes the system
    // when there is no better match: strip the suffixes.
    expect(proposeAuditTarget({ baseName: 'canopy-audit-es', issued: '2026-03-15' })).toEqual({
      system: 'canopy',
      edition: 'canopy-2026-03',
    });
    expect(proposeAuditTarget({ baseName: 'canopy-audit-en' })).toEqual({
      system: 'canopy',
      edition: 'canopy',
    });
    // Without title or date the folder rule still applies.
    expect(proposeAuditTarget({ baseName: 'canopy-2026-03' })).toEqual({ system: 'canopy', edition: 'canopy-2026-03' });
    expect(proposeAuditTarget({ baseName: '!!!' })).toBeNull();
  });

  it('formats bytes with the locale decimal separator when asked', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1572864)).toBe('1.5 MB');
    expect(formatBytes(1572864, 'en')).toBe('1.5 MB');
    expect(formatBytes(1572864, 'es')).toBe('1,5 MB');
  });

  it('keys every upload problem with a stable code', async () => {
    const issues = await validateUploadEntries([], uploadDoc('2026-01-01'));
    const missing = issues.find((i) => i.code === 'audit-missing');
    expect(missing).toBeDefined();
    expect(missing?.path).toBe('audit.json');
    expect(missing?.params).toBeUndefined();
  });

  it('deletes the staging when the replace is refused as existing', async () => {
    const bucket = makeBucket();
    const first = await uploadAll(bucket, 'owner-jwt', { system: 'sys', edition: 'ed-1' }, uploadFiles(uploadDoc('2026-01-01')));
    expect(first.status).toBe(200);
    const again = await uploadAll(bucket, 'owner-jwt', { system: 'sys', edition: 'ed-1' }, uploadFiles(uploadDoc('2026-02-01')));
    expect(again.status).toBe(409);
    expect([...bucket.files.keys()].filter((k) => k.startsWith('_staging/'))).toEqual([]);
    expect((await loadAdminAuditDoc(bucket, 'sys/ed-1'))?.badge?.issued).toBe('2026-01-01');
  });
});
