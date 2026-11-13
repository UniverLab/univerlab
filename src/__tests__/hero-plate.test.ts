/**
 * Hero plate (src/components/HeroPlate.astro) — the engraved machine behind
 * the experiment hero. Astro components are not renderable in Jest, so these
 * read the sources as text (machine-plate.test.ts style) and exercise the
 * manifest helpers directly.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plateMask, plateTuning } from '../lib/machines';
import { experiments } from '../lib/experiments';

const LAYOUT = readFileSync(resolve(__dirname, '../layouts/ExperimentLayout.astro'), 'utf8');
const PLATE = readFileSync(resolve(__dirname, '../components/HeroPlate.astro'), 'utf8');

describe('hero plate: mask helper', () => {
  it('plateMask finds the silhouette in the manifest', () => {
    expect(plateMask('canopy', 'night')).toBe('/bench/machines/canopy-night-mask-450.webp');
    expect(() => plateMask('cadspec', 'day')).toThrow(/Unknown machine mask/);
  });

  it('every live hero plate has both silhouettes', () => {
    const plates = experiments.filter((e) => e.status !== 'archived');
    expect(plates.length).toBeGreaterThan(0);
    for (const e of plates) {
      expect(() => plateMask(e.id, 'day')).not.toThrow();
      expect(() => plateMask(e.id, 'night')).not.toThrow();
    }
  });
});

describe('hero plate: layout wiring', () => {
  it('the layout sets the plate behind the hero with no floating machine', () => {
    expect(LAYOUT).toContain('<HeroPlate');
    expect(LAYOUT).toContain('.hero-frame > .hero { position: relative; z-index: 1; }');
    expect(LAYOUT).not.toContain('hero-machine');
  });
});

describe('hero plate: ground and light', () => {
  it('the plate hides the background and lights up under the pointer', () => {
    expect(PLATE).toContain('background: var(--bg)');
    expect(PLATE).toContain('var(--hp-mask)');
    expect(PLATE).toContain('pointerIn(');
    expect(PLATE).toContain('prefers-reduced-motion');
    expect(PLATE).toContain('var(--essence)');
  });
});

describe('hero plate: aspect-ratio geometry', () => {
  it('sizes the plate from its own ratio, never by stretching the box', () => {
    expect(PLATE).toContain('container-type: inline-size');
    expect(PLATE).toContain('--hp-wcap: 58cqw');
    expect(PLATE).toContain('calc(var(--hp-wcap) * var(--hp-inv))');
    expect(PLATE).toContain('--hp-inv:');
    expect(PLATE).toContain('center / contain');
    expect(PLATE).toContain('z-index: -1');
    expect(PLATE).not.toContain('max-width: 58%');
    expect(PLATE).not.toContain('100% 100% no-repeat');
  });

  it('caps the narrow plate in viewport units', () => {
    expect(PLATE).toContain('--hp-wcap: 88vw');
  });

  it('tunes astro-denoise lower and stronger, nothing else', () => {
    expect(plateTuning({ id: 'astro-denoise' })).toEqual({ offset: '1.25rem', alpha: '0.55' });
    expect(plateTuning({ id: 'canopy' })).toEqual({});
    expect(plateTuning({ id: 'facetmedia' })).toEqual({});
  });

  it('renders the plate inside the hero as its first child', () => {
    expect(LAYOUT.indexOf('<HeroPlate')).toBeGreaterThan(LAYOUT.indexOf('class="wrap hero"'));
    expect(LAYOUT).toContain('offset={tuning.offset}');
    expect(LAYOUT).toContain('alpha={tuning.alpha}');
  });
});

describe('hero plate: gitkit readability veil', () => {
  it('backs the gitkit hero text with a fading ground-coloured veil', () => {
    expect(PLATE).toContain("id === 'gitkit'");
    expect(PLATE).toContain('hp-veil');
    expect(PLATE).toContain('--hp-wcap: 46cqw');
    expect(PLATE).toContain('ellipse 50% 85%');
    expect(PLATE).toContain('var(--bg)');
    expect(PLATE).toContain('transparent 75%');
    expect(PLATE).toContain('.hero-plate.gitkit');
    expect(PLATE).toContain('ellipse 85% 90%');
  });
});

describe('hero plate: column geometry and soft light', () => {
  it('lives inside the content column with small elliptical masks', () => {
    expect(PLATE).toContain('max-width: 72rem');
    expect(PLATE).toContain('margin-inline: auto');
    expect(PLATE).toContain('ellipse 150px 120px');
    expect(PLATE).toContain('ellipse 90px 70px');
    expect(PLATE).not.toContain('circle 230px');
    expect(PLATE).not.toContain('circle 140px');
  });
});
