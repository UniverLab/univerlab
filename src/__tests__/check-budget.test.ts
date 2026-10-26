/**
 * The first-view byte counter is what holds the redesigned pages to their
 * load budget, so its counting rules are pinned here on a small fixture:
 * lazy images and preload="none" videos cost nothing, posters always cost
 * something, a picture costs exactly the one AVIF candidate a browser
 * picks, a module script costs nothing until it imports, and the Google
 * Fonts stylesheet never appears as an item (main counts it as a fixed
 * 120 KB). If a counting rule changes, these break.
 *
 * The sum itself is checked against files on disk in `pageCost`, the
 * reviewed budget table is pinned in `budgetedPages` (a guard nobody can
 * pass by lowering the bar is the point), and `checkManifest` is driven
 * over a temp bench for FR3's weight classes.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { budgetedPages, checkManifest, firstViewItems, pageCost } from '../../scripts/check-budget';

const KB = 1024;

const FIXTURE = `<!doctype html><html><head>
<link rel="stylesheet" href="/_astro/site.css">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Old+Standard+TT">
<script type="module" src="/_astro/page.js"></script>
<script src="/js/classic.js" defer></script>
</head><body>
<img id="eager" src="/bench/eager.webp" alt="">
<img id="lazy" src="/bench/lazy.webp" loading="lazy" alt="">
<img id="hero" srcset="/bench/hero-450.avif 450w, /bench/hero-900.avif 900w" alt="">
<video id="none" src="/bench/clip.mp4" poster="/bench/clip-poster.webp" preload="none"></video>
<video id="meta" poster="/bench/meta-poster.webp" preload="metadata"><source src="/bench/meta.mp4"></video>
<picture><source type="image/avif" srcset="/bench/pic-450.avif 450w, /bench/pic-900.avif 900w"><source type="image/webp" srcset="/bench/pic-450.webp 450w"><img src="/bench/pic-fallback.webp" alt=""></picture>
<picture><source type="image/avif" srcset="/bench/lazy-pic.avif"><img src="/bench/lazy-pic.webp" loading="lazy" alt=""></picture>
<script>const fake = '<img src="/bench/fake-in-script.webp">';
</script>
</body></html>`;

describe('firstViewItems', () => {
  const items = firstViewItems(FIXTURE);

  it('counts the local stylesheet, the classic script and the eager image', () => {
    expect(items).toEqual(expect.arrayContaining(['/_astro/site.css', '/js/classic.js', '/bench/eager.webp']));
  });

  it('counts only the first candidate of an img srcset', () => {
    expect(items).toContain('/bench/hero-450.avif');
    expect(items).not.toContain('/bench/hero-900.avif');
  });

  it('does not count a module script (its imports are dynamic)', () => {
    expect(items).not.toContain('/_astro/page.js');
  });

  it('does not count a lazy image', () => {
    expect(items).not.toContain('/bench/lazy.webp');
  });

  it('counts the poster of a preload="none" video but not its src', () => {
    expect(items).toContain('/bench/clip-poster.webp');
    expect(items).not.toContain('/bench/clip.mp4');
  });

  it('counts the inner source of a video that preloads', () => {
    expect(items).toContain('/bench/meta.mp4');
    expect(items).toContain('/bench/meta-poster.webp');
  });

  it('counts a picture as only its first AVIF candidate', () => {
    expect(items).toContain('/bench/pic-450.avif');
    expect(items).not.toContain('/bench/pic-900.avif'); // the 900w candidate
    expect(items).not.toContain('/bench/pic-450.webp'); // the webp source
    expect(items).not.toContain('/bench/pic-fallback.webp'); // the <img> fallback
  });

  it('counts nothing of a picture whose img is lazy', () => {
    expect(items).not.toContain('/bench/lazy-pic.avif');
    expect(items).not.toContain('/bench/lazy-pic.webp');
  });

  it('never lists the Google Fonts stylesheet (main adds a fixed 120 KB)', () => {
    expect(items.some((u) => u.includes('fonts.googleapis.com'))).toBe(false);
    expect(items.some((u) => u.includes('fonts.gstatic.com'))).toBe(false);
  });

  it('ignores fake tags inside inline script bodies', () => {
    expect(items).not.toContain('/bench/fake-in-script.webp');
  });
});

/** The byte sum, taken from real files on disk in a throwaway dist. */
describe('pageCost', () => {
  const dist = mkdtempSync(join(tmpdir(), 'check-budget-'));
  const htmlPath = join(dist, 'index.html');
  const CSS = 'body{background:url(/bench/textures/ground.avif)}';
  const HTML = `<!doctype html><html><head><link rel="stylesheet" href="/_astro/site.css"></head><body><img src="/bench/eager.webp" alt=""><img src="/bench/lazy.webp" loading="lazy" alt=""></body></html>`;

  beforeAll(() => {
    mkdirSync(join(dist, '_astro'), { recursive: true });
    mkdirSync(join(dist, 'bench/textures'), { recursive: true });
    writeFileSync(htmlPath, HTML);
    writeFileSync(join(dist, '_astro/site.css'), CSS);
    writeFileSync(join(dist, 'bench/eager.webp'), 'E'.repeat(1000));
    writeFileSync(join(dist, 'bench/lazy.webp'), 'L'.repeat(9000)); // big, and never counted
    writeFileSync(join(dist, 'bench/textures/ground.avif'), 'G'.repeat(500));
  });

  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  it('sums the html, the counted files on disk and the ground tile — never the lazy image', () => {
    const { totalBytes, items } = pageCost(HTML, htmlPath, dist);
    expect(totalBytes).toBe(Buffer.byteLength(HTML) + Buffer.byteLength(CSS) + 1000 + 500);
    const urls = items.map((i) => i.url);
    expect(urls).toEqual(expect.arrayContaining(['/_astro/site.css', '/bench/eager.webp', '/bench/textures/ground.avif']));
    expect(urls).not.toContain('/bench/lazy.webp');
  });

  it('adds exactly the fixed 120 KB when the page links Google Fonts', () => {
    const withoutFonts = pageCost(HTML, htmlPath, dist).totalBytes;
    const withFonts = HTML.replace(
      '</head>',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Old+Standard+TT"></head>',
    );
    writeFileSync(htmlPath, withFonts);
    const htmlDelta = Buffer.byteLength(withFonts) - Buffer.byteLength(HTML);
    expect(pageCost(withFonts, htmlPath, dist).totalBytes).toBe(withoutFonts + htmlDelta + 120 * KB);
    writeFileSync(htmlPath, HTML);
  });
});

