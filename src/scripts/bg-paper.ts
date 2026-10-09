// Paper — the quiet motif for the cream `paper` surface (texforge): a sparse,
// slow scatter of drifting typographic ink marks — short LaTeX tokens set in
// the mono font, cross-fading in and out like a proof being set (N = min(9,
// max(6, area/136000)) marks, each alive 14–24 s, cross-fading in and out
// over 2.5 s) — plus the product's own act as the cursor's language. A sweep
// lays LaTeX SOURCE fragments along its path (mono, grey, at most one per
// ≥450 ms of travel and only after ≥12 px since the last spawn) and ~550 ms
// later each one compiles: a 250 ms cross-fade into its typeset form in the
// page's serif, bistre ink, while its y eases onto the nearest line of an
// invisible 28 px baseline grid over 180 ms. The set line then holds ~1.5 s
// and bleeds out over 1 s. At most 5 pointer-born fragments live at once (the
// oldest drops first when a sixth would spawn), and a parked pointer spawns
// nothing at all — the sheet keeps only its ambient marks, which respawn on
// their own slow 14–24 s clock. The lone idle compile runs only when no
// pointer is present: an untouched sheet or a touch device, which never gets
// a cursor. The marks themselves no longer stir at the pointer: the compile
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

export const GRID_PX = 28;          // the invisible baseline grid
export const MAX_POINTER_FRAGS = 5; // pointer-born fragments, oldest dropped first
export const SPAWN_EVERY = 450;     // ms between spawns along the pointer path
export const MOVE_PX = 12;          // min pointer travel since the last spawn to seed one
export const IDLE_AFTER = 6000;     // ms of stillness before the lone compiler
export const IDLE_EVERY = 5000;     // ms between lone idle compiles
export const SOURCE_ALPHA = 0.35;  // grey source
export const COMPILED_ALPHA = 0.8; // bistre typeset

/* Source grey: the paper surface's own --ink-dim, never an accent colour.
   (The typeset pass is never hardcoded either — it reads ctx.color, which
   backgrounds.ts forces to the texforge essenceTextHex on this surface.) */
const SOURCE_COLOR = '#66635f';

export function paper(ctx: PaperCtx): (t: number) => void {
  const { c } = ctx;
  const N = Math.min(9, Math.max(6, Math.floor((ctx.w * ctx.h) / 136000)));
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
    const life = rand(14000, 24000);
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
    pointer: boolean; // born from a sweep (capped) vs the idle compiler
  };
  const frags: Frag[] = [];
  let srcIdx = 0; // walks COMPILE_MAP in order
  const snapY = (y: number) => {
    const line = Math.round(y / GRID_PX) * GRID_PX;
    const last = Math.floor(ctx.h / GRID_PX) * GRID_PX; // stay on the sheet after a resize
    return Math.max(0, Math.min(line, last));
  };
  const addFrag = (x: number, y: number, t: number, pointer: boolean) => {
    const [src, set] = COMPILE_MAP[srcIdx++ % COMPILE_MAP.length];
    if (pointer) {
      // The sweep's cap counts pointer-born fragments only; the idle compiler
      // is unaffected. `frags` is oldest→newest, so the first pointer-born
      // entry is the oldest one to drop.
      let live = 0;
      for (const f of frags) if (f.pointer) live++;
      if (live >= MAX_POINTER_FRAGS) {
        const oldest = frags.findIndex((f) => f.pointer);
        if (oldest >= 0) frags.splice(oldest, 1); // oldest pointer-born drops first
      }
    }
    frags.push({
      src,
      set,
      italic: src === '\\emph{ink}',
      x,
      y0: y,
      y1: snapY(y),
      size: rem * rand(0.9, 1.3),
      born: t,
      pointer,
    });
  };

  /* The pointer is the input: every path point is a candidate source fragment,
     throttled in tick time to one per ≥450 ms of travel and only once the
     cursor has moved ≥12 px since the last spawn (an uncapped sweep would
     spray a wall of source). A parked cursor compiles nothing at all — no
     fallback to the idle compiler either: the sheet is left to its ambient
     marks, which respawn on their own slow 14–24 s clock. The idle compiler
     below only runs for a sheet with no pointer whatsoever (an untouched
     page, or a touch device, which never gets a cursor): its sheet is ambient
     marks plus the lone idle compile. document-level (not window) so an Astro
     view transition cannot leave a ghost listener behind. */
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

    // Spawn along the path: one fragment per 450 ms window, only where the
    // pointer has travelled ≥12 px since the last spawn. A parked pointer
    // never satisfies the travel test, so it spawns nothing.
    if (
      hasPointer &&
      t - lastSpawnT >= SPAWN_EVERY &&
      (nx - lastSx) * (nx - lastSx) + (ny - lastSy) * (ny - lastSy) >= MOVE_PX * MOVE_PX
    ) {
      addFrag(nx, ny, t, true);
      lastSpawnT = t;
      lastSx = nx;
      lastSy = ny;
    }
    // Idle compiler: only when no pointer is present — an untouched sheet, or
    // a touch device, which never gets a listener. A parked mouse leaves the
    // sheet to its ambient marks alone (they respawn on their own 14–24 s
    // clock), so a still cursor compiles nothing at all.
    if (!hasPointer && t - lastMoveT > IDLE_AFTER) {
      if (nextIdleT < 0) nextIdleT = t + IDLE_EVERY;
      else if (t >= nextIdleT) {
        addFrag(rand(40, Math.max(40, ctx.w - 40)), rand(40, Math.max(40, ctx.h - 40)), t, false);
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
      // would blank the sheet for the 2.5 s fade-in).
      m.age += Math.min(dt, 250);
      if (m.age >= m.life) {
        m.tok = pick();
        m.x = rand(0, ctx.w);
        m.y = rand(0, ctx.h);
        m.life = rand(14000, 24000);
        m.age = 0;
        m.vx = m.ix;
        m.vy = m.iy;
        m.va = m.ia;
      }
      const env = Math.min(1, m.age / 2500) * Math.min(1, (m.life - m.age) / 2500);
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
