/**
 * Alt contract on the built site (FR8): every <img> in the built pages
 * carries an alt attribute, and a machine illustration shown as an
 * experiment's picture never carries an empty one. The colophon frieze stays
 * ornament (empty alt, hidden). CI builds before it tests
 * (home-roadmap.test.ts pattern), so dist/ must exist.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const dist = join(root, 'dist');

if (!existsSync(join(dist, 'index.html'))) {
  throw new Error('dist/index.html not found — run `npm run build` before `npm test`.');
}

function htmlFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (entry.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = htmlFiles(dist);

interface SeenImg {
  src: string;
  alt: string | null;
  hidden: boolean;
  file: string;
}

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'source', 'track', 'wbr', 'circle', 'ellipse', 'line', 'path',
  'polygon', 'polyline', 'rect', 'stop', 'use',
]);

/** Every <img> in one built page, with whether an aria-hidden ancestor (or
 *  its own aria-hidden) hides it. Runtime <script> and <style> bodies are
 *  stripped first: they can hold <img> strings that never reach the page. */
function imgsOf(html: string, file: string): SeenImg[] {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, '');
  const out: SeenImg[] = [];
  const stack: boolean[] = [];
  const tagRe = /<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(clean)) !== null) {
    const [full, name, attrs] = m;
    if (full.startsWith('</')) {
      stack.pop();
      continue;
    }
    const lower = name.toLowerCase();
    const hiddenSelf = /\saria-hidden\s*=\s*("true"|'true'|true)/i.test(attrs);
    if (lower === 'img') {
      // Astro compacts an empty alt to a bare `alt` attribute: presence is
      // the contract, the value follows only when one is assigned.
      const altPresent = /(?:^|\s)alt(?=\s|=|\/?>|$)/i.test(attrs);
      const altM = attrs.match(/\salt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const srcM = attrs.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i);
      out.push({
        src: srcM ? (srcM[2] ?? srcM[3] ?? '') : '',
        alt: altPresent ? (altM ? (altM[2] ?? altM[3] ?? altM[4] ?? '') : '') : null,
        hidden: hiddenSelf || stack.includes(true),
        file,
      });
    }
    if (!full.endsWith('/>') && !VOID.has(lower)) stack.push(hiddenSelf);
  }
  return out;
}

const imgs = files.flatMap((f) => imgsOf(readFileSync(f, 'utf8'), f));

describe('alt contract on the built pages', () => {
  it('covers the built site, including the four Lighthouse pages', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const page of ['index.html', 'es/index.html', 'roadmap/index.html', 'canopy/index.html']) {
      expect(files.map((f) => f.replace(/\\/g, '/'))).toContain(join(dist, page).replace(/\\/g, '/'));
    }
  });

  it('gives every built <img> an alt attribute', () => {
    const missing = imgs.filter((img) => img.alt === null);
    expect(
      missing.map((img) => `${img.file.replace(root, '')}: ${img.src || '(no src)'}`),
    ).toEqual([]);
  });

  it('never ships an empty alt on a machine illustration shown as a picture', () => {
    const silent = imgs.filter(
      (img) => img.src.includes('/bench/machines/') && !img.hidden && img.alt === '',
    );
    expect(
      silent.map((img) => `${img.file.replace(root, '')}: ${img.src}`),
    ).toEqual([]);
    // Guard against a vacuous pass: the built site must actually describe machines.
    const described = imgs.filter(
      (img) => img.src.includes('/bench/machines/') && !img.hidden && (img.alt ?? '') !== '',
    );
    expect(described.length).toBeGreaterThan(0);
  });

  it('keeps the colophon frieze ornament: empty alt, hidden', () => {
    const frieze = imgs.filter((img) => img.src.includes('/bench/colophon/frieze'));
    expect(frieze.length).toBeGreaterThan(0);
    for (const img of frieze) {
      expect(img.alt).toBe('');
      expect(img.hidden).toBe(true);
    }
  });
});
