/**
 * The three sites, linked; the empty field notes, gone (FR2 ship-check + FR3).
 *
 * The built /canopy/ pages must carry the shared Canopy · Graphs · Remote row
 * (Canopy localized per language, the other two off-site) and must not ship
 * the old "no field notes yet" empty section. The sources pin the shared
 * partial so later pages reuse it instead of duplicating the links.
 * Reads dist/ with the repo's "run npm run build" convention.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const root = join(__dirname, '..', '..');

function built(page: string): string {
  const file = join(root, 'dist', page);
  if (!existsSync(file)) {
    throw new Error(`dist/${page} not found — run \`npm run build\` before \`npm test\`.`);
  }
  return readFileSync(file, 'utf8');
}

const canopyEn = built('canopy/index.html');
const canopyEs = built('es/canopy/index.html');

/** The site-nav row's markup. */
function siteNav(html: string): string {
  const m = html.match(/<nav class="site-nav[^"]*"[\s\S]*?<\/nav>/);
  if (!m) throw new Error('site-nav not found');
  return m[0];
}

describe.each([
  ['en', canopyEn, '/canopy/', 'No field notes yet'],
  ['es', canopyEs, '/es/canopy/', 'Aún no hay notas de campo'],
] as const)('built %s /canopy/ page', (lang, html, canopyHref, emptySentence) => {
  const nav = siteNav(html);
  const ariaLabel = lang === 'en' ? en.sites.nav : es.sites.nav;

  it('lists exactly Canopy, Graphs and Remote', () => {
    const labels = [...nav.matchAll(/>(Canopy|Graphs|Remote)</g)].map((m) => m[1]);
    expect(labels).toEqual(['Canopy', 'Graphs', 'Remote']);
  });

  it('carries the three site hrefs, the aria-label, and marks Canopy as here', () => {
    expect(nav).toContain(`aria-label="${ariaLabel}"`);
    expect(nav).toContain(`href="${canopyHref}"`);
    expect(nav).toContain('href="https://graphs.univerlab.org"');
    expect(nav).toContain('href="https://remote.univerlab.org"');
    const here = nav.match(new RegExp(`<a href="${canopyHref.replace(/\//g, '\\/')}"[^>]*aria-current="page"`));
    expect(here).not.toBeNull();
  });

  it('opens the off-site links in a new tab, the local one in place', () => {
    expect(nav.match(/target="_blank"/g) ?? []).toHaveLength(2);
    expect(nav.match(/rel="noopener noreferrer"/g) ?? []).toHaveLength(2);
  });

  it('ships no empty field-notes section', () => {
    expect(html).not.toContain('fn-empty');
    expect(html).not.toContain('data-empty');
    expect(html).not.toContain(emptySentence);
  });
});

describe('source pins: the shared partial and its mount', () => {
  const siteNavSrc = readFileSync(join(root, 'src/components/SiteNav.astro'), 'utf8');
  const view = readFileSync(join(root, 'src/views/experiments/Canopy.astro'), 'utf8');
  const layout = readFileSync(join(root, 'src/layouts/ExperimentLayout.astro'), 'utf8');
  const notes = readFileSync(join(root, 'src/components/FieldNotes.astro'), 'utf8');

  it('SiteNav lists the three sites with the spec-fixed hrefs', () => {
    expect(siteNavSrc).toContain("localizePath('/canopy/', lang)");
    expect(siteNavSrc).toContain("'https://graphs.univerlab.org'");
    expect(siteNavSrc).toContain("'https://remote.univerlab.org'");
  });

  it('Canopy mounts the partial into the layout slot', () => {
    expect(view).toContain('<SiteNav slot="site-nav" current="canopy" />');
    expect(layout).toContain("Astro.slots.has('site-nav') && <slot name=\"site-nav\" />");
  });

  it('FieldNotes removes itself instead of rendering an empty section', () => {
    expect(notes).toContain('section.remove()');
    expect(notes).not.toContain('notes.empty');
  });

  it('carries the sites.nav aria-label in both languages', () => {
    expect(en.sites.nav).toBe('UniverLab sites');
    expect(es.sites.nav).toBe('Sitios de UniverLab');
    expect(Object.keys(en.sites).sort()).toEqual(Object.keys(es.sites).sort());
  });
});
