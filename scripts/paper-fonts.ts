// Records the newspaper page's web fonts into the paper fixtures: the Google
// Fonts stylesheets the built page links and every font file those stylesheets
// reference (plus the page's direct preloads). `check:paper` serves them from
// here, so it measures the real typefaces while staying deterministic and
// offline. Without them Chromium falls back to Georgia/DejaVu and the sheet's
// line breaks and column flow differ from what a reader sees.
//
// The URLs are read from the built pages, not hard-coded here, so a change to
// BaseLayout's font families is picked up by the next `npm run record:paper`.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

// Google serves woff2 (and the `@font-face` subsets the page needs) only to a
// modern browser string; a plain fetch would record ttf payloads nobody uses.
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const PAGES = ['newspaper/index.html', 'es/newspaper/index.html'];

export interface FontEntry {
  file: string;
  contentType: string;
}

export interface FontManifest {
  recordedAt: string;
  entries: Record<string, FontEntry>;
}

const decode = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#38;/g, '&');

/** The `css2` stylesheet hrefs a built page links, entity-decoded. */
const cssHrefs = (html: string): string[] =>
  [...html.matchAll(/<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/g)]
    .map((m) => decode(m[1]));

/** The font files a built page preloads directly (the `as="font"` hint may
 *  come before or after the href). */
const preloadHrefs = (html: string): string[] =>
  [...html.matchAll(
    /<link[^>]+href="(https:\/\/fonts\.gstatic\.com\/[^"]+\.(?:woff2|woff|ttf|otf))"/g,
  )].map((m) => decode(m[1]));

/** Every absolute `url(…)` a stylesheet points at (Google's are absolute). */
const cssAssetHrefs = (css: string): string[] =>
  [...css.matchAll(/url\(\s*['"]?(https:\/\/fonts\.gstatic\.com\/[^)'"\s]+)['"]?\s*\)/g)]
    .map((m) => m[1]);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function get(url: string, attempt = 0): Promise<{ body: Buffer; contentType: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: '*/*' },
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await res.arrayBuffer().catch(() => undefined);
    await sleep(1000 * 2 ** attempt);
    return get(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const type =
    res.headers.get('content-type') ||
    MIME[extname(new URL(url).pathname).toLowerCase()] ||
    'application/octet-stream';
  return { body, contentType: type };
}

/** Record the built newspaper pages' web fonts under `outDir`. Returns how
 *  many URLs were captured. Throws when `dist/` has not been built. */
export async function recordPaperFonts(opts: {
  outDir: string;
  distDir: string;
}): Promise<number> {
  const pages = PAGES.map((p) => join(opts.distDir, p)).filter((p) => existsSync(p));
  if (!pages.length) {
    throw new Error(
      `no built newspaper page under ${opts.distDir}/; run npm run build before record:paper`,
    );
  }
  const html = pages.map((p) => readFileSync(p, 'utf8')).join('\n');
  const stylesheets = [...new Set(cssHrefs(html))];
  if (!stylesheets.length) {
    throw new Error(`no Google Fonts stylesheet found in ${pages.join(', ')}`);
  }
  const fontUrls = new Set(preloadHrefs(html));
  const entries: Record<string, FontEntry> = {};
  const saved = new Set<string>();
  const fontsDir = join(opts.outDir, 'fonts');
  // A refresh must not leave assets the current css no longer references.
  rmSync(fontsDir, { recursive: true, force: true });
  mkdirSync(fontsDir, { recursive: true });

  const save = (url: string, body: Buffer, contentType: string): void => {
    const key = new URL(url).href;
    if (saved.has(key)) return;
    const guessed = extname(new URL(url).pathname).toLowerCase();
    const isCss = contentType.includes('text/css');
    const ext = guessed && MIME[guessed] ? guessed : isCss ? '.css' : guessed || '.bin';
    const file = join('fonts', createHash('sha1').update(key).digest('hex').slice(0, 16) + ext);
    writeFileSync(join(opts.outDir, file), body);
    entries[key] = {
      file,
      contentType: isCss ? 'text/css; charset=utf-8' : MIME[ext] || contentType,
    };
    saved.add(key);
  };

  for (const url of stylesheets) {
    const { body, contentType } = await get(url);
    save(url, body, contentType);
    for (const asset of cssAssetHrefs(body.toString('utf8'))) fontUrls.add(asset);
  }
  for (const url of fontUrls) {
    const { body, contentType } = await get(url);
    save(url, body, contentType);
  }
  const manifest: FontManifest = {
    recordedAt: new Date().toISOString(),
    entries,
  };
  writeFileSync(join(opts.outDir, 'fonts.json'), JSON.stringify(manifest, null, 2) + '\n');
  return Object.keys(entries).length;
}
