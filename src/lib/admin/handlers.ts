// The admin API core (FR2, FR3, FR4): list every audit, flip visibility and
// remove an audit. Pure orchestration over injected dependencies — the Pages
// Function files under functions/api/ are thin adapters, so these handlers
// run unchanged in jest with a fake bucket and a stub verifier.

import { validateAuditDocument } from '../audit/validate-document';
import { isOwnerEmail, readToken } from '../sign/handlers';
import { ADMIN_SLUG_RE, listAdminAudits, publishRefusal, resolveAdminAudit, type AdminR2Bucket } from './summary';
import {
  ADMIN_UPLOAD_SLUG_RE,
  forcePrivate,
  proposeTarget,
  uploadNameEscapes,
  validateUploadEntries,
  MAX_FILE,
  type UploadFile,
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

// --- Control-room audit intake (FR1): one file per request. ---

const STAGING = '_staging';

const stagingPrefix = (id: string): string => `${STAGING}/${id}/`;
const stagingKey = (id: string, name: string): string => `${STAGING}/${id}/${name}`;
const manifestKey = (id: string): string => `${STAGING}/${id}.json`;

interface UploadManifest {
  system: string;
  edition: string;
  owner: string;
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function stagedBytes(bucket: AdminR2Bucket, key: string): Promise<Uint8Array | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  if (obj.arrayBuffer) return new Uint8Array(await obj.arrayBuffer());
  return new TextEncoder().encode(await obj.text());
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
      raw['owner'] === ''
    ) {
      return null;
    }
    return { system: raw['system'], edition: raw['edition'], owner: raw['owner'] };
  } catch {
    return null;
  }
}

/** POST /api/admin-upload: add one audit edition from the control room.
 *  Body: `{ action }` plus the step's fields — `init{ system?, edition?,
 *  folder? }`, `file{ uploadId, name, bytes }` (base64, one file per
 *  request), `finalize{ uploadId, replace? }`. Every step re-verifies the
 *  owner; the document is validated with the same contract validator and
 *  always stored private. */
