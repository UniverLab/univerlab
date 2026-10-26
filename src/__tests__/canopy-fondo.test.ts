import { stepCells, ON, DYING, MASK } from '../scripts/fondos/canopy';
import { byId } from '../lib/experiments';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('canopy fondo', () => {
  describe('stepCells', () => {
    it('turns ON cells into DYING', () => {
      const cells = [{ n: [] as number[] }];
      const state = new Uint8Array([ON]);
      const next = new Uint8Array(1);
      stepCells(state, next, cells, () => 0);
      expect(next[0]).toBe(DYING);
    });

    it('turns DYING cells OFF', () => {
      const cells = [{ n: [] as number[] }];
      const state = new Uint8Array([DYING]);
      const next = new Uint8Array(1);
      stepCells(state, next, cells, () => 0);
      expect(next[0]).toBe(0);
    });

    it('births an OFF cell with exactly 2 ON neighbours when rand < BIRTH', () => {
      const cells = [{ n: [1, 2] }, { n: [] as number[] }, { n: [] as number[] }];
      const state = new Uint8Array([0, ON, ON]);
      const next = new Uint8Array(3);
      stepCells(state, next, cells, () => 0);
      expect(next[0]).toBe(ON);
    });

    it('does not birth when rand >= BIRTH', () => {
      const cells = [{ n: [1, 2] }, { n: [] as number[] }, { n: [] as number[] }];
      const state = new Uint8Array([0, ON, ON]);
      const next = new Uint8Array(3);
      stepCells(state, next, cells, () => 0.99);
      expect(next[0]).toBe(0);
    });

    it('does not birth with 1 ON neighbour', () => {
      const cells = [{ n: [1, 2] }, { n: [] as number[] }, { n: [] as number[] }];
      const state = new Uint8Array([0, ON, 0]);
      const next = new Uint8Array(3);
      stepCells(state, next, cells, () => 0);
      expect(next[0]).toBe(0);
    });

    it('does not birth with 3 ON neighbours', () => {
      const cells = [{ n: [1, 2, 3] }, { n: [] as number[] }, { n: [] as number[] }, { n: [] as number[] }];
      const state = new Uint8Array([0, ON, ON, ON]);
      const next = new Uint8Array(4);
      stepCells(state, next, cells, () => 0);
      expect(next[0]).toBe(0);
    });
  });

  it('registers canopy as a fondo experiment', () => {
    expect(byId('canopy').fondo).toBe(true);
  });

  it('LiveBackground exposes a canopy loader', () => {
    const src = readFileSync(resolve(__dirname, '..', 'scripts', 'fondos', 'index.ts'), 'utf8');
    expect(src).toMatch(/canopy:\s*\(\)\s*=>\s*import\(['"]\.\/canopy['"]\)/);
  });

  it('masks the reading column clean on its case element', () => {
    expect(MASK).toBe('radial-gradient(ellipse 66% 76% at 50% 44%, transparent 0 38%, #000 88%)');
    const src = readFileSync(resolve(__dirname, '..', 'scripts', 'fondos', 'canopy.ts'), 'utf8');
    expect(src).toMatch(/canvas\.style\.setProperty\('mask-image', MASK\)/);
    expect(src).toContain('-webkit-mask-image');
    // The animated layer carries the same mask as the still comb.
    expect(src).toMatch(/layer\.style\.setProperty\('mask-image', MASK\)/);
  });

  it('keeps full-screen canvas work out of the animation frame', () => {
    // Measured on a 4x-throttled phone: a canvas blur filter (20ms) and a
    // full-screen 'lighter' drawImage (15ms) per frame held the page at 12fps.
    const src = readFileSync(resolve(__dirname, '..', 'scripts', 'fondos', 'canopy.ts'), 'utf8');
    expect(src).not.toMatch(/\.filter = 'blur/);
    expect(src).not.toMatch(/globalCompositeOperation = 'lighter'/);
    expect(src).toContain("glow.style.mixBlendMode = 'plus-lighter'");
    expect(src).toMatch(/if \(now - lastDraw < DRAW_MS\) return;/);
  });
});
