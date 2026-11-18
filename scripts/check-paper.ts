// Page-one layout check: renders the real built page in a real browser on
// fixed recorded editions and measures what a reader sees. Serves `dist/`,
// routes the page's data requests to `src/__tests__/fixtures/paper/` and its
// web fonts to the recorded copies there, and loads /newspaper?d=… (and /es/…)
// for every recorded date at three viewports. Failing cases save a screenshot
// of the sheet under `.paper-fail/` (gitignored) and the script exits non-zero.
//
// Run: `npm run check:paper`. Refresh the fixtures: `npm run record:paper`.
// This check only measures; it never changes layout code.
//
// Runs on plain Node (24+) via native type-stripping. Chromium comes from
// Playwright (devDependencies). The data requests and the page's web fonts are
// fulfilled from the fixtures, so the edition and its type metrics are fixed;
// every other non-local request (photos, analytics) is aborted, so the check is
// deterministic and runs fully offline against the recorded fixtures plus the
// local build.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { chromium, devices } from 'playwright';
import { buildPool, type FilterLang } from '../src/lib/science-filter.ts';
import { GUTTER_FALLBACK, judgeCase, type CaseInput } from './paper-rules.ts';

const DIST = 'dist';
const FIXDIR = 'src/__tests__/fixtures/paper';
const FAILDIR = '.paper-fail';

interface FontEntry {
  file: string;
  contentType: string;
}

const VIEWPORTS = [
  { name: 'wide', use: { viewport: { width: 1400, height: 1000 } } },
  { name: 'mid', use: { viewport: { width: 900, height: 1000 } } },
  { name: 'pixel7', use: { ...devices['Pixel 7'] } },
];

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.atom': 'application/atom+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json; charset=utf-8',
};

function serve(distRoot: string) {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    try {
      const raw = (req.url || '/').split('?')[0].split('#')[0];
      let path = decodeURIComponent(raw);
      let file = resolve(join(distRoot, '.' + path));
      if (!file.startsWith(distRoot + sep)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      if (existsSync(file) && statSync(file).isDirectory()) {
        file = join(file, 'index.html');
      }
      if (!existsSync(file)) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
      res.end(readFileSync(file));
    } catch {
      res.statusCode = 500;
      res.end();
    }
  });
}

/**
 * Gathers one measured page. Self-contained (no closure): Playwright
 * serializes it into the browser. Returns everything `judgeCase` needs
 * except the pool count, which Node computes from the fixture itself.
 */
