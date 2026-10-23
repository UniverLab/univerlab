/**
 * Tests for the GitKit fondo (src/scripts/fondos/gitkit.ts) — the trapiche's cane
 * field that sways (tips most, roots still) and turns pink where the cursor
 * lingers, drying slowly. Covers: registry opt-in, loader wiring, asset base
 * path, the 48-band / sway / bloom constants, reduced-motion behaviour, and
 * teardown.
 */
import { mount, tint, cover, BANDS, SWAY, BLOOM_RADIUS, BLOOM_ALPHA, DRY_ALPHA, COMPOSITE_ALPHA } from '../scripts/fondos/gitkit';
import { byId } from '../lib/experiments';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

jest.mock('../scripts/fondos/runtime', () => ({
  hostCanvas: jest.fn(),
  pointerIn: jest.fn(),
  loop: jest.fn(),
  loadImage: jest.fn(),
}));

import { hostCanvas, pointerIn, loop, loadImage } from '../scripts/fondos/runtime';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// jsdom has no canvas backend: every canvas the module creates gets its own fake 2D context.
const fakeContext = () => {
  let alpha = 1;
  const ctx: Record<string, unknown> = {
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    fillRect: jest.fn(),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createPattern: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    globalCompositeOperation: 'source-over',
    fillStyle: '',
  };
  Object.defineProperty(ctx, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => { alpha = v; },
    configurable: true,
  });
  return ctx;
};

