import { renderRoadmapTwin, roadmapTwinRoute } from './roadmap-twin';
import { foundingRoute, rewriteFoundingSpots } from './founding-spots';
import { fetchFoundingLeft } from '../src/lib/founding-spots';
import { labPageHtml, labPageHtml2, labPageMarkdown } from '../src/lib/lab-page';
import { loadEntries, loadRoadmap } from '../src/lib/lab-feed';
import { liveLogbook, logbookRoute, rewriteSelector } from './logbook-edge';
import { buildPool } from '../src/lib/science-filter';
import {
  editionDateFor,
  otdUrl,
  todayEditionHtml,
  todayEditionMarkdown,
  todayRoute,
} from '../src/lib/today-edition';
import { rewriteEditionWords } from './edition-words';
import { roadmapLanesHtml } from '../src/lib/roadmap-board';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { linkState } from '../src/lib/sign/evidence';
import { loadRequest, listRequests, type SignBucket } from '../src/lib/sign/store';
import { signInnerHtml, type SignStrings } from '../src/lib/sign/page';
import { validateAuditDocument } from '../src/lib/audit/validate-document';
import { auditBadge } from '../src/lib/audit/badge';
import { auditMarkdown, publicAuditUrl, PUBLIC_AUDIT_BASE } from '../src/lib/audit/markdown';
import { auditPageHtml, type PublishedAuditLinks } from '../src/lib/audit/render';
import { esc } from '../src/lib/audit/escape';
import type { AuditDocument } from '../src/lib/audit/types';

const MARKDOWN_EXTS = new Set(['md', 'json', 'png', 'svg', 'xml', 'txt', 'mp4']);

// Path prefixes that only ever serve build output, never a page. Astro emits
// hashed assets under /_astro/, and a hashed filename carries no extension we
// can enumerate, so the prefix is the reliable guard.
const ASSET_PREFIXES = ['/_astro/'];

/** Edge-cache the API reads: the roadmap and the log move at most hourly, and
 *  a cached read is what keeps the twin cheap enough to render per request. */
const API_CACHE_TTL = 300;

/** A slow API degrades to the static twin; it never holds the response open. */
const API_TIMEOUT_MS = 3000;

// Exactly what every markdown response carries — the deploy workflow asserts
// the content type against the live origin, and `_headers` sets Vary already.
const MARKDOWN_HEADERS: Record<string, string> = {
  'Content-Type': 'text/markdown; charset=utf-8',
  'Vary': 'Accept',
};

/** `cf` is a Workers-only fetch option the DOM's RequestInit does not declare. */
type CfFetchInit = RequestInit & { cf?: { cacheTtl: number; cacheEverything: boolean } };

/** Every API read is edge-cached and read-only — no Authorization header, and
 *  never `state=all`, so no private roadmap column can leave the worker. */
const apiInit = (): CfFetchInit => ({
  cf: { cacheTtl: API_CACHE_TTL, cacheEverything: true },
});

export function wantsMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;
  const parts = accept.split(',');
  for (const part of parts) {
    const media = part.trim().split(';')[0].trim().toLowerCase();
    if (media === 'text/markdown') return true;
  }
  return false;
}

