// The admin API core (FR2, FR3, FR4): list every audit, flip visibility and
// remove an audit. Pure orchestration over injected dependencies — the Pages
// Function files under functions/api/ are thin adapters, so these handlers
// run unchanged in jest with a fake bucket and a stub verifier.

import { isOwnerEmail, readToken } from '../sign/handlers';
import { ADMIN_SLUG_RE, listAdminAudits, loadAdminAuditDoc, publishRefusal, type AdminR2Bucket } from './summary';

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

/** POST /api/admin-visibility: flip one audit between private and public.
 *  Body: slug, visibility. Publishing refuses while a critical or high
 *  finding is open; unpublishing always applies. A flip to private keeps the
 *  document valid: a public audit carries no reader allowlist, so without one
 *  the stored private document would fail validation and vanish from the
 *  panel — the acting owner's email becomes the allowlist instead. */
export async function handleSetVisibility(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  const owner = await authedOwner(request, env, deps);
  if (typeof owner !== 'string') return owner;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const slug = typeof body['slug'] === 'string' ? body['slug'] : '';
  const visibility = typeof body['visibility'] === 'string' ? body['visibility'] : '';
  if (!ADMIN_SLUG_RE.test(slug) || (visibility !== 'public' && visibility !== 'private')) {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const doc = await loadAdminAuditDoc(env.AUDITS, slug);
  if (!doc) return json({ ok: false, error: 'missing' }, 404);
  if (visibility === 'public') {
    const refusal = publishRefusal(doc);
    if (refusal) return json({ ok: false, error: 'refused', reason: refusal }, 409);
  }
  if (doc.visibility === visibility) return json({ ok: true, slug, visibility });
  const next = { ...doc, visibility };
  if (visibility === 'private') {
    const emails = Array.isArray(next.access?.emails)
      ? next.access.emails.filter((e): e is string => typeof e === 'string' && e !== '')
      : [];
    if (emails.length === 0) next.access = { emails: [owner] };
  }
  try {
    await env.AUDITS!.put(`${slug}/audit.json`, `${JSON.stringify(next, null, 2)}\n`, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
  } catch {
    return json({ ok: false, error: 'store' }, 500);
  }
  return json({ ok: true, slug, visibility });
}

/** POST /api/admin-remove: delete an audit and every object under its key
 *  prefix. Body: slug, confirm (must be true: the panel asks twice). */
export async function handleRemoveAudit(request: Request, env: AdminEnv, deps: AdminDeps): Promise<Response> {
  const owner = await authedOwner(request, env, deps);
  if (typeof owner !== 'string') return owner;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid' }, 400);
  }
  const slug = typeof body['slug'] === 'string' ? body['slug'] : '';
  if (!ADMIN_SLUG_RE.test(slug)) return json({ ok: false, error: 'invalid' }, 400);
  if (body['confirm'] !== true) return json({ ok: false, error: 'confirm' }, 400);
  const doc = await loadAdminAuditDoc(env.AUDITS, slug);
  if (!doc) return json({ ok: false, error: 'missing' }, 404);
  let keys: string[];
  try {
    if (env.AUDITS!.list) {
      const listed = await env.AUDITS!.list({ prefix: `${slug}/` });
      keys = listed.objects.map((o) => o.key).filter((k) => k === `${slug}/audit.json` || k.startsWith(`${slug}/`));
    } else {
      keys = [`${slug}/audit.json`, ...doc.assets.map((a) => `${slug}/${a.path}`)];
    }
  } catch {
    return json({ ok: false, error: 'store' }, 500);
  }
  try {
    for (const key of keys) await env.AUDITS!.delete(key);
  } catch {
    return json({ ok: false, error: 'store' }, 500);
  }
  return json({ ok: true, slug, deleted: keys.length });
}
