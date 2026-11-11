import { renderStatusTwin, statusTwinRoute, type Lang } from './status-twin';
import { renderRoadmapTwin, roadmapTwinRoute } from './roadmap-twin';
import { loadEntries, loadRoadmap } from '../src/lib/lab-feed';
import { buildPool } from '../src/lib/science-filter';
import {
  editionDateFor,
  otdUrl,
  todayEditionHtml,
  todayEditionMarkdown,
  todayRoute,
} from '../src/lib/today-edition';
import { roadmapLanesHtml } from '../src/lib/roadmap-board';
import { en } from '../src/i18n/en';
import { validateAuditDocument } from '../src/lib/audit/validate-document';
import { auditPageHtml } from '../src/lib/audit/render';
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
 *  policy. Both share one 3 s deadline. */
async function liveTodayEdition(
  lang: 'en' | 'es',
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  date: Date,
): Promise<{ html: string; markdown: string }> {
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
  const entries = loadEntries({ fetchImpl, init: apiInit(), signal });
  const [data, lab] = await Promise.all([otd, entries]);
  const feed = { facts: buildPool(data, lang), lab };
  return {
    html: todayEditionHtml(feed, lang, date),
    markdown: todayEditionMarkdown(feed, lang, date),
  };
}

/** One public read for the log, rendered for `lang`. Rejects on any failure —
 *  the caller's catch is what degrades to the static twin. The read is
 *  edge-cached behind the shared 3 s deadline. The roadmap is not fetched:
 *  the twin only points at `/roadmap/index.md`, which renders the board. */
async function liveStatusTwin(lang: Lang): Promise<string> {
  const { signal, clear } = timeoutSignal(API_TIMEOUT_MS);
  try {
    const entries = await loadEntries({ init: apiInit(), signal, limit: 20 });
    return renderStatusTwin({ lang, entries });
  } finally {
    clear();
  }
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
}

const AUDIT_PAGE_RE = /^\/audits\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/?$/;
const AUDIT_ASSET_RE = /^\/audits\/([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/assets\/(.+)$/;
const AUDIT_TWIN_RE = /^\/audits\/[^/]+\/index\.md$/;

const AUDIT_NO_STORE: Record<string, string> = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

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

/** A public, valid audit document, or null when the route must answer 404:
 *  no binding, no file, invalid JSON, a contract violation or anything but
 *  `visibility: 'public'`. Private audits answer as if they did not exist. */
async function loadPublicAudit(
  env: { AUDITS?: AuditR2Bucket },
  slug: string,
): Promise<AuditDocument | null> {
  try {
    if (!env.AUDITS) return null;
    const obj = await env.AUDITS.get(`${slug}/audit.json`);
    if (!obj) return null;
    const doc = JSON.parse(await obj.text()) as AuditDocument;
    if (validateAuditDocument(doc).errors.length > 0) return null;
    if (typeof doc !== 'object' || doc === null || doc.visibility !== 'public') return null;
    if (!doc.assets.every((a) => safeAuditAssetPath(a.path))) return null;
    return doc;
  } catch {
    return null;
  }
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
  };
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

  // Audits render at request time from the private R2 bucket, never from the
  // repo — and never as a markdown twin. This runs before the twin logic.
  if (AUDIT_TWIN_RE.test(pathname)) return next();
  if (request.method === 'GET' || request.method === 'HEAD') {
    const page = !wantsMarkdown(accept) ? AUDIT_PAGE_RE.exec(pathname) : null;
    if (page) {
      const slug = page[1];
      const doc = await loadPublicAudit(env, slug);
      if (!doc) return next();
      const url = new URL(request.url);
      const shell = await env.ASSETS.fetch(new URL('/audits/', url.origin).href);
      if (!shell.ok) return next();
      const html = auditPageHtml(doc, slug);
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
      const slug = asset[1];
      let rest = asset[2];
      try {
        rest = decodeURIComponent(rest);
      } catch {
        // A malformed escape cannot name a catalogue path; leave it encoded.
      }
      const doc = await loadPublicAudit(env, slug);
      const entry = doc?.assets.find((a) => a.path === `assets/${rest}` || a.path === rest) ?? null;
      if (!doc || !entry || !env.AUDITS) return next();
      try {
        const full = await env.AUDITS.get(`${slug}/${entry.path}`);
        if (!full) return next();
        const type = full.httpMetadata?.contentType || auditContentType(entry.path);
        const headers: Record<string, string> = {
          'Content-Type': type,
          'Accept-Ranges': 'bytes',
          'ETag': full.etag,
          ...AUDIT_NO_STORE,
        };
        const range = parseAuditRange(request.headers.get('Range'), full.size);
        if (range) {
          const obj = await env.AUDITS.get(`${slug}/${entry.path}`, { range });
          if (!obj) return next();
          headers['Content-Range'] = `bytes ${range.offset}-${range.offset + range.length - 1}/${full.size}`;
          headers['Content-Length'] = String(range.length);
          return new Response(obj.body as BodyInit, { status: 206, headers });
        }
        headers['Content-Length'] = String(full.size);
        return new Response(full.body as BodyInit, { status: 200, headers });
      } catch {
        return next();
      }
    }
  } else if (AUDIT_PAGE_RE.test(pathname) || AUDIT_ASSET_RE.test(pathname)) {
    return next();
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
        const { html } = await liveTodayEdition(todayLang, fetch, signal, editionDateFor(new URL(request.url).search));
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

  // A path ending in /index.md asks for the markdown twin whatever the Accept
  // header says — an agent that GETs /status/index.md with `Accept: */*` is
  // reading the twin, and a bare next() would hand it the raw build artifact
  // with no live render. Every other path still needs text/markdown in Accept.
  if (!wantsMarkdown(accept) && !pathname.endsWith('/index.md')) {
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
          const { markdown } = await liveTodayEdition(todayMdLang, fetch, signal, editionDateFor(url.search));
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
