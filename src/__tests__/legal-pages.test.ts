/**
 * Legal pages (privacy + terms, English + Spanish).
 *
 * Contract: four thin pages render one shared `Legal` view over per-language
 * data modules; the contact address comes from `lib/site-about` (never
 * retyped); no template placeholder survives; the Spanish-prevails sentence
 * renders on all four pages; titles/descriptions satisfy check-seo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { en } from '../i18n/en';
import { LEGAL_DATE, legalDoc, type LegalDoc } from '../data/legal';
import { legalNav } from '../data/legal-nav';
import { privacyEn, termsEn } from '../data/legal-en';
import { privacyEs, termsEs } from '../data/legal-es';
import { founderEmail } from '../lib/site-about';

const ROOT = resolve(__dirname, '..');
const PAGES: Record<string, string> = {
  privacy: 'pages/privacy.astro',
  terms: 'pages/terms.astro',
  'es/privacy': 'pages/es/privacy.astro',
  'es/terms': 'pages/es/terms.astro',
};
const pageSrc = (key: string): string =>
  readFileSync(resolve(ROOT, PAGES[key]), 'utf8');
const VIEW = readFileSync(resolve(ROOT, 'views', 'Legal.astro'), 'utf8');
const DATA_SRCS = ['data/legal.ts', 'data/legal-nav.ts', 'data/legal-en.ts', 'data/legal-es.ts'].map(
  (f) => readFileSync(resolve(ROOT, f), 'utf8'),
);

/** Template leftovers and claims the spec forbids anywhere on the surface. */
const BANNED = [
  '<mark>',
  '[Company',
  '[INSERT',
  'California',
  'JAMS',
  'arbitration',
  'arbitraje',
  'KV',
  'blocked.json',
];

describe('legal pages exist and render the shared view', () => {
  it.each(Object.keys(PAGES))('src/%s renders <Legal> with the right kind', (key) => {
    const file = resolve(ROOT, PAGES[key]);
    expect(existsSync(file)).toBe(true);
    const src = pageSrc(key);
    const kind = key.endsWith('privacy') ? 'privacy' : 'terms';
    expect(src).toContain('views/Legal.astro');
    expect(src).toContain(`<Legal kind="${kind}" />`);
  });

  it('the Spanish twins live under pages/es/', () => {
    expect(existsSync(resolve(ROOT, 'pages', 'es', 'privacy.astro'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'pages', 'es', 'terms.astro'))).toBe(true);
  });
});

describe('no template placeholder or dropped-claim survives', () => {
  it.each(BANNED)('"%s" is absent from pages, view and legal data', (banned) => {
    for (const key of Object.keys(PAGES)) {
      expect(pageSrc(key)).not.toContain(banned);
    }
    expect(VIEW).not.toContain(banned);
    for (const src of DATA_SRCS) {
      expect(src).not.toContain(banned);
    }
  });
});

