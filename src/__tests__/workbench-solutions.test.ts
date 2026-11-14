/**
 * The agentic solutions page (/workbench/solutions/): what the lab builds,
 * how the work goes from the first call to installation, what the client
 * receives and what it costs — in both languages, sold from the Workbench
 * card the way the audits page is.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const VIEW = readFileSync(resolve(__dirname, '../views/WorkbenchSolutions.astro'), 'utf8');
const CARD = readFileSync(resolve(__dirname, '../views/Workbench.astro'), 'utf8');
const ROUTE = readFileSync(resolve(__dirname, '../pages/workbench/solutions.astro'), 'utf8');
const ROUTE_ES = readFileSync(resolve(__dirname, '../pages/es/workbench/solutions.astro'), 'utf8');
const LLMS = readFileSync(resolve(__dirname, '../../public/llms.txt'), 'utf8');
const ASTRO = readFileSync(resolve(__dirname, '../../astro.config.mjs'), 'utf8');

describe('workbench-solutions', () => {
  it('both languages carry the same solutions keys with 5 kinds, 5 steps, 4 deliverables', () => {
    expect(Object.keys(en.workbench.solutions).sort()).toEqual(Object.keys(es.workbench.solutions).sort());
    for (const dict of [en.workbench.solutions, es.workbench.solutions]) {
      expect(dict.kinds.items).toHaveLength(5);
      for (const item of dict.kinds.items) expect(item).toHaveLength(2);
      expect(dict.how.steps).toHaveLength(5);
      for (const step of dict.how.steps) expect(step).toHaveLength(2);
      expect(dict.deliver.items).toHaveLength(4);
      for (const item of dict.deliver.items) expect(item).toHaveLength(2);
      expect(typeof dict.price.kicker).toBe('string');
      expect(typeof dict.price.text).toBe('string');
      expect(typeof dict.price.cop).toBe('string');
    }
  });

  it('the kinds name the five solutions, each with one short example', () => {
    expect(en.workbench.solutions.kinds.items.map(([t]) => t)).toEqual([
      'Custom Canopy graph',
      'LangGraph agent',
      'Artificial intelligence in your tool',
      'Chat assistant',
      'WhatsApp agent',
    ]);
    expect(es.workbench.solutions.kinds.items.map(([t]) => t)).toEqual([
      'Grafo Canopy a medida',
      'Agente sobre LangGraph',
      'Inteligencia artificial en tu herramienta',
      'Asistente de chat',
      'Agente de WhatsApp',
    ]);
    for (const dict of [en.workbench.solutions, es.workbench.solutions]) {
      for (const [, b] of dict.kinds.items) {
        expect(b).toMatch(/ejemplo|For example/i);
      }
    }
    // The WhatsApp kind is the restaurant that takes bookings.
    expect(en.workbench.solutions.kinds.items[4][1]).toMatch(/restaurant.*booking/i);
    expect(es.workbench.solutions.kinds.items[4][1]).toMatch(/restaurante.*reserva/i);
    expect(en.workbench.solutions.lede).toContain('agentic solution');
    expect(es.workbench.solutions.lede).toContain('solución agéntica');
  });

  it('how the work goes: call, written scope, design, build, installation with support', () => {
    expect(es.workbench.solutions.how.steps.map(([t]) => t)).toEqual([
      'Llamada gratis',
      'Alcance por escrito',
      'Diseño',
      'Construcción',
      'Instalación y soporte',
    ]);
    expect(en.workbench.solutions.how.steps.map(([t]) => t)).toEqual([
      'Free call',
      'Scope in writing',
      'Design',
      'Build',
      'Installation and support',
    ]);
    expect(es.workbench.solutions.how.steps[4][1]).toMatch(/30 días de soporte/);
    expect(en.workbench.solutions.how.steps[4][1]).toMatch(/30 days of support/);
  });

  it('what you receive ends with 30 days of support counted from installation', () => {
    expect(es.workbench.solutions.deliver.items.map(([t]) => t)).toContain('30 días de soporte');
    expect(en.workbench.solutions.deliver.items.map(([t]) => t)).toContain('30 days of support');
    const esDeliver = es.workbench.solutions.deliver.items.map(([, b]) => b).join(' ');
    const enDeliver = en.workbench.solutions.deliver.items.map(([, b]) => b).join(' ');
    expect(esDeliver).toMatch(/contados desde la instalación/);
    expect(enDeliver).toMatch(/counted from installation/);
  });

  it('no ownership terms on the page: no repository, subscription, harness, token or cost word', () => {
    for (const json of [JSON.stringify(es.workbench.solutions), JSON.stringify(en.workbench.solutions)]) {
      expect(json).not.toMatch(/repositor|scripci|harness|token|cost/i);
    }
    const marketing = JSON.stringify([
      en.workbench.tags.items[1],
      es.workbench.tags.items[1],
      en.workbench.solutions,
      es.workbench.solutions,
    ]);
    expect(marketing).not.toMatch(/repositor|scripci|harness|token|cost/i);
    for (const json of [JSON.stringify(es.workbench.solutions), JSON.stringify(en.workbench.solutions)]) {
      expect(json.toLowerCase()).not.toContain('correo');
      expect(json.toLowerCase()).not.toContain('email');
    }
    expect(es.workbench.solutions.lede).toContain('solución agéntica');
  });

  it('the price leads with USD 150 and keeps the peso line for Colombia', () => {
    expect(es.workbench.solutions.price.text).toContain('USD 150');
    expect(en.workbench.solutions.price.text).toContain('USD 150');
    expect(es.workbench.solutions.price.text).not.toContain('550.000 COP');
    expect(en.workbench.solutions.price.text).not.toContain('550,000');
    expect(es.workbench.solutions.price.cop).toContain('550.000 COP');
    expect(en.workbench.solutions.price.cop).toContain('550,000');
    expect(es.workbench.solutions.price.text).toMatch(/30 días de soporte/);
    expect(en.workbench.solutions.price.text).toMatch(/30 days of support/);
  });

  it('titles and descriptions fit the SEO limits', () => {
    for (const dict of [en.workbench.solutions, es.workbench.solutions]) {
      expect(dict.title.length).toBeGreaterThanOrEqual(30);
      expect(dict.title.length).toBeLessThanOrEqual(90);
      expect(dict.description.length).toBeGreaterThanOrEqual(120);
      expect(dict.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('both routes render the solutions view with the plate and the watermark', () => {
    expect(ROUTE).toContain('WorkbenchSolutions');
    expect(ROUTE_ES).toContain('WorkbenchSolutions');
    expect(VIEW).toContain('<Machine id="workbench"');
    expect(VIEW).toContain('<Watermark kind="blueprint" />');
    expect(VIEW).toContain("localizePath('/workbench/book', lang)");
    expect(VIEW).toContain('{w.altCta}');
    expect(VIEW).toContain('wa.me/573053892323');
    expect(VIEW).toContain('encodeURIComponent(w.ctaMessage)');
    expect(VIEW).toContain('{w.close.head}');
    expect(VIEW).toContain('wbs-sticky');
    expect(VIEW).not.toContain('mailto:');
  });

  it('the page is linked from the card, kept in the sitemap and listed in llms.txt', () => {
    expect(CARD).toContain("localizePath('/workbench/solutions', lang)");
    expect(LLMS).toContain('(https://univerlab.org/workbench/solutions/)');
    // The sitemap integration includes every built page except this explicit
    // list, so the page is listed unless it were added there.
    expect(ASTRO).not.toContain("'/workbench/solutions");
    expect(ASTRO).not.toContain("'/es/workbench/solutions");
  });
});
