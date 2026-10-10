import { renderStatusTwin, statusTwinRoute, type Lang } from './status-twin';
import { loadEntries, loadRoadmap } from '../src/lib/lab-feed';

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

/** Both public endpoints, in parallel, rendered for `lang`. Rejects on any
 *  failure — the caller's catch is what degrades to the static twin. The two
 *  reads share one 3 s deadline and one edge-cache policy. */
async function liveStatusTwin(lang: Lang): Promise<string> {
  const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
  try {
    const [roadmap, log] = await Promise.all([
      loadRoadmap({ init: apiInit(), signal }),
      loadEntries({ init: apiInit(), signal, limit: 20 }),
    ]);
    return renderStatusTwin({ lang, roadmap, entries: log });
  } finally {
    clear();
  }
}

export async function onRequest(context: {
  request: Request;
  env: { ASSETS: { fetch: (input: string | Request) => Promise<Response> } };
  next: () => Promise<Response>;
}): Promise<Response> {
  const { request, env, next } = context;

  // `/mcp` (and `/mcp/server-card`) speak MCP Streamable HTTP, not markdown:
  // an MCP client's Accept can carry `text/event-stream` or `*/*`, and without
  // this guard `/mcp` would be rewritten to `/mcp/index.md`. Pass through
  // before anything else looks at the request.
  const { pathname } = new URL(request.url);
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) return next();

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
