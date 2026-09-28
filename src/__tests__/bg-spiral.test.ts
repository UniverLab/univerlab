/**
 * Tests for the spiral runner (src/scripts/bg-spiral.ts) — the Quorum
 * background, split out of backgrounds.ts so that module stays within its
 * size budget. Verifies the cursor contract: the static whirling-squares
 * structure is drawn at a visible-but-quiet level per circadian surface and
 * the 3–5 s ambient spark wander stays untouched, while an active pointer
 * pulls the next spawn to (first active frame + 180 ms), biases each new
 * spark toward the arc point nearest the cursor, ramps pointer-born sparks
 * in over 200 ms, burns them brighter for their first second, and tightens
 * the cadence to ≈900 ms. Touch is ignored; a detached canvas aborts the
 * listeners. Given-When-Then pattern, like field.test.ts and brain.test.ts.
 */
import { spiral } from '../scripts/bg-spiral';

type SpiralCtx = Parameters<typeof spiral>[0];

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/**
 * Harness with a shared clock: performance.now() and the rAF `t` are driven
 * together (setClock / step) so the runner's 1 s activity gate is testable.
 * Math.random is pinned to 0.5, making every spawn deterministic:
 *   nextSpawn₀ = 300 + 0.5 * 1200 = 900, life = 10000 + 0.5 * 5000 = 12500,
 *   ambient cadence = 3000 + 0.5 * 2000 = 4000, active = 700 + 0.5 * 400 = 900.
 */
function makeCtx(w = 800, h = 600) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const now = { v: 0 };
  const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  jest.spyOn(performance, 'now').mockImplementation(() => now.v);
  const clearRect = jest.fn();
  const arcs: Array<{ x: number; y: number; r: number }> = [];
  const alphas: number[] = [];
  let alpha = 1;
  const c = {
    clearRect,
    fill: jest.fn(),
    stroke: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    strokeRect: jest.fn(),
    arc: jest.fn((x: number, y: number, r: number) => arcs.push({ x, y, r })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => {
      alphas.push(v);
      alpha = v;
    },
  });
  const ctx: SpiralCtx = { canvas, c, color: '#e6b24a', w, h };
  const reset = () => {
    arcs.length = 0;
    alphas.length = 0;
    clearRect.mockClear();
  };
  /** Advance the shared clock without stepping a frame. */
  const setClock = (v: number) => {
    now.v = v;
  };
  /** Step a frame at rAF-time t (performance.now follows t). */
  const step = (tick: (t: number) => void, t: number) => {
    now.v = t;
    tick(t);
  };
  /** Each live spark draws exactly 2 arcs (halo wash + 1.4 px core). */
  const sparks = () => arcs.length / 2;
  /** Centers of the halo arcs — the spark heads, in spawn order. */
  const heads = () => arcs.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, y: p.y }));
  return { ctx, canvas, arcs, alphas, clearRect, reset, setClock, step, sparks, heads, randomSpy };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.celestial;
});

