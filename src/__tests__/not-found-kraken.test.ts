/**
 * The 404 is the edge of the known world: an antique sea chart whose drawing
 * thins into blank parchment, where a kraken rises, under the old warning
 * Hic sunt dracones. It replaced the ASCII globe and the "drifted off the
 * map" space copy — the last space-mission piece on the page side.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const root = join(__dirname, '..', '..');
const page = readFileSync(join(root, 'src/pages/404.astro'), 'utf8');

/** The markup of one theme's chart, from its picture tag to its close. */
const pictureOf = (phase: 'day' | 'night') => {
  const start = page.indexOf(`class="kraken kraken-${phase}"`);
  expect(start).toBeGreaterThan(-1);
  const end = page.indexOf('</picture>', start);
  return page.slice(start, end);
};

describe('404 — Hic sunt dracones', () => {
  it('ships both theme charts as <picture>: AVIF before WebP, 800w and 1600w srcsets', () => {
    // One srcset template: the kraken file at 1600w and 800w, per phase/format.
    expect(page).toContain('/bench/mapa/kraken-${phase}-1600.${ext} 1600w, /bench/mapa/kraken-${phase}-800.${ext} 800w');
    for (const phase of ['day', 'night'] as const) {
      const pic = pictureOf(phase);
      const avif = pic.indexOf(`srcset={srcset('${phase}', 'avif')}`);
      const webp = pic.indexOf(`srcset={srcset('${phase}', 'webp')}`);
      expect(avif).toBeGreaterThan(-1);
      expect(avif).toBeLessThan(webp);
      expect(pic).toContain('type="image/avif"');
      expect(pic).toContain('type="image/webp"');
      // Capped at 64rem on wide screens, full width below (one shared sizes).
      expect(pic).toContain('sizes={sizes}');
      // The fallback <img> points at the 800w webp of its own theme.
      expect(pic).toContain(`src="/bench/mapa/kraken-${phase}-800.webp"`);
    }
    expect(page).toContain("const sizes = '(max-width: 64rem) 100vw, 64rem';");
    // AVIF and WebP never share one srcset: the template takes one ext at a
    // time (`ext: 'avif' | 'webp'`), so each srcset is single-format by type.
    expect(page.slice(page.indexOf('const srcset'), page.indexOf('const sizes')))
      .toContain("ext: 'avif' | 'webp'");
  });

  it('fixes the charts’ true intrinsic size 1600x914 and loads only the visible one high-priority', () => {
    for (const phase of ['day', 'night'] as const) {
      const pic = pictureOf(phase);
      expect(pic).toContain('width="1600"');
      // The kraken files ship 1600x914 — their own ratio, not 16:9. The
      // markup describes the real bytes; a forced ratio would squish them.
      expect(pic).toContain('height="914"');
      expect(pic).toContain('alt={t.notFound.alt}');
      // Lazy in markup: an eager img would be fetched by the preload scanner
      // before the swap script runs, so every visitor would download both
      // charts; lazy + display:none means the off-theme one never loads.
      expect(pic).toContain('loading="lazy"');
      expect(pic).not.toContain('fetchpriority');
    }
    // The CSS never forces a ratio over the charts: the attributes carry it.
    expect(page).not.toMatch(/\.kraken img\s*\{[^}]*aspect-ratio/);
  });

  it('swaps eager/lazy with the theme, keyed to the same test the head script uses', () => {
    expect(page).toContain("document.documentElement.dataset.benchTheme === 'night'");
    expect(page).toContain("document.querySelector('picture.kraken-day > img')");
    expect(page).toContain("document.querySelector('picture.kraken-night > img')");
    expect(page).toContain("'univerlab:themechange'");
    // The swap promotes one chart to high priority and demotes the other.
    expect(page).toMatch(/function eager\(img\)\s*\{\s*img\.setAttribute\('fetchpriority', 'high'\)/);
    expect(page).toMatch(/function lazy\(img\)\s*\{\s*img\.setAttribute\('loading', 'lazy'\)/);
  });

  it('shows exactly one chart per theme via data-bench-theme CSS, and melts the day paper', () => {
    expect(page).toMatch(/html\[data-bench-theme='night'\]\s+\.kraken-day\s*\{\s*display:\s*none/);
    expect(page).toMatch(/html:not\(\[data-bench-theme='night'\]\)\s+\.kraken-night\s*\{\s*display:\s*none/);
    expect(page).toMatch(/\.kraken-day img\s*\{\s*mix-blend-mode:\s*multiply/);
    expect(page).toContain('max-width: 64rem');
  });

  it('warns in Latin: an italic serif h1 with lang="la", over the dictionary line', () => {
    expect(page).toContain('<h1 lang="la">{t.notFound.title}</h1>');
    expect(page).toMatch(/\.notfound h1\s*\{[^}]*font-family:\s*var\(--font-serif\)/);
    expect(page).toMatch(/\.notfound h1\s*\{[^}]*font-style:\s*italic/);
    expect(page).toMatch(/\.notfound h1\s*\{[^}]*font-size:[^}]*3rem/);
    expect(page).toContain('{t.notFound.line}');
    expect(en.notFound.title).toBe('Hic sunt dracones');
  });

  it('labels the kicker in mono and offers both ways back, localized', () => {
    expect(page).toContain('{t.notFound.kicker}');
    expect(page).toMatch(/class="kicker mono"/);
    expect(page).toContain("{t.notFound.back}");
    expect(page).toContain("{t.notFound.encyclopedia}");
    expect(page).toContain("localizePath('/', lang)");
    expect(page).toContain("localizePath('/experiments', lang)");
    expect(en.notFound.back).toBe('← Back to the hall');
    expect(es.notFound.back).toBe('← Volver a la sala');
    expect(en.notFound.encyclopedia).toBe('The encyclopedia →');
    expect(es.notFound.encyclopedia).toBe('La enciclopedia →');
  });

  it('keeps the 404 contract: no postcard, no ASCII globe, no canvas, no twin', () => {
    expect(page).not.toContain('Postcard');
    expect(page).not.toContain('ascii');
    expect(page).not.toContain('<pre');
    expect(page).not.toContain('bg="cosmic"');
    expect(page).not.toContain('drifted');
    expect(page).toContain('bg={false}');
    expect(page).toContain('markdownTwin={false}');
  });

  it('centers the column and stays scroll-free on a phone', () => {
    expect(page).toMatch(/\.notfound\s*\{[^}]*align-items:\s*center/);
    expect(page).toMatch(/\.notfound\s*\{[^}]*text-align:\s*center/);
    expect(page).toMatch(/@media \(max-width: 40rem\)/);
    expect(page).toMatch(/overflow-x:\s*clip/);
    expect(page).toMatch(/\.notfound h1\s*\{[^}]*font-size:\s*2\.2rem/);
  });
});

describe('notFound dictionary', () => {
  it('has the same keys in both languages, line and alt translated differently', () => {
    expect(Object.keys(en.notFound).sort()).toEqual(Object.keys(es.notFound).sort());
    expect(en.notFound.line).not.toBe(es.notFound.line);
    expect(en.notFound.alt).not.toBe(es.notFound.alt);
  });

  it('writes the spec copy literally in both languages', () => {
    expect(en.notFound.line).toBe('This page is on no map. Beyond here, only monsters.');
    expect(es.notFound.line).toBe('Esta página no está en ningún mapa. Más allá de aquí, solo monstruos.');
    expect(en.notFound.alt).toBe(
      'An antique engraved sea chart fading into blank parchment, where a giant kraken rises from the waves',
    );
    expect(es.notFound.alt).toBe(
      'Una carta náutica antigua grabada que se desvanece en papel en blanco, donde un kraken gigante sale de las olas',
    );
  });

  it('describes the chart in more than 40 characters so the alt is not a shrug', () => {
    expect(en.notFound.alt.length).toBeGreaterThan(40);
    expect(es.notFound.alt.length).toBeGreaterThan(40);
  });
});

describe('kraken assets', () => {
  it('the eight theme/size/format files the page references exist on disk', () => {
    for (const phase of ['day', 'night']) {
      for (const size of [800, 1600]) {
        for (const ext of ['avif', 'webp']) {
          const f = join(root, 'public', 'bench', 'mapa', `kraken-${phase}-${size}.${ext}`);
          expect(() => readFileSync(f)).not.toThrow();
        }
      }
    }
  });

  it('the declared width/height describe the real 1600x914 bytes (VP8 keyframe header)', () => {
    // A swapped asset with a different ratio must fail here until the page's
    // width/height follow it — a silent squish or layout shift is the defect.
    const buf = readFileSync(join(root, 'public', 'bench', 'mapa', 'kraken-day-1600.webp'));
    const i = buf.indexOf('VP8 ');
    expect(i).toBeGreaterThan(-1);
    const w = buf.readUInt16LE(i + 14) & 0x3fff;
    const h = buf.readUInt16LE(i + 16) & 0x3fff;
    expect(`${w}x${h}`).toBe('1600x914');
    expect(page).toContain('width="1600"');
    expect(page).toContain('height="914"');
  });
});
