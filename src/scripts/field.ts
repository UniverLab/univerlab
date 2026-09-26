/** Field — the home page's living background: cosmic motes at rest, stirred by
 *  the cursor. A quiet baseline drift (no gravity well) keeps the field alive
 *  when untouched; pointer movement injects local velocity into nearby motes
 *  and lights the faint links, so the field responds, then settles. Selected
 *  inside backgrounds.ts `cosmic` only for the home page
 *  (documentElement[data-page='home']): the BgTheme union is owned by the
 *  experiment registry (out of scope to extend), same as the PAPER selection.
 *  Reduced motion never reaches here (ThemeBackground returns before
 *  importing). The ~30fps cap, the resize handling and the hidden-tab pause
 *  all come from startBackground.
 *  Split out of backgrounds.ts to keep that module within its size budget. */

/* The subset of backgrounds.ts `Ctx` that this runner reads, declared locally
   (the same move brain.ts and spotlight.ts made) so the module needs no
   runtime dependency on backgrounds.ts — keep the field names in sync. */
interface FieldCtx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  w: number;
  h: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function field(ctx: FieldCtx): (t: number) => void {
  const { c } = ctx;
  const N = Math.min(90, Math.floor((ctx.w * ctx.h) / 16000));
  // Every mote owns an idle drift (|v| ≤ 0.08): its rest state. A stirred
  // mote eases back to it instead of to a dead stop, so an untouched field
  // keeps breathing — quiet, but never frozen.
  type Mote = { x: number; y: number; vx: number; vy: number; ix: number; iy: number; s: number };
  const motes: Mote[] = Array.from({ length: N }, () => {
    const a = rand(0, Math.PI * 2);
    const iv = rand(0.03, 0.08);
    const ix = Math.cos(a) * iv;
    const iy = Math.sin(a) * iv;
    return {
      x: rand(0, ctx.w),
      y: rand(0, ctx.h),
      vx: ix,
      vy: iy,
      ix,
      iy,
      s: rand(0.6, 1.6),
    };
  });

  // Cursor stir — last-move delta like PAPER's fibre stir: motes within
  // REACH pick up a single impulse along the pointer's travel, then ease back
  // to their own idle drift (bubbles' vy0 pattern). Touch input never stirs —
  // the field stays at idle. The lerped (smoothX, smoothY) is what counts as
  // "the cursor" for impulse range so the effect trails the pointer softly.
  const REACH = 160;
  let lastX = ctx.w * 0.5;
  let lastY = ctx.h * 0.3;
  let targetX = lastX;
  let targetY = lastY;
  let smoothX = lastX;
  let smoothY = lastY;
  let hasPointer = false;
  let pointerActivity = 0.35;
  const ac = new AbortController();
  document.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (!hasPointer) {
        // First move after entering the window: seed the sampled position so
        // re-entry reads as zero travel instead of a screen-wide burst.
        lastX = e.clientX;
        lastY = e.clientY;
      }
      targetX = e.clientX;
      targetY = e.clientY;
      hasPointer = true;
      pointerActivity = 1; // newest move → links bright
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

  return () => {
    if (!ctx.canvas.isConnected) {
      ac.abort();
      return;
    }
    // Travel since the last frame is the stir impulse — but only while the
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
    // pointerActivity decays from 1 on move toward 0.35 by default
    pointerActivity = 0.35 + (pointerActivity - 0.35) * 0.97;

    c.clearRect(0, 0, ctx.w, ctx.h);
    for (const p of motes) {
      const dxs = p.x - smoothX;
      const dys = p.y - smoothY;
      const d = Math.hypot(dxs, dys);
      if (hasPointer && d < REACH) {
        const k = 1 - d / REACH;
        p.vx += dxm * k * 0.05;
        p.vy += dym * k * 0.05;
      }
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 0.6) {
        p.vx = (p.vx / sp) * 0.6;
        p.vy = (p.vy / sp) * 0.6;
      }
      // Ease back to this mote's idle drift: only the excess over rest decays
      // (0.985/frame ≈ 0.64× per second at the 30fps cap), so a stirred field
      // settles and an untouched one keeps drifting.
      p.vx = p.ix + (p.vx - p.ix) * 0.985;
      p.vy = p.iy + (p.vy - p.iy) * 0.985;
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -20) p.x += ctx.w + 40;
      else if (p.x > ctx.w + 20) p.x -= ctx.w + 40;
      if (p.y < -20) p.y += ctx.h + 40;
      else if (p.y > ctx.h + 20) p.y -= ctx.h + 40;
    }
    // Faint links — alpha lifted by cursor activity, same threshold (90^2)
    // as cosmic. ctx.color is read live (no destructuring) so the circadian
    // palette passes through on every tick.
    c.strokeStyle = ctx.color;
    c.globalAlpha = 0.05 * (0.5 + 0.5 * pointerActivity);
    for (let i = 0; i < motes.length; i++) {
      for (let j = i + 1; j < motes.length; j++) {
        const dx = motes[i].x - motes[j].x;
        const dy = motes[i].y - motes[j].y;
        if (dx * dx + dy * dy < 9000) {
          c.beginPath();
          c.moveTo(motes[i].x, motes[i].y);
          c.lineTo(motes[j].x, motes[j].y);
          c.stroke();
        }
      }
    }
    c.globalAlpha = 0.7;
    c.fillStyle = ctx.color;
    for (const p of motes) {
      c.beginPath();
      c.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  };
}
