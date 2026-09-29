/**
 * Tests for the scaffold runner (src/scripts/bg-scaffold.ts) — the ghScaff
 * background, split out of backgrounds.ts so that module stays within its size
 * budget and so the cell machine is reachable from a test at all.
 *
 * Verifies the spec contract (lbg-ghscaff-raise):
 *   RAISE      — a pointer pass erects each cell's members in order, the two
 *                uprights → the ledger → the diagonal brace, each growing over
 *                ~220 ms at alpha 0.55 and settling to 0.25;
 *   IDEMPOTENT — a second pass over a raised cell leaves the member count
 *                unchanged (no stacking), flashes one "level" pulse to 0.6 and
 *                resets that cell's 6 s clock; a cell still assembling is left
 *                alone (the raise continues, never restarts);
 *   LOWERING   — without a re-pass the members come down in reverse order and
 *                the cell is deleted after HOLD + 3 × GROW;
 *   BOUNDS     — live cells stay capped at MAX_CELLS and a resize drops any
 *                cell that falls off the shrunk grid;
 *   IDLE       — with no pointer (touch included) one centre cell raises every
 *                ~4 s, and the cadence stays quiet while the pointer moves;
 *   TOUCH      — touch input never raises; DETACH, COLOUR.
 *
 * Shared-clock harness like bg-spiral.test.ts: performance.now() and the rAF
 * `t` advance together (the runner reads performance.now() inside the
 * pointermove listener). Math.random is pinned to 0.5, so the idle raise always
 * lands on the centre cell. Given-When-Then pattern.
 */
import { scaffold } from '../scripts/bg-scaffold';

type ScaffoldCtx = Parameters<typeof scaffold>[0];

const G = 84;
/** Pointer at a cell centre → the 3×3 block around it is within 1.5 cells. */
const AT = { clientX: 5 * G + G / 2, clientY: 5 * G + G / 2 }; // (462, 462) → 9 cells
const N = 9;

type Stroke = { style: string; alpha: number; x0: number; y0: number; x1: number; y1: number };

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/** Harness with a shared clock and a 2D context that records every stroke. */
function makeCtx(w = 800, h = 600, surface?: string) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const now = { v: 0 };
  jest.spyOn(performance, 'now').mockImplementation(() => now.v);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  const strokes: Stroke[] = [];
  const clearRect = jest.fn();
  let alpha = 1;
  let style = '';
  let sx = 0, sy = 0, ex = 0, ey = 0;
  const c = {
    clearRect,
    beginPath: jest.fn(),
    moveTo: jest.fn((x: number, y: number) => { sx = x; sy = y; }),
    lineTo: jest.fn((x: number, y: number) => { ex = x; ey = y; }),
    stroke: jest.fn(() => { strokes.push({ style, alpha, x0: sx, y0: sy, x1: ex, y1: ey }); }),
    fillRect: jest.fn(),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    fillStyle: '',
    lineWidth: 1,
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'strokeStyle', {
    configurable: true,
    get: () => style,
    set: (v: string) => { style = v; },
  });
  Object.defineProperty(c, 'globalAlpha', {
    configurable: true,
    get: () => alpha,
    set: (v: number) => { alpha = v; },
  });
  // `surface` is what startBackground would have resolved and handed in — the
  // runner never reads the page's data-surface itself.
  const ctx: ScaffoldCtx = { canvas, c, color: '#b87333', w, h, surface };
  /** Step one frame at rAF-time t (performance.now follows t), keeping only
   *  that frame's strokes. */
  const step = (tick: (t: number) => void, t: number) => {
    now.v = t;
    strokes.length = 0;
    tick(t);
  };
  /** Advance the shared clock without stepping a frame (for pointer events). */
  const setClock = (t: number) => {
    now.v = t;
  };
  return { ctx, canvas, strokes, clearRect, step, setClock };
}

/** Each frame paints the idle lattice first (one path, one stroke), so the
 *  remaining strokes of the frame are the cells' members. */
const gridOf = (ss: Stroke[]) => ss[0];
const members = (ss: Stroke[]) => ss.slice(1);
const isVertical = (s: Stroke) => s.x0 === s.x1 && s.y0 !== s.y1;
const isHorizontal = (s: Stroke) => s.y0 === s.y1 && s.x0 !== s.x1;
const isDiagonal = (s: Stroke) => s.x0 !== s.x1 && s.y0 !== s.y1;
/** A full-length ledger is unique to one cell — the cell census. */
const ledgers = (ss: Stroke[]) =>
  members(ss).filter((s) => isHorizontal(s) && Math.abs(s.x1 - s.x0) === G);
const fullLength = (s: Stroke) => Math.max(Math.abs(s.x1 - s.x0), Math.abs(s.y1 - s.y0)) === G;

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.surface;
});

