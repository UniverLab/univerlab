/**
 * Fails the build when the site would reproduce the indexing errors Google
 * reported for univerlab.org on 2026-09-28, or the meta-description errors
 * Bing reported on 2026-09-29.
 *
 * Eight invariants, each one a lever that actually moves a metric in Search
 * Console or in a generative engine's answer:
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
 *   7. Every emitted JSON-LD block parses, every docs page is exactly one
 *      self-contained `@graph` (TechArticle + BreadcrumbList + every `@id` it
 *      references), every experiment landing page carries its crumb, and each
 *      date agrees with itself across `dateModified`, `article:modified_time`
 *      and the visible "Last updated" line. This is the schema test: the parse
 *      is what proves validator.schema.org would receive valid JSON.
 *   8. Every docs source file has its built page — the guard for a sibling
 *      checkout that went missing, which `getCollection` reports only as a
 *      warning and an empty collection.
 *
 * This is the half of the check `astro.config.mjs`'s sitemap `filter` cannot
 * do: the filter sees URL strings at build time, this sees `dist/`. Wired as
 * `postbuild` so `npm run build` fails on a regression. Run on demand:
 * `node scripts/check-seo.ts`.
 */
import { existsSync, globSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOCS_BASES, ROOT, STATIC_RULES, docsRoute, readDocsRedirects } from './build-redirects.ts';
import { NOINDEX } from './build-md.ts';
import { MAX_FULL_BYTES } from './build-llms.ts';
import { experiments, type Experiment } from '../src/lib/experiments.ts';

const DIST = resolve(ROOT, 'dist');

export type Failure = string;

/** An in-site `href` still pointing at markdown — the bug the plugin fixes. */
const MD_HREF = /<a\b[^>]*\bhref=["']([^"']*\.md(?:#[^"']*)?)["']/gi;

/** A `https://univerlab.org/...` URL written without a trailing slash. */
const SITE_URL = /https:\/\/univerlab\.org(\/[^)\s]*)?/g;

/** A generated documentation line: `- [<title>](<canonical>index.md): <desc>`.
 *  Core/optional lines link trailing-slash routes, so the `index.md` tail
 *  matches only the generated `## Documentation` section. */
const DOCS_LINE = /^- \[.+?\]\(https:\/\/univerlab\.org\/[^()\s]*?index\.md\): /gm;

/** How many generated documentation lines a copy of `llms.txt` carries. */
export function llmsDocsLines(text: string): number {
  return text.match(DOCS_LINE)?.length ?? 0;
}

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
  const text = readFileSync(file, 'utf-8');
  for (const m of text.matchAll(SITE_URL)) {
    const path = m[1] ?? '/';
    if (path === '/' || path.endsWith('/') || /\/[^/]+\.[a-z0-9]+$/i.test(path)) continue;
    failures.push(`llms.txt: "${m[0]}" is not the canonical trailing-slash form`);
  }
  // The generated section comes from the same dist/ the sitemap enumerates,
  // so its line count must equal the built docs pages — never drift.
  if (existsSync(dist)) {
    const lines = llmsDocsLines(text);
    const pages = globSync('**/docs/**/index.html', { cwd: dist }).length;
    if (lines !== pages) {
      failures.push(`llms.txt: ${lines} documentation lines for ${pages} built docs pages`);
    }
  }
  return failures;
}

/**
 * Agents follow every link in `llms.txt`, so each one must resolve to a file
 * `dist/` actually serves. Resolver: strip the origin; a trailing slash is a
 * directory (`…/index.html`), a tail with a file extension is served as-is
 * (the `…/index.md` twins), anything else is a directory missing its slash.
 */
export function distFileForLlmsUrl(urlPath: string, dist = DIST): string {
  const rel = urlPath.replace(/^\/+/, '');
  if (rel === '') return resolve(dist, 'index.html');
  if (urlPath.endsWith('/')) return resolve(dist, rel, 'index.html');
  if (/\/[^/]+\.[a-z0-9]+$/i.test(urlPath)) return resolve(dist, rel);
  return resolve(dist, rel, 'index.html');
}

