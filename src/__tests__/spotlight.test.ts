/**
 * Tests for the cursor-anchored spotlight (src/scripts/spotlight.ts)
 * Using Given-When-Then (GWT) pattern for clear test documentation
 */
import { createSpotlight } from '../scripts/spotlight';

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

function makeCtx(w = 1000, h = 800) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return { canvas, w, h };
}

describe('createSpotlight', () => {
  it('parks at 50%/30% until a pointer arrives', () => {
    // Given: a fresh spotlight and no pointer input
    const ctx = makeCtx();
    const spot = createSpotlight(ctx);
    // When: a frame is stepped
    const pos = spot.step();
    // Then: the wash sits at the parked anchor
    expect(pos).toEqual({ x: 500, y: 240 });
  });

  it('lerps toward a mouse pointer after pointermove', () => {
    // Given: a fresh spotlight
    const ctx = makeCtx();
    const spot = createSpotlight(ctx);
    // When: a non-touch pointer moves to (0, 0) and frames are stepped
    firePointer('pointermove', { pointerType: 'mouse', clientX: 0, clientY: 0 });
    let pos = spot.step()!;
    // Then: the wash starts moving toward the pointer but does not snap
    expect(pos.x).toBeLessThan(500);
    expect(pos.x).toBeGreaterThan(0);
    // And: with enough frames it converges close to the pointer
    for (let i = 0; i < 200; i++) pos = spot.step()!;
    expect(pos.x).toBeCloseTo(0, 0);
    expect(pos.y).toBeCloseTo(0, 0);
  });

  it('ignores touch pointer input', () => {
    // Given: a fresh spotlight
    const ctx = makeCtx();
    const spot = createSpotlight(ctx);
    // When: a touch drag moves across the page
    firePointer('pointermove', { pointerType: 'touch', clientX: 10, clientY: 10 });
    // Then: the wash stays parked
    expect(spot.step()).toEqual({ x: 500, y: 240 });
  });

  it('re-parks when the pointer leaves the window (pointerout, no relatedTarget)', () => {
    // Given: a spotlight tracking a mouse pointer
    const ctx = makeCtx();
    const spot = createSpotlight(ctx);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 900, clientY: 700 });
    for (let i = 0; i < 200; i++) spot.step();
    // When: the pointer exits the window and a pointerout arrives mid-hover
    firePointer('pointerout', { relatedTarget: null });
    firePointer('pointerout', { relatedTarget: document.body });
    // Then: the null-relatedTarget exit parked the wash back at 50%/30%
    let pos = spot.step()!;
    expect(pos.x).toBeLessThan(900);
    for (let i = 0; i < 300; i++) pos = spot.step()!;
    expect(pos.x).toBeCloseTo(500, 6);
    expect(pos.y).toBeCloseTo(240, 6);
  });

  it('returns null and aborts listeners once the canvas is detached', () => {
    // Given: a spotlight tracking a mouse pointer
    const ctx = makeCtx();
    const spot = createSpotlight(ctx);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 100 });
    spot.step();
    // When: the canvas is removed and frames keep ticking
    ctx.canvas.remove();
    const first = spot.step();
    // Then: the loop is told to stop
    expect(first).toBeNull();
    // And: later pointer input no longer mutates any state (listeners aborted)
    firePointer('pointermove', { pointerType: 'mouse', clientX: 0, clientY: 0 });
    expect(spot.step()).toBeNull();
  });

  it('paints one additive violet wash and restores the composite state', () => {
    // Given: a mock 2D context with a gradient stub
    const stops: Array<[number, string]> = [];
    const grad = { addColorStop: jest.fn((o: number, c: string) => stops.push([o, c])) };
    const c = {
      globalCompositeOperation: 'source-over',
      globalAlpha: 0.5,
      fillStyle: null as unknown,
      createRadialGradient: jest.fn(() => grad),
      fillRect: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const ctx = makeCtx();
    const spot = createSpotlight(ctx);
    // When: the wash is painted at (10, 20)
    spot.paint(c, 10, 20);
    // Then: a single radial gradient is filled with 'lighter' and reset after
    expect(c.createRadialGradient).toHaveBeenCalledWith(10, 20, 0, 10, 20, 420);
    expect(stops[0]).toEqual([0, 'rgba(167,139,250,0.10)']);
    expect(stops[1]).toEqual([1, 'rgba(167,139,250,0)']);
    expect(c.fillRect).toHaveBeenCalledWith(10 - 420, 20 - 420, 840, 840);
    expect(c.globalCompositeOperation).toBe('source-over');
    expect(c.globalAlpha).toBe(1);
  });
});
