// The admin API core (FR2, FR3, FR4): list every audit, flip visibility and
// remove an audit. Pure orchestration over injected dependencies — the Pages
// Function files under functions/api/ are thin adapters, so these handlers
// run unchanged in jest with a fake bucket and a stub verifier.

import { isOwnerEmail, readToken } from '../sign/handlers';
import { ADMIN_SLUG_RE, listAdminAudits, publishRefusal, resolveAdminAudit, type AdminR2Bucket } from './summary';

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
