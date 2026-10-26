/**
 * Tests for the DemoStage fondo: the Muybridge film strip that advances with
 * cursor travel. The runtime is mocked; the tests drive the real pointer and
 * frame callbacks and read back what was drawn.
 */
import { mount, tint, makeGrain, FRAMES, STEP_PX, ACCENT } from '../scripts/fondos/demostage';
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

const BASE = '/bench/fondos/demostage/';
const FRAME_W = 30; // 330px strip / 11 frames
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

interface Draw { args: unknown[]; alpha: number }

const fakeContext = () => {
  const draws: Draw[] = [];
  const ctx: Record<string, any> & { draws: Draw[] } = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    draws,
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    putImageData: jest.fn(),
    createImageData: jest.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })),
    drawImage: jest.fn((...args: unknown[]) => {
      draws.push({ args, alpha: ctx.globalAlpha });
    }),
  };
  return ctx;
};

describe('demostage fondo', () => {
  let ctx: ReturnType<typeof fakeContext>;
  let fondo: { destroy(): void } | null = null;

  const sheet = { naturalWidth: FRAMES * FRAME_W, naturalHeight: 30 };

  const mountFondo = (reduced = false, host = document.createElement('div')) => {
    fondo = mount(host, { night: false, reduced, base: BASE });
    return fondo;
  };

  // Frame callback the loop was handed, and the pointer's onMove/onLeave.
  const frameCallback = () => (loop as jest.Mock).mock.calls[0][1] as () => void;
  const pointer = () => ({
    move: (pointerIn as jest.Mock).mock.calls[0][1] as (x: number, y: number) => void,
    leave: (pointerIn as jest.Mock).mock.calls[0][2] as () => void,
  });

  // Paint one frame and return the strip cells drawn at full (active) alpha.
  const paintActive = () => {
    ctx.draws.length = 0;
    frameCallback()();
    return ctx.draws.filter((d) => d.alpha === 0.85 && d.args.length === 9);
  };
  const activeSourceX = () => paintActive()[0].args[1] as number;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = fakeContext();
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as any);
    (hostCanvas as jest.Mock).mockImplementation(() => ({
      canvas: document.createElement('canvas'),
      ctx,
      size: () => ({ w: 100, h: 100, dpr: 1 }),
    }));
    (loadImage as jest.Mock).mockResolvedValue(sheet);
    (pointerIn as jest.Mock).mockReturnValue(jest.fn());
    (loop as jest.Mock).mockReturnValue(jest.fn());
  });

  afterEach(() => {
    fondo?.destroy();
    fondo = null;
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('requests the galope strip at opts.base + galope.webp', async () => {
    mountFondo();
    await flush();
    expect(loadImage).toHaveBeenCalledWith(BASE + 'galope.webp');
  });

  it('is wired into LiveBackground under the demostage id', () => {
    const src = readFileSync(resolve(__dirname, '..', 'scripts', 'fondos', 'index.ts'), 'utf8');
    expect(src).toMatch(/demostage:\s*\(\)\s*=>\s*import\(['"]\.\/demostage['"]\)/);
  });

  it('keeps the approved constants: 11 frames, 70 px per frame, vermilion accent', () => {
    expect(FRAMES).toBe(11);
    expect(STEP_PX).toBe(70);
    expect(ACCENT).toBe('#e7654b');
  });

  describe('cursor travel', () => {
    it('holds the first frame for the first 69 px of travel', async () => {
      mountFondo();
      await flush();
      const p = pointer();
      p.move(0, 0);
      p.move(69, 0);
      expect(activeSourceX()).toBe(0);
    });

    it('advances one frame at 70 px, accumulating travel across moves', async () => {
      mountFondo();
      await flush();
      const p = pointer();
      p.move(0, 0);
      p.move(40, 0);
      p.move(80, 0);
      expect(activeSourceX()).toBe(FRAME_W);
    });

    it('measures Euclidean distance, not the x-axis alone', async () => {
      mountFondo();
      await flush();
      const p = pointer();
      p.move(0, 0);
      p.move(42, 56); // hypot = 70
      expect(activeSourceX()).toBe(FRAME_W);
    });

    it('wraps back to the first frame after the eleventh step', async () => {
      mountFondo();
      await flush();
      const p = pointer();
      p.move(0, 0);
      p.move(700, 0);
      expect(activeSourceX()).toBe(10 * FRAME_W);
      p.move(770, 0);
      expect(activeSourceX()).toBe(0);
    });

    it('does not count the jump back in after the pointer leaves the host', async () => {
      mountFondo();
      await flush();
      const p = pointer();
      p.move(0, 0);
      p.leave();
      p.move(500, 0);
      expect(activeSourceX()).toBe(0);
    });

    it('does not count the jump to a pressed point', async () => {
      mountFondo();
      await flush();
      const p = pointer();
      p.move(0, 0);
      window.dispatchEvent(new Event('pointerdown'));
      p.move(500, 0);
      expect(activeSourceX()).toBe(0);
    });
  });

  describe('layout', () => {
    it('lays the 11-frame strip 16 px above the bottom, the active cell at 0.85', async () => {
      mountFondo();
      await flush();
      const active = paintActive();
      const cell = Math.min(100 - 24, 980) / FRAMES;
      expect(active).toHaveLength(1);
      expect(ctx.draws.filter((d) => d.args.length === 9 && d.alpha === 0.14)).toHaveLength(FRAMES - 1);
      // drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh): the cell is `cell` tall (30 px frames)
      expect(active[0].args[6]).toBeCloseTo(100 - cell - 16);
      expect(active[0].args[7]).toBeCloseTo(cell - 3);
    });
  });

  describe('reduced motion', () => {
    it('attaches no pointer handler and no frame loop', async () => {
      mountFondo(true);
      await flush();
      expect(pointerIn).not.toHaveBeenCalled();
      expect(loop).not.toHaveBeenCalled();
    });

    it('paints the still engraving once: one large frame and eleven strip cells', async () => {
      mountFondo(true);
      await flush();
      const scene = ctx.draws.filter((d) => d.args.length === 9);
      expect(scene).toHaveLength(1 + FRAMES);
      expect(loop).not.toHaveBeenCalled();
    });
  });

  describe('interactive', () => {
    it('subscribes to pointer and starts the frame loop', () => {
      mountFondo();
      expect(pointerIn).toHaveBeenCalledTimes(1);
      expect(loop).toHaveBeenCalledTimes(1);
    });

    it('destroy unsubscribes, stops the loop, removes the canvas and the pointerdown listener', () => {
      const unsub = jest.fn();
      const stop = jest.fn();
      (pointerIn as jest.Mock).mockReturnValue(unsub);
      (loop as jest.Mock).mockReturnValue(stop);
      const removeSpy = jest.spyOn(window, 'removeEventListener');
      const canvas = document.createElement('canvas') as any;
      const ro = { disconnect: jest.fn() };
      canvas.__ro = ro;
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.appendChild(canvas);
      (hostCanvas as jest.Mock).mockReturnValue({ canvas, ctx, size: () => ({ w: 100, h: 100, dpr: 1 }) });

      mountFondo(false, host);
      expect(host.contains(canvas)).toBe(true);
      fondo!.destroy();
      fondo = null;

      expect(unsub).toHaveBeenCalled();
      expect(stop).toHaveBeenCalled();
      expect(ro.disconnect).toHaveBeenCalled();
      expect(host.contains(canvas)).toBe(false);
      expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    });
  });

  describe('tint', () => {
    it('source-in tints the strip with the given colour', () => {
      const img = { naturalWidth: 10, naturalHeight: 8 } as HTMLImageElement;
      const canvas = tint(img, '#e7654b');
      expect(canvas.width).toBe(10);
      expect(canvas.height).toBe(8);
      expect(ctx.fillStyle).toBe('#e7654b');
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 10, 8);
      expect(ctx.globalCompositeOperation).toBe('source-in');
    });
  });

  describe('makeGrain', () => {
    it('creates a 192x192 random grey tile', () => {
      const grain = makeGrain();
      expect(grain.width).toBe(192);
      expect(grain.height).toBe(192);
      expect(ctx.putImageData).toHaveBeenCalledTimes(1);
    });
  });

  describe('credit line', () => {
    it('is bilingual, in the demostage experiment dictionary', () => {
      expect(en.experiments['demostage'].bgCredit).toBe(
        'Background: Eadweard Muybridge, The Horse in Motion, 1878 (public domain).',
      );
      expect(es.experiments['demostage'].bgCredit).toBe(
        'Fondo: Eadweard Muybridge, The Horse in Motion, 1878 (dominio público).',
      );
    });
  });
});
