import {
  renderStatusTwin,
  statusTwinRoute,
  type Entry,
  type Lang,
  type RoadmapItem,
} from './status-twin';

/** Payloads the two public endpoints return. The arrays are optional: a body
 *  with an unexpected shape renders as an empty section, never a 500. */
interface RoadmapPayload {
  items?: RoadmapItem[];
}
interface EntriesPayload {
  entries?: Entry[];
}

const MARKDOWN_EXTS = new Set(['md', 'json', 'png', 'svg', 'xml', 'txt', 'mp4']);

// Path prefixes that only ever serve build output, never a page. Astro emits
// hashed assets under /_astro/, and a hashed filename carries no extension we
// can enumerate, so the prefix is the reliable guard.
const ASSET_PREFIXES = ['/_astro/'];

/** Public announcements API: reads only — no Authorization, never `state=all`. */
const API = 'https://announcements.univerlab.org';

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

/** One public GET: edge-cached for 5 minutes, aborted after 3 s, `!ok` throws.
 *  Throwing is the contract — the caller falls back to the static twin. */
async function apiJson<T>(path: string): Promise<T> {
  const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}`, {
      signal,
      cf: { cacheTtl: API_CACHE_TTL, cacheEverything: true },
    } as CfFetchInit);
    if (!res.ok) throw new Error(`announcements ${path} → ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clear();
  }
}

/** Both public endpoints, in parallel, rendered for `lang`. Rejects on any
 *  failure — the caller's catch is what degrades to the static twin. */
async function liveStatusTwin(lang: Lang): Promise<string> {
  const [roadmap, log] = await Promise.all([
    apiJson<RoadmapPayload>('/roadmap?limit=100'),
    apiJson<EntriesPayload>('/?limit=20'),
  ]);
  return renderStatusTwin({
    lang,
    roadmap: Array.isArray(roadmap.items) ? roadmap.items : [],
    entries: Array.isArray(log.entries) ? log.entries : [],
  });
}

export async function onRequest(context: {
  request: Request;
  env: { ASSETS: { fetch: (input: string | Request) => Promise<Response> } };
  next: () => Promise<Response>;
}): Promise<Response> {
  const { request, env, next } = context;

  if (!wantsMarkdown(request.headers.get('Accept'))) {
    return next();
  }

  try {
    const url = new URL(request.url);

    // The status routes render live — this runs before markdownTwinPath, which
    // would return null for `/status/index.md` and never ask for them.
    const lang = statusTwinRoute(url.pathname);
    if (lang) {
      try {
        return new Response(await liveStatusTwin(lang), { headers: MARKDOWN_HEADERS });
      } catch {
        // API down, non-OK or past 3 s: fall through to the static twin below,
        // so an outage degrades to today's behaviour and never to an error page.
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
