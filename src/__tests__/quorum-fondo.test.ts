/**
 * Tests for the Quorum fondo: the golden tiling, the draughtsman's plate that
 * shows where the cursor has been, and the three demo peers' sparks. The
 * runtime is mocked; the tests drive the real pointer and frame callbacks and
 * read back what was drawn.
 */
import {
  mount,
  K,
  PEERS,
  BG_DAY,
  BG_NIGHT,
  TRACE_RADIUS,
  TRACE_DRY,
  PLATE_DAY,
  PLATE_NIGHT,
  SQUARE_COUNT,
} from '../scripts/fondos/quorum';
import { experiments } from '../lib/experiments';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

jest.mock('../scripts/fondos/runtime', () => ({
  hostCanvas: jest.fn(),
  pointerIn: jest.fn(),
  loop: jest.fn(),
  loadImage: jest.fn(),
}));

import { hostCanvas, pointerIn, loop } from '../scripts/fondos/runtime';

interface Draw { args: unknown[]; alpha: number }

const fakeContext = () => {
  const draws: Draw[] = [];
  const fillStyles: string[] = [];
  const ctx: Record<string, any> & { draws: Draw[]; fillStyles: string[] } = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineCap: 'butt',
    lineWidth: 1,
    strokeStyle: '',
    font: '',
    textBaseline: 'alphabetic',
    draws,
    fillStyles,
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    fillText: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    drawImage: jest.fn((...args: unknown[]) => {
      draws.push({ args, alpha: ctx.globalAlpha });
    }),
  };
  let fill = '';
  Object.defineProperty(ctx, 'fillStyle', {
    get: () => fill,
    set: (v: string) => {
      fill = v;
      fillStyles.push(v);
    },
  });
  return ctx;
};

