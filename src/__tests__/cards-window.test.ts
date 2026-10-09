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
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { experiments } from '../lib/experiments';
import { pickRunner } from '../scripts/backgrounds';
import { motifOf } from '../i18n';
import { en } from '../i18n/en';

const HOME = resolve(__dirname, '..', 'views', 'Home.astro');
const EXP_LAYOUT = resolve(__dirname, '..', 'layouts', 'ExperimentLayout.astro');
const GLOBAL_CSS = resolve(__dirname, '..', 'styles', 'global.css');
const ESSENCE_TOKENS = resolve(__dirname, '..', 'components', 'EssenceTokens.astro');
const BACKGROUNDS = resolve(__dirname, '..', 'scripts', 'backgrounds.ts');
const THEME_BG = resolve(__dirname, '..', 'components', 'ThemeBackground.astro');
const EXPERIMENTS_TS = resolve(__dirname, '..', 'lib', 'experiments.ts');

const homeSrc = readFileSync(HOME, 'utf8');
const expLayoutSrc = readFileSync(EXP_LAYOUT, 'utf8');
const globalCss = readFileSync(GLOBAL_CSS, 'utf8');
const essenceTokensSrc = readFileSync(ESSENCE_TOKENS, 'utf8');
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

  it('the cadSpec card starts no runner — the window shows only the page background', () => {
    // Given: the startCard body, in source order
    const body = homeSrc.slice(homeSrc.indexOf('const startCard'));
    const guard = body.indexOf("card.dataset.flipSurface === 'blueprint'");
    const started = body.indexOf('canvas.dataset.started');
    const mount = body.indexOf('startBackground(');
    // Then: the blueprint guard returns before the canvas is marked started …
    expect(guard).toBeGreaterThan(-1);
    expect(body).toMatch(/if \(card\.dataset\.flipSurface === 'blueprint'\) return;/);
    expect(guard).toBeLessThan(started);
    expect(guard).toBeLessThan(mount);
    // … the window still reproduces the /cadspec page's own drafting grid …
    expect(homeSrc).toMatch(/\.card:hover\[data-flip-surface='blueprint'\]/);
    expect(homeSrc).toMatch(/background-size: 140px 140px, 140px 140px, 28px 28px, 28px 28px/);
    // … and every other card still mounts its own runner through the 5-arg call
    expect(homeSrc).toMatch(/startBackground\(canvas, theme, color, bg, surf\)/);
  });

  it('should read the PAGE accent as the runner colour, not the registry hex', () => {
    // Given: a card whose inline --essence is the registry hex (ghScaff sky)
    // When: startCard resolves the colour
    // Then: --surface-essence wins, with the registry hex as the fallback
    expect(homeSrc).toMatch(
      /getPropertyValue\('--surface-essence'\)\.trim\(\)[\s\S]*?getPropertyValue\('--essence'\)\.trim\(\)/
    );
  });

  it('should re-point --essence at --surface-essence on the flip', () => {
    // A flipped card's EXP number, status dot, name and motif must wear the
    // page accent, so the flip rule re-points the token every element reads.
    expect(homeSrc).toMatch(/--essence: var\(--surface-essence\);/);
    expect(homeSrc).toMatch(/\.card-motif[^}]*color: var\(--essence\)/);
  });

  it('should declare a --surface-essence per surface from the registry, never in global.css', () => {
    // The tokens are emitted by EssenceTokens.astro from experiments.ts —
    // global.css holds substrates only, never an essence literal.
    expect(globalCss).not.toMatch(/--surface-essence:/);
    expect(globalCss).not.toMatch(/--surface-essence-text:/);
    expect(essenceTokensSrc).toMatch(/from '\.\.\/lib\/experiments'/);
    expect(essenceTokensSrc).toMatch(/\[data-surface='/);
    expect(essenceTokensSrc).toMatch(/\[data-flip-surface='/);
    expect(essenceTokensSrc).toMatch(/--surface-essence:/);
    expect(essenceTokensSrc).toMatch(/--surface-essence-text:/);
    expect(essenceTokensSrc).toMatch(/essenceTextHex \?\? exp\.essenceHex/);
    // …and Home holds no hex of its own for it.
    expect(homeSrc).not.toMatch(/--surface-essence:\s*#/);
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

  it('should hand the surface to the runner instead of letting it read the DOM', () => {
    // startBackground is the ONLY resolver (argument first, page second) and
    // passes the result on ctx.surface …
    expect(backgroundsSrc).toMatch(/const surf = surface \?\? document\.documentElement\.dataset\.surface;/);
    expect(backgroundsSrc).toMatch(/ctx\.surface = surf;/);
    expect(backgroundsSrc).toMatch(/surface\?: string/);
    // … so no runner may read documentElement itself: on the home page <html>
    // has no surface, and a direct read silently skips the re-tint. Every
    // runner module is checked, not just the one that had the bug.
    const offenders = readdirSync(resolve(__dirname, '..', 'scripts'))
      .filter((f) => f.endsWith('.ts') && f !== 'backgrounds.ts')
      .filter((f) => {
        const code = readFileSync(resolve(__dirname, '..', 'scripts', f), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '') // comments may name the old read
          .replace(/\/\/.*$/gm, '');
        return /documentElement\.dataset\.surface/.test(code);
      });
    expect(offenders).toEqual([]);
  });
});

describe('Cards window — CSS comments close only where they were meant to', () => {
  /** Strip comments the way the CSS parser does: the FIRST close delimiter
   *  ends the comment, whatever the author intended. A `*` glued to the
   *  closing slash of a glob (the day/night variable prefix) used to end the
   *  quorum comment early, and the leftover prose fused itself onto the day
   *  selector — an invalid qualified rule, so the build silently dropped the
   *  SUN flip rule. Source-level assertions can't see a rule the build drops,
   *  so assert the comment structure itself. */
  const stripComments = (src: string): string => {
    let out = '';
    let i = 0;
    let inComment = false;
    while (i < src.length) {
      if (!inComment && src.startsWith('/*', i)) {
        inComment = true;
        i += 2;
        continue;
      }
      if (inComment) {
        const end = src.indexOf('*/', i);
        if (end === -1) return out + '<<UNTERMINATED COMMENT>>';
        inComment = false;
        i = end + 2;
        continue;
      }
      out += src[i];
      i += 1;
    }
    return out;
  };

  /** Every CSS source the site actually renders: stylesheets + Astro styles. */
  const cssSources = (): Array<{ file: string; css: string }> => {
    const root = resolve(__dirname, '..');
    const out: Array<{ file: string; css: string }> = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(abs);
          continue;
        }
        if (entry.name.endsWith('.css')) {
          out.push({ file: abs, css: readFileSync(abs, 'utf8') });
        } else if (entry.name.endsWith('.astro')) {
          const src = readFileSync(abs, 'utf8');
          for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
            out.push({ file: abs, css: m[1] });
          }
        }
      }
    };
    walk(root);
    return out;
  };

  it('should not end a comment early or leave one unterminated', () => {
    const offenders = cssSources()
      .filter(({ css }) => {
        const stripped = stripComments(css);
        return stripped.includes('*/') || stripped.includes('<<UNTERMINATED');
      })
      .map((o) => o.file);
    expect(offenders).toEqual([]);
  });

  it('should keep the quorum day rule as real rules, not comment debris', () => {
    // Given Home's style block, comments stripped exactly as a parser would
    // When the day rule is located, its prelude is just the three selectors —
    // with an early-closed comment the leftover prose (ornament + delimiter)
    // rides along in front of them, which is what makes the rule invalid and
    // the build drop it.
    const homeStyle = cssSources().find((s) => s.file.endsWith('Home.astro'))!;
    const stripped = stripComments(homeStyle.css);
    const valueAt = stripped.indexOf('var(--q-day-bg)');
    expect(valueAt).toBeGreaterThan(-1);
    const blockStart = stripped.lastIndexOf('{', valueAt);
    const prelude = stripped.slice(stripped.lastIndexOf('}', blockStart) + 1, blockStart);
    expect(prelude).toContain("html[data-celestial='sun'] .card[data-exp='quorum']:hover");
    expect(prelude).not.toContain('─');
    expect(prelude).not.toContain('*/');
    // And every day/night token is still declared on its own side.
    for (const token of ['bg', 'bg-raise', 'ink', 'ink-dim', 'ink-faint', 'line']) {
      expect(stripped).toContain(`var(--q-day-${token})`);
      expect(stripped).toContain(`var(--q-night-${token})`);
    }
  });
});
