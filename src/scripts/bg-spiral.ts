// Golden fractal — the Fibonacci whirling squares (1,1,2,3,5,8,13,21…) with
// the golden spiral they inscribe, drawn static and visible-but-quiet (level
// set per circadian surface), while a sparkling mote sweeps out along the
// spiral. A nod to the Fibonacci deck. Quorum.
//
// Extracted from backgrounds.ts so the entry module stays readable; the
// behaviour is unchanged except for the cursor reaction: when the pointer is
// active the spawn cadence tightens to ≈900 ms, each new spark is biased
// toward the arc point nearest the cursor and burns brighter for its first
// second, so the reaction reads within 0.5 s. Idle cadence is byte-identical
// to before.

/* The subset of backgrounds.ts `Ctx` that this runner reads, declared locally
   (the same move brain.ts and spotlight.ts made) so the module needs no
   runtime dependency on backgrounds.ts — keep the field names in sync. */
import { byId } from '../lib/experiments';

interface SpiralCtx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  w: number;
  h: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function spiral(ctx: SpiralCtx): (t: number) => void {
  const { c } = ctx;
  const K = Math.log(1.618) / (Math.PI / 2); // golden growth per radian
  // Whirling-squares tiling in unit coords: each square's side follows the
  // Fibonacci sequence, spiralling out left → top → right → bottom.
  let bx = 0;
  let by = 0;
  let bw = 1;
  let bh = 1;
  const squares = [{ x: 0, y: 0, s: 1 }];
  const dirs = ['left', 'top', 'right', 'bottom'];
  for (let i = 0; i < 8; i++) {
    const d = dirs[i % 4];
    if (d === 'left') { const s = bh; bx -= s; bw += s; squares.push({ x: bx, y: by, s }); }
    else if (d === 'top') { const s = bw; by -= s; bh += s; squares.push({ x: bx, y: by, s }); }
    else if (d === 'right') { const s = bh; squares.push({ x: bx + bw, y: by, s }); bw += s; }
    else { const s = bw; squares.push({ x: bx, y: by + bh, s }); bh += s; }
  }
  // Spiral pole ≈ the eye the squares whirl into.
  const pu = 0.0;
  const pv = 0.5;
  const rMin = 0.28;
  const rMax = Math.max(bw, bh) * 0.5;
  const thMax = Math.log(rMax / rMin) / K;
  const A = ctx.color.length === 7 ? ctx.color : byId('quorum').essenceHex;

  // A handful of sparks wander the spiral at once — a new one spawns every
  // few seconds and lives ~10–15 s, so several drift about at any moment,
  // each on its own erratic path (sometimes doubling back).
  interface Spark { born: number; life: number; s0: number; drift: number; amp: number; w1: number; w2: number; p1: number; p2: number; fast: boolean; }
  const sparks: Spark[] = [];
  let nextSpawn = 300 + Math.random() * 1200;
  // Fold a value into [lo, hi] by reflection, so a spark bounces off the eye
  // and the rim instead of clamping (and sticking) there.
  const reflect = (q: number, lo: number, hi: number) => {
    const r = hi - lo;
    const m = (((q - lo) % (2 * r)) + 2 * r) % (2 * r);
    return m <= r ? lo + m : hi - (m - r);
  };

  // Cursor input — pointer is read once per move; the tick decides whether
  // we are still "active" (the pointer has moved within the last second).
  // Touch input is ignored entirely.
  const POINTER_IDLE_MS = 1000;
  const ACTIVE_EVERY_MIN = 700;  // ms — fastest cadence while the pointer is moving
  const ACTIVE_EVERY_RND = 400;  // ms — added jitter on top (mean ≈ 900 ms)
  const MAX_SPARKS = 16;         // cap so an active pointer never saturates the spiral
  let tx = ctx.w * 0.5;
  let ty = ctx.h * 0.3;
  let hasPointer = false;
  let lastMoveMs = -Infinity;
  let sawActive = false;
  const ac = new AbortController();
  document.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      tx = e.clientX;
      ty = e.clientY;
      hasPointer = true;
      lastMoveMs = performance.now();
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

  /* The /quorum lede keeps its WCAG AA contrast on a soft backdrop in the
     page's own background (surfaces.css: `html[data-surface='quorum'] .exp
     .lede`), so this runner no longer has to dodge the copy column: the
     figure sits on its old centred anchor (0.64 / 0.5) on the page exactly
     as it does in the home Quorum card window. */

  return (t) => {
    if (!ctx.canvas.isConnected) {
      ac.abort();
      return;
    }
    c.clearRect(0, 0, ctx.w, ctx.h);
    // Fit the tiling to a tall region on the right, static. The third pass's
    // 15 % growth stays (S feeds every transform): the whole figure — rects,
    // curve and the sparks riding toX/toY — grows about its centre.
    const SCALE = 1.15;
    const S = ((ctx.h * 0.82) / bh) * SCALE;
    // Anchor: the old centred spot (0.64 / 0.5), restored from the third
    // pass's copy-reading anchor. The /quorum lede now sits on its own soft
    // backdrop (surfaces.css), so the figure no longer dodges the copy column.
    const ox = ctx.w * 0.64 - (bx + bw / 2) * S;
    const oy = ctx.h * 0.5 - (by + bh / 2) * S;
    const toX = (u: number) => ox + u * S;
    const toY = (v: number) => oy + v * S;

    // Whirling squares — quiet but legible structure. The old 0.15 / 0.19
    // washed out on the 0.68 canvas opacity, so the golden geometry read as
    // nothing at all; raised again on the third pass so the figure reads on
    // the cream day palette (day on sand: 0.30 / 0.42, night on espresso:
    // 0.28 / 0.40).
    // Read every frame so a celestial scrub repaints the right level.
    const isDay = document.documentElement.dataset.celestial === 'sun';
    c.strokeStyle = A;
    c.lineWidth = 1.2;
    c.globalAlpha = isDay ? 0.3 : 0.28;
    for (const q of squares) {
      c.strokeRect(toX(q.x), toY(q.y), q.s * S, q.s * S);
    }

    // The golden spiral through them.
    c.lineCap = 'round';
    c.lineWidth = 1.8;
    c.globalAlpha = isDay ? 0.42 : 0.4;
    c.beginPath();
    for (let i = 0; i <= 220; i++) {
      const th = (i / 220) * thMax;
      const r = rMin * Math.exp(K * th);
      const x = toX(pu + r * Math.cos(th));
      const y = toY(pv + r * Math.sin(th));
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();

    // Pointer activity gate. rAF `t` and performance.now() share the time
    // origin so the comparison is sound.
    const active = hasPointer && t - lastMoveMs < POINTER_IDLE_MS;
    // Cadence pull on the idle→active transition: the first biased spark
    // must land within the 0.5 s bar; without this pull the existing
    // 3–5 s ambient cadence would skip the very first move.
    if (active && !sawActive) {
      nextSpawn = Math.min(nextSpawn, t + 180);
    }
    sawActive = active;

    // Spawn a new spark. Idle: today's ambient (random s0, 3–5 s cadence).
    // Active: nearest-arc-point bias + faster cadence, capped at MAX_SPARKS
    // (skip the push at the cap — popping an on-screen spark would be the
    // wrong kind of visible).
    if (t >= nextSpawn && (!active || sparks.length < MAX_SPARKS)) {
      let s0: number;
      if (!active) {
        s0 = 0.05 + Math.random() * 0.4;
      } else {
        // Sample the same curve the spark loop rides; pick the θ whose point
        // is closest to the cursor, convert to the `s` the spark consumes.
        // 240 samples once per spawn, not per frame — cheap.
        const rect = ctx.canvas.getBoundingClientRect();
        const mx = tx - rect.left;
        const my = ty - rect.top;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i <= 240; i++) {
          const th = (i / 240) * thMax;
          const r = rMin * Math.exp(K * th);
          const d = (toX(pu + r * Math.cos(th)) - mx) ** 2 +
                    (toY(pv + r * Math.sin(th)) - my) ** 2;
          if (d < bestD) { bestD = d; best = th; }
        }
        const rN = rMin * Math.exp(K * best);
        const sNear = (rN - rMin) / (rMax - rMin);
        s0 = reflect(sNear + rand(-0.05, 0.05), 0.03, 0.97);
      }
      sparks.push({
        born: t,
        life: 10000 + Math.random() * 5000, // 10–15 s
        s0,
        drift: -0.2 + Math.random() * 0.7, // net drift; can wander inward
        amp: 0.16 + Math.random() * 0.18,
        w1: 0.0005 + Math.random() * 0.0007,
        w2: 0.0011 + Math.random() * 0.001,
        p1: Math.random() * 6.283,
        p2: Math.random() * 6.283,
        // Pointer-born sparks ramp up fast: the ambient fade-in covers 12 %
        // of a 10–15 s life (≈1.4 s), which would miss the 0.5 s bar by a
        // mile. Idle sparks keep today's slow ramp byte-for-byte.
        fast: active,
      });
      nextSpawn = t + (active
        ? ACTIVE_EVERY_MIN + Math.random() * ACTIVE_EVERY_RND // 0.7–1.1 s (≈900 ms mean)
        : 3000 + Math.random() * 2000);                       // 3–5 s ambient
    }
    for (let k = sparks.length - 1; k >= 0; k--) {
      const sp = sparks[k];
      const lt = t - sp.born;
      if (lt > sp.life) {
        sparks.splice(k, 1);
        continue;
      }
      const u = lt / sp.life;
      // Fade out over the last 15 % as before; fade in over 12 % of the
      // life (ambient, ≈1.4 s) or the first 200 ms (pointer-born).
      const env = (sp.fast ? Math.min(1, lt / 200) : Math.min(1, u / 0.12)) *
        Math.min(1, (1 - u) / 0.15);
      let s = sp.s0 + sp.drift * u +
        sp.amp * (Math.sin(lt * sp.w1 + sp.p1) + 0.6 * Math.sin(lt * sp.w2 + sp.p2));
      s = reflect(s, 0.02, 0.98);
      const rHead = rMin + s * (rMax - rMin);
      const thHead = Math.log(rHead / rMin) / K;
      const hx = toX(pu + rHead * Math.cos(thHead));
      const hy = toY(pv + rHead * Math.sin(thHead));
      const tw = 0.6 + 0.4 * Math.sin(t * 0.005 + sp.p1); // gentle twinkle
      // Pointer-born sparks burn clearly brighter for their first second —
      // bigger halo, hotter core, tighter core — so the cursor reaction
      // dominates the ambient. Ambient sparks are fast === false ⇒ bright = 0
      // ⇒ every term reduces exactly to today's ambient draw.
      const bright = sp.fast ? Math.max(0, 1 - lt / 1000) : 0;
      const rad = 7 * (0.8 + 0.2 * tw) * (1 + 0.45 * bright);
      const g = c.createRadialGradient(hx, hy, 0, hx, hy, rad);
      g.addColorStop(0, A + (bright > 0 ? 'ee' : 'aa'));
      g.addColorStop(0.4, A + (bright > 0 ? '4a' : '2a'));
      g.addColorStop(1, A + '00');
      c.globalAlpha = env;
      c.fillStyle = g;
      c.beginPath();
      c.arc(hx, hy, rad, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = A;
      c.globalAlpha = env * Math.min(1, (0.35 + 0.35 * tw) + 0.5 * bright);
      c.beginPath();
      c.arc(hx, hy, 1.4 + 1.0 * bright, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  };
}
