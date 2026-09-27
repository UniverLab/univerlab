/**
 * Tests for the paper runner (src/scripts/bg-paper.ts) — the texforge fibre
 * motif, split out of backgrounds.ts so that module stays within its size
 * budget. Verifies the cursor contract: fibres at rest lie still and draw at
 * their ambient alpha/width; a sweeping pointer nudges the fibres it crosses
 * (directional kick, capped) and bumps their brightness for ~1 s before the
 * sheet returns to the byte-identical idle draw. Touch never stirs; a
 * detached canvas aborts the listeners. Given-When-Then pattern, like
 * field.test.ts and brain.test.ts.
 */
import { paper } from '../scripts/bg-paper';

type PaperCtx = Parameters<typeof paper>[0];

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/**
 * Harness with Math.random pinned to 0.5: every fibre is born at
 * (400, 300), angle π/2, len 11, ambient alpha 0.35 — so ambient and lit
 * draws are directly comparable.
 */
function makeCtx(w = 800, h = 600) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  const clearRect = jest.fn();
  const strokes = jest.fn();
  const moves: Array<{ x: number; y: number }> = [];
  const lines: Array<{ x: number; y: number }> = [];
  const alphas: number[] = [];
  const widths: number[] = [];
  let alpha = 1;
  let width = 1;
  const c = {
    clearRect,
    beginPath: jest.fn(),
    moveTo: jest.fn((x: number, y: number) => moves.push({ x, y })),
    lineTo: jest.fn((x: number, y: number) => lines.push({ x, y })),
    stroke: strokes,
    strokeStyle: '',
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => {
      alphas.push(v);
      alpha = v;
    },
  });
  Object.defineProperty(c, 'lineWidth', {
    get: () => width,
    set: (v: number) => {
      widths.push(v);
      width = v;
    },
  });
  const ctx: PaperCtx = { canvas, c, color: '#6a563e', w, h };
  const reset = () => {
    moves.length = 0;
    lines.length = 0;
    alphas.length = 0;
    widths.length = 0;
    clearRect.mockClear();
    strokes.mockClear();
  };
  /** Fibre centre — endpoints rotate (va), the centre follows the position. */
  const centres = () =>
    moves.map((m, i) => ({ x: (m.x + lines[i].x) / 2, y: (m.y + lines[i].y) / 2 }));
  return { ctx, canvas, moves, lines, alphas, widths, centres, clearRect, strokes, reset, randomSpy };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

/** N at 800×600 — same formula as the runner. */
const N = Math.min(30, Math.max(16, Math.floor((800 * 600) / 34000)));

