/**
 * Engraved postcards + watermarks on the lab's general pages.
 * Each opening carries its postcard; people/status/roadmap sit over the
 * blueprint drawing and the manifesto over the celestial chart.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const postcard = read('src/components/Postcard.astro');
const watermark = read('src/components/Watermark.astro');
const globalCss = read('src/styles/global.css');

/** [file, page prop, alt expression the file must pass] */
const carriers: Array<[string, string, string]> = [
  ['src/pages/api.astro', 'api', 't.postcards.api'],
  ['src/pages/es/api.astro', 'api', 't.postcards.api'],
  ['src/pages/archive.astro', 'archive', 't.postcards.archive'],
  ['src/pages/es/archive.astro', 'archive', 't.postcards.archive'],
  ['src/views/People.astro', 'contributors', 't.postcards.contributors'],
  ['src/views/Experiments.astro', 'experiments', 't.postcards.experiments'],
  ['src/pages/feed.astro', 'feed', 't.postcards.feed'],
  ['src/pages/es/feed.astro', 'feed', 't.postcards.feed'],
  ['src/views/Manifesto.astro', 'manifesto', 't.postcards.manifesto'],
  // The 404 dropped its postcard: the kraken chart is its opening now (see
  // not-found-kraken.test.ts). The postcard key stays for the asset history.
  ['src/pages/roadmap.astro', 'roadmap', 'en.postcards.roadmap'],
  ['src/pages/status.astro', 'status', 'en.postcards.status'],
  ['src/pages/today.astro', 'today', 't.postcards.today'],
  ['src/pages/es/today.astro', 'today', 't.postcards.today'],
];

const dayBlock = postcard.slice(postcard.indexOf('data-pc="day"'), postcard.indexOf('data-pc="night"'));
const nightBlock = postcard.slice(postcard.indexOf('data-pc="night"'), postcard.indexOf('data-pc-swap'));
const imgOf = (block: string) => block.slice(block.indexOf('<img'), block.indexOf('/>', block.indexOf('<img')) + 2);