describe('scaffold — RAISE', () => {
  it('erects a cell in order: uprights, then the ledger, then the brace', () => {
    // Given: a pointer parked on a cell centre (9 cells in reach)
    const { ctx, step, setClock, strokes } = makeCtx();
    const tick = scaffold(ctx);
    setClock(1000);
    firePointer('pointermove', { pointerType: 'mouse', clientX: AT.clientX, clientY: AT.clientY });
    // When: the birth frame lands (age 0 → nothing is called yet)
    step(tick, 1000);
    // Then: no member is drawn on the frame the cell is born
    expect(members(strokes)).toHaveLength(0);
    // When: 100 ms in — stage 1, both uprights growing from bottom to top
    step(tick, 1100);
    const f1 = members(strokes);
    expect(f1).toHaveLength(2 * N);
    expect(f1.every(isVertical)).toBe(true);
    expect(f1.every((s) => s.alpha === 0.55)).toBe(true);
    expect(f1.every((s) => s.y1 < s.y0)).toBe(true); // growing upward
    // When: 320 ms in — the uprights settled, the ledger is growing
    step(tick, 1320);
    const f2 = members(strokes);
    expect(f2.filter(isVertical)).toHaveLength(2 * N);
    expect(f2.filter(isHorizontal)).toHaveLength(N);
    expect(f2.filter(isDiagonal)).toHaveLength(0); // the brace is called last
    expect(f2.filter(isVertical).every((s) => s.alpha > 0.25 && s.alpha < 0.55)).toBe(true);
    expect(f2.filter(isHorizontal).every((s) => s.alpha === 0.55 && s.x1 - s.x0 < G)).toBe(true);
    // When: 540 ms in — stage 3, the diagonal brace grows last
    step(tick, 1540);
    const f3 = members(strokes);
    expect(f3.filter(isDiagonal)).toHaveLength(N);
    expect(f3.filter(isDiagonal).every((s) => s.alpha === 0.55 && !fullLength(s))).toBe(true);
    expect(f3.filter(isHorizontal)).toHaveLength(N);
    expect(f3.filter(isHorizontal).every(fullLength)).toBe(true); // ledger done
    // When: the fourth stage has finished
    step(tick, 1720);
    const f4 = members(strokes);
    expect(f4).toHaveLength(4 * N); // exactly four members per cell
    expect(f4.every(fullLength)).toBe(true);
    // Then: everything has settled from 0.55 to the resting 0.25
    step(tick, 1900);
    expect(members(strokes)).toHaveLength(4 * N);
    expect(members(strokes).every((s) => s.alpha === 0.25)).toBe(true);
  });

  it('a re-pass over a cell that is still assembling does not restart it', () => {
    // Given: a cell raised at t = 1000 and touched again mid-raise
    const { ctx, step, setClock, strokes } = makeCtx();
    const tick = scaffold(ctx);
    setClock(1000);
    firePointer('pointermove', { pointerType: 'mouse', clientX: AT.clientX, clientY: AT.clientY });
    setClock(1400);
    firePointer('pointermove', { pointerType: 'mouse', clientX: AT.clientX, clientY: AT.clientY });
    step(tick, 1400);
    // When: the frame that would have followed a restart lands at 1900
    step(tick, 1900);
    const f = members(strokes);
    // Then: the raise continued from 1000 — all four members are up and settled,
    // not re-drawn from the 1400 pass (which would leave the brace growing)
    expect(f).toHaveLength(4 * N);
    expect(f.filter(isDiagonal).every(fullLength)).toBe(true);
    expect(f.every((s) => s.alpha === 0.25)).toBe(true);
  });
});

describe('scaffold — IDEMPOTENT (re-pass levels, never stacks)', () => {
  it('leaves the member count unchanged, pulses to 0.6 and resets the 6 s timer', () => {
    // Given: a raised cell (9 cells × 4 members, all at rest)
    const { ctx, step, setClock, strokes } = makeCtx();
    const tick = scaffold(ctx);
    setClock(1000);
    firePointer('pointermove', { pointerType: 'mouse', clientX: AT.clientX, clientY: AT.clientY });
    step(tick, 1900);
    expect(members(strokes)).toHaveLength(4 * N);
    // When: the pointer sweeps back over the same cells at t = 3000
    setClock(3000);
    firePointer('pointermove', { pointerType: 'mouse', clientX: AT.clientX, clientY: AT.clientY });
    step(tick, 3000);
    // Then: no extra member was added — four per cell, still
    expect(members(strokes)).toHaveLength(4 * N);
    // And: the level pulse flashes all four members to 0.6…
    step(tick, 3150);
    expect(Math.max(...members(strokes).map((s) => s.alpha))).toBeCloseTo(0.6, 6);
    // …and falls back to rest by the end of the ~300 ms pulse
    step(tick, 3400);
    expect(Math.max(...members(strokes).map((s) => s.alpha))).toBeCloseTo(0.25, 6);
    // And: the clock was reset — at 8000 the cells are still standing (the
    // un-passed window closed at 1900 + 6000 = 7900) and fully at rest
    step(tick, 8000);
    const late = members(strokes);
    expect(late).toHaveLength(4 * N);
    expect(late.every(fullLength)).toBe(true);
    expect(late.every((s) => s.alpha === 0.25)).toBe(true);
  });
});