export async function handleAdminUpload(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  const owner = await authedOwner(request, env, deps);
  if (typeof owner !== 'string') return owner;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const action = typeof body['action'] === 'string' ? body['action'] : '';

  if (action === 'init') {
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
      await env.AUDITS!.put(manifestKey(uploadId), JSON.stringify({ system, edition, owner }), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
      });
    } catch {
      return json({ ok: false, error: 'store' }, 500);
    }
    let exists = false;
    try {
      exists = (await env.AUDITS!.get(`${system}/${edition}/audit.json`)) !== null;
    } catch {
      return json({ ok: false, error: 'store' }, 500);
    }
    return json({ ok: true, uploadId, system, edition, exists, owner });
  }

  if (action === 'file') {
    const uploadId = typeof body['uploadId'] === 'string' ? body['uploadId'] : '';
    const name = typeof body['name'] === 'string' ? body['name'] : '';
    const bytes = typeof body['bytes'] === 'string' ? base64ToBytes(body['bytes']) : null;
    if (!/^[0-9a-f]{32}$/.test(uploadId) || name === '' || bytes === null) {
      return json({ ok: false, error: 'invalid' }, 400);
    }
    if (uploadNameEscapes(name)) return json({ ok: false, error: 'escape', path: name }, 400);
    if (bytes.length > MAX_FILE) return json({ ok: false, error: 'too-large', path: name }, 413);
    const manifest = await readManifest(env.AUDITS!, uploadId);
    if (!manifest) return json({ ok: false, error: 'missing' }, 404);
    if (manifest.owner !== owner) return json({ ok: false, error: 'forbidden' }, 403);
    try {
      await env.AUDITS!.put(stagingKey(uploadId, name), bytes as unknown as Uint8Array, {
        httpMetadata: { contentType: 'application/octet-stream' },
      });
    } catch {
      return json({ ok: false, error: 'store' }, 500);
    }
    return json({ ok: true, uploadId, name, size: bytes.length });
  }

  if (action === 'finalize') {
    const uploadId = typeof body['uploadId'] === 'string' ? body['uploadId'] : '';
    const replace = body['replace'] === true;
    if (!/^[0-9a-f]{32}$/.test(uploadId)) return json({ ok: false, error: 'invalid' }, 400);
    const manifest = await readManifest(env.AUDITS!, uploadId);
    if (!manifest) return json({ ok: false, error: 'missing' }, 404);
    if (manifest.owner !== owner) return json({ ok: false, error: 'forbidden' }, 403);
    const { system, edition } = manifest;
    const prefix = `${system}/${edition}/`;
    let staged: string[];
    try {
      if (env.AUDITS!.list) {
        const listed = await env.AUDITS!.list({ prefix: stagingPrefix(uploadId) });
        staged = listed.objects.map((o) => o.key).filter((k) => k.startsWith(stagingPrefix(uploadId)));
      } else {
        return json({ ok: false, error: 'unavailable' }, 503);
      }
    } catch {
      return json({ ok: false, error: 'store' }, 500);
    }
    const names = staged.map((k) => k.slice(stagingPrefix(uploadId).length)).filter((n) => n !== '');
    if (!names.includes('audit.json')) {
      return json({ ok: false, error: 'missing', issues: [{ path: 'audit.json', message: 'audit.json is missing from the upload' }] }, 400);
    }
    const files: UploadFile[] = [];
    try {
      for (const name of names) {
        const bytes = await stagedBytes(env.AUDITS!, stagingKey(uploadId, name));
        if (bytes === null) return json({ ok: false, error: 'store' }, 500);
        files.push({ name, bytes });
      }
    } catch {
      return json({ ok: false, error: 'store' }, 500);
    }
    let raw: unknown;
    try {
      const auditFile = files.find((f) => f.name === 'audit.json')!;
      raw = JSON.parse(new TextDecoder().decode(auditFile.bytes));
    } catch {
      return json({ ok: false, error: 'invalid', issues: [{ path: 'audit.json', message: 'audit.json is not valid JSON' }] }, 400);
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return json({ ok: false, error: 'invalid', issues: [{ path: 'audit.json', message: 'audit.json is not a JSON object' }] }, 400);
    }
    // Always stored private; the stored form is what the validator checks.
    const doc = forcePrivate(raw as Record<string, unknown>, owner);
    const docErrors = validateAuditDocument(doc).errors;
    const entryIssues = await validateUploadEntries(
      files.map((f) => (f.name === 'audit.json'
        ? { name: f.name, bytes: new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`) }
        : f)),
      doc,
    );
    const issues = [...docErrors.map((e) => ({ path: e.path, message: e.message })), ...entryIssues];
    if (issues.length > 0) {
      return json({ ok: false, error: 'invalid', issues }, 422);
    }
    let existed = false;
    try {
      existed = (await env.AUDITS!.get(`${prefix}audit.json`)) !== null;
    } catch {
      return json({ ok: false, error: 'store' }, 500);
    }
    if (existed && !replace) {
      return json({ ok: false, error: 'exists', system, edition }, 409);
    }
    // Snapshot the edition so a failed finalize (and its cleanup) never
    // touches what was already there, and the panel never shows a partial
    // edition: audit.json goes last, after every asset.
    let previous: string[] = [];
    try {
      const listed = await env.AUDITS!.list({ prefix });
      previous = listed.objects.map((o) => o.key).filter((k) => k.startsWith(prefix));
    } catch {
      return json({ ok: false, error: 'store' }, 500);
    }
    const storedText = `${JSON.stringify(doc, null, 2)}\n`;
    const ordered = [
      ...files.filter((f) => f.name !== 'audit.json').map((f) => ({ key: `${prefix}${f.name}`, bytes: f.bytes })),
      { key: `${prefix}audit.json`, bytes: new TextEncoder().encode(storedText) },
    ];
    const written: string[] = [];
    try {
      for (const item of ordered) {
        await env.AUDITS!.put(item.key, item.bytes as unknown as Uint8Array, {
          httpMetadata: { contentType: 'application/octet-stream' },
        });
        written.push(item.key);
      }
    } catch {
      for (const key of written) {
        if (!previous.includes(key)) {
          try {
            await env.AUDITS!.delete(key);
          } catch {
            // Cleanup is best-effort; the edition stays hidden without audit.json.
          }
        }
      }
      return json({ ok: false, error: 'store' }, 500);
    }
    const wanted = new Set(ordered.map((o) => o.key));
    try {
      for (const key of previous) {
        if (!wanted.has(key)) await env.AUDITS!.delete(key);
      }
      for (const key of staged) await env.AUDITS!.delete(key);
      await env.AUDITS!.delete(manifestKey(uploadId));
    } catch {
      return json({ ok: false, error: 'store' }, 500);
    }
    return json({
      ok: true,
      system,
      edition,
      slug: edition,
      href: `/audits/${system}/${edition}/`,
      files: ordered.length,
      replaced: existed,
    });
  }

  return json({ ok: false, error: 'invalid' }, 400);
}
