// Drift — a calm field of slow particles in the essence color. Default.
// The cursor is the only input: a sweep pushes the motes it passes along the
// path and flashes them brighter for ~1 s (field.ts's lerp stir, tuned up for
// 1–2 px motes), then the field settles back to its quiet drift. Touch never
// stirs. Extracted from backgrounds.ts (DemoStage).

/* The subset of backgrounds.ts `Ctx` that this runner reads, declared locally
   (the same move brain.ts and spotlight.ts made) so the module needs no
   runtime dependency on backgrounds.ts — keep the field names in sync. */
interface DriftCtx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  w: number;
  h: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function drift(ctx: DriftCtx): (t: number) => void {
  const { c } = ctx;
  const N = Math.min(54, Math.floor((ctx.w * ctx.h) / 26000));
  // Mote shape borrowed from field.ts: each mote carries its own idle drift
  // (ix, iy) so the cursor stir is an *excess* over rest and an untouched
  // field keeps breathing — quiet, but never frozen. Identical distribution
  // to the previous version ⇒ idle look unchanged. `glow` is the pointer
  // brightness bump (0 ⇒ the draw is exactly today's 0.7).
  type Mote = { x: number; y: number; vx: number; vy: number; ix: number; iy: number; s: number; glow: number };
  const ps: Mote[] = Array.from({ length: N }, () => {
    const ix = rand(-0.18, 0.18);
    const iy = rand(-0.18, 0.18);
    return {
      x: Math.random() * ctx.w,
      y: Math.random() * ctx.h,
      vx: ix,
      vy: iy,
      ix,
      iy,
      s: rand(0.8, 1.8),
      glow: 0,
    };
  });
  // Cursor stir — field.ts pattern, tuned up until the wake reads at 1080p:
  // 1–2 px motes need a wider reach, a harder impulse and a brighter flash
  // than field's (which also carries a link network to sell the reaction —
  // drift has nothing but the motes). document-level so an Astro view
  // transition cannot leave a ghost listener behind.
  const REACH = 300;
  const GAIN = 0.11;
  const CAP = 2.2;        // px/frame cap — a hard flick cannot teleport a mote
  const EASE = 0.965;     // excess decays; p.vx === p.ix ⇒ identity, idle untouched.
                          // 0.965 ⇒ the wake is quiet again ~2 s after the pointer
                          // stops (0.975, field's value, left motes stirring ~4 s).
  const GLOW_TAU = 550;   // ms — frame-rate independent decay of the stir flash
  let lastX = ctx.w * 0.5;
  let lastY = ctx.h * 0.3;
  let targetX = lastX;
  let targetY = lastY;
  let smoothX = lastX;
  let smoothY = lastY;
  let hasPointer = false;
  const ac = new AbortController();
  document.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      // Map viewport → canvas-local so the small Home card canvases (absolute
      // inset-0 within the card) stir the motes under the cursor; on the
      // fixed full-bleed page canvas rect.left/top are 0 so this is a no-op.
      const rect = ctx.canvas.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      if (!hasPointer) {
        // First move after entering the window: seed the sampled position so
        // re-entry reads as zero travel instead of a screen-wide burst.
        lastX = lx;
        lastY = ly;
      }
      targetX = lx;
      targetY = ly;
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
  let prevT = 0;
  return (t) => {
    if (!ctx.canvas.isConnected) {
      ac.abort();
      return;
    }
    const dt = prevT ? t - prevT : 16;
    prevT = t;
    // Travel since the last frame is the stir impulse — only while the
    // pointer is actually in the window. Parked: influence is 0, and the
    // smoothed point glides back to 50%/30% (house pattern) without stirring
    // anything on the way there.
    let dxm = 0;
    let dym = 0;
    if (hasPointer) {
      dxm = targetX - lastX;
      dym = targetY - lastY;
    } else {
      targetX = ctx.w * 0.5;
      targetY = ctx.h * 0.3;
    }
    lastX = targetX;
    lastY = targetY;
    smoothX += (targetX - smoothX) * 0.08;
    smoothY += (targetY - smoothY) * 0.08;

    c.clearRect(0, 0, ctx.w, ctx.h);
    c.fillStyle = ctx.color;
    // Frame-rate independent flash decay (τ = 550 ms ⇒ ~1 s to settle); a
    // bare `*= 0.94` would silently double under the 30fps cap.
    const glowDecay = Math.exp(-dt / GLOW_TAU);
    for (const p of ps) {
      const d = Math.hypot(p.x - smoothX, p.y - smoothY);
      if (hasPointer && d < REACH) {
        const k = 1 - d / REACH;
        p.vx += dxm * k * GAIN;
        p.vy += dym * k * GAIN;
        // Only actual pointer travel lights a mote, so a *parked* cursor
        // leaves no static bright patch — the flash exists while moving.
        if (dxm || dym) p.glow = Math.max(p.glow, 0.35 + 0.65 * k);
      }
      p.glow *= glowDecay;
      if (p.glow < 0.004) p.glow = 0; // ⇒ exactly 0.7 alpha, exactly p.s
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > CAP) {
        p.vx = (p.vx / sp) * CAP;
        p.vy = (p.vy / sp) * CAP;
      }
      // Ease the *excess* over rest back toward idle: with p.vx === p.ix
      // this is an identity, so the ambient field is byte-identical to
      // before. EASE = 0.965 ⇒ wake settles in ~2 s at the 30fps cap.
      p.vx = p.ix + (p.vx - p.ix) * EASE;
      p.vy = p.iy + (p.vy - p.iy) * EASE;
      p.x = (p.x + p.vx + ctx.w) % ctx.w;
      p.y = (p.y + p.vy + ctx.h) % ctx.h;
      // glow === 0 ⇒ exactly today's 0.7 and today's radius, so an untouched
      // field is unchanged; lit motes also swell slightly — on a 0.68 canvas
      // a 1 px dot needs the extra ink to read at all.
      c.globalAlpha = 0.7 + 0.3 * p.glow;
      c.beginPath();
      c.arc(p.x, p.y, p.s + p.glow * 1.1, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  };
}
