/** Orbit — the cosmic background: motes bound to a gravity well, orbiting and
 *  oscillating around it, with faint links drawn between neighbours. The
 *  universe / Pensamiento Cósmico of the main site, and (R13) the product's own
 *  mechanism: the cursor is a SECOND, MOVING MASS in that same system, not a
 *  wind blowing generic particles. While the pointer has moved within the last
 *  ~1.2 s it pulls on the motes it passes (2.5× the central well, hard-cut at
 *  260 px), so they swing into temporary orbits around it and slingshot away
 *  when it moves on; the motes it carries brighten and their links draw a small
 *  constellation. Park the pointer or leave the window and the mass decays to
 *  zero over ~1.5 s, handing the system back to its single well untouched —
 *  no snap, no freeze. Touch never stirs it.
 *  Restores the pre-lvis-home-windows cosmic mechanics on every cosmic page
 *  (the home-only cursor-seeded "field" runner is gone); /status and /es/status
 *  move the well to 0.75w so the orbits stay clear of the Mission Log column's
 *  text — orbit.ts reads the pathname for that, every other page keeps 0.5w.
 *  Reduced motion never reaches here (ThemeBackground returns before importing
 *  this module). The ~30fps cap, the resize handling and the hidden-tab pause
 *  all come from startBackground. Split out of backgrounds.ts to keep that
 *  module within its size budget.
 *  The home figure (LabSystem.astro) publishes `data-orbit-well` and owns the
 *  well on that page; /status keeps 0.75w; everything else 0.5w.

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

/* The cursor as a second mass. */
const GP = 35; // 2.5 × G
const REACH2 = 260 * 260; // the pointer's force is exactly 0 beyond this
const FRESH = 1200; // ms a move stays "recent" (the mass is at full strength)
const DECAY = 1500; // ms for the mass to fade to 0 once the pointer parks or leaves
/* Speed cap — anti-ejection insurance for the cursor, NOT a brake on the well.
   It bounds what the pointer may ADD to a mote's own orbital speed, so a fast
   swipe can never fling the system apart. A flat |v| ≤ 2.2 px/frame would be
   the wrong instrument: measured at 1440×900, the restored baseline runs at a
   median 2.46 and a p90 of 5.46 px/frame, so a flat cap would slow the whole
   system down and break the equivalence that makes this runner a faithful
   restore (a massless step must equal the old cosmic step at EVERY state, not
   only a fresh one). Hence: |v| ≤ max(|v_well|, VMAX). */
const VMAX = 2.2;

/* Capture visuals: the "weaving" cue. */
const CAP_R2 = 120 * 120; // capture radius
const CAPK = 0.12; // per-frame lerp of the capture level (≈0.8 s rise/decay at 30fps)
const CAPMID = 0.5; // capture level at which a mote counts as captured for its links