describe('quorum fondo', () => {
  let ctx: ReturnType<typeof fakeContext>;
  let fondo: { setNight(n: boolean): void; destroy(): void } | null = null;
  let unsubPointer: jest.Mock;
  let stopLoop: jest.Mock;

  const mountFondo = (reduced = false, night = false, host = document.createElement('div')) => {
    document.body.appendChild(host);
    fondo = mount(host, { night, reduced, base: '/bench/fondos/quorum/' });
    return fondo;
  };

  // Frame callback the loop was handed, and the pointer's onMove.
  const frameCallback = () => (loop as jest.Mock).mock.calls[0][1] as (now: number) => void;
  const pointerMove = () => (pointerIn as jest.Mock).mock.calls[0][1] as (x: number, y: number) => void;

  // Paint one frame; return the ground colour it filled with (the first fillRect).
  const paintGround = () => {
    ctx.fillStyles.length = 0;
    ctx.fillRect.mockClear();
    frameCallback()(0);
    return ctx.fillRect.mock.calls.length > 0 ? ctx.fillStyles[0] : undefined;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = fakeContext();
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as any);
    (hostCanvas as jest.Mock).mockImplementation((host: HTMLElement) => {
      const canvas = document.createElement('canvas');
      host.appendChild(canvas);
      return { canvas, ctx, size: () => ({ w: 100, h: 100, dpr: 1 }) };
    });
    unsubPointer = jest.fn();
    stopLoop = jest.fn();
    (pointerIn as jest.Mock).mockReturnValue(unsubPointer);
    (loop as jest.Mock).mockReturnValue(stopLoop);
  });

  afterEach(() => {
    fondo?.destroy();
    fondo = null;
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('exports mount as a function', () => {
    expect(typeof mount).toBe('function');
  });

  it('keeps the approved geometry: K = ln(1.618) / (π/2), nine squares', () => {
    expect(K).toBeCloseTo(Math.log(1.618) / (Math.PI / 2), 12);
    expect(SQUARE_COUNT).toBe(9);
  });

  it('keeps the approved trace and plate constants', () => {
    expect(TRACE_RADIUS).toBe(150);
    expect(TRACE_DRY).toBe(0.008);
    expect(PLATE_NIGHT).toBe(0.45);
    expect(PLATE_DAY).toBe(0.55);
  });

  it('keeps the espresso and arena grounds', () => {
    expect(BG_NIGHT).toBe('#201a16');
    expect(BG_DAY).toBe('#ece7de');
  });

  it('seeds the three demo peers in order', () => {
    expect(PEERS.map((p) => p.id)).toEqual(['ada', 'kepler', 'noether']);
  });

  describe('phase', () => {
    it('paints the espresso ground at night and the arena ground by day', () => {
      mountFondo(false, true);
      expect(paintGround()).toBe(BG_NIGHT);
    });

    it('setNight switches the ground live', () => {
      mountFondo(false, true);
      fondo!.setNight(false);
      expect(paintGround()).toBe(BG_DAY);
      fondo!.setNight(true);
      expect(paintGround()).toBe(BG_NIGHT);
    });

    it('uses the plate alpha of its phase: 0.45 by night, 0.55 by day', () => {
      mountFondo(false, true);
      ctx.draws.length = 0;
      frameCallback()(0);
      const nightPlate = ctx.draws.filter((d) => d.args.length === 3 && d.alpha !== 1);
      expect(nightPlate.map((d) => d.alpha)).toEqual([PLATE_NIGHT]);

      fondo!.setNight(false);
      ctx.draws.length = 0;
      frameCallback()(0);
      const dayPlate = ctx.draws.filter((d) => d.args.length === 3 && d.alpha !== 1);
      expect(dayPlate.map((d) => d.alpha)).toEqual([PLATE_DAY]);
    });
  });

  describe('live path', () => {
    it('binds the pointer and starts the frame loop', () => {
      mountFondo();
      expect(pointerIn).toHaveBeenCalledTimes(1);
      expect(loop).toHaveBeenCalledTimes(1);
    });

    it('traces the cursor with a 150 px radial gradient', () => {
      mountFondo();
      pointerMove()(40, 60);
      expect(ctx.createRadialGradient).toHaveBeenCalledWith(40, 60, 0, 40, 60, TRACE_RADIUS);
    });

    it('dries the trace by TRACE_DRY each frame', () => {
      mountFondo();
      ctx.fillStyles.length = 0;
      frameCallback()(0);
      expect(ctx.fillStyles).toContain(`rgba(0,0,0,${TRACE_DRY})`);
    });
  });

  describe('reduced motion', () => {
    it('paints one still engraving and attaches no pointer handler or frame loop', () => {
      mountFondo(true, true);
      expect(pointerIn).not.toHaveBeenCalled();
      expect(loop).not.toHaveBeenCalled();
      expect(ctx.fillStyles[0]).toBe(BG_NIGHT);
      expect(ctx.stroke).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('unsubscribes the pointer, stops the loop and removes its canvas', () => {
      const host = document.createElement('div');
      mountFondo(false, true, host);
      const canvas = host.querySelector('canvas')!;
      fondo!.destroy();
      fondo = null;
      expect(unsubPointer).toHaveBeenCalledTimes(1);
      expect(stopLoop).toHaveBeenCalledTimes(1);
      expect(canvas.isConnected).toBe(false);
    });
  });

  it('is wired into LiveBackground under the quorum id, with a theme observer and pagehide cleanup', () => {
    const src = readFileSync(resolve(__dirname, '..', 'components', 'LiveBackground.astro'), 'utf8');
    expect(src).toMatch(/quorum:\s*\(\)\s*=>\s*import\(['"]\.\.\/scripts\/fondos\/quorum['"]\)/);
    expect(src).toMatch(/new MutationObserver\(/);
    expect(src).toMatch(/attributeFilter:\s*\['data-bench-theme'\]/);
    expect(src).toMatch(/window\.addEventListener\('pagehide', onPageHide\)/);
  });

  it('is flagged as a fondo experiment', () => {
    const quorum = experiments.find((e) => e.id === 'quorum');
    expect(quorum?.fondo).toBe(true);
  });
});
