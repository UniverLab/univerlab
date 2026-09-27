/**
 * Tests for the home page's cursor-seeded living field (src/scripts/field.ts),
 * split out of backgrounds.ts so that module stays within its size budget.
 * Given-When-Then pattern, like brain.test.ts and spotlight.test.ts.
 */
import { field } from '../scripts/field';

type FieldCtx = Parameters<typeof field>[0];

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/** A tiny harness: attached canvas + a recording 2D context stub. */
function makeCtx(w = 800, h = 600) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const clearRect = jest.fn();
  const fill = jest.fn();
  const stroke = jest.fn();
  const alphas: number[] = [];
  let alpha = 1;
  const c = {
    clearRect,
    fill,
    stroke,
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn(),
    strokeStyle: '',
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => {
      alphas.push(v);
      alpha = v;
    },
  });
  const ctx: FieldCtx = { canvas, c, color: '#e6c84a', w, h };
  // The link alpha is the only value below 0.5 the runner ever assigns.
  const linkAlpha = () => Math.max(...alphas.filter((a) => a < 0.5), 0);
  const reset = () => {
    alphas.length = 0;
    clearRect.mockClear();
    fill.mockClear();
    stroke.mockClear();
  };
  return { ctx, canvas, clearRect, fill, stroke, linkAlpha, reset };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('field', () => {
  it('keeps the field alive at idle: ticks clear, draw motes and hold the quiet link alpha', () => {
    // Given: a fresh field with no pointer input
    const { ctx, clearRect, fill, linkAlpha } = makeCtx();
    const tick = field(ctx);
    // When: frames are stepped
    tick(0);
    tick(33);
    // Then: the canvas is repainted and every mote is drawn
    // (N = min(90, w*h/16000) motes per frame at 800×600 → 30)
    const N = Math.min(90, Math.floor((800 * 600) / 16000));
    expect(clearRect).toHaveBeenCalledTimes(2);
    expect(fill).toHaveBeenCalledTimes(2 * N);
    // And: links render at the resting alpha (activity 0.35), never the
    // cursor-bright one
    expect(linkAlpha()).toBeCloseTo(0.05 * (0.5 + 0.5 * 0.35), 6);
  });

  it('brightens the links while a mouse pointer travels', () => {
    // Given: a fresh field
    const { ctx, fill, stroke, linkAlpha, reset } = makeCtx();
    const tick = field(ctx);
    reset();
    // When: a non-touch pointer moves across the window and a frame is stepped
    firePointer('pointermove', { pointerType: 'mouse', clientX: 40, clientY: 60 });
    tick(0);
    // Then: the field still paints
    expect(fill).toHaveBeenCalled();
    // And: link alpha is lifted above the resting baseline
    expect(linkAlpha()).toBeGreaterThan(0.05 * (0.5 + 0.5 * 0.35));
  });

  it('ignores touch pointer input — a tap never stirs the field', () => {
    // Given: a fresh field
    const { ctx, linkAlpha, reset } = makeCtx();
    const tick = field(ctx);
    reset();
    // When: a touch pointer sweeps the window
    firePointer('pointermove', { pointerType: 'touch', clientX: 40, clientY: 60 });
    tick(0);
    // Then: the links stay at the resting alpha
    expect(linkAlpha()).toBeCloseTo(0.05 * (0.5 + 0.5 * 0.35), 6);
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a fresh field that has drawn at least once
    const { ctx, canvas, clearRect, fill, reset } = makeCtx();
    const tick = field(ctx);
    tick(0);
    expect(fill).toHaveBeenCalled();
    reset();
    // When: the canvas leaves the document and frames keep ticking
    canvas.remove();
    tick(0);
    tick(33);
    // Then: no paint happens and listeners are released
    expect(clearRect).not.toHaveBeenCalled();
    expect(fill).not.toHaveBeenCalled();
    reset();
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(() => tick(66)).not.toThrow();
  });
});