export function checkLlmsLinks(dist = DIST): Failure[] {
  const file = resolve(dist, 'llms.txt');
  if (!existsSync(file)) return ['llms.txt: not found in dist/ — build-llms did not run'];

  const failures: Failure[] = [];
  for (const m of readFileSync(file, 'utf-8').matchAll(SITE_URL)) {
    // A prose URL followed by sentence punctuation still names the page.
    const path = (m[1] ?? '/').replace(/[.,;:!?'"’”)\]]+$/, '') || '/';
    if (!existsSync(distFileForLlmsUrl(path, dist))) {
      failures.push(`llms.txt: "${m[0]}" has no built file`);
    }
  }
  return failures;
}

/** The byte size of `dist/llms-full.txt`, or -1 when it was not built. */
export function llmsFullBytes(dist = DIST): number {
  const file = resolve(dist, 'llms-full.txt');
  return existsSync(file) ? statSync(file).size : -1;
}

export function checkLlmsFull(dist = DIST): Failure[] {
  const size = llmsFullBytes(dist);
  if (size < 0) return ['llms-full.txt: not found in dist/ — build-llms did not run'];
  if (size === 0) return ['llms-full.txt: empty'];
  if (size > MAX_FULL_BYTES) {
    return [`llms-full.txt: ${size} bytes, over the ${MAX_FULL_BYTES} byte limit`];
  }
  return [];
}

/** A `<link rel="alternate" type="text/markdown" …>` twin advertisement —
 *  matched on the type, not the rel: hreflang and the Atom feed already use
 *  `rel="alternate"` on every page. */
const MD_LINK = /<link[^>]*\btype="text\/markdown"[^>]*>/gi;
const MD_LINK_HREF = /href="([^"]*)"/i;

/** Counts for the success line: indexable pages, built twins, emitted links. */
export interface MarkdownTwinStats {
  indexable: number;
  twins: number;
  links: number;
}

export function markdownTwinStats(dist = DIST): MarkdownTwinStats {
  let indexable = 0;
  let links = 0;
  for (const file of globSync('**/index.html', { cwd: dist })) {
    const html = readFileSync(resolve(dist, file), 'utf-8');
    if (NOINDEX.test(html)) continue;
    indexable++;
    links += [...html.matchAll(MD_LINK)].length;
  }
  return { indexable, twins: globSync('**/index.md', { cwd: dist }).length, links };
}

/**
 * Every indexable page advertises exactly its own markdown twin, and the
 * advertised set is exactly the built set: one `<link … type="text/markdown"
 * href="<canonical>index.md">` per indexable `index.html`, no link on
 * noindex pages or on `404.html` (which builds no `index.md`).
 */
