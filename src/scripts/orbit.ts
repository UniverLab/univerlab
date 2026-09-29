/** Orbit — the cosmic background: motes bound to a gravity well, orbiting and
 *  oscillating around it, with faint links drawn between neighbours. The
 *  universe / Pensamiento Cósmico of the main site, and (R13) the product's own
 *  mechanism: the cursor is a LENS on that same gravitational system, not a
 *  wind blowing generic particles. It bends the light of the field around it:
 *  every mote within 220 px is DRAWN displaced radially away from the lens
 *  centre by up to 18 px on a 0→1→0 profile (f peaks at 90 px) and brightens by
 *  up to +0.25 alpha, links between two such motes by up to +0.08 — and it
 *  NEVER captures: velocities and orbits are exactly the central well's alone,
 *  identical to a run that never saw a pointer. The lens centre follows the
 *  pointer with a ~120 ms ease, so the field bends where the cursor has been,
 *  not snapping where it is; leaving the window or idling 1.5 s fades the lens
 *  out over 800 ms, handing the draw back to the byte-exact baseline. No mote
 *  can be collapsed into another — nothing moves, only light bends. Touch never
 *  lenses.
 *  Restores the pre-lvis-home-windows cosmic mechanics on every cosmic page
 *  (the home-only cursor-seeded "field" runner is gone); /status and /es/status
 *  move the well to 0.75w so the orbits stay clear of the Mission Log column's
 *  text — orbit.ts reads the pathname for that, every other page keeps 0.5w.
 *  Reduced motion never reaches here (ThemeBackground returns before importing
 *  this module). The ~30fps cap, the resize handling and the hidden-tab pause
 *  all come from startBackground. Split out of backgrounds.ts to keep that
 *  module within its size budget.
 *  The home figure (LabSystem.astro) publishes `data-orbit-well` and owns the
 *  well on that page; /status keeps 0.75w; everything else 0.5w. */

/* The subset of backgrounds.ts `Ctx` that this runner reads, declared locally
   (the same move brain.ts and spotlight.ts made) so the module needs no runtime
   dependency on backgrounds.ts — keep the field names in sync. */
interface OrbitCtx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  w: number;
  h: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/* Central gravity well — these three constants are the byte-baseline cosmic
   values (4d27473^:src/scripts/backgrounds.ts), unchanged. f = G/(d²+SOFT);
   SOFT keeps the pull finite at the exact centre. */
const G = 14;
const SOFT = 2000;
const WELLY = 0.42;
const LINK2 = 9000; // 95² — the baseline link reach, unchanged

/* The cursor as a lens — render-time only. */
const LENS_RIN = 90; // f peaks (== 1) here
const LENS_ROUT = 220; // f is exactly 0 at and beyond this
const LENS_A = 18; // max radial displacement, px
const LENS_BRIGHT = 0.25; // mote alpha lift at f = 1
const LENS_LINKBRIGHT = 0.08; // link alpha lift at f_i·f_j = 1
const LENS_FOLLOW = 120; // ms, e-constant of the lens centre ease
const LENS_IDLE = 1500; // ms without a move before the lens starts fading
const LENS_FADE = 800; // ms linear fade-out once fading
const LENS_RISE = 120; // ms linear fade-in (design choice; mirrors FOLLOW)

/* Radial lensing profile: 0 at d=0 → 1 at d=LENS_RIN → 0 at d=LENS_ROUT, C1 at both
   seams (sin rise, sin² fall — flat at the rim, which matters: a plain sin fall peaks
   its slope AT 220 and pairs straddling the rim lose >2 px, see the no-collapse note).
   Worst compression of a radially-aligned gap is ~0.22·gap, mid-fall-branch only. */
function lensF(d: number): number {
  if (d >= LENS_ROUT) return 0;
  if (d <= LENS_RIN) return Math.sin((Math.PI / 2) * (d / LENS_RIN));
  const s = Math.sin((Math.PI / 2) * ((LENS_ROUT - d) / (LENS_ROUT - LENS_RIN)));
  return s * s;
}

type Mote = { x: number; y: number; vx: number; vy: number; s: number };

