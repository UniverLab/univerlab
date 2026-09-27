// Bubbles — GitKit's drifting commit graph: soft orbs rise like bubbles, each
// drawn as a commit node (filled core + ring), linked by gitgraph lane
// segments that re-link from live positions so the graph breathes.
//
// The cursor is the only input: sweeping the pointer sows fresh bubbles under
// it (throttled to ~275 ms apart) that join the upward float and glow visibly
// for ~1 s before settling to ambient; parked the field reads as before.
// Extracted from backgrounds.ts; the sideways-impulse stir it used to have was
// replaced by this canopy-sown (brain.ts) model.

/* The subset of backgrounds.ts `Ctx` that this runner reads, declared locally
   (the same move brain.ts and spotlight.ts made) so the module needs no
   runtime dependency on backgrounds.ts — keep the field names in sync. */
interface BubblesCtx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  bg: string;
  w: number;
  h: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function bubbles(ctx: BubblesCtx): (t: number) => void {
  const { c } = ctx;
  const A = ctx.color.length === 7 ? ctx.color : '#e8a4c8';
  const hex = ctx.bg.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const dark = lum < 0.4;
  // The pastel canvas is capped at 0.12 element opacity (§1.2). The
  // largest legal lift is internal alpha → 1.0 plus a stroke mixed 45 %
  // toward black (same hue, no new colour token). On the dark branch the
  // ring/core stays white, so shadeA degenerates to #ffffff and no helper
  // work is wasted.
  const shadeA = (() => {
    if (dark) return '#ffffff';
    const ar = parseInt(A.substring(1, 3), 16);
    const ag = parseInt(A.substring(3, 5), 16);
    const ab = parseInt(A.substring(5, 7), 16);
    const mix = (v: number) => Math.round(v + (0 - v) * 0.45);
    const hx = (v: number) => v.toString(16).padStart(2, '0');
    return '#' + hx(mix(ar)) + hx(mix(ag)) + hx(mix(ab));
  })();
  const N = Math.min(35, Math.floor((ctx.w * ctx.h) / 35000));
  type Bubble = { x: number; y: number; r: number; vy: number; vy0: number; vx: number; ph: number; amb: number; glow: number; extra: boolean };
  const bubbles: Bubble[] = Array.from({ length: N }, () => {
    const vy = rand(0.25, 0.7);
    return {
      x: rand(0, ctx.w),
      y: rand(0, ctx.h),
      r: rand(12, 35),
      vy,
      vy0: vy,
      vx: rand(-0.3, 0.3),
      ph: rand(0, Math.PI * 2),
      amb: rand(dark ? 0.06 : 0.3, dark ? 0.15 : 0.55),
      glow: 0,    // pointer-driven brightness bump (0 ⇒ ambient draw is byte-identical)
      extra: false,
    };
  });
  // Cursor sowing — brain.ts's "seed along path" model, throttled to one
  // bubble every SPAWN_EVERY ms, capped at MAX_EXTRAS live at once. Touch
  // never spawns; the pointerout gate stops further spawns when the pointer
  // leaves the window. document-level so an Astro view transition cannot
  // leave a ghost listener behind.
  const SPAWN_EVERY = 275;  // ms — spec: ~250–300 per cursor bubble
  const MAX_EXTRAS = 24;    // cursor-born bubbles on top of the N ambient ones
  const GLOW_TAU = 600;     // ms — frame-rate independent decay of the spawn flash
  const POP_MS = 450;       // ms — expanding birth ring
  let tx = 0;
  let ty = 0;
  let hasPointer = false;
  let lastSpawnMs = -Infinity;
  const pops: { x: number; y: number; born: number }[] = [];
  const ac = new AbortController();
  document.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const now = performance.now();
      tx = e.clientX;
      ty = e.clientY;
      // The first move after entering (or re-entering) the window only
      // seeds the pointer record: the pointerout gate has just been lifted
      // and a stale origin must never sow a bubble (no off-screen jump).
      // That gate is what stops spawning once the pointer leaves.
      if (!hasPointer) {
        hasPointer = true;
        return;
      }
      if (now - lastSpawnMs < SPAWN_EVERY) return;
      lastSpawnMs = now;
      const rect = ctx.canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(ctx.w, tx - rect.left));
      const y = Math.max(0, Math.min(ctx.h, ty - rect.top));
      // Cap the live extras — drop the highest (smallest y ≈ oldest ≈
      // nearest its exit, glow long faded) rather than splice an on-screen
      // orb, which would read as a pop in the wrong sense.
      const extras = bubbles.filter((bb) => bb.extra);
      if (extras.length >= MAX_EXTRAS) {
        let victim = extras[0];
        for (const bb of extras) if (bb.y < victim.y) victim = bb;
        bubbles.splice(bubbles.indexOf(victim), 1);
      }
      const vy = rand(0.45, 0.9);   // joins the upward float immediately
      bubbles.push({
        x,
        y,
        r: rand(16, 30),
        vy,
        vy0: vy,
        vx: rand(-0.15, 0.15),
        ph: rand(0, Math.PI * 2),
        amb: rand(dark ? 0.06 : 0.3, dark ? 0.15 : 0.55), // same band as ambient
        glow: 1,
        extra: true,
      });
      pops.push({ x, y, born: now });
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
  // Lerp helpers used only by the glow-lifted draws; glow === 0 ⇒ the
  // original hex byte / number is returned exactly, so ambient is unchanged.
  const lerpStop = (from: string, to: string, k: number) => {
    const a = parseInt(from, 16);
    const b = parseInt(to, 16);
    return Math.round(a + (b - a) * k).toString(16).padStart(2, '0');
  };
  const lerpNum = (a: number, b: number, k: number) => a + (b - a) * k;

  let prevT = 0;
  return (t) => {
    if (!ctx.canvas.isConnected) {
      ac.abort();
      return;
    }
    const dt = prevT ? t - prevT : 16;
    prevT = t;
    // Frame-rate independent glow decay (τ = 600 ms ⇒ ~1 s); a bare
    // `*= 0.94` would silently double under the 30fps cap and worse if it
    // ever changed.
    const glowDecay = Math.exp(-dt / GLOW_TAU);
    for (const b of bubbles) {
      b.glow *= glowDecay;
      // Snap to exactly 0 once the flash is invisible (ΔL < 0.1 on the
      // 0.12 canvas), so a recycled extra is *byte*-identical to an
      // ambient bubble again instead of carrying a forever-tiny glow.
      if (b.glow < 0.004) b.glow = 0;
    }

    c.clearRect(0, 0, ctx.w, ctx.h);
    // Birth pops first (under the bubbles): expanding ring, fades out.
    // The motion cue survives the 0.12 canvas opacity cap because the
    // ring is drawn at internal alpha 1.0.
    const now = performance.now();
    c.strokeStyle = shadeA;
    c.lineWidth = 1.5;
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      const k = (now - p.born) / POP_MS;
      if (k >= 1) {
        pops.splice(i, 1);
        continue;
      }
      c.globalAlpha = 1 - k;
      c.beginPath();
      c.arc(p.x, p.y, 8 + 38 * k, 0, Math.PI * 2);
      c.stroke();
    }
    // Ambient physics — same as before, with the old sideways stir removed.
    // The vy ease-back to vy0 is kept (extras born under the cursor pick up
    // the same rise rate, with no special-case code path).
    for (const b of bubbles) {
      b.y -= b.vy;
      b.x += Math.sin(t * 0.0008 + b.ph) * 0.5 + b.vx;
      b.vy += (b.vy0 - b.vy) * 0.02;
      b.vx *= 0.985;
      if (b.y < -b.r * 2) {
        b.y = ctx.h + b.r * 2;
        b.x = rand(0, ctx.w);
      }
    }
    // Lanes first: sort by y, link each node to its next-nearest in y
    // within 260px — the gitgraph bezier, capped at N-1 links.
    const sorted = [...bubbles].sort((p, q) => p.y - q.y);
    c.strokeStyle = ctx.color;
    c.lineWidth = 1;
    c.globalAlpha = 0.14;
    for (let i = 0; i + 1 < sorted.length; i++) {
      const p = sorted[i];
      const q = sorted[i + 1];
      if (q.y - p.y > 260) continue;
      const my = (p.y + q.y) / 2;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.bezierCurveTo(p.x, my, q.x, my, q.x, q.y);
      c.stroke();
    }
    // Nodes over the lanes: the halo wash, then the commit core + ring.
    // ambient (glow = 0) ⇒ every expression collapses to today's bytes:
    //   opacity = amb, halos use '80'/'50' (light) or '20'/'10' (dark),
    //   core fill = (dark ? '#ffffff' : A), line width = 1.
    for (const b of bubbles) {
      const opacity = b.amb + (1 - b.amb) * b.glow;
      const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, A + lerpStop(dark ? '20' : '80', 'ff', b.glow));
      g.addColorStop(0.5, A + lerpStop(dark ? '10' : '50', '66', b.glow));
      g.addColorStop(1, A + '00');
      c.globalAlpha = opacity;
      c.fillStyle = g;
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill();
      // Ring/core: darker same-hue stroke while glowing lifts the contrast
      // further (ΔL 21 → 25 on pastel); the dark branch keeps white.
      const ringA = b.glow > 0 ? shadeA : (dark ? '#ffffff' : A);
      c.globalAlpha = opacity * lerpNum(dark ? 0.3 : 0.8, 1, b.glow);
      c.fillStyle = ringA;
      c.beginPath();
      c.arc(b.x, b.y, b.r * 0.32, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = opacity;
      c.strokeStyle = ringA;
      c.lineWidth = 1 + b.glow;
      c.beginPath();
      c.arc(b.x, b.y, b.r * 0.52, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
  };
}