export function markdownTwinPath(pathname: string): string | null {
  if (ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const lastSegment = pathname.split('/').pop() || '';
  if (lastSegment.includes('.')) {
    const ext = lastSegment.split('.').pop()!.toLowerCase();
    if (MARKDOWN_EXTS.has(ext)) return null;
  }
  let normalized = pathname;
  if (!normalized.endsWith('/')) {
    normalized += '/';
  }
  return normalized + 'index.md';
}

/**
 * A deadline for one API read. `AbortSignal.timeout` where the runtime has it
 * (workerd, Node ≥ 17.3 — its timer is unref'd, so it never holds a test open);
 * `AbortController` + `setTimeout` otherwise, with `clear` run by the caller so
 * the fallback timer cannot outlive the request either.
 */
function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const Native = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal };
  if (typeof Native.timeout === 'function') {
    return { signal: Native.timeout(ms), clear: () => {} };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

/** Both public reads for the newspaper, in parallel, rendered for `lang`.
 *  Rejects on any failure — the caller's catch is what degrades to the
 *  static page. The Wikipedia read carries the project's User-Agent and is
 *  edge-cached one hour per language and day; the lab read reuses the API
 *  policy. Both share one 3 s deadline. Page 2 (the logbook) does not depend
 *  on the edition's date: any edition prints the same logbook. */
async function liveTodayEdition(
  lang: 'en' | 'es',
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  date: Date,
): Promise<{ html: string; labHtml: string; lab2Html: string; markdown: string }> {
  // Both reads run together: the shared 3 s deadline must not be spent twice,
  // and a slow Wikipedia response must not push the lab mail past it.
  const otd = fetchImpl(otdUrl(lang, date), {
    headers: { 'User-Agent': 'UniverLab/1.0 (https://univerlab.org)' },
    cf: { cacheTtl: 3600, cacheEverything: true },
    signal,
  } as RequestInit).then((res) => {
    if (!res.ok) throw new Error(`otd ${res.status}`);
    return res.json() as Promise<Parameters<typeof buildPool>[0]>;
  });
  const entries = loadEntries({ fetchImpl, init: apiInit(), signal }).catch(() => null);
  const founding = fetchFoundingLeft(fetchImpl).catch(() => null);
  const [data, labEntries, foundingLeft] = await Promise.all([otd, entries, founding]);
  const lab = labEntries ?? [];
  const unavailable = labEntries === null;
  const feed = { facts: buildPool(data, lang), lab };
  return {
    html: todayEditionHtml(feed, lang, date),
    labHtml: labPageHtml(lab, lang, { unavailable, foundingLeft }),
    lab2Html: labPageHtml2(lab, lang, { unavailable, foundingLeft }),
    markdown: `${todayEditionMarkdown(feed, lang, date)}\n${labPageMarkdown(lab, lang, { unavailable, foundingLeft })}\n`,
  };
}

/** The R2 surface the audit routes need: reads only, never writes. */
interface AuditR2Object {
  body: ReadableStream | Uint8Array | string | null;
  size: number;
  etag: string;
  httpMetadata?: { contentType?: string };
  text(): Promise<string>;
}

interface AuditR2Bucket {
  get(
    key: string,
    opts?: { range?: { offset?: number; length?: number } },
  ): Promise<(AuditR2Object & { range?: { offset: number; length: number } }) | null>;
  /** Enumerate keys (`<slug>/audit.json` plus assets). Optional so a binding
   *  that only serves single keys still satisfies the type. */
  list?: (options?: { prefix?: string }) => Promise<{ objects: { key: string }[] }>;
}

const AUDIT_PAGE_RE = /^\/audits\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/?$/;
const AUDIT_ASSET_RE = /^\/audits\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/assets\/(.+)$/;
const AUDIT_TWIN_RE = /^\/audits\/[^/]+\/index\.md$/;

const PUBLIC_AUDIT_PAGE_RE = /^\/workbench\/audits\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/?$/;
const PUBLIC_AUDIT_ASSET_RE = /^\/workbench\/audits\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/assets\/(.+)$/;
const PUBLIC_AUDIT_BADGE_RE = /^\/workbench\/audits\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/badge\.svg$/;
const PUBLIC_AUDIT_TWIN_RE = /^\/workbench\/audits\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/index\.md$/;

const AUDIT_NO_STORE: Record<string, string> = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

/** Published audit pages, twins and badges are public and edge-cached. */
const PUBLIC_AUDIT_CACHE: Record<string, string> = {
  'Cache-Control': 'public, max-age=300',
};

/** Every public audit in the R2 bucket: only documents whose visibility is
 *  public are listed, so a private slug never leaks through an index. An
 *  unbound bucket or a listing failure yields no entries. */
export interface PublicAuditEntry {
  slug: string;
  doc: AuditDocument;
}

export async function listPublicAudits(env: { AUDITS?: AuditR2Bucket }): Promise<PublicAuditEntry[]> {
  try {
    if (!env.AUDITS?.list) return [];
    const listed = await env.AUDITS.list();
    const out: PublicAuditEntry[] = [];
    for (const obj of listed.objects) {
      const m = /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/audit\.json$/.exec(obj.key);
      if (!m) continue;
      const doc = await loadAuditDoc(env, m[1]);
      if (doc && doc.visibility === 'public') out.push({ slug: m[1], doc });
    }
    return out;
  } catch {
    return [];
  }
}

/** The re-audit history around one published audit: the previous audit only
 *  when it is public itself, and every public audit naming this one. */
export function publicAuditHistory(slug: string, doc: AuditDocument, all: PublicAuditEntry[]): PublishedAuditLinks {
  const slugs = new Set(all.map((e) => e.slug));
  const previous =
    typeof doc.badge?.previous === 'string' && slugs.has(doc.badge.previous) ? doc.badge.previous : null;
  const next = all
    .filter((e) => e.doc.badge?.previous === slug)
    .map((e) => e.slug)
    .sort();
  return { previous, next };
}

function auditContentType(path: string): string {
  const ext = path.split('.').pop()!.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'svg': return 'image/svg+xml';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'avif': return 'image/avif';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mp3': return 'audio/mpeg';
    case 'ogg': return 'audio/ogg';
    case 'wav': return 'audio/wav';
    case 'json': return 'application/json; charset=utf-8';
    case 'zip': return 'application/zip';
    default: return 'application/octet-stream';
  }
}

/** Catalogue paths become both R2 keys and public URLs; keep them plain
 *  relative paths so `/audits/<slug>/assets/` cannot be escaped. */
