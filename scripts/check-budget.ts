/**
 * Fails the build when a budgeted page's first view grows past its byte
 * budget, so a later change cannot quietly make a page heavy. The redesign
 * adds about 30 MB of engravings, clips and backgrounds under `public/bench/`;
 * `_headers` caches them for 30 days, and this check holds the pages that
 * request them eagerly to their budget.
 *
 * The count is what a browser fetches for the first view, summed from the
 * files on disk in `dist/`:
 *
 *   - the HTML file itself;
 *   - local stylesheets (`<link rel="stylesheet">`); Google Fonts is counted
 *     as a fixed 120 KB — the fonts are external and their weight varies;
 *   - `<script src>` unless `type="module"` (module imports are dynamic);
 *   - `<img>`/`<picture>` without `loading="lazy"` — the first candidate of
 *     each `srcset`, AVIF when the picture offers it;
 *   - `<video>` posters always, and a video's `src` (or first inner
 *     `<source src>`) only when `preload` is not `none`;
 *   - the ground-tile `url(/bench/textures/…)` of every counted stylesheet
 *     and inline `<style>`.
 *
 * It also verifies the bench manifest: every `public/bench/manifest.json`
 * asset exists, no `.webp` exceeds 400 KB and no `.avif` 300 KB.
 *
 * Offline and deterministic by design — no Lighthouse in the build; Lighthouse
 * stays the manual check the home spec reports. Run on demand:
 * `node scripts/check-budget.ts`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './build-redirects.ts';
import { experiments } from '../src/lib/experiments.ts';

const DIST = resolve(ROOT, 'dist');
const KB = 1024;

export type Failure = string;

/** What the first view requests eagerly, one URL per entry (local paths
 *  only; external URLs like Google Fonts never appear — main counts those
 *  as a fixed 120 KB). */
export function firstViewItems(html: string): string[] {
  // Inline script bodies and style blocks can hold fake tags in strings;
  // strip the bodies before parsing tags. Script *opening* tags survive so
  // their `src` is still counted below.
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.slice(0, m.indexOf('>') + 1))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  const items: string[] = [];
  const isLocal = (u: string) => u && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u);
  const push = (u: string | undefined) => {
    if (u && isLocal(u) && !items.includes(u)) items.push(u);
  };
  /** The first candidate of a `srcset`: `a.avif 450w, b.avif 900w` → `a.avif`. */
  const firstCandidate = (srcset: string): string => srcset.split(',')[0].trim().split(/\s+/)[0];

  // Stylesheets.
  for (const m of cleaned.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\brel="stylesheet"/i.test(tag)) continue;
    push(/\bhref="([^"]*)"/i.exec(tag)?.[1]);
  }

  // Classic scripts only: a module script's imports are dynamic.
  for (const m of cleaned.matchAll(/<script\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\btype="module"/i.test(tag)) continue;
    push(/\bsrc="([^"]*)"/i.exec(tag)?.[1]);
  }

  // <picture>: skipped whole when its img is lazy, else the first AVIF
  // candidate (the format a modern browser picks), else the first source,
  // else the img itself.
  for (const m of cleaned.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi)) {
    const inner = m[1];
    const img = /<img\b[^>]*>/i.exec(inner)?.[0] ?? '';
    if (/\bloading="lazy"/i.test(img)) continue;
    const sources = [...inner.matchAll(/<source\b[^>]*>/gi)].map((s) => s[0]);
    const avif = sources.find((s) => /\btype="image\/avif"/i.test(s));
    const pick = avif ?? sources[0];
    const srcset = pick ? /\bsrcset="([^"]*)"/i.exec(pick)?.[1] : undefined;
    push(srcset ? firstCandidate(srcset) : /\bsrc="([^"]*)"/i.exec(img)?.[1]);
  }

  // Bare <img> (every <picture> above was removed from the count's view by
  // being consumed as a unit; a lazy img never fetches eagerly).
  const withoutPictures = cleaned.replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, '');
  for (const m of withoutPictures.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (/\bloading="lazy"/i.test(tag)) continue;
    const srcset = /\bsrcset="([^"]*)"/i.exec(tag)?.[1];
    push(srcset ? firstCandidate(srcset) : /\bsrc="([^"]*)"/i.exec(tag)?.[1]);
  }

  // <video>: the poster always paints; the video bytes load only when the
  // element does not opt out with preload="none".
  for (const m of cleaned.matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/gi)) {
    const [, attrs, inner] = m;
    push(/\bposter="([^"]*)"/i.exec(attrs)?.[1]);
    if (/\bpreload="none"/i.test(attrs)) continue;
    const src = /\bsrc="([^"]*)"/i.exec(attrs)?.[1]
      ?? /<source\b[^>]*\bsrc="([^"]*)"/i.exec(inner)?.[1];
    push(src);
  }

  return items;
}

/** Budgets in KB, reviewed 2026-10-25 against the measured first views (the
 *  guard keeps its teeth: a later change must not exceed the reviewed page):
 *  the two homes 1,100; each experiment landing page 1,200 — its live
 *  background loads after `load` and is not counted — except `/canopy/` and
 *  `/texforge/`, whose approved designs embed an autoplay demo mp4 the first
 *  view really loads, at 6,000; `/experiments/` 1,200 for its eager
 *  encyclopedia postcard and machine plates; the remaining static sections
 *  800. */
export interface BudgetedPage {
  route: string;
  /** Path inside dist/, relative. */
  file: string;
  budgetBytes: number;
}

