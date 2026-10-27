import TurndownService from 'turndown';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'node:fs';
// The `.ts` extension is required — this script is run by `node` with type
// stripping, and lab-feed's own relative import is type-only, so it never
// needs resolving at runtime. (functions/status-twin.ts must NOT be imported
// from here for the same reason: its i18n imports are extensionless value
// imports that node cannot resolve — its title/source are duplicated below.)
import { FEED_URL, loadEntries, entriesMarkdown, type Entry } from '../src/lib/lab-feed.ts';

/**
 * Remove every element marked `aria-hidden="true"`, including its children.
 *
 * These are the parts already hidden from assistive technology because they
 * carry no meaning — on this site, the ASCII-art banners, the decorative
 * canvases and the icon glyphs. An agent reading the markdown is in the same
 * position as a screen reader, and the banners in particular turn into a
 * single unreadable line of block characters that buries the real content.
 *
 * A non-greedy regex is not enough: `div` and `span` nest, so the first
 * `</div>` after the opening tag is usually a child's. This walks forward
 * counting same-name opens and closes to find the element's real end.
 */
export function stripAriaHidden(html: string): string {
  const opener = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*\baria-hidden=["']true["'][^>]*>/;

  let out = html;
  // Each pass removes the first match; repeat until none are left. An element
  // nested inside a removed one disappears with its parent, so this converges.
  for (;;) {
    const match = opener.exec(out);
    if (!match) return out;

    const tag = match[1].toLowerCase();
    const openStart = match.index;
    const openEnd = openStart + match[0].length;

    // Self-closing (`<svg ... />`) or a void element: nothing to scan for.
    if (match[0].endsWith('/>') || VOID_ELEMENTS.has(tag)) {
      out = out.slice(0, openStart) + out.slice(openEnd);
      continue;
    }

    const scanner = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
    scanner.lastIndex = openEnd;
    let depth = 1;
    let end = -1;
    for (let m = scanner.exec(out); m !== null; m = scanner.exec(out)) {
      if (m[0].startsWith('</')) {
        depth -= 1;
        if (depth === 0) {
          end = m.index + m[0].length;
          break;
        }
      } else if (!m[0].endsWith('/>')) {
        depth += 1;
      }
    }

    // Unbalanced markup: drop the opening tag alone rather than looping forever.
    out = end === -1
      ? out.slice(0, openStart) + out.slice(openEnd)
      : out.slice(0, openStart) + out.slice(end);
  }
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'source', 'track', 'wbr',
]);

/** Matches BaseLayout's `<meta name="robots" content="noindex, nofollow" />`.
 *  Shared with scripts/check-seo.ts and scripts/build-llms.ts so the three
 *  cannot drift on what "indexable" means. */
