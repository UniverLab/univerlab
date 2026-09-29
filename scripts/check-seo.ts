/**
 * Fails the build when the site would reproduce the indexing errors Google
 * reported for univerlab.org on 2026-09-28, or the meta-description errors
 * Bing reported on 2026-09-29.
 *
 * Six invariants, each one a lever that actually moves a metric in Search
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
 *   5. Every indexable page carries a distinct meta description of 120–160
 *      characters — Bing's "meta description too short" report. Missing, too
 *      short, too long, or duplicated descriptions fail with the URL + length.
 *   6. Every indexable page carries a distinct `<title>` of 30–60 characters —
 *      the too-short/too-long/duplicate title reports of 2026-09-29. Failures
 *      name the URL and the length.
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

/** Matches BaseLayout's `<meta name="description" …>` — Astro always emits
 *  double-quoted attributes, so the value may hold apostrophes but never a
 *  bare double quote. */
const META_DESC = /<meta\s+name="description"\s+content="([^"]*)"/i;

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

// ----------------------------------------------------- meta descriptions

/**
 * Every indexable page (each dist index.html without `noindex`) must carry a
 * distinct meta description of 120–160 characters — Bing's "meta description
 * too short" report of 2026-09-29. A missing tag, a length outside the window,
 * or an exact duplicate across two indexable pages each fail, naming the URL
 * and its length. `404.html` is outside the glob by construction.
 */
export function checkMetaDescriptions(dist = DIST): Failure[] {
  const failures: Failure[] = [];
  const seen = new Map<string, string>();
  for (const file of globSync('**/index.html', { cwd: dist })) {
    const html = readFileSync(resolve(dist, file), 'utf-8');
    if (NOINDEX.test(html)) continue;
    const url = file === 'index.html' ? '/' : `/${file.replace(/index\.html$/, '')}`;
    const m = html.match(META_DESC);
    if (!m) {
      failures.push(`${url}: no meta description`);
      continue;
    }
    const desc = m[1];
    if (desc.length < 120 || desc.length > 160) {
      failures.push(`${url}: description is ${desc.length} chars (want 120–160)`);
    }
    const first = seen.get(desc);
    if (first !== undefined) {
      failures.push(`${url}: description duplicates ${first} (${desc.length} chars)`);
    } else {
      seen.set(desc, url);
    }
  }
  return failures;
}

// ---------------------------------------------------------------- titles

/** Matches BaseLayout's `<title>…</title>` — the same string is emitted as
 *  `og:title` and `twitter:title`, so measuring it once covers all three. */
const TITLE = /<title>([^<]*)<\/title>/i;

/**
 * Entities a built title can carry (Astro escapes the `&`, `<`, `>` and quotes
 * of a frontmatter or dictionary string), back to the characters they name.
 * `&amp;` is replaced last so a literal `&amp;lt;` decodes to `&lt;` and not
 * to `<` — lengths are counted on the string a reader sees in the tab.
 */
export function decodeTitle(s: string): string {
  return s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, '&');
}

/**
 * Every indexable page (each dist index.html without `noindex`) must carry a
 * `<title>` of 30–60 characters that no other indexable page shares — the
 * title report of 2026-09-29: 51 titles under 30, a home title over 60, and
 * two titles repeated across languages. A missing tag, a length outside the
 * window, or an exact duplicate each fail, naming the URL (and the length).
 * Titles shorter than 40 are legitimate when the page title itself is short —
 * 30 is the floor, not the target. `404.html` is outside the glob by
 * construction, and the noindex `today` pages are skipped like everywhere else.
 */
export function checkTitles(dist = DIST): Failure[] {
  const failures: Failure[] = [];
  const seen = new Map<string, string>();
  for (const file of globSync('**/index.html', { cwd: dist })) {
    const html = readFileSync(resolve(dist, file), 'utf-8');
    if (NOINDEX.test(html)) continue;
    const url = file === 'index.html' ? '/' : `/${file.replace(/index\.html$/, '')}`;
    const m = html.match(TITLE);
    if (!m) {
      failures.push(`${url}: no title`);
      continue;
    }
    const title = decodeTitle(m[1]);
    const len = title.length;
    if (len < 30 || len > 60) {
      failures.push(`${url}: title is ${len} chars (want 30–60)`);
    }
    const first = seen.get(title);
    if (first !== undefined) {
      failures.push(`${url}: title duplicates ${first} (${len} chars)`);
    } else {
      seen.set(title, url);
    }
  }
  return failures;
}

/** How many built pages checkTitles sees — printed in the success line. */
function indexableCount(dist: string): number {
  let n = 0;
  for (const file of globSync('**/index.html', { cwd: dist })) {
    if (!NOINDEX.test(readFileSync(resolve(dist, file), 'utf-8'))) n++;
  }
  return n;
}

export function checkAll(dist = DIST): Failure[] {
  return [...checkSitemap(dist), ...checkRedirects(dist), ...checkDocsLinks(dist), ...checkLlmsTxt(dist), ...checkMetaDescriptions(dist), ...checkTitles(dist)];
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
  console.log(
    `✓ indexing check: ${sitemapLocations(DIST).length} sitemap URLs indexable, ${indexableCount(DIST)} pages with distinct 30–60 char titles, redirects and doc links clean.`,
  );
}

const isDirectRun = process.argv[1] && /(?:^|[/\\])check-seo\.(?:ts|js)$/.test(process.argv[1]);
if (isDirectRun) main();