function safeAuditAssetPath(path: string): boolean {
  if (path.startsWith('/') || path.includes('\\')) return false;
  return path.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** A valid audit document of any visibility, or null when the route must
 *  answer 404: no binding, no file, invalid JSON or a contract violation.
 *  Visibility is gated by the caller: public audits serve to anyone, private
 *  audits only after `auditRequestAllowed` passes. */
async function loadAuditDoc(
  env: { AUDITS?: AuditR2Bucket },
  slug: string,
): Promise<AuditDocument | null> {
  try {
    if (!env.AUDITS) return null;
    const obj = await env.AUDITS.get(`${slug}/audit.json`);
    if (!obj) return null;
    const doc = JSON.parse(await obj.text()) as AuditDocument;
    if (validateAuditDocument(doc).errors.length > 0) return null;
    if (typeof doc !== 'object' || doc === null) return null;
    if (doc.visibility !== 'public' && doc.visibility !== 'private') return null;
    if (!doc.assets.every((a) => safeAuditAssetPath(a.path))) return null;
    return doc;
  } catch {
    return null;
  }
}

/** Environment the private-audit gate reads. `ACCESS_TEAM_DOMAIN` is the
 *  Cloudflare Access team domain (`<team>.cloudflareaccess.com`) whose keys
 *  sign the JWT; `ACCESS_AUD` is the application AUD tag the token must
 *  carry. Both are operator dashboard values, never committed. */
export interface AuditAccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

/** The R2 surface the signing flow reads at the edge: sidecars and the
 *  request listing. Writes happen in the API functions, never here. */
export interface SignR2Bucket {
  get(key: string): Promise<{
    body: ReadableStream | Uint8Array | string | null;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  } | null>;
  list?: (options?: { prefix?: string }) => Promise<{ objects: { key: string }[] }>;
}

/** Environment the signing routes read: the private SIGN_DOCS bucket plus
 *  the owner allowlist (comma-separated emails, dashboard value). */
export interface SignAccessEnv {
  SIGN_DOCS?: SignR2Bucket;
  SIGN_OWNER_EMAILS?: string;
}

const asSignBucket = (env: SignAccessEnv): SignBucket | undefined =>
  env.SIGN_DOCS as unknown as SignBucket | undefined;

const ACCESS_CERT_TTL_MS = 5 * 60 * 1000;

let accessKeys: { fetchedAt: number; keys: Map<string, CryptoKey> } | null = null;

/** Test-only: drop the cached Access public keys so tests start cold. */
export function resetAccessKeyCacheForTests(): void {
  accessKeys = null;
}

function base64UrlToBytes(s: string): Uint8Array | null {
  try {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad > 0) b64 += '='.repeat(4 - pad);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function base64UrlToJson(s: string): Record<string, unknown> | null {
  const bytes = base64UrlToBytes(s);
  if (!bytes) return null;
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Fetch the team's Access public keys and import the RSA ones for RS256.
 *  Throws on any failure — the caller fails closed. */
async function fetchAccessKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const jwks = (await res.json()) as { keys?: unknown };
  const out = new Map<string, CryptoKey>();
  if (!Array.isArray(jwks.keys)) return out;
  for (const entry of jwks.keys) {
    if (typeof entry !== 'object' || entry === null) continue;
    const k = entry as Record<string, unknown>;
    if (k['kty'] !== 'RSA' || typeof k['kid'] !== 'string' || typeof k['n'] !== 'string' || typeof k['e'] !== 'string') continue;
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: k['n'] as string, e: k['e'] as string, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      out.set(k['kid'] as string, key);
    } catch {
      // One unusable key never blocks the usable ones.
    }
  }
  return out;
}

/** The cached Access public key for `kid`, refetching once when the token
 *  names a key id the cache does not hold. Null on any failure. */
async function accessPublicKey(teamDomain: string, kid: string): Promise<CryptoKey | null> {
  const now = Date.now();
  const fresh = accessKeys && now - accessKeys.fetchedAt <= ACCESS_CERT_TTL_MS;
  if (fresh) {
    const hit = accessKeys!.keys.get(kid);
    if (hit) return hit;
  } else {
    accessKeys = { fetchedAt: now, keys: new Map() };
  }
  try {
    accessKeys = { fetchedAt: Date.now(), keys: await fetchAccessKeys(teamDomain) };
  } catch {
    return null;
  }
  return accessKeys.keys.get(kid) ?? null;
}

/** Verify the `Cf-Access-Jwt-Assertion` JWT against the team's keys: RS256
 *  signature, `aud` equal to `ACCESS_AUD`, issuer, and expiry. Returns the
 *  reader's email on success, null on any failure — fail closed. */
export async function verifyAccessToken(
  token: string,
  env: AuditAccessEnv,
): Promise<string | null> {
  try {
    const team = env.ACCESS_TEAM_DOMAIN;
    const aud = env.ACCESS_AUD;
    if (!team || !aud) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = base64UrlToJson(parts[0]);
    const payload = base64UrlToJson(parts[1]);
    const signature = base64UrlToBytes(parts[2]);
    if (!header || !payload || !signature) return null;
    if (header['alg'] !== 'RS256' || typeof header['kid'] !== 'string') return null;
    const tokenAud = payload['aud'];
    const audOk = Array.isArray(tokenAud) ? tokenAud.includes(aud) : tokenAud === aud;
    if (!audOk) return null;
    const iss = payload['iss'];
    if (typeof iss !== 'string' || (iss !== `https://${team}` && iss !== `https://${team}/`)) return null;
    if (typeof payload['exp'] !== 'number' || payload['exp'] * 1000 <= Date.now()) return null;
    const email = payload['email'];
    if (typeof email !== 'string' || email === '') return null;
    const key = await accessPublicKey(team, header['kid'] as string);
    if (!key) return null;
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const ok = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      new Uint8Array(signature),
      data,
    );
    if (!ok) return null;
    return email;
  } catch {
    return null;
  }
}

/** The reader's email against the document's own allowlist, compared without
 *  case. Anything else — including a missing list — denies. */
export function auditAllowed(doc: AuditDocument, email: string): boolean {
  const list = doc.access?.emails;
  if (!Array.isArray(list)) return false;
  const want = email.toLowerCase();
  return list.some((e) => typeof e === 'string' && e.toLowerCase() === want);
}

/** The signing shell is only ever filled at request time: asked for
 *  directly it answers 404, like the audit shell. */
const SIGN_SHELL_RE = /^\/sign-shell\/?$/;
const SIGN_OWNER_RE = /^\/sign\/owner\/?$/;
const SIGN_OWNER_ES_RE = /^\/es\/sign\/owner\/?$/;
const SIGN_PAGE_RE = /^\/sign\/([0-9a-f]{32})\/?$/;
const SIGN_PAGE_ES_RE = /^\/es\/sign\/([0-9a-f]{32})\/?$/;

/** The Access JWT for a signing route: header first, then the
 *  `CF_Authorization` cookie browsers carry after the email OTP. */
function signToken(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 'CF_Authorization' && rest.length > 0) return rest.join('=').trim();
  }
  return null;
}

/** The owner's private console serves only to an allowlisted address with a
 *  valid Access JWT — the same posture as a private audit, with the
 *  allowlist in the environment instead of on a document. */