describe('Postcard component', () => {
  it('serves 800w and 1600w desktop srcsets plus a mobile crop, day and night', () => {
    // One desktop srcset template: the same page key at 1600w and 800w.
    expect(postcard).toContain('${page}-${phase}-1600.${ext} 1600w, /bench/postcards/${page}-${phase}-800.${ext} 800w');
    for (const phase of ['day', 'night']) {
      expect(postcard).toContain(`desktop('${phase}', 'avif')`);
      expect(postcard).toContain(`desktop('${phase}', 'webp')`);
      expect(postcard).toContain(`/bench/postcards/\${page}-${phase}-mobile.avif`);
      expect(postcard).toContain(`/bench/postcards/\${page}-${phase}-mobile.webp`);
    }
    for (const block of [dayBlock, nightBlock]) {
      expect(block.match(/type="image\/avif"/g)).toHaveLength(2);
      expect(block.match(/type="image\/webp"/g)).toHaveLength(2);
    }
    // AVIF and WebP never share one srcset.
    for (const m of postcard.matchAll(/srcset=\{`([^`]*)`\}/g)) {
      const urls = m[1];
      expect(urls.includes('.avif') && urls.includes('.webp')).toBe(false);
    }
  });

  it('fixes intrinsic size at 1600x900 so nothing shifts', () => {
    expect(postcard).toContain('width="1600"');
    expect(postcard).toContain('height="900"');
    expect(postcard).toContain('aspect-ratio: 16 / 9');
    expect(postcard).toContain('aspect-ratio: 720 / 900');
  });

  it('loads day eager/high, night lazy, with an inline script that swaps them', () => {
    expect(imgOf(dayBlock)).toContain('fetchpriority="high"');
    expect(imgOf(dayBlock)).not.toContain('loading=');
    expect(imgOf(nightBlock)).toContain('loading="lazy"');
    expect(imgOf(nightBlock)).not.toContain('fetchpriority');
    expect(postcard).toContain('is:inline');
    expect(postcard).toContain("document.documentElement.dataset.benchTheme === 'night'");
    expect(postcard).toContain('univerlab:themechange');
  });

  it('shows exactly one picture per theme via data-bench-theme CSS', () => {
    expect(postcard).toMatch(/html\[data-bench-theme='night'\]\s+\.pc-day\s*\{\s*display:\s*none/);
    expect(postcard).toMatch(/html:not\(\[data-bench-theme='night'\]\)\s+\.pc-night\s*\{\s*display:\s*none/);
  });
});

describe('page openings', () => {
  it('all 13 carriers import the Postcard with their own page key and alt', () => {
    expect(carriers).toHaveLength(13);
    for (const [file, page, alt] of carriers) {
      const src = read(file);
      expect(`${file}\n${src}`).toContain(`<Postcard page="${page}" alt={`);
      expect(`${file}\n${src}`).toContain(alt);
      expect(`${file}\n${src}`).toContain("import Postcard from");
      // The canvas runner left these pages; the postcard is the opening now.
      expect(src).not.toContain('bg="cosmic"');
      expect(src).not.toMatch(/bg=\{/);
    }
  });

  it('lays the opening out in global.css: card above h1 on mobile, two columns from 64rem', () => {
    expect(globalCss).toContain('.page-open');
    expect(globalCss).toContain('min(22rem, 100%)');
    expect(globalCss).toContain('order: -1');
    expect(globalCss).toContain('64rem');
    expect(globalCss).toContain('42%');
    expect(globalCss).toContain('-1.2deg');
    expect(globalCss).toContain('0 10px 28px rgb(0 0 0 / .18)');
    expect(globalCss).toContain('0 10px 28px rgb(0 0 0 / .45)');
  });
});

describe('Watermark component', () => {
  it('uses image-set with AVIF first and switches day/night by theme', () => {
    expect(watermark).toContain('image-set(');
    const avifFirst = watermark.indexOf('.avif');
    const webpFirst = watermark.indexOf('.webp');
    expect(avifFirst).toBeGreaterThan(-1);
    expect(avifFirst).toBeLessThan(webpFirst);
    expect(watermark).toContain("html[data-bench-theme='night']");
    expect(watermark).toContain('celestial-day-800');
    expect(watermark).toContain('celestial-night-800');
  });

  it('repeats the blueprint tile at 800px/0.5 and prints the celestial chart once across the top at 0.45', () => {
    expect(watermark).toContain('background-size: 800px');
    expect(watermark).toContain('opacity: 0.5');
    expect(watermark).toContain('background-size: 100% auto');
    expect(watermark).toContain('background-position: top center');
    expect(watermark).toMatch(/mask-image: linear-gradient\(to bottom, #000 0, #000 70vh, transparent 130vh\)/);
    expect(watermark).toContain('opacity: 0.45');
  });

  it('scrolls with the paper behind content, aria-hidden and click-through', () => {
    expect(watermark).toContain('aria-hidden="true"');
    expect(watermark).toContain('pointer-events: none');
    expect(watermark).toContain('z-index: -1');
    // Printed on the paper: a fixed drawing let the ground's mottling slide
    // across its lines on every scroll.
    expect(watermark).toContain('position: absolute');
    expect(watermark).not.toContain('position: fixed');
    // body paints the ground tile over any negative z-index layer unless it owns
    // the stacking context; without this the drawing is invisible. It is also
    // the watermark's box, so the drawing spans the whole page.
    expect(watermark).toMatch(/:global\(body\)\s*\{\s*isolation:\s*isolate;\s*position:\s*relative;?\s*\}/);
  });

  it('lands on the manifesto (celestial) and on people, status, roadmap (blueprint)', () => {
    expect(read('src/views/Manifesto.astro')).toContain('<Watermark kind="celestial"');
    for (const f of ['src/views/People.astro', 'src/pages/status.astro', 'src/pages/roadmap.astro']) {
      expect(`${f}: ${read(f)}`).toContain('<Watermark kind="blueprint"');
    }
    const others = carriers
      .map(([f]) => f)
      .filter((f) => !['src/views/Manifesto.astro', 'src/views/People.astro', 'src/pages/status.astro', 'src/pages/roadmap.astro'].includes(f));
    expect(others).toHaveLength(9);
    for (const f of others) {
      expect(`${f}: ${read(f)}`).not.toContain('<Watermark');
    }
  });

  it('veils dense text over the drawing instead of lowering the opacity', () => {
    expect(read('src/views/Manifesto.astro')).toContain('color-mix(in srgb, var(--bg) 80%, transparent)');
    expect(read('src/pages/roadmap.astro')).toContain('color-mix(in srgb, var(--bg) 80%, transparent)');
    expect(read('src/pages/status.astro')).toContain('color-mix(in srgb, var(--bg) 80%, transparent)');
  });
});

describe('postcards dictionary', () => {
  const keys = ['api', 'archive', 'contributors', 'experiments', 'feed', 'manifesto', 'not-found', 'roadmap', 'status', 'today'];

  it('has the same 10 keys in both languages', () => {
    expect(Object.keys(en.postcards).sort()).toEqual([...keys].sort());
    expect(Object.keys(es.postcards).sort()).toEqual([...keys].sort());
  });

  it('writes one literal sentence per card, over 40 chars, and never the same string twice', () => {
    const seen = new Set<string>();
    for (const k of keys) {
      const a = (en.postcards as Record<string, string>)[k];
      const b = (es.postcards as Record<string, string>)[k];
      expect(a.length).toBeGreaterThan(40);
      expect(b.length).toBeGreaterThan(40);
      expect(a).not.toBe(b);
      expect(seen.has(a)).toBe(false);
      seen.add(a);
    }
  });

  it('keeps the roadmap card literal about the engraving that ships', () => {
    expect(en.postcards.roadmap).toMatch(/drafting table.*sea chart.*compass rose.*rolled maps.*dividers.*globe/i);
    expect(es.postcards.roadmap).toMatch(/mesa de dibujo.*carta marina.*rosa de los vientos.*mapas enrollados.*compás.*globo terráqueo/i);
  });
});