export function budgetedPages(): BudgetedPage[] {
  const pages: BudgetedPage[] = [
    { route: '/', file: 'index.html', budgetBytes: 1100 * KB },
    { route: '/es/', file: 'es/index.html', budgetBytes: 1100 * KB },
  ];
  for (const e of experiments) {
    const budget = e.id === 'canopy' || e.id === 'texforge' ? 6000 * KB : 1200 * KB;
    pages.push({ route: `/${e.id}/`, file: `${e.id}/index.html`, budgetBytes: budget });
    pages.push({ route: `/es/${e.id}/`, file: `es/${e.id}/index.html`, budgetBytes: budget });
  }
  for (const r of ['experiments', 'roadmap', 'manifesto', 'contributors', 'status']) {
    const budget = r === 'experiments' ? 1200 * KB : 800 * KB;
    pages.push({ route: `/${r}/`, file: `${r}/index.html`, budgetBytes: budget });
    pages.push({ route: `/es/${r}/`, file: `es/${r}/index.html`, budgetBytes: budget });
  }
  return pages;
}

/** The ground tile a stylesheet or inline style pulls from the bench. */
const GROUND_TILE = /url\(\s*['"]?(\/bench\/textures\/[^'")\s]+)/g;

/** Bytes the first view of a built page requests, with the largest items. */
export interface PageCost {
  totalBytes: number;
  items: { url: string; bytes: number }[];
}

/** Sum, from the files on disk, everything the first view requests eagerly. */
export function pageCost(html: string, file: string, dist = DIST): PageCost {
  const items: { url: string; bytes: number }[] = [];
  const seen = new Set<string>();
  let total = statSync(file).size;

  const add = (url: string): void => {
    if (seen.has(url)) return;
    seen.add(url);
    const rel = resolve(dist, url.replace(/^\/+/, '').split(/[?#]/)[0]);
    const bytes = existsSync(rel) ? statSync(rel).size : 0;
    total += bytes;
    items.push({ url, bytes });
  };

  const list = firstViewItems(html);
  for (const url of list) add(url);
  // The Google Fonts stylesheet is external and its weight varies; the
  // first view loads it eagerly, so it is counted once as a fixed 120 KB.
  if (/fonts\.googleapis\.com/.test(html)) {
    total += 120 * KB;
    items.push({ url: 'fonts.googleapis.com (fixed)', bytes: 120 * KB });
  }
  // The ground tile: the one bench texture every counted stylesheet and
  // inline style references, deduped like everything else.
  for (const css of list.filter((u) => u.endsWith('.css'))) {
    const rel = resolve(dist, css.replace(/^\/+/, ''));
    if (existsSync(rel)) {
      for (const m of readFileSync(rel, 'utf-8').matchAll(GROUND_TILE)) add(m[1]);
    }
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const t of m[1].matchAll(GROUND_TILE)) add(t[1]);
  }
  return { totalBytes: total, items };
}

/** The bench manifest must describe files that exist and stay in their
 *  weight class: a changed asset ships under a new file name (the `file`
 *  field changes with it), so a stale 600 KB webp would live forever. */
export function checkManifest(root: string = ROOT): Failure[] {
  const file = resolve(root, 'public/bench/manifest.json');
  if (!existsSync(file)) return ['bench manifest: public/bench/manifest.json not found'];
  const failures: Failure[] = [];
  const { assets } = JSON.parse(readFileSync(file, 'utf-8')) as {
    assets: { file: string }[];
  };
  for (const a of assets) {
    const path = resolve(root, 'public/bench', a.file);
    if (!existsSync(path)) {
      failures.push(`bench manifest: public/bench/${a.file} does not exist`);
      continue;
    }
    const bytes = statSync(path).size;
    if (a.file.endsWith('.webp') && bytes > 400 * KB) {
      failures.push(`bench manifest: public/bench/${a.file} is ${Math.round(bytes / KB)} KB, over the 400 KB webp budget`);
    }
    if (a.file.endsWith('.avif') && bytes > 300 * KB) {
      failures.push(`bench manifest: public/bench/${a.file} is ${Math.round(bytes / KB)} KB, over the 300 KB avif budget`);
    }
  }
  return failures;
}

const fmt = (bytes: number): string => `${(bytes / KB).toFixed(1)} KB`;

function main(): void {
  if (!existsSync(DIST)) {
    console.log('check-budget: dist/ not found, skipping.');
    return;
  }
  const failures = checkManifest();
  const tables: string[] = [];

  for (const page of budgetedPages()) {
    const file = resolve(DIST, page.file);
    if (!existsSync(file)) continue; // a route that was not built (yet)
    const { totalBytes, items } = pageCost(readFileSync(file, 'utf-8'), file);
    if (totalBytes <= page.budgetBytes) continue;
    const top = [...items].sort((a, b) => b.bytes - a.bytes).slice(0, 8);
    failures.push(`${page.route}: first view is ${fmt(totalBytes)}, over the ${fmt(page.budgetBytes)} budget`);
    tables.push(
      `\n${page.route} — ${fmt(totalBytes)} vs ${fmt(page.budgetBytes)} budget (over by ${fmt(totalBytes - page.budgetBytes)})\n` +
        top.map((i) => `    ${fmt(i.bytes).padStart(10)}  ${i.url}`).join('\n'),
    );
  }

  if (failures.length > 0) {
    console.error(`\n✗ budget check: ${failures.length} violation(s)`);
    for (const f of failures) console.error(`  • ${f}`);
    for (const t of tables) console.error(t);
    console.error('');
    process.exit(1);
  }
  console.log('✓ budget check: every budgeted page is within its first-view budget, bench manifest clean.');
}

const isDirectRun = process.argv[1] && /(?:^|[/\\])check-budget\.(?:ts|js)$/.test(process.argv[1]);
if (isDirectRun) main();