function gather(args: {
  colophonText: string;
  gutterFallback: number;
}): Omit<CaseInput, 'poolLetters'> {
  const { colophonText, gutterFallback } = args;
  const rectOf = (el: Element | null) => {
    if (!el) return null;
    const r = (el as HTMLElement).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const edition = document.getElementById('edition');
  const page = document.getElementById('page-1');
  const sheet = document.querySelector('.paper-sheet[data-paper-sheet]');
  const pageBox = rectOf(page);
  const pageHidden =
    !page || !pageBox || pageBox.width <= 0 || pageBox.height <= 0 ||
    getComputedStyle(page).display === 'none';
  const front = edition ? edition.querySelector('.front') : null;
  // The sheet's line breaks and column flow depend on these faces: measuring
  // fallback metrics would accuse a layout a reader never sees.
  const fontsLoaded = Array.from(document.fonts).some(
    (f) =>
      f.status === 'loaded' &&
      /Old Standard TT|EB Garamond|Sometype Mono/i.test(f.family),
  );
  if (!edition || !front || pageHidden) {
    return {
      printedLetters: 0, hasLead: false, hasLab: false, gutter: 0,
      sheet: rectOf(sheet) || { x: 0, y: 0, width: 0, height: 0 },
      stories: [], letters: [], lab: null, colophon: null,
      colophonVisible: false, leadPhoto: null, textLines: [], columns: [],
      front: null, ink: [],
      logbookLink: null, controlLabel: null,
      editionEmpty: !front, pageHidden: !!pageHidden, fontsLoaded,
    };
  }
  // The gutter that separates page one's columns (`.cols` and the lead's
  // text columns share it), not #edition's 18px stack gap. Below 64rem the
  // sheet is CSS-scaled to fit, so bring the gutter into the measured
  // (scaled) space.
  const colRow = page.querySelector('.cols, .lead-text');
  const colGutter = colRow
    ? parseFloat(getComputedStyle(colRow).columnGap) || gutterFallback
    : gutterFallback;
  const sheetEl = sheet as HTMLElement | null;
  const sheetBox = rectOf(sheet);
  const scale =
    sheetEl && sheetBox && sheetEl.offsetWidth > 0
      ? sheetBox.width / sheetEl.offsetWidth
      : 1;
  const gutter = colGutter * (scale > 0 ? scale : 1);
  const stories = Array.from(page.querySelectorAll('article.lead'))
    .map(rectOf)
    .filter((r) => r !== null);
  const letterEls = Array.from(
    page.querySelectorAll('article.item'),
  );
  const letters = letterEls.map(rectOf).filter((r) => r !== null);
  const hasLead = !!page.querySelector('article.lead');
  const labEl = page.querySelector('article.labmail');
  // Page one's own colophon line; a copy change renames the selector, so
  // fall back to matching the rendered colophon text.
  let colophonEl: Element | null = page.querySelector('.colophon-note');
  if (!colophonEl && colophonText) {
    const ps = Array.from(page.querySelectorAll('p'));
    colophonEl =
      ps.find((p) => (p.textContent || '').trim() === colophonText.trim()) || null;
  }
  const colophon = rectOf(colophonEl);
  const colophonVisible = !!colophonEl && !!colophon &&
    colophon.width > 0 && colophon.height > 0 &&
    getComputedStyle(colophonEl as Element).visibility !== 'hidden' &&
    getComputedStyle(colophonEl as Element).display !== 'none';
  const lead = page.querySelector('article.lead');
  const fig = lead ? lead.querySelector('figure.photo--lead') : null;
  const img = fig ? fig.querySelector('img') : null;
  let leadPhoto = null;
  const textLines: Omit<CaseInput, 'poolLetters'>['textLines'] = [];
  if (lead && fig && img) {
    const figBox = rectOf(fig);
    const imgBox = rectOf(img);
    const leadBox = rectOf(lead);
    if (figBox && imgBox && leadBox) {
      const style = getComputedStyle(lead);
      // Wrapped line boxes of the lead's words (kicker, headline, text),
      // outside the photo's own caption: only these can gap against the
      // photo. Links (the read-on line) are short and never wrap, so their
      // line end is no edge.
      const walker = document.createTreeWalker(lead, NodeFilter.SHOW_TEXT);
      let node: Node | null = walker.nextNode();
      while (node) {
        const host = node.parentElement;
        const inText = host && !host.closest('figure, a') && !!host.closest('p, h2');
        if (node.textContent && node.textContent.trim() && inText) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const boxes = range.getClientRects();
          for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            if (b.width > 0 && b.height > 0) {
              textLines.push({ left: b.left, right: b.right, top: b.top, bottom: b.bottom });
            }
          }
          range.detach();
        }
        node = walker.nextNode();
      }
      // The photo stands beside the words when a line shares its height
      // and ends left of its frame, not when it is stacked above or below.
      const side = textLines.some(
        (line) =>
          Math.min(line.bottom, figBox.y + figBox.height) - Math.max(line.top, figBox.y) > 1 &&
          line.right <= figBox.x + 1,
      );
      leadPhoto = {
        fig: figBox,
        img: imgBox,
        side,
        containerLeft: leadBox.x + parseFloat(style.paddingLeft || '0'),
        containerRight: leadBox.x + leadBox.width - parseFloat(style.paddingRight || '0'),
      };
    }
  }
  // Everything printed on page one below the banner: every text line, every
  // picture and every boxed story or notice. The blank-area rule reads the
  // page's columns against these.
  const frontEl = front;
  const frontBox = rectOf(frontEl);
  const ink: Omit<CaseInput, 'poolLetters'>['ink'] = [];
  if (frontEl) {
    const walker = document.createTreeWalker(frontEl, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      if (node.textContent && node.textContent.trim() && !node.parentElement?.closest('template')) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const boxes = range.getClientRects();
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          if (b.width > 0 && b.height > 0) ink.push({ x: b.left, y: b.top, width: b.width, height: b.height });
        }
        range.detach();
      }
      node = walker.nextNode();
    }
    for (const el of Array.from(frontEl.querySelectorAll('img, .photo .print, aside.notice, article.labmail'))) {
      const box = rectOf(el);
      if (box && box.width > 0 && box.height > 0) ink.push(box);
    }
  }
  // The logbook link outside the sheet, weighed against the paper's own
  // control labels: a masthead page tab first — it lives inside the
  // transformed sheet, so it shrinks with the sheet exactly like the
  // masthead details the link must not outread. The sheet-mode control
  // strip's indicator is only the fallback: it lives outside the sheet,
  // so its type never scales and a full-size link would pass against it.
  const logbookLink = rectOf(document.querySelector('.paper-logbook a'));
  let controlLabel = null;
  for (const sel of ['.paper .paper-tab', '.paper-bar [data-page-indicator]']) {
    const el = document.querySelector(sel);
    const box = rectOf(el);
    if (
      el && box && box.width > 0 && box.height > 0 &&
      getComputedStyle(el).display !== 'none' &&
      getComputedStyle(el).visibility !== 'hidden'
    ) {
      controlLabel = box;
      break;
    }
  }
  const colEls = Array.from(
    page.querySelectorAll('.cols .col'),
  );
  const columns = colEls
    .map((el) => {
      const box = rectOf(el);
      if (!box || box.width <= 0 || box.height <= 0) return null;
      const container = el.closest('.cols');
      const foot = container ? rectOf(container) : null;
      if (!foot) return null;
      return { box, foot: foot.y + foot.height };
    })
    .filter((c) => c !== null);
  return {
    printedLetters:
      letterEls.length + (hasLead ? 1 : 0),
    hasLead,
    hasLab: !!labEl,
    gutter,
    sheet: rectOf(sheet) || { x: 0, y: 0, width: 0, height: 0 },
    stories,
    letters,
    lab: rectOf(labEl),
    colophon,
    colophonVisible,
    leadPhoto,
    textLines,
    columns,
    front: frontBox,
    ink,
    logbookLink,
    controlLabel,
    editionEmpty: false,
    pageHidden: false,
    fontsLoaded,
  };
}

