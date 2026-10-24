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
