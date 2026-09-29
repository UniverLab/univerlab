// Paper — the quiet motif for the cream `paper` surface (texforge): a sparse
// scatter of drifting typographic ink marks — short LaTeX tokens set in the
// mono font, cross-fading in and out like a proof being set — plus the
// product's own act as the cursor's language. A sweep lays LaTeX SOURCE
// fragments along its path (mono, grey, at most one per 220 ms) and ~550 ms
// later each one compiles: a 250 ms cross-fade into its typeset form in the
// page's serif, bistre ink, while its y eases onto the nearest line of an
// invisible 28 px baseline grid over 180 ms. The set line then holds ~1.5 s
// and bleeds out over 1 s. At most 14 fragments live at once (the oldest drops
// first); an untouched sheet — no pointer for 6 s, or a touch device, which
// never gets a cursor — keeps its ambient marks and compiles one lone fragment
// every ~5 s. The marks themselves no longer stir at the pointer: the compile
// is the reaction. It is picked in startBackground() by `data-surface="paper"`
// rather than keyed on BgTheme, whose type the experiment registry owns (and
// which is out of scope to extend). The ~30fps cap, the resize handling and
// the hidden-tab pause all come from startBackground; prefers-reduced-motion
// never reaches this module at all, because ThemeBackground returns before
// importing it.

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

/* Ambient texture, untouched by the cursor: the proof's own vocabulary,
   drifting under everything the compile does. */
const TOKENS = ['\\begin', '\\end', '{}', '$', '\\ref', '[htbp]', '0.618', '\\to'];

/* The compile: LaTeX source → the form it sets into. Fixed and ordered, so the
   reaction is always the product's own act (R13) and tests can name a pair. */
export const COMPILE_MAP: Array<[string, string]> = [
  ['\\frac{a}{b}', 'a⁄b'],
  ['\\int_0^1', '∫₀¹'],
  ['\\sum_{i}', 'Σᵢ'],
  ['\\alpha', 'α'],
  ['\\sqrt{x}', '√x'],
  ['\\section{}', '§'],
  ['\\LaTeX', 'LaTeX'],
  ['\\infty', '∞'],
  ['x^2', 'x²'],
  ['\\partial', '∂'],
  ['\\cite{}', '[1]'],
  ['\\emph{ink}', 'ink'],
];

/* Lifecycle of one fragment, in tick-time ms (the only clock here — no
   performance.now(), so tests can step straight across every boundary). */
export const SOURCE_MS = 550;      // source sits before it compiles
export const FADE_MS = 250;        // cross-fade source → typeset
export const SNAP_MS = 180;        // y snap to the baseline grid (ease-out)
export const HOLD_MS = 1500;       // the set line holds
const BLEED_MS = 1000;      // …and bleeds out
export const LIFE_MS = SOURCE_MS + FADE_MS + HOLD_MS + BLEED_MS; // 3300

export const GRID_PX = 28;         // the invisible baseline grid
export const MAX_FRAGS = 14;       // live fragments, oldest dropped first
export const SPAWN_EVERY = 220;    // ms between spawns along the pointer path
export const IDLE_AFTER = 6000;    // ms of stillness before the lone compiler
export const IDLE_EVERY = 5000;    // ms between lone idle compiles
export const SOURCE_ALPHA = 0.35;  // grey source
export const COMPILED_ALPHA = 0.8; // bistre typeset

/* Source grey: the paper surface's own --ink-dim, never an accent colour.
   (The typeset pass is never hardcoded either — it reads ctx.color, which
   backgrounds.ts forces to bistre #6a563e on this surface.) */