interface CaseResult {
  date: string;
  lang: FilterLang;
  viewport: string;
  findings: { rule: string; detail: string }[];
  pageError: string;
}

const main = async (): Promise<void> => {
  if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
    console.error(`check:paper: ${DIST}/ is missing; build first (npm run build)`);
    process.exit(2);
  }
  const manifest = JSON.parse(
    readFileSync(join(FIXDIR, 'manifest.json'), 'utf8'),
  ) as { dates?: unknown };
  const dates = Array.isArray(manifest.dates) ? (manifest.dates as string[]) : [];
  if (!dates.length) {
    console.error('check:paper: manifest has no dates');
    process.exit(2);
  }
  // The recorded web fonts: without them Chromium falls back to Georgia and
  // the sheet's metrics (and therefore every rule) differ from a reader's.
  const fontsPath = join(FIXDIR, 'fonts.json');
  if (!existsSync(fontsPath)) {
    console.error(`check:paper: ${fontsPath} is missing; run npm run record:paper`);
    process.exit(2);
  }
  const fontEntries =
    (JSON.parse(readFileSync(fontsPath, 'utf8')) as {
      entries?: Record<string, FontEntry>;
    }).entries ?? {};
  if (!Object.keys(fontEntries).length) {
    console.error('check:paper: fonts.json has no entries; run npm run record:paper');
    process.exit(2);
  }
  const fontBodies = new Map<string, Buffer>();
  const server = serve(resolve(DIST));
  await new Promise<void>((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  // The colophon copy for the text-match fallback, per language.
  const colophonCopy = async (lang: FilterLang): Promise<string> => {
    try {
      const dict = await import(lang === 'es' ? '../src/i18n/es.ts' : '../src/i18n/en.ts');
      return String((lang === 'es' ? dict.es.today : dict.en.today).colophon || '');
    } catch {
      return '';
    }
  };

  // Stale shots of now-passing cases would accuse the wrong edition.
  rmSync(FAILDIR, { recursive: true, force: true });
  mkdirSync(FAILDIR, { recursive: true });

  const browser = await chromium.launch();
  const failures: CaseResult[] = [];
  let cases = 0;
  const started = Date.now();
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext(viewport.use);
      try {
        for (const date of dates) {
          for (const lang of ['en', 'es'] as FilterLang[]) {
            cases++;
            const otdText = readFileSync(join(FIXDIR, `${date}.${lang}.otd.json`), 'utf8');
            const labText = readFileSync(join(FIXDIR, `${date}.lab.json`), 'utf8');
            const poolLetters = buildPool(JSON.parse(otdText), lang).length;
            const path = lang === 'es' ? `/es/newspaper?d=${date}` : `/newspaper?d=${date}`;
            const page = await context.newPage();
            let pageError = '';
            page.on('pageerror', (e) => {
              if (!pageError) pageError = String(e?.message || e).slice(0, 300);
            });
            page.on('console', (msg) => {
              if (!pageError && msg.type() === 'error') {
                // Resource noise (a 404 asset, an aborted prefetch) is not
                // a page failure; script exceptions are recorded separately.
                const text = msg.text();
                if (/Failed to load resource|net::|ERR_/.test(text)) return;
                pageError = text.slice(0, 300);
              }
            });
            await page.route('**/*', (route) => {
              const url = new URL(route.request().url());
              if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                return route.continue();
              }
              if (url.hostname === '127.0.0.1') return route.continue();
              const font = fontEntries[url.href];
              if (font) {
                // Fonts are cross-origin to the local server; real Google
                // responses carry the CORS header the browser requires.
                let body = fontBodies.get(url.href);
                if (!body) {
                  body = readFileSync(join(FIXDIR, font.file));
                  fontBodies.set(url.href, body);
                }
                return route.fulfill({
                  status: 200,
                  contentType: font.contentType,
                  headers: {
                    'access-control-allow-origin': '*',
                    'cache-control': 'public, max-age=31536000',
                  },
                  body,
                });
              }
              if (
                url.hostname.endsWith('wikipedia.org') &&
                url.pathname.includes('/onthisday/')
              ) {
                return route.fulfill({
                  status: 200,
                  contentType: 'application/json',
                  body: otdText,
                });
              }
              if (url.hostname === 'announcements.univerlab.org' && url.pathname === '/') {
                return route.fulfill({
                  status: 200,
                  contentType: 'application/json',
                  body: labText,
                });
              }
              if (url.hostname === 'announcements.univerlab.org') {
                if (url.pathname === '/events') {
                  // The mailbox live stream: abort (it retries quietly) so
                  // no live update can repaint the measured edition.
                  return route.abort();
                }
                // Page two's founding count: neutral, like a failed read.
                return route.fulfill({
                  status: 200,
                  contentType: 'application/json',
                  body: '{"left":null}',
                });
              }
              // Deterministic and offline: anything not served above (lead
              // photos, analytics) never leaves the machine; the page shows
              // alt boxes for the pictures. The fonts ARE served above, since
              // fallback metrics would change every measured rule.
              return route.abort();
            });
            let input: CaseInput | null = null;
            try {
              await page.goto(base + path, { waitUntil: 'load', timeout: 30000 });
              await page.waitForSelector('#edition .front', { timeout: 20000 });
              // The font stylesheets load as `print` and promote themselves on
              // load; wait for that, then for the faces themselves.
              await page
                .waitForFunction(
                  () =>
                    Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                      .filter((l) => (l as HTMLLinkElement).href.includes('fonts.googleapis.com'))
                      .every((l) => (l as HTMLLinkElement).media !== 'print'),
                  // The stylesheet is local and loads instantly; a longer
                  // wait only delays every case if it is genuinely missing.
                  { timeout: 2000 },
                )
                .catch(() => undefined);
              await page.evaluate(() => document.fonts.ready.then(() => undefined));
              // The page fits its columns on load, but the typefaces arrive
              // after that first fit. Re-run the page's own load listener so we
              // measure the fitted state a reader with the real faces sees, not
              // a stale fit made with fallback metrics.
              await page.evaluate(() => {
                window.dispatchEvent(new Event('load'));
              });
              await page.evaluate(() => document.fonts.ready.then(() => undefined));
              await page.waitForTimeout(300);
              const gathered = await page.evaluate(gather, {
                colophonText: await colophonCopy(lang),
                gutterFallback: GUTTER_FALLBACK,
              });
              input = { ...gathered, poolLetters };
            } catch (e) {
              if (!pageError) pageError = String(e?.message || e).slice(0, 300);
              input = null;
            }
            const findings = input
              ? judgeCase(input)
              : [{ rule: 'harness', detail: 'the page never settled' }];
            if (findings.length) {
              mkdirSync(FAILDIR, { recursive: true });
              const shot = join(FAILDIR, `${date}-${lang}-${viewport.name}.png`);
              try {
                const sheet = page.locator('.paper-sheet[data-paper-sheet]');
                if ((await sheet.count()) > 0) {
                  await sheet.first().screenshot({ path: shot, timeout: 15000 });
                } else {
                  await page.screenshot({ path: shot, timeout: 15000 });
                }
              } catch {
                // A missing sheet is itself the finding; no screenshot then.
              }
              failures.push({
                date, lang, viewport: viewport.name,
                findings: findings.map((f) => ({ rule: f.rule, detail: f.detail })),
                pageError,
              });
              for (const f of findings) {
                console.log(`FAIL ${date} ${lang} ${viewport.name} rule=${f.rule}: ${f.detail}`);
              }
              if (pageError) console.log(`     first page error: ${pageError}`);
            }
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`check:paper: ${cases} cases, ${failures.length} failing, ${secs}s`);
  if (readdirSync('.').includes(FAILDIR)) {
    const shots = readdirSync(FAILDIR).length;
    console.log(`screenshots: ${FAILDIR}/ (${shots} files)`);
  }
  process.exit(failures.length ? 1 : 0);
};

main().catch((e) => {
  console.error(`check:paper: ${String(e?.message || e)}`);
  process.exit(2);
});
