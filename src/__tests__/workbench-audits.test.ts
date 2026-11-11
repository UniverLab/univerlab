/**
 * The public audits page (/workbench/audits/): what an audit reviews, how it
 * runs, what the client receives, what the optional implementation covers and
 * what it costs — in both languages, sold from the Workbench card.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const VIEW = readFileSync(resolve(__dirname, '../views/WorkbenchAudits.astro'), 'utf8');
const CARD = readFileSync(resolve(__dirname, '../views/Workbench.astro'), 'utf8');
const ROUTE = readFileSync(resolve(__dirname, '../pages/workbench/audits.astro'), 'utf8');
const ROUTE_ES = readFileSync(resolve(__dirname, '../pages/es/workbench/audits.astro'), 'utf8');

describe('workbench-audits', () => {
  it('both languages carry the same audits keys with 6/4/3/3 items', () => {
    expect(Object.keys(en.workbench.audits).sort()).toEqual(Object.keys(es.workbench.audits).sort());
    for (const dict of [en.workbench.audits, es.workbench.audits]) {
      expect(dict.scope.items).toHaveLength(6);
      for (const item of dict.scope.items) expect(item).toHaveLength(2);
      expect(dict.how.steps).toHaveLength(4);
      for (const step of dict.how.steps) expect(step).toHaveLength(2);
      expect(dict.deliver.items).toHaveLength(3);
      for (const item of dict.deliver.items) expect(item).toHaveLength(2);
      expect(dict.impl.paras).toHaveLength(3);
    }
  });

  it('the Spanish lede is the spec sentence verbatim', () => {
    expect(es.workbench.audits.lede).toBe(
      'Revisamos cómo usa tu equipo la inteligencia artificial y los agentes, y te entregamos qué arreglar primero, cuánto cuesta y qué riesgo corres si no lo haces.',
    );
  });

  it('Agent Experience (AX) names the workbench lede and the sixth scope item', () => {
    expect(es.workbench.intro).toContain('Agent Experience (AX)');
    expect(en.workbench.intro).toContain('Agent Experience (AX)');
    expect(es.workbench.audits.scope.items[5][0]).toContain('Agent Experience (AX)');
    expect(en.workbench.audits.scope.items[5][0]).toContain('Agent Experience (AX)');
  });

  it('the workbench audit card links the audits page', () => {
    expect(es.workbench.audits.cardLink).toContain('Qué revisamos y qué entregamos');
    expect(en.workbench.audits.cardLink).toContain('What we review and what you receive');
    expect(CARD).toContain('w.audits.cardLink');
    expect(CARD).toContain("localizePath('/workbench/audits', lang)");
  });

  it('both routes render the audits view', () => {
    expect(ROUTE).toContain('WorkbenchAudits');
    expect(ROUTE_ES).toContain('WorkbenchAudits');
  });

  it('the audits copy promises no public sample or example client', () => {
    for (const json of [JSON.stringify(es.workbench.audits), JSON.stringify(en.workbench.audits)]) {
      expect(json).not.toMatch(/ejemplo|muestra|sample|example/i);
    }
  });

  it('the view books the free call on the workbench WhatsApp line and links the privacy page', () => {
    expect(VIEW).toContain('wa.me/573053892323');
    expect(VIEW).toContain('encodeURIComponent(w.ctaMessage)');
    // Same invariant as the Workbench view: the only booking path is WhatsApp.
    expect(VIEW).not.toContain('mailto:');
    expect(VIEW).not.toContain('hola@univerlab.org');
    expect(VIEW).toContain("localizePath('/privacy'");
  });

  it('titles and descriptions fit the SEO limits', () => {
    for (const dict of [en.workbench.audits, es.workbench.audits]) {
      expect(dict.title.length).toBeGreaterThanOrEqual(30);
      expect(dict.title.length).toBeLessThanOrEqual(90);
      expect(dict.description.length).toBeGreaterThanOrEqual(120);
      expect(dict.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('the price names COP 900,000 / USD 250 and quotes the implementation apart', () => {
    expect(es.workbench.audits.price.text).toContain('900.000 COP');
    expect(es.workbench.audits.price.text).toContain('USD 250');
    expect(en.workbench.audits.price.text).toContain('900,000');
    expect(en.workbench.audits.price.text).toContain('USD 250');
    expect(es.workbench.audits.impl.paras.join(' ')).toContain('30 días de soporte');
    expect(en.workbench.audits.impl.paras.join(' ')).toContain('30 days of support');
  });
});
