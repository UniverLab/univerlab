/**
 * Tests for lhome-cards-window — each home experiment card is a WINDOW onto
 * its experiment's CURRENT page style, and clicking zooms via native
 * cross-document View Transitions.
 *
 * Astro components aren't directly renderable in Jest, so we verify
 * the source-level contract by reading the source files as text
 * (same style as hero-scale.test.ts), plus a unit test of the exported
 * pure runner selector in src/scripts/backgrounds.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { experiments } from '../lib/experiments';
import { pickRunner } from '../scripts/backgrounds';
import { motifOf } from '../i18n';
import { en } from '../i18n/en';

const HOME = resolve(__dirname, '..', 'views', 'Home.astro');
const EXP_LAYOUT = resolve(__dirname, '..', 'layouts', 'ExperimentLayout.astro');
const GLOBAL_CSS = resolve(__dirname, '..', 'styles', 'global.css');
const BACKGROUNDS = resolve(__dirname, '..', 'scripts', 'backgrounds.ts');
const THEME_BG = resolve(__dirname, '..', 'components', 'ThemeBackground.astro');
const EXPERIMENTS_TS = resolve(__dirname, '..', 'lib', 'experiments.ts');

const homeSrc = readFileSync(HOME, 'utf8');
const expLayoutSrc = readFileSync(EXP_LAYOUT, 'utf8');
const globalCss = readFileSync(GLOBAL_CSS, 'utf8');
const backgroundsSrc = readFileSync(BACKGROUNDS, 'utf8');
const themeBgSrc = readFileSync(THEME_BG, 'utf8');
const experimentsSrc = readFileSync(EXPERIMENTS_TS, 'utf8');

const VIEWS: Record<string, string> = {};
for (const id of [
  'Canopy',
  'Texforge',
  'Gitkit',
  'Ghscaff',
  'Cadspec',
  'AstroDenoise',
  'DemoStage',
  'Quorum',
]) {
  VIEWS[id] = readFileSync(
    resolve(__dirname, '..', 'views', 'experiments', `${id}.astro`),
    'utf8'
  );
}

/** Literal hero motifs — ground truth lives ONLY in experiments.ts (cadspec's
 *  language-dependent motif lives in the i18n dictionaries). */
const LITERALS: Record<string, string> = {
  Canopy: '⠿⠶⠦⠤ · ⠤⠦⠶⠿',
  Texforge: '.tex ──→ lint ──→ typeset ──→ PDF',
  Gitkit: 'o──o──◆ origin/main · 3 hooks · idempotent',
  Ghscaff: '+--+ 07 lifts · idempotent +--+',
  AstroDenoise: '⁘∴⁙∵ ──∿──→ · ✦ ·',
  DemoStage: '▶──●────●───□',
  Quorum: '○──◇──○',
};

