/**
 * Machine plates (src/lib/machines.ts + src/components/Machine.astro) — the
 * hero machine art. Astro components are not renderable in Jest, so these
 * read the sources as text (experiment-frame.test.ts style) and exercise the
 * manifest helpers directly.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plate, srcsetFor, plateSizes, machineInk } from '../lib/machines';
import { experiments, liveExperiments } from '../lib/experiments';

const MACHINE = readFileSync(resolve(__dirname, '../components/Machine.astro'), 'utf8');
const LAYOUT = readFileSync(resolve(__dirname, '../layouts/ExperimentLayout.astro'), 'utf8');

describe('machine plates: manifest helpers', () => {
  it('offers the 450 and 900 variants with manifest widths as w descriptors', () => {
    const canopyNight = srcsetFor('canopy', 'night', 'avif');
    expect(canopyNight).toContain('306w');
    expect(canopyNight).toContain('611w');
    expect(canopyNight).toMatch(/machines\/canopy-night-450\.avif 306w/);
    expect(canopyNight).toMatch(/machines\/canopy-night-900\.avif 611w/);
    expect(srcsetFor('gitkit', 'night', 'webp')).toContain('728w');
  });

  it('reserves the image box from the 450 px WebP entry', () => {
    expect(plate('quorum', 'day')).toEqual({ w: 392, h: 450 });
    expect(plate('canopy', 'night')).toEqual({ w: 306, h: 450 });
  });

  it('derives sizes from the plate aspect ratio at 240 and 150 px tall', () => {
    expect(plateSizes(plate('canopy', 'night'))).toBe('(min-width: 40rem) 163px, 102px');
    expect(plateSizes({ w: 392, h: 450 })).toBe('(min-width: 40rem) 209px, 131px');
  });
});

describe('machine plates: ink map', () => {
  it('inks each experiment for its surface', () => {
    const byId = Object.fromEntries(experiments.map((e) => [e.id, e]));
    expect(machineInk(byId.texforge)).toBe('day');
    expect(machineInk(byId.gitkit)).toBe('day');
    expect(machineInk(byId.canopy)).toBe('night');
    expect(machineInk(byId.ghscaff)).toBe('night');
    expect(machineInk(byId['astro-denoise'])).toBe('night');
    expect(machineInk(byId.demostage)).toBe('night');
    expect(machineInk(byId.quorum)).toBe('theme');
  });

  it('has both inks on disk for every live experiment', () => {
    for (const exp of liveExperiments) {
      for (const ink of ['day', 'night'] as const) {
        const p = plate(exp.id, ink);
        expect(p.w).toBeGreaterThan(0);
        expect(p.h).toBe(450);
        expect(srcsetFor(exp.id, ink, 'avif')).toContain('w');
        expect(srcsetFor(exp.id, ink, 'webp')).toContain('w');
      }
    }
  });
});

describe('machine plates: Machine.astro', () => {
  it('renders AVIF and WebP pictures with reserved boxes and async decoding', () => {
    expect(MACHINE).toContain('srcsetFor');
    expect(MACHINE).toContain('plateSizes');
    expect(MACHINE).toContain('type="image/avif"');
    expect(MACHINE).toContain('type="image/webp"');
    expect(MACHINE).toContain('decoding="async"');
    expect(MACHINE).toContain('alt=""');
    expect(MACHINE).toContain('fetchpriority');
    expect(MACHINE).toMatch(/loading=\{eager \? undefined : 'lazy'\}/);
  });

  it('swaps the inks on the bench theme like Postcard does', () => {
    expect(MACHINE).toContain("data-machine={ink}");
    expect(MACHINE).toContain('machine-day');
    expect(MACHINE).toContain('machine-night');
    expect(MACHINE).toContain("html[data-bench-theme='night'] .machine[data-machine='theme'] .machine-day");
    expect(MACHINE).toContain("html:not([data-bench-theme='night']) .machine[data-machine='theme'] .machine-night");
    expect(MACHINE).toContain('univerlab:themechange');
  });

  it('ships no recolouring: the plates are already inked for their ground', () => {
    expect(MACHINE).not.toContain('invert(');
    expect(MACHINE).not.toContain('mix-blend-mode');
    expect(MACHINE).not.toContain('contrast(');
    expect(LAYOUT).not.toContain('mix-blend-mode');
    expect(LAYOUT).not.toContain('invert(100%)');
  });

  it('centres the static phone plate and boxes it at 240/150 px tall', () => {
    expect(MACHINE).toContain('width: fit-content');
    expect(MACHINE).toContain('margin-inline: auto');
    expect(MACHINE).toMatch(/\.machine img \{ height: var\(--machine-h\)/);
    expect(MACHINE).toMatch(/@media \(max-width: 39\.999rem\) \{\s*\.machine img \{ height: 150px; \}/);
  });
});
