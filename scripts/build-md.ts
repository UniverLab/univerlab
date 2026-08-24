import TurndownService from 'turndown';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'node:fs';

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
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  cleaned = cleaned.replace(/<header[\s\S]*?<\/header>/gi, '');
  cleaned = cleaned.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  cleaned = stripAriaHidden(cleaned);

  const td = new TurndownService({ headingStyle: 'atx' });
  const markdown = td.turndown(cleaned);

  let frontMatter = '---\n';
  if (title) frontMatter += `title: "${title.replace(/"/g, '\\"')}"\n`;
  if (canonical) frontMatter += `source: "${canonical}"\n`;
  frontMatter += '---\n\n';

  return frontMatter + markdown;
}

async function main(): Promise<void> {
  const distDir = resolve(process.cwd(), 'dist');
  if (!existsSync(distDir)) {
    console.log('build-md: dist/ not found, skipping markdown generation.');
    return;
  }

  const files = globSync('**/index.html', { cwd: distDir });
  for (const file of files) {
    const fullPath = resolve(distDir, file);
    const html = readFileSync(fullPath, 'utf-8');
    const md = htmlToMarkdown(html);
    const mdPath = fullPath.replace(/index\.html$/, 'index.md');
    writeFileSync(mdPath, md, 'utf-8');
  }
  console.log(`build-md: generated ${files.length} markdown file(s).`);
}

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('build-md.ts') || process.argv[1].endsWith('build-md.js')
);
if (isDirectRun) {
  main();
}
