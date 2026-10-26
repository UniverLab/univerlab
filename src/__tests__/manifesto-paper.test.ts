/**
 * Source-level tests for the manifesto's paper link: the manifesto links its
 * paper, Pensamiento Cósmico, as a citable PDF — the exact URL, opened safely
 * in a new tab with its MIME type declared, labelled from the dictionary in
 * both languages.
 *
 * Astro components aren't renderable in Jest, so the contract is verified by
 * reading the source as text and the dictionaries as data — the same pattern
 * as manifesto-cosmos.test.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const ROOT = resolve(__dirname, '..', '..');
const src = readFileSync(resolve(ROOT, 'src', 'views', 'Manifesto.astro'), 'utf8');

const PDF = 'https://papers.univerlab.org/pensamiento-cosmico/pensamiento-cosmico.pdf';

describe('manifesto paper link', () => {
  it('links the paper PDF in the opening section, right after the intro', () => {
    const subAt = src.indexOf('<p class="sub label">{m.sub}</p>');
    const linkAt = src.indexOf(`href="${PDF}"`);
    const openingAt = src.indexOf('<section class="wrap opening">');
    const openingEnd = src.indexOf('</section>', openingAt);
    expect(openingAt).toBeGreaterThan(-1);
    expect(linkAt).toBeGreaterThan(subAt);
    expect(subAt).toBeGreaterThan(openingAt);
    expect(linkAt).toBeLessThan(openingEnd);
  });

  it('marks the PDF link safe for a new tab and declares the MIME type', () => {
    const a = src.match(/<a[^>]*href="https:\/\/papers\.univerlab\.org[^>]*>/);
    expect(a).not.toBeNull();
    expect(a![0]).toContain('class="paper-link"');
    expect(a![0]).toContain('target="_blank"');
    expect(a![0]).toContain('rel="noopener noreferrer"');
    expect(a![0]).toContain('type="application/pdf"');
  });

  it('renders the label from the dictionary, never a hard-coded string', () => {
    expect(src).toMatch(/<a[\s\S]{0,300}?>\{m\.paper\}<\/a>/);
    expect(src).not.toContain('Read the paper:');
    expect(src).not.toContain('Lee el paper:');
  });

  it('carries the exact label in both languages', () => {
    expect(en.manifesto.paper).toBe('Read the paper: Pensamiento Cósmico (PDF) ↗');
    expect(es.manifesto.paper).toBe('Lee el paper: Pensamiento Cósmico (PDF) ↗');
  });

  it('styles the link with the accent ink so it reads as a link', () => {
    expect(src).toMatch(/\.paper-link\s*\{[^}]*color:\s*var\(--accent\)/);
  });
});

// The §IX showcase plate: the paper is the page's centrepiece, sealed with the
// wax seal of the identity and cited through its CONCEPT DOI (the one to cite,
// per Intelligence 8a70c979) — never the version DOI.
describe('manifesto paper showcase plate', () => {
  const plateAt = () => src.indexOf('class="works-paper"');
  const sectionAt = () => src.indexOf('id="in-development"');

  it('places the plate first inside section IX', () => {
    expect(sectionAt()).toBeGreaterThan(-1);
    expect(plateAt()).toBeGreaterThan(sectionAt());
    // The seal card opens the works list; Eco del Silencio follows it.
    expect(src.indexOf('works-paper')).toBeLessThan(src.indexOf('{m.works.map'));
    // Single-column list at the full reading width — no side-by-side cards.
    expect(src).toMatch(/\.works\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it('carries the wax seal beside the title', () => {
    const head = src.match(/<div class="works-paper-head">[\s\S]*?<\/div>/);
    expect(head).not.toBeNull();
    expect(head![0]).toContain('src="/bench/identidad/sello-lacre.svg"');
    expect(head![0]).toContain('width="32"');
    expect(head![0]).toContain('alt=""');
    expect(head![0]).toContain('<h3>{m.title}</h3>');
  });

  it('links both the PDF and the concept DOI, opening safely', () => {
    const plate = src.slice(plateAt(), src.indexOf('</ul>', plateAt()));
    expect(plate).toContain(PDF);
    expect(plate).toContain('target="_blank"');
    expect(plate).toContain('rel="noopener noreferrer"');
    expect(plate).toContain('type="application/pdf"');
    expect(plate).toContain('https://doi.org/10.5281/zenodo.23503658');
    // Concept DOI, not version DOI.
    expect(plate).not.toContain('23503659');
    expect(src).not.toContain('23503659');
    // The dead #attack CTA died with its section.
    expect(src).not.toContain('#attack');
    expect(src).not.toContain('attackLink');
  });

  it('renders blurb and DOI label from the dictionary, in both languages', () => {
    expect(src).toContain('{m.paperShowcaseBlurb}');
    expect(src).toContain('{m.paperDoiLabel}');
    for (const d of [en.manifesto, es.manifesto]) {
      expect(d.paperShowcaseBlurb.length).toBeGreaterThan(0);
      expect(d.paperDoiLabel).toContain('10.5281/zenodo.23503658');
    }
    // The ES blurb is a translation, not a copy of the EN string.
    expect(es.manifesto.paperShowcaseBlurb).not.toBe(en.manifesto.paperShowcaseBlurb);
    expect(es.manifesto.paperDoiLabel).not.toBe(en.manifesto.paperDoiLabel);
    // Neutral wording: it names the paper, it is not a CTA.
    expect(es.manifesto.paperDoiLabel).not.toMatch(/^(Haz|Lee|Ver|Descarga)\b/);
  });
});