describe('scaffold — LOWERING', () => {
  it('comes down in reverse order (brace, ledger, uprights) and is deleted', () => {
    // Given: the same raise with NO second pass — it expires at 7900
    const { ctx, step, setClock, strokes } = makeCtx();
    const tick = scaffold(ctx);
    setClock(1000);
    firePointer('pointermove', { pointerType: 'mouse', clientX: AT.clientX, clientY: AT.clientY });
    step(tick, 1900);
    expect(members(strokes)).toHaveLength(4 * N);
    // When: 300 ms into the lowering (the control for the timer-reset test above)
    step(tick, 8200);
    const f = members(strokes);
    // Then: the brace is already gone, the ledger is halfway down, the uprights hold
    expect(f.filter(isDiagonal)).toHaveLength(0);
    expect(f.filter(isHorizontal)).toHaveLength(N);
    expect(f.filter(isHorizontal).every((s) => s.x1 - s.x0 < G)).toBe(true);
    expect(f.filter(isVertical)).toHaveLength(2 * N);
    expect(f.filter(isVertical).every(fullLength)).toBe(true);
    // When: 3 × 220 ms of lowering have elapsed
    step(tick, 8560);
    // Then: the cell is gone from the map entirely
    expect(members(strokes)).toHaveLength(0);
  });
});

describe('scaffold — BOUNDS', () => {
  it('never keeps more than MAX_CELLS (64) live cells, however long the sweep', () => {
    // Given: a pointer sweeping every cell centre on the sheet (~99 candidates)
    const { ctx, step, setClock, strokes } = makeCtx();
    const tick = scaffold(ctx);
    let t = 0;
    for (let gx = 0; gx * G < ctx.w; gx++) {
      for (let gy = 0; gy * G < ctx.h; gy++) {
        t += 20;
        setClock(t);
        firePointer('pointermove', { pointerType: 'mouse', clientX: gx * G + G / 2, clientY: gy * G + G / 2 });
        step(tick, t);
      }
    }
    // When: the last cells have had time to finish raising (> 860 ms)
    setClock(t + 1020);
    step(tick, t + 1020);
    // Then: the census is exactly the cap — the sweep wanted far more
    expect(ledgers(strokes)).toHaveLength(64);
  });

  it('drops cells that fall off the grid when the viewport shrinks', () => {
    // Given: cells raised along the right edge (gx 8–10)
    const { ctx, step, setClock, strokes } = makeCtx();
    const tick = scaffold(ctx);
    setClock(1000);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 790, clientY: 300 });
    step(tick, 1900);
    expect(ledgers(strokes).length).toBeGreaterThan(0);
    // When: the canvas narrows to 300 px (cols 11 → 5)
    (ctx as { w: number }).w = 300;
    step(tick, 2000);
    // Then: every raised cell was off the new grid and is gone
    expect(members(strokes)).toHaveLength(0);
  });
});

