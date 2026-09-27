/**
 * Tests for the bubbles runner (src/scripts/bg-bubbles.ts) — the GitKit
 * background, split out of backgrounds.ts so that module stays within its
 * size budget. Verifies the canopy-sown cursor contract: the pointer sows
 * fresh bubbles under it (throttled, capped), they flash on birth and settle
 * to the byte-identical ambient draw; touch never spawns; a detached canvas
 * aborts the listeners. Given-When-Then pattern, like field.test.ts.
 */
import { bubbles } from '../scripts/bg-bubbles';

type BubblesCtx = Parameters<typeof bubbles>[0];

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/** A recording 2D stub + a controllable performance.now clock. */
function makeCtx(opts: { w?: number; h?: number; bg?: string; color?: string } = {}) {
  const { w = 800, h = 600, bg = '#f5eef5', color = '#e8a4c8' } = opts;
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  let now = 1000;
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  const advance = (ms: number) => {
    now += ms;
  };
  const clearRect = jest.fn();
  const fill = jest.fn();
  const stroke = jest.fn();
  const arcs: Array<{ x: number; y: number; r: number }> = [];
  const alphas: number[] = [];
  const stops: string[] = [];
  const fillStyles: string[] = [];
  const strokeStyles: string[] = [];
  let alpha = 1;
  let fillStyle: unknown = '';
  let strokeStyle: unknown = '';
  const c = {
    clearRect,
    fill,
    stroke,
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    bezierCurveTo: jest.fn(),
    strokeRect: jest.fn(),
    arc: jest.fn((x: number, y: number, r: number) => arcs.push({ x, y, r })),
    createRadialGradient: jest.fn(() => ({
      addColorStop: jest.fn((_o: number, col: string) => stops.push(col)),
    })),
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => {
      alphas.push(v);
      alpha = v;
    },
  });
  Object.defineProperty(c, 'fillStyle', {
    get: () => fillStyle,
    set: (v: unknown) => {
      if (typeof v === 'string') fillStyles.push(v);
      fillStyle = v;
    },
  });
  Object.defineProperty(c, 'strokeStyle', {
    get: () => strokeStyle,
    set: (v: unknown) => {
      if (typeof v === 'string') strokeStyles.push(v);
      strokeStyle = v;
    },
  });
  const ctx: BubblesCtx = { canvas, c, color, bg, w, h };
  const reset = () => {
    arcs.length = 0;
    alphas.length = 0;
    stops.length = 0;
    fillStyles.length = 0;
    strokeStyles.length = 0;
    clearRect.mockClear();
    fill.mockClear();
    stroke.mockClear();
  };
  return {
    ctx, canvas, clearRect, fill, stroke,
    arcs, alphas, stops, fillStyles, strokeStyles,
    advance, reset,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

const W = 800;
const H = 600;
/** N at 800×600 — same formula as the runner. */
const N = Math.min(35, Math.floor((W * H) / 35000));

describe('bubbles', () => {
  it('rises the ambient field without the cursor: N nodes, ambient alphas, no pops', () => {
    // Given: a fresh bubbles field with no pointer input
    const { ctx, arcs, alphas, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    reset();
    // When: one frame steps
    tick(33);
    // Then: exactly 3 arcs per bubble (halo, core, ring), no birth pops
    expect(arcs).toHaveLength(3 * N);
    // And: every node alpha stays inside the ambient band (light page ≤ 0.55)
    const nodeAlphas = alphas.filter((a) => a !== 1 && a !== 0.14);
    expect(nodeAlphas.length).toBeGreaterThan(0);
    expect(Math.max(...nodeAlphas)).toBeLessThanOrEqual(0.55);
  });

  it('the first move after entering only seeds the pointer — it never sows a bubble', () => {
    // Given: a fresh field that has painted once
    const { ctx, arcs, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    reset();
    // When: the pointer enters with a single move
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    tick(33);
    // Then: still only the ambient bubbles (no extra arcs, no birth pop)
    expect(arcs).toHaveLength(3 * N);
  });

  it('sows a bubble under the cursor on the move after seeding, with a visible birth flash', () => {
    // Given: a fresh field whose pointer has just entered at (10, 10)
    const { ctx, arcs, alphas, stops, advance, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    // When: a second move lands 300 ms later (past the 275 ms throttle)
    advance(300);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 420, clientY: 310 });
    reset();
    tick(33);
    // Then: one extra bubble (3 arcs) plus its expanding birth ring (1 arc)
    expect(arcs).toHaveLength(3 * (N + 1) + 1);
    // And: the newborn is drawn near full opacity — clearly visible at spawn
    expect(Math.max(...alphas.filter((a) => a !== 1))).toBeGreaterThan(0.9);
    // And: its halo stops are lifted above the ambient '80'/'50' hex bytes
    expect(stops.some((s) => s.length === 9 && parseInt(s.slice(7, 9), 16) > 0x80)).toBe(true);
  });

  it('throttles sowing to one bubble per ~275 ms', () => {
    // Given: a seeded pointer
    const { ctx, arcs, advance, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    // When: two moves arrive 300 ms and then only 100 ms apart
    advance(300);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 200, clientY: 400 });
    advance(100);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 260, clientY: 420 });
    advance(500); // let the single pop expire (POP_MS = 450)
    reset();
    tick(33);
    // Then: only the first move sowed — the 100 ms apart move was throttled
    expect(arcs).toHaveLength(3 * (N + 1));
    // When: the throttle window passes and the pointer moves again
    advance(300);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 320, clientY: 440 });
    advance(500);
    reset();
    tick(66);
    // Then: the second bubble joins the float
    expect(arcs).toHaveLength(3 * (N + 2));
  });

  it('caps cursor-born bubbles at MAX_EXTRAS = 24 on top of the ambient field', () => {
    // Given: a seeded pointer
    const { ctx, arcs, advance, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    // When: 30 throttled sowings happen
    for (let i = 0; i < 30; i++) {
      advance(300);
      firePointer('pointermove', {
        pointerType: 'mouse',
        clientX: 100 + (i % 7) * 90,
        clientY: 150 + i * 12,
      });
    }
    advance(500); // all pops expire (POP_MS = 450)
    reset();
    tick(33);
    // Then: the live set is ambient + exactly 24 extras (the highest is recycled)
    expect(arcs).toHaveLength(3 * (N + 24));
  });

  it('the spawn flash decays to the byte-identical ambient draw within a few seconds', () => {
    // Given: one sowed bubble (seeding move, then a sow 300 ms later)
    const { ctx, arcs, alphas, advance, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    advance(300);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 500 });
    // When: ~5 s of frames pass (τ = 600 ms ⇒ glow snaps to exactly 0)
    let t = 33;
    for (let i = 0; i < 40; i++) {
      t += 133;
      advance(133);
      reset();
      tick(t);
    }
    // Then: no lifted node alpha remains — every bubble is back in the ambient band
    const nodeAlphas = alphas.filter((a) => a !== 1 && a !== 0.14);
    expect(Math.max(...nodeAlphas)).toBeLessThanOrEqual(0.55);
    // And: the extra bubble itself survives, unlit, and the pop ring is gone
    expect(arcs).toHaveLength(3 * (N + 1));
  });

  it('pointerout re-arms the seed gate: re-entry never sows from a stale origin', () => {
    // Given: a field whose pointer has entered and sowed once
    const { ctx, arcs, advance, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    advance(300);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 200, clientY: 200 });
    // When: the pointer leaves the window and re-enters far away
    firePointer('pointerout', { pointerType: 'mouse', relatedTarget: null });
    advance(600);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 700, clientY: 500 });
    advance(500); // first pop expires too
    reset();
    tick(1200);
    // Then: the re-entry move only seeds — still ambient + one bubble
    expect(arcs).toHaveLength(3 * (N + 1));
    // When: a second in-window move arrives
    advance(300);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 710, clientY: 505 });
    advance(500);
    reset();
    tick(1500);
    // Then: now the new origin sows
    expect(arcs).toHaveLength(3 * (N + 2));
  });

  it('ignores touch pointer input — a tap never sows a bubble', () => {
    // Given: a fresh field
    const { ctx, arcs, advance, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    // When: a touch pointer sweeps
    advance(300);
    firePointer('pointermove', { pointerType: 'touch', clientX: 300, clientY: 300 });
    advance(300);
    firePointer('pointermove', { pointerType: 'touch', clientX: 310, clientY: 310 });
    advance(500);
    reset();
    tick(33);
    // Then: only the ambient bubbles are drawn
    expect(arcs).toHaveLength(3 * N);
  });

  it('the dark branch keeps white cores and rings (bg luminance < 0.4)', () => {
    // Given: a field on a dark page background
    const { ctx, fillStyles, strokeStyles, advance, reset } = makeCtx({ bg: '#0a0b0e' });
    const tick = bubbles(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    reset();
    // When: a bubble is sowed and drawn while glowing
    advance(300);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 300, clientY: 300 });
    tick(33);
    // Then: cores/rings are white — shadeA degenerates to #ffffff on dark
    expect(fillStyles).toContain('#ffffff');
    expect(strokeStyles).toContain('#ffffff');
    // And the birth pop is stroked white as well
    expect(strokeStyles.filter((s) => s === '#ffffff').length).toBeGreaterThan(1);
  });

  it('the non-hex color falls back to the GitKit pink (A guard)', () => {
    // Given: a field whose essence is not a 7-char hex
    const { ctx, stops, arcs } = makeCtx({ color: 'pink' });
    // When: one frame paints
    const tick = bubbles(ctx);
    tick(0);
    // Then: halos are built from the fallback pink
    expect(stops.some((s) => s.startsWith('#e8a4c8'))).toBe(true);
    expect(arcs).toHaveLength(3 * N);
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a fresh bubbles field that has drawn
    const { ctx, canvas, clearRect, fill, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    expect(fill).toHaveBeenCalled();
    reset();
    // When: the canvas leaves the document and frames keep ticking
    canvas.remove();
    tick(33);
    // Then: no paint happens and listeners are released
    expect(clearRect).not.toHaveBeenCalled();
    expect(fill).not.toHaveBeenCalled();
    reset();
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(() => tick(66)).not.toThrow();
  });
});