export const NOINDEX = /<meta\s+name=["']robots["']\s+content=["'][^"']*\bnoindex\b/i;

/** The ISO a markdown twin prints in parentheses after a mission-date label:
 *  the label's own instant, normalized to UTC. A date-only `datetime` has no
 *  time segment to keep. Parsing (rather than trimming the string) matters:
 *  git's `%cI` stamps carry an offset (`2026-09-27T04:45:34-05:00`), and
 *  re-labeling those digits `Z` would print an instant five hours off from
 *  the "… · 09:45 UTC" right next to it. */
export function missionIso(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}Z`
  );
}

export function injectLatestRelease(html: string): string {
  const openTag = html.match(/<p[^>]*class="[^"]*lab-plate[^"]*"[^>]*>/);
  if (!openTag || openTag.index == null) return html;
  const attrs = openTag[0];
  const version = /\bdata-release="([^"]*)"/.exec(attrs)?.[1] ?? '';
  const date = /\bdata-release-date="([^"]*)"/.exec(attrs)?.[1] ?? '';
  // Only values that cannot carry an HTML entity or an attribute artefact are
  // injected; a tag with an odd character simply loses the line (never corrupts it).
  if (!/^[^&<>"']+$/.test(version) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return html;
  const close = html.indexOf('</p>', openTag.index + openTag[0].length);
  if (close === -1) return html;
  const insertAt = close + '</p>'.length;
  return html.slice(0, insertAt) + `<p>Latest release: ${version} (${date})</p>` + html.slice(insertAt);
}

export function htmlToMarkdown(html: string): string {
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const content = mainMatch ? mainMatch[1] : bodyMatch ? bodyMatch[1] : '';

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+>/i);
  let canonical = '';
  if (canonicalMatch) {
    const hrefMatch = canonicalMatch[0].match(/href=["']([^"']+)["']/i);
    if (hrefMatch) canonical = hrefMatch[1];
  }

  let cleaned = content;
  // Comments go first: a comment that mentions a tag (`<nav> is deliberate`)
  // would otherwise start one of the tag strips below, which then eats the
  // comment's closing `-->` and turns the rest of the page into a comment.
  // Repeated until stable: removing one comment can join the halves of
  // another (`<!<!---->--`) into a fresh one.
  for (let prev = ''; prev !== cleaned; ) {
    prev = cleaned;
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  }
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  cleaned = cleaned.replace(/<header[\s\S]*?<\/header>/gi, '');
  cleaned = cleaned.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  cleaned = stripAriaHidden(cleaned);
  cleaned = injectLatestRelease(cleaned);

  const td = new TurndownService({ headingStyle: 'atx' });
  // Mission-date <time> labels: append the ISO in parentheses so an agent
  // reading the twin never has to convert. Every renderer marks its label
  // with data-mission (Astro keeps the attribute in the built HTML); the
  // text-shape match is the backstop for a <time> that carries the label
  // but not the marker, and for the pre-marker shape of older fixtures.
  const MISSION_RE = /^((?:TERRA )?\d{4} · Sol \d+ · \d{2}:\d{2} UTC|Sol \d+)/;
  td.addRule('missionDate', {
    filter: (node) =>
      node.nodeName === 'TIME' &&
      (node.getAttribute('data-mission') !== null || MISSION_RE.test(node.textContent?.trim() ?? '')),
    replacement: (content, node) => {
      const iso = node.getAttribute('datetime');
      if (!iso) return content;
      return `${content} (${missionIso(iso)})`;
    },
  });
  // Tables: Turndown's default flattens each cell onto its own line, which
  // loses the row structure an agent needs. Emit a GFM pipe table instead;
  // the first row is the header, as in the site's own catalogue tables.
  td.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => {
      const rows = Array.from((node as HTMLElement).querySelectorAll('tr')).map((tr) =>
        Array.from(tr.children).map((cell) =>
          (cell.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|'),
        ),
      );
      if (rows.length === 0) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
      const divider = `| ${Array(width).fill('---').join(' | ')} |`;
      const [header, ...body] = rows;
      return `\n\n${[line(header), divider, ...body.map(line)].join('\n')}\n\n`;
    },
  });
  const markdown = td.turndown(cleaned);

  let frontMatter = '---\n';
  if (title) frontMatter += `title: "${title.replace(/"/g, '\\"')}"\n`;
  if (canonical) frontMatter += `source: "${canonical}"\n`;
  frontMatter += '---\n\n';

  return frontMatter + markdown;
}

// ------------------------------------------------- the /status/ snapshot twin

/** The roadmap twin an offline snapshot points a reader at. The status page's
 *  twin carries a pointer line, not a Roadmap section, so the offline body
 *  must point at the board too. */
const ROADMAP_TWIN = 'https://univerlab.org/roadmap/index.md';

/** How long the build waits for the announcements API before falling back to
 *  the offline pointers — a build must never hang on an unreachable host. */
const STATUS_BUILD_TIMEOUT_MS = 5000;

/** The line FR3 pins: when this file was made, and that this same address
 *  serves the live version. */
