/**
 * Source-level tests for the rebuilt /manifesto "Perspective" scene: one inline
 * SVG, two acts (deep time, then the cosmic address), driven by native scroll.
 *
 * Astro components aren't renderable in Jest, so we verify the contract by
 * reading the source files as text and the dictionaries as data. The scene
 * renders its copy through `c.timescales.map(...)` and `c.address.map(...)`, so
 * every label in the dictionary is emitted; these tests pin that the whole
 * arrays are what the scene reads, that the numeric spans line up, that the
 * cruise-control script is gone, and that i18n parity still holds.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const ROOT = resolve(__dirname, '..', '..');
const astroSrc = readFileSync(resolve(ROOT, 'src', 'views', 'Manifesto.astro'), 'utf8');

// The scene's SVG template path. The live stage and the static poster are two
// SVGs (the poster is the reduced-motion / no-JS artifact); between them they
// carry every label, so the assertions read their union.
const sliceSvg = (cls: string): string => {
  const start = astroSrc.indexOf(`<svg class="${cls}"`);
  if (start === -1) return '';
  const end = astroSrc.indexOf('</svg>', start);
  return astroSrc.slice(start, end);
};
const sceneSvg = sliceSvg('cosmos-svg') + sliceSvg('cosmos-poster');

// The cosmos script (the first <script> block), kept separate so the "no wheel
// / no preventDefault" checks never trip on the unrelated Observatory script.
const scriptStart = astroSrc.indexOf('<script>');
const scriptEnd = astroSrc.indexOf('</script>', scriptStart);
const cosmosScript = astroSrc.slice(scriptStart, scriptEnd);

const dicts: Array<[string, typeof en]> = [
  ['en', en],
  ['es', es],
];

describe('manifesto cosmos scene', () => {
  it('renders one inline SVG with a fixed viewBox and an accessible caption', () => {
    expect(sceneSvg).toMatch(/viewBox="0 0 1000 1000"/);
    expect(sceneSvg).toMatch(/role="img"/);
    expect(sceneSvg).toMatch(/aria-labelledby="cosmos-caption"/);
  });

  it('keeps the deep-time and address data as semantic lists for agents', () => {
    expect(astroSrc).toMatch(/<ol>/);
    expect(astroSrc).toMatch(/<dl>/);
    expect(astroSrc).toMatch(/timescales\.map/);
  });

  it('is scroll-driven with a sticky track and an IntersectionObserver', () => {
    expect(astroSrc).toMatch(/data-cosmos\b/);
    expect(astroSrc).toMatch(/position:\s*sticky/);
    expect(astroSrc).toMatch(/IntersectionObserver/);
  });

  describe.each(dicts)('%s dictionary', (_lang, dict) => {
    it('has every timescale label reachable in the scene SVG', () => {
      expect(sceneSvg).toMatch(/c\.timescales\.map/);
      for (const [span, name] of dict.cosmos.timescales) {
        expect(typeof span).toBe('string');
        expect(span.length).toBeGreaterThan(0);
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      }
    });

    it('has every address name and scale string reachable in the scene SVG', () => {
      expect(sceneSvg).toMatch(/c\.address\.map/);
      for (const [name, scale] of dict.cosmos.address) {
        expect(name.length).toBeGreaterThan(0);
        expect(scale.length).toBeGreaterThan(0);
      }
    });

    it('renders the coda in the scene SVG', () => {
      expect(sceneSvg).toContain('{c.coda}');
      expect(typeof dict.cosmos.coda).toBe('string');
      expect(dict.cosmos.coda.length).toBeGreaterThan(0);
    });

    it('references every cosmos key the scene uses', () => {
      for (const key of [
        'timescales', 'address', 'coda', 'you', 'us', 'youDetail',
        'addressTitle', 'addressIntro', 'timelineTitle', 'caption', 'kicker',
      ]) {
        expect(astroSrc).toMatch(new RegExp(`c\\.${key}`));
      }
      // The accessible name of both SVGs is the localised caption, never a
      // hard-coded English string.
      expect(astroSrc).toMatch(/\{c\.caption\}/);
    });
  });

  it('en and es have the same cosmos array lengths', () => {
    expect(es.cosmos.timescales.length).toBe(en.cosmos.timescales.length);
    expect(es.cosmos.address.length).toBe(en.cosmos.address.length);
    expect(es.cosmos.timescalesSpans.length).toBe(en.cosmos.timescalesSpans.length);
    expect(es.cosmos.addressSpans.length).toBe(en.cosmos.addressSpans.length);
  });

  describe('numeric spans', () => {
    it('timescalesSpans: one per timescale, strictly decreasing', () => {
      const s = en.cosmos.timescalesSpans;
      expect(s.length).toBe(en.cosmos.timescales.length);
      for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThan(s[i - 1]);
    });

    it('timescalesSpans: every derived zoom factor is greater than 1', () => {
      const s = en.cosmos.timescalesSpans;
      for (let i = 1; i < s.length; i++) expect(s[i - 1] / s[i]).toBeGreaterThan(1);
    });

    it('addressSpans: one per horizon, strictly increasing', () => {
      const s = en.cosmos.addressSpans;
      expect(s.length).toBe(en.cosmos.address.length);
      for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
    });
  });

  describe('cruise control removed', () => {
    it('has no wheel listener and no preventDefault in the cosmos script', () => {
      expect(cosmosScript).not.toMatch(/addEventListener\s*\(\s*['"]wheel['"]/);
      expect(cosmosScript).not.toMatch(/preventDefault\s*\(/);
    });

    it('no longer contains the .zo-stack element', () => {
      expect(astroSrc).not.toMatch(/\.zo-stack/);
    });
  });

  it('check-i18n parity holds', () => {
    expect(() =>
      execFileSync('node', ['scripts/check-i18n.ts'], { cwd: ROOT, stdio: 'pipe' }),
    ).not.toThrow();
  });
});
