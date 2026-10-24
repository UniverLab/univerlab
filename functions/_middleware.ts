import { renderStatusTwin, statusTwinRoute, type Lang } from './status-twin';
import { renderRoadmapTwin, roadmapTwinRoute } from './roadmap-twin';
import { loadEntries, loadRoadmap } from '../src/lib/lab-feed';
import { buildPool } from '../src/lib/science-filter';
import {
  editionDate,
  otdUrl,
  todayEditionHtml,
  todayEditionMarkdown,
  todayRoute,
} from '../src/lib/today-edition';
import { roadmapLanesHtml } from '../src/lib/roadmap-board';
import { en } from '../src/i18n/en';

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
 *  policy. Both share one 3 s deadline. */
async function liveTodayEdition(
  lang: 'en' | 'es',
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<{ html: string; markdown: string }> {
  const date = editionDate();
  const otd = await fetchImpl(otdUrl(lang, date), {
    headers: { 'User-Agent': 'UniverLab/1.0 (https://univerlab.org)' },
    cf: { cacheTtl: 3600, cacheEverything: true },
    signal,
  } as RequestInit);
  if (!otd.ok) throw new Error(`otd ${otd.status}`);
  const data = (await otd.json()) as Parameters<typeof buildPool>[0];
  const entries = await loadEntries({ fetchImpl, init: apiInit(), signal });
  const feed = { facts: buildPool(data, lang), lab: entries };
  return {
    html: todayEditionHtml(feed, lang, date),
    markdown: todayEditionMarkdown(feed, lang, date),
  };
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

  const accept = request.headers.get('Accept');

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

  // The newspaper: fetch the static page, then set its #edition to the day's
  // edition. Any failure (timeout 3 s, non-OK) serves the static page, whose
  // client script fills #edition with the same renderer.
  const todayLang = request.method === 'GET' && !wantsMarkdown(accept) ? todayRoute(pathname) : null;
  if (todayLang) {
    const staticRes = await next();
    if (!staticRes.ok) return staticRes;
    try {
      const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
      try {
        const { html } = await liveTodayEdition(todayLang, fetch, signal);
        const RW = (globalThis as unknown as { HTMLRewriter?: unknown }).HTMLRewriter;
        if (typeof RW === 'function') {
          const rewriter = new (RW as new () => {
            on(s: string, h: unknown): unknown;
            transform(r: Response): Response;
          })();
          (rewriter.on as (s: string, h: unknown) => void)('#edition', {
            element(el: { setInnerContent(c: string, o: unknown): void }) {
              el.setInnerContent(html, { html: true });
            },
          });
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

  if (!wantsMarkdown(accept)) {
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

    // The newspaper's markdown twin, rendered live the same way. Any failure
    // falls through to the static twin below, never to an error page.
    const todayMdLang = request.method === 'GET' ? todayRoute(url.pathname) : null;
    if (todayMdLang) {
      try {
        const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
        try {
          const { markdown } = await liveTodayEdition(todayMdLang, fetch, signal);
          return new Response(markdown, { headers: MARKDOWN_HEADERS });
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
