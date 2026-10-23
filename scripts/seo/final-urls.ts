/**
 * Invariant 9: every URL our own pages advertise must be the final URL.
 *
 * Google Search Console's "Page with redirect" report of 2026-10-23 listed
 * 35 univerlab.org URLs — every one a redirect our own pages (or feed)
 * advertised: an hreflang to `/es` (308 to `/es/`), hreflang and nav links
 * to `/es/status/` (301 to `/status/`), and a feed alternate to `/status`.
 *
 * This scans every built indexable page in `dist/` and checks each
 * `<link rel="canonical">` href, each `<link rel="alternate" hreflang>`
 * href, and each `<a href>` on univerlab.org (absolute or root-relative):
 * the href must end in `/`, must not be the source of a `public/_redirects`
 * rule, and must resolve to a built page (`dist/<path>/index.html`, or
 * `dist/index.html` for `/`). Fragment-only links, query strings (compared
 * on the path only) and file links whose last segment carries an extension
 * (`.md`, `.xml`, `.txt`, `.json`, `.png`, …) are skipped. Each failure
 * names the page, the attribute and the href.
 */
import { existsSync, globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NOINDEX } from '../build-md.ts';

export type Failure = string;

const DIST = resolve(process.cwd(), 'dist');

/** Matches BaseLayout's `<link rel="canonical" href="…">`. */
const CANONICAL = /<link\s+rel="canonical"\s+href="([^"]+)"/i;
/** Every `<link …>` tag — filtered to `rel="alternate"` + `hreflang` below. */
const LINK_TAG = /<link\b[^>]*>/gi;
const LINK_HREF = /href="([^"]*)"/i;
/** Every in-page anchor target. */
const ANCHOR_HREF = /<a\b[^>]*?\bhref=(["'])(.*?)\1/gi;

/** An absolute URL (or protocol-relative one) — anything else root-relative
 *  or out of scope for this check (relative links are never emitted). */
const ABSOLUTE_HREF = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
/** A file, not a page: the last segment carries an extension (`/feed.atom`,
 *  `/auth.md`, `/openapi/announcements.json`, …). */
const HAS_EXTENSION = /\/[^/]+\.[a-z0-9]+$/i;

/** `dist/` path of a fixture page: `index.html` is `/`, the rest strip it. */
function pageUrl(file: string): string {
  return file === 'index.html' ? '/' : `/${file.replace(/index\.html$/, '')}`;
}

/**
 * The site path an advertised href names, or null when the href is out of
 * scope: empty, fragment-only, foreign-host, a relative link, or a file.
 * Query strings are compared on the path only.
 */
function sitePath(href: string): string | null {
  if (!href || href.startsWith('#')) return null;
  let raw: string;
  if (href.startsWith('/')) {
    raw = href;
  } else if (ABSOLUTE_HREF.test(href)) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    if (url.hostname !== 'univerlab.org') return null;
    raw = url.pathname;
  } else {
    return null;
  }
  const path = raw.split('?')[0].split('#')[0];
  if (!path || HAS_EXTENSION.test(path)) return null;
  return path;
}

/**
 * Every advertised URL on every indexable built page must be its final URL:
 * trailing-slash form, not a `_redirects` source, backed by a built page.
 * `sources` is the `_redirects` source set (`redirectSources` in
 * `check-seo.ts`), passed in so this module stays a pure `dist/` scan.
 */
export function checkFinalUrls(dist = DIST, sources: Set<string> = new Set()): Failure[] {
  const failures: Failure[] = [];
  for (const file of globSync('**/index.html', { cwd: dist })) {
    const html = readFileSync(resolve(dist, file), 'utf-8');
    if (NOINDEX.test(html)) continue;
    const url = pageUrl(file);
    const check = (label: string, href: string): void => {
      const path = sitePath(href);
      if (path === null) return;
      if (!path.endsWith('/')) {
        failures.push(`${url}: ${label} "${href}" does not end in /`);
        return;
      }
      if (sources.has(path)) {
        failures.push(`${url}: ${label} "${href}" is a redirect source`);
        return;
      }
      const rel = path.replace(/^\/+/, '');
      const target = rel === '' ? resolve(dist, 'index.html') : resolve(dist, rel, 'index.html');
      if (!existsSync(target)) {
        failures.push(`${url}: ${label} "${href}" has no built page`);
      }
    };
    const canonical = html.match(CANONICAL)?.[1];
    if (canonical) check('canonical', canonical);
    for (const m of html.matchAll(LINK_TAG)) {
      const tag = m[0];
      if (!/\brel="alternate"/i.test(tag) || !/\bhreflang=/i.test(tag)) continue;
      const href = LINK_HREF.exec(tag)?.[1];
      if (href) check('alternate hreflang', href);
    }
    for (const m of html.matchAll(ANCHOR_HREF)) check('a href', m[2]);
  }
  return failures;
}
