/**
 * Tests for the texforge fondo (src/scripts/fondos/texforge.ts) — the type
 * case faint at rest behind a radial mask, inked garnet by the cursor roller.
 * Covers: constants, rest layer opacity/tile/mask, narrow-viewport retile on
 * resize, reduced-motion behaviour and teardown, roller trail and ink alpha.
 */
import { mount, TILE_W, TILE_W_NARROW, REST_OPACITY, INK_ALPHA, TRAIL_ALPHA, DRY, ROLLER, MASK } from '../scripts/fondos/texforge';
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

describe('texforge fondo', () => {
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
    (loadImage as jest.Mock).mockResolvedValue({ naturalWidth: 960, naturalHeight: 517 });
    (pointerIn as jest.Mock).mockReturnValue(jest.fn());
    (loop as jest.Mock).mockReturnValue(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('constants', () => {
    it('TILE_W 1180, TILE_W_NARROW 760, REST_OPACITY 0.05', () => {
      expect(TILE_W).toBe(1180);
      expect(TILE_W_NARROW).toBe(760);
      expect(REST_OPACITY).toBeCloseTo(0.05, 6);
    });

    it('INK_ALPHA 0.5, TRAIL_ALPHA 0.32, DRY 0.018, ROLLER 48', () => {
      expect(INK_ALPHA).toBeCloseTo(0.5, 6);
      expect(TRAIL_ALPHA).toBeCloseTo(0.32, 6);
      expect(DRY).toBeCloseTo(0.018, 6);
      expect(ROLLER).toBe(48);
    });
  });

  describe('rest layer', () => {
    it('mounts a faint masked case frame at the desktop tile size', () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      mount(host, { night: false, reduced: true, base: '/bench/fondos/texforge/' });
      const caseEl = host.firstElementChild as HTMLElement;
      expect(caseEl.style.opacity).toBe('0.05');
      expect(caseEl.style.backgroundSize).toBe('1180px auto');
      expect(caseEl.style.getPropertyValue('mask-image')).toBe(MASK);
    });

    it('sets the -webkit- mask prefix in source (jsdom drops prefixed properties)', () => {
      const src = readFileSync(resolve(__dirname, '..', 'scripts', 'fondos', 'texforge.ts'), 'utf8');
      expect(src).toContain('-webkit-mask-image');
    });

    it('retiles to the narrow width on resize under 40rem', () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      Object.defineProperty(window, 'matchMedia', {
        value: jest.fn(() => ({ matches: true })),
        configurable: true,
      });
      const fondo = mount(host, { night: false, reduced: true, base: '/bench/fondos/texforge/' });
      window.dispatchEvent(new Event('resize'));
      expect((host.firstElementChild as HTMLElement).style.backgroundSize).toBe('760px auto');
      fondo.destroy();
      delete (window as any).matchMedia;
    });
  });

  describe('reduced motion', () => {
    it('attaches no pointer handler and no frame loop', () => {
      mount(document.createElement('div'), { night: false, reduced: true, base: '/bench/fondos/texforge/' });
      expect(pointerIn).not.toHaveBeenCalled();
      expect(loop).not.toHaveBeenCalled();
    });

    it('destroy removes the rest layer and its resize listener', () => {
      const removeSpy = jest.spyOn(window, 'removeEventListener');
      const host = document.createElement('div');
      document.body.appendChild(host);
      const fondo = mount(host, { night: false, reduced: true, base: '/bench/fondos/texforge/' });
      expect(host.childElementCount).toBe(1);
      fondo.destroy();
      expect(host.childElementCount).toBe(0);
      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });
  });

  describe('interactive (non-reduced)', () => {
    it('roller strokes the trail and the frame inks garnet through it', async () => {
      const ctxs = new Map<HTMLCanvasElement, ReturnType<typeof fakeContext>>();
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
        if (!ctxs.has(this)) ctxs.set(this, fakeContext());
        return ctxs.get(this) as any;
      });
      const seenAlphas: number[] = [];
      (ctx.drawImage as jest.Mock).mockImplementation(() => {
        seenAlphas.push((ctx as any).globalAlpha);
      });
      mount(document.createElement('div'), { night: false, reduced: false, base: '/bench/fondos/texforge/' });
      await flush();
      const onMove = (pointerIn as jest.Mock).mock.calls[0][1];
      const frame = (loop as jest.Mock).mock.calls[0][1];
      onMove(10, 10);
      onMove(50, 50);
      frame();
      const trailCtx = [...ctxs.values()][0] as any;
      expect(trailCtx.stroke).toHaveBeenCalled();
      expect(trailCtx.strokeStyle).toBe('rgba(0,0,0,0.32)');
      expect(trailCtx.lineWidth).toBe(48);
      expect(seenAlphas[0]).toBeCloseTo(0.5, 6);
    });

    it('destroy removes the resize listener and the rest layer', () => {
      const removeSpy = jest.spyOn(window, 'removeEventListener');
      const host = document.createElement('div');
      document.body.appendChild(host);
      const fondo = mount(host, { night: false, reduced: false, base: '/bench/fondos/texforge/' });
      fondo.destroy();
      expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(host.querySelector('div')).toBeNull();
    });
  });
});
