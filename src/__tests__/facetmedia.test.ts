/**
 * facetMedia is EXP-009: registry entry, bilingual copy, page, encyclopedia
 * mark, palette command and Open Graph card.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { byId } from '../lib/experiments';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const VIEW = readFileSync(resolve(__dirname, '../views/experiments/FacetMedia.astro'), 'utf8');
const ENC = readFileSync(resolve(__dirname, '../components/Encyclopedia.astro'), 'utf8');
const BASE = readFileSync(resolve(__dirname, '../layouts/BaseLayout.astro'), 'utf8');
const ROUTE = readFileSync(resolve(__dirname, '../pages/facetmedia.astro'), 'utf8');
const ROUTE_ES = readFileSync(resolve(__dirname, '../pages/es/facetmedia.astro'), 'utf8');

const enFm = en.experiments.facetmedia;
const esFm = es.experiments.facetmedia;

describe('facetmedia EXP-009', () => {
  it('facetMedia is EXP-009 in beta without an install line', () => {
    const exp = byId('facetmedia');
    expect(exp.number).toBe('EXP-009');
    expect(exp.status).toBe('beta');
    expect(exp.surface).toBe('facet');
    expect(exp.install).toBeUndefined();
  });

  it('both dictionaries carry the same facetmedia keys', () => {
    expect(Object.keys(enFm).sort()).toEqual(Object.keys(esFm).sort());
    for (const dict of [enFm, esFm]) {
      expect(dict.capabilities.rows).toHaveLength(5);
      expect(dict.verbs.items).toHaveLength(6);
      expect(dict.faq.items).toHaveLength(5);
    }
  });

  it('titles and descriptions fit the SEO limits', () => {
    for (const dict of [enFm, esFm]) {
      expect(dict.title.length).toBeGreaterThanOrEqual(30);
      expect(dict.title.length).toBeLessThanOrEqual(90);
      expect(dict.description.length).toBeGreaterThanOrEqual(120);
      expect(dict.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('the page renders the arch with the plate and hides the floating machine', () => {
    expect(VIEW).toContain('hideMachine');
    expect(VIEW).toContain('<Machine id="facetmedia"');
    expect(VIEW).toContain('id="capacidades"');
    expect(ROUTE).toContain('FacetMedia');
    expect(ROUTE_ES).toContain('FacetMedia');
  });

  it('only verified values are yellow', () => {
    // Last index cell plus exactly the three record values.
    expect(VIEW).toContain('<span class="ok">{row[3]}</span>');
    expect(VIEW.match(/class="ok"/g)).toHaveLength(4);
    // var(--essence) is used only by .ok.
    expect(VIEW.match(/var\(--essence\)/g)).toHaveLength(1);
  });

  it('beta entries show under the Active tab', () => {
    expect(ENC).toContain("beta: '‡'");
    expect(ENC).toContain("f === 'active' && e.getAttribute('data-status') === 'beta'");
  });

  it('the palette knows facetmedia', () => {
    expect(BASE.match(/'quorum', 'facetmedia'\]/g)).toHaveLength(2);
    expect(BASE).toContain('facetmedia: \'https://github.com/UniverLab/facetmedia\'');
  });
});