export function orbit(ctx: OrbitCtx): (t: number) => void {
  const { c } = ctx;
  /* Which well? The Mission Log page (and its /es twin) carries a text column
     the orbits must stay clear of, so its well sits over the right side; every
     other cosmic page keeps the centred baseline well. Read ONCE, here at
     construction — the runner outlives no navigation, and a module-level read
     would freeze the decision at import time. trailingSlash is 'ignore' in
     astro.config, hence the optional slash. */
  const wellx = /(^|\/)status\/?$/i.test(window.location.pathname) ? 0.75 : 0.5;
  /* The home figure (LabSystem.astro) is the system's centre on that page.
     Read ONCE here, like the pathname: the runner never outlives a navigation. */
  const marker = document.querySelector('[data-orbit-well]');
  const N = Math.min(90, Math.floor((ctx.w * ctx.h) / 16000));
  /* Ring spawn about the canvas centre with a tangential velocity — the
     baseline spawn, verbatim, including the exact number and order of
     Math.random() calls (a, r, s). That parity is what keeps a lens-free orbit
     step byte-identical to the old cosmic step. */
  function spawn(x: OrbitCtx): Mote {
    const a = rand(0, Math.PI * 2);
    const r = rand(40, Math.min(x.w, x.h) * 0.5);
    return {
      x: x.w / 2 + Math.cos(a) * r,
      y: x.h / 2 + Math.sin(a) * r,
      vx: Math.sin(a) * 0.25,
      vy: -Math.cos(a) * 0.25,
      s: rand(0.6, 1.6),
    };
  }
  const motes: Mote[] = Array.from({ length: N }, () => spawn(ctx));
  /* Scratch for the drawn (lensed) positions and profiles — allocated ONCE, N
     never changes. Unlit frames store the real coordinates verbatim. */
  const dsx = new Float64Array(N);
  const dsy = new Float64Array(N);
  const fs = new Float64Array(N);

  /* Cursor bookkeeping — the document-level house pattern (brain/primitives):
     the full-bleed canvas is pointer-events:none, so a canvas-bound listener
     would never fire, and an AbortController releases both on view navigation.
     Rect math is mandatory: the position is folded into canvas coordinates.
     Touch never becomes a lens. */
  let px = -9999; // canvas-local; off-screen until a move arrives, so a mote
  let py = -9999; // can never be "near" the pointer before the first event
  let hasPointer = false;
  let lastMove = -Infinity;
  let lx = -9999; // the EASED lens centre — what the field actually bends around
  let ly = -9999;
  let strength = 0; // the lens' visibility, 0…1
  let prev = 0;
  const ac = new AbortController();
  document.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const rect = ctx.canvas.getBoundingClientRect();
      px = e.clientX - rect.left;
      py = e.clientY - rect.top;
      hasPointer = true;
      lastMove = performance.now();
    },
    { passive: true, signal: ac.signal }
  );
  document.addEventListener(
    'pointerout',
    (e: PointerEvent) => {
      if (!e.relatedTarget) hasPointer = false; // left the window → the lens fades
    },
    { passive: true, signal: ac.signal }
  );

  return (t) => {
    if (!ctx.canvas.isConnected) {
      ac.abort(); // the runner now owns listeners (house pattern)
      return;
    }
    const dt = prev ? t - prev : 16;
    prev = t;
    /* Lens envelope: a recent move holds it lit, otherwise it fades out. Note
       the freshness test has no lower bound: a handler's performance.now() can
       sit slightly AHEAD of the next frame's `t`, and a negative difference must
       read as fresh, not as expired. */
    if (hasPointer && strength === 0) {
      lx = px;
      ly = py;
    } // the lens forms ON the cursor, never gliding in from off-screen
    strength =
      hasPointer && t - lastMove < LENS_IDLE
        ? Math.min(1, strength + dt / LENS_RISE)
        : Math.max(0, strength - dt / LENS_FADE); // linear → hits exact 0
    if (strength > 0) {
      const k = 1 - Math.exp(-dt / LENS_FOLLOW);
      lx += (px - lx) * k;
      ly += (py - ly) * k;
    }

    c.clearRect(0, 0, ctx.w, ctx.h);
    let cx = ctx.w * wellx;
    let cy = ctx.h * WELLY;
    if (marker && marker.isConnected) {
      const r = marker.getBoundingClientRect();
      // jsdom, display:none and a scrolled-away figure all give a zero-size rect → baseline
      if (r.width > 0 && r.height > 0) {
        const cr = ctx.canvas.getBoundingClientRect();
        const mx = r.left + r.width / 2 - cr.left;
        const my = r.top + r.height / 2 - cr.top;
        // only take the well while the figure's centre is actually on screen —
        // a fixed canvas must not drag the system off-frame after the hero scrolls away
        if (mx >= 0 && mx <= ctx.w && my >= 0 && my <= ctx.h) { cx = mx; cy = my; }
      }
    }
    for (const p of motes) {
      // (a) the central well — the baseline step, byte-for-byte
      const dx = cx - p.x;
      const dy = cy - p.y;
      const f = G / (dx * dx + dy * dy + SOFT);
      p.vx += dx * f;
      p.vy += dy * f;
      // (b) integrate — the fixed per-frame step of the baseline; the ~30fps
      // cap in startBackground IS the timestep, so gravity is never dt-scaled.
      // Nothing else touches a velocity: the lens is render-time only, so this
      // loop is the whole physics and stays byte-equivalent to the legacy cosmic.
      p.x += p.vx;
      p.y += p.vy;
      // (c) respawn off-screen exactly as the baseline does (±20 margin)
      if (p.x < -20 || p.x > ctx.w + 20 || p.y < -20 || p.y > ctx.h + 20) {
        Object.assign(p, spawn(ctx));
      }
    }

    /* The lens, drawn: every mote is DRAWN radially away from the eased lens
       centre by A·f(d) and brightened by the same f. The real coordinates are
       untouched, so nothing can be pulled together — a mote's drawn position is
       exactly p.x/p.y whenever the lens is off or f is 0 (the dsx/dsy stores are
       verbatim assignments, not x + 0·k arithmetic: unlit frames must stay
       byte-identical to the baseline). Links bend between the drawn endpoints. */
    const lit = strength > 0;
    for (let i = 0; i < motes.length; i++) {
      const p = motes[i];
      fs[i] = 0;
      if (lit) {
        const ex = p.x - lx;
        const ey = p.y - ly;
        const e = Math.hypot(ex, ey); // f(0) === 0, so fi > 0 is the division guard
        const fi = lensF(e);
        if (fi > 0) {
          fs[i] = fi;
          const k = (LENS_A * strength * fi) / e;
          dsx[i] = p.x + ex * k; // displaced AWAY from the lens centre
          dsy[i] = p.y + ey * k;
          continue;
        }
      }
      dsx[i] = p.x;
      dsy[i] = p.y;
    }

    // faint links — strokeStyle read live (never destructured) so the circadian
    // palette passes through on every tick (R9). Which PAIRS are linked is
    // decided on the REAL positions (unchanged baseline semantics, so no link
    // flickers in or out as the lens moves); only the drawn endpoints bend.
    c.strokeStyle = ctx.color;
    for (let i = 0; i < motes.length; i++) {
      for (let j = i + 1; j < motes.length; j++) {
        const dx = motes[i].x - motes[j].x;
        const dy = motes[i].y - motes[j].y;
        if (dx * dx + dy * dy < LINK2) {
          // two lensed motes draw their link brighter — the field glows along
          // the ring the lens bends, not along a capture constellation
          c.globalAlpha = 0.05 + LENS_LINKBRIGHT * strength * fs[i] * fs[j];
          c.beginPath();
          c.moveTo(dsx[i], dsy[i]);
          c.lineTo(dsx[j], dsy[j]);
          c.stroke();
        }
      }
    }
    c.fillStyle = ctx.color;
    for (let i = 0; i < motes.length; i++) {
      c.globalAlpha = 0.7 + LENS_BRIGHT * strength * fs[i]; // 0.7 baseline → 0.95 peak
      c.beginPath();
      c.arc(dsx[i], dsy[i], motes[i].s, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  };
}
