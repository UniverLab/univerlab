/**
 * Tests for the ghScaff fondo (src/scripts/fondos/ghscaff.ts) — the scaffold
 * engraving traced by the cursor's lantern, drying slowly. Covers: registry
 * opt-in, loader wiring, asset base path, constants, tint, reduced-motion
 * behaviour, interactive subscription, and teardown.
 */
import { mount, tint, TILE_W, REST, MASK, BLUE, TRAIL_W, SHADOW_BLUR, DRY } from '../scripts/fondos/ghscaff';
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

const fakeContext = () => {
  let alpha = 1;
  const ctx: Record<string, unknown> = {
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    fillRect: jest.fn(),
    createPattern: jest.fn(),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineCap: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
  };
  Object.defineProperty(ctx, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => { alpha = v; },
    configurable: true,
  });
  return ctx;
};

describe('ghscaff fondo', () => {
  let ctx: ReturnType<typeof fakeContext>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext() as any);
    ctx = fakeContext();
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

  it('registers ghscaff as a fondo experiment', () => {
    expect(byId('ghscaff').fondo).toBe(true);
  });

  it('exposes a ghscaff loader in LiveBackground', () => {
    const src = readFileSync(resolve(__dirname, '..', 'scripts', 'fondos', 'index.ts'), 'utf8');
    expect(src).toMatch(/ghscaff:\s*\(\)\s*=>\s*import\(['"]\.\/ghscaff['"]\)/);
  });

  it('requests the andamio asset at opts.base + andamio.webp', async () => {
    mount(document.createElement('div'), { night: false, reduced: false, base: '/bench/fondos/ghscaff/' });
    await flush();
    expect(loadImage).toHaveBeenCalledWith('/bench/fondos/ghscaff/andamio.webp');
  });

  describe('constants', () => {
    it('TILE_W 900, REST 0.06, MASK 0.8', () => {
      expect(TILE_W).toBe(900);
      expect(REST).toBeCloseTo(0.06, 6);
      expect(MASK).toBeCloseTo(0.8, 6);
    });

    it('BLUE #70bede, TRAIL_W 90, SHADOW_BLUR 30, DRY 0.006', () => {
      expect(BLUE).toBe('#70bede');
      expect(TRAIL_W).toBe(90);
      expect(SHADOW_BLUR).toBe(30);
      expect(DRY).toBeCloseTo(0.006, 6);
    });
  });

  describe('tint', () => {
    it('source-in tints the image with the given colour', () => {
      const img = new Image() as any;
      Object.defineProperty(img, 'naturalWidth', { value: 10, writable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 8, writable: true });
      const k = fakeContext() as any;
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(k);
      const canvas = tint(img, '#70bede');
      expect(canvas.width).toBe(10);
      expect(canvas.height).toBe(8);
      expect(k.drawImage).toHaveBeenCalledWith(img, 0, 0);
      expect(k.fillStyle).toBe('#70bede');
      expect(k.fillRect).toHaveBeenCalledWith(0, 0, 10, 8);
      expect(k.globalCompositeOperation).toBe('source-in');
    });
  });

  describe('reduced motion', () => {
    it('attaches no pointer handler and no frame loop', () => {
      mount(document.createElement('div'), { night: false, reduced: true, base: '/bench/fondos/ghscaff/' });
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
      mount(host, { night: false, reduced: true, base: '/bench/fondos/ghscaff/' });
      await flush();
      expect(ctx.globalAlpha).toBeCloseTo(REST, 6);
      expect(ctx.fillRect).toHaveBeenCalled();
    });
  });

  describe('interactive (non-reduced)', () => {
    it('subscribes to pointer and starts the loop', () => {
      mount(document.createElement('div'), { night: false, reduced: false, base: '/bench/fondos/ghscaff/' });
      expect(pointerIn).toHaveBeenCalledTimes(1);
      expect(loop).toHaveBeenCalledTimes(1);
    });

    it('lantern strokes the trail and the frame masks the lit scaffold through it', async () => {
      const seen: HTMLCanvasElement[] = [];
      const ctxs = new Map<HTMLCanvasElement, ReturnType<typeof fakeContext>>();
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
        if (!ctxs.has(this)) {
          ctxs.set(this, fakeContext());
          seen.push(this);
        }
        return ctxs.get(this) as any;
      });
      mount(document.createElement('div'), { night: false, reduced: false, base: '/bench/fondos/ghscaff/' });
      await flush();
      const onMove = (pointerIn as jest.Mock).mock.calls[0][1];
      const frame = (loop as jest.Mock).mock.calls[0][1];
      onMove(10, 10);
      onMove(50, 50);
      frame();
      const [trail, , mix] = seen;
      const trailCtx = ctxs.get(trail) as any;
      expect(trailCtx.stroke).toHaveBeenCalled();
      expect(trailCtx.lineWidth).toBe(TRAIL_W);
      expect(trailCtx.fillStyle).toBe(`rgba(0,0,0,${DRY})`);
      expect(ctx.drawImage).toHaveBeenCalledWith(mix, 0, 0);
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
      const fondo = mount(host, { night: false, reduced: false, base: '/bench/fondos/ghscaff/' });
      expect(host.contains(canvas)).toBe(true);
      fondo.destroy();
      expect(unsub).toHaveBeenCalled();
      expect(stop).toHaveBeenCalled();
      expect(ro.disconnect).toHaveBeenCalled();
      expect(host.contains(canvas)).toBe(false);
    });
  });
});