type Mote = { x: number; y: number; vx: number; vy: number; s: number; cap: number };

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
     Math.random() calls (a, r, s). That parity is what keeps a massless orbit
     step byte-identical to the old cosmic step. cap starts at 0. */
  function spawn(x: OrbitCtx): Mote {
    const a = rand(0, Math.PI * 2);
    const r = rand(40, Math.min(x.w, x.h) * 0.5);
    return {
      x: x.w / 2 + Math.cos(a) * r,
      y: x.h / 2 + Math.sin(a) * r,
      vx: Math.sin(a) * 0.25,
      vy: -Math.cos(a) * 0.25,
      s: rand(0.6, 1.6),
      cap: 0,
    };
  }
  const motes: Mote[] = Array.from({ length: N }, () => spawn(ctx));

  /* Cursor bookkeeping — the document-level house pattern (brain/primitives):
     the full-bleed canvas is pointer-events:none, so a canvas-bound listener
     would never fire, and an AbortController releases both on view navigation.
     Rect math is mandatory: the position is folded into canvas coordinates.
     Touch never becomes a mass. */
  let px = -9999; // canvas-local; off-screen until a move arrives, so a mote
  let py = -9999; // can never be "near" the pointer before the first event
  let hasPointer = false;
  let lastMove = -Infinity;
  let mass = 0; // the pointer's gravity strength, 0…1
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
      if (!e.relatedTarget) hasPointer = false; // left the window → the mass decays
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
    /* A recent move holds the mass at full strength; otherwise it bleeds away
       over DECAY. Note the freshness test has no lower bound: a handler's
       performance.now() can sit slightly AHEAD of the next frame's `t`, and a
       negative difference must read as fresh, not as expired. */
    mass = hasPointer && t - lastMove < FRESH ? 1 : Math.max(0, mass - dt / DECAY);

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
      const wvx = p.vx; // the velocity the well alone gives this mote
      const wvy = p.vy;
      // (b) the cursor as a second mass. Same softening, 2.5× the strength, and
      // a HARD cut at 260 px (the spec asks for exactly zero beyond it; the
      // largest step that cut can produce is ~0.14 px/frame², invisible).
      const ex = px - p.x;
      const ey = py - p.y;
      const e2 = ex * ex + ey * ey;
      const pulled = mass > 0 && e2 < REACH2;
      if (pulled) {
        const fp = (GP * mass) / (e2 + SOFT);
        p.vx += ex * fp;
        p.vy += ey * fp;
        // (c) speed cap — the cursor may not take a mote past its own orbital
        // speed, or past VMAX, whichever is higher. Gated on the pull so a
        // massless step is untouched: Math.hypot rounds, so an ungated cap
        // would rescale the velocity by a rounding hair and quietly break the
        // equivalence this whole runner exists to keep.
        const lim = Math.max(Math.hypot(wvx, wvy), VMAX);
        const sp2 = p.vx * p.vx + p.vy * p.vy;
        if (sp2 > lim * lim) {
          const k = lim / Math.sqrt(sp2);
          p.vx *= k;
          p.vy *= k;
        }
      }
      // (d) integrate — the fixed per-frame step of the baseline; the ~30fps
      // cap in startBackground IS the timestep, so gravity is never dt-scaled
      p.x += p.vx;
      p.y += p.vy;
      // (e) respawn off-screen exactly as the baseline does (±20 margin), which
      // also resets the capture level
      if (p.x < -20 || p.x > ctx.w + 20 || p.y < -20 || p.y > ctx.h + 20) {
        Object.assign(p, spawn(ctx));
      }
      // (f) capture: motes the cursor is carrying brighten and thicken, and
      // relax back over CAPK once the mass dies. Uses the pre-integration
      // distance — one frame of lag on a ~0.8 s envelope is invisible.
      p.cap += ((mass > 0 && e2 < CAP_R2 ? 1 : 0) - p.cap) * CAPK;
    }

    // faint links — strokeStyle read live (never destructured) so the circadian
    // palette passes through on every tick (R9)
    c.strokeStyle = ctx.color;
    for (let i = 0; i < motes.length; i++) {
      for (let j = i + 1; j < motes.length; j++) {
        const lx = motes[i].x - motes[j].x;
        const ly = motes[i].y - motes[j].y;
        if (lx * lx + ly * ly < LINK2) {
          // two carried motes draw their link brighter — the cursor weaves a
          // small constellation instead of stirring dust
          c.globalAlpha = motes[i].cap > CAPMID && motes[j].cap > CAPMID ? 0.12 : 0.05;
          c.beginPath();
          c.moveTo(motes[i].x, motes[i].y);
          c.lineTo(motes[j].x, motes[j].y);
          c.stroke();
        }
      }
    }
    c.fillStyle = ctx.color;
    for (const p of motes) {
      c.globalAlpha = 0.7 + 0.3 * p.cap; // 0.7 idle → 1.0 fully captured
      c.beginPath();
      c.arc(p.x, p.y, p.s + 0.4 * p.cap, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  };
}
