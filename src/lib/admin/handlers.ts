// The admin API core (FR2, FR3, FR4): list every audit, flip visibility and
// remove an audit. Pure orchestration over injected dependencies — the Pages
// Function files under functions/api/ are thin adapters, so these handlers
// run unchanged in jest with a fake bucket and a stub verifier.

import { validateAuditDocument } from '../audit/validate-document';
import { auditContentType } from '../audit/content-type';
import { isOwnerEmail, readToken } from '../sign/handlers';
import { ADMIN_SLUG_RE, listAdminAudits, publishRefusal, resolveAdminAudit, type AdminR2Bucket } from './summary';
import {
  ADMIN_UPLOAD_SLUG_RE,
  forcePrivate,
  proposeTarget,
  uploadNameEscapes,
  MAX_FILE,
  MAX_FILES,
  MAX_TOTAL,
  type UploadIssue,
} from './upload';

export interface AdminEnv {
  AUDITS?: AdminR2Bucket;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  SIGN_OWNER_EMAILS?: string;
}

export interface AdminDeps {
  verify: (token: string, env: { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string }) => Promise<string | null>;
}

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

async function authedEmail(request: Request, env: AdminEnv, deps: AdminDeps): Promise<string | null> {
  const token = readToken(request);
  if (!token) return null;
  return deps.verify(token, env);
}

/** The acting owner's email, or the denial response when the caller is not
 *  the owner. Every admin route goes through here. */
async function authedOwner(request: Request, env: AdminEnv, deps: AdminDeps): Promise<string | Response> {
  const email = await authedEmail(request, env, deps);
  if (!email) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isOwnerEmail(email, env)) return json({ ok: false, error: 'forbidden' }, 403);
  if (!env.AUDITS) return json({ ok: false, error: 'unavailable' }, 503);
  return email;
}

/** GET /api/admin-audits: every audit in the bucket as panel rows. */
export async function handleListAudits(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  const owner = await authedOwner(request, env, deps);
  if (typeof owner !== 'string') return owner;
  const audits = await listAdminAudits(env.AUDITS);
  return json({ ok: true, audits });
}

/** The audit a visibility or remove body addresses: `{ system, edition }`
 *  names one edition, `{ slug }` names a legacy bare slug or a bare system
 *  (its newest edition) for compatibility. Null when the shape is invalid. */
function addressOf(body: Record<string, unknown>): string | null {
  const system = typeof body['system'] === 'string' ? body['system'] : null;
  const edition = typeof body['edition'] === 'string' ? body['edition'] : null;
  if (system !== null) {
    if (!ADMIN_SLUG_RE.test(system)) return null;
    if (edition !== null) {
      if (!ADMIN_SLUG_RE.test(edition)) return null;
      return `${system}/${edition}`;
    }
    return system;
  }
  const slug = typeof body['slug'] === 'string' ? body['slug'] : '';
  if (slug.includes('/')) {
    const [s, e, ...rest] = slug.split('/');
    if (!s || !e || rest.length > 0) return null;
    if (!ADMIN_SLUG_RE.test(s) || !ADMIN_SLUG_RE.test(e)) return null;
    return `${s}/${e}`;
  }
  if (!ADMIN_SLUG_RE.test(slug)) return null;
  return slug;
}

/** POST /api/admin-visibility: flip one audit edition between private and
 *  public. Body: `{ system, edition }` (or `{ slug }` for a legacy bare
 *  slug or a bare system, its newest edition), visibility. Publishing
 *  refuses while a critical or high finding is open; unpublishing always
 *  applies. A flip to private keeps the document valid: a public audit
 *  carries no reader allowlist, so without one the stored private document
 *  would fail validation and vanish from the panel — the acting owner's
 *  email becomes the allowlist instead. */