/** The reviewed budget table itself: a budget nobody can miss is not a guard. */
describe('budgetedPages', () => {
  const byRoute = new Map(budgetedPages().map((p) => [p.route, p.budgetBytes]));

  it('holds both homes to the reviewed 1,100 KB', () => {
    expect(byRoute.get('/')).toBe(1100 * KB);
    expect(byRoute.get('/es/')).toBe(1100 * KB);
  });

  it('gives the autoplay-demo pages 6,000 KB and the other experiments 1,200 KB, in both locales', () => {
    for (const route of ['/canopy/', '/es/canopy/', '/texforge/', '/es/texforge/']) {
      expect(byRoute.get(route)).toBe(6000 * KB);
    }
    for (const route of ['/quorum/', '/es/quorum/', '/ghscaff/', '/es/astro-denoise/']) {
      expect(byRoute.get(route)).toBe(1200 * KB);
    }
  });

  it('gives /experiments/ 1,200 KB and the static sections 800 KB', () => {
    expect(byRoute.get('/experiments/')).toBe(1200 * KB);
    expect(byRoute.get('/es/experiments/')).toBe(1200 * KB);
    for (const route of ['/roadmap/', '/manifesto/', '/contributors/', '/status/']) {
      expect(byRoute.get(route)).toBe(800 * KB);
    }
  });
});

/** FR3: the manifest must describe files that exist and stay small. */
describe('checkManifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-manifest-'));
  const bench = join(root, 'public/bench');

  const put = (file: string, bytes: number): void => {
    mkdirSync(dirname(join(bench, file)), { recursive: true });
    writeFileSync(join(bench, file), Buffer.alloc(bytes));
  };
  const manifest = (files: string[]): void => {
    mkdirSync(bench, { recursive: true });
    writeFileSync(join(bench, 'manifest.json'), JSON.stringify({ assets: files.map((file) => ({ file })) }));
  };

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('passes when every listed file exists within its weight class', () => {
    put('machines/plate.avif', 200 * KB);
    put('clips/poster.webp', 300 * KB);
    manifest(['machines/plate.avif', 'clips/poster.webp']);
    expect(checkManifest(root)).toEqual([]);
  });

  it('names a listed file that does not exist', () => {
    manifest(['machines/gone.avif']);
    expect(checkManifest(root)).toEqual([expect.stringContaining('machines/gone.avif')]);
  });

  it('fails a webp over 400 KB and an avif over 300 KB', () => {
    put('heavy.webp', 401 * KB);
    put('heavy.avif', 301 * KB);
    manifest(['heavy.webp', 'heavy.avif']);
    const failures = checkManifest(root);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain('heavy.webp');
    expect(failures[0]).toContain('400 KB');
    expect(failures[1]).toContain('heavy.avif');
    expect(failures[1]).toContain('300 KB');
  });

  it('fails when the manifest itself is missing', () => {
    rmSync(join(bench, 'manifest.json'));
    expect(checkManifest(root)).toEqual([expect.stringContaining('not found')]);
  });
});
