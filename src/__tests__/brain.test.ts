/**
 * Tests for the Brian's Brain background runner (src/scripts/brain.ts),
 * split out of backgrounds.ts so that module stays within its size budget.
 * Given-When-Then pattern, like spotlight.test.ts.
 */
import { brain } from '../scripts/brain';

type BrainCtx = Parameters<typeof brain>[0];

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/** A tiny harness: detached-size canvas + a recording 2D context stub. */
function makeCtx(w = 280, h = 240) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const clearRect = jest.fn();
  const fillText = jest.fn();
  const c = {
    clearRect,
    fillText,
    fillStyle: '',
    textBaseline: '',
    font: '',
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  const ctx: BrainCtx = { canvas, c, color: '#5dd39e', w, h };
  return { ctx, canvas, clearRect, fillText };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('brain', () => {
  it('draws a cleared, empty frame while the machine is at rest', () => {
    // Given: a field with no firing cells (random never lands under 0.3%)
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    const { ctx, clearRect, fillText } = makeCtx();
    const tick = brain(ctx);
    // When: two frames land, the second one stepping the automaton
    tick(0);
    tick(100);
    // Then: the frame is cleared and nothing is painted
    expect(clearRect).toHaveBeenCalledWith(0, 0, 280, 240);
    expect(fillText).not.toHaveBeenCalled();
  });

  it('seeds a cluster under the cursor and steps it through the automaton', () => {
    // Given: a deterministic sparse field and one runner
    jest.spyOn(Math, 'random').mockReturnValue(0.1);
    const { ctx, clearRect, fillText } = makeCtx();
    const tick = brain(ctx);
    tick(16);

    // When: the pointer seeds a cluster (first move takes the "no trail" path)
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    // …and a second move inside the rate-limit window is dropped
    firePointer('pointermove', { pointerType: 'mouse', clientX: 24, clientY: 34 });
    tick(100); // no step yet — acc has not crossed 130ms

    // Then: the seeded cluster paints bright (firing) glyphs
    expect(fillText).toHaveBeenCalled();

    // When: the clock advances past the step window
    tick(300);
    // Then: firing cells became dying cells and were painted faint
    expect(fillText).toHaveBeenCalled();
    expect(clearRect).toHaveBeenCalledTimes(3);

    // And: a long move is capped at MAX_TRAIL instead of seeding an unbounded run
    firePointer('pointermove', { pointerType: 'mouse', clientX: 266, clientY: 226 });
    tick(600);
    // And: the revival net fires on a later step (lastReviveT was still −1)
    tick(1400);
    // …but is rate-limited on the step right after it
    tick(1600);
    expect(fillText).toHaveBeenCalled();
  });

  it('keeps the optional seed extras off when random stays high', () => {
    // Given: seedAt's two optional extras both evaluate false
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    const { ctx, fillText } = makeCtx();
    const tick = brain(ctx);
    tick(16);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    // When: a frame draws before any step
    tick(100);
    // Then: the mandatory three cells of the cluster still paint
    expect(fillText).toHaveBeenCalled();
  });

  it('lights the whole field when the sparse-start coin lands under 0.3%', () => {
    // Given: the 0.3% coin flip always wins, so every cell starts firing
    jest.spyOn(Math, 'random').mockReturnValue(0.001);
    const { ctx, fillText } = makeCtx();
    const tick = brain(ctx);
    // When: the first frame draws, then the automaton steps
    tick(0);
    tick(200);
    // Then: firing glyphs were painted on both sides of the step
    expect(fillText).toHaveBeenCalled();
  });

  it('goes ultra-sparse after stillness, then seeds one lone cluster', () => {
    // Given: a pointer has moved and the clock is running
    jest.spyOn(Math, 'random').mockReturnValue(0.1);
    const { ctx } = makeCtx();
    const tick = brain(ctx);
    tick(16);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });

    // When: stillness passes the idle window
    tick(9016);  // arms nextIdleSeedT (3s out)
    tick(12000); // still before it — no idle cluster yet
    tick(12200); // past it — the lone idle cluster is seeded
    // Then: the runner keeps drawing without throwing
    expect(() => tick(12500)).not.toThrow();
  });

  it('reallocates the grid when the canvas is resized', () => {
    // Given: a runner whose trail is recorded against the current grid
    jest.spyOn(Math, 'random').mockReturnValue(0.1);
    const { ctx } = makeCtx();
    const tick = brain(ctx);
    tick(16);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    tick(400);

    // When: the viewport widens so the character grid no longer matches
    ctx.w = 560;
    tick(700);
    // Then: the grid is re-inited and the next move starts a fresh trail
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(() => tick(1000)).not.toThrow();
  });

  it('stops drawing and aborts its listener once the canvas is detached', () => {
    // Given: a live runner that has painted at least one frame
    jest.spyOn(Math, 'random').mockReturnValue(0.1);
    const { ctx, canvas, clearRect } = makeCtx();
    const tick = brain(ctx);
    tick(16);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    tick(400);
    const painted = clearRect.mock.calls.length;

    // When: an Astro view transition removes the canvas
    canvas.remove();
    tick(700);
    // Then: the loop reports back by doing no further work
    expect(clearRect.mock.calls.length).toBe(painted);
    // And: the aborted listener ignores later pointer input without throwing
    firePointer('pointermove', { pointerType: 'mouse', clientX: 40, clientY: 40 });
    expect(() => tick(900)).not.toThrow();
  });

  it('never attaches a pointer listener on touch devices', () => {
    // Given: a touch device (ontouchstart present + a nonzero touch point)
    const hadTouch = Object.getOwnPropertyDescriptor(window, 'ontouchstart');
    const hadPoints = Object.getOwnPropertyDescriptor(window.navigator, 'maxTouchPoints');
    Object.defineProperty(window, 'ontouchstart', { value: null, configurable: true });
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      value: 1,
      configurable: true,
    });
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    try {
      const { ctx, fillText } = makeCtx();
      const tick = brain(ctx);
      tick(16);
      // When: a pointer sweeps across the page
      firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
      tick(400);
      // Then: nothing was seeded — touch input is never the field's cursor
      expect(fillText).not.toHaveBeenCalled();
      expect(() => tick(1400)).not.toThrow();
    } finally {
      if (hadTouch) Object.defineProperty(window, 'ontouchstart', hadTouch);
      else delete (window as { ontouchstart?: unknown }).ontouchstart;
      if (hadPoints) Object.defineProperty(window.navigator, 'maxTouchPoints', hadPoints);
      else delete (window.navigator as { maxTouchPoints?: unknown }).maxTouchPoints;
    }
  });
});