export function checkMarkdownTwins(dist = DIST): Failure[] {
  const failures: Failure[] = [];
  const twinFiles = new Set(globSync('**/index.md', { cwd: dist }));
  let links = 0;
  for (const file of globSync('**/index.html', { cwd: dist })) {
    const html = readFileSync(resolve(dist, file), 'utf-8');
    const tags = [...html.matchAll(MD_LINK)];
    const url = file === 'index.html' ? '/' : `/${file.replace(/index\.html$/, '')}`;
    if (NOINDEX.test(html)) {
      if (tags.length > 0) failures.push(`${url}: noindex page must not advertise a markdown twin`);
      continue;
    }
    if (tags.length !== 1) {
      failures.push(`${url}: expected one text/markdown alternate link, found ${tags.length}`);
      continue;
    }
    links++;
    const href = MD_LINK_HREF.exec(tags[0][0])?.[1] ?? '';
    const canonical = html.match(CANONICAL)?.[1] ?? '';
    if (href !== `${canonical}index.md`) {
      failures.push(`${url}: markdown twin link ${JSON.stringify(href)} is not ${JSON.stringify(`${canonical}index.md`)}`);
    }
    if (!href.startsWith('https://univerlab.org/')) {
      failures.push(`${url}: markdown twin link ${JSON.stringify(href)} is not absolute`);
    } else if (!twinFiles.has(new URL(href).pathname.replace(/^\/+/, ''))) {
      failures.push(`${url}: markdown twin ${href} was not built`);
    }
  }
  const notFound = resolve(dist, '404.html');
  // A fresh literal, not MD_LINK: `.test` on a /g regex advances its
  // lastIndex, which would make repeated calls flaky.
  if (existsSync(notFound) && /<link[^>]*\btype="text\/markdown"[^>]*>/i.test(readFileSync(notFound, 'utf-8'))) {
    failures.push('/404.html: must not advertise a markdown twin');
  }
  if (links !== twinFiles.size) {
    failures.push(`markdown twins: ${links} pages advertise a twin but ${twinFiles.size} twins were built`);
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

// ----------------------------------------------------- structured data

/** Matches BaseLayout's `<link rel="canonical" href="…">`. */
const CANONICAL = /<link\s+rel="canonical"\s+href="([^"]+)"/i;
/** Matches BaseLayout's `<meta property="og:type" content="…">`. */
const OG_TYPE = /<meta\s+property="og:type"\s+content="([^"]+)"/i;
/** Matches the `article:modified_time` meta, emitted only alongside a date. */
const ARTICLE_MODIFIED = /<meta\s+property="article:modified_time"\s+content="([^"]+)"/i;
/** The freshness line the docs plugin inserts under the `<h1>`. */
const UPDATED_TIME = /<p class="doc-updated">[\s\S]*?<time datetime="([^"]+)"/;
/** Every freshness line on the page — 0 without a date, 1 with one, never 2. */
const UPDATED_LINE = /<p class="doc-updated">/g;
/** A docs page: `/<id>/docs/…/index.html` — the index included. */
const DOCS_FILE = /^([^/]+)\/docs\/(?:.*\/)?index\.html$/;
/** What to say when a date disagrees with itself: the render cache is stale. */
const STALE_HINT = ' — stale .astro cache? `rm -rf .astro && npm run build`';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every `application/ld+json` body on a built page, raw. What these return is
 *  byte-for-byte what validator.schema.org receives. */
