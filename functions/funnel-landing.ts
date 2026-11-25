/**
 * Cookieless campaign landing recorder for univerlab.org.
 *
 * When a visitor loads a site page carrying valid `utm_*` query
 * parameters, one aggregate `landing` data point goes to the Cloudflare
 * Analytics Engine binding (`FUNNEL`, dataset `univerlab_funnel`): the
 * event name, the normalized pathname, the sanitized UTM fields and the
 * Cloudflare country. Fire-and-forget inside try/catch, degrading
 * silently when the binding is absent — the response never waits for it.
 *
 * Never recorded: IP addresses, raw user-agents, arbitrary query
 * strings, or cookies. Same privacy posture as
 * `workers/get/src/index.ts`.
 */

/** Lowercase letters, digits and dashes, 1–64 chars. */
const UTM_RE = /^[a-z0-9-]{1,64}$/;

/** `utm_content` allows a longer tail, 1–128 chars. */
const UTM_CONTENT_RE = /^[a-z0-9-]{1,128}$/;

export interface FunnelUtm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
}

/** Minimal Analytics Engine surface: the binding is optional in dev. */
export interface FunnelDataset {
  writeDataPoint(point: {
    indexes: string[];
    blobs: string[];
    doubles: number[];
  }): void;
}

export interface FunnelEnv {
  FUNNEL?: FunnelDataset;
}

type CfRequest = Request & { cf?: { country?: string } };

function cleanUtm(raw: string | null, re: RegExp): string | undefined {
  if (raw === null) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === '') return undefined;
  return re.test(v) ? v : undefined;
}

/**
 * Pick the valid `utm_*` fields out of `search` (the `parseUtm`
 * equivalent for the edge: this file never imports from `src/`).
 * Anything missing, empty, over-long or outside `a-z0-9-` is dropped.
 */
export function parseUtmParams(search: URLSearchParams): FunnelUtm {
  const out: FunnelUtm = {};
  const source = cleanUtm(search.get('utm_source'), UTM_RE);
  const medium = cleanUtm(search.get('utm_medium'), UTM_RE);
  const campaign = cleanUtm(search.get('utm_campaign'), UTM_RE);
  const content = cleanUtm(search.get('utm_content'), UTM_CONTENT_RE);
  if (source !== undefined) out.utm_source = source;
  if (medium !== undefined) out.utm_medium = medium;
  if (campaign !== undefined) out.utm_campaign = campaign;
  if (content !== undefined) out.utm_content = content;
  return out;
}

/** Built output only — hashed names carry no enumerable extension. */
const ASSET_PREFIXES = ['/_astro/'];

/**
 * Machine endpoints speak JSON or MCP, never HTML — not page landings.
 * Matches exact paths and their subpaths only, never a longer page slug.
 */
function isMachinePath(pathname: string): boolean {
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) return true;
  if (pathname.startsWith('/api/')) return true;
  return false;
}

/** Markdown twins, data feeds and binary assets are not page landings. */
const SKIP_EXTS = new Set([
  'md',
  'json',
  'png',
  'svg',
  'xml',
  'txt',
  'mp4',
  'ico',
  'css',
  'js',
  'webp',
  'avif',
  'woff2',
  'map',
]);

/** Scanner probes are not campaign landings and leave no trace. */
const SCANNER_SLUGS = new Set([
  'wp',
  'wordpress',
  'blog',
  'admin',
  'login',
  'wp-admin',
  'xmlrpc',
]);

/** Tool ids for `copy_install`: same `a-z0-9-` shape, 1–64 chars. */
export const TOOL_RE = /^[a-z0-9-]{1,64}$/;

/**
 * Lowercase, strip a trailing slash (except the root), cap the length —
 * a referrer-host-style aggregate key, never a raw URL.
 */
export function normalizePathname(pathname: string): string {
  let p = pathname.toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (p === '') p = '/';
  return p.slice(0, 256);
}

/** The first path segment, skipping a leading `es` language prefix. */
export function landingSlug(pathname: string): string {
  const segs = pathname
    .toLowerCase()
    .split('/')
    .filter((s) => s !== '');
  if (segs.length === 0) return '';
  const first = segs[0] === 'es' ? (segs[1] ?? '') : segs[0];
  return first.split('.')[0];
}

function writePoint(
  funnel: FunnelDataset | null | undefined,
  req: Request,
  name: string,
  tool: string,
  path: string,
  utm: FunnelUtm,
): void {
  if (!funnel) return;
  try {
    funnel.writeDataPoint({
      // Grouping key. Analytics Engine allows exactly one index.
      indexes: [name],
      blobs: [
        name,
        tool,
        path,
        utm.utm_source ?? '',
        utm.utm_medium ?? '',
        utm.utm_campaign ?? '',
        utm.utm_content ?? '',
        (req as CfRequest).cf?.country ?? '',
      ],
      doubles: [1],
    });
  } catch {
    // Telemetry never breaks the page.
  }
}

/**
 * Record one aggregate `landing` data point for a page load that carries
 * valid `utm_*` parameters. Skips asset prefixes, machine endpoints,
 * markdown/data twins, scanner slugs and loads without valid UTM. Fire-and-forget: never
 * throws, never awaits — the caller must not wait for it. `env` is
 * `unknown` so any middleware env object passes without a cast; the
 * binding is read structurally and everything degrades silently.
 */
export function recordLanding(request: Request, env: unknown): void {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') return;
    const url = new URL(request.url);
    const { pathname } = url;
    if (ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return;
    if (isMachinePath(pathname)) return;
    const last = pathname.split('/').pop() || '';
    if (last.includes('.')) {
      const ext = last.split('.').pop()!.toLowerCase();
      if (SKIP_EXTS.has(ext)) return;
    }
    if (SCANNER_SLUGS.has(landingSlug(pathname))) return;
    const utm = parseUtmParams(url.searchParams);
    if (Object.keys(utm).length === 0) return;
    writePoint(
      (env as FunnelEnv | null | undefined)?.FUNNEL,
      request,
      'landing',
      '',
      normalizePathname(pathname),
      utm,
    );
  } catch {
    // A malformed URL or a broken binding never breaks the response.
  }
}

/** Shared writer for `POST /api/event`: same aggregate shape as landings. */
export function recordFunnelEvent(
  request: Request,
  env: FunnelEnv,
  name: string,
  tool: string,
  path: string,
  utm: FunnelUtm,
): void {
  try {
    writePoint(env.FUNNEL, request, name, tool, path, utm);
  } catch {
    // Never throws.
  }
}