async function signOwnerAllowed(request: Request, env: AuditAccessEnv & SignAccessEnv): Promise<boolean> {
  const token = signToken(request);
  if (!token) return false;
  const email = await verifyAccessToken(token, env);
  if (!email) return false;
  const allowlist = (env.SIGN_OWNER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== '');
  return allowlist.includes(email.toLowerCase());
}

/** Fill the sign shell: language, title, description, canonical URL and the
 *  request's state (form, signed or expired) into `#sign`. The shell stays
 *  noindex: signing links are capabilities, never indexed. */
async function rewriteSignShell(
  shell: Response,
  opts: { lang: string; title: string; desc: string; canonical: string; html: string },
): Promise<Response> {
  const RW = (globalThis as unknown as { HTMLRewriter?: unknown }).HTMLRewriter;
  if (typeof RW === 'function') {
    const rewriter = new (RW as new () => {
      on(s: string, h: unknown): unknown;
      transform(r: Response): Response;
    })();
    const rw = rewriter as unknown as {
      on(s: string, h: unknown): void;
      transform(r: Response): Response;
    };
    rw.on('html', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('lang', opts.lang);
      },
    });
    rw.on('title', {
      element(el: { setInnerContent(c: string, o: unknown): void }) {
        el.setInnerContent(opts.title, { html: false });
      },
    });
    rw.on('meta[name="description"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.desc);
      },
    });
    rw.on('link[rel="canonical"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('href', opts.canonical);
      },
    });
    rw.on('#sign', {
      element(el: { setInnerContent(c: string, o: unknown): void }) {
        el.setInnerContent(opts.html, { html: true });
      },
    });
    return rw.transform(shell);
  }
  const shellText = await shell.text();
  return new Response(
    shellText
      .replace(/<html([^>]*)>/, (_m, attrs: string) =>
        `<html${String(attrs).replace(/\s*lang="[^"]*"/, '')} lang="${opts.lang}">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(opts.title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(opts.desc)}$2`)
      .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(opts.canonical)}$2`)
      .replace('<div id="sign"></div>', `<div id="sign">${opts.html}</div>`),
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/** A private audit serves only when the configuration is present, the
 *  request carries a valid Access JWT, and its email is on the document's
 *  own list. Never relies on Access alone; never reveals why it denied. */
async function auditRequestAllowed(
  request: Request,
  env: AuditAccessEnv,
  doc: AuditDocument,
): Promise<boolean> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return false;
  const email = await verifyAccessToken(token, env);
  if (!email) return false;
  return auditAllowed(doc, email);
}

/** The visibility of the annex owning an asset file, when an annex bundles
 *  it. Omitted annex visibility means private; when several annexes bundle
 *  the same file, one non-public owner keeps it private. */
function assetAnnexVisibility(doc: AuditDocument, assetId: string): 'public' | 'private' | null {
  const annexes = doc.annexes ?? [];
  let found = false;
  for (const a of annexes) {
    if (Array.isArray(a.assets) && a.assets.includes(assetId)) {
      found = true;
      if (a.visibility !== 'public') return 'private';
    }
  }
  return found ? 'public' : null;
}

/** One audit file from R2 (private or public route): the catalogue entry must
 *  match, the `allowed` gate must pass, and the cache headers are the
 *  caller's. Annex files are always downloaded, never rendered in the page,
 *  and a private annex file answers 404 on the public route. Null when the
 *  route must answer 404. */
async function serveAuditAsset(
  env: { AUDITS?: AuditR2Bucket } & AuditAccessEnv,
  request: Request,
  slug: string,
  rest: string,
  cache: Record<string, string>,
  allowed: (doc: AuditDocument) => Promise<boolean>,
  opts?: { publicRoute?: boolean },
): Promise<Response | null> {
  let path = rest;
  try {
    path = decodeURIComponent(rest);
  } catch {
    // A malformed escape cannot name a catalogue path; leave it encoded.
  }
  const doc = await loadAuditDoc(env, slug);
  const entry = doc?.assets.find((a) => a.path === `assets/${path}` || a.path === path) ?? null;
  if (!doc || !entry || !env.AUDITS) return null;
  if (!(await allowed(doc))) return null;
  const annexVis = assetAnnexVisibility(doc, entry.id);
  // A private annex never leaks through the public route, even when the
  // audit itself is public.
  if (annexVis === 'private' && opts?.publicRoute) return null;
  try {
    const full = await env.AUDITS.get(`${slug}/${entry.path}`);
    if (!full) return null;
    const type = full.httpMetadata?.contentType || auditContentType(entry.path);
    const headers: Record<string, string> = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'ETag': full.etag,
      ...cache,
    };
    if (annexVis !== null) {
      const file = (entry.path.split('/').pop() ?? 'file').replace(/["\r\n]/g, '_');
      headers['Content-Disposition'] = `attachment; filename="${file}"`;
      headers['X-Content-Type-Options'] = 'nosniff';
    }
    const range = parseAuditRange(request.headers.get('Range'), full.size);
    if (range) {
      const obj = await env.AUDITS.get(`${slug}/${entry.path}`, { range });
      if (!obj) return null;
      headers['Content-Range'] = `bytes ${range.offset}-${range.offset + range.length - 1}/${full.size}`;
      headers['Content-Length'] = String(range.length);
      return new Response(obj.body as BodyInit, { status: 206, headers });
    }
    headers['Content-Length'] = String(full.size);
    return new Response(full.body as BodyInit, { status: 200, headers });
  } catch {
    return null;
  }
}

/** Fill the audit shell with the rendered page: language, title,
 *  description, canonical URL (plus its og: and markdown-twin mirrors) and
 *  the audit itself. */
async function rewriteAuditShell(
  shell: Response,
  opts: { lang: string; title: string; desc: string; canonical: string; html: string },
): Promise<Response> {
  const RW = (globalThis as unknown as { HTMLRewriter?: unknown }).HTMLRewriter;
  if (typeof RW === 'function') {
    const rewriter = new (RW as new () => {
      on(s: string, h: unknown): unknown;
      transform(r: Response): Response;
    })();
    const rw = rewriter as unknown as {
      on(s: string, h: unknown): void;
      transform(r: Response): Response;
    };
    rw.on('html', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('lang', opts.lang);
      },
    });
    rw.on('title', {
      element(el: { setInnerContent(c: string, o: unknown): void }) {
        el.setInnerContent(opts.title, { html: false });
      },
    });
    rw.on('meta[name="description"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.desc);
      },
    });
    // The shell is noindex so the gate never sees an indexable shell page;
    // the published audit it becomes is meant to be indexed (it is in the
    // sitemap), so the rewrite lifts the robots directive.
    rw.on('meta[name="robots"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', 'index, follow');
      },
    });
    rw.on('link[rel="canonical"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('href', opts.canonical);
      },
    });
    rw.on('meta[property="og:title"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.title);
      },
    });
    rw.on('meta[property="og:description"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.desc);
      },
    });
    rw.on('meta[property="og:url"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.canonical);
      },
    });
    rw.on('meta[property="og:locale"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.lang === 'es' ? 'es_ES' : 'en_US');
      },
    });
    rw.on('meta[property="og:locale:alternate"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.lang === 'es' ? 'en_US' : 'es_ES');
      },
    });
    rw.on('meta[name="twitter:title"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.title);
      },
    });
    rw.on('meta[name="twitter:description"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.desc);
      },
    });
    rw.on('meta[name="twitter:image:alt"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.title);
      },
    });
    rw.on('meta[property="og:image:alt"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('content', opts.title);
      },
    });
    // Only the markdown twin: `link[rel="alternate"]` alone would also hit
    // the Atom feed link and point it at the audit's index.md.
    rw.on('link[type="text/markdown"]', {
      element(el: { setAttribute(n: string, v: string): void }) {
        el.setAttribute('href', `${opts.canonical}index.md`);
      },
    });
    rw.on('#audit', {
      element(el: { setInnerContent(c: string, o: unknown): void }) {
        el.setInnerContent(opts.html, { html: true });
      },
    });
    return rw.transform(shell);
  }
  const shellText = await shell.text();
  return new Response(
    shellText
      .replace(/<html([^>]*)>/, (_m, attrs: string) =>
        `<html${String(attrs).replace(/\s*lang="[^"]*"/, '')} lang="${opts.lang}">`)
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(opts.title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(opts.desc)}$2`)
      .replace(/(<meta name="robots" content=")[^"]*(")/, '$1index, follow$2')
      .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(opts.canonical)}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(opts.title)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(opts.desc)}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(opts.canonical)}$2`)
      .replace(/(<meta property="og:locale" content=")[^"]*(")/, `$1${opts.lang === 'es' ? 'es_ES' : 'en_US'}$2`)
      .replace(/(<meta property="og:locale:alternate" content=")[^"]*(")/, `$1${opts.lang === 'es' ? 'en_US' : 'es_ES'}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(opts.title)}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(opts.desc)}$2`)
      .replace(/(<link rel="alternate" type="text\/markdown" href=")[^"]*(")/, `$1${esc(opts.canonical)}index.md$2`)
      .replace('<div id="audit"></div>', `<div id="audit">${opts.html}</div>`),
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/** Inject the R2-listed public audits into the built indexes: their page URL
 *  joins the sitemap, their page and markdown-twin URLs join llms.txt. A
 *  published audit added after a deploy appears at the next request. Null
 *  for any other path, or when there is nothing to inject. */
async function servePublicAuditIndex(
  env: { ASSETS: { fetch: (input: string | Request) => Promise<Response> }; AUDITS?: AuditR2Bucket },
  request: Request,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== '/sitemap-0.xml' && pathname !== '/llms.txt') return null;
  const all = await listPublicAudits(env);
  if (!all.length) return null;
  const url = new URL(request.url);
  const staticRes = await env.ASSETS.fetch(new URL(pathname, url.origin).href);
  if (!staticRes.ok) return null;
  if (pathname === '/sitemap-0.xml') {
    const xml = await staticRes.text();
    const urls = all.map((e) => `<url><loc>https://univerlab.org${publicAuditUrl(e.slug)}</loc></url>`).join('');
    return new Response(xml.replace('</urlset>', `${urls}</urlset>`), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', ...PUBLIC_AUDIT_CACHE },
    });
  }
  const txt = await staticRes.text();
  const lines = all
    .map((e) => {
      const title = e.doc.meta.title.replace(/[\[\]]/g, '(');
      const page = `https://univerlab.org${publicAuditUrl(e.slug)}`;
      return `- [${title}](${page}): ${e.doc.meta.scope}\n- [${title} (markdown)](${page}index.md)`;
    })
    .join('\n');
  return new Response(`${txt.replace(/\s*$/, '')}\n\n## Published audits\n\n${lines}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...PUBLIC_AUDIT_CACHE },
  });
}

/** `bytes=start-end`, `bytes=start-` or a `bytes=-suffix` tail. Null means
 *  no usable range: serve the whole file. */
function parseAuditRange(header: string | null, size: number): { offset: number; length: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const tail = parseInt(m[2], 10);
    if (!(tail > 0)) return null;
    start = Math.max(0, size - tail);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? size - 1 : parseInt(m[2], 10);
  }
  if (!(start < size) || end < start) return null;
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

export async function onRequest(context: {
  request: Request;
  env: {
    ASSETS: { fetch: (input: string | Request) => Promise<Response> };
    AUDITS?: AuditR2Bucket;
  } & AuditAccessEnv & SignAccessEnv;
  next: () => Promise<Response>;
}): Promise<Response> {
  const { request, env, next } = context;

  // `/mcp` (and `/mcp/server-card`) speak MCP Streamable HTTP, not markdown:
  // an MCP client's Accept can carry `text/event-stream` or `*/*`, and without
  // this guard `/mcp` would be rewritten to `/mcp/index.md`. Pass through
  // before anything else looks at the request.
  const { pathname } = new URL(request.url);
  // The newspaper moved from /today/ to /newspaper/: the old addresses
  // redirect permanently, keeping the edition parameter (?d=).
  if (
    pathname === '/today' ||
    pathname === '/today/' ||
    pathname === '/es/today' ||
    pathname === '/es/today/'
  ) {
    const url = new URL(request.url);
    const dest = pathname.startsWith('/es/') ? '/es/newspaper/' : '/newspaper/';
    return Response.redirect(new URL(dest + url.search, url.origin).href, 301);
  }
  // The logbook moved into the newspaper's second page: every status address
  // redirects permanently there, keeping the query string. The old markdown
  // twin keeps serving the new twin's address.
  if (pathname === '/status' || pathname.startsWith('/status/')) {
    const url = new URL(request.url);
    // The query string stays a query: it must land before the #lab fragment
    // or the ?topic=/?roadmap= deep links arrive as fragment text and filter nothing.
    const twin = pathname === '/status/index.md' || pathname === '/status/index.md/';
    const dest = twin ? '/newspaper/index.md' : '/newspaper/';
    return Response.redirect(new URL(dest + url.search + (twin ? '' : '#lab'), url.origin).href, 301);
  }
  if (pathname === '/es/status' || pathname.startsWith('/es/status/')) {
    const url = new URL(request.url);
    const twin = pathname === '/es/status/index.md' || pathname === '/es/status/index.md/';
    const dest = twin ? '/es/newspaper/index.md' : '/es/newspaper/';
    return Response.redirect(new URL(dest + url.search + (twin ? '' : '#lab'), url.origin).href, 301);
  }
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) return next();

  // The published-audit shell is only ever filled at request time: asked for
  // directly it answers 404, like a missing page.
  if (pathname === '/audit-shell' || pathname === '/audit-shell/') {
    return new Response('not found', { status: 404 });
  }

  // The signing shell is only ever filled at request time, and the owner's
  // console only ever opens to an allowlisted address with a valid Access
  // JWT. Both stay private and unindexed, like the private audits.
  if (SIGN_SHELL_RE.test(pathname)) {
    return new Response('not found', { status: 404 });
  }
  if (SIGN_OWNER_RE.test(pathname) || SIGN_OWNER_ES_RE.test(pathname)) {
    if (!(await signOwnerAllowed(request, env))) return new Response('not found', { status: 404 });
    const res = await next();
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(AUDIT_NO_STORE)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    const signAccept = request.headers.get('Accept');
    const signPage = !wantsMarkdown(signAccept) ? (SIGN_PAGE_RE.exec(pathname) ?? SIGN_PAGE_ES_RE.exec(pathname)) : null;
    if (signPage) {
      const lang = SIGN_PAGE_ES_RE.test(pathname) ? 'es' : 'en';
      const req = await loadRequest(asSignBucket(env), signPage[1]);
      if (!req) return next();
      const url = new URL(request.url);
      const shellPath = lang === 'es' ? '/es/sign-shell/' : '/sign-shell/';
      const shell = await env.ASSETS.fetch(new URL(shellPath, url.origin).href);
      if (!shell.ok) return next();
      const strings: SignStrings = (lang === 'es' ? es.sign : en.sign) as SignStrings;
      const html = signInnerHtml(req, linkState(req), strings);
      const desc = (lang === 'es' ? es.sign : en.sign).shellDescription;
      const res = await rewriteSignShell(shell, {
        lang,
        title: `${req.title} — UniverLab`,
        desc,
        canonical: new URL(pathname, url.origin).href,
        html,
      });
      for (const [k, v] of Object.entries(AUDIT_NO_STORE)) res.headers.set(k, v);
      return res;
    }
  }

  const accept = request.headers.get('Accept');

  // Audits render at request time from the private R2 bucket, never from the
  // repo — and never as a markdown twin. This runs before the twin logic.
  if (AUDIT_TWIN_RE.test(pathname)) return next();
  if (request.method === 'GET' || request.method === 'HEAD') {
    const page = !wantsMarkdown(accept) ? AUDIT_PAGE_RE.exec(pathname) : null;
    if (page) {
      const slug = page[1];
      const doc = await loadAuditDoc(env, slug);
      if (!doc) return next();
      // A private audit answers as if it did not exist unless the request
      // carries a valid Access JWT for an email on its own list.
      if (doc.visibility === 'private' && !(await auditRequestAllowed(request, env, doc))) return next();
      const url = new URL(request.url);
      const shell = await env.ASSETS.fetch(new URL('/audits/', url.origin).href);
      if (!shell.ok) return next();
      // A private audit lists its signed documents: every signing request
      // bound to this slug, with its state and the signed download.
      let signedDocs: Array<{ id: string; title: string; state: 'ready' | 'signed' | 'expired'; signedHash: string | null }> | undefined;
      if (doc.visibility === 'private') {
        try {
          const reqs = await listRequests(asSignBucket(env));
          signedDocs = reqs
            .filter((r) => r.auditSlug === slug)
            .map((r) => ({ id: r.id, title: r.title, state: linkState(r), signedHash: r.signedHash }));
        } catch {
          signedDocs = undefined;
        }
      }
      const html = auditPageHtml(doc, slug, signedDocs?.length ? { signedDocs } : {});
      const lang = doc.meta.language;
      const title = `${doc.meta.title} — UniverLab`;
      const desc = doc.meta.subtitle || doc.meta.title;
      const RW = (globalThis as unknown as { HTMLRewriter?: unknown }).HTMLRewriter;
      let res: Response;
      if (typeof RW === 'function') {
        const rewriter = new (RW as new () => {
          on(s: string, h: unknown): unknown;
          transform(r: Response): Response;
        })();
        const rw = rewriter as unknown as {
          on(s: string, h: unknown): void;
          transform(r: Response): Response;
        };
        rw.on('html', {
          element(el: { setAttribute(n: string, v: string): void }) {
            el.setAttribute('lang', lang);
          },
        });
        rw.on('title', {
          element(el: { setInnerContent(c: string, o: unknown): void }) {
            el.setInnerContent(title, { html: false });
          },
        });
        rw.on('meta[name="description"]', {
          element(el: { setAttribute(n: string, v: string): void }) {
            el.setAttribute('content', desc);
          },
        });
        rw.on('#audit', {
          element(el: { setInnerContent(c: string, o: unknown): void }) {
            el.setInnerContent(html, { html: true });
          },
        });
        res = rw.transform(shell);
      } else {
        const shellText = await shell.text();
        res = new Response(
          shellText
            .replace(/<html([^>]*)>/, (_m, attrs: string) =>
              `<html${String(attrs).replace(/\s*lang="[^"]*"/, '')} lang="${lang}">`)
            .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
            .replace('<div id="audit"></div>', `<div id="audit">${html}</div>`),
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }
      for (const [k, v] of Object.entries(AUDIT_NO_STORE)) res.headers.set(k, v);
      return res;
    }
    const asset = AUDIT_ASSET_RE.exec(pathname);
    if (asset) {
      const res = await serveAuditAsset(env, request, asset[1], asset[2], AUDIT_NO_STORE, async (doc) =>
        doc.visibility === 'public' ? true : auditRequestAllowed(request, env, doc),
      );
      if (res) return res;
      return next();
    }
    const publicAsset = PUBLIC_AUDIT_ASSET_RE.exec(pathname);
    if (publicAsset) {
      const res = await serveAuditAsset(env, request, publicAsset[1], publicAsset[2], PUBLIC_AUDIT_CACHE, async (doc) =>
        doc.visibility === 'public',
        { publicRoute: true },
      );
      if (res) return res;
      return next();
    }
    const badge = PUBLIC_AUDIT_BADGE_RE.exec(pathname);
    if (badge) {
      const doc = await loadAuditDoc(env, badge[1]);
      if (!doc || doc.visibility !== 'public' || !doc.badge) return next();
      return new Response(auditBadge(doc, badge[1], 'https://univerlab.org'), {
        headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', ...PUBLIC_AUDIT_CACHE },
      });
    }
    // A published audit's markdown twin, rendered live from the R2 listing —
    // never from dist/. Private slugs answer 404 here, like missing ones.
    const twin = PUBLIC_AUDIT_TWIN_RE.exec(pathname) ?? (wantsMarkdown(accept) ? PUBLIC_AUDIT_PAGE_RE.exec(pathname) : null);
    if (twin) {
      const doc = await loadAuditDoc(env, twin[1]);
      if (!doc || doc.visibility !== 'public') return next();
      return new Response(auditMarkdown(doc, twin[1]), {
        headers: { ...MARKDOWN_HEADERS, ...PUBLIC_AUDIT_CACHE },
      });
    }
    const publicPage = !wantsMarkdown(accept) ? PUBLIC_AUDIT_PAGE_RE.exec(pathname) : null;
    if (publicPage) {
      const slug = publicPage[1];
      const doc = await loadAuditDoc(env, slug);
      if (!doc || doc.visibility !== 'public') return next();
      const url = new URL(request.url);
      const shell = await env.ASSETS.fetch(new URL('/audit-shell/', url.origin).href);
      if (!shell.ok) return next();
      const all = await listPublicAudits(env);
      const html = auditPageHtml(doc, slug, {
        assetBase: PUBLIC_AUDIT_BASE,
        published: publicAuditHistory(slug, doc, all),
      });
      const canonical = `https://univerlab.org${publicAuditUrl(slug)}`;
      const title = `${doc.meta.title} — UniverLab`;
      const desc = doc.meta.subtitle || doc.meta.title;
      const lang = doc.meta.language;
      const res = await rewriteAuditShell(shell, { lang, title, desc, canonical, html });
      for (const [k, v] of Object.entries(PUBLIC_AUDIT_CACHE)) res.headers.set(k, v);
      return res;
    }
    const sitemap = await servePublicAuditIndex(env, request, pathname);
    if (sitemap) return sitemap;
  } else if (AUDIT_PAGE_RE.test(pathname) || AUDIT_ASSET_RE.test(pathname)) {
    return next();
  }

  // The founding count is live KV data on a static page: serve the static
  // page, then fill or clear its founding slot. Markdown twins stay static.
  const foundingLang = request.method === 'GET' && !wantsMarkdown(accept) ? foundingRoute(pathname) : null;
  if (foundingLang) {
    const staticRes = await next();
    if (!staticRes.ok) return staticRes;
    return rewriteFoundingSpots(staticRes, foundingLang, fetch);
  }

  // Roadmap HTML: fetch the static page, then swap the lanes for a live render.
  if (!wantsMarkdown(accept) && (pathname === '/roadmap' || pathname === '/roadmap/')) {
    const staticRes = await next();
    if (!staticRes.ok) return staticRes;
    try {
      const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
      let items: Awaited<ReturnType<typeof loadRoadmap>>;
      try {
        items = await loadRoadmap({ init: apiInit(), signal });
      } finally {
        clear();
      }
      const html = roadmapLanesHtml(items, en.roadmap);
      const RW = (globalThis as any).HTMLRewriter;
      if (typeof RW === 'function') {
        const rewriter = new RW();
        rewriter.on('#roadmap-lanes', {
          element(el: any) {
            el.setInnerContent(html, { html: true });
          },
        });
        return rewriter.transform(staticRes);
      }
      return staticRes;
    } catch {
      return staticRes;
    }
  }

  // The newspaper: fetch the static page, then set #edition to the day's
  // edition and #lab-body / #lab2-body to the classifieds' two pages. Any
  // failure (timeout 3 s, non-OK) serves the static page, whose client
  // script fills all three with the same renderers.
  const todayLang = request.method === 'GET' && !wantsMarkdown(accept) ? todayRoute(pathname) : null;
  if (todayLang) {
    const staticRes = await next();
    if (!staticRes.ok) return staticRes;
    try {
      const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
      try {
        const edDate = editionDateFor(new URL(request.url).search);
        const { html, labHtml, lab2Html } = await liveTodayEdition(todayLang, fetch, signal, edDate);
        const RW = (globalThis as unknown as { HTMLRewriter?: unknown }).HTMLRewriter;
        if (typeof RW === 'function') {
          const rewriter = new (RW as new () => {
            on(s: string, h: unknown): unknown;
            transform(r: Response): Response;
          })();
          // Member-expression calls: extracting `on` first would lose its
          // receiver, and a stub rewriter records nothing.
          (rewriter.on as (s: string, h: unknown) => void)('#edition', {
            element(el: { setInnerContent(c: string, o: unknown): void }) {
              el.setInnerContent(html, { html: true });
            },
          });
          (rewriter.on as (s: string, h: unknown) => void)('#lab-body', {
            element(el: { setInnerContent(c: string, o: unknown): void }) {
              el.setInnerContent(labHtml, { html: true });
            },
          });
          (rewriter.on as (s: string, h: unknown) => void)('#lab2-body', {
            element(el: { setInnerContent(c: string, o: unknown): void }) {
              el.setInnerContent(lab2Html, { html: true });
            },
          });
          rewriteEditionWords(rewriter, edDate, todayLang);
          return rewriter.transform(staticRes);
        }
        return staticRes;
      } finally {
        clear();
      }
    } catch {
      return staticRes;
    }
  }

  // The Logbook: fetch the static page, then set #logbook-body to the full
  // record. Same failure rule as the newspaper: the client script fills it.
  const logbookLang = request.method === 'GET' && !wantsMarkdown(accept) ? logbookRoute(pathname) : null;
  if (logbookLang) {
    const staticRes = await next();
    if (!staticRes.ok) return staticRes;
    try {
      const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
      try {
        const { bodyHtml } = await liveLogbook(logbookLang, fetch, signal, apiInit());
        return rewriteSelector(staticRes, '#logbook-body', bodyHtml);
      } finally {
        clear();
      }
    } catch {
      return staticRes;
    }
  }

  // A path ending in /index.md asks for the markdown twin whatever the Accept
  // header says — an agent that GETs /newspaper/index.md with `Accept: */*`
  // is reading the twin, and a bare next() would hand it the raw build
  // artifact with no live render. Every other path still needs text/markdown
  // in Accept.
  if (!wantsMarkdown(accept) && !pathname.endsWith('/index.md')) {
    return next();
  }

  try {
    const url = new URL(request.url);

    if (roadmapTwinRoute(url.pathname)) {
      try {
        const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
        try {
          const items = await loadRoadmap({ init: apiInit(), signal });
          return new Response(renderRoadmapTwin(items), { headers: MARKDOWN_HEADERS });
        } finally {
          clear();
        }
      } catch {
        // fall through to static twin
      }
    }

    // The newspaper's markdown twin, both pages rendered live the same way.
    // Any failure falls through to the static twin below, never to an error page.
    const todayMdLang = request.method === 'GET' ? todayRoute(url.pathname) : null;
    if (todayMdLang) {
      try {
        const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
        try {
          const { markdown } = await liveTodayEdition(todayMdLang, fetch, signal, editionDateFor(url.search));
          return new Response(markdown, { headers: MARKDOWN_HEADERS });
        } finally {
          clear();
        }
      } catch {
        // fall through to static twin
      }
    }

    // The Logbook's markdown twin: the full record, rendered live the same way.
    const logbookMdLang = request.method === 'GET' ? logbookRoute(url.pathname) : null;
    if (logbookMdLang) {
      try {
        const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
        try {
          const { twin } = await liveLogbook(logbookMdLang, fetch, signal, apiInit());
          return new Response(twin, { headers: MARKDOWN_HEADERS });
        } finally {
          clear();
        }
      } catch {
        // fall through to static twin
      }
    }

    const twin = markdownTwinPath(url.pathname);
    if (!twin) return next();

    const res = await env.ASSETS.fetch(new URL(twin, url.origin).href);
    if (!res.ok) return next();

    const body = await res.text();
    return new Response(body, { headers: MARKDOWN_HEADERS });
  } catch {
    return next();
  }
}
