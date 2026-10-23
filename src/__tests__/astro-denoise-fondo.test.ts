import { mount, tint, rho, STOPS, POLE, TURN_DEG_PER_S, PAN, EASE } from '../scripts/fondos/astro-denoise';
import { experiments } from '../lib/experiments';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

jest.mock('../scripts/fondos/runtime', () => ({
  hostCanvas: jest.fn(),
  pointerIn: jest.fn(),
  loop: jest.fn(),
  loadImage: jest.fn(),
}));

import { hostCanvas, pointerIn, loop, loadImage } from '../scripts/fondos/runtime';

const BASE = '/bench/fondos/astro-denoise/';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const fakeContext = () => {
  const draws: any[] = [];
  const ctx: Record<string, any> & { draws: any[] } = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    draws,
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    arc: jest.fn(),
    beginPath: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    setLineDash: jest.fn(),
    drawImage: jest.fn((...args: unknown[]) => {
      draws.push({ args, alpha: ctx.globalAlpha });
    }),
  };
  return ctx;
};

describe('astro-denoise fondo', () => {
  let ctx: ReturnType<typeof fakeContext>;
  let fondo: { destroy(): void } | null = null;

  const mountFondo = (reduced = false, host = document.createElement('div')) => {
    fondo = mount(host, { night: false, reduced, base: BASE });
    return fondo;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = fakeContext();
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as any);
    (hostCanvas as jest.Mock).mockImplementation(() => ({
      canvas: document.createElement('canvas'),
      ctx,
      size: () => ({ w: 100, h: 100, dpr: 1 }),
    }));
    (loadImage as jest.Mock).mockResolvedValue({ naturalWidth: 10, naturalHeight: 10 } as any);
    (pointerIn as jest.Mock).mockReturnValue(jest.fn());
    (loop as jest.Mock).mockReturnValue(jest.fn());
    (global as any).fetch = jest.fn().mockResolvedValue({ json: async () => [] });
  });

  afterEach(() => {
    fondo?.destroy();
    fondo = null;
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('is wired into LiveBackground under the astro-denoise id', () => {
    const src = readFileSync(resolve(__dirname, '..', 'components', 'LiveBackground.astro'), 'utf8');
    expect(src).toMatch(/['"]astro-denoise['"]:\s*\(\)\s*=>\s*import\(['"]\.\.\/scripts\/fondos\/astro-denoise['"]\)/);
  });

  it('opts into the live fondo in the registry', () => {
    const exp = experiments.find((e) => e.id === 'astro-denoise');
    expect(exp?.fondo).toBe(true);
  });

  it('keeps the approved constants', () => {
    expect(TURN_DEG_PER_S).toBe(0.3);
    expect(PAN).toBe(0.06);
    expect(EASE).toBe(0.04);
    expect(POLE).toEqual({ x: 0.6, y: 0.3 });
  });

  it('tints by B-V on the aged ramp', () => {
    expect(tint(-0.3)).toBe('rgb(196,210,245)');
    expect(tint(2)).toBe('rgb(226,168,122)');
  });

  it('rho decreases as declination increases', () => {
    expect(rho(-30)).toBeGreaterThan(rho(0));
  });

  it('interactive subscribes to pointer and starts the frame loop', () => {
    mountFondo();
    expect(pointerIn).toHaveBeenCalledTimes(1);
    expect(loop).toHaveBeenCalledTimes(1);
  });

  it('reduced mount registers no pointerIn/loop', () => {
    mountFondo(true);
    expect(pointerIn).not.toHaveBeenCalled();
    expect(loop).not.toHaveBeenCalled();
  });

  describe('credit line', () => {
    it('is bilingual, in the astro-denoise experiment dictionary', () => {
      expect(en.experiments['astro-denoise'].bgCredit).toBe(
        'Star chart: Yale Bright Star Catalogue (CDS V/50); constellation lines from d3-celestial by Olaf Frohn (BSD-3-Clause).',
      );
      expect(es.experiments['astro-denoise'].bgCredit).toBe(
        'Carta celeste: Yale Bright Star Catalogue (CDS V/50); líneas de constelaciones de d3-celestial, de Olaf Frohn (BSD-3-Clause).',
      );
    });
  });
});
