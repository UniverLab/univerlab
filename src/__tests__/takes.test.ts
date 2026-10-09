/**
 * Tests for the takes runner (src/scripts/takes.ts) — the DemoStage
 * background. Verifies the record → normalize → replay contract: RDP reduces
 * a noisy straight line to its two endpoints, a take compiles after 600 ms of
 * stillness, at most 3 takes are kept, touch never records, and a detached
 * canvas aborts the listeners.
 * Given-When-Then pattern, like brain.test.ts.
 */
import { takes, rdp, STILL_MS, MAX_TAKES } from '../scripts/takes';
import type { Pt } from '../scripts/takes';

type TakesCtx = Parameters<typeof takes>[0];

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/** A tiny harness: attached canvas + a recording 2D context stub. */
function makeCtx(w = 1440, h = 900) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const clearRect = jest.fn();
  const stroke = jest.fn();
  const fill = jest.fn();
  const moves: Pt[] = [];
  const arcs: Array<{ x: number; y: number; r: number }> = [];
  const alphas: number[] = [];
  let alpha = 1;
  const c = {
    clearRect,
    stroke,
    fill,
    beginPath: jest.fn(),
    moveTo: jest.fn((x: number, y: number) => moves.push({ x, y })),
    lineTo: jest.fn((x: number, y: number) => moves.push({ x, y })),
    arc: jest.fn((x: number, y: number, r: number) => arcs.push({ x, y, r })),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => {
      alphas.push(v);
      alpha = v;
    },
  });
  const ctx: TakesCtx = { canvas, c, color: '#fa5838', w, h };
  const reset = () => {
    moves.length = 0;
    arcs.length = 0;
    alphas.length = 0;
    clearRect.mockClear();
    stroke.mockClear();
    fill.mockClear();
  };
  return { ctx, canvas, clearRect, stroke, fill, moves, arcs, alphas, reset };
}

/** Run one gesture: each move is followed by its frame, SAMPLE_MS apart. */
function gesture(tick: (t: number) => void, t0: number, pts: Pt[]) {
  let t = t0;
  for (const p of pts) {
    firePointer('pointermove', { pointerType: 'mouse', clientX: p.x, clientY: p.y });
    t += 40;
    tick(t);
  }
  return t;
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('rdp', () => {
  it('reduces a noisy straight line to its two endpoints', () => {
    // Given: colinear points with ±2 px of jitter
    const pts: Pt[] = Array.from({ length: 20 }, (_, i) => ({
      x: 100 + i * 10,
      y: 300 + (i % 2 === 0 ? 2 : -2),
    }));
    // When: the path is simplified at ε = 6
    const out = rdp(pts, 6);
    // Then: only the two endpoints survive
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(pts[0]);
    expect(out[1]).toEqual(pts[pts.length - 1]);
  });

  it('keeps genuine corners while dropping the noise between them', () => {
    // Given: an L with jitter
    const pts: Pt[] = [
      { x: 0, y: 0 }, { x: 50, y: 1 }, { x: 100, y: -1 },
      { x: 100, y: 50 }, { x: 101, y: 100 },
    ];
    // When: simplified
    const out = rdp(pts, 6);
    // Then: the corner survives between the endpoints
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });
});

describe('takes', () => {
  it('compiles a take after 600 ms of stillness and replays it with a ghost', () => {
    // Given: a runner with a freshly drawn gesture
    const { ctx, arcs, reset } = makeCtx();
    const tick = takes(ctx);
    tick(0);
    const t = gesture(tick, 40, [
      { x: 200, y: 200 }, { x: 260, y: 220 }, { x: 320, y: 210 },
      { x: 380, y: 240 }, { x: 440, y: 260 },
    ]);
    reset();
    tick(t);
    // When: stillness passes the 600 ms compile gate
    const stillT = t + STILL_MS + 40;
    reset();
    tick(stillT);
    // Then: the raw path became a compiled take with a hollow ghost replay
    expect(tick.takes).toHaveLength(1);
    expect(tick.takes[0].phase).toBe('replaying');
    expect(tick.takes[0].score.length).toBeLessThanOrEqual(5);
    expect(arcs.some((a) => a.r === 6)).toBe(true);
  });

  it('keeps at most 3 takes, dropping the oldest first', () => {
    // Given: a runner that has compiled three takes
    const { ctx } = makeCtx();
    const tick = takes(ctx);
    let t = 0;
    tick(t);
    const scores: Pt[][] = [];
    for (let k = 0; k < MAX_TAKES; k++) {
      t += 100;
      t = gesture(tick, t, [
        { x: 100 + k * 50, y: 100 }, { x: 150 + k * 50, y: 120 }, { x: 200 + k * 50, y: 110 },
      ]);
      tick(t);
      t += STILL_MS + 40;
      tick(t);
    }
    expect(tick.takes).toHaveLength(MAX_TAKES);
    scores.push(...tick.takes.map((k) => k.score));
    // When: a fourth take compiles
    t += 100;
    t = gesture(tick, t, [
      { x: 700, y: 700 }, { x: 760, y: 720 }, { x: 820, y: 710 },
    ]);
    tick(t);
    t += STILL_MS + 40;
    tick(t);
    // Then: still at most 3, and the oldest score is gone
    expect(tick.takes).toHaveLength(MAX_TAKES);
    expect(tick.takes.map((k) => k.score)).not.toContain(scores[0]);
  });

  it('ignores touch pointer input — a tap never records a take', () => {
    // Given: a fresh runner that has painted once
    const { ctx } = makeCtx();
    const tick = takes(ctx);
    tick(0);
    // When: touch pointers sweep the window and stillness passes
    firePointer('pointermove', { pointerType: 'touch', clientX: 40, clientY: 60 });
    tick(40);
    firePointer('pointermove', { pointerType: 'touch', clientX: 400, clientY: 300 });
    tick(80);
    tick(80 + STILL_MS + 40);
    // Then: no take was ever recorded
    expect(tick.takes).toHaveLength(0);
  });

  it('records a synthetic take when the pointer never arrives, then fades takes away', () => {
    // Given: a runner with no pointer input at all
    const { ctx } = makeCtx();
    const tick = takes(ctx);
    tick(0);
    // When: the idle window passes
    tick(8001);
    // Then: exactly one quiet synthetic take is on screen
    expect(tick.takes).toHaveLength(1);
    // When: its replay and fade both elapse
    const k = tick.takes[0];
    tick(k.t0 + k.recordedMs * 1.2 + 1);
    expect(tick.takes).toHaveLength(1);
    expect(tick.takes[0].phase).toBe('fading');
    tick(k.t0 + 2000 + 10);
    // Then: the take is gone
    expect(tick.takes).toHaveLength(0);
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a fresh runner that has drawn at least once
    const { ctx, canvas, clearRect, reset } = makeCtx();
    const tick = takes(ctx);
    tick(0);
    expect(clearRect).toHaveBeenCalled();
    reset();
    // When: the canvas leaves the document and frames keep ticking
    canvas.remove();
    tick(33);
    tick(66);
    // Then: no paint happens and listeners are released
    expect(clearRect).not.toHaveBeenCalled();
    reset();
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(() => tick(99)).not.toThrow();
  });
});
