/**
 * Tests for the home hero restyle — "The lab as a system" (lhome-restyle-system).
 * An orbital SVG figure fills the right half of the hero; the bodies revolve
 * autonomously (CSS only), the figure is never a menu, and reduced motion
 * renders a static frame.
 *
 * Astro components aren't directly renderable in Jest, so the figure template
 * is verified by reading LabSystem.astro as text (hero-scale.test.ts style)
 * while the geometry module is tested directly.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLabBodies, labRings, labVarStyle, LAB } from '../lib/lab-system';
import { experiments } from '../lib/experiments';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const LAB_SRC = readFileSync(resolve(__dirname, '..', 'components', 'LabSystem.astro'), 'utf8');
const HOME_SRC = readFileSync(resolve(__dirname, '..', 'views', 'Home.astro'), 'utf8');
const GLOBAL_SRC = readFileSync(resolve(__dirname, '..', 'styles', 'global.css'), 'utf8');

function figureSrc(): string {
  // Given: the LabSystem component source
  // When: the <figure> subtree is extracted
  // Then: exactly one figure exists to slice
  const start = LAB_SRC.indexOf('<figure');
  const end = LAB_SRC.indexOf('</figure>');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return LAB_SRC.slice(start, end);
}

describe('lab-system', () => {
  it('renders one body per experiment, in registry order', () => {
    // Given: the experiment registry
    // When: the orbital bodies are built
    // Then: there is one body per experiment, with the same ids in the same order
    const bodies = buildLabBodies(experiments);
    expect(bodies).toHaveLength(experiments.length);
    expect(bodies.map((b) => b.id)).toEqual(experiments.map((e) => e.id));
  });

  it('carries each experiment essenceHex into the template binding', () => {
    // Given: the built bodies
    // When: essence colours are compared against the registry
    // Then: every body carries its experiment's essenceHex, and the template binds it
    const bodies = buildLabBodies(experiments);
    for (const b of bodies) {
      const exp = experiments.find((e) => e.id === b.id);
      expect(b.essenceHex).toBe(exp?.essenceHex);
    }
    expect(LAB_SRC).toMatch(/fill=\{b\.essenceHex\}/);
    expect(LAB_SRC).toMatch(/stroke=\{b\.essenceHex\}/);
    expect(LAB_SRC).toMatch(/data-body=\{b\.number\}/);
  });

  it('sizes rings by age so the earliest experiment rides innermost', () => {
    // Given: the built bodies
    // When: ring/radius is read against startDate rank
    // Then: rx strictly increases with date rank; the two 2026-04-10 entries
    // share a ring/rx but start 45° apart so they never overlap
    const bodies = buildLabBodies(experiments);
    const byDate = [...bodies].sort((a, z) => a.ring - z.ring);
    for (let i = 1; i < byDate.length; i++) {
      if (byDate[i].ring === byDate[i - 1].ring) {
        expect(byDate[i].rx).toBe(byDate[i - 1].rx);
      } else {
        expect(byDate[i].rx).toBeGreaterThan(byDate[i - 1].rx);
      }
    }
    const twins = bodies.filter((b) => b.number === 'EXP-005' || b.number === 'EXP-006');
    expect(twins).toHaveLength(2);
    expect(twins[0].ring).toBe(twins[1].ring);
    expect(twins[0].rx).toBe(twins[1].rx);
    expect(twins[0].pts[0]).not.toEqual(twins[1].pts[0]);
    // And: the rightmost label stays inside the 460-wide viewBox
    const maxX = Math.max(...bodies.flatMap((b) => b.pts.map((p) => p.x)));
    expect(maxX + 9 + 46).toBeLessThanOrEqual(LAB.vbW);
    // And: the diagram is centred in its viewBox, so the svg centre (where the
    // orbit runner drops its well via data-orbit-well) is the diagram's own
    // gravitational centre — the motes and the orbits share one.
    expect(LAB.cx).toBe(LAB.vbW / 2);
    expect(LAB.cy).toBe(LAB.vbH / 2);
  });

  it('revolves inner orbits fastest within the 60–180 s band', () => {
    // Given: the built bodies
    // When: periods are read against ring rank
    // Then: every period is within [60, 180], non-decreasing with ring,
    // innermost 60 s and outermost 180 s for the current registry
    const bodies = buildLabBodies(experiments);
    const byDate = [...bodies].sort((a, z) => a.ring - z.ring);
    for (const b of bodies) {
      expect(b.period).toBeGreaterThanOrEqual(60);
      expect(b.period).toBeLessThanOrEqual(180);
    }
    for (let i = 1; i < byDate.length; i++) {
      expect(byDate[i].period).toBeGreaterThanOrEqual(byDate[i - 1].period);
    }
    expect(byDate[0].period).toBe(60);
    expect(byDate[byDate.length - 1].period).toBe(180);
    expect(labRings(bodies)).toHaveLength(7);
  });

  it('draws research/beta bodies hollow and active bodies filled', () => {
    // Given: the registry statuses
    // When: the template's status branch is inspected
    // Then: exactly the non-active experiments exist as hollow bodies
    expect(LAB_SRC).toMatch(/b\.status === 'active'/);
    expect(LAB_SRC).toMatch(/is-hollow/);
    const hollow = experiments.filter((e) => e.status !== 'active').map((e) => e.id);
    expect(hollow).toEqual(['cadspec', 'astro-denoise']);
    expect(hollow).toHaveLength(2);
  });

  it('is not a menu: no links, no affordance, one caption with i18n parity', () => {
    // Given: the figure subtree
    // When: it is scanned for interactive affordances
    // Then: no anchors, buttons, hrefs, tabindex, hover rules or pointer cursors;
    // exactly one figcaption bound to the i18n caption, with EN+ES parity
    const fig = figureSrc();
    expect(fig).not.toMatch(/<a[\s>]/);
    expect(fig).not.toMatch(/<button[\s>]/);
    expect(fig).not.toMatch(/href=/);
    expect(fig).not.toMatch(/tabindex/);
    expect(LAB_SRC).not.toMatch(/:hover/);
    expect(LAB_SRC).not.toMatch(/cursor:\s*pointer/);
    expect((fig.match(/<figcaption/g) || []).length).toBe(1);
    expect(LAB_SRC).toMatch(/t\.home\.hero\.systemCaption/);
    expect(en.home.hero.systemCaption).toBeTruthy();
    expect(es.home.hero.systemCaption).toBeTruthy();
    expect(en.home.hero.systemCaption).toMatch(/—/);
    expect(es.home.hero.systemCaption).toMatch(/—/);
    expect(en.home.hero.systemCaption).not.toBe(es.home.hero.systemCaption);
  });

  it('exposes the well marker and hides bodies from assistive tech', () => {
    // Given: the figure source
    // When: accessibility and well hand-off attributes are counted
    // Then: the svg carries data-orbit-well + aria-hidden, every body <g> is aria-hidden
    expect(LAB_SRC).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(LAB_SRC).toMatch(/data-orbit-well/);
    // The body <g> is rendered inside bodies.map, so the one template line
    // guarantees every rendered body carries aria-hidden
    expect(LAB_SRC).toContain('<g class="lab-body" aria-hidden="true"');
  });

  it('renders a static frame under reduced motion: one gated animation, no SMIL', () => {
    // Given: the component and global stylesheets
    // When: animation declarations are counted
    // Then: exactly one animation line, gated on no-preference; the base rule
    // is the static frame; no SMIL; the global reduce kill-switch is intact
    expect(LAB_SRC.match(/animation:/g)!.length).toBe(1);
    expect(LAB_SRC).toMatch(/@media\s*\(prefers-reduced-motion:\s*no-preference\)[\s\S]*?animation:/);
    expect(LAB_SRC).toMatch(/\.lab-body\s*\{\s*transform:\s*translate\(var\(--k0x\),\s*var\(--k0y\)\);\s*\}/);
    expect(LAB_SRC).not.toMatch(/<animate|<animateMotion|<set[\s>]/);
    expect(GLOBAL_SRC).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/);
  });

  it('emits every keyframe variable so no body collapses onto the mark', () => {
    // Given: every built body
    // When: its var style is rendered
    // Then: all 32 orbit vars plus --period are present
    for (const b of buildLabBodies(experiments)) {
      const style = labVarStyle(b);
      const orbitVars = style.match(/--k\d+[xy]:/g) || [];
      expect(orbitVars).toHaveLength(32);
      expect(style).toMatch(/--period:\s*\d+(\.\d+)?s;/);
    }
  });

  it('splits the home hero into two columns from 1100 px up', () => {
    // Given: the home view source
    // When: the hero grid rules are inspected
    // Then: the 1100 px media query holds the 3fr/2fr grid, the text column
    // keeps the hero rhythm, and the figure renders after the buttons
    expect(HOME_SRC).toMatch(/@media\s*\(min-width:\s*1100px\)[\s\S]*?grid-template-columns:\s*minmax\(0,\s*3fr\)\s*minmax\(0,\s*2fr\)/);
    expect(HOME_SRC).toMatch(/\.hero-col\s*\{[^}]*gap:\s*1\.2rem/);
    expect(HOME_SRC.indexOf('hero-cta')).toBeLessThan(HOME_SRC.lastIndexOf('<LabSystem'));
  });
});
