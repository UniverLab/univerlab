/**
 * Plate I of /manifesto: the cosmic perspective as a scroll-driven pull-back
 * engraving (src/components/CosmicPlate.astro, src/lib/cosmic-plate.ts,
 * src/scripts/cosmic-plate.ts). The pure camera maths is tested as behaviour;
 * the component contract (legend as text, static without JS or with reduced
 * motion) is read from the source.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import {
  ZOOM, SPACE_END, Z_END, rng, progressToZ, sceneScale, sceneOpacity, captionIndex, timeProgress, scenes, timeX, timeRule,
} from '../lib/cosmic-plate';

const ROOT = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const view = read('src/views/Manifesto.astro');
const plate = read('src/components/CosmicPlate.astro');
const script = read('src/scripts/cosmic-plate.ts');

describe('cosmic plate camera', () => {
  it('maps the scroll to depth, clamped', () => {
    expect(progressToZ(-1)).toBe(0);
    expect(progressToZ(0.5)).toBe(Z_END / 2);
    expect(progressToZ(2)).toBe(Z_END);
  });

  it('shows each scene at scale 1 on its own step and 1/ZOOM one step later', () => {
    expect(sceneScale(3, 3)).toBe(1);
    expect(sceneScale(3, 4)).toBeCloseTo(1 / ZOOM);
    expect(sceneScale(3, 2)).toBeCloseTo(ZOOM);
  });

  it('holds a scene fully on its own step and hides it far from it', () => {
    for (let i = 0; i <= SPACE_END; i++) {
      expect(sceneOpacity(i, i)).toBe(1);
      expect(sceneOpacity(i, i + 1.5)).toBe(0);
    }
    expect(sceneOpacity(0, 0)).toBe(1);
    expect(sceneOpacity(4, 2)).toBe(0);
    // The last scene gives way to the time rule.
    expect(sceneOpacity(SPACE_END, Z_END)).toBe(0);
  });

  it('hands the caption to the dominant scene', () => {
    expect(captionIndex(0)).toBe(0);
    expect(captionIndex(4.5)).toBe(4);
    expect(captionIndex(4.7)).toBe(5);
    expect(captionIndex(99)).toBe(SPACE_END);
  });

  it('starts the time phase only after the pull-back', () => {
    expect(timeProgress(SPACE_END)).toBe(0);
    expect(timeProgress(Z_END)).toBe(1);
  });

  it('draws the same plate on every build', () => {
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(scenes()).toEqual(scenes());
    expect(scenes()).toHaveLength(SPACE_END + 1);
  });

  it('puts the Sun two thirds along the rule and a human life within a hair of now', () => {
    expect(timeX(13.8)).toBe(-450);
    expect(timeX(0)).toBe(450);
    expect(timeX(4.6)).toBeCloseTo(150);
    expect(timeRule()).toContain('tm-lens');
  });

  it('keeps every stroke hairline at any zoom', () => {
    const markup = scenes().join('') + timeRule();
    const strokes = markup.match(/stroke="currentColor"/g) ?? [];
    const fixed = markup.match(/vector-effect="non-scaling-stroke"/g) ?? [];
    expect(strokes.length).toBeGreaterThan(20);
    expect(fixed.length).toBe(strokes.length);
  });
});

describe('cosmic plate component', () => {
  it('sits in the perspective section after the intro', () => {
    const at = view.indexOf('<section id="perspective"');
    expect(view.indexOf('{c.intro}', at)).toBeGreaterThan(at);
    expect(view.indexOf('<CosmicPlate copy={c} />', at)).toBeGreaterThan(view.indexOf('{c.intro}', at));
  });

  it('carries the address and deep time as a text legend under the plate', () => {
    expect(plate).toContain('<figcaption class="cosmic-legend">');
    expect(plate).toMatch(/captions\.map\(\(\[name, scale\]\)/);
    expect(plate).toMatch(/copy\.timescales\.map\(\(\[span, name\]\)/);
  });

  it('only grows the scroll track once the script is live, and stays still under reduced motion', () => {
    expect(plate).toMatch(/\.cosmic\[data-live\] \.cosmic-track \{ height: 560vh; \}/);
    expect(script).toContain("root.setAttribute('data-live', '')");
    expect(script).toMatch(/prefers-reduced-motion: reduce[\s\S]{0,120}paint\(STILL_Z\);\s*return;/);
  });

  it('touches only transforms and opacities while scrolling', () => {
    expect(script).toContain('requestAnimationFrame(update)');
    expect(script).toMatch(/addEventListener\('scroll', .*\{ passive: true \}\);/);
    expect(script).not.toMatch(/innerHTML/);
  });
});

describe('cosmos dictionary', () => {
  it.each([['en', en], ['es', es]] as const)('%s carries the plate copy', (_l, d) => {
    expect(d.cosmos.timescales).toHaveLength(6);
    expect(d.cosmos.address).toHaveLength(7);
    for (const key of ['kicker', 'intro', 'hint', 'us', 'usScale', 'coda', 'timelineTitle', 'addressTitle'] as const) {
      expect(d.cosmos[key].length).toBeGreaterThan(0);
    }
  });

  it('check-i18n parity holds', () => {
    expect(() => execFileSync('node', ['scripts/check-i18n.ts'], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();
  });
});
