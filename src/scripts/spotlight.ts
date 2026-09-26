/** Cursor-anchored spotlight for the scaffold lattice (ghscaff · midnight).
 *  One radial violet-white wash that lerps toward the pointer and parks at
 *  50%/30% otherwise. Split out of backgrounds.ts to keep that module within
 *  its size budget. Reduced motion never reaches here (ThemeBackground
 *  returns before importing the runners). */

interface SpotCtx {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

export function createSpotlight(ctx: SpotCtx) {
  let tx = ctx.w * 0.5;
  let ty = ctx.h * 0.3;
  let sx = tx;
  let sy = ty;
  let hasPointer = false;
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  // Pointer listeners are attached on every device, but touch *input* is
  // ignored: a tap never drags the wash (it parks at 50%/30%) and has no side
  // effects. Keying off the device instead of the event would drop the
  // spotlight entirely on hybrid touch laptops (maxTouchPoints > 0 + a real
  // mouse), where the cursor-anchored spotlight is the point.
  if (typeof document !== 'undefined') {
    document.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        tx = e.clientX;
        ty = e.clientY;
        hasPointer = true;
      },
      { passive: true, signal: ac?.signal }
    );
    // `pointerleave` does not bubble and never targets `document`, so it would
    // never fire here; `pointerout` bubbles and a null relatedTarget means the
    // pointer left the window — park the wash back at 50%/30%.
    document.addEventListener(
      'pointerout',
      (e: PointerEvent) => {
        if (!e.relatedTarget) hasPointer = false;
      },
      { passive: true, signal: ac?.signal }
    );
  }
  return {
    /** Advance the lerp. Returns the smoothed center, or null once the
     *  canvas has been detached from the DOM (listeners abort with it). */
    step(): { x: number; y: number } | null {
      if (!ctx.canvas.isConnected) {
        ac?.abort();
        return null;
      }
      if (!hasPointer) {
        tx = ctx.w * 0.5;
        ty = ctx.h * 0.3;
      }
      sx += (tx - sx) * 0.08;
      sy += (ty - sy) * 0.08;
      return { x: sx, y: sy };
    },
    /** ONE violet-white wash over the grid, under content: single radial
     *  gradient, composited additively on the dark. */
    paint(c: CanvasRenderingContext2D, x: number, y: number) {
      const R = 420;
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 1;
      const grad = c.createRadialGradient(x, y, 0, x, y, R);
      grad.addColorStop(0, 'rgba(167,139,250,0.10)');
      grad.addColorStop(1, 'rgba(167,139,250,0)');
      c.fillStyle = grad;
      c.fillRect(x - R, y - R, R * 2, R * 2);
      c.globalCompositeOperation = 'source-over';
    },
  };
}
