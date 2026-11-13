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
  it('both languages carry the same audits keys with 6/4/4/3 items', () => {
    expect(Object.keys(en.workbench.audits).sort()).toEqual(Object.keys(es.workbench.audits).sort());
    for (const dict of [en.workbench.audits, es.workbench.audits]) {
      expect(dict.scope.items).toHaveLength(6);
      for (const item of dict.scope.items) expect(item).toHaveLength(2);
      expect(dict.how.steps).toHaveLength(4);
      for (const step of dict.how.steps) expect(step).toHaveLength(2);
      expect(dict.deliver.items).toHaveLength(4);
      for (const item of dict.deliver.items) expect(item).toHaveLength(2);
      expect(dict.impl.paras).toHaveLength(3);
    }
  });

  it('what you receive is the package in order: dedicated page, PDF, repository, optional DOI', () => {
    expect(es.workbench.audits.deliver.items.map(([t]) => t)).toEqual([
      'Página dedicada',
      'Informe en PDF',
      'Repositorio de la auditoría',
      'Opcional: registro público con DOI',
    ]);
    expect(en.workbench.audits.deliver.items.map(([t]) => t)).toEqual([
      'Dedicated page',
      'PDF report',
      'Audit repository',
      'Optional: public record with DOI',
    ]);
    for (const dict of [en.workbench.audits, es.workbench.audits]) {
      const [page, pdf, repo, doi] = dict.deliver.items.map(([, b]) => b);
      expect(page).toMatch(/severidad|severity/);
      expect(page).toMatch(/matriz de riesgo|risk matrix/);
      expect(page).toMatch(/hoja de ruta|roadmap/);
      expect(pdf).toMatch(/TeXForge/);
      expect(repo).toMatch(/sandbox/i);
      expect(repo).toMatch(/evidencia|evidence/);
      expect(doi).toMatch(/DOI/);
      expect(doi).toMatch(/Opcional|Optional/);
    }
  });

  it('the page is dedicated, not private, and access is restricted in the description', () => {
    for (const json of [JSON.stringify(es.workbench.audits.deliver.items), JSON.stringify(en.workbench.audits.deliver.items)]) {
      expect(json).not.toMatch(/privada|Private page|Página privada/);
    }
    expect(es.workbench.audits.deliver.items[0][1]).toMatch(/solo a las direcciones que indiques/);
    expect(en.workbench.audits.deliver.items[0][1]).toMatch(/only to the addresses you name/);
  });

  it('no statute is named on the audits page or the audit card', () => {
    const cardEs = JSON.stringify(es.workbench.tags.items[3]);
    const cardEn = JSON.stringify(en.workbench.tags.items[3]);
    for (const json of [JSON.stringify(es.workbench.audits), JSON.stringify(en.workbench.audits), cardEs, cardEn]) {
      expect(json).not.toMatch(/Ley 1581|Ley 1480/);
      expect(json).not.toMatch(/1[0-9]{3} de 20\d\d/);
    }
    expect(es.workbench.audits.scope.items[4][1]).toMatch(/normas de protección de datos/);
    expect(en.workbench.audits.scope.items[4][1]).toMatch(/data-protection rules/);
  });

  it('the build is the workbench flow service, from USD 150, with 30 days of support', () => {
    expect(es.workbench.audits.impl.kicker).toMatch(/servicio aparte/);
    expect(en.workbench.audits.impl.kicker).toMatch(/separate service/);
    const esImpl = es.workbench.audits.impl.paras.join(' ');
    const enImpl = en.workbench.audits.impl.paras.join(' ');
    expect(esImpl).toMatch(/flujo agéntico/);
    expect(enImpl).toMatch(/agentic-flow service/);
    expect(esImpl).toMatch(/USD 150/);
    expect(enImpl).toMatch(/USD 150/);
    expect(esImpl).toMatch(/550\.000 COP/);
    expect(enImpl).toMatch(/550,000/);
    expect(esImpl).toMatch(/con el informe/);
    expect(esImpl).toMatch(/consulta/);
    expect(enImpl).toMatch(/from the report/);
    expect(enImpl).toMatch(/consultation hours/);
    expect(esImpl).toMatch(/30 días de soporte/);
    expect(enImpl).toMatch(/30 days of support/);
    expect(esImpl).toMatch(/tus suscripciones.*tus harnesses.*tus tokens de modelos/);
    expect(enImpl).toMatch(/your subscriptions.*your harnesses.*your model tokens/);
  });

  it('how we work names the three sources, an isolated environment, and ends in delivery', () => {
    const esHow = es.workbench.audits.how.steps.map(([, b]) => b).join(' ');
    const enHow = en.workbench.audits.how.steps.map(([, b]) => b).join(' ');
    expect(esHow).toMatch(/persona/);
    expect(esHow).toMatch(/agentes hacen trabajo real/);
    expect(esHow).toMatch(/auditoría agéntica/);
    expect(esHow).toMatch(/aislado/);
    expect(esHow).toMatch(/nunca toca producción/);
    expect(enHow).toMatch(/person/i);
    expect(enHow).toMatch(/real work/);
    expect(enHow).toMatch(/agentic audit/);
    expect(enHow).toMatch(/isolated/);
    expect(enHow).toMatch(/never touches production/);
    expect(es.workbench.audits.how.steps[3][0]).toMatch(/Entrega/);
    expect(en.workbench.audits.how.steps[3][0]).toMatch(/Delivery/);
  });

  it('the audit card sits last with its price and no build promise', () => {
    for (const dict of [en.workbench.tags, es.workbench.tags]) {
      expect(dict.items).toHaveLength(4);
    }
    expect(es.workbench.tags.items[2][1]).toBe('Desde USD 150');
    expect(en.workbench.tags.items[2][1]).toBe('From USD 150');
    expect(es.workbench.tags.items[3][1]).toBe('Desde USD 400');
    expect(en.workbench.tags.items[3][1]).toBe('From USD 400');
    expect(es.workbench.tags.items[3][3]).not.toMatch(/diseñamos e instalamos/);
    expect(en.workbench.tags.items[3][3]).not.toMatch(/design and install/);
    expect(es.workbench.tags.items[3][1]).not.toMatch(/150/);
    expect(en.workbench.tags.items[2][1]).not.toMatch(/400/);
    expect(es.workbench.tags.items[3][3]).toMatch(/página dedicada/);
    expect(en.workbench.tags.items[3][3]).toMatch(/dedicated page/);
    expect(es.workbench.tags.items[3][3]).toMatch(/PDF/);
    expect(en.workbench.tags.items[3][3]).toMatch(/PDF/);
    expect(es.workbench.tags.items[3][3]).toMatch(/repositorio/);
    expect(en.workbench.tags.items[3][3]).toMatch(/repository/);
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
    expect(CARD).toContain('i === 3');
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

  it('the price leads with USD 400 and keeps the peso line for Colombia', () => {
    expect(es.workbench.audits.price.text).toContain('USD 400');
    expect(en.workbench.audits.price.text).toContain('USD 400');
    expect(es.workbench.audits.price.text).not.toContain('1.500.000 COP');
    expect(en.workbench.audits.price.text).not.toContain('1,500,000');
    expect(es.workbench.audits.price.cop).toContain('1.500.000 COP');
    expect(en.workbench.audits.price.cop).toContain('1,500,000');
    expect(es.workbench.audits.impl.paras.join(' ')).toContain('USD 150');
    expect(en.workbench.audits.impl.paras.join(' ')).toContain('USD 150');
    expect(es.workbench.audits.impl.paras.join(' ')).toContain('550.000 COP');
    expect(en.workbench.audits.impl.paras.join(' ')).toContain('550,000');
    expect(es.workbench.audits.impl.paras.join(' ')).toContain('30 días de soporte');
    expect(en.workbench.audits.impl.paras.join(' ')).toContain('30 days of support');
  });

  it('the peso line renders as a smaller Spanish-only note', () => {
    expect(VIEW).toContain('wba-price-cop');
    expect(VIEW).toContain("lang === 'es'");
    expect(VIEW).toContain('a.price.cop');
    expect(VIEW).toContain('.wba-price-cop');
  });
});