export function jsonLdBlocks(html: string): string[] {
  return [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

/** What a block declares: its own node, or each entry of its `@graph`. */
function nodesOf(block: unknown): unknown[] {
  if (!isRec(block)) return [];
  return Array.isArray(block['@graph']) ? block['@graph'] : [block];
}

/** Every `@id` mentioned anywhere inside `v`, declared or referenced. */
function collectIds(v: unknown, into: Set<string>): void {
  if (Array.isArray(v)) {
    for (const x of v) collectIds(x, into);
    return;
  }
  if (!isRec(v)) return;
  if (typeof v['@id'] === 'string') into.add(v['@id']);
  for (const [k, child] of Object.entries(v)) if (k !== '@id') collectIds(child, into);
}

export interface JsonLdPage {
  /** Path inside dist/, e.g. `gitkit/docs/hooks/index.html`. */
  file: string;
  html: string;
  /** The parsed blocks — each one is a document a validator will read. */
  blocks: unknown[];
  /** Blocks that failed `JSON.parse`. Non-zero fails the build. */
  unparseable: number;
}

/** Parse the JSON-LD of every built page. The parse itself is the proof: a
 *  block that survives here is a block validator.schema.org can read. */
export function readJsonLdPages(dist = DIST): JsonLdPage[] {
  const pages: JsonLdPage[] = [];
  for (const file of globSync('**/index.html', { cwd: dist })) {
    const html = readFileSync(resolve(dist, file), 'utf-8');
    const blocks: unknown[] = [];
    let unparseable = 0;
    for (const raw of jsonLdBlocks(html)) {
      try {
        blocks.push(JSON.parse(raw));
      } catch {
        unparseable++;
      }
    }
    pages.push({ file, html, blocks, unparseable });
  }
  return pages;
}

/** The `@id`s this page's nodes actually define. */
function declaredIds(page: JsonLdPage): Set<string> {
  const ids = new Set<string>();
  for (const block of page.blocks) {
    for (const node of nodesOf(block)) if (isRec(node) && typeof node['@id'] === 'string') ids.add(node['@id']);
  }
  return ids;
}

/** References the page makes that nothing on the page defines. Every `@id`
 *  must resolve inside the page's own graph — a pointer to a node that lives
 *  somewhere else is a node no crawler will find. */
function danglingRefs(page: JsonLdPage): string[] {
  const defined = declaredIds(page);
  const refs = new Set<string>();
  for (const block of page.blocks) collectIds(block, refs);
  return [...refs].filter((id) => !defined.has(id));
}

function findNodes(page: JsonLdPage, type: string): Rec[] {
  const found: Rec[] = [];
  for (const block of page.blocks) {
    for (const node of nodesOf(block)) if (isRec(node) && node['@type'] === type) found.push(node);
  }
  return found;
}

/**
 * A docs page must be one self-contained graph that answers everything FR1
 * asks of it: an article with a headline, description, language, canonical
 * url, author, publisher, experiment and freshness date; a breadcrumb with the
 * four crumb names and their canonical urls; and every `@id` it mentions
 * defined inside the same block.
 */
function checkDocsJsonLd(page: JsonLdPage): Failure[] {
  const failures: Failure[] = [];
  const route = `/${page.file.replace(/index\.html$/, '')}`;
  const fail = (msg: string) => failures.push(`${route}: ${msg}`);
  const segs = route.split('/').filter(Boolean);
  const expId = segs[0];
  const exp = experiments.find((e) => e.id === expId);
  if (!exp) {
    fail('docs route does not name an experiment in the registry');
    return failures;
  }
  if (page.unparseable > 0) return failures; // already reported per block
  if (page.blocks.length !== 1) {
    fail(`expected exactly one JSON-LD block, found ${page.blocks.length}`);
    return failures;
  }

  const block = page.blocks[0];
  if (!isRec(block) || block['@context'] !== 'https://schema.org' || !Array.isArray(block['@graph'])) {
    fail('the block is not a {"@context": "https://schema.org", "@graph": [...]} object');
    return failures;
  }
  const articles = findNodes(page, 'TechArticle');
  const crumbs = findNodes(page, 'BreadcrumbList');
  if (articles.length !== 1) {
    fail(`expected one TechArticle, found ${articles.length}`);
    return failures;
  }
  if (crumbs.length !== 1) {
    fail(`expected one BreadcrumbList, found ${crumbs.length}`);
    return failures;
  }
  const article = articles[0];
  const canonical = page.html.match(CANONICAL)?.[1];
  if (!canonical) fail('no <link rel="canonical"> to anchor url and breadcrumb on');

  // --- the article itself -------------------------------------------------
  const headline = article.headline;
  if (typeof headline !== 'string' || !headline.trim()) fail('TechArticle.headline is empty');
  const metaDesc = page.html.match(META_DESC)?.[1];
  if (metaDesc === undefined) fail('no <meta name="description"> to copy');
  const ogType = page.html.match(OG_TYPE)?.[1];
  if (ogType !== 'article') fail(`og:type is ${JSON.stringify(ogType)}, expected "article" (FR5)`);
  if (typeof article.description !== 'string') fail('TechArticle.description is missing');
  else if (metaDesc !== undefined && article.description !== decodeTitle(metaDesc)) {
    fail('TechArticle.description is not the <meta name="description"> value');
  }
  if (article.inLanguage !== 'en') fail(`TechArticle.inLanguage is ${JSON.stringify(article.inLanguage)}, expected "en"`);
  if (canonical && article.url !== canonical) {
    fail(`TechArticle.url ${JSON.stringify(article.url)} is not the canonical ${canonical}`);
  }
  for (const key of ['author', 'publisher', 'isPartOf'] as const) {
    const ref = article[key];
    if (!isRec(ref) || typeof ref['@id'] !== 'string' || Object.keys(ref).length !== 1) {
      fail(`TechArticle.${key} must be the single reference {"@id": "…"}`);
    }
  }

  // --- freshness: one date, three renderings ------------------------------
  const date = article.dateModified;
  const modMeta = page.html.match(ARTICLE_MODIFIED)?.[1];
  const lineDate = page.html.match(UPDATED_TIME)?.[1];
  const lines = [...page.html.matchAll(UPDATED_LINE)].length;
  if (date !== undefined) {
    if (typeof date !== 'string' || Number.isNaN(Date.parse(date))) {
      fail(`dateModified ${JSON.stringify(date)} is not an ISO date`);
    }
    if (!modMeta) fail('dateModified is set but <meta property="article:modified_time"> is missing');
    else if (modMeta !== date) fail(`article:modified_time ${modMeta} ≠ dateModified ${date}`);
    if (!lineDate) fail('dateModified is set but the page shows no "Last updated" line');
    else if (lineDate !== date) fail(`the visible date ${lineDate} ≠ dateModified ${date}${STALE_HINT}`);
    if (lines > 1) fail(`the page renders ${lines} "Last updated" lines, expected at most 1`);
  } else {
    if (modMeta) fail(`article:modified_time ${modMeta} is set but TechArticle carries no dateModified`);
    if (lineDate) fail(`the page shows "${lineDate}" but TechArticle carries no dateModified${STALE_HINT}`);
  }

  // --- the crumb ----------------------------------------------------------
  const items = Array.isArray(crumbs[0].itemListElement) ? crumbs[0].itemListElement : [];
  const recs = items.filter(isRec);
  const isIndex = segs.length === 2;
  const wantNames = ['UniverLab', exp.name, 'Docs', ...(isIndex ? [] : [typeof headline === 'string' ? headline : ''])];
  const wantItems = [
    'https://univerlab.org/',
    `https://univerlab.org/${expId}/`,
    `https://univerlab.org/${expId}/docs/`,
    ...(isIndex ? [] : [canonical ?? '']),
  ];
  const names = recs.map((i) => i.name);
  const urls = recs.map((i) => i.item);
  const positions = recs.map((i) => i.position);
  if (JSON.stringify(names) !== JSON.stringify(wantNames)) {
    fail(`breadcrumb names are ${JSON.stringify(names)}, expected ${JSON.stringify(wantNames)}`);
  }
  if (JSON.stringify(urls) !== JSON.stringify(wantItems)) {
    fail(`breadcrumb items are ${JSON.stringify(urls)}, expected ${JSON.stringify(wantItems)}`);
  }
  if (JSON.stringify(positions) !== JSON.stringify(wantNames.map((_, i) => i + 1))) {
    fail(`breadcrumb positions are ${JSON.stringify(positions)}, expected 1..${wantNames.length}`);
  }
  for (const u of urls) {
    if (typeof u !== 'string' || !u.endsWith('/')) fail(`breadcrumb item ${JSON.stringify(u)} is not a trailing-slash URL`);
  }

  // --- and it all has to be in ONE graph ----------------------------------
  for (const id of danglingRefs(page)) {
    fail(`@id reference ${id} has no definition in this page's graph`);
  }
  return failures;
}

/**
 * FR2: a landing page carries UniverLab › <Experiment>, and an application
 * node that a docs page may point at must have the `@id` it points with.
 */
function checkExperimentJsonLd(page: JsonLdPage, exp: Experiment, prefix: string): Failure[] {
  const failures: Failure[] = [];
  const at = `/${prefix}${exp.id}/`;
  const fail = (msg: string) => failures.push(`${at}: ${msg}`);
  if (page.unparseable > 0) return failures; // already reported per block

  const crumbs = findNodes(page, 'BreadcrumbList');
  if (crumbs.length !== 1) {
    fail(`expected one BreadcrumbList, found ${crumbs.length}`);
  } else {
    const items = (Array.isArray(crumbs[0].itemListElement) ? crumbs[0].itemListElement : []).filter(isRec);
    const wantNames = ['UniverLab', exp.name];
    const wantItems = [`https://univerlab.org/${prefix}`, `https://univerlab.org/${prefix}${exp.id}/`];
    const names = items.map((i) => i.name);
    const urls = items.map((i) => i.item);
    const positions = items.map((i) => i.position);
    if (JSON.stringify(names) !== JSON.stringify(wantNames)) {
      fail(`breadcrumb names are ${JSON.stringify(names)}, expected ${JSON.stringify(wantNames)}`);
    }
    if (JSON.stringify(urls) !== JSON.stringify(wantItems)) {
      fail(`breadcrumb items are ${JSON.stringify(urls)}, expected ${JSON.stringify(wantItems)}`);
    }
    if (JSON.stringify(positions) !== JSON.stringify([1, 2])) {
      fail(`breadcrumb positions are ${JSON.stringify(positions)}, expected [1, 2]`);
    }
    for (const u of urls) {
      if (typeof u !== 'string' || !u.endsWith('/')) fail(`breadcrumb item ${JSON.stringify(u)} is not a trailing-slash URL`);
    }
  }

  for (const type of ['SoftwareApplication', 'WebApplication']) {
    for (const app of findNodes(page, type)) {
      if (typeof app['@id'] !== 'string') fail(`${type} has no @id, so no docs page can reference it`);
    }
  }
  for (const id of danglingRefs(page)) fail(`@id reference ${id} has no definition on this page`);
  return failures;
}

/** Counts for the success line: how many docs pages know their own freshness. */
export interface JsonLdStats {
  docs: number;
  withDate: number;
  withoutDate: number;
  blocks: number;
  unparseable: number;
}

export function jsonLdStats(dist = DIST): JsonLdStats {
  const stats: JsonLdStats = { docs: 0, withDate: 0, withoutDate: 0, blocks: 0, unparseable: 0 };
  for (const page of readJsonLdPages(dist)) {
    stats.blocks += page.blocks.length;
    stats.unparseable += page.unparseable;
    if (!DOCS_FILE.test(page.file)) continue;
    stats.docs++;
    if (findNodes(page, 'TechArticle').some((a) => typeof a.dateModified === 'string')) stats.withDate++;
    else stats.withoutDate++;
  }
  return stats;
}

/**
 * Parses every emitted JSON-LD block and checks what the spec requires of it:
 * the required fields, the date's three agreeing renderings, and that every
 * `@id` a page mentions is defined by that same page.
 */
export function checkJsonLd(dist = DIST): Failure[] {
  const failures: Failure[] = [];
  const pages = readJsonLdPages(dist);
  const byFile = new Map(pages.map((p) => [p.file, p]));

  for (const page of pages) {
    if (page.unparseable > 0) {
      failures.push(`${page.file}: ${page.unparseable} JSON-LD block(s) are not valid JSON`);
    }
  }

  for (const page of pages) {
    if (DOCS_FILE.test(page.file)) failures.push(...checkDocsJsonLd(page));
  }

  for (const exp of experiments) {
    for (const prefix of ['', 'es/']) {
      const page = byFile.get(`${prefix}${exp.id}/index.html`);
      if (page) failures.push(...checkExperimentJsonLd(page, exp, prefix));
    }
  }

  // Cross-page: a docs `isPartOf` must be a node the experiment's own landing
  // page defines. If those two ever disagree, one of the two builders forked.
  for (const page of pages) {
    const m = DOCS_FILE.exec(page.file);
    if (!m) continue;
    const landing = byFile.get(`${m[1]}/index.html`);
    if (!landing) {
      failures.push(`${page.file}: no landing page built at /${m[1]}/ to anchor isPartOf on`);
      continue;
    }
    for (const article of findNodes(page, 'TechArticle')) {
      const ref = article.isPartOf;
      if (!isRec(ref) || typeof ref['@id'] !== 'string') continue;
      if (!declaredIds(landing).has(ref['@id'])) {
        failures.push(`${page.file}: isPartOf ${ref['@id']} is not defined on /${m[1]}/`);
      }
    }
  }
  return failures;
}

// ------------------------------------------------------- docs page set

/**
 * The docs pages that must exist — the guard for a silently missing checkout.
 * `getCollection` on a missing base warns and returns `[]`, so eight DemoStage
 * pages disappeared from the build with every check still green; this one
 * compares the source tree against dist/ and fails naming the path it needed.
 */
export function checkDocsPages(
  dist = DIST,
  bases: Record<string, string> = DOCS_BASES,
  root: string = ROOT,
): Failure[] {
  const failures: Failure[] = [];
  for (const [id, base] of Object.entries(bases)) {
    const basePath = resolve(root, base);
    if (!existsSync(basePath)) {
      failures.push(
        `docs: ${id} source folder ${basePath} does not exist — DOCS_BASES["${id}"] is "${base}"; ` +
          `check the sibling checkout's \`repository:\` and \`path:\` in .github/workflows/*.yml`,
      );
      continue;
    }
    for (const md of globSync('**/*.md', { cwd: basePath })) {
      const route = docsRoute(id, md.replace(/\.md$/, ''));
      if (!existsSync(resolve(dist, route.replace(/^\//, ''), 'index.html'))) {
        failures.push(`docs: ${id} source ${md} has no built page at ${route}`);
      }
    }
  }
  return failures;
}

export function checkAll(dist = DIST): Failure[] {
  return [
    ...checkSitemap(dist),
    ...checkRedirects(dist),
    ...checkDocsLinks(dist),
    ...checkLlmsTxt(dist),
    ...checkLlmsLinks(dist),
    ...checkLlmsFull(dist),
    ...checkMarkdownTwins(dist),
    ...checkMetaDescriptions(dist),
    ...checkTitles(dist),
    ...checkJsonLd(dist),
    ...checkDocsPages(dist),
  ];
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
  const stats = jsonLdStats(DIST);
  const twins = markdownTwinStats(DIST);
  const llmsFile = [resolve(DIST, 'llms.txt'), resolve(ROOT, 'public/llms.txt')].find((f) => existsSync(f));
  const docsLines = llmsFile ? llmsDocsLines(readFileSync(llmsFile, 'utf-8')) : 0;
  console.log(
    `✓ indexing check: ${sitemapLocations(DIST).length} sitemap URLs indexable, ${indexableCount(DIST)} pages with distinct 30–60 char titles, ` +
      `${twins.indexable} indexable pages with ${twins.twins} markdown twins (${twins.links} alternate links), ` +
      `${docsLines} llms.txt documentation lines, llms-full.txt ${llmsFullBytes(DIST)} bytes, ` +
      `${stats.blocks} JSON-LD blocks parse (${stats.docs} docs graphs: ${stats.withDate} with dateModified, ${stats.withoutDate} without, ${stats.unparseable} unparseable), redirects and doc links clean.`,
  );
}

const isDirectRun = process.argv[1] && /(?:^|[/\\])check-seo\.(?:ts|js)$/.test(process.argv[1]);
if (isDirectRun) main();
