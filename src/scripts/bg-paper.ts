// Paper — the quiet motif for the cream `paper` surface (texforge): a sparse
// scatter of drifting typographic ink marks — short LaTeX tokens set in the
// mono font, cross-fading in and out like a proof being set. The cursor is the
// only stir — passing over the stock nudges the marks it crosses and gives
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

const TOKENS = ['\\begin', '\\end', '{}', '$', '\\ref', '[htbp]', '0.618', '\\to'];

export function paper(ctx: PaperCtx): (t: number) => void {
  const { c } = ctx;
  const N = Math.min(18, Math.max(12, Math.floor((ctx.w * ctx.h) / 68000)));
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  type Mark = {
    tok: string;
    x: number;
    y: number;
    a: number;
    size: number;
    al: number;
    ix: number;
    iy: number;
    ia: number;
    vx: number;
    vy: number;
    va: number;
    glow: number;
    age: number;
    life: number;
  };
  const pick = () => TOKENS[Math.floor(Math.random() * TOKENS.length)];
  const marks: Mark[] = Array.from({ length: N }, (_, i) => {
    const life = rand(7000, 14000);
    return {
      tok: pick(),
      x: rand(0, ctx.w),
      y: rand(0, ctx.h),
      a: ((i % 7) - 3) * 0.05,
      size: rem * rand(0.9, 1.3),
      al: rand(0.05, 0.12),
      ix: ((i % 5) - 2) * 0.035,
      iy: ((i % 3) - 1) * 0.035,
      ia: ((i % 7) - 3) * 0.0003,
      vx: 0,
      vy: 0,
      va: 0,
      glow: 0, // pointer-driven brightness bump (0 ⇒ pure ambient draw)
      age: rand(0, life),
      life,
    };
  });

  // Cursor nudge — marks within reach pick up a directional kick along the
  // pointer's travel (one impulse per frame) plus a brightness bump that
  // decays in ~1 s; they damp back to their idle drift. The first move only
  // records where the pointer came from, so there is no jump from an
  // off-screen origin. Touch input has no pointer to nudge with — the sheet
  // keeps its own quiet drift, and nothing else stirs it. document-level (not
  // window) so an Astro view transition cannot leave a ghost listener behind.
  const REACH = 170;
  const GAIN = 0.16;    // directional kick on touched marks (~3× the old fibres')
  const VCAP = 3;       // px/frame velocity cap so a hard flick cannot fling a mark
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
        for (const m of marks) {
          const d = Math.hypot(m.x - nx, m.y - ny);
          if (d >= REACH) continue;
          const k = 1 - d / REACH;
          m.vx = clamp(m.vx + dx * k * GAIN, -VCAP, VCAP);
          m.vy = clamp(m.vy + dy * k * GAIN, -VCAP, VCAP);
          m.va += (dx + dy) * k * 0.00012;          // visible reorientation
          m.glow = Math.max(m.glow, 0.4 + 0.6 * k); // brightness bump, hottest at the cursor
        }
      }
      px = nx;
      py = ny;
    }
    // Frame-rate independent glow decay (τ = 400 ms ⇒ ~1 s); a bare `*= 0.94`
    // would silently double under the 30fps cap and worse if it ever changed.
    for (const m of marks) {
      m.glow *= Math.exp(-dt / 400);
      if (m.glow < 0.004) m.glow = 0; // ⇒ exactly m.al * env
    }

    c.clearRect(0, 0, ctx.w, ctx.h);
    c.fillStyle = ctx.color; // bistre comes from backgrounds.ts — never hardcoded
    c.textBaseline = 'top';
    for (const m of marks) {
      // Cross-fade clock — the proof being set. The increment is clamped so a
      // huge dt after a hidden-tab pause cannot mass-respawn every mark (which
      // would blank the sheet for the 1.5 s fade-in); glow decay above is safe
      // unclamped (a huge dt just settles it to 0).
      m.age += Math.min(dt, 250);
      if (m.age >= m.life) {
        m.tok = pick();
        m.x = rand(0, ctx.w);
        m.y = rand(0, ctx.h);
        m.life = rand(7000, 14000);
        m.age = 0;
        m.glow = 0;
        m.vx = m.ix;
        m.vy = m.iy;
        m.va = m.ia;
      }
      const env = Math.min(1, m.age / 1500) * Math.min(1, (m.life - m.age) / 1500);
      // Excess velocity damps back to the idle drift (drift.ts EASE pattern);
      // the position updates in the same frame as the cursor kick above, so a
      // sweep displaces its marks immediately (well inside the 0.5 s bar).
      m.vx = m.ix + (m.vx - m.ix) * 0.9;
      m.vy = m.iy + (m.vy - m.iy) * 0.9;
      m.va = m.ia + (m.va - m.ia) * 0.9;
      m.x += m.vx;
      m.y += m.vy;
      m.a += m.va;
      if (m.x < -140) m.x += ctx.w + 280;
      else if (m.x > ctx.w + 140) m.x -= ctx.w + 280;
      if (m.y < -50) m.y += ctx.h + 100;
      else if (m.y > ctx.h + 50) m.y -= ctx.h + 100;
      c.save();
      c.font = `${m.size}px ui-monospace, "DejaVu Sans Mono", monospace`; // brain.ts stack
      // When glow === 0 the read reduces exactly to ambient: m.al * env.
      c.globalAlpha = Math.min(0.5, m.al * env + m.glow * 0.33);
      c.translate(m.x, m.y);
      c.rotate(m.a);
      c.fillText(m.tok, 0, 0);
      c.restore();
    }
    c.globalAlpha = 1;
  };
}