describe('paper', () => {
  it('the untouched sheet reads as paper: fibres static, at ambient alpha and width', () => {
    // Given: a fresh paper sheet with no pointer input
    const { ctx, centres, alphas, widths, strokes, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    const first = centres();
    reset();
    // When: another frame steps
    tick(33);
    // Then: every fibre still strokes at the same place, alpha 0.35, width 1
    expect(strokes).toHaveBeenCalledTimes(N);
    expect(centres()).toEqual(first);
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.35));
    expect(widths).toEqual(new Array(N).fill(1));
  });

  it('the first move only records the entry — no kick from an off-screen origin', () => {
    // Given: a fresh sheet
    const { ctx, moves, alphas, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    reset();
    // When: the pointer enters exactly over the fibres and a frame steps
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    tick(33);
    // Then: nothing moved and nothing brightened
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.35));
    expect(moves[0].x).toBeCloseTo(400, 6);
  });

  it('a sweep nudges reachable fibres and bumps their brightness (width > 1, alpha lifted)', () => {
    // Given: a sheet whose pointer has entered over the fibres
    const { ctx, centres, alphas, widths, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    tick(33);
    reset();
    // When: the pointer travels and a frame steps
    firePointer('pointermove', { pointerType: 'mouse', clientX: 430, clientY: 330 });
    tick(66);
    // Then: the kick shows — fibres drew at a lifted alpha and thicker line
    expect(Math.max(...alphas.filter((a) => a !== 1))).toBeGreaterThan(0.6);
    expect(Math.max(...widths)).toBeGreaterThan(1);
    // And: the directional nudge actually displaced the fibre centres
    expect(centres()[0].x).toBeGreaterThan(400);
  });

  it('caps the flick so no fibre is flung more than VCAP = 3 px in one frame', () => {
    // Given: a sheet with the pointer seeded at (0, 0)
    const { ctx, centres, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 0, clientY: 0 });
    tick(33);
    reset();
    // When: a screen-wide flick lands on the fibres
    firePointer('pointermove', { pointerType: 'mouse', clientX: 410, clientY: 310 });
    tick(66);
    // Then: the per-frame centre displacement is clamped to VCAP (3)
    const before = { x: 400, y: 300 }; // the pinned spawn point
    const after = centres()[0];
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(3 + 1e-6);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(3 + 1e-6);
  });

  it('the bump decays over ~1 s and the sheet returns to the byte-identical draw', () => {
    // Given: a sheet that was just swept once
    const { ctx, alphas, widths, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    tick(33);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 430, clientY: 330 });
    tick(66);
    // When: 3 s of still frames pass (τ = 400 ms ⇒ glow snaps to 0)
    let t = 66;
    for (let i = 0; i < 60; i++) {
      t += 50;
      reset();
      tick(t);
    }
    // Then: alpha back to exactly 0.35 and lineWidth back to exactly 1
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.35));
    expect(widths).toEqual(new Array(N).fill(1));
  });

  it('ignores touch pointer input — the sheet stays still', () => {
    // Given: a fresh sheet
    const { ctx, moves, alphas, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    const before = [...moves];
    reset();
    // When: a finger sweeps across the fibres
    firePointer('pointermove', { pointerType: 'touch', clientX: 400, clientY: 300 });
    firePointer('pointermove', { pointerType: 'touch', clientX: 500, clientY: 400 });
    tick(33);
    // Then: nothing moved, nothing brightened
    expect(moves).toEqual(before);
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.35));
  });

  it('pointerout re-arms the seed: re-entry over the fibres carries no stale-exit kick', () => {
    // Given: a sheet whose pointer travelled far away from the fibres
    const { ctx, centres, alphas, widths, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 50, clientY: 50 }); // seed
    tick(33);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 750, clientY: 550 }); // far travel, out of reach
    tick(66);
    // When: the pointer leaves and re-enters exactly over the fibres
    firePointer('pointerout', { pointerType: 'mouse', relatedTarget: null });
    firePointer('pointermove', { pointerType: 'mouse', clientX: 405, clientY: 305 });
    reset();
    tick(100);
    // Then: the re-entry frame has zero travel (px re-seeded) — the stale
    // 750→405 exit jump never became a kick: fibres at rest, no bump
    expect(centres()[0].x).toBeCloseTo(400, 6);
    expect(centres()[0].y).toBeCloseTo(300, 6);
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.35));
    expect(widths).toEqual(new Array(N).fill(1));
    // When: the pointer genuinely sweeps from the re-entry point
    firePointer('pointermove', { pointerType: 'mouse', clientX: 425, clientY: 325 });
    reset();
    tick(133);
    // Then: the sweep kicks (20 px travel ⇒ visible nudge + brightness bump)
    expect(Math.max(...alphas.filter((a) => a !== 1))).toBeGreaterThan(0.5);
    expect(centres()[0].x).toBeGreaterThan(400);
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a sheet that has painted
    const { ctx, canvas, clearRect, strokes, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    expect(strokes).toHaveBeenCalledTimes(N);
    reset();
    // When: the canvas leaves the document and frames keep ticking
    canvas.remove();
    tick(33);
    tick(66);
    // Then: no paint happens and listeners are released
    expect(clearRect).not.toHaveBeenCalled();
    expect(strokes).not.toHaveBeenCalled();
    reset();
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(() => tick(99)).not.toThrow();
  });
});
