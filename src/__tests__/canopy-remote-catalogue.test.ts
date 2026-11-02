/**
 * Canopy's third pass: the Remote and catalogue sections, the hero CTAs and the
 * banner clip fix.
 *
 * Req 5 (both new links visible without scrolling at 1280×800) has no e2e
 * harness in this repo — there is no Playwright, no e2e directory and no
 * browser in CI. The repo's convention is source pins plus real-`dist/` reads,
 * so this file asserts the structure that makes the fold possible (the links
 * are in the hero `.actions`, and the view orders `.actions` first) while the
 * actual geometry is measured with Chrome/CDP in the change report and the
 * screenshots. Do not "fix" this with Playwright.
 *
 * CI builds before it tests; a missing dist/ is a clear "run npm run build".
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

const view = readFileSync(join(root, 'src/views/experiments/Canopy.astro'), 'utf8');
const layout = readFileSync(join(root, 'src/layouts/ExperimentLayout.astro'), 'utf8');
const banner = readFileSync(join(root, 'src/components/Banner.astro'), 'utf8');

/** The hero's action row: anchors only, so the first `</div>` closes it. */
function actionsOf(html: string): string {
  const m = html.match(/<div class="actions"[^>]*>([\s\S]*?)<\/div>/);
  if (!m) throw new Error('hero .actions block not found');
  return m[1];
}

/** A section's inner markup, matched by its unique class. */
function sectionOf(html: string, cls: string): string {
  const m = html.match(new RegExp(`<section class="wrap section ${cls}"[^>]*>([\\s\\S]*?)<\\/section>`));
  if (!m) throw new Error(`section .${cls} not found`);
  return m[1];
}

describe('canopy i18n: Remote and catalogue strings in both languages', () => {
  it('carries the spec-fixed labels verbatim', () => {
    expect(en.experiments.canopy.remote.title).toBe('Your sessions and graphs from your phone');
    expect(en.experiments.canopy.remote.button).toBe('Open remote →');
    expect(es.experiments.canopy.remote.button).toBe('Abrir remote →');
    expect(en.experiments.canopy.catalogue.explore).toBe('Explore the catalogue →');
    expect(en.experiments.canopy.catalogue.patterns).toBe('Patterns →');
    expect(en.experiments.canopy.catalogue.transparency).toBe('Transparency →');
    expect(es.experiments.canopy.catalogue.explore).toBe('Explora el catálogo →');
    expect(es.experiments.canopy.catalogue.patterns).toBe('Patrones →');
    expect(es.experiments.canopy.catalogue.transparency).toBe('Transparencia →');
    expect(en.experiments.canopy.cta).toEqual({ catalogue: 'Graph catalogue', remote: 'Remote' });
  });

  it('has three columns and the same keys in es as in en', () => {
    for (const lang of [en, es]) {
      const c = lang.experiments.canopy;
      expect(c.remote.cols).toHaveLength(3);
      expect(Object.keys(c.remote).sort()).toEqual(['button', 'cols', 'kicker', 'title']);
      expect(Object.keys(c.catalogue).sort()).toEqual([
        'caption', 'explore', 'kicker', 'patterns', 'transparency',
      ]);
      expect(Object.keys(c.cta).sort()).toEqual(['catalogue', 'remote']);
    }
  });
});

describe.each([
  ['en', canopyEn],
  ['es', canopyEs],
] as const)('built /%s canopy page', (lang, html) => {
  const actions = actionsOf(html);
  const c = lang === 'en' ? en.experiments.canopy : es.experiments.canopy;

  it('puts both site links in the hero actions, above the fold', () => {
    expect(actions).toContain('href="https://remote.univerlab.org"');
    expect(actions).toContain('href="https://graphs.univerlab.org"');
    expect(actions).toContain(c.cta.remote);
    expect(actions).toContain(c.cta.catalogue);
  });

  it('leads with the Install anchor and a label', () => {
    expect(actions).toContain('href="#install"');
    expect(actions).toContain(lang === 'en' ? '>Install<' : '>Instalar<');
  });

  it('demotes GitHub to a tertiary link, not a btn', () => {
    const m = actions.match(/<a[^>]*href="https:\/\/github\.com\/UniverLab\/harness-canopy"[^>]*>[^<]*<\/a>/);
    if (!m) throw new Error('GitHub anchor not found in the actions block');
    expect(m[0]).toContain('class="tertiary-link"');
    expect(m[0]).not.toMatch(/class="btn\b/);
  });

  it('renders the Remote section with its command, three columns and CTA', () => {
    const section = sectionOf(html, 'remote-section');
    expect(section).toContain(c.remote.title);
    expect(section.match(/<div class="col"/g) ?? []).toHaveLength(3);
    expect(section).toContain('canopy remote pair');
    expect(section).toContain('data-remote-pair');
    expect(section).toContain('href="https://remote.univerlab.org"');
    expect(section).toContain(c.remote.button);
  });

  it('renders the catalogue section with a real plate and the three routes', () => {
    const section = sectionOf(html, 'catalogue-section');
    expect(section).toContain('data-catalogue-plate');
    expect(section).toContain('href="https://graphs.univerlab.org"');
    expect(section).toContain('href="https://graphs.univerlab.org/patterns"');
    expect(section).toContain('href="https://graphs.univerlab.org/transparency"');
    expect(section).toContain(c.catalogue.explore);
    expect(section).toContain(c.catalogue.patterns);
    expect(section).toContain(c.catalogue.transparency);
  });
});

describe('source pins: hero CTAs, fold order and the banner clip fix', () => {
  it('hides the layout GitHub button and authors the three primary/secondary CTAs', () => {
    expect(view).toContain('<ExperimentLayout id="canopy" hideGithub>');
    expect(view).toContain('class="btn btn-primary" href="#install"');
    expect(view).toContain('href="https://graphs.univerlab.org"');
    expect(view).toContain('href="https://remote.univerlab.org"');
    expect(view).toContain('class="tertiary-link"');
    expect(view).toContain('#3fb8b0');
  });

  it('orders the hero children so the actions precede the morph (global selectors)', () => {
    expect(view).toContain(":global(html[data-surface='tui'] .exp .hero .actions) { order: 1; }");
    expect(view).toContain(":global(html[data-surface='tui'] .exp .hero .hero-visual) { order: 2; }");
    expect(view).toContain(":global(html[data-surface='tui'] .exp .hero .install) { order: 3; }");
  });

  it('gives the install box an anchor', () => {
    expect(layout).toContain('<div class="install" id="install" data-install>');
  });

  it('pads both banner boxes so the first and last ink rows survive the clip', () => {
    expect(banner).toMatch(/\.banner \{[^}]*padding-block: 2px/);
    expect(banner).toMatch(/\.banner code \{[^}]*padding-block: 2px/);
  });
});