const SOURCE_COLOR = '#66635f';

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
      age: rand(0, life),
      life,
    };
  });

  /* Fragments — the compile itself. `y0` is where the cursor laid the source,
     `y1` the nearest baseline of the invisible grid (canvas-local, CSS px: the
     context is already scaled by dpr in backgrounds.ts), so a source fragment
     becomes a set line that shares its baseline with every other set line. */
  type Frag = {
    src: string;
    set: string;
    italic: boolean;
    x: number;
    y0: number;
    y1: number;
    size: number;
    born: number;
  };
  const frags: Frag[] = [];
  let srcIdx = 0; // walks COMPILE_MAP in order
  const snapY = (y: number) => {
    const line = Math.round(y / GRID_PX) * GRID_PX;
    const last = Math.floor(ctx.h / GRID_PX) * GRID_PX; // stay on the sheet after a resize
    return Math.max(0, Math.min(line, last));
  };
  const addFrag = (x: number, y: number, t: number) => {
    const [src, set] = COMPILE_MAP[srcIdx++ % COMPILE_MAP.length];
    if (frags.length >= MAX_FRAGS) frags.shift(); // oldest source drops first
    frags.push({
      src,
      set,
      italic: src === '\\emph{ink}',
      x,
      y0: y,
      y1: snapY(y),
      size: rem * rand(0.9, 1.3),
      born: t,
    });
  };

  /* The pointer is the input: every path point is a candidate source fragment,
     rate-limited in tick time (an uncapped sweep would spray a wall of source)
     and only while the pointer actually travelled — a cursor parked on the page
     compiles nothing, and past 6 s of stillness the sheet falls back to the
     idle compiler below. Touch has no cursor to compile with, so its listener
     is never attached: its sheet is ambient marks plus the lone idle compile.
     document-level (not window) so an Astro view transition cannot leave a
     ghost listener behind. */
  const isTouch = 'ontouchstart' in window && navigator.maxTouchPoints > 0;
  let nowT = 0;      // last tick time — the clock every listener reads
  let lastMoveT = -1; // last pointer travel (−1 until the first frame lands)
  let lastSpawnT = -1e9;
  let nx = 0;
  let ny = 0;
  let lastSx = 0; // pointer position at the last spawn ⇒ travel since then
  let lastSy = 0;
  let hasPointer = false;
  let nextIdleT = -1;
  const ac = new AbortController();
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    // Map viewport → canvas-local (no-op on the fixed full-bleed page canvas
    // where rect.left/top are 0; required for correctness if ever mounted in
    // a card). Re-entry after pointerout re-seeds the path origin, so the stale
    // exit→entry jump never reads as travel and spawns nothing.
    const rect = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!hasPointer) {
      nx = x;
      ny = y;
      lastSx = x;
      lastSy = y;
    } else {
      nx = x;
      ny = y;
    }
    hasPointer = true;
    lastMoveT = nowT; // idle measures real stillness, throttled or not
  };
  const onPointerOut = (e: PointerEvent) => {
    if (!e.relatedTarget) hasPointer = false;
  };
  if (!isTouch) {
    document.addEventListener('pointermove', onPointerMove, { passive: true, signal: ac.signal });
    document.addEventListener('pointerout', onPointerOut, { passive: true, signal: ac.signal });
  }

  let prevT = 0;
  return (t) => {
    if (!ctx.canvas.isConnected) {
      ac.abort();
      return;
    }
    const dt = prevT ? t - prevT : 16;
    prevT = t;
    nowT = t;
    if (lastMoveT < 0) lastMoveT = t;

    // Spawn along the path: one fragment per throttle window, only where the
    // pointer has travelled since the last one.
    if (hasPointer && t - lastSpawnT >= SPAWN_EVERY && (nx !== lastSx || ny !== lastSy)) {
      addFrag(nx, ny, t);
      lastSpawnT = t;
      lastSx = nx;
      lastSy = ny;
    }
    // Idle compiler: stillness (or touch, which never gets a cursor) leaves the
    // sheet to its marks plus a lone fragment that compiles on the same clock.
    if (t - lastMoveT > IDLE_AFTER) {
      if (nextIdleT < 0) nextIdleT = t + IDLE_EVERY;
      else if (t >= nextIdleT) {
        addFrag(rand(40, Math.max(40, ctx.w - 40)), rand(40, Math.max(40, ctx.h - 40)), t);
        nextIdleT = t + IDLE_EVERY;
      }
    } else {
      nextIdleT = -1;
    }

    c.clearRect(0, 0, ctx.w, ctx.h);
    c.fillStyle = ctx.color; // bistre comes from backgrounds.ts — never hardcoded
    c.textBaseline = 'top';
    for (const m of marks) {
      // Cross-fade clock — the proof being set. The increment is clamped so a
      // huge dt after a hidden-tab pause cannot mass-respawn every mark (which
      // would blank the sheet for the 1.5 s fade-in).
      m.age += Math.min(dt, 250);
      if (m.age >= m.life) {
        m.tok = pick();
        m.x = rand(0, ctx.w);
        m.y = rand(0, ctx.h);
        m.life = rand(7000, 14000);
        m.age = 0;
        m.vx = m.ix;
        m.vy = m.iy;
        m.va = m.ia;
      }
      const env = Math.min(1, m.age / 1500) * Math.min(1, (m.life - m.age) / 1500);
      // Excess velocity damps back to the idle drift (bg-bubbles ease-back).
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
      c.globalAlpha = m.al * env; // texture only — the cursor never stirs it
      c.translate(m.x, m.y);
      c.rotate(m.a);
      c.fillText(m.tok, 0, 0);
      c.restore();
    }

    /* The compile, newest last. Both passes of one fragment share a frame and a
       position during the cross-fade, so the swap reads as source turning into
       typeset rather than as one glyph leaving and another arriving. */
    for (let i = frags.length - 1; i >= 0; i--) {
      const f = frags[i];
      const age = t - f.born;
      if (age >= LIFE_MS) {
        frags.splice(i, 1);
        continue;
      }
      let y = f.y0;
      let alpha = SOURCE_ALPHA;
      let srcMix = 1; // 1 = pure source, 0 = pure typeset
      if (age >= SOURCE_MS) {
        const k = Math.min(1, (age - SOURCE_MS) / FADE_MS);
        const s = Math.min(1, (age - SOURCE_MS) / SNAP_MS);
        const e = 1 - Math.pow(1 - s, 3); // ease-out — the line settles, it does not hop
        y = s >= 1 ? f.y1 : f.y0 + (f.y1 - f.y0) * e;
        srcMix = 1 - k;
        alpha = SOURCE_ALPHA + (COMPILED_ALPHA - SOURCE_ALPHA) * k;
      }
      const holdEnd = SOURCE_MS + FADE_MS + HOLD_MS;
      if (age > holdEnd) alpha *= 1 - (age - holdEnd) / BLEED_MS;
      c.save();
      if (srcMix > 0) {
        c.globalAlpha = alpha * srcMix;
        c.font = `${f.size}px ui-monospace, "DejaVu Sans Mono", monospace`;
        c.fillStyle = SOURCE_COLOR;
        c.fillText(f.src, f.x, y);
      }
      if (srcMix < 1) {
        c.globalAlpha = alpha * (1 - srcMix);
        // The page's display serif at 400 (antimetal law) — system stack, no webfont.
        c.font = `${f.italic ? 'italic ' : ''}${f.size}px 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif`;
        c.fillStyle = ctx.color;
        c.fillText(f.set, f.x, y);
      }
      c.restore();
    }
    c.globalAlpha = 1;
  };
}