describe('Cards window — no hand-kept surfaces map in Home.astro', () => {
  it('should not contain a surfaces object', () => {
    expect(homeSrc).not.toMatch(/const surfaces/);
    expect(homeSrc).not.toMatch(/surfaces:/);
  });

  it('should not hard-code the drifted hexes/glyphs', () => {
    expect(homeSrc).not.toMatch(/bgHexLight/);
    // gitkit's stale emoji glyph is gone; motifs come from the registry
    expect(homeSrc).not.toContain('🍒');
  });

  it('should not intercept card clicks with a JS overlay', () => {
    expect(homeSrc).not.toMatch(/addEventListener\('click'/);
    expect(homeSrc).not.toMatch(/clip-path/);
    expect(homeSrc).not.toMatch(/createElement\('div'\)/);
    expect(homeSrc).not.toMatch(/setTimeout\(go/);
  });

  it('should pass the runner surface + essence through data/computed tokens', () => {
    expect(homeSrc).toMatch(/startBackground\(canvas, theme, color, bg, surf\)/);
    expect(homeSrc).toMatch(/card\.dataset\.flipSurface/);
  });
});

describe('Cards window — template wires the transition + motif', () => {
  it('should name each card exp-<id> for the cross-document morph', () => {
    expect(homeSrc).toContain('view-transition-name: exp-${exp.id}');
  });

  it('should carry the zoom class on the card and on the destination hero', () => {
    expect(homeSrc).toContain('view-transition-class: exp-zoom');
    expect(expLayoutSrc).toContain('view-transition-class: exp-zoom');
  });

  it('should render the registry motif in a card-motif strip', () => {
    expect(homeSrc).toContain('card-motif');
    expect(homeSrc).toMatch(
      /<span class="card-motif" aria-hidden="true">\{motif\}<\/span>/
    );
    expect(homeSrc).toMatch(/const motif = motifOf\(exp, t\)/);
  });

  it('should carry the quorum circadian tokens inline from the registry', () => {
    expect(homeSrc).toMatch(/--q-day-/);
    expect(homeSrc).toMatch(/--q-night-/);
    expect(homeSrc).toMatch(/circadianPalette/);
  });
});

describe('Cards window — no stale per-experiment hover chrome', () => {
  it('should not contain the canopy terminal-dot bar / cursor chrome', () => {
    expect(homeSrc).not.toMatch(/~\/canopy/);
    expect(homeSrc).not.toMatch(/cursor-blink/);
    expect(homeSrc).not.toMatch(/var\(--canopy\)/);
  });

  it('should not contain per-data-exp h3/.num colour copies', () => {
    expect(homeSrc).not.toMatch(/\.card\[data-exp='canopy'\]:hover h3/);
    expect(homeSrc).not.toMatch(/\.card\[data-exp='quorum'\]\.is-tapped h3/);
  });

  it('should accent h3 through the single generic --essence rule', () => {
    expect(homeSrc).toMatch(/\.card:hover h3/);
  });

  it('should redirect quorum to registry day/night tokens, not hard-code hexes', () => {
    expect(homeSrc).toMatch(/--surface-bg: var\(--q-day-bg\)/);
    expect(homeSrc).toMatch(/--surface-bg: var\(--q-night-bg\)/);
    expect(homeSrc).not.toMatch(/--bg: #f0e8da/);
    expect(homeSrc).not.toMatch(/--bg: #241a12/);
  });
});

describe('Cards window — mobile tap keeps slop/timing, navigates natively', () => {
  it('should keep the SLOP/TAP_MS rules', () => {
    expect(homeSrc).toMatch(/SLOP = 12/);
    expect(homeSrc).toMatch(/TAP_MS = 600/);
  });

  it('should keep the touchend hold then card.click() with no overlay', () => {
    expect(homeSrc).toMatch(/addEventListener\('touchend'/);
    expect(homeSrc).toMatch(/card\.click\(\)/);
  });
});

describe('Cards window — registry is the single source of truth', () => {
  it('should give every experiment a non-empty motif', () => {
    expect(experiments.length).toBeGreaterThan(0);
    for (const exp of experiments) {
      expect(typeof exp.motif).toBe('string');
      expect(exp.motif.length).toBeGreaterThan(0);
    }
  });

  it('should point exactly cadspec at the i18n motif', () => {
    const i18n = experiments.filter((e) => e.motif === '@i18n');
    expect(i18n.map((e) => e.id)).toEqual(['cadspec']);
  });

  it('should resolve motifs through motifOf — i18n for cadspec, literal elsewhere', () => {
    // Given: both kinds of registry entry and a dictionary
    const t = en;
    // When/Then: the i18n pointer resolves to the dictionary's own motif…
    expect(motifOf({ motif: '@i18n' }, t)).toBe(t.experiments.cadspec.hero.motif);
    // …and every literal motif passes through untouched
    for (const exp of experiments) {
      expect(motifOf(exp, t)).toBe(
        exp.motif === '@i18n' ? t.experiments.cadspec.hero.motif : exp.motif
      );
    }
  });

  it('should hold every literal motif in experiments.ts', () => {
    for (const literal of Object.values(LITERALS)) {
      expect(experimentsSrc).toContain(`motif: '${literal}'`);
    }
  });
});

describe('Cards window — experiment views render the registry motif', () => {
  for (const [view, literal] of Object.entries(LITERALS)) {
    it(`${view} hero-mark should render {exp.motif}`, () => {
      expect(VIEWS[view]).toMatch(
        /<p slot="hero-mark"[^>]*>\{exp\.motif\}<\/p>/
      );
    });

    it(`${view} should not keep its literal motif inline`, () => {
      expect(VIEWS[view]).not.toContain(literal);
    });
  }

  it('Cadspec hero-mark should render {motifOf(exp, t)} (i18n motif stays)', () => {
    expect(VIEWS.Cadspec).toMatch(
      /<p slot="hero-mark"[^>]*>\{motifOf\(exp, t\)\}<\/p>/
    );
  });
});

describe('Cards window — ExperimentLayout is the zoom target', () => {
  it('should name the hero exp-<id> so the card morphs into it', () => {
    expect(expLayoutSrc).toContain('view-transition-name: exp-${id}');
  });

  it('should gate page-reveal to engines without view transitions', () => {
    expect(expLayoutSrc).toMatch(
      /@supports not \(view-transition-name: none\)/
    );
    expect(expLayoutSrc).toMatch(/page-reveal/);
  });
});

describe('Cards window — global.css transition wiring', () => {
  it('should opt both documents into cross-document transitions', () => {
    expect(globalCss).toMatch(/@view-transition\s*\{\s*navigation:\s*auto;\s*\}/);
  });

  it('should keep the header still across the morph', () => {
    expect(globalCss).toMatch(/view-transition-name:\s*site-header/);
    // scoped to the site chrome: /manifesto and /status nest their own
    // <header>, and a duplicate name inside one document kills the transition
    expect(globalCss).toMatch(/body > header\s*\{\s*view-transition-name:\s*site-header/);
  });

  it('should time the card morph at 550ms with the expo-out curve', () => {
    // The exp family travels on view-transition-class — the literal wildcard
    // `::view-transition-group(exp-*)` is invalid CSS (<pt-name-selector> is
    // only `*` | <custom-ident>) and Chrome drops the rule, so no RULE may
    // use it: it would look like the timing is covered while nothing is.
    expect(globalCss).not.toMatch(/::view-transition-group\(exp-\*\)\s*\{/);
    expect(globalCss).toMatch(/::view-transition-group\(\.exp-zoom\)/);
    expect(globalCss).toMatch(/animation-duration:\s*550ms/);
    expect(globalCss).toMatch(
      /animation-timing-function:\s*cubic-bezier\(0\.16,\s*0\.84,\s*0\.44,\s*1\)/
    );
  });

  it('should suppress transition pseudos under prefers-reduced-motion', () => {
    expect(globalCss).toMatch(/::view-transition-group\(\*\)/);
    expect(globalCss).toMatch(/::view-transition-old\(\*\)/);
    expect(globalCss).toMatch(/::view-transition-new\(\*\)/);
  });
});

describe('Cards window — startBackground surface selector', () => {
  it('should declare the 5th optional surface argument', () => {
    expect(backgroundsSrc).toMatch(/surface\?: string/);
  });

  it('should export the pure pickRunner selector', () => {
    expect(backgroundsSrc).toMatch(/export function pickRunner/);
  });

  it('should mount paper for texforge and the theme runner elsewhere', () => {
    const paperRunner = pickRunner('forge', 'paper');
    // the surface wins over the theme: any theme on paper gets paper
    expect(pickRunner('cosmic', 'paper')).toBe(paperRunner);
    // every other card surface gets its own theme runner, never paper
    expect(pickRunner('takes', 'studio')).not.toBe(paperRunner);
    expect(pickRunner('scaffold', 'industrial')).not.toBe(paperRunner);
    expect(pickRunner('bubbles', 'pastel')).not.toBe(paperRunner);
    expect(pickRunner('brain', 'tui')).not.toBe(paperRunner);
  });

  it('should fall back to the page data-surface when no surface is passed', () => {
    document.documentElement.dataset.surface = 'paper';
    try {
      expect(pickRunner('forge')).toBe(pickRunner('forge', 'paper'));
    } finally {
      delete document.documentElement.dataset.surface;
    }
  });

  it('should leave ThemeBackground call sites on the 4-arg page path', () => {
    expect(themeBgSrc).not.toMatch(/bg\s*,/);
  });
});
