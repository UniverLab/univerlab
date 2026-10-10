/**
 * Source-level tests for the MAN2 additions to /manifesto: the million-year
 * test, the transition, the section rail and the living-document header.
 *
 * Astro components aren't renderable in Jest, so the contract is verified by
 * reading the source as text and the dictionaries as data — the same pattern as
 * manifesto-cosmos.test.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { htmlToMarkdown } from '../../scripts/build-md';
import { solDayOfYear, startSolLabel } from '../lib/mission-time';

const ROOT = resolve(__dirname, '..', '..');
const src = readFileSync(resolve(ROOT, 'src', 'views', 'Manifesto.astro'), 'utf8');

describe('MAN2 manifesto sections', () => {
  // §2 i18n parity: every new key present in BOTH dictionaries, exact per language.
  it('carries the living-document data in both languages', () => {
    expect(en.manifesto.docStatus).toBe('living document');
    expect(es.manifesto.docStatus).toBe('documento vivo');
    expect(en.manifesto.docVersion).toBe('3.0');
    expect(es.manifesto.docVersion).toBe('3.0');
    expect(en.manifesto.docDate).toBe('2026-06-17');
    expect(es.manifesto.docDate).toBe('2026-06-17');
  });

  it('carries the million-year test copy in both languages', () => {
    expect(en.manifesto.millionYearTestTitle).toBe('The million-year test');
    expect(es.manifesto.millionYearTestTitle).toBe('La prueba del millón de años');
    expect(en.manifesto.millionYearTestClosing).toContain('continuity of consciousness');
    expect(es.manifesto.millionYearTestClosing).toContain('continuidad de la conciencia');
    for (const m of [en.manifesto, es.manifesto]) {
      expect(m.millionYearTestQuestion.length).toBeGreaterThan(0);
      expect(m.millionYearTestAnswer.length).toBeGreaterThan(0);
    }
  });

  it('carries the transition copy in both languages', () => {
    expect(en.manifesto.transitionTitle).toBe('The transition that matters');
    expect(es.manifesto.transitionTitle).toBe('La transición que importa');
    expect(en.manifesto.transitionBody).toContain('Technology is not the end.');
    expect(es.manifesto.transitionBody).toContain('La tecnología no es el fin.');
  });

  // §3 section order matches the rail exactly.
  it('renders the nine rail sections in the spec order with stable ids', () => {
    const order = [
      'what-we-value', 'perspective', 'million-year-test', 'transition',
      'imperatives', 'pillars', 'what-changes', 'in-development', 'observatory',
    ];
    let cursor = -1;
    for (const id of order) {
      const idx = src.indexOf(`id="${id}"`);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  // §1 layout voices.
  it('uses the serif-italic pull voice for the question and the mono label for the closing', () => {
    expect(src).toMatch(/<blockquote class="prose mtt-question">/);
    expect(src).toMatch(/<p class="label mtt-closing">/);
  });

  // §1 illustration: static inline SVG, hairline tree + accent points, aria-hidden.
  it('draws the tree/forest illustration as one static aria-hidden SVG', () => {
    expect(src).toMatch(/<svg class="mtt-illustration"[^>]*aria-hidden="true"/);
    expect(src).toMatch(/stroke-dasharray="2 2"/);
    const points = src.match(/<circle[^>]*r="1\.3"/g) ?? [];
    expect(points.length).toBeGreaterThanOrEqual(20);
    expect(points.length).toBeLessThanOrEqual(40);
    expect(src).not.toMatch(/mtt-illustration[\s\S]{0,400}?<animate/);
  });

  // §3 rail: generated numerals, one observer added, gutter at 1200px.
  it('generates Roman numerals from code, not from the dictionary', () => {
    expect(src).toMatch(/const roman\s*=/);
    expect(src).toMatch(/roman\(i \+ 1\)/);
    expect(en.manifesto.millionYearTestTitle).not.toMatch(/^(I|II|III|IV|V|VI|VII|VIII|IX)$/);
  });

  it('tracks the current section with IntersectionObservers (cosmos + rail)', () => {
    // MAN1 left exactly one (the cosmos scene); MAN2 adds the rail's — two total.
    expect((src.match(/IntersectionObserver/g) ?? []).length).toBe(2);
  });

  it('shows the rail only at 1200px and above, inside a reserved gutter', () => {
    expect(src).toMatch(/@media\s*\(min-width:\s*1200px\)/);
    expect(src).toMatch(/@media\s*\(max-width:\s*1199/);
    expect(src).toMatch(/:global\(main#main\)\s*\{\s*padding-inline-start/);
  });

  it('marks the current link with aria-current="true" and drops the transition under reduced motion', () => {
    expect(src).toMatch(/setAttribute\('aria-current',\s*'true'\)/);
    expect(src).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]{0,120}\.rail a\s*\{\s*transition:\s*none/,
    );
  });

  // §4 header line: computed from docDate, never aria-hidden (the twin must keep it).
  it('computes the living-document header from docDate and keeps it out of aria-hidden', () => {
    expect(src).toMatch(/startSolLabel\(m\.docDate\)/);
    expect(src).not.toMatch(/Sol 168/);
    expect(src).toMatch(/<p class="doc-header">\{docHeader\}<\/p>/);
    expect(src).not.toMatch(/doc-header[^>]*aria-hidden/);
  });

  // §5 markdown twin: the new text and the header line must survive htmlToMarkdown.
  it('build-md preserves the two new sections and the header line', () => {
    const html = [
      '<main>',
      '<nav class="rail"><ol><li><a href="#imperatives"><span>V</span>The imperatives</a></li></ol></nav>',
      '<p class="doc-header">living document · v3.0 · TERRA 2026 · Sol 168</p>',
      '<svg class="mtt-illustration" aria-hidden="true"><circle cx="10" cy="10" r="1.3"/></svg>',
      '<h2>The million-year test</h2>',
      `<blockquote class="prose">${en.manifesto.millionYearTestQuestion}</blockquote>`,
      `<p>${en.manifesto.millionYearTestAnswer}</p>`,
      `<p class="label">${en.manifesto.millionYearTestClosing}</p>`,
      '<h2>The transition that matters</h2>',
      `<p>${en.manifesto.transitionBody}</p>`,
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    const flat = md.replace(/\s+/g, ' ');
    expect(flat).toContain('living document · v3.0 · TERRA 2026 · Sol 168');
    expect(flat).toContain('## The million-year test');
    expect(flat).toContain(en.manifesto.millionYearTestQuestion);
    expect(flat).toContain(en.manifesto.millionYearTestAnswer);
    expect(flat).toContain(en.manifesto.millionYearTestClosing);
    expect(flat).toContain('## The transition that matters');
    expect(flat).toContain(en.manifesto.transitionBody);
    // The rail nav and the decorative SVG must NOT leak into the twin.
    expect(md).not.toContain('The imperatives');
    expect(md).not.toContain('<circle');
  });

  // §6 the header's Sol equals solDayOfYear('2026-06-17T00:00:00').
  it('derives the header Sol from the shared mission-time helper', () => {
    expect(solDayOfYear('2026-06-17T00:00:00')).toBe(168);
    expect(startSolLabel(en.manifesto.docDate)).toBe('Sol 168');
    expect(startSolLabel(es.manifesto.docDate)).toBe('Sol 168');
  });
});
