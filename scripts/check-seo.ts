/**
 * Fails the build when the site would reproduce the indexing errors Google
 * reported for univerlab.org on 2026-09-28.
 *
 * Four invariants, each one a lever that actually moves a metric in Search
 * Console:
 *
 *   1. Every `<loc>` in the built sitemap maps to a real HTML file that is not
 *      `noindex` — the "Excluded by noindex" report. A page that cannot be
 *      indexed must not be advertised as indexable.
 *   2. Every retired route and every docs rename has a `_redirects` rule — the
 *      "Not found (404)" report for URLs we removed or renamed.
 *   3. No built docs page links to a `.md` URL — the third of the 404s, and the
 *      one that mints fresh broken URLs every time a repo's docs change.
 *   4. `llms.txt` only links canonical trailing-slash routes — every
 *      no-slash link is a redirect hop for the agents that read the file.
 *
 * This is the half of the check `astro.config.mjs`'s sitemap `filter` cannot
 * do: the filter sees URL strings at build time, this sees `dist/`. Wired as
 * `postbuild` so `npm run build` fails on a regression. Run on demand:
 * `node scripts/check-seo.ts`.
 */
import { existsSync, globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOCS_BASES, ROOT, STATIC_RULES, docsRoute, readDocsRedirects } from './build-redirects.ts';

const DIST = resolve(ROOT, 'dist');

export type Failure = string;

/** Matches BaseLayout's `<meta name="robots" content="noindex, nofollow" />`. */
const NOINDEX = /<meta\s+name=["']robots["']\s+content=["'][^"']*\bnoindex\b/i;

/** An in-site `href` still pointing at markdown — the bug the plugin fixes. */
const MD_HREF = /<a\b[^>]*\bhref=["']([^"']*\.md(?:#[^"']*)?)["']/gi;

/** A `https://univerlab.org/...` URL written without a trailing slash. */
const SITE_URL = /https:\/\/univerlab\.org(\/[^)\s]*)?/g;

// ---------------------------------------------------------------- sitemap

