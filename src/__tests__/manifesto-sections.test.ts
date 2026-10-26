/**
 * Source-level tests for the structure of /manifesto v4: the eight sections
 * that follow the paper (Pensamiento Cósmico, 19 Oct 2026), the index, and the
 * living-document header.
 *
 * Astro components aren't renderable in Jest, so the contract is verified by
 * reading the source as text and the dictionaries as data.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { htmlToMarkdown } from '../../scripts/build-md';
import { startSolLabel } from '../lib/mission-time';

const ROOT = resolve(__dirname, '..', '..');
const src = readFileSync(resolve(ROOT, 'src', 'views', 'Manifesto.astro'), 'utf8');
const ORDER = ['perspective', 'dissipative', 'the-other', 'heuristics', 'partial-success', 'provenance', 'practice', 'observatory'];
const dicts: Array<[string, typeof en]> = [['en', en], ['es', es]];

describe('manifesto v4 sections', () => {
  it('renders the eight sections in the paper order with stable ids', () => {
    let cursor = -1;
    for (const id of ORDER) {
      const idx = src.indexOf(`id="${id}"`);
      expect(idx).toBeGreaterThan(cursor);
      cursor = idx;
    }
    const rail = src.slice(src.indexOf('const railSections'), src.indexOf('] as const;'));
    expect(rail.match(/\{ id: '/g) ?? []).toHaveLength(ORDER.length);
    for (const id of ORDER) expect(rail).toContain(`{ id: '${id}'`);
  });

  it('drops the v3 sections the paper corrected', () => {
    for (const gone of ['what-we-value', 'transition', 'imperatives', 'pillars', 'what-changes', 'in-development']) {
      expect(src).not.toContain(`id="${gone}"`);
    }
    for (const [, d] of dicts) {
      const m = d.manifesto as Record<string, unknown>;
      for (const key of ['purpose', 'purposeTitle', 'imperatives', 'pillars', 'path', 'transitionBody', 'note']) {
        expect(m[key]).toBeUndefined();
      }
    }
  });

  it('carries every v4 key in both languages with matching shapes', () => {
    for (const [, d] of dicts) {
      const m = d.manifesto;
      expect(m.docVersion).toBe('4.0');
      expect(m.dissipative).toHaveLength(3);
      expect(m.other).toHaveLength(4);
      expect(m.heuristics.map(([code]) => code)).toEqual(['H1', 'H2', 'H3']);
      expect(m.partial).toHaveLength(4);
      expect(m.provenance).toHaveLength(5);
      expect(m.limits).toHaveLength(4);
      expect(m.practice).toHaveLength(2);
      for (const text of [m.lead, m.nihilismQuestion, m.provenanceGap, m.closing, m.toc]) expect(text.length).toBeGreaterThan(0);
    }
    expect(es.manifesto.epigraph).toBe('«Tener perspectiva y procurar con heurística.»');
    expect(es.manifesto.nihilismQuestion).toBe('¿Cuántas personas viven mejor gracias a que existes?');
  });

  it('renders the copy from the dictionary', () => {
    for (const ref of ['{m.lead}', '{m.ethicsIntro}', '{m.nihilismQuestion}', '{m.provenanceIntro}', '{m.provenanceGap}', '{m.limitsNote}', '{m.closing}']) {
      expect(src).toContain(ref);
    }
    expect(src).toMatch(/m\.heuristics\.map\(\(\[code, name, question\]\)/);
    expect(src).toMatch(/m\.provenance\.map\(\(\[level, body\], i\)/);
  });

  it('draws the plates of sections I to IV', () => {
    expect(src).toContain('<CosmicPlate copy={c} />');
    expect(src).toContain('kind="membrane"');
    expect(src).toContain('kind="foci"');
    expect(src).toContain('kind="triangle"');
  });

  it('generates Roman numerals from code, not from the dictionary', () => {
    expect(src).toMatch(/const roman\s*=/);
    expect(src).toMatch(/roman\(i \+ 1\)/);
    const rail = src.slice(src.indexOf('const railSections'), src.indexOf('] as const;'));
    expect(rail).not.toMatch(/label:\s*['"]I{1,3}|label:\s*['"]I[VX]/);
  });

  it('tracks the current section with one IntersectionObserver and marks it aria-current', () => {
    expect((src.match(/IntersectionObserver/g) ?? []).length).toBe(1);
    expect(src).toMatch(/setAttribute\('aria-current',\s*'true'\)/);
    for (const id of ORDER) expect(src).toContain(`[id="${id}"]`);
  });

  it('puts the index in its own sticky column from 1100px and folds it above the text below', () => {
    expect(src).toMatch(/@media \(min-width: 1100px\) \{\s*\.m-body \{ grid-template-columns: 13\.5rem minmax\(0, 1fr\);/);
    expect(src).toMatch(/\.rail \{ position: sticky;/);
    expect(src).toContain('<details class="rail-fold" open>');
    expect(src).toContain('{m.toc}');
    expect(src).not.toMatch(/padding-inline-start:\s*20rem/);
    expect(src).not.toMatch(/:global\(main#main\)/);
  });

  it('computes the living-document header from docDate and keeps it out of aria-hidden', () => {
    expect(src).toMatch(/startSolLabel\(m\.docDate\)/);
    expect(src).toMatch(/<p class="doc-header"><time[^>]*>\{docHeader\}<\/time><\/p>/);
    expect(src).not.toMatch(/doc-header[^>]*aria-hidden/);
    expect(startSolLabel(en.manifesto.docDate)).toBe(startSolLabel(es.manifesto.docDate));
  });

  it('keeps the header line and the questions in the markdown twin, and the index out', () => {
    const html = [
      '<main>',
      `<nav class="rail"><ol><li><a href="#heuristics"><span>IV</span>${en.manifesto.ethicsTitle}</a></li></ol></nav>`,
      '<p class="doc-header">living document · v4.0 · 2026 · Sol 299</p>',
      `<h2>${en.manifesto.provenanceTitle}</h2>`,
      `<p>${en.manifesto.nihilismQuestion}</p>`,
      '</main>',
    ].join('');
    const flat = htmlToMarkdown(html).replace(/\s+/g, ' ');
    expect(flat).toContain('living document · v4.0 · 2026 · Sol 299');
    expect(flat).toContain(`## ${en.manifesto.provenanceTitle}`);
    expect(flat).toContain(en.manifesto.nihilismQuestion);
    expect(flat).not.toContain(en.manifesto.ethicsTitle);
  });
});
