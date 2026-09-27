// Paper — the quiet motif for the cream `paper` surface (texforge): a scatter
// of short fibres, the flecks in a laid sheet, lying still. The cursor is the
// only input — passing over the stock nudges the fibres it crosses and gives
// them a brief brightness bump that decays over ~1 s; an untouched page reads
// as paper, not as an animation. It is picked in startBackground() by
// `data-surface="paper"` rather than keyed on BgTheme, whose type the
// experiment registry owns (and which is out of scope to extend). The ~30fps
// cap, the resize handling and the hidden-tab pause all come from
// startBackground; prefers-reduced-motion never reaches this module at all,
// because ThemeBackground returns before importing it.

/* The subset of backgrounds.ts `Ctx` that this runner reads, declared locally
   (the same move brain.ts and spotlight.ts made) so the module needs no
   runtime dependency on backgrounds.ts — keep the field names in sync. */
interface PaperCtx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  w: number;
  h: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function paper(ctx: PaperCtx): (t: number) => void {
  const { c } = ctx;
  const N = Math.min(30, Math.max(16, Math.floor((ctx.w * ctx.h) / 34000)));
  type Fibre = { x: number; y: number; a: number; len: number; al: number; vx: number; vy: number; va: number; glow: number };
  const fibres: Fibre[] = Array.from({ length: N }, () => ({
    x: rand(0, ctx.w),
    y: rand(0, ctx.h),
    a: rand(0, Math.PI),
    len: rand(5, 17),
    al: rand(0.2, 0.5),
    vx: 0,
    vy: 0,
    va: 0,
    glow: 0, // pointer-driven brightness bump (0 ⇒ byte-identical ambient draw)
  }));

  // Cursor nudge — fibres within reach pick up a directional kick along the
  // pointer's travel (one impulse per frame) plus a brightness bump that
  // decays in ~1 s; they damp back to rest. The first move only records
  // where the pointer came from, so there is no jump from an off-screen
  // origin. Touch input has no pointer to nudge with — the sheet stays still,
  // and nothing drifts on its own. document-level (not window) so an Astro
  // view transition cannot leave a ghost listener behind.
  const REACH = 170;
  const GAIN = 0.16;    // directional kick on touched fibres (~3× today's)
  const VCAP = 3;       // px/frame velocity cap so a hard flick cannot fling a fibre
  let px = 0;
  let py = 0;
  let nx = 0;
  let ny = 0;
  let seen = false;
  let hasPointer = false;
  const ac = new AbortController();
  document.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      // Map viewport → canvas-local (no-op on the fixed full-bleed page canvas
      // where rect.left/top are 0; required for correctness if ever mounted in
      // a card). Re-entry after pointerout re-seeds px/py so the stale exit→
      // entry jump never becomes a spurious velocity kick (VCAP would cap it,
      // but zero travel is the house pattern: field.ts / drift).
      const rect = ctx.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (!seen || !hasPointer) {
        px = x;
        py = y;
        nx = x;
        ny = y;
        seen = true;
      } else {
        nx = x;
        ny = y;
      }
      hasPointer = true;
    },
    { passive: true, signal: ac.signal }
  );
  document.addEventListener(
    'pointerout',
    (e: PointerEvent) => {
      if (!e.relatedTarget) hasPointer = false;
    },
    { passive: true, signal: ac.signal }
  );
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  let prevT = 0;
  return (t) => {
    if (!ctx.canvas.isConnected) {
      ac.abort();
      return;
    }
    const dt = prevT ? t - prevT : 16;
    prevT = t;
    if (hasPointer && seen) {
      const dx = nx - px;
      const dy = ny - py;
      if (dx || dy) {
        for (const f of fibres) {
          const d = Math.hypot(f.x - nx, f.y - ny);
          if (d >= REACH) continue;
          const k = 1 - d / REACH;
          f.vx = clamp(f.vx + dx * k * GAIN, -VCAP, VCAP);
          f.vy = clamp(f.vy + dy * k * GAIN, -VCAP, VCAP);
          f.va += (dx + dy) * k * 0.00012;          // visible reorientation
          f.glow = Math.max(f.glow, 0.4 + 0.6 * k); // brightness bump, hottest at the cursor
        }
      }
      px = nx;
      py = ny;
    }
    // Frame-rate independent glow decay (τ = 400 ms ⇒ ~1 s); a bare `*= 0.94`
    // would silently double under the 30fps cap and worse if it ever changed.
    for (const f of fibres) {
      f.glow *= Math.exp(-dt / 400);
      if (f.glow < 0.004) f.glow = 0; // ⇒ exactly lineWidth 1 and alpha f.al
    }

    c.clearRect(0, 0, ctx.w, ctx.h);
    c.strokeStyle = ctx.color;
    for (const f of fibres) {
      f.x += f.vx;
      f.y += f.vy;
      f.a += f.va;
      f.vx *= 0.9;
      f.vy *= 0.9;
      f.va *= 0.9;
      if (f.x < -20) f.x += ctx.w + 40;
      else if (f.x > ctx.w + 20) f.x -= ctx.w + 40;
      if (f.y < -20) f.y += ctx.h + 40;
      else if (f.y > ctx.h + 20) f.y -= ctx.h + 40;
      const ca = Math.cos(f.a) * f.len;
      const sa = Math.sin(f.a) * f.len;
      // When glow === 0 both reads reduce exactly to today's values:
      //   lineWidth = 1, globalAlpha = f.al — idle look byte-identical.
      c.lineWidth = 1 + f.glow;
      c.globalAlpha = f.al + (0.95 - f.al) * f.glow;
      c.beginPath();
      c.moveTo(f.x - ca, f.y - sa);
      c.lineTo(f.x + ca, f.y + sa);
      c.stroke();
    }
    c.globalAlpha = 1;
  };
}
