/**
 * Tests for the home hero redesign — "the lab as a planet" (lhome-lab-system-redesign).
 * The lab is a planet with its experiments as satellites on 4 dotted orbits;
 * every satellite is a link with a hover/focus preview in its own page skin.
 *
 * Astro components aren't directly renderable in Jest, so the figure template
 * is verified by reading LabSystem.astro as text (hero-scale.test.ts style)
 * while the geometry module is tested directly.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildLabBodies,
  labRings,
  labVarStyle,
  satPosAt,
  labelRect,
  labelRects,
  rectsOverlap,
  rectCircleOverlap,
  minPairDistance,
  chooseLabelSides,
  LAB,
  SAT,
  MIN_GAP,
  LABEL,
  FULL_PERIOD,
  SAMPLE_STEP,
} from '../lib/lab-system';
import { experiments } from '../lib/experiments';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const LAB_SRC = readFileSync(resolve(__dirname, '..', 'components', 'LabSystem.astro'), 'utf8');
const HOME_SRC = readFileSync(resolve(__dirname, '..', 'views', 'Home.astro'), 'utf8');
const GLOBAL_SRC = readFileSync(resolve(__dirname, '..', 'styles', 'global.css'), 'utf8');

function figureSrc(): string {
  const start = LAB_SRC.indexOf('<figure');
  const end = LAB_SRC.indexOf('</figure>');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return LAB_SRC.slice(start, end);
}

describe('lab-system', () => {
  it('renders one body per experiment, in registry order', () => {
    const bodies = buildLabBodies(experiments);
    expect(bodies).toHaveLength(experiments.length);
    expect(bodies.map((b) => b.id)).toEqual(experiments.map((e) => e.id));
  });

  it('carries each experiment essence, surface, motif and name into the body', () => {
    const bodies = buildLabBodies(experiments);
    for (const b of bodies) {
      const exp = experiments.find((e) => e.id === b.id)!;
      expect(b.essenceHex).toBe(exp.essenceHex);
      expect(b.surface).toBe(exp.surface);
      expect(b.motif).toBe(exp.motif);
      expect(b.name).toBe(exp.name);
    }
    expect(LAB_SRC).toMatch(/--essence:\s*\$\{b\.essenceHex\}/);
    expect(LAB_SRC).toMatch(/data-body=\{b\.number\}/);
  });

  it('groups two satellites per age-ordered ring on 4 widening orbits', () => {
    const bodies = buildLabBodies(experiments);
    const rings = labRings(bodies);
    expect(rings).toHaveLength(4);
    const rx = rings.map((r) => r.rx);
    for (let i = 1; i < rx.length; i++) expect(rx[i]).toBeGreaterThan(rx[i - 1]);
    for (const r of rings) {
      expect(r.ry).toBeCloseTo(r.rx * 0.72, 9);
    }
    const byRing = new Map<number, typeof bodies>();
    for (const b of bodies) {
      if (!byRing.has(b.ring)) byRing.set(b.ring, []);
      byRing.get(b.ring)!.push(b);
    }
    expect([...byRing.keys()].sort()).toEqual([0, 1, 2, 3]);
    for (const [, pair] of byRing) {
      expect(pair).toHaveLength(2);
      expect(pair[0].rx).toBe(pair[1].rx);
      expect(pair[0].period).toBe(pair[1].period);
      const diff = Math.abs(pair[0].phase - pair[1].phase) % (Math.PI * 2);
      expect(Math.abs(diff - Math.PI)).toBeLessThan(1e-9);
    }
    const twins = bodies.filter((b) => b.number === 'EXP-005' || b.number === 'EXP-006');
    expect(twins).toHaveLength(2);
    expect(twins[0].ring).toBe(twins[1].ring);
    expect(LAB.cx).toBe(LAB.vbW / 2);
    expect(LAB.cy).toBe(LAB.vbH / 2);
  });

  it('sizes satellites by status and paces inner orbits fastest', () => {
    const bodies = buildLabBodies(experiments);
    for (const b of bodies) {
      expect(b.radius).toBe(SAT[b.status]);
    }
    expect(SAT.active).toBe(6);
    expect(SAT.beta).toBe(5);
    expect(SAT.research).toBe(4);
    for (const b of bodies) {
      expect(b.period).toBeGreaterThanOrEqual(60);
      expect(b.period).toBeLessThanOrEqual(180);
    }
    const sorted = [...bodies].sort((a, z) => a.ring - z.ring);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].period).toBeGreaterThanOrEqual(sorted[i - 1].period);
    }
    expect(sorted[0].period).toBe(60);
    expect(sorted[sorted.length - 1].period).toBe(180);
  });

  it('keeps every satellite pair ≥ 26 px apart over a full sampled period', () => {
    const bodies = buildLabBodies(experiments);
    const min = minPairDistance(bodies, { period: FULL_PERIOD, step: SAMPLE_STEP });
    expect(min).toBeGreaterThanOrEqual(MIN_GAP);
  });

  it('satPosAt rides the body ellipse with its own period', () => {
    const bodies = buildLabBodies(experiments);
    const b = bodies[0];
    const p0 = satPosAt(b, 0);
    expect(p0.x).toBeCloseTo(LAB.cx + b.rx * Math.cos(b.phase), 9);
    expect(p0.y).toBeCloseTo(LAB.cy + b.ry * Math.sin(b.phase), 9);
    const pFull = satPosAt(b, b.period);
    expect(pFull.x).toBeCloseTo(p0.x, 9);
    expect(pFull.y).toBeCloseTo(p0.y, 9);
  });

  it('places every label inside the viewBox with zero overlaps over the period', () => {
    const bodies = buildLabBodies(experiments);
    for (const b of bodies) {
      expect(['right', 'left', 'above', 'below']).toContain(b.side);
    }
    expect(chooseLabelSides(bodies)).toEqual(bodies.map((b) => b.side));
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 })).toBe(true);
    expect(rectCircleOverlap({ x: 0, y: 0, w: 10, h: 10 }, 100, 100, 24)).toBe(false);
    expect(rectCircleOverlap({ x: 220, y: 200, w: 46, h: 12 }, LAB.cx, LAB.cy, LAB.planetR)).toBe(true);
    expect(LABEL).toEqual({ w: 46, h: 12, gap: 6 });
    expect(labelRect('right', 100, 100, 6)).toEqual({ x: 112, y: 94, w: 46, h: 12 });
    for (let t = 0; t < FULL_PERIOD; t += SAMPLE_STEP) {
      const rects = labelRects(bodies, t);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(LAB.vbW);
        expect(r.y + r.h).toBeLessThanOrEqual(LAB.vbH);
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          expect(rectsOverlap(rects[i], rects[j])).toBe(false);
        }
      }
      const sats = bodies.map((b) => ({ p: satPosAt(b, t), r: b.radius }));
      for (let i = 0; i < rects.length; i++) {
        expect(rectCircleOverlap(rects[i], LAB.cx, LAB.cy, LAB.planetR)).toBe(false);
        for (let j = 0; j < sats.length; j++) {
          const disc = {
            x: sats[j].p.x - sats[j].r,
            y: sats[j].p.y - sats[j].r,
            w: sats[j].r * 2,
            h: sats[j].r * 2,
          };
          expect(rectsOverlap(rects[i], disc)).toBe(false);
        }
      }
    }
  });

  it('links every satellite with an aria-label built from name and tagline', () => {
    const fig = figureSrc();
    expect(fig).toContain('bodies.map');
    expect((fig.match(/class="lab-sat"/g) || [])).toHaveLength(1);
    expect(fig).toMatch(/href=\{localizePath\(`\/\$\{b\.id\}`, lang\)\}/);
    expect(fig).toMatch(/tabindex="0"/);
    expect(fig).toMatch(/aria-label=\{\`\$\{b\.name\} — \$\{t\.experiments\[b\.id\]\.tagline\}\`\}/);
    for (const e of experiments) {
      const enLabel = `${e.name} — ${(en.experiments as Record<string, { tagline: string }>)[e.id].tagline}`;
      const esLabel = `${e.name} — ${(es.experiments as Record<string, { tagline: string }>)[e.id].tagline}`;
      expect(enLabel).toMatch(/ — /);
      expect(esLabel).toMatch(/ — /);
      expect((en.experiments as Record<string, { tagline: string }>)[e.id].tagline).toBeTruthy();
      expect((es.experiments as Record<string, { tagline: string }>)[e.id].tagline).toBeTruthy();
    }
  });

  it('draws the planet with a terminator and dotted hairline orbits', () => {
    const fig = figureSrc();
    expect(fig).toMatch(/<svg[^>]*data-orbit-well/);
    expect(fig).not.toMatch(/aria-hidden="true"\s*\n?\s*xmlns/);
    expect(fig).toContain('rings.map');
    expect((fig.match(/class="lab-orbit"/g) || [])).toHaveLength(1);
    expect(LAB_SRC).toMatch(/stroke-dasharray:\s*1 5/);
    expect(LAB_SRC).toMatch(/\.lab-orbit\s*\{[^}]*stroke:\s*var\(--ink\)/);
    expect(LAB_SRC).toMatch(/\.lab-orbit\s*\{[^}]*opacity:\s*0\.2/);
    expect(LAB_SRC).not.toMatch(/lab-halo/);
    expect(LAB_SRC).not.toMatch(/radialGradient/);
    expect(fig).toMatch(/lab-planet-disc/);
    expect(fig).toMatch(/lab-planet-term/);
    expect(fig).toMatch(/aria-hidden="true"/);
  });

  it('opens a page-skinned preview beside the focused satellite', () => {
    const fig = figureSrc();
    expect((fig.match(/class="lab-preview"/g) || [])).toHaveLength(1);
    expect(fig).toMatch(/data-flip-surface=\{b\.surface\}/);
    expect(fig).toMatch(/lab-preview-name/);
    expect(fig).toMatch(/lab-preview-motif/);
    expect(fig).toMatch(/t\.experiments\[b\.id\]\.tagline/);
    expect(fig).toMatch(/t\.status\[b\.status\]/);
    expect(fig).toMatch(/motifOf/);
    expect(LAB_SRC).toMatch(/\.lab-preview\s*\{[^}]*width:\s*220px/);
    expect(LAB_SRC).toMatch(/\.lab-preview\s*\{[^}]*height:\s*120px/);
    expect(LAB_SRC).toMatch(/\.lab-scale\s*\{[^}]*transform:\s*scale\(1\.6\)/);
    expect(LAB_SRC).toMatch(/\.lab-orbit\.is-lit\s*\{[^}]*opacity:\s*0\.45/);
    expect(LAB_SRC).toMatch(/opacity:\s*0\.4/);
    expect(LAB_SRC).toMatch(/animation-play-state:\s*paused/);
    expect(LAB_SRC).toMatch(/is-hovering/);
    expect(LAB_SRC).toMatch(/lab-dot['"]?\)!\.getBoundingClientRect/);
  });

  it('uses first-tap-preview touch handling without breaking mouse or keyboard', () => {
    expect(LAB_SRC).toMatch(/tappedId/);
    expect(LAB_SRC).toMatch(/SLOP = 12/);
    expect(LAB_SRC).toMatch(/TAP_MS = 600/);
    expect(LAB_SRC).toMatch(/preventDefault/);
    expect(LAB_SRC).toMatch(/mouseenter/);
    expect(LAB_SRC).toMatch(/focus/);
  });

  it('renders a static frame under reduced motion: one gated animation, no SMIL', () => {
    expect(LAB_SRC.match(/animation:/g)!.length).toBe(1);
    expect(LAB_SRC).toMatch(/@media\s*\(prefers-reduced-motion:\s*no-preference\)[\s\S]*?animation:/);
    expect(LAB_SRC).toMatch(/\.lab-body\s*\{\s*transform:\s*translate\(var\(--k0x\),\s*var\(--k0y\)\);\s*\}/);
    expect(LAB_SRC).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?transform:\s*none/);
    expect(LAB_SRC).not.toMatch(/<animate|<animateMotion|<set[\s>]/);
    expect(GLOBAL_SRC).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/);
  });

  it('emits every keyframe variable so no body collapses onto the mark', () => {
    for (const b of buildLabBodies(experiments)) {
      const style = labVarStyle(b);
      const orbitVars = style.match(/--k\d+[xy]:/g) || [];
      expect(orbitVars).toHaveLength(32);
      expect(style).toMatch(/--period:\s*\d+(\.\d+)?s;/);
    }
  });

  it('keeps the caption with i18n parity', () => {
    const fig = figureSrc();
    expect((fig.match(/<figcaption/g) || []).length).toBe(1);
    expect(LAB_SRC).toMatch(/t\.home\.hero\.systemCaption/);
    expect(en.home.hero.systemCaption).toBeTruthy();
    expect(es.home.hero.systemCaption).toBeTruthy();
    expect(en.home.hero.systemCaption).toMatch(/—/);
    expect(es.home.hero.systemCaption).toMatch(/—/);
    expect(en.home.hero.systemCaption).not.toBe(es.home.hero.systemCaption);
  });

  it('splits the home hero into two columns from 1100 px up', () => {
    expect(HOME_SRC).toMatch(/@media\s*\(min-width:\s*1100px\)[\s\S]*?grid-template-columns:\s*minmax\(0,\s*3fr\)\s*minmax\(0,\s*2fr\)/);
    expect(HOME_SRC).toMatch(/\.hero-col\s*\{[^}]*gap:\s*1\.2rem/);
    expect(HOME_SRC.indexOf('hero-cta')).toBeLessThan(HOME_SRC.lastIndexOf('<LabSystem'));
  });
});
