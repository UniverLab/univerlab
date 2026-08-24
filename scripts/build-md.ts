import TurndownService from 'turndown';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'node:fs';

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
