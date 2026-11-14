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
  it('both languages carry the same audits keys with 8/7/5 items', () => {
    expect(Object.keys(en.workbench.audits).sort()).toEqual(Object.keys(es.workbench.audits).sort());
    for (const dict of [en.workbench.audits, es.workbench.audits]) {
      expect(dict.scope.items).toHaveLength(8);
      for (const item of dict.scope.items) expect(item).toHaveLength(2);
      expect(dict.how.steps).toHaveLength(7);
      for (const step of dict.how.steps) expect(step).toHaveLength(2);
      expect(dict.deliver.items).toHaveLength(5);
      for (const item of dict.deliver.items) expect(item).toHaveLength(2);
      expect(dict.impl.paras).toHaveLength(3);
      expect(typeof dict.scopeNote).toBe('string');
      expect(typeof dict.not.kicker).toBe('string');
      expect(typeof dict.not.text).toBe('string');
    }
  });

  it('the scope names the eight agreed areas', () => {
    expect(en.workbench.audits.scope.items.map(([t]) => t)).toEqual([
      'Agent security',
      'Access and sessions',
      'Running on untrusted content',
      'Install and release path',
      'Data',
      'Resistance',
      'Real use',
      'Technical judgement and Agent Experience',
    ]);
    expect(es.workbench.audits.scope.items.map(([t]) => t)).toEqual([
      'Seguridad de los agentes',
      'Acceso y sesiones',
      'Trabajo con contenido no confiable',
      'Instalación y publicación',
      'Datos',
      'Resistencia',
      'Uso real',
      'Criterio técnico y Agent Experience',
    ]);
    expect(en.workbench.audits.scopeNote).toMatch(/agreed in writing before we start/);
    expect(es.workbench.audits.scopeNote).toMatch(/por escrito antes de empezar/);
  });

  it('what you receive is the package in order: page, PDF, repository, verification, optional DOI', () => {
    expect(es.workbench.audits.deliver.items.map(([t]) => t)).toEqual([
      'Página dedicada',
      'Informe en PDF',
      'Repositorio de la auditoría',
      'Verificación',
      'Opcional: registro público con DOI',
    ]);
    expect(en.workbench.audits.deliver.items.map(([t]) => t)).toEqual([
      'Dedicated page',
      'PDF report',
      'Audit repository',
      'Verification pass',
      'Optional: public record with DOI',
    ]);
    for (const dict of [en.workbench.audits, es.workbench.audits]) {
      const [page, pdf, repo, verify, doi] = dict.deliver.items.map(([, b]) => b);
      expect(page).toMatch(/severidad|severity/);
      expect(page).toMatch(/matriz de riesgo|risk matrix/);
      expect(page).toMatch(/hoja de ruta|roadmap/);
      expect(page).toMatch(/glosario|glossary/);
      expect(page).toMatch(/resumen|summary/);
      expect(pdf).toMatch(/TeXForge/);
      expect(pdf).toMatch(/reproducir|reproduce/);
      expect(pdf).toMatch(/límites|limits/);
      expect(repo).toMatch(/sandbox|aislado|isolated/i);
      expect(repo).toMatch(/checksum/);
      expect(repo).toMatch(/evidencia|evidence/);
      expect(verify).toMatch(/6 months|6 meses/);
      expect(verify).toMatch(/status|estado/i);
      expect(verify).toMatch(/consultation hours|horas de consulta/);
      expect(verify).toMatch(/críticos|critical/);
      expect(doi).toMatch(/DOI/);
      expect(doi).toMatch(/insignia|badge/);
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

  it('the lede defines the audit: independent, no indulgence, reproducible evidence, ordered plan', () => {
    expect(en.workbench.audits.lede).toMatch(/independent review/);
    expect(en.workbench.audits.lede).toMatch(/without indulgence/);
    expect(en.workbench.audits.lede).toMatch(/evidence someone else can reproduce/);
    expect(en.workbench.audits.lede).toMatch(/ordered plan/);
    expect(es.workbench.audits.lede).toMatch(/revisión independiente/);
    expect(es.workbench.audits.lede).toMatch(/sin indulgencia/);
    expect(es.workbench.audits.lede).toMatch(/evidencia que otra persona puede reproducir/);
    expect(es.workbench.audits.lede).toMatch(/plan ordenado/);
  });

  it('what an audit is not: no certification, no pricing or building fixes, private until approved', () => {
    expect(en.workbench.audits.not.text).toMatch(/not a certification/);
    expect(en.workbench.audits.not.text).toMatch(/continuous security/);
    expect(en.workbench.audits.not.text).toMatch(/does not price or build/);
    expect(en.workbench.audits.not.text).toMatch(/private until you approve publishing/);
    expect(es.workbench.audits.not.text).toMatch(/no es una certificación/);
    expect(es.workbench.audits.not.text).toMatch(/seguridad continua/);
    expect(es.workbench.audits.not.text).toMatch(/No cotiza ni construye/);
    expect(es.workbench.audits.not.text).toMatch(/privados hasta que apruebes/);
  });

  it('no statute, video or cost analysis is named on the audits page or the audit card', () => {
    const cardEs = JSON.stringify(es.workbench.tags.items[2]);
    const cardEn = JSON.stringify(en.workbench.tags.items[2]);
    for (const json of [JSON.stringify(es.workbench.audits), JSON.stringify(en.workbench.audits), cardEs, cardEn]) {
      expect(json).not.toMatch(/Ley 1581|Ley 1480/);
      expect(json).not.toMatch(/1[0-9]{3} de 20\d\d/);
      expect(json).not.toMatch(/video|vídeo/i);
      expect(json).not.toMatch(/cost analysis|análisis de costos/i);
    }
    expect(es.workbench.audits.scope.items[4][1]).toMatch(/normas de protección de datos/);
  });

  it('the build is the workbench flow service, from USD 150, with 30 days of support', () => {
    expect(es.workbench.audits.impl.kicker).toMatch(/servicio aparte/);
    expect(en.workbench.audits.impl.kicker).toMatch(/separate service/);
    const esImpl = es.workbench.audits.impl.paras.join(' ');
    const enImpl = en.workbench.audits.impl.paras.join(' ');
    expect(esImpl).toMatch(/solución agéntica/);
    expect(enImpl).toMatch(/agentic-solution service/);
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

  it('how we work tells the method in order: call, written scope, isolated copy, sources, rating, all areas, delivery', () => {
    expect(es.workbench.audits.how.steps.map(([t]) => t)).toEqual([
      'Llamada gratis',
      'Alcance por escrito',
      'Copia aislada',
      'Tres fuentes',
      'Calificados igual',
      'Todas las áreas reportadas',
      'Entrega y sesión',
    ]);
    expect(en.workbench.audits.how.steps.map(([t]) => t)).toEqual([
      'Free call',
      'Scope in writing',
      'Isolated copy',
      'Three sources',
      'Rated the same way',
      'Every area reported',
      'Delivery and session',
    ]);
    const esHow = es.workbench.audits.how.steps.map(([, b]) => b).join(' ');
    const enHow = en.workbench.audits.how.steps.map(([, b]) => b).join(' ');
    expect(esHow).toMatch(/versiones exactas/);
    expect(esHow).toMatch(/solo lectura/);
    expect(esHow).toMatch(/sin tu permiso/);
    expect(esHow).toMatch(/aislada/);
    expect(esHow).toMatch(/persona probando/);
    expect(esHow).toMatch(/agentes haciendo trabajo real/);
    expect(esHow).toMatch(/auditoría agéntica/);
    expect(esHow).toMatch(/severidad, probabilidad, impacto/);
    expect(esHow).toMatch(/donde no se encontró nada/);
    expect(enHow).toMatch(/exact versions/);
    expect(enHow).toMatch(/read-only/);
    expect(enHow).toMatch(/without your permission/);
    expect(enHow).toMatch(/isolated copy/);
    expect(enHow).toMatch(/person testing/);
    expect(enHow).toMatch(/real work/);
    expect(enHow).toMatch(/agentic audit/);
    expect(enHow).toMatch(/severity, likelihood, impact/);
    expect(enHow).toMatch(/nothing was found/);
    expect(es.workbench.audits.how.steps[6][0]).toMatch(/Entrega/);
    expect(en.workbench.audits.how.steps[6][0]).toMatch(/Delivery/);
  });

  it('the audit card sits last with its price and names the independent review with evidence', () => {
    for (const dict of [en.workbench.tags, es.workbench.tags]) {
      expect(dict.items).toHaveLength(3);
    }
    expect(es.workbench.tags.items[1][1]).toBe('Desde USD 150');
    expect(en.workbench.tags.items[1][1]).toBe('From USD 150');
    expect(es.workbench.tags.items[2][1]).toBe('Desde USD 400');
    expect(en.workbench.tags.items[2][1]).toBe('From USD 400');
    expect(es.workbench.tags.items[2][3]).not.toMatch(/diseñamos e instalamos/);
    expect(en.workbench.tags.items[2][3]).not.toMatch(/design and install/);
    expect(es.workbench.tags.items[2][1]).not.toMatch(/150/);
    expect(en.workbench.tags.items[1][1]).not.toMatch(/400/);
    expect(es.workbench.tags.items[2][3]).toMatch(/revisión independiente/);
    expect(en.workbench.tags.items[2][3]).toMatch(/independent review/);
    expect(es.workbench.tags.items[2][3]).toMatch(/evidencia reproducible/);
    expect(en.workbench.tags.items[2][3]).toMatch(/reproducible evidence/);
    expect(es.workbench.tags.items[2][3]).toMatch(/página dedicada/);
    expect(en.workbench.tags.items[2][3]).toMatch(/dedicated page/);
    expect(es.workbench.tags.items[2][3]).toMatch(/PDF/);
    expect(en.workbench.tags.items[2][3]).toMatch(/PDF/);
    expect(es.workbench.tags.items[2][3]).toMatch(/repositorio/);
    expect(en.workbench.tags.items[2][3]).toMatch(/repository/);
  });

  it('Agent Experience names the model, the harness and the architecture in the last scope item', () => {
    expect(es.workbench.intro).toContain('Agent Experience (AX)');
    expect(en.workbench.intro).toContain('Agent Experience (AX)');
    expect(es.workbench.audits.scope.items[7][0]).toContain('Agent Experience');
    expect(en.workbench.audits.scope.items[7][0]).toContain('Agent Experience');
    expect(es.workbench.audits.scope.items[7][1]).toMatch(/harness/);
    expect(en.workbench.audits.scope.items[7][1]).toMatch(/harness/);
  });

  it('the workbench audit card links the audits page', () => {
    expect(es.workbench.audits.cardLink).toContain('Qué revisamos y qué entregamos');
    expect(en.workbench.audits.cardLink).toContain('What we review and what you receive');
    expect(CARD).toContain('w.audits.cardLink');
    expect(CARD).toContain("localizePath('/workbench/audits', lang)");
    expect(CARD).toContain('i === 2');
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

  it('the view leads the free call to the booking page and links the privacy page', () => {
    expect(VIEW).toContain('bookTarget(lang)');
    expect(VIEW).toContain('{w.altCta}');
    expect(VIEW).toContain('wa.me/573053892323');
    expect(VIEW).toContain('encodeURIComponent(w.ctaMessage)');
    // Same invariant as the Workbench view: no booking path by email here.
    expect(VIEW).not.toContain('mailto:');
    expect(VIEW).not.toContain('hola@univerlab.org');
    expect(VIEW).toContain("localizePath('/privacy'");
    expect(VIEW).toContain('{a.scopeNote}');
    expect(VIEW).toContain('{a.not.kicker}');
    expect(VIEW).toContain('{a.not.text}');
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

  it('the page styles sit inside the layout, so the first frame paints styled', () => {
    expect(VIEW.indexOf('<style is:inline')).toBeGreaterThan(-1);
    expect(VIEW.indexOf('<style is:inline')).toBeLessThan(VIEW.indexOf('</BaseLayout>'));
  });
});