/** Every `<loc>` across `dist/sitemap-index.xml` and its child sitemaps. */
export function sitemapLocations(dist = DIST): string[] {
  const index = resolve(dist, 'sitemap-index.xml');
  const files = existsSync(index)
    ? [...readFileSync(index, 'utf-8').matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => resolve(dist, new URL(m[1]).pathname.replace(/^\//, '')))
    : globSync('sitemap-*.xml', { cwd: dist }).map((f) => resolve(dist, f));

  const locs: string[] = [];
  for (const file of files) {
    if (!existsSync(file) || file === index) continue;
    for (const m of readFileSync(file, 'utf-8').matchAll(/<loc>([^<]+)<\/loc>/g)) locs.push(m[1]);
  }
  return locs;
}

/** The file a sitemap `<loc>` should have built, or null if it did not. */
export function htmlFileForPath(pathname: string, dist = DIST): string | null {
  const rel = pathname.replace(/^\/+/, '');
  for (const candidate of rel === '' ? ['index.html'] : [`${rel}index.html`, rel]) {
    const file = resolve(dist, candidate);
    if (existsSync(file) && file.endsWith('.html')) return file;
  }
  return null;
}

/**
 * Every advertised URL must be a 200 indexable page. Checks existence and
 * `noindex` separately so the message names which one broke.
 */
export function checkSitemap(dist = DIST): Failure[] {
  const failures: Failure[] = [];
  const locs = sitemapLocations(dist);
  if (locs.length === 0) return ['sitemap: no <loc> found — the sitemap did not build'];

  for (const loc of locs) {
    const { pathname } = new URL(loc);
    const file = htmlFileForPath(pathname, dist);
    if (!file) {
      failures.push(`sitemap: ${loc} has no built HTML file`);
      continue;
    }
    if (NOINDEX.test(readFileSync(file, 'utf-8'))) {
      failures.push(`sitemap: ${loc} is noindex — drop it from the sitemap filter instead`);
    }
  }
  return failures;
}

// ------------------------------------------------------------- redirects

function ruleLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** `from to status` → the `from` alone, for membership tests. */
function sourceOf(rule: string): string {
  return rule.split(/\s+/)[0];
}

/**
 * The retired routes and docs renames must all be redirected. The static block
 * is asserted verbatim so an edit to it cannot quietly drop a 301; the
 * generated ones are derived from their sources, so a new sibling doc or a new
 * rename is covered the moment the build runs.
 */
export function checkRedirects(dist = DIST): Failure[] {
  const candidates = [resolve(dist, '_redirects'), resolve(ROOT, 'public/_redirects')];
  const file = candidates.find((f) => existsSync(f));
  if (!file) return ['_redirects: not found in dist/ or public/'];

  const lines = ruleLines(readFileSync(file, 'utf-8'));
  const sources = new Set(lines.map(sourceOf));
  const failures: Failure[] = [];

  for (const rule of STATIC_RULES) {
    if (!lines.includes(rule)) failures.push(`_redirects: missing static rule "${rule}"`);
  }
  for (const [id, slugs] of Object.entries(readDocsRedirects())) {
    for (const [from, to] of Object.entries(slugs)) {
      const rule = `${docsRoute(id, from)} ${docsRoute(id, to)} 301`;
      if (!lines.includes(rule)) failures.push(`_redirects: missing docs rename rule "${rule}"`);
    }
  }
  for (const [id, base] of Object.entries(DOCS_BASES)) {
    const basePath = resolve(ROOT, base);
    if (!existsSync(basePath)) continue;
    for (const md of globSync('**/*.md', { cwd: basePath })) {
      const source = `/${id}/docs/${md.replace(/\.md$/, '')}.md`;
      if (!sources.has(source)) failures.push(`_redirects: ${source} is crawled as a URL but has no rule`);
    }
  }
  return failures;
}

// ------------------------------------------------------------ docs links

/**
 * A docs page must not link to a `.md` URL. The plugin rewrites these, so a
 * hit means the plugin stopped applying — a fail-open regression that would
 * otherwise surface only in Search Console weeks later.
 */
export function checkDocsLinks(dist = DIST): Failure[] {
  const failures: Failure[] = [];
  for (const file of globSync('*/docs/**/index.html', { cwd: dist })) {
    for (const m of readFileSync(resolve(dist, file), 'utf-8').matchAll(MD_HREF)) {
      failures.push(`${file}: links to markdown URL "${m[1]}"`);
    }
  }
  return failures;
}

// --------------------------------------------------------------- llms.txt

/**
 * Agents follow every link in `llms.txt`, so a no-slash URL is a redirect hop
 * per page. The root, the bare origin and URLs with a file extension (assets)
 * are the only forms allowed through.
 */
export function checkLlmsTxt(dist = DIST): Failure[] {
  const file = [resolve(dist, 'llms.txt'), resolve(ROOT, 'public/llms.txt')].find((f) => existsSync(f));
  if (!file) return ['llms.txt: not found in dist/ or public/'];

  const failures: Failure[] = [];
  for (const m of readFileSync(file, 'utf-8').matchAll(SITE_URL)) {
    const path = m[1] ?? '/';
    if (path === '/' || path.endsWith('/') || /\/[^/]+\.[a-z0-9]+$/i.test(path)) continue;
    failures.push(`llms.txt: "${m[0]}" is not the canonical trailing-slash form`);
  }
  return failures;
}

export function checkAll(dist = DIST): Failure[] {
  return [...checkSitemap(dist), ...checkRedirects(dist), ...checkDocsLinks(dist), ...checkLlmsTxt(dist)];
}

function main(): void {
  if (!existsSync(DIST)) {
    console.log('check-seo: dist/ not found, skipping.');
    return;
  }
  const failures = checkAll(DIST);
  if (failures.length > 0) {
    console.error(`\n✗ indexing check: ${failures.length} violation(s)\n`);
    for (const f of failures) console.error(`  • ${f}`);
    console.error('');
    process.exit(1);
  }
  console.log(`✓ indexing check: ${sitemapLocations(DIST).length} sitemap URLs indexable, redirects and doc links clean.`);
}

const isDirectRun = process.argv[1] && /(?:^|[/\\])check-seo\.(?:ts|js)$/.test(process.argv[1]);
if (isDirectRun) main();