describe('the contact address comes from the site-about module', () => {
  it('the view imports founderEmail and resolves it at render', () => {
    expect(VIEW).toMatch(/import\s*\{\s*founderEmail\s*\}\s*from\s*['"]\.\.\/lib\/site-about['"]/);
    expect(VIEW).toContain('{email}');
  });

  it('no email literal sits in the view or the legal data', () => {
    const literal = en.people.founder.email;
    expect(literal).toContain('@');
    expect(VIEW).not.toContain(literal);
    for (const src of DATA_SRCS) {
      expect(src).not.toContain(literal);
    }
  });
});

describe('the Spanish-prevails sentence is present on all four pages', () => {
  // Non-empty is not enough: the sentence has to say which version wins, in
  // the language of the page. A rewrite that drops the claim must fail here.
  const EN_DOCS: Array<[string, LegalDoc]> = [
    ['English privacy', privacyEn],
    ['English terms', termsEn],
  ];
  const ES_DOCS: Array<[string, LegalDoc]> = [
    ['Spanish privacy', privacyEs],
    ['Spanish terms', termsEs],
  ];

  it.each(EN_DOCS)('%s says the Spanish version prevails', (_name, doc) => {
    expect(doc.prevails).toMatch(/Spanish version prevails/i);
  });

  it.each(ES_DOCS)('%s says the Spanish version prevails', (_name, doc) => {
    expect(doc.prevails).toMatch(/prevalece la versión en español/i);
  });

  it('the view renders it', () => {
    expect(VIEW).toContain('{doc.prevails}');
  });

  it('legalDoc returns it for every kind + language', () => {
    for (const kind of ['privacy', 'terms'] as const) {
      for (const lang of ['en', 'es'] as const) {
        expect(legalDoc(kind, lang).prevails.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('footer links in both languages', () => {
  it('the labels are exactly Privacy/Terms and Privacidad/Términos', () => {
    expect(legalNav.en.privacy).toBe('Privacy');
    expect(legalNav.en.terms).toBe('Terms');
    expect(legalNav.es.privacy).toBe('Privacidad');
    expect(legalNav.es.terms).toBe('Términos');
  });

  it('both languages carry the same label keys', () => {
    expect(Object.keys(legalNav.es).sort()).toEqual(Object.keys(legalNav.en).sort());
  });

  // Why the labels are not in i18n/*.ts: the quality rule caps files under
  // src/ at 1 200 lines and both dictionaries already exceed it, so new copy
  // may not grow them. This test fails if someone moves the labels back.
  it('the labels live in a module of their own, not in the capped dictionaries', () => {
    for (const dict of ['i18n/en.ts', 'i18n/es.ts']) {
      const src = readFileSync(resolve(ROOT, dict), 'utf8');
      const nav = src.match(/nav:\s*\{([\s\S]*?)\n  \},/)?.[1] ?? '';
      expect(nav).not.toBe('');
      expect(nav).not.toMatch(/\bprivacy\s*:/);
      expect(nav).not.toMatch(/\bterms\s*:/);
    }
  });

  it('the footer localizes both legal routes after the API entry', () => {
    const footer = readFileSync(resolve(ROOT, 'components', 'Footer.astro'), 'utf8');
    expect(footer).toContain("localizePath('/privacy', lang)");
    expect(footer).toContain("localizePath('/terms', lang)");
    expect(footer).toMatch(/import\s*\{\s*legalNav\s*\}\s*from\s*['"]\.\.\/data\/legal-nav['"]/);
    expect(footer).toContain('legal.privacy');
    expect(footer).toContain('legal.terms');
    const apiAt = footer.indexOf("localizePath('/api', lang)");
    expect(apiAt).toBeGreaterThan(-1);
    expect(footer.indexOf("localizePath('/privacy', lang)")).toBeGreaterThan(apiAt);
  });
});

describe('the built pages render with their markdown twins', () => {
  // The rendered proof that all four routes exist, print both dates, carry the
  // prevails line and the footer links, and that the postbuild wrote a twin for
  // each. A source-only test would stay green if a page silently failed to
  // build. Skipped only when `dist/` was never generated (a checkout that has
  // not run `npm run build`); the source-level suites above still cover it.
  const DIST = resolve(ROOT, '..', 'dist');
  const itBuilt = existsSync(resolve(DIST, 'privacy/index.html')) ? it : it.skip;
  const ROUTES: Record<string, { md: string; html: string; prevails: string; links: RegExp[] }> = {
    '/privacy/': {
      md: 'privacy/index.md',
      html: 'privacy/index.html',
      prevails: privacyEn.prevails,
      links: [/href="\/terms\/"[^>]*>Terms</, /href="\/privacy\/"[^>]*>Privacy</],
    },
    '/terms/': {
      md: 'terms/index.md',
      html: 'terms/index.html',
      prevails: termsEn.prevails,
      links: [/href="\/privacy\/"[^>]*>Privacy</, /href="\/terms\/"[^>]*>Terms</],
    },
    '/es/privacy/': {
      md: 'es/privacy/index.md',
      html: 'es/privacy/index.html',
      prevails: privacyEs.prevails,
      links: [/href="\/es\/terms\/"[^>]*>Términos</, /href="\/es\/privacy\/"[^>]*>Privacidad</],
    },
    '/es/terms/': {
      md: 'es/terms/index.md',
      html: 'es/terms/index.html',
      prevails: termsEs.prevails,
      links: [/href="\/es\/privacy\/"[^>]*>Privacidad</, /href="\/es\/terms\/"[^>]*>Términos</],
    },
  };

  itBuilt.each(Object.keys(ROUTES))('%s built its HTML page and markdown twin', (route) => {
    const entry = ROUTES[route];
    expect(existsSync(resolve(DIST, entry.html))).toBe(true);
    expect(existsSync(resolve(DIST, entry.md))).toBe(true);
    const html = readFileSync(resolve(DIST, entry.html), 'utf8');
    const md = readFileSync(resolve(DIST, entry.md), 'utf8');
    expect(md).toContain(entry.prevails);
    expect(html).toContain(entry.prevails);
    expect(md).toContain(LEGAL_DATE);
    expect(html).toContain(LEGAL_DATE);
  });

  itBuilt.each(Object.keys(ROUTES))('%s links both legal pages from its footer', (route) => {
    const html = readFileSync(resolve(DIST, ROUTES[route].html), 'utf8');
    const footer = html.match(/<footer[\s\S]*?<\/footer>/i)?.[0] ?? '';
    expect(footer).not.toBe('');
    for (const link of ROUTES[route].links) expect(footer).toMatch(link);
  });

  itBuilt('the rendered pages carry the address from the site-about module', () => {
    const html = readFileSync(resolve(DIST, 'privacy/index.html'), 'utf8');
    expect(html).toContain(`mailto:${founderEmail}`);
  });

  itBuilt('no banned template claim reaches the rendered pages or twins', () => {
    for (const entry of Object.values(ROUTES)) {
      for (const file of [entry.html, entry.md]) {
        const text = readFileSync(resolve(DIST, file), 'utf8');
        for (const banned of BANNED) expect(text).not.toContain(banned);
      }
    }
  });
});

describe('the credit line and the facts the spec pins', () => {
  const text = (doc: LegalDoc): string =>
    [doc.prevails, doc.intro, doc.credit, ...doc.sections.flatMap((s) => [s.title, ...s.paras, ...(s.items ?? [])])].join(' ');

  it('all four documents credit General Legal under CC0 1.0', () => {
    for (const doc of [privacyEn, termsEn, privacyEs, termsEs]) {
      expect(doc.credit).toContain('General Legal');
      expect(doc.credit).toContain('general.legal');
      expect(doc.credit).toContain('CC0 1.0');
    }
  });

  it('the view prints the credit after the last section, as the templates ask', () => {
    const sectionsAt = VIEW.indexOf('doc.sections.map');
    const creditAt = VIEW.indexOf('doc.credit');
    expect(sectionsAt).toBeGreaterThan(-1);
    expect(creditAt).toBeGreaterThan(sectionsAt);
  });

  // Every figure below mirrors a canopy-web constant (see the comments next to
  // it in the data modules). A rewrite that loses one changes a promise.
  const FIGURES: Array<[string, RegExp, RegExp]> = [
    ['30-minute catalogue bound', /within 30 minutes/, /dentro de los 30 minutos/],
    ['12-hour session cookie', /expires after 12 hours/, /vence a las 12 horas/],
    ['90-day install totals', /90-day totals/, /90 días/],
    ['10 business days + 5', /10 business days[^.]*5/, /10 días hábiles[^.]*5/],
    ['15 business days + 8', /15 business days[^.]*8/, /15 días hábiles[^.]*8/],
    ['SIC complaint', /Superintendencia de Industria y Comercio \(SIC\)/, /Superintendencia de Industria y Comercio \(SIC\)/],
  ];

  it.each(FIGURES)('%s appears in both privacy pages', (_what, enRe, esRe) => {
    expect(text(privacyEn)).toMatch(enRe);
    expect(text(privacyEs)).toMatch(esRe);
  });

  it('the terms keep the licence, law and community-graph promises', () => {
    const en = text(termsEn);
    const es = text(termsEs);
    expect(en).toContain('Apache-2.0');
    expect(en).toContain('MIT');
    expect(en).toContain('Ley 1480 de 2011');
    expect(en).toMatch(/Republic of Colombia[^.]*competent courts/);
    expect(en).toContain('canopy-graph');
    expect(en).toContain('UniverLab/canopy-web');
    expect(es).toContain('Apache-2.0');
    expect(es).toContain('MIT');
    expect(es).toContain('Ley 1480 de 2011');
    expect(es).toMatch(/República de Colombia[^.]*jueces competentes/);
    expect(es).toContain('canopy-graph');
    expect(es).toContain('UniverLab/canopy-web');
  });
});

describe('links behave the way the rest of the site does', () => {
  const builtPrivacy = resolve(__dirname, '..', '..', 'dist', 'privacy', 'index.html');
  const itBuilt = existsSync(builtPrivacy) ? it : it.skip;

  it('off-site statements open in a new tab with rel=noopener noreferrer', () => {
    expect(VIEW).toMatch(/target: '_blank'/);
    expect(VIEW).toContain('noopener noreferrer');
    expect(VIEW).toMatch(/\^https\?:/);
  });

  itBuilt('the built privacy page opens the provider statements off-site', () => {
    const html = readFileSync(builtPrivacy, 'utf8');
    const links = html.match(/<a[^>]+href="https:\/\/[^"]+"[^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
    }
  });
});

describe('one date constant, shared section ids, bounded metadata', () => {
  it('LEGAL_DATE is the only YYYY-MM-DD literal on the legal surface', () => {
    const blobs = [VIEW, ...DATA_SRCS, ...Object.keys(PAGES).map(pageSrc)];
    const hits = blobs.flatMap((b) => b.match(/\d{4}-\d{2}-\d{2}/g) ?? []);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits).toEqual(hits.map(() => LEGAL_DATE));
    expect(LEGAL_DATE).toBe('2026-10-27');
  });

  it('English and Spanish sections share ids in the same order', () => {
    const ids = (d: { sections: { id: string }[] }) => d.sections.map((s) => s.id);
    expect(ids(privacyEs)).toEqual(ids(privacyEn));
    expect(ids(termsEs)).toEqual(ids(termsEn));
    expect(new Set(ids(privacyEn)).size).toBe(ids(privacyEn).length);
    expect(new Set(ids(termsEn)).size).toBe(ids(termsEn).length);
  });

  it('titles are 30–90 chars and descriptions 120–160, all distinct', () => {
    const docs = [privacyEn, termsEn, privacyEs, termsEs];
    const titles = docs.map((d) => d.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const doc of docs) {
      expect(doc.title.length).toBeGreaterThanOrEqual(30);
      expect(doc.title.length).toBeLessThanOrEqual(90);
      expect(doc.description.length).toBeGreaterThanOrEqual(120);
      expect(doc.description.length).toBeLessThanOrEqual(160);
    }
  });
});