describe('spiral', () => {
  it('idle: no spark before t = 900, one after, and the 3–5 s ambient cadence continues', () => {
    // Given: a fresh spiral that never sees the pointer
    const { ctx, step, sparks, reset } = makeCtx();
    const tick = spiral(ctx);
    // When: frames step up to the ambient window (Math.random 0.5 ⇒ 900)
    step(tick, 800);
    expect(sparks()).toBe(0);
    step(tick, 900);
    expect(sparks()).toBe(1);
    // When: mid-window (the ambient next-spawn is 900 + 4000 = 4900)
    reset();
    step(tick, 4000);
    expect(sparks()).toBe(1);
    // When: the second ambient window opens
    reset();
    step(tick, 5000);
    // Then: the second spark joins the first (life 12500 ms keeps them alive)
    expect(sparks()).toBe(2);
  });

  it('the idle cadence is deterministic: identical spawn heads run after run', () => {
    // Given: two idle spirals with identical pinned randomness (arcs reset
    // every frame so the final frame shows the live spark set)
    const a = makeCtx();
    const tickA = spiral(a.ctx);
    [800, 900, 2000, 5000].forEach((t) => {
      a.reset();
      a.step(tickA, t);
    });
    const b = makeCtx();
    const tickB = spiral(b.ctx);
    [800, 900, 2000, 5000].forEach((t) => {
      b.reset();
      b.step(tickB, t);
    });
    // When: their spark heads are compared
    const ha = a.heads();
    const hb = b.heads();
    // Then: spawn positions coincide (Math.random pinned ⇒ deterministic),
    // and the biased branch never fired (no pointer was dispatched)
    expect(ha).toHaveLength(2);
    expect(hb).toHaveLength(2);
    expect(ha[0].x).toBeCloseTo(hb[0].x, 9);
    expect(ha[1].x).toBeCloseTo(hb[1].x, 9);
    a.randomSpy.mockRestore();
    b.randomSpy.mockRestore();
  });

  it('ambient sparks fade in slowly: nearly invisible at birth, full after 12 % of life', () => {
    // Given: a fresh spiral that reaches its ambient spawn untouched
    const { ctx, alphas, step, sparks } = makeCtx();
    const tick = spiral(ctx);
    step(tick, 900); // spark born at t = 900, life = 12500
    expect(sparks()).toBe(1);
    alphas.length = 0;
    // Spark alphas only — the static structure strokes (0.18/0.22 by day,
    // 0.20/0.24 by night) and the trailing reset-to-1 are not part of the
    // fade-in envelope.
    const STRUCT = [0.18, 0.2, 0.22, 0.24];
    const envAlphas = () => alphas.filter((v) => v < 1 && !STRUCT.includes(v));
    // When: a frame lands 100 ms after birth (env = u / 0.12 ≈ 0.067)
    step(tick, 1000);
    const early = Math.max(...envAlphas());
    expect(early).toBeLessThan(0.1);
    alphas.length = 0;
    // When: 12 % of its life has passed (1500 ms)
    step(tick, 2400);
    // Then: the envelope is saturated — the spark draws much brighter
    expect(Math.max(...envAlphas())).toBeGreaterThan(early);
  });

  it('the pointer pulls the next spawn inside the half-second bar (active frame + 180 ms)', () => {
    // Given: an idle spiral whose ambient window is still 800 ms away
    const { ctx, setClock, step, sparks } = makeCtx();
    const tick = spiral(ctx);
    step(tick, 100);
    expect(sparks()).toBe(0);
    // When: the pointer becomes active at t = 100
    setClock(100);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 700, clientY: 280 });
    // Then: the first active frame (101) pulls the spawn to 101 + 180…
    step(tick, 101);
    expect(sparks()).toBe(0);
    // …and by 281 — 181 ms after the move — a spark exists. Well inside 0.5 s.
    step(tick, 281);
    expect(sparks()).toBe(1);
  });

  it('pointer-born sparks ramp in fast (200 ms) so the reaction reads at once', () => {
    // Given: a spiral pulled early by a pointer that entered at t = 100
    const { ctx, setClock, alphas, step, sparks } = makeCtx();
    const tick = spiral(ctx);
    step(tick, 100);
    setClock(100);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 700, clientY: 280 });
    step(tick, 101); // pull ⇒ spawn scheduled at 281
    step(tick, 281); // biased spark born, env = 0
    expect(sparks()).toBe(1);
    alphas.length = 0;
    // When: a frame lands only 150 ms after its birth (ambient would be ≈ 0.01)
    step(tick, 431);
    const maxEnv = Math.max(...alphas.filter((v) => v < 1));
    // Then: the fast ramp has it near full brightness
    expect(maxEnv).toBeGreaterThan(0.5);
  });

  it('cursor-born sparks burn clearly brighter for their first second, then settle back to ambient', () => {
    // Given: a spiral pulled early by a pointer that entered at t = 100
    const { ctx, setClock, alphas, arcs, step } = makeCtx();
    const tick = spiral(ctx);
    step(tick, 100);
    setClock(100);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 700, clientY: 280 });
    step(tick, 101); // pull ⇒ spawn scheduled at 281
    step(tick, 281); // biased spark born
    // When: a frame lands 100 ms into its life (bright ≈ 0.9)
    alphas.length = 0;
    arcs.length = 0;
    step(tick, 381);
    // Then: the spark draws [halo, core] — both inflated over the ambient
    // bounds (7 px halo, 1.4 px core) and a hotter core for its alpha…
    expect(arcs).toHaveLength(2);
    expect(arcs[0].r).toBeGreaterThan(7);
    expect(arcs[1].r).toBeGreaterThan(1.4 + 1e-9);
    // …the core/halo alpha ratio (ambient: 0.42–0.7) proves the boost
    const haloA = alphas[alphas.length - 3];
    const coreA = alphas[alphas.length - 2];
    expect(coreA / haloA).toBeGreaterThan(0.8);
    // When: 1.5 s have passed — the burn is over (an ambient spark may have
    // joined in the same frame; the pointer-born one draws last)
    alphas.length = 0;
    arcs.length = 0;
    step(tick, 1781);
    // Then: its halo, core radius and core alpha are back to ambient bounds
    expect(arcs[arcs.length - 2].r).toBeLessThanOrEqual(7 + 1e-9);
    expect(arcs[arcs.length - 1].r).toBeCloseTo(1.4, 6);
    expect(alphas[alphas.length - 2]).toBeLessThanOrEqual(0.7 + 1e-9);
  });

  it('raises the structure strokes to a visible-but-quiet level per circadian surface', () => {
    // Given: the day surface (gold on sand)
    const { ctx, alphas, step } = makeCtx();
    document.documentElement.dataset.celestial = 'sun';
    const tick = spiral(ctx);
    // When: a frame paints
    step(tick, 100);
    // Then: whirling squares at 0.18, golden spiral at 0.22
    expect(alphas[0]).toBeCloseTo(0.18, 6);
    expect(alphas[1]).toBeCloseTo(0.22, 6);
    // When: the surface flips to night (gold on espresso)
    document.documentElement.dataset.celestial = 'moon';
    alphas.length = 0;
    step(tick, 200);
    // Then: whirling squares at 0.20, golden spiral at 0.24
    expect(alphas[0]).toBeCloseTo(0.2, 6);
    expect(alphas[1]).toBeCloseTo(0.24, 6);
    delete document.documentElement.dataset.celestial;
  });

  it('the spawn bias tracks the cursor: opposite arcs birth opposite heads', () => {
    // Given: a spiral pulled by a pointer seeded at the outer right
    const right = makeCtx();
    const tickR = spiral(right.ctx);
    right.step(tickR, 100);
    right.setClock(100);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 700, clientY: 280 });
    right.step(tickR, 101);
    right.step(tickR, 281);
    const rightHead = right.heads()[0];
    // When: an identical spiral is pulled from the lower left instead
    const left = makeCtx();
    const tickL = spiral(left.ctx);
    left.step(tickL, 100);
    left.setClock(100);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 550 });
    left.step(tickL, 101);
    left.step(tickL, 281);
    const leftHead = left.heads()[0];
    // Then: the two births sit on clearly different sides of the frame
    expect(rightHead.x).toBeGreaterThan(leftHead.x);
    expect(leftHead.y).toBeGreaterThan(rightHead.y);
    right.randomSpy.mockRestore();
    left.randomSpy.mockRestore();
  });

  it('active cadence tightens to 700–1100 ms (≈900 ms mean) while the pointer keeps travelling', () => {
    // Given: a pointer that keeps moving (each move refreshes the 1 s gate)
    const { ctx, setClock, step, sparks, reset } = makeCtx();
    const tick = spiral(ctx);
    step(tick, 100);
    setClock(100);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    step(tick, 101); // pull ⇒ first spawn at 281
    // When: sweeping frames every 250 ms for ~8 s
    for (let i = 0; i < 32; i++) {
      const t = 281 + i * 250;
      setClock(t);
      firePointer('pointermove', { pointerType: 'mouse', clientX: 300 + (i % 6) * 40, clientY: 300 });
      reset();
      step(tick, t);
    }
    // Then: 8 s of active play spawned far more sparks than the ambient
    // cadence would (idle: at most 2 alive by now; active ⇒ ~7+)
    expect(sparks()).toBeGreaterThanOrEqual(6);
  });

  it('a long sweep never saturates the spiral (MAX_SPARKS = 16, skip-the-push)', () => {
    // Given: a pointer travelling forever from t = 100
    const { ctx, setClock, step, sparks, reset } = makeCtx();
    const tick = spiral(ctx);
    step(tick, 100);
    let peak = 0;
    let x = 300;
    // When: 60 s of active spawning with a 250 ms sweep cadence
    for (let i = 0; i < 240; i++) {
      const t = 280 + i * 250;
      x = 200 + ((i * 53) % 400);
      setClock(t);
      firePointer('pointermove', { pointerType: 'mouse', clientX: x, clientY: 300 });
      reset();
      step(tick, t);
      peak = Math.max(peak, sparks());
    }
    // Then: the live set stayed under the saturation cap…
    expect(peak).toBeLessThanOrEqual(16);
    // …and the reaction was clearly alive (vs ≤ 5 for pure ambient here)
    expect(peak).toBeGreaterThan(5);
  });

  it('ignores touch pointer input — no pull, no bias, ambient cadence intact', () => {
    // Given: a fresh spiral touched only by a finger
    const { ctx, setClock, step, sparks } = makeCtx();
    const tick = spiral(ctx);
    step(tick, 100);
    // When: touch events happen well before the ambient window
    setClock(100);
    firePointer('pointermove', { pointerType: 'touch', clientX: 400, clientY: 300 });
    setClock(200);
    firePointer('pointermove', { pointerType: 'touch', clientX: 450, clientY: 320 });
    step(tick, 281);
    // Then: nothing was pulled early
    expect(sparks()).toBe(0);
    // When: the ambient window opens normally
    step(tick, 900);
    expect(sparks()).toBe(1);
  });

  it('falls back to the golden default when the essence color is not a hex triplet', () => {
    // Given: a spiral whose color is a named CSS color
    const { ctx, step, sparks } = makeCtx();
    (ctx as { color: string }).color = 'gold';
    const tick = spiral(ctx);
    // When: a frame paints and the ambient spawn fires
    step(tick, 900);
    // Then: the guard substituted the default gold and the spark still drew
    expect(sparks()).toBe(1);
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a spiral that pulled one biased spark
    const { ctx, canvas, clearRect, arcs, setClock, step, sparks } = makeCtx();
    const tick = spiral(ctx);
    step(tick, 100);
    setClock(100);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 700, clientY: 280 });
    step(tick, 101);
    step(tick, 281);
    expect(sparks()).toBe(1);
    clearRect.mockClear();
    arcs.length = 0;
    // When: the canvas leaves the document and frames keep ticking
    canvas.remove();
    step(tick, 380);
    step(tick, 500);
    // Then: nothing is painted any more
    expect(clearRect).not.toHaveBeenCalled();
    expect(arcs).toHaveLength(0);
  });
});
