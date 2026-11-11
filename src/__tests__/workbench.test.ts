/**
 * The Workbench (/workbench/): the lab sells its hands to fund itself.
 * Bilingual copy, the page with the blueprint watermark and the workbench
 * plate, the WhatsApp call to action and the footer link.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const VIEW = readFileSync(resolve(__dirname, '../views/Workbench.astro'), 'utf8');
const ROUTE = readFileSync(resolve(__dirname, '../pages/workbench.astro'), 'utf8');
const ROUTE_ES = readFileSync(resolve(__dirname, '../pages/es/workbench.astro'), 'utf8');
const FOOTER = readFileSync(resolve(__dirname, '../components/Footer.astro'), 'utf8');
const HOME = readFileSync(resolve(__dirname, '../views/Home.astro'), 'utf8');

describe('workbench', () => {
  it('both languages carry the same workbench keys', () => {
    expect(Object.keys(en.workbench).sort()).toEqual(Object.keys(es.workbench).sort());
    for (const dict of [en.workbench, es.workbench]) {
      expect(dict.who.items).toHaveLength(2);
      expect(dict.how.steps).toHaveLength(4);
      expect(dict.principles.items).toHaveLength(3);
    }
  });

  it('the price and the free first call are on the page', () => {
    expect(en.workbench.how.steps[1][0]).toContain('COP 150,000');
    expect(es.workbench.how.steps[1][0]).toContain('150.000 COP');
    expect(en.workbench.how.steps[1][1]).toContain('USD 45');
    expect(es.workbench.how.steps[1][1]).toContain('USD 45');
    expect(en.workbench.how.steps[0][0]).toContain('15');
    expect(es.workbench.how.steps[0][0]).toContain('15');
  });

  it('a consultation is paid when booked and confirmed once checked', () => {
    for (const dict of [en.workbench, es.workbench]) {
      expect(dict.how.steps[1][1]).toContain('Bre-B');
      expect(dict.how.steps[1][1]).toContain('Nequi');
      expect(dict.how.steps[1][1]).toContain('PayPal');
    }
    expect(en.workbench.how.steps[1][1]).toContain('confirmed once the payment is checked');
    expect(es.workbench.how.steps[1][1]).toContain('confirmado al verificar el pago');
  });

  it('built flows include thirty days of support, then hourly', () => {
    expect(en.workbench.how.steps[3][1]).toContain('Thirty days of support');
    expect(en.workbench.how.steps[3][1]).toContain('billed by the hour');
    expect(es.workbench.how.steps[3][1]).toContain('treinta días de soporte');
    expect(es.workbench.how.steps[3][1]).toContain('se cobra por horas');
  });

  it('the page says the money pays for the lab', () => {
    expect(en.workbench.money.text).toContain('pays for the lab');
    expect(en.workbench.money.text).toContain('stay open');
  });

  it('titles and descriptions fit the SEO limits', () => {
    for (const dict of [en.workbench, es.workbench]) {
      expect(dict.title.length).toBeGreaterThanOrEqual(30);
      expect(dict.title.length).toBeLessThanOrEqual(90);
      expect(dict.description.length).toBeGreaterThanOrEqual(120);
      expect(dict.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('both routes render the view with the plate and the watermark', () => {
    expect(ROUTE).toContain('Workbench');
    expect(ROUTE_ES).toContain('Workbench');
    expect(VIEW).toContain('<Machine id="workbench"');
    expect(VIEW).toContain('<Watermark kind="blueprint" />');
    expect(VIEW).toContain('https://wa.me/573053892323');
    expect(VIEW).toContain('encodeURIComponent(w.ctaMessage)');
    expect(VIEW).toContain('mailto:hola@univerlab.org');
  });

  it('the footer links the workbench', () => {
    expect(FOOTER).toContain("localizePath('/workbench', lang)");
    expect(FOOTER).toContain('t.nav.workbench');
  });

  it('both languages carry the same cancellation policy', () => {
    expect(en.workbench.policy.items).toHaveLength(9);
    expect(es.workbench.policy.items).toHaveLength(9);
  });

  it('the policy states the 24-hour line, the no-show rule and the right of retraction', () => {
    expect(en.workbench.policy.items[0]).toContain('24 hours');
    expect(en.workbench.policy.items[0]).toContain('in full');
    expect(en.workbench.policy.items[2]).toContain('15 minutes');
    expect(en.workbench.policy.items[8]).toContain('Right of retraction');
    expect(en.workbench.policy.items[8]).toContain('5 business days');
    expect(en.workbench.policy.items[8]).toContain('Ley 1480 de 2011, art. 47');
    expect(es.workbench.policy.items[0]).toContain('24 horas');
    expect(es.workbench.policy.items[8]).toContain('Derecho de retracto');
    expect(es.workbench.policy.items[8]).toContain('5 días hábiles');
    expect(es.workbench.policy.items[8]).toContain('Ley 1480 de 2011, art. 47');
  });

  it('the view renders the policy before the money block', () => {
    expect(VIEW.indexOf('w.policy.kicker')).toBeGreaterThan(VIEW.indexOf('w.how.kicker'));
    expect(VIEW.indexOf('w.policy.kicker')).toBeLessThan(VIEW.indexOf('w.money.kicker'));
  });

  it('both dictionaries carry the policy summary, link and terms title', () => {
    for (const dict of [en.workbench, es.workbench]) {
      expect(dict.policy.summary.length).toBeGreaterThan(0);
      expect(dict.policy.link.length).toBeGreaterThan(0);
      expect(dict.policy.terms.length).toBeGreaterThan(0);
    }
  });

  it('the summaries name the 24-hour rule and the retraction law', () => {
    expect(en.workbench.policy.summary).toContain('24');
    expect(en.workbench.policy.summary).toContain('Ley 1480 de 2011');
    expect(es.workbench.policy.summary).toContain('24');
    expect(es.workbench.policy.summary).toContain('Ley 1480 de 2011');
  });

  it('the home page carries a workbench strip linking the workbench', () => {
    for (const d of [en, es]) {
      expect(Object.keys((d as typeof en).home.workbench).sort()).toEqual(['kicker', 'link', 'text']);
      expect(d.home.workbench.kicker.length).toBeGreaterThan(0);
      expect(d.home.workbench.text.length).toBeGreaterThan(0);
      expect(d.home.workbench.link.length).toBeGreaterThan(0);
    }
    expect(HOME).toContain("localizePath('/workbench', lang)");
  });

  it('the view links the terms anchor instead of printing the full list', () => {
    expect(VIEW).toContain('#workbench-bookings');
    expect(VIEW).not.toContain('class="policy"');
  });
});
