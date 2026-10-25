/**
 * Source-level tests for the structure of /manifesto: the eight-section rail,
 * the transition, the perspective and the living-document header.
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

  it('carries the transition copy in both languages', () => {
    expect(en.manifesto.transitionTitle).toBe('The transition that matters');
    expect(es.manifesto.transitionTitle).toBe('La transición que importa');
    expect(en.manifesto.transitionBody).toContain('Technology is not the end.');
    expect(es.manifesto.transitionBody).toContain('La tecnología no es el fin.');
  });

  // §3 section order matches the rail exactly. The million-year test and the
  // attack map are gone; nine sections were counted by the old spec but the
  // attack entry never carried an id, so eight remain: I–VIII.
  it('renders the eight rail sections in the spec order with stable ids', () => {
    const order = [
      'what-we-value', 'perspective', 'transition',
      'imperatives', 'pillars', 'what-changes', 'in-development', 'observatory',
    ];
    let cursor = -1;
    for (const id of order) {
      const idx = src.indexOf(`id="${id}"`);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeGreaterThan(cursor);
      cursor = idx;
    }
    // No trace of the deleted sections anywhere in the view.
    expect(src).not.toContain('million-year-test');
    expect(src).not.toContain('id="attack"');

    // The rail carries exactly the eight entries above — nothing else.
    const rail = src.slice(src.indexOf('const railSections'), src.indexOf('] as const;'));
    const entries = rail.match(/\{ id: '/g) ?? [];
    expect(entries).toHaveLength(order.length);
    for (const id of order) expect(rail).toContain(`{ id: '${id}'`);
  });

  // §1 layout voices.
  it('keeps the transition body as plain prose', () => {
    expect(src).toMatch(/<p class="transition-body">\{m\.transitionBody\}<\/p>/);
  });

  // §3 rail: generated numerals, one observer added, gutter at 1200px.
  it('generates Roman numerals from code, not from the dictionary', () => {
    expect(src).toMatch(/const roman\s*=/);
    expect(src).toMatch(/roman\(i \+ 1\)/);
    // No rail label is ever a stored numeral — they all come from roman().
    const rail = src.slice(src.indexOf('const railSections'), src.indexOf('] as const;'));
    expect(rail).not.toMatch(/label:\s*['"]I{1,3}|label:\s*['"]I[VX]/);
    expect(en.manifesto.worksTitle).not.toMatch(/^(I|II|III|IV|V|VI|VII|VIII|IX)$/);
  });

  it('tracks the current section with one IntersectionObserver (the rail)', () => {
    // MAN1's cosmos-scene observer went away with the scrollytelling; only
    // MAN2's rail observer remains.
    expect((src.match(/IntersectionObserver/g) ?? []).length).toBe(1);
  });

  it('shows the rail only at 1200px and above, inside a reserved gutter', () => {
    expect(src).toMatch(/@media\s*\(min-width:\s*1200px\)/);
    expect(src).toMatch(/@media\s*\(max-width:\s*1199/);
    // The gutter lives on the manifesto's own scoped wrapper — never on
    // main#main, whose global selector used to leak onto every page.
    expect(src).toMatch(/\.manifesto\s*\{\s*padding-inline-start:\s*20rem/);
    expect(src).not.toMatch(/:global\(main#main\)/);
  });

  // §3 rail typography: the eight entries are tightened into one clean column —
  // serif right-aligned numerals, mono labels, tighter vertical rhythm.
  it('tightens the rail entries typographically', () => {
    expect(src).toMatch(/\.rail a\s*\{[^}]*padding:\s*0\.28rem\s+0\.5rem/);
    expect(src).toMatch(/\.rail-num\s*\{[^}]*font-family:\s*var\(--font-serif\)/);
    expect(src).toMatch(/\.rail-num\s*\{[^}]*font-size:\s*0\.85rem/);
    expect(src).toMatch(/\.rail-num\s*\{[^}]*width:\s*1\.6rem/);
    expect(src).toMatch(/\.rail-num\s*\{[^}]*text-align:\s*right/);
    expect(src).toMatch(/\.rail-label\s*\{[^}]*line-height:\s*1\.35/);
    expect(src).toMatch(/\.rail-label\s*\{[^}]*letter-spacing:\s*0\.08em/);
    // The active state keeps its accent and left border.
    expect(src).toMatch(/\.rail a\[aria-current="true"\][\s\S]{0,120}border-left-color:\s*var\(--accent\)/);
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
    expect(src).toMatch(/<p class="doc-header"><time[^>]*>\{docHeader\}<\/time><\/p>/);
    expect(src).not.toMatch(/doc-header[^>]*aria-hidden/);
  });

  // §5 markdown twin: the transition and the header line must survive
  // htmlToMarkdown, while the rail nav stays out of the twin.
  it('build-md preserves the transition and the header line', () => {
    const html = [
      '<main>',
      '<nav class="rail"><ol><li><a href="#imperatives"><span>V</span>The imperatives</a></li></ol></nav>',
      '<p class="doc-header">living document · v3.0 · 2026 · Sol 168</p>',
      '<h2>The transition that matters</h2>',
      `<p>${en.manifesto.transitionBody}</p>`,
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    const flat = md.replace(/\s+/g, ' ');
    expect(flat).toContain('living document · v3.0 · 2026 · Sol 168');
    expect(flat).toContain('## The transition that matters');
    expect(flat).toContain(en.manifesto.transitionBody);
    // The rail nav must NOT leak into the twin.
    expect(md).not.toContain('The imperatives');
  });

  // §6 the header's Sol equals solDayOfYear('2026-06-17T00:00:00').
  it('derives the header Sol from the shared mission-time helper', () => {
    expect(solDayOfYear('2026-06-17T00:00:00')).toBe(168);
    expect(startSolLabel(en.manifesto.docDate)).toBe('Sol 168');
    expect(startSolLabel(es.manifesto.docDate)).toBe('Sol 168');
  });
});
