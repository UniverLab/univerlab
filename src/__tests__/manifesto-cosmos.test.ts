/**
 * Source-level tests for the /manifesto "Perspective" section: the cosmic
 * perspective as editorial typography — deep time and the cosmic address as
 * two ordered lists, the coda as a closing italic line — with the old
 * scrollytelling (live SVG, poster SVG, 500vh track, its script and its
 * dictionary keys) gone.
 *
 * Astro components aren't renderable in Jest, so we verify the contract by
 * reading the source file as text and the dictionaries as data. The section
 * renders its copy through `c.timescales.map(...)` and `c.address.map(...)`,
 * so every label in the dictionary is emitted; these tests pin that the whole
 * arrays are what the section reads, that the markup is lists — not SVG —
 * and that i18n parity still holds.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const ROOT = resolve(__dirname, '..', '..');
const astroSrc = readFileSync(resolve(ROOT, 'src', 'views', 'Manifesto.astro'), 'utf8');

// The perspective section, from its id to the section's close — the exact
// span the assertions read.
const sectionStart = astroSrc.indexOf('<section id="perspective"');
const sectionEnd = astroSrc.indexOf('</section>', sectionStart);
const perspective = sectionStart === -1 ? '' : astroSrc.slice(sectionStart, sectionEnd);

const dicts: Array<[string, typeof en]> = [
  ['en', en],
  ['es', es],
];

describe('manifesto cosmos section', () => {
  it('keeps the id and opens with the localised kicker as a reading section', () => {
    expect(sectionStart).toBeGreaterThan(-1);
    expect(perspective).toMatch(/class="wrap section"/);
    expect(perspective).toMatch(/<h2 class="sec-h">\{c\.kicker\}<\/h2>/);
  });

  it('renders deep time as an ordered list of mono spans over editorial names', () => {
    expect(perspective).toMatch(/<h3 class="cosmos-h">\{c\.timelineTitle\}<\/h3>/);
    expect(perspective).toMatch(/<ol class="timescales">/);
    expect(perspective).toMatch(/c\.timescales\.map\(\(\[span, name\]\)/);
    // The space between span and name is a text node: flex layout ignores it,
    // but build-md needs it so the markdown twin does not glue the two words.
    expect(perspective).toMatch(/<li><span class="ts-span">\{span\}<\/span> \{name\}<\/li>/);
  });

  it('renders the cosmic address as an ordered list that starts with Us', () => {
    expect(perspective).toMatch(/<h3 class="cosmos-h">\{c\.addressTitle\}<\/h3>/);
    expect(perspective).toMatch(/<p>\{c\.addressIntro\}<\/p>/);
    expect(perspective).toMatch(/<ol class="address">/);
    const usAt = perspective.indexOf('<li>{c.us}</li>');
    const mapAt = perspective.indexOf('c.address.map');
    expect(usAt).toBeGreaterThan(-1);
    expect(mapAt).toBeGreaterThan(usAt);
    expect(perspective).toMatch(/<li>\{name\} <span class="ad-scale">\{scale\}<\/span><\/li>/);
  });

  it('renders the coda as the closing centred italic line', () => {
    expect(perspective).toMatch(/<p class="cosmos-coda">\{c\.coda\}<\/p>/);
  });

  it('has removed the scrollytelling: no data hooks, no sticky track, no SVG', () => {
    expect(astroSrc).not.toMatch(/data-cosmos/);
    expect(astroSrc).not.toMatch(/cosmos-scrolly|cosmos-sticky|cosmos-svg|cosmos-poster/);
    expect(astroSrc).not.toMatch(/500vh/);
    expect(astroSrc).not.toMatch(/position:\s*sticky/);
    expect(astroSrc).not.toMatch(/cosmos-caption|visually-hidden/);
  });

  describe.each(dicts)('%s dictionary', (_lang, dict) => {
    it('carries every timescale as a [span, name] pair', () => {
      for (const [span, name] of dict.cosmos.timescales) {
        expect(typeof span).toBe('string');
        expect(span.length).toBeGreaterThan(0);
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      }
    });

    it('carries every horizon as a [name, scale] pair', () => {
      for (const [name, scale] of dict.cosmos.address) {
        expect(name.length).toBeGreaterThan(0);
        expect(scale.length).toBeGreaterThan(0);
      }
    });

    it('carries us and the coda', () => {
      expect(typeof dict.cosmos.us).toBe('string');
      expect(dict.cosmos.us.length).toBeGreaterThan(0);
      expect(typeof dict.cosmos.coda).toBe('string');
      expect(dict.cosmos.coda.length).toBeGreaterThan(0);
    });

    it('no longer carries the scrollytelling-only keys', () => {
      for (const key of ['timescalesSpans', 'you', 'youDetail', 'addressSpans', 'caption']) {
        expect(dict.cosmos).not.toHaveProperty(key);
      }
    });

    it('references every cosmos key the section uses', () => {
      for (const key of [
        'timescales', 'address', 'coda', 'us',
        'addressTitle', 'addressIntro', 'timelineTitle', 'kicker',
      ]) {
        expect(astroSrc).toMatch(new RegExp(`c\\.${key}\\b`));
      }
    });
  });

  it('en and es have the same cosmos array lengths', () => {
    expect(es.cosmos.timescales.length).toBe(en.cosmos.timescales.length);
    expect(es.cosmos.address.length).toBe(en.cosmos.address.length);
  });

  it('check-i18n parity holds', () => {
    expect(() =>
      execFileSync('node', ['scripts/check-i18n.ts'], { cwd: ROOT, stdio: 'pipe' }),
    ).not.toThrow();
  });
});