describe('scaffold — IDLE / TOUCH', () => {
  it('raises one cell near the viewport centre every ~4 s when nothing points', () => {
    // Given: a background that never sees a pointer
    const { ctx, step, strokes } = makeCtx();
    const tick = scaffold(ctx);
    // When: four seconds of frames go by (plus the two 16 ms startup ticks)
    for (const t of [0, 1000, 2000, 3000, 4000]) step(tick, t);
    expect(members(strokes)).toHaveLength(0);
    step(tick, 5000); // idleAcc crosses IDLE_EVERY → the cell is born
    expect(members(strokes)).toHaveLength(0); // birth frame draws nothing
    // Then: a single cell starts assembling — the two uprights…
    step(tick, 5100);
    const f = members(strokes);
    expect(f).toHaveLength(2);
    expect(f.every(isVertical)).toBe(true);
    // …at floor(cols/2), floor(rows/2) = (5, 4) — the centre of the sheet
    expect(f.map((s) => s.x0).sort((a, b) => a - b)).toEqual([5 * G, 6 * G]);
    expect(f.every((s) => s.y0 === 5 * G)).toBe(true);
  });

  it('stays quiet while the pointer keeps moving', () => {
    // Given: a pointer sweeping the top-left corner every 400 ms
    const { ctx, step, setClock, strokes } = makeCtx();
    const tick = scaffold(ctx);
    for (let t = 100; t <= 4900; t += 400) {
      setClock(t);
      firePointer('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 100 });
      step(tick, t);
    }
    // Then: the corner cells raised, but no autonomous centre cell appeared
    expect(ledgers(strokes).length).toBeGreaterThan(0);
    expect(ledgers(strokes).some((s) => s.x0 === 5 * G && s.y0 === 4 * G)).toBe(false);
  });

  it('ignores touch input entirely and falls back to the idle cadence', () => {
    // Given: a finger, and only a finger
    const { ctx, step, setClock, strokes } = makeCtx();
    const tick = scaffold(ctx);
    for (const t of [100, 500, 900]) {
      setClock(t);
      firePointer('pointermove', { pointerType: 'touch', clientX: AT.clientX, clientY: AT.clientY });
      step(tick, t);
    }
    // Then: no cell was raised by the touch
    expect(members(strokes)).toHaveLength(0);
    // When: the ~4 s idle window opens anyway (touch never marks the pointer)
    step(tick, 2000);
    step(tick, 3000);
    step(tick, 4100);
    expect(members(strokes)).toHaveLength(0); // born this frame
    step(tick, 4200);
    // Then: the autonomous centre raise is the touch fallback
    expect(members(strokes)).toHaveLength(2);
    expect(members(strokes).every(isVertical)).toBe(true);
  });
});

describe('scaffold — surface / lifecycle', () => {
  it('paints the lattice at rest alpha 0.16 and re-tints the industrial surface', () => {
    // Given: the industrial (midnight) surface, handed in through ctx the way
    // startBackground hands it over (argument first, page second)
    const { ctx, step, setClock, strokes } = makeCtx(800, 600, 'industrial');
    const tick = scaffold(ctx);
    // Then: the midnight re-tint replaced the registry copper, one hue only
    expect(ctx.color).toBe('#8b7cf6');
    // When: a frame with raised cells paints
    setClock(1000);
    firePointer('pointermove', { pointerType: 'mouse', clientX: AT.clientX, clientY: AT.clientY });
    step(tick, 1900);
    // Then: the idle grid is visible (0.16 internal ≈ 0.11 through the 0.68 canvas)
    expect(strokes).toHaveLength(1 + 4 * N);
    const grid = gridOf(strokes);
    expect(grid.alpha).toBeCloseTo(0.16, 6);
    expect(grid.style).toBe('#8b7cf6');
    expect(members(strokes).every((s) => s.style === '#8b7cf6')).toBe(true);
  });

  it('ignores a page data-surface and re-tints only from the handed-in surface', () => {
    // Given: <html> says industrial, but startBackground resolved no surface
    // for this mount (the home page: <html> has no surface of its own, so a
    // direct DOM read is what broke the card window in the first place)
    document.documentElement.dataset.surface = 'industrial';
    const { ctx, step, setClock, strokes } = makeCtx();
    const tick = scaffold(ctx);
    // Then: the registry colour survives — the runner never reads the document
    expect(ctx.color).toBe('#b87333');
    // And: the lattice paints in that colour, one hue only
    setClock(1000);
    step(tick, 1000);
    expect(strokes).toHaveLength(1);
    expect(gridOf(strokes).style).toBe('#b87333');
  });

  it('keeps the default essence colour and the same visible grid off the industrial surface', () => {
    // Given: a surface with no industrial re-tint
    const { ctx, step, setClock, strokes } = makeCtx();
    const tick = scaffold(ctx);
    expect(ctx.color).toBe('#b87333');
    // When: a frame paints
    setClock(1000);
    step(tick, 1000);
    // Then: the lattice rests at 0.16 in the page colour
    expect(strokes).toHaveLength(1);
    const grid = gridOf(strokes);
    expect(grid.alpha).toBeCloseTo(0.16, 6);
    expect(grid.style).toBe('#b87333');
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a canvas with nine raised cells
    const { ctx, canvas, step, setClock, strokes, clearRect } = makeCtx();
    const tick = scaffold(ctx);
    setClock(1000);
    firePointer('pointermove', { pointerType: 'mouse', clientX: AT.clientX, clientY: AT.clientY });
    step(tick, 1900);
    expect(members(strokes)).toHaveLength(4 * N);
    // When: the canvas leaves the document and frames keep ticking
    clearRect.mockClear();
    strokes.length = 0;
    canvas.remove();
    step(tick, 2000);
    // Then: nothing is painted any more
    expect(clearRect).not.toHaveBeenCalled();
    expect(strokes).toHaveLength(0);
    // When: it is re-attached and the pointer moves somewhere new
    document.body.appendChild(canvas);
    setClock(3000);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 700, clientY: 550 });
    step(tick, 3000);
    // Then: the listeners were aborted — only the original cells draw
    expect(members(strokes)).toHaveLength(4 * N);
  });
});