export async function handleSetVisibility(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  const owner = await authedOwner(request, env, deps);
  if (typeof owner !== 'string') return owner;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const ref = addressOf(body);
  const visibility = typeof body['visibility'] === 'string' ? body['visibility'] : '';
  if (ref === null || (visibility !== 'public' && visibility !== 'private')) {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const resolved = await resolveAdminAudit(env.AUDITS, ref);
  if (!resolved) return json({ ok: false, error: 'missing' }, 404);
  const { doc, key, system, edition } = resolved;
  if (visibility === 'public') {
    const refusal = publishRefusal(doc);
    if (refusal) return json({ ok: false, error: 'refused', reason: refusal }, 409);
  }
  if (doc.visibility === visibility) return json({ ok: true, slug: edition, system, edition, visibility });
  const next = { ...doc, visibility };
  if (visibility === 'private') {
    const emails = Array.isArray(next.access?.emails)
      ? next.access.emails.filter((e): e is string => typeof e === 'string' && e !== '')
      : [];
    if (emails.length === 0) next.access = { emails: [owner] };
  }
  try {
    await env.AUDITS!.put(key, `${JSON.stringify(next, null, 2)}\n`, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
  } catch {
    return json({ ok: false, error: 'store' }, 500);
  }
  return json({ ok: true, slug: edition, system, edition, visibility });
}

/** POST /api/admin-remove: delete one audit edition and every object under
 *  its key prefix, or the whole system when the body names no edition.
 *  Body: `{ system, edition? }` (or `{ slug }`: an edition pair, a legacy
 *  bare slug, or a bare system), confirm (must be true: the panel asks
 *  twice). */
export async function handleRemoveAudit(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  const owner = await authedOwner(request, env, deps);
  if (typeof owner !== 'string') return owner;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const ref = addressOf(body);
  if (ref === null) return json({ ok: false, error: 'invalid' }, 400);
  if (body['confirm'] !== true) return json({ ok: false, error: 'confirm' }, 400);
  const resolved = await resolveAdminAudit(env.AUDITS, ref);
  if (!resolved) return json({ ok: false, error: 'missing' }, 404);
  const { doc, system, edition } = resolved;
  const prefix = resolved.scope === 'edition' ? `${system}/${edition}/` : `${system}/`;
  let keys: string[];
  try {
    if (env.AUDITS!.list) {
      const listed = await env.AUDITS!.list({ prefix });
      keys = listed.objects.map((o) => o.key).filter((k) => k.startsWith(prefix));
      if (resolved.legacy) {
        const editionPrefixes = listed.objects
          .map((o) => /^([^/]+)\/([^/]+)\/audit\.json$/.exec(o.key))
          .filter((m): m is RegExpExecArray => m !== null)
          .map((m) => `${m[1]}/${m[2]}/`);
        keys = keys.filter((k) => !editionPrefixes.some((p) => k.startsWith(p)));
      }
    } else {
      keys = [resolved.key, ...doc.assets.map((a) => `${prefix}${a.path}`)];
    }
  } catch {
    return json({ ok: false, error: 'store' }, 500);
  }
  try {
    for (const key of keys) await env.AUDITS!.delete(key);
  } catch {
    return json({ ok: false, error: 'store' }, 500);
  }
  return json({ ok: true, slug: edition, system, edition, deleted: keys.length });
}

// --- Control-room audit intake (FR1, FR4-FR7): one request per step. ---
//
// POST /api/admin-audits/upload carries `init`, `finalize` (and `cancel`)
// as JSON bodies (`{ action, ... }`) and each file as the raw request
// body to `?action=file&uploadId=<id>&name=<path>`, so finalizing an
// upload of 300 files and 200 MB never holds more than one file in
// memory. Files wait under `_staging/<uploadId>/` with a
// `_staging/<uploadId>.manifest.json` recording every stored file's size
// and SHA-256; the leading `_` keeps them out of every public, reader and
// panel route until the edition is confirmed. Finalize copies the staged
// files to their live keys one by one, `audit.json` last, so a failure
// before that point leaves the previous document and every file it names
// readable.

const STAGING = '_staging';
const MANIFEST_SUFFIX = '.manifest.json';
const UPLOAD_ID_RE = /^[0-9a-f]{32}$/;
const UPLOAD_STALE_MS = 24 * 60 * 60 * 1000;

const stagingPrefix = (id: string): string => `${STAGING}/${id}/`;
const stagingKey = (id: string, name: string): string => `${STAGING}/${id}/${name}`;
const manifestKey = (id: string): string => `${STAGING}/${id}${MANIFEST_SUFFIX}`;

interface StagedFileRecord {
  size: number;
  sha256: string;
}

interface UploadManifest {
  system: string;
  edition: string;
  owner: string;
  createdAt: string;
  files: Record<string, StagedFileRecord>;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.length);
  input.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function stagedBytes(bucket: AdminR2Bucket, key: string): Promise<Uint8Array | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  if (obj.arrayBuffer) return new Uint8Array(await obj.arrayBuffer());
  return new TextEncoder().encode(await obj.text());
}

function isFileRecord(v: unknown): v is StagedFileRecord {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return typeof r['size'] === 'number' && Number.isInteger(r['size']) && typeof r['sha256'] === 'string';
}

async function readManifest(bucket: AdminR2Bucket, id: string): Promise<UploadManifest | null> {
  try {
    const obj = await bucket.get(manifestKey(id));
    if (!obj) return null;
    const raw = JSON.parse(await obj.text()) as Partial<UploadManifest>;
    if (
      typeof raw['system'] !== 'string' ||
      !ADMIN_UPLOAD_SLUG_RE.test(raw['system']) ||
      typeof raw['edition'] !== 'string' ||
      !ADMIN_UPLOAD_SLUG_RE.test(raw['edition']) ||
      typeof raw['owner'] !== 'string' ||
      raw['owner'] === '' ||
      typeof raw['createdAt'] !== 'string' ||
      typeof raw['files'] !== 'object' ||
      raw['files'] === null ||
      Array.isArray(raw['files']) ||
      !Object.values(raw['files']).every(isFileRecord)
    ) {
      return null;
    }
    return {
      system: raw['system'],
      edition: raw['edition'],
      owner: raw['owner'],
      createdAt: raw['createdAt'],
      files: raw['files'] as Record<string, StagedFileRecord>,
    };
  } catch {
    return null;
  }
}

async function writeManifest(bucket: AdminR2Bucket, id: string, manifest: UploadManifest): Promise<void> {
  await bucket.put(manifestKey(id), JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

/** Delete every staged file of one upload and its manifest. Throws on a
 *  store failure; callers refusing an upload swallow it (the refusal
 *  stands), the finalize success path reports it as a cleanup warning. */
async function deleteStaging(bucket: AdminR2Bucket, id: string): Promise<void> {
  const prefix = stagingPrefix(id);
  if (bucket.list) {
    const listed = await bucket.list({ prefix });
    for (const obj of listed.objects) {
      if (obj.key.startsWith(prefix)) await bucket.delete(obj.key);
    }
  }
  await bucket.delete(manifestKey(id));
}

/** Delete uploads abandoned over 24 hours ago. Best-effort: the sweep
 *  never fails the upload starting now. */
async function sweepStaleUploads(bucket: AdminR2Bucket): Promise<void> {
  try {
    if (!bucket.list) return;
    const now = Date.now();
    const listed = await bucket.list({ prefix: `${STAGING}/` });
    for (const obj of listed.objects) {
      if (!obj.key.endsWith(MANIFEST_SUFFIX)) continue;
      const id = obj.key.slice(STAGING.length + 1, -MANIFEST_SUFFIX.length);
      if (!UPLOAD_ID_RE.test(id)) continue;
      const manifest = await readManifest(bucket, id);
      if (!manifest) continue;
      const createdAt = Date.parse(manifest.createdAt);
      if (!Number.isNaN(createdAt) && now - createdAt > UPLOAD_STALE_MS) {
        try {
          await deleteStaging(bucket, id);
        } catch {
          // One stale upload's cleanup never blocks the sweep.
        }
      }
    }
  } catch {
    // The sweep never fails the upload starting now.
  }
}

interface CatalogueEntry {
  path: string;
  bytes?: number;
  sha256?: string;
}

/** The catalogue entries of a document, or null when its shape is
 *  unusable — the same catalogue the validator reads. */
function catalogueEntries(doc: Record<string, unknown>): CatalogueEntry[] | null {
  const assets = doc['assets'];
  if (!Array.isArray(assets)) return null;
  const out: CatalogueEntry[] = [];
  for (const a of assets) {
    if (typeof a !== 'object' || a === null || Array.isArray(a)) return null;
    const rec = a as Record<string, unknown>;
    if (typeof rec['path'] !== 'string' || rec['path'] === '') return null;
    const entry: CatalogueEntry = { path: rec['path'] };
    if (typeof rec['bytes'] === 'number' && Number.isInteger(rec['bytes'])) entry.bytes = rec['bytes'];
    if (typeof rec['sha256'] === 'string' && /^[0-9a-fA-F]{64}$/.test(rec['sha256'])) {
      entry.sha256 = rec['sha256'].toLowerCase();
    }
    out.push(entry);
  }
  return out;
}

/** POST /api/admin-audits/upload: add one audit edition from the control
 *  room. `init` and `finalize` (and `cancel`) arrive as JSON bodies
 *  (`{ action }` plus the step's fields); each file arrives as the raw
 *  request body to `?action=file&uploadId=<id>&name=<path>`. Every step
 *  re-verifies the owner; the document is validated with the same
 *  contract validator and always stored private. */
export async function handleAdminUpload(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  const owner = await authedOwner(request, env, deps);
  if (typeof owner !== 'string') return owner;
  const actionParam = new URL(request.url).searchParams.get('action');
  if (actionParam === 'file') return handleUploadFile(request, env.AUDITS!, owner);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const action = typeof body['action'] === 'string' ? body['action'] : '';

  if (action === 'init') {
    await sweepStaleUploads(env.AUDITS!);
    let system = typeof body['system'] === 'string' ? body['system'] : '';
    let edition = typeof body['edition'] === 'string' ? body['edition'] : '';
    if ((system === '' || edition === '') && typeof body['folder'] === 'string') {
      const proposed = proposeTarget(body['folder']);
      if (system === '' && proposed) system = proposed.system;
      if (edition === '' && proposed) edition = proposed.edition;
    }
    if (!ADMIN_UPLOAD_SLUG_RE.test(system) || !ADMIN_UPLOAD_SLUG_RE.test(edition)) {
      return json({ ok: false, error: 'invalid' }, 400);
    }
    const uploadId = crypto.randomUUID().replace(/-/g, '');
    try {
      await writeManifest(env.AUDITS!, uploadId, {
        system,
        edition,
        owner,
        createdAt: new Date().toISOString(),
        files: {},
      });
    } catch {
      return json({ ok: false, error: 'store' }, 500);
    }
    let exists = false;
    try {
      exists = (await env.AUDITS!.get(`${system}/${edition}/audit.json`)) !== null;
    } catch {
      // The upload fails before it starts: leave no staging behind.
      try {
        await deleteStaging(env.AUDITS!, uploadId);
      } catch {
        // The store error stands even when the cleanup fails.
      }
      return json({ ok: false, error: 'store' }, 500);
    }
    return json({ ok: true, uploadId, system, edition, exists, owner });
  }

  if (action === 'cancel') {
    const uploadId = typeof body['uploadId'] === 'string' ? body['uploadId'] : '';
    if (!UPLOAD_ID_RE.test(uploadId)) return json({ ok: false, error: 'invalid' }, 400);
    const manifest = await readManifest(env.AUDITS!, uploadId);
    if (!manifest) return json({ ok: false, error: 'missing' }, 404);
    if (manifest.owner !== owner) return json({ ok: false, error: 'forbidden' }, 403);
    try {
      await deleteStaging(env.AUDITS!, uploadId);
    } catch {
      return json({ ok: false, error: 'store' }, 500);
    }
    return json({ ok: true, uploadId });
  }

  if (action === 'finalize') {
    return handleUploadFinalize(body, env.AUDITS!, owner);
  }

  return json({ ok: false, error: 'invalid' }, 400);
}

/** The staged `audit.json` of one upload as a record, or null when it is
 *  absent or unreadable — later steps decide whether that refuses the
 *  upload. */
async function readStagedDoc(bucket: AdminR2Bucket, id: string): Promise<Record<string, unknown> | null> {
  try {
    const bytes = await stagedBytes(bucket, stagingKey(id, 'audit.json'));
    if (!bytes) return null;
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** One staged file against the staged document's catalogue: membership,
 *  size and SHA-256. Running totals ride with the manifest at the call
 *  site; the staged `audit.json` itself is only parsed there. */
function checkStagedFile(
  name: string,
  bytes: Uint8Array,
  digest: string,
  staged: Record<string, unknown>,
): UploadIssue[] {
  const issues: UploadIssue[] = [];
  const entries = catalogueEntries(staged);
  if (entries === null) {
    issues.push({ path: '$.assets', message: 'the asset catalogue cannot be read' });
    return issues;
  }
  const entry = entries.find((e) => e.path === name);
  if (!entry) {
    issues.push({ path: `$.assets: '${name}'`, message: `file '${name}' is not in the catalogue` });
    return issues;
  }
  if (entry.bytes !== undefined && bytes.length !== entry.bytes) {
    issues.push({
      path: `$.assets: '${name}'`,
      message: `file '${name}' is ${bytes.length} bytes, catalogue says ${entry.bytes}`,
    });
  }
  if (entry.sha256 !== undefined && digest !== entry.sha256) {
    issues.push({
      path: `$.assets: '${name}'`,
      message: `file '${name}' hash does not match the catalogue`,
    });
  }
  return issues;
}

/** One file of an upload: the raw request body is stored under staging
 *  after size and SHA-256 are checked against the catalogue, so at most
 *  one file is ever in memory. A refusal deletes the whole staged upload
 *  at once. */
async function handleUploadFile(request: Request, bucket: AdminR2Bucket, owner: string): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const uploadId = params.get('uploadId') ?? '';
  const name = params.get('name') ?? '';
  if (!UPLOAD_ID_RE.test(uploadId) || name === '') return json({ ok: false, error: 'invalid' }, 400);
  const manifest = await readManifest(bucket, uploadId);
  if (!manifest) return json({ ok: false, error: 'missing' }, 404);
  if (manifest.owner !== owner) return json({ ok: false, error: 'forbidden' }, 403);
  const refuse = async (res: Response): Promise<Response> => {
    try {
      await deleteStaging(bucket, uploadId);
    } catch {
      // The refusal stands even when the cleanup fails.
    }
    return res;
  };
  if (uploadNameEscapes(name)) return refuse(json({ ok: false, error: 'escape', path: name }, 400));
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return refuse(json({ ok: false, error: 'invalid' }, 400));
  }
  if (bytes.length > MAX_FILE) {
    return refuse(json({ ok: false, error: 'too-large', path: name }, 413));
  }
  const digest = await sha256Hex(bytes);
  if (name === 'audit.json') {
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      return refuse(
        json(
          { ok: false, error: 'invalid', issues: [{ path: 'audit.json', message: 'audit.json is not valid JSON' }] },
          422,
        ),
      );
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return refuse(
        json(
          { ok: false, error: 'invalid', issues: [{ path: 'audit.json', message: 'audit.json is not a JSON object' }] },
          422,
        ),
      );
    }
  } else {
    const staged = await readStagedDoc(bucket, uploadId);
    if (staged) {
      const issues = checkStagedFile(name, bytes, digest, staged);
      if (issues.length > 0) return refuse(json({ ok: false, error: 'invalid', issues }, 422));
    }
  }
  const prev = manifest.files[name];
  const count = prev ? Object.keys(manifest.files).length : Object.keys(manifest.files).length + 1;
  const total =
    Object.values(manifest.files).reduce((n, r) => n + r.size, 0) + bytes.length - (prev ? prev.size : 0);
  if (count > MAX_FILES) {
    return refuse(
      json(
        {
          ok: false,
          error: 'invalid',
          issues: [{ path: 'audit.json', message: `upload holds ${count} files but at most ${MAX_FILES} are allowed` }],
        },
        422,
      ),
    );
  }
  if (total > MAX_TOTAL) {
    return refuse(
      json(
        {
          ok: false,
          error: 'invalid',
          issues: [{ path: 'audit.json', message: `upload is ${total} bytes in total but at most ${MAX_TOTAL} are allowed` }],
        },
        422,
      ),
    );
  }
  try {
    await bucket.put(stagingKey(uploadId, name), bytes as unknown as Uint8Array, {
      httpMetadata: { contentType: auditContentType(name) },
    });
    await writeManifest(bucket, uploadId, {
      ...manifest,
      files: { ...manifest.files, [name]: { size: bytes.length, sha256: digest } },
    });
  } catch {
    // The panel always starts a fresh upload on retry, so a file the store
    // refused leaves no staging behind.
    return refuse(json({ ok: false, error: 'store' }, 500));
  }
  return json({ ok: true, uploadId, name, size: bytes.length });
}

/** Confirm one upload: the staged `audit.json` and the manifest's
 *  recorded sizes and hashes are checked against the catalogue — no file
 *  bytes are read except the document itself — then the staged files are
 *  copied to their live keys one by one, `audit.json` last, so a failure
 *  before that point leaves the previous document and every file it names
 *  readable. A failure while storing the edition reports the store error;
 *  a failure while clearing what is already stored reports the upload as
 *  stored with a `warning: 'cleanup'`. */
async function handleUploadFinalize(
  body: Record<string, unknown>,
  bucket: AdminR2Bucket,
  owner: string,
): Promise<Response> {
  const uploadId = typeof body['uploadId'] === 'string' ? body['uploadId'] : '';
  const replace = body['replace'] === true;
  if (!UPLOAD_ID_RE.test(uploadId)) return json({ ok: false, error: 'invalid' }, 400);
  const manifest = await readManifest(bucket, uploadId);
  if (!manifest) return json({ ok: false, error: 'missing' }, 404);
  if (manifest.owner !== owner) return json({ ok: false, error: 'forbidden' }, 403);
  const refuse = async (res: Response): Promise<Response> => {
    try {
      await deleteStaging(bucket, uploadId);
    } catch {
      // The refusal stands even when the cleanup fails.
    }
    return res;
  };
  const recorded = manifest.files;
  const stagedDoc = await readStagedDoc(bucket, uploadId);
  if (!stagedDoc) {
    return refuse(
      json(
        {
          ok: false,
          error: 'missing',
          issues: [{ path: 'audit.json', message: 'audit.json is missing from the upload' }],
        },
        400,
      ),
    );
  }
  // Always stored private; the stored form is what the validator checks.
  const doc = forcePrivate(stagedDoc, owner);
  const issues: UploadIssue[] = validateAuditDocument(doc).errors.map((e) => ({ path: e.path, message: e.message }));
  const entries = catalogueEntries(stagedDoc);
  if (entries === null) {
    issues.push({ path: '$.assets', message: 'the asset catalogue cannot be read' });
  } else {
    const names = new Set(Object.keys(recorded));
    for (const entry of entries) {
      if (uploadNameEscapes(entry.path)) {
        issues.push({ path: '$.assets', message: `asset path '${entry.path}' escapes the audit folder` });
        continue;
      }
      const rec = recorded[entry.path];
      if (!rec) {
        issues.push({ path: '$.assets', message: `asset file '${entry.path}' is missing from the upload` });
        continue;
      }
      if (entry.bytes !== undefined && rec.size !== entry.bytes) {
        issues.push({
          path: `$.assets: '${entry.path}'`,
          message: `asset file '${entry.path}' is ${rec.size} bytes, catalogue says ${entry.bytes}`,
        });
      }
      if (entry.sha256 !== undefined && rec.sha256 !== entry.sha256) {
        issues.push({
          path: `$.assets: '${entry.path}'`,
          message: `asset file '${entry.path}' hash does not match the catalogue`,
        });
      }
    }
    const catalogued = new Set([...entries.map((e) => e.path), 'audit.json']);
    for (const name of names) {
      if (!catalogued.has(name)) {
        issues.push({ path: `$.assets: '${name}'`, message: `file '${name}' is not in the catalogue` });
      }
    }
  }
  const count = Object.keys(recorded).length;
  const total = Object.values(recorded).reduce((n, r) => n + r.size, 0);
  if (count > MAX_FILES) {
    issues.push({ path: 'audit.json', message: `upload holds ${count} files but at most ${MAX_FILES} are allowed` });
  }
  if (total > MAX_TOTAL) {
    issues.push({ path: 'audit.json', message: `upload is ${total} bytes in total but at most ${MAX_TOTAL} are allowed` });
  }
  if (issues.length > 0) {
    return refuse(json({ ok: false, error: 'invalid', issues }, 422));
  }
  const { system, edition } = manifest;
  const prefix = `${system}/${edition}/`;
  let existed = false;
  try {
    existed = (await bucket.get(`${prefix}audit.json`)) !== null;
  } catch {
    // Nothing live was touched: the failed finalize leaves no staging.
    return refuse(json({ ok: false, error: 'store' }, 500));
  }
  if (existed && !replace) {
    // The replace was refused: the staged files leave with it.
    return refuse(json({ ok: false, error: 'exists', system, edition }, 409));
  }
  // Snapshot the edition so a failed finalize (and its cleanup) never
  // touches what was already there.
  let previous: string[] = [];
  try {
    if (!bucket.list) return refuse(json({ ok: false, error: 'unavailable' }, 503));
    const listed = await bucket.list({ prefix });
    previous = listed.objects.map((o) => o.key).filter((k) => k.startsWith(prefix));
  } catch {
    // Nothing live was touched: the failed finalize leaves no staging.
    return refuse(json({ ok: false, error: 'store' }, 500));
  }
  const ordered = [...(entries ?? []).map((e) => e.path), 'audit.json'];
  const stagedText = `${JSON.stringify(doc, null, 2)}\n`;
  const stagedTextBytes = new TextEncoder().encode(stagedText);
  const written: string[] = [];
  try {
    for (const name of ordered) {
      const key = `${prefix}${name}`;
      if (name === 'audit.json') {
        await bucket.put(key, stagedTextBytes as unknown as Uint8Array, {
          httpMetadata: { contentType: auditContentType(name) },
        });
      } else {
        const bytes = await stagedBytes(bucket, stagingKey(uploadId, name));
        if (bytes === null) throw new Error(`staged file '${name}' is missing`);
        await bucket.put(key, bytes as unknown as Uint8Array, {
          httpMetadata: { contentType: auditContentType(name) },
        });
      }
      written.push(key);
    }
  } catch {
    for (const key of written) {
      if (!previous.includes(key)) {
        try {
          await bucket.delete(key);
        } catch {
          // Cleanup is best-effort; the edition stays hidden without audit.json.
        }
      }
    }
    try {
      await deleteStaging(bucket, uploadId);
    } catch {
      // The store error stands even when the cleanup fails.
    }
    return json({ ok: false, error: 'store' }, 500);
  }
  const wanted = new Set(ordered.map((name) => `${prefix}${name}`));
  let warning: string | null = null;
  try {
    for (const key of previous) {
      if (!wanted.has(key)) await bucket.delete(key);
    }
    await deleteStaging(bucket, uploadId);
  } catch {
    // The edition is stored; only clearing what it replaced failed.
    warning = 'cleanup';
  }
  return json({
    ok: true,
    system,
    edition,
    slug: edition,
    href: `/audits/${system}/${edition}/`,
    files: ordered.length,
    replaced: existed,
    ...(warning ? { warning } : {}),
  });
}