export function snapshotLine(nowIso: string): string {
  return `Snapshot taken at build time (${nowIso}); the live version is served at this same address.`;
}

/**
 * The built `/status/index.md` body when the API answered at build time: the
 * logbook in the shared entry format, newest first, plus the snapshot marker.
 *
 * Never empty: an empty body is the outage this replaces. The live page no
 * longer carries the logbook in its static HTML, so the generic conversion
 * alone would keep shipping the bare front matter; this is the body that
 * replaces it. An empty log renders the snapshot marker under the heading
 * rather than nothing at all.
 */
export function statusSnapshotBody(entries: Entry[], nowIso: string): string {
  const log = entriesMarkdown(entries, { labels: { empty: '' } });
  return `## Logbook\n\n${log || 'Nothing in the logbook at build time.'}\n\n${snapshotLine(nowIso)}`;
}

/**
 * The body when the API was unreachable at build time: the pointers a reader
 * needs instead of a stale snapshot — the Atom feed for the entries, the live
 * roadmap twin for the board, and the promise that this same address serves
 * the live logbook.
 */
export function statusOfflineBody(): string {
  return (
    '## Logbook\n\n' +
    `The announcements API was unreachable at build time, so this build carries no logbook snapshot. ` +
    `The same entries are published as an Atom feed at ${FEED_URL}, the roadmap is at ${ROADMAP_TWIN}, ` +
    `and the live logbook is served at this same address.`
  );
}

/**
 * The status page's built twin: its own front matter — title and canonical,
 * exactly as the generic converter writes them — over the snapshot body. The
 * logbook is no longer in the page's static HTML, so converting the page body
 * would ship the empty shell again; only the front matter is kept.
 */
export function withStatusSnapshot(html: string, body: string): string {
  const frontMatter = htmlToMarkdown(html).match(/^---\n[\s\S]*?\n---\n/)?.[0] ?? '';
  return `${frontMatter}\n${body}\n`;
}

/**
 * The status snapshot body for this build: the live logbook when the API
 * answers within the deadline, the offline pointers when it does not. A build
 * on a machine without network must still produce the twin, never fail.
 */
async function statusBuildBody(): Promise<string> {
  try {
    const entries = await loadEntries({
      signal: AbortSignal.timeout(STATUS_BUILD_TIMEOUT_MS),
      limit: 20,
    });
    return statusSnapshotBody(entries, new Date().toISOString());
  } catch {
    return statusOfflineBody();
  }
}

export async function main(distDir = resolve(process.cwd(), 'dist')): Promise<void> {
  if (!existsSync(distDir)) {
    console.log('build-md: dist/ not found, skipping markdown generation.');
    return;
  }

  const files = globSync('**/index.html', { cwd: distDir });
  let skipped = 0;
  for (const file of files) {
    const fullPath = resolve(distDir, file);
    const html = readFileSync(fullPath, 'utf-8');
    // Noindex pages are not indexable, so they get no twin and no alternate
    // link — twins, links and sitemap locs stay the same set.
    if (NOINDEX.test(html)) {
      // A stale twin from an earlier build must not survive: the page is not
      // indexable, so it advertises no twin.
      rmSync(fullPath.replace(/index\.html$/, 'index.md'), { force: true });
      skipped++;
      continue;
    }
    // The status page's logbook lives only in the API now, so its twin is the
    // page's front matter over a build-time snapshot of the log (offline
    // pointers when the API cannot be reached — either way, never empty).
    const md =
      file === 'status/index.html'
        ? withStatusSnapshot(html, await statusBuildBody())
        : htmlToMarkdown(html);
    const mdPath = fullPath.replace(/index\.html$/, 'index.md');
    writeFileSync(mdPath, md, 'utf-8');
  }
  console.log(`build-md: generated ${files.length - skipped} markdown file(s) (${skipped} noindex skipped).`);
}

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('build-md.ts') || process.argv[1].endsWith('build-md.js')
);
if (isDirectRun) {
  main();
}