describe('gitkit fondo', () => {
  let ctx: ReturnType<typeof fakeContext> & { drawImage: jest.Mock; globalAlpha: number; clearRect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext() as any);
    ctx = fakeContext() as any;
    (hostCanvas as jest.Mock).mockReturnValue({
      canvas: document.createElement('canvas'),
      ctx,
      size: () => ({ w: 100, h: 100, dpr: 1 }),
    });
    (loadImage as jest.Mock).mockResolvedValue({ naturalWidth: 200, naturalHeight: 150 });
    (pointerIn as jest.Mock).mockReturnValue(jest.fn());
    (loop as jest.Mock).mockReturnValue(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('registers gitkit as a fondo experiment', () => {
    expect(byId('gitkit').fondo).toBe(true);
  });

  it('exposes a gitkit loader in LiveBackground', () => {
    const src = readFileSync(resolve(__dirname, '..', 'scripts', 'fondos', 'index.ts'), 'utf8');
    expect(src).toMatch(/gitkit:\s*\(\)\s*=>\s*import\(['"]\.\/gitkit['"]\)/);
  });

  it('requests the cana asset at opts.base + cana.webp', async () => {
    mount(document.createElement('div'), { night: false, reduced: false, base: '/bench/fondos/gitkit/' });
    await flush();
    expect(loadImage).toHaveBeenCalledWith('/bench/fondos/gitkit/cana.webp');
  });

  describe('constant ports', () => {
    it('48 bands, SWAY 6', () => {
      expect(BANDS).toBe(48);
      expect(SWAY).toBe(6);
    });

    it('bloom radius 70, bloom alpha 0.12, dry destination-out 0.0025, composed at 0.85', () => {
      expect(BLOOM_RADIUS).toBe(70);
      expect(BLOOM_ALPHA).toBeCloseTo(0.12, 6);
      expect(DRY_ALPHA).toBeCloseTo(0.0025, 6);
      expect(COMPOSITE_ALPHA).toBeCloseTo(0.85, 6);
    });
  });

  describe('tint', () => {
    it('source-in tints the image with the given colour', () => {
      const img = new Image() as any;
      Object.defineProperty(img, 'naturalWidth', { value: 10, writable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 8, writable: true });
      const k = fakeContext() as any;
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(k);
      const canvas = tint(img, '#c13d9b');
      expect(canvas.width).toBe(10);
      expect(canvas.height).toBe(8);
      expect(k.drawImage).toHaveBeenCalledWith(img, 0, 0);
      expect(k.fillStyle).toBe('#c13d9b');
      expect(k.fillRect).toHaveBeenCalledWith(0, 0, 10, 8);
      expect(k.globalCompositeOperation).toBe('source-in');
    });
  });

  describe('cover', () => {
    it('returns the cover-rect [x, y, dw, dh]', () => {
      const img = { naturalWidth: 200, naturalHeight: 100 };
      const [x, y, dw, dh] = cover(img, 400, 300);
      // s = max(400/200, 300/100) = max(2, 3) = 3
      expect(dw).toBeCloseTo(600, 6);
      expect(dh).toBeCloseTo(300, 6);
      expect(x).toBeCloseTo((400 - 600) / 2, 6);
      expect(y).toBeCloseTo((300 - 300) / 2, 6);
    });
  });

  describe('reduced motion', () => {
    it('attaches no pointer handler and no frame loop', () => {
      mount(document.createElement('div'), { night: false, reduced: true, base: '/bench/fondos/gitkit/' });
      expect(pointerIn).not.toHaveBeenCalled();
      expect(loop).not.toHaveBeenCalled();
    });

    it('paints the still engraving once after the asset loads', async () => {
      const canvas = document.createElement('canvas');
      (hostCanvas as jest.Mock).mockReturnValue({
        canvas,
        ctx,
        size: () => ({ w: 100, h: 100, dpr: 1 }),
      });
      const host = document.createElement('div');
      document.body.appendChild(host);
      mount(host, { night: false, reduced: true, base: '/bench/fondos/gitkit/' });
      await flush();
      // cana drawn at BASE_ALPHA (0.2) via swayed
      expect(ctx.globalAlpha).toBe(0.2);
      // 48 bands → 48 drawImage calls for the field, and no bloom composite
      expect(ctx.drawImage).toHaveBeenCalledTimes(48);
    });
  });

  describe('interactive (non-reduced)', () => {
    it('subscribes to pointer and starts the loop', () => {
      mount(document.createElement('div'), { night: false, reduced: false, base: '/bench/fondos/gitkit/' });
      expect(pointerIn).toHaveBeenCalledTimes(1);
      expect(loop).toHaveBeenCalledTimes(1);
    });

    it('sways the field in 48 bands; tips move, roots stay', async () => {
      mount(document.createElement('div'), { night: false, reduced: false, base: '/bench/fondos/gitkit/' });
      await flush();
      const frameFn = (loop as jest.Mock).mock.calls[0][1];
      ctx.drawImage.mockClear();
      frameFn(1000);
      const [baseX] = cover({ naturalWidth: 200, naturalHeight: 150 }, 100, 100);
      const bands = ctx.drawImage.mock.calls.slice(0, BANDS);
      expect(bands).toHaveLength(BANDS);
      // drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh): the destination x is argument 5
      const tipShift = Math.abs(bands[0][5] - baseX);
      const rootShift = Math.abs(bands[BANDS - 1][5] - baseX);
      expect(tipShift).toBeGreaterThan(1);
      expect(rootShift).toBeLessThan(0.1);
    });

    it('composes the pink bloom at 0.85 on each frame', async () => {
      mount(document.createElement('div'), { night: false, reduced: false, base: '/bench/fondos/gitkit/' });
      await flush();
      const frameFn = (loop as jest.Mock).mock.calls[0][1];
      ctx.drawImage.mockClear();
      ctx.clearRect.mockClear();
      const alphaAtDraw: number[] = [];
      ctx.drawImage.mockImplementation(() => { alphaAtDraw.push(ctx.globalAlpha); });
      frameFn(1000);
      // clear once; 48 field bands on the host, then the mix composite (the pink copy goes to the mix canvas)
      expect(ctx.clearRect).toHaveBeenCalledTimes(1);
      expect(ctx.drawImage).toHaveBeenCalledTimes(BANDS + 1);
      expect(ctx.drawImage.mock.calls[BANDS][0]).toBeInstanceOf(HTMLCanvasElement);
      // the mix composite is drawn at COMPOSITE_ALPHA, not the field's BASE_ALPHA
      expect(alphaAtDraw[BANDS]).toBeCloseTo(COMPOSITE_ALPHA, 6);
      expect(alphaAtDraw[0]).toBeCloseTo(0.2, 6);
    });

    it('destroy unsubscribes pointer, stops loop, disconnects canvas RO, and removes canvases', () => {
      const unsub = jest.fn();
      const stop = jest.fn();
      (pointerIn as jest.Mock).mockReturnValue(unsub);
      (loop as jest.Mock).mockReturnValue(stop);
      const canvas = document.createElement('canvas') as any;
      const ro = { disconnect: jest.fn() };
      canvas.__ro = ro;
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.appendChild(canvas);
      (hostCanvas as jest.Mock).mockReturnValue({
        canvas,
        ctx,
        size: () => ({ w: 100, h: 100, dpr: 1 }),
      });
      const fondo = mount(host, { night: false, reduced: false, base: '/bench/fondos/gitkit/' });
      expect(host.contains(canvas)).toBe(true);
      fondo.destroy();
      expect(unsub).toHaveBeenCalled();
      expect(stop).toHaveBeenCalled();
      expect(ro.disconnect).toHaveBeenCalled();
      expect(host.contains(canvas)).toBe(false);
    });
  });
});
