/**
 * Tests for the facetMedia fondo: the faceting lap turning behind the page,
 * with a 24-edge gem cut where the cursor rests. The runtime is mocked; the
 * tests drive the real pointer and frame callbacks and read back what was
 * drawn.
 */
import {
  mount,
  gemEdges,
  BONE,
  SIGNAL,
  EDGES,
  REST_MS,
  EDGE_MS,
  GEM_R,
  NOISE_MS,
  NOISE_ALPHA,
  SPIN,
} from '../scripts/fondos/facetmedia';
import { fondoLoaders } from '../scripts/fondos/index';

jest.mock('../scripts/fondos/runtime', () => ({
  hostCanvas: jest.fn(),
  pointerIn: jest.fn(),
  loop: jest.fn(),
}));

import { hostCanvas, pointerIn, loop } from '../scripts/fondos/runtime';

const fakeContext = () => {
  const strokeLog: string[] = [];
  const textCalls: string[] = [];
  const moves: number[][] = [];
  let stroke = '';
  const ctx: Record<string, any> & {
    strokeLog: string[];
    textCalls: string[];
    moves: number[][];
  } = {
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    imageSmoothingEnabled: true,
    lineWidth: 1,
    strokeLog,
    textCalls,
    moves,
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    stroke: jest.fn(),
    arc: jest.fn(),
    moveTo: jest.fn((x: number, y: number) => {
      moves.push([x, y]);
    }),
    lineTo: jest.fn(),
    fillText: jest.fn((t: string) => {
      textCalls.push(t);
    }),
    createImageData: jest.fn((w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
    putImageData: jest.fn(),
    drawImage: jest.fn(),
  };
  Object.defineProperty(ctx, 'strokeStyle', {
    get: () => stroke,
    set: (v: string) => {
      stroke = v;
      strokeLog.push(v);
    },
    configurable: true,
  });
  return ctx;
};

describe('facetmedia fondo', () => {
  let ctx: ReturnType<typeof fakeContext>;
  let fondo: { destroy(): void } | null = null;

  const mountFondo = (reduced = false, host = document.createElement('div')) => {
    fondo = mount(host, { night: false, reduced, base: '' });
    return fondo;
  };

  // Frame callback and pointer handlers from the most recent mount.
  const frameOf = () =>
    (loop as jest.Mock).mock.calls[(loop as jest.Mock).mock.calls.length - 1][1] as (
      now: number,
    ) => void;
  const pointerOf = () => {
    const calls = (pointerIn as jest.Mock).mock.calls;
    const lastCall = calls[calls.length - 1];
    return {
      move: lastCall[1] as (x: number, y: number) => void,
      leave: lastCall[2] as () => void,
    };
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
    (pointerIn as jest.Mock).mockReturnValue(jest.fn());
    (loop as jest.Mock).mockReturnValue(jest.fn());
  });

  afterEach(() => {
    fondo?.destroy();
    fondo = null;
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps the approved constants', () => {
    expect(BONE).toBe('#e7ded1');
    expect(SIGNAL).toBe('#e8c547');
    expect(EDGES).toBe(24);
    expect(REST_MS).toBe(250);
    expect(EDGE_MS).toBe(90);
    expect(GEM_R).toBe(44);
    expect(NOISE_MS).toBe(90);
    expect(NOISE_ALPHA).toBe(0.085);
    expect(SPIN).toBe(0.00004);
  });

  it('gemEdges gives 24 segments: girdle, spokes, table', () => {
    const x = 300;
    const y = 200;
    const r = 44;
    const segs = gemEdges(x, y, r);
    expect(segs).toHaveLength(24);
    const dist = (p: [number, number]) => Math.hypot(p[0] - x, p[1] - y);
    for (let k = 0; k < 8; k++) {
      expect(dist(segs[k][0])).toBeCloseTo(r, 9);
      expect(dist(segs[k][1])).toBeCloseTo(r, 9);
    }
    for (let k = 8; k < 16; k++) {
      expect(dist(segs[k][0])).toBeCloseTo(r, 9);
      expect(dist(segs[k][1])).toBeCloseTo(r / 2, 9);
    }
    for (let k = 16; k < 24; k++) {
      expect(dist(segs[k][0])).toBeCloseTo(r / 2, 9);
      expect(dist(segs[k][1])).toBeCloseTo(r / 2, 9);
    }
  });

  it('a resting cursor cuts a full gem that turns yellow', () => {
    mountFondo();
    const p = pointerOf();
    const frame = frameOf();
    p.move(300, 200);
    for (let t = 0; t <= REST_MS + EDGES * EDGE_MS + 200; t += 10) frame(t);
    expect(ctx.strokeLog[ctx.strokeLog.length - 1]).toBe(SIGNAL);
    expect(ctx.textCalls[ctx.textCalls.length - 1]).toBe('24/24 ✓');
  });

  it('moving restarts the gem', () => {
    mountFondo();
    const p = pointerOf();
    const frame = frameOf();
    p.move(300, 200);
    let t = 0;
    for (; t <= REST_MS + EDGES * EDGE_MS + 200; t += 10) frame(t);
    expect(ctx.textCalls[ctx.textCalls.length - 1]).toBe('24/24 ✓');
    ctx.strokeLog.length = 0;
    ctx.textCalls.length = 0;
    p.move(320, 200);
    frame(t + 16);
    const lastText = ctx.textCalls[ctx.textCalls.length - 1];
    expect(lastText === undefined || lastText === '0/24').toBe(true);
    expect(ctx.strokeLog).not.toContain(SIGNAL);
  });

  it('reduced motion keeps the lap still', () => {
    mountFondo(true);
    const frame = frameOf();
    frame(1000);
    const first = ctx.moves.map((m) => [...m]);
    expect(first.length).toBeGreaterThan(0);
    ctx.moves.length = 0;
    frame(2000);
    expect(ctx.moves).toEqual(first);
  });

  it('without reduced motion the graduation advances', () => {
    mountFondo(false);
    const frame = frameOf();
    frame(1000);
    const first = ctx.moves.map((m) => [...m]);
    ctx.moves.length = 0;
    frame(2000);
    expect(ctx.moves).not.toEqual(first);
  });

  it('destroy cleans up', () => {
    const unsub = jest.fn();
    const stop = jest.fn();
    (pointerIn as jest.Mock).mockReturnValue(unsub);
    (loop as jest.Mock).mockReturnValue(stop);
    const host = document.createElement('div');
    document.body.appendChild(host);
    mountFondo(false, host);
    const canvas = (hostCanvas as jest.Mock).mock.results[0].value.canvas as HTMLCanvasElement;
    host.appendChild(canvas);
    expect(host.contains(canvas)).toBe(true);
    fondo!.destroy();
    fondo = null;
    expect(unsub).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    expect(host.contains(canvas)).toBe(false);
  });

  it('the loader map knows facetmedia', () => {
    expect(typeof fondoLoaders.facetmedia).toBe('function');
  });
});
