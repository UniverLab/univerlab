/**
 * The Workbench (/workbench/): the visitor's problem first, one free-call
 * button to WhatsApp, price tags, three steps, proof, policy and closing.
 * Bilingual copy, the blueprint watermark and the workbench plate.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { byId } from '../lib/experiments';
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
      expect(dict.tags.items).toHaveLength(3);
      for (const tag of dict.tags.items) expect(tag).toHaveLength(3);
      expect(dict.how.steps).toHaveLength(3);
      expect(dict.proof.items).toHaveLength(4);
      expect(dict.policy.items).toHaveLength(9);
      expect(dict.who.items).toHaveLength(2);
      expect(dict.principles.items).toHaveLength(3);
    }
  });

  it('the headline names the visitor problem with the silence emphasized', () => {
    expect(es.workbench.head).toContain('en silencio');
    expect(en.workbench.head).toContain('in silence');
    expect(es.workbench.headEm).toBe('en silencio');
    expect(en.workbench.headEm).toBe('in silence');
    expect(es.workbench.head).toContain(es.workbench.headEm);
    expect(en.workbench.head).toContain(en.workbench.headEm);
    expect(VIEW).toContain('<em>{w.headEm}</em>');
  });

  it('the lede names the hands behind Canopy and facetMedia', () => {
    for (const dict of [en.workbench, es.workbench]) {
      expect(dict.intro).toContain('Canopy');
      expect(dict.intro).toContain('facetMedia');
    }
    expect(VIEW).toContain('{w.intro}');
  });

  it('one primary button books the free call on WhatsApp, short on phones', () => {
    expect(es.workbench.cta).toContain('15 min');
    expect(en.workbench.cta).toContain('15 min');
    expect(es.workbench.ctaShort.length).toBeLessThan(es.workbench.cta.length);
    expect(en.workbench.ctaShort.length).toBeLessThan(en.workbench.cta.length);
    expect(VIEW).toContain('{w.ctaShort}');
    expect(VIEW).toContain('{w.ctaNote}');
    expect(VIEW).toContain('https://wa.me/573053892323');
    expect(VIEW).toContain('encodeURIComponent(w.ctaMessage)');
  });

  it('no booking path by email survives on the page or in the copy', () => {
    expect(VIEW).not.toContain('mailto:');
    expect(VIEW).not.toContain('hola@univerlab.org');
    const esJson = JSON.stringify(es.workbench);
    const enJson = JSON.stringify(en.workbench);
    expect(esJson).not.toContain('mailto:');
    expect(enJson).not.toContain('mailto:');
    expect(esJson.toLowerCase()).not.toContain('correo');
    expect(enJson.toLowerCase()).not.toContain('email');
    expect(VIEW).not.toContain('O por correo');
    expect(VIEW).not.toContain('Or by email');
  });

  it('the three price tags carry the prices', () => {
    expect(en.workbench.tags.items[0][1]).toContain('Free');
    expect(en.workbench.tags.items[0][1]).toContain('15 min');
    expect(es.workbench.tags.items[0][1]).toContain('Gratis');
    expect(en.workbench.tags.items[1][1]).toContain('COP 150,000');
    expect(es.workbench.tags.items[1][1]).toContain('150.000 COP');
    expect(en.workbench.tags.items[1][2]).toContain('USD 45');
    expect(es.workbench.tags.items[1][2]).toContain('USD 45');
    expect(en.workbench.tags.items[2][1]).toContain('900,000');
    expect(es.workbench.tags.items[2][1]).toContain('900.000 COP');
    expect(en.workbench.tags.items[2][2]).toContain('30 days of support');
    expect(es.workbench.tags.items[2][2]).toContain('30 días de soporte');
  });

  it('a consultation is paid when booked and confirmed once checked', () => {
    for (const dict of [en.workbench, es.workbench]) {
      expect(dict.how.steps[1][1]).toContain('Bre-B');
      expect(dict.how.steps[1][1]).toContain('Nequi');
      expect(dict.how.steps[1][1]).toContain('PayPal');
    }
    expect(en.workbench.how.steps[1][1]).toContain('once the payment is checked');
    expect(es.workbench.how.steps[1][1]).toContain('al verificar el pago');
  });

  it('the proof section links the four experiments with their taglines', () => {
    expect(en.workbench.proof.items).toEqual(['canopy', 'facetmedia', 'gitkit', 'texforge']);
    expect(es.workbench.proof.items).toEqual(['canopy', 'facetmedia', 'gitkit', 'texforge']);
    for (const id of en.workbench.proof.items) {
      expect(byId(id).name.length).toBeGreaterThan(0);
      for (const dict of [en, es]) {
        const tagline = (dict.experiments as Record<string, { tagline: string }>)[id].tagline;
        expect(tagline.length).toBeGreaterThan(0);
      }
    }
    expect(VIEW).toContain('w.proof.items');
    expect(VIEW).toContain('tagline');
  });

  it('the closing band funds the lab and names WhatsApp', () => {
    expect(es.workbench.close.head).toContain('financia el laboratorio');
    expect(en.workbench.close.head).toContain('funds the lab');
    expect(es.workbench.close.cta).toContain('WhatsApp');
    expect(en.workbench.close.cta).toContain('WhatsApp');
    expect(en.workbench.close.phone).toContain('+57 305 389 2323');
    expect(VIEW).toContain('{w.close.head}');
    expect(VIEW).toContain('{w.close.cta}');
    expect(VIEW).toContain('{w.close.phone}');
    expect(VIEW).toContain('wb-sticky');
    expect(VIEW).toContain('{w.ctaShort}');
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

  it('the phone thumbnail is a wrapper, so Machine cannot outrank its hiding', () => {
    expect(VIEW).toContain('<div class="wb-thumb"><Machine');
    expect(VIEW).not.toMatch(/<Machine[^>]*class="wb-thumb"/);
    expect(VIEW).toContain('.wb-thumb { display: none; }');
  });

  it('the phone price tags drop the desktop columns before scrolling sideways', () => {
    expect(VIEW).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(VIEW).toMatch(/\.wb-tags \{[^}]*grid-template-columns: none;[^}]*grid-auto-flow: column/);
    expect(VIEW).toContain('overflow-x: auto');
  });

  it('no bare Spanish "banco" survives in the workbench copy', () => {
    const copy = JSON.stringify(es.workbench);
    expect(copy).not.toMatch(/\bbanco\b(?!\s+de\s+trabajo)/i);
  });

  it('the phone bar reuses the dictionary note instead of a hardcoded brand word', () => {
    expect(VIEW).not.toContain('>WhatsApp<');
    expect(VIEW).toContain('{w.ctaNote}');
  });

  it('the view renders tags, steps, proof, policy and closing in order', () => {
    expect(VIEW.indexOf('wb-tags')).toBeLessThan(VIEW.indexOf('w.how.kicker'));
    expect(VIEW.indexOf('w.how.kicker')).toBeLessThan(VIEW.indexOf('w.proof.kicker'));
    expect(VIEW.indexOf('w.proof.kicker')).toBeLessThan(VIEW.indexOf('w.policy.summary'));
    expect(VIEW.indexOf('w.policy.summary')).toBeLessThan(VIEW.indexOf('w.close.head'));
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
