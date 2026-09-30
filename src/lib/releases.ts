/** Build-time latest-release lookup for an experiment's GitHub repository.
 *  Result is baked into the plate at build time — no client-side fetch, no
 *  exposed token. Every failure path resolves to null and logs one warning
 *  line; the build never fails because a release could not be read. */
import { parseGitHubUrl } from './github-sync';

export interface ReleaseInfo {
  version: string; // tag_name verbatim, e.g. 'v0.9.0'
  publishedAt: string; // ISO, published_at ?? created_at
  url: string; // html_url of the release page
}

const TIMEOUT_MS = 5000;

const cache = new Map<string, Promise<ReleaseInfo | null>>();

function warn(scope: string, reason: string): void {
  console.warn(`releases: ${scope}: ${reason} — plate release segment omitted`);
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) return true;
  return (err as { name?: string } | null)?.name === 'AbortError';
}

async function fetchRelease(github: string): Promise<ReleaseInfo | null> {
  const parsed = parseGitHubUrl(github);
  if (!parsed) {
    warn(github, 'no repository in github URL');
    return null;
  }
  const slug = `${parsed.owner}/${parsed.repo}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'univerlab-site',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.github.com/repos/${slug}/releases/latest`, {
      headers,
      signal: ctrl.signal,
    });
    if (res.status === 404) {
      warn(slug, 'no published release (404)');
      return null;
    }
    if (res.status === 403 || res.status === 429) {
      warn(slug, `rate limited (HTTP ${res.status})`);
      return null;
    }
    if (!res.ok) {
      warn(slug, `HTTP ${res.status}`);
      return null;
    }
    let body: {
      tag_name?: string;
      published_at?: string | null;
      created_at?: string | null;
      html_url?: string;
      draft?: boolean;
      prerelease?: boolean;
    };
    try {
      body = (await res.json()) as typeof body;
    } catch (err) {
      warn(slug, `invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    const version = typeof body?.tag_name === 'string' ? body.tag_name.trim() : '';
    const publishedAt = body?.published_at ?? body?.created_at ?? '';
    if (!version || !publishedAt) {
      warn(slug, 'payload missing tag_name/published_at');
      return null;
    }
    if (body.draft || body.prerelease) {
      warn(slug, 'draft/prerelease release — omitted');
      return null;
    }
    return {
      version,
      publishedAt,
      url: body.html_url || `https://github.com/${slug}/releases/tag/${version}`,
    };
  } catch (err) {
    warn(
      slug,
      isAbortError(err)
        ? `timeout after ${TIMEOUT_MS} ms`
        : `network error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function latestRelease(github: string): Promise<ReleaseInfo | null> {
  const hit = cache.get(github);
  if (hit) return hit;
  const p = fetchRelease(github);
  cache.set(github, p);
  return p;
}

export function releaseAgeLabel(publishedAt: string, locale: string, now: Date = new Date()): string {
  const ms = Date.parse(publishedAt);
  if (Number.isNaN(ms)) return '';
  const days = Math.max(0, Math.floor((now.getTime() - ms) / 86_400_000));
  const [value, unit]: [number, 'day' | 'week' | 'month'] =
    days < 7 ? [days, 'day'] : days < 28 ? [Math.round(days / 7), 'week'] : [Math.round(days / 30.44), 'month'];
  // Unary -value is load-bearing: -0 formats as "0 days ago" while +0 formats
  // as "in 0 days". Do not rewrite as `0 - value` (which yields +0).
  return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-value, unit);
}
