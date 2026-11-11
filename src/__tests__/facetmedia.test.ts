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
  it('facetMedia is EXP-009 in beta with the single uv install line', () => {
    const exp = byId('facetmedia');
    expect(exp.number).toBe('EXP-009');
    expect(exp.status).toBe('beta');
    expect(exp.surface).toBe('facet');
    expect(exp.install).toEqual({ unix: 'uv tool install facetmedia' });
  });

  it('both dictionaries carry the same facetmedia keys', () => {
    expect(Object.keys(enFm).sort()).toEqual(Object.keys(esFm).sort());
    for (const dict of [enFm, esFm]) {
      expect(dict.capabilities.columns).toHaveLength(5);
      expect(dict.verbs.items).toHaveLength(6);
      expect(dict.faq.items).toHaveLength(5);
    }
    expect(Object.keys(enFm.capabilities.summaries)).toHaveLength(0);
    expect(Object.keys(esFm.capabilities.summaries).length).toBeGreaterThan(0);
    for (const id of Object.keys(esFm.capabilities.summaries)) {
      expect(id).toContain('.');
    }
  });

  it('falls back to the registry English summary without a Spanish text', () => {
    expect(esFm.capabilities.summaries['kokoro.speak']).toContain('Narración');
    // The page prefers the Spanish text and falls back to the registry summary.
    expect(VIEW).toContain('summaries[id] ?? fallback');
  });

  it('titles and descriptions fit the SEO limits', () => {
    for (const dict of [enFm, esFm]) {
      expect(dict.title.length).toBeGreaterThanOrEqual(30);
      expect(dict.title.length).toBeLessThanOrEqual(90);
      expect(dict.description.length).toBeGreaterThanOrEqual(120);
      expect(dict.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('the page shows the shared hero plate and keeps its own arch', () => {
    expect(VIEW).not.toContain('hideMachine');
    expect(VIEW).not.toContain('<Machine');
    expect(VIEW).not.toContain("from '../../components/Machine.astro'");
    expect(VIEW).toContain('class="fm-arch"');
    expect(VIEW).toContain('id="capacidades"');
    expect(ROUTE).toContain('FacetMedia');
    expect(ROUTE_ES).toContain('FacetMedia');
  });

  it('reads the capability table from the registry and never ships it empty', () => {
    expect(VIEW).toContain('readFacetCapabilities');
    expect(VIEW).toContain('caps.map((cap, i)');
    expect(VIEW).toContain('caps.length');
    expect(VIEW).toContain('{e.subproject.kicker}');
    expect(VIEW).toContain('{e.subproject.body}');
  });

  it('only verified values are yellow', () => {
    // Capability rows carry no .ok: the summary is not a verified value.
    // The three .ok spans left are exactly the record JSON values.
    expect(VIEW).not.toContain('<span class="ok">{');
    expect(VIEW.match(/class="ok"/g)).toHaveLength(3);
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
