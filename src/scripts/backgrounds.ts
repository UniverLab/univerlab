/** Lazy themed canvas backgrounds.
 *  Loaded only after the page has fully loaded, and never under
 *  prefers-reduced-motion. Each theme is intentionally light: small element
 *  counts, capped DPR, and animation paused while the tab is hidden. */

import type { BgTheme as Theme } from '../lib/experiments';
import { brain } from './brain';
import { createSpotlight } from './spotlight';

interface Ctx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  bg: string;
  w: number;
  h: number;
  dpr: number;
}

export function startBackground(canvas: HTMLCanvasElement, theme: Theme, color: string, bg = '#0a0b0e') {
  const c = canvas.getContext('2d');
  if (!c) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const ctx: Ctx = { canvas, c, color, bg, w: 0, h: 0, dpr };

  // Expose ctx on the canvas element so circadian can update color live.
  (canvas as any).__bgCtx = ctx;

  function resize() {
    ctx.w = canvas.clientWidth;
    ctx.h = canvas.clientHeight;
    canvas.width = Math.floor(ctx.w * dpr);
    canvas.height = Math.floor(ctx.h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', debounce(resize, 200));

  // The cream `paper` surface (texforge) mounts its own quiet motif instead of
  // the experiment's BgTheme: forge embers are the wrong register on
  // parchment, and BgTheme's type is owned by the experiment registry (out of
  // scope to extend with a new key), so the surface flag is the selector.
  // Reduced motion never reaches this module at all — ThemeBackground returns
  // before importing it.
  const isPaper = document.documentElement.dataset.surface === 'paper';
  if (isPaper) ctx.color = '#6a563e'; // bistre fibres, never amber embers
  const isPastel = document.documentElement.dataset.surface === 'pastel';
  if (isPastel) ctx.color = '#6d28d9'; // voltage violet, not registry pink
  const runner = isPaper ? PAPER : (THEMES[theme] ?? THEMES.drift);
  const tick = runner(ctx);

  let raf = 0;
  let last = 0;
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    if (t - last < 1000 / 30) return; // cap ~30fps
    last = t;
    tick(t);
  };
  raf = requestAnimationFrame(loop);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  });
}

function debounce(fn: () => void, ms: number) {
  let t: number;
  return () => {
    clearTimeout(t);
    t = window.setTimeout(fn, ms);
  };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

type Runner = (ctx: Ctx) => (t: number) => void;

const THEMES: Record<Theme, Runner> = {
  /* Cosmic — particles orbiting a gentle gravity well, faint constellations.
     The universe / Pensamiento Cósmico of the main site. */
  cosmic(ctx) {
    const { c } = ctx;
    const N = Math.min(90, Math.floor((ctx.w * ctx.h) / 16000));
    const ps = Array.from({ length: N }, () => spawn(ctx));
    function spawn(x: Ctx) {
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
    return () => {
      c.clearRect(0, 0, ctx.w, ctx.h);
      const cx = ctx.w / 2;
      const cy = ctx.h * 0.42;
      for (const p of ps) {
        const dx = cx - p.x;
        const dy = cy - p.y;
        const d2 = dx * dx + dy * dy + 2000;
        const f = 14 / d2;
        p.vx += dx * f;
        p.vy += dy * f;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20 || p.x > ctx.w + 20 || p.y < -20 || p.y > ctx.h + 20) {
          Object.assign(p, spawn(ctx));
        }
      }
      // faint links
      c.strokeStyle = ctx.color;
      c.globalAlpha = 0.05;
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const dx = ps[i].x - ps[j].x;
          const dy = ps[i].y - ps[j].y;
          if (dx * dx + dy * dy < 9000) {
            c.beginPath();
            c.moveTo(ps[i].x, ps[i].y);
            c.lineTo(ps[j].x, ps[j].y);
            c.stroke();
          }
        }
      }
      c.globalAlpha = 0.7;
      c.fillStyle = ctx.color;
      for (const p of ps) {
        c.beginPath();
        c.arc(p.x, p.y, p.s, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    };
  },

  /* Golden fractal — the Fibonacci whirling squares (1,1,2,3,5,8,13,21…) with
     the golden spiral they inscribe, drawn faint and static, while a sparkling
     mote sweeps out along the spiral. A nod to the Fibonacci deck. Quorum. */
  spiral(ctx) {
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
    const A = ctx.color.length === 7 ? ctx.color : '#e6b24a';

    // A handful of sparks wander the spiral at once — a new one spawns every
    // few seconds and lives ~10–15 s, so several drift about at any moment,
    // each on its own erratic path (sometimes doubling back).
    interface Spark { born: number; life: number; s0: number; drift: number; amp: number; w1: number; w2: number; p1: number; p2: number; }
    const sparks: Spark[] = [];
    let nextSpawn = 300 + Math.random() * 1200;
    // Fold a value into [lo, hi] by reflection, so a spark bounces off the eye
    // and the rim instead of clamping (and sticking) there.
    const reflect = (q: number, lo: number, hi: number) => {
      const r = hi - lo;
      const m = (((q - lo) % (2 * r)) + 2 * r) % (2 * r);
      return m <= r ? lo + m : hi - (m - r);
    };

    return (t) => {
      c.clearRect(0, 0, ctx.w, ctx.h);
      // Fit the tiling to a tall region on the right, static.
      const S = (ctx.h * 0.82) / bh;
      const ox = ctx.w * 0.64 - (bx + bw / 2) * S;
      const oy = ctx.h * 0.5 - (by + bh / 2) * S;
      const toX = (u: number) => ox + u * S;
      const toY = (v: number) => oy + v * S;

      // Whirling squares — very faint structure.
      c.strokeStyle = A;
      c.lineWidth = 1;
      c.globalAlpha = 0.15;
      for (const q of squares) {
        c.strokeRect(toX(q.x), toY(q.y), q.s * S, q.s * S);
      }

      // The golden spiral through them.
      c.lineCap = 'round';
      c.lineWidth = 1.3;
      c.globalAlpha = 0.19;
      c.beginPath();
      for (let i = 0; i <= 220; i++) {
        const th = (i / 220) * thMax;
        const r = rMin * Math.exp(K * th);
        const x = toX(pu + r * Math.cos(th));
        const y = toY(pv + r * Math.sin(th));
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();

      // Spawn a new spark every 3–5 s.
      if (t >= nextSpawn) {
        sparks.push({
          born: t,
          life: 10000 + Math.random() * 5000, // 10–15 s
          s0: 0.05 + Math.random() * 0.4,
          drift: -0.2 + Math.random() * 0.7, // net drift; can wander inward
          amp: 0.16 + Math.random() * 0.18,
          w1: 0.0005 + Math.random() * 0.0007,
          w2: 0.0011 + Math.random() * 0.001,
          p1: Math.random() * 6.283,
          p2: Math.random() * 6.283,
        });
        nextSpawn = t + 3000 + Math.random() * 2000; // 3–5 s
      }
      for (let k = sparks.length - 1; k >= 0; k--) {
        const sp = sparks[k];
        const lt = t - sp.born;
        if (lt > sp.life) {
          sparks.splice(k, 1);
          continue;
        }
        const u = lt / sp.life;
        const env = Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.15); // fade in/out
        let s = sp.s0 + sp.drift * u +
          sp.amp * (Math.sin(lt * sp.w1 + sp.p1) + 0.6 * Math.sin(lt * sp.w2 + sp.p2));
        s = reflect(s, 0.02, 0.98);
        const rHead = rMin + s * (rMax - rMin);
        const thHead = Math.log(rHead / rMin) / K;
        const hx = toX(pu + rHead * Math.cos(thHead));
        const hy = toY(pv + rHead * Math.sin(thHead));
        const tw = 0.6 + 0.4 * Math.sin(t * 0.005 + sp.p1); // gentle twinkle
        const rad = 7 * (0.8 + 0.2 * tw);
        const g = c.createRadialGradient(hx, hy, 0, hx, hy, rad);
        g.addColorStop(0, A + 'aa');
        g.addColorStop(0.4, A + '2a');
        g.addColorStop(1, A + '00');
        c.globalAlpha = env;
        c.fillStyle = g;
        c.beginPath();
        c.arc(hx, hy, rad, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = A;
        c.globalAlpha = env * (0.35 + 0.35 * tw);
        c.beginPath();
        c.arc(hx, hy, 1.4, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    };
  },

  brain,

  /* Primitives — lines, arcs, bézier curves and dimension lines (cotas)
     emerging at random positions, drawing themselves in, then fading. The
     CAD drafting feel: geometry appearing on the sheet. */
  primitives(ctx) {
    const { c } = ctx;
    type P = { kind: number; x: number; y: number; r: number; a0: number; bend: number; t: number; life: number };
    const items: P[] = [];
    let spawnAcc = 0;
    let prev = 0;
    const add = () =>
      items.push({
        kind: Math.floor(rand(0, 4)), // 0 line · 1 arc · 2 curve · 3 cota
        x: rand(0.1, 0.9) * ctx.w,
        y: rand(0.12, 0.88) * ctx.h,
        r: rand(50, 150),
        a0: rand(0, Math.PI * 2),
        bend: rand(0.35, 0.85) * (Math.random() < 0.5 ? -1 : 1),
        t: 0,
        life: rand(2800, 4400),
      });
    return (t) => {
      const dt = prev ? t - prev : 16;
      prev = t;
      spawnAcc += dt;
      if (spawnAcc > 650 && items.length < 9) {
        spawnAcc = 0;
        add();
      }
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.strokeStyle = ctx.color;
      c.fillStyle = ctx.color;
      c.lineWidth = 1;
      c.font = '10px ui-monospace, monospace';
      for (let i = items.length - 1; i >= 0; i--) {
        const p = items[i];
        p.t += dt;
        const k = p.t / p.life;
        if (k >= 1) {
          items.splice(i, 1);
          continue;
        }
        const grow = Math.min(1, k * 3); // draw-in over the first third
        const fade = k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
        c.globalAlpha = 0.5 * fade;

        const ca = Math.cos(p.a0);
        const sa = Math.sin(p.a0);
        const px = -sa; // unit perpendicular
        const py = ca;

        c.beginPath();
        if (p.kind === 0) {
          // straight line drawing in
          c.moveTo(p.x, p.y);
          c.lineTo(p.x + ca * p.r * grow, p.y + sa * p.r * grow);
          c.stroke();
        } else if (p.kind === 1) {
          // arc / semicircle sweeping its angle open
          c.arc(p.x, p.y, p.r, p.a0, p.a0 + Math.PI * grow);
          c.stroke();
        } else if (p.kind === 2) {
          // quadratic bézier curve, sampled up to `grow`
          const ex = p.x + ca * p.r;
          const ey = p.y + sa * p.r;
          const cxp = (p.x + ex) / 2 + px * p.r * p.bend;
          const cyp = (p.y + ey) / 2 + py * p.r * p.bend;
          const steps = 26;
          const upto = Math.max(1, Math.ceil(steps * grow));
          c.moveTo(p.x, p.y);
          for (let s = 1; s <= upto; s++) {
            const tt = (s / steps);
            const u = 1 - tt;
            c.lineTo(
              u * u * p.x + 2 * u * tt * cxp + tt * tt * ex,
              u * u * p.y + 2 * u * tt * cyp + tt * tt * ey
            );
          }
          c.stroke();
        } else {
          // dimension line (cota): extension line + end ticks + measured value
          const ex = p.x + ca * p.r * grow;
          const ey = p.y + sa * p.r * grow;
          const tick = 5;
          c.moveTo(p.x, p.y);
          c.lineTo(ex, ey);
          c.moveTo(p.x - px * tick, p.y - py * tick);
          c.lineTo(p.x + px * tick, p.y + py * tick);
          c.moveTo(ex - px * tick, ey - py * tick);
          c.lineTo(ex + px * tick, ey + py * tick);
          c.stroke();
          if (grow > 0.35) {
            const val = ((p.r * grow) / 20).toFixed(2);
            c.globalAlpha = 0.6 * fade;
            c.fillText(val, (p.x + ex) / 2 + px * 9, (p.y + ey) / 2 + py * 9);
          }
        }
      }
      c.globalAlpha = 1;
    };
  },

  /* Starfield — small, white stars sweeping in slow arcs (the pole sits well
     below the frame, so paths curve instead of closing into circles), each
     twinkling on its own, with frequent shooting stars, a few stars that fringe
     like a lens aberration, and slow aurora curtains. Astro Denoise. */
  starfield(ctx) {
    const { c } = ctx;
    const N = Math.min(150, Math.floor((ctx.w * ctx.h) / 8000));
    const poleX = ctx.w * 0.5;
    const poleY = ctx.h * 1.9; // pole far below the frame → arcs, not circles
    const stars = Array.from({ length: N }, () => {
      const dx = Math.random() * ctx.w - poleX;
      const dy = Math.random() * ctx.h - poleY;
      return {
        rad: Math.hypot(dx, dy),
        ang: Math.atan2(dy, dx),
        r: rand(0.4, 1.5),
        ph: rand(0, Math.PI * 2),
        sp: rand(0.3, 2.4), // twinkle speed — wide spread, so none sync up
        base: rand(0.25, 0.7), // resting brightness
        amp: rand(0.2, 0.6), // twinkle depth
        chroma: Math.random() < 0.22, // a few fringe like a lens aberration
      };
    });
    const OMEGA = 0.000013; // sky rotation (rad/ms) — gentle sweep along the arc
    type Shot = { x: number; y: number; vx: number; vy: number; t: number; life: number };
    let shot: Shot | null = null;
    let nextShot = rand(1000, 2800);
    let acc = 0;
    // pointer-tracing state
    let mx = -9999;
    let my = -9999;
    let hasPointer = false;
    const traceSeen = new Map<string, number>();
    const ac = new AbortController();
    document.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        mx = e.clientX;
        my = e.clientY;
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
    // aurora curtains — slow undulating bands near the top (green + essence)
    const aurora = [
      { color: 'rgb(110,231,183)', yBase: ctx.h * 0.14, amp: 26, freq: 0.005, sp: 0.00028, ph: 0, h: 120, a: 0.09 },
      { color: ctx.color, yBase: ctx.h * 0.23, amp: 38, freq: 0.0038, sp: 0.0002, ph: 1.7, h: 150, a: 0.08 },
    ];
    let prevT = 0;
    return (t) => {
      if (!ctx.canvas.isConnected) {
        ac.abort();
        return;
      }
      const dt = prevT ? t - prevT : 16;
      prevT = t;
      c.clearRect(0, 0, ctx.w, ctx.h);

      // aurora curtains, drawn behind the stars — two harmonics on the top edge,
      // a rippling thickness, a slow vertical bob, and a faint shimmer
      for (const a of aurora) {
        const step = Math.max(8, ctx.w / 64);
        const bob = Math.sin(t * 0.00008 + a.ph) * 16;
        const top = (x: number) =>
          a.yBase + bob +
          Math.sin(x * a.freq + t * a.sp + a.ph) * a.amp +
          Math.sin(x * a.freq * 2.3 - t * a.sp * 1.6 + a.ph) * a.amp * 0.4;
        const thick = (x: number) => a.h + Math.sin(x * a.freq * 1.7 + t * a.sp * 1.3 + a.ph) * 26;
        c.beginPath();
        for (let x = 0; x <= ctx.w; x += step) {
          const y = top(x);
          x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        for (let x = ctx.w; x >= 0; x -= step) {
          c.lineTo(x, top(x) + thick(x));
        }
        c.closePath();
        const g = c.createLinearGradient(0, a.yBase + bob - a.amp, 0, a.yBase + bob + a.amp + a.h + 26);
        g.addColorStop(0, 'transparent');
        g.addColorStop(0.5, a.color);
        g.addColorStop(1, 'transparent');
        c.globalAlpha = a.a * (0.7 + 0.3 * Math.sin(t * 0.00022 + a.ph));
        c.fillStyle = g;
        c.fill();
      }

      // sparse noise speckle that never resolves
      c.fillStyle = 'rgb(255,255,255)';
      for (let i = 0; i < 30; i++) {
        c.globalAlpha = 0.05;
        c.fillRect(Math.random() * ctx.w, Math.random() * ctx.h, 1, 1);
      }

      // stars — rigid rotation around the pole, each twinkling on its own
      // collect positions for pointer tracing
      const starPos: { x: number; y: number }[] = [];
      for (const s of stars) {
        s.ang += OMEGA * dt;
        let x = poleX + s.rad * Math.cos(s.ang);
        let y = poleY + s.rad * Math.sin(s.ang);
        if (x < -4 || x > ctx.w + 4 || y < -4 || y > ctx.h + 4) {
          // swept off the frame — re-seed somewhere visible, keep rotating
          const ndx = Math.random() * ctx.w - poleX;
          const ndy = Math.random() * ctx.h - poleY;
          s.rad = Math.hypot(ndx, ndy);
          s.ang = Math.atan2(ndy, ndx);
          x = poleX + s.rad * Math.cos(s.ang);
          y = poleY + s.rad * Math.sin(s.ang);
        }
        starPos.push({ x, y });
        let tw = s.base + s.amp * Math.sin(t * 0.0016 * s.sp + s.ph);
        tw = tw < 0 ? 0 : tw > 1 ? 1 : tw;
        if (s.chroma) {
          c.globalAlpha = tw * 0.45;
          c.fillStyle = 'rgb(255,90,90)';
          c.beginPath();
          c.arc(x - 1.2, y, s.r, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgb(90,170,255)';
          c.beginPath();
          c.arc(x + 1.2, y, s.r, 0, Math.PI * 2);
          c.fill();
        }
        c.globalAlpha = tw;
        c.fillStyle = '#eef2ff';
        c.beginPath();
        c.arc(x, y, s.r, 0, Math.PI * 2);
        c.fill();
      }

      // shooting stars (frequent)
      acc += dt;
      if (!shot && acc > nextShot) {
        acc = 0;
        nextShot = rand(1400, 3600);
        shot = {
          x: rand(0, ctx.w * 0.6),
          y: rand(0, ctx.h * 0.4),
          vx: rand(0.25, 0.5),
          vy: rand(0.12, 0.24),
          t: 0,
          life: 900,
        };
      }
      if (shot) {
        shot.t += dt;
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        const k = shot.t / shot.life;
        const fade = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
        const len = 42;
        c.globalAlpha = Math.max(0, fade) * 0.85;
        c.strokeStyle = '#eef2ff';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(shot.x, shot.y);
        c.lineTo(shot.x - shot.vx * len, shot.y - shot.vy * len);
        c.stroke();
        if (k >= 1) shot = null;
      }

      // pointer-traced edges between nearby stars
      if (hasPointer && starPos.length) {
        // collect indices of stars within 130px of cursor
        const nearby: number[] = [];
        for (let i = 0; i < starPos.length; i++) {
          const dx = starPos[i].x - mx;
          const dy = starPos[i].y - my;
          if (dx * dx + dy * dy < 16900) nearby.push(i); // 130^2
        }
        // record live edges between nearby pairs within 90px
        for (let a = 0; a < nearby.length; a++) {
          const i = nearby[a];
          for (let b = a + 1; b < nearby.length; b++) {
            const j = nearby[b];
            const dx = starPos[i].x - starPos[j].x;
            const dy = starPos[i].y - starPos[j].y;
            if (dx * dx + dy * dy < 8100) { // 90^2
              traceSeen.set(`${i}-${j}`, t);
            }
          }
        }
      }
      if (starPos.length) {
        // draw and sweep edges
        const edges: { i: number; j: number; age: number }[] = [];
        for (const [key, seen] of traceSeen) {
          const age = t - seen;
          if (age > 1500) {
            traceSeen.delete(key);
          } else {
            const [si, sj] = key.split('-').map(Number);
            if (si < starPos.length && sj < starPos.length) {
              edges.push({ i: si, j: sj, age });
            }
          }
        }
        // cap at ~40 nearest-first
        edges.sort((e1, e2) => {
          const d1 = (starPos[e1.i].x - mx) ** 2 + (starPos[e1.i].y - my) ** 2;
          const d2 = (starPos[e2.i].x - mx) ** 2 + (starPos[e2.i].y - my) ** 2;
          return d1 - d2;
        });
        const maxEdges = 40;
        c.strokeStyle = '#eef2ff';
        c.lineWidth = 1;
        for (let e = 0; e < Math.min(maxEdges, edges.length); e++) {
          const { i, j, age } = edges[e];
          const a = 0.14 * (1 - age / 1500);
          c.globalAlpha = a;
          c.beginPath();
          c.moveTo(starPos[i].x, starPos[i].y);
          c.lineTo(starPos[j].x, starPos[j].y);
          c.stroke();
        }
      }

      c.globalAlpha = 1;
    };
  },

  /* Forge — embers rising from the heat below, flickering. Texforge. */
  forge(ctx) {
    const { c } = ctx;
    const N = Math.min(110, Math.floor((ctx.w * ctx.h) / 14000));
    const spawn = (initial: boolean) => ({
      x: rand(0, ctx.w),
      y: initial ? rand(0, ctx.h) : ctx.h + rand(0, 30),
      vy: rand(0.2, 0.6),
      ph: rand(0, Math.PI * 2),
      s: rand(0.8, 2.3),
    });
    const ps = Array.from({ length: N }, () => spawn(true));
    return (t) => {
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.fillStyle = ctx.color;
      for (const p of ps) {
        p.y -= p.vy;
        p.x += Math.sin(t * 0.001 + p.ph) * 0.35;
        if (p.y < -10) Object.assign(p, spawn(false));
        const flick = 0.6 + 0.35 * Math.sin(t * 0.004 + p.ph * 5);
        const heat = Math.max(0, p.y / ctx.h); // brighter near the bottom
        c.globalAlpha = flick * (0.5 + 0.45 * heat);
        c.beginPath();
        c.arc(p.x, p.y, p.s, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    };
  },

  /* Gitgraph — a commit graph flowing down its lanes, branching and merging.
     Gitkit. */
  gitgraph(ctx) {
    const { c } = ctx;
    const gap = 72;
    const lanes = Math.max(2, Math.floor((ctx.w - 80) / gap));
    const x0 = (ctx.w - (lanes - 1) * gap) / 2;
    const laneX = (i: number) => x0 + i * gap;
    const vgap = 46;
    const speed = 0.14;
    type Node = { x: number; y: number; px: number; py: number; r: number };
    let nodes: Node[] = [];
    let tipLane = Math.floor(lanes / 2);
    let tipX = laneX(tipLane);
    let tipY = ctx.h;
    function addNode() {
      const py = tipY;
      const px = tipX;
      if (Math.random() < 0.5) {
        tipLane = Math.min(lanes - 1, Math.max(0, tipLane + (Math.random() < 0.5 ? -1 : 1)));
      }
      tipX = laneX(tipLane);
      tipY -= vgap;
      nodes.push({ x: tipX, y: tipY, px, py, r: rand(2.2, 3.4) });
      // fork: a short branch splitting off into an adjacent lane
      if (Math.random() < 0.5) {
        const bl = Math.min(lanes - 1, Math.max(0, tipLane + (Math.random() < 0.5 ? -1 : 1)));
        if (bl !== tipLane) {
          nodes.push({ x: laneX(bl), y: tipY - rand(8, 20), px: tipX, py: tipY, r: rand(1.8, 2.8) });
        }
      }
    }
    while (tipY > -vgap) addNode();
    let prevT = 0;
    return (t) => {
      const dt = prevT ? t - prevT : 16;
      prevT = t;
      const dy = speed * dt;
      for (const n of nodes) {
        n.y += dy;
        n.py += dy;
      }
      tipY += dy;
      while (tipY > -vgap) addNode();
      nodes = nodes.filter((n) => n.y < ctx.h + 80);
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.strokeStyle = ctx.color;
      c.fillStyle = ctx.color;
      c.lineWidth = 1.1;
      c.globalAlpha = 0.18;
      for (const n of nodes) {
        c.beginPath();
        c.moveTo(n.px, n.py);
        if (Math.abs(n.x - n.px) < 0.5) {
          c.lineTo(n.x, n.y);
        } else {
          const my = (n.py + n.y) / 2;
          c.bezierCurveTo(n.px, my, n.x, my, n.x, n.y);
        }
        c.stroke();
      }
      c.globalAlpha = 0.45;
      for (const n of nodes) {
        c.beginPath();
        c.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    };
  },

  /* Bubbles — GitKit's drifting commit graph: soft orbs rise like bubbles,
     each drawn as a commit node (filled core + ring), linked by gitgraph
     lane segments that re-link from live positions so the graph breathes.
     The cursor stirs nearby orbs; they ease back to their rise. */
  bubbles(ctx) {
    const { c } = ctx;
    const A = ctx.color.length === 7 ? ctx.color : '#e8a4c8';
    const hex = ctx.bg.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const dark = lum < 0.4;
    const N = Math.min(35, Math.floor((ctx.w * ctx.h) / 35000));
    type Bubble = { x: number; y: number; r: number; vy: number; vy0: number; vx: number; ph: number; opacity: number };
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
        opacity: rand(dark ? 0.06 : 0.3, dark ? 0.15 : 0.55),
      };
    });
    // Cursor stir (same shape as the scaffold spotlight, inlined — no import):
    // a lerped pointer; orbs within REACH pick up a sideways impulse and ease
    // back. Touch input never drags; leaving the window parks at 50%/30%.
    // Reduced motion never reaches here (ThemeBackground returns early).
    const REACH = 160;
    let tx = ctx.w * 0.5;
    let ty = ctx.h * 0.3;
    let sx = tx;
    let sy = ty;
    let hasPointer = false;
    const ac = new AbortController();
    document.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        tx = e.clientX;
        ty = e.clientY;
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
      if (!hasPointer) {
        tx = ctx.w * 0.5;
        ty = ctx.h * 0.3;
      }
      sx += (tx - sx) * 0.08;
      sy += (ty - sy) * 0.08;
      const dt = prevT ? t - prevT : 16;
      prevT = t;
      c.clearRect(0, 0, ctx.w, ctx.h);
      for (const b of bubbles) {
        b.y -= b.vy;
        b.x += Math.sin(t * 0.0008 + b.ph) * 0.5 + b.vx;
        const dx = b.x - sx;
        const dy = b.y - sy;
        if (Math.hypot(dx, dy) < REACH) {
          b.vx += dx * 0.00012 * dt;
          if (b.vx > 0.6) b.vx = 0.6;
          else if (b.vx < -0.6) b.vx = -0.6;
          b.vy *= 0.995; // tiny damp: orbs near the pointer pause their rise
        }
        b.vy += (b.vy0 - b.vy) * 0.02; // …and ease back to their own rise rate
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
      for (const b of bubbles) {
        const grad = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, A + (dark ? '20' : '80'));
        grad.addColorStop(0.5, A + (dark ? '10' : '50'));
        grad.addColorStop(1, A + '00');
        c.globalAlpha = b.opacity;
        c.fillStyle = grad;
        c.beginPath();
        c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = b.opacity * (dark ? 0.3 : 0.8);
        c.fillStyle = dark ? '#ffffff' : A;
        c.beginPath();
        c.arc(b.x, b.y, b.r * 0.32, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = b.opacity;
        c.strokeStyle = dark ? '#ffffff' : A;
        c.lineWidth = 1;
        c.beginPath();
        c.arc(b.x, b.y, b.r * 0.52, 0, Math.PI * 2);
        c.stroke();
      }
      c.globalAlpha = 1;
    };
  },

  /* Industrial — slow-turning gears and copper sparks rising from below.
     Ghscaff's foundry floor. */
  industrial(ctx) {
    const { c } = ctx;
    const A = ctx.color.length === 7 ? ctx.color : '#b87333';
    // Gears: fixed positions, each rotates at its own speed.
    type Gear = { x: number; y: number; r: number; teeth: number; speed: number; angle: number };
    const gears: Gear[] = [];
    const N = Math.min(6, Math.floor((ctx.w * ctx.h) / 80000) + 2);
    for (let i = 0; i < N; i++) {
      gears.push({
        x: rand(ctx.w * 0.1, ctx.w * 0.9),
        y: rand(ctx.h * 0.15, ctx.h * 0.85),
        r: rand(40, 100),
        teeth: Math.floor(rand(8, 16)),
        speed: rand(0.00003, 0.00012) * (Math.random() < 0.5 ? 1 : -1),
        angle: rand(0, Math.PI * 2),
      });
    }
    // Sparks: copper embers rising, like forge heat.
    const sparks = Array.from({ length: Math.min(40, Math.floor((ctx.w * ctx.h) / 30000)) }, () => ({
      x: rand(0, ctx.w),
      y: rand(0, ctx.h),
      vy: rand(0.15, 0.45),
      s: rand(0.5, 1.8),
      ph: rand(0, Math.PI * 2),
    }));
    let prevT = 0;
    return (t) => {
      const dt = prevT ? t - prevT : 16;
      prevT = t;
      c.clearRect(0, 0, ctx.w, ctx.h);
      // Gears — faint mechanical structure
      c.strokeStyle = A;
      c.lineWidth = 1;
      c.globalAlpha = 0.08;
      for (const g of gears) {
        g.angle += g.speed * dt;
        c.save();
        c.translate(g.x, g.y);
        c.rotate(g.angle);
        // Outer ring with teeth
        c.beginPath();
        const step = (Math.PI * 2) / g.teeth;
        for (let i = 0; i < g.teeth; i++) {
          const a0 = i * step;
          const a1 = a0 + step * 0.3;
          const a2 = a0 + step * 0.7;
          const a3 = a0 + step;
          const rInner = g.r * 0.85;
          const rOuter = g.r;
          c.lineTo(Math.cos(a0) * rInner, Math.sin(a0) * rInner);
          c.lineTo(Math.cos(a1) * rOuter, Math.sin(a1) * rOuter);
          c.lineTo(Math.cos(a2) * rOuter, Math.sin(a2) * rOuter);
          c.lineTo(Math.cos(a3) * rInner, Math.sin(a3) * rInner);
        }
        c.closePath();
        c.stroke();
        // Inner circle
        c.beginPath();
        c.arc(0, 0, g.r * 0.35, 0, Math.PI * 2);
        c.stroke();
        // Spokes
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          c.beginPath();
          c.moveTo(Math.cos(a) * g.r * 0.35, Math.sin(a) * g.r * 0.35);
          c.lineTo(Math.cos(a) * g.r * 0.8, Math.sin(a) * g.r * 0.8);
          c.stroke();
        }
        c.restore();
      }
      // Sparks — copper embers rising
      c.fillStyle = A;
      for (const s of sparks) {
        s.y -= s.vy;
        s.x += Math.sin(t * 0.001 + s.ph) * 0.3;
        if (s.y < -10) {
          s.y = ctx.h + rand(0, 20);
          s.x = rand(0, ctx.w);
        }
        const flick = 0.5 + 0.4 * Math.sin(t * 0.003 + s.ph * 4);
        const heat = Math.max(0, s.y / ctx.h);
        c.globalAlpha = flick * (0.25 + 0.4 * heat);
        c.beginPath();
        c.arc(s.x, s.y, s.s, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    };
  },

  /* Scaffold — an orthogonal frame, braced diagonally and bolted at the
     joints. Ghscaff. */
  scaffold(ctx) {
    const { c } = ctx;
    // Midnight re-tint on the industrial surface only: the registry still
    // carries copper for OG/home, but the live lattice reads blueprint-violet
    // behind the glass. c.strokeStyle keeps using ctx.color — the caller value
    // is swapped here, no second hue is introduced.
    if (typeof document !== 'undefined' && document.documentElement.dataset.surface === 'industrial') {
      ctx.color = '#8b7cf6';
    }
    const g = 84;
    let cols = 0;
    let rows = 0;
    const dims = () => {
      cols = Math.ceil(ctx.w / g) + 1;
      rows = Math.ceil(ctx.h / g) + 1;
    };
    dims();
    type Brace = { gx: number; gy: number; diag: number; t: number; life: number };
    const braces: Brace[] = [];
    const add = () =>
      braces.push({
        gx: Math.floor(rand(0, cols - 1)),
        gy: Math.floor(rand(0, rows - 1)),
        diag: Math.random() < 0.5 ? 0 : 1,
        t: 0,
        life: rand(3200, 5600),
      });
    for (let i = 0; i < 4; i++) add();
    let spawnAcc = 0;
    let prevT = 0;
    // Cursor-anchored spotlight: one radial violet-white wash following the
    // pointer, lerped to avoid jitter. Touch parks at 50%/30%; reduced-motion
    // never reaches here (ThemeBackground returns early).
    const spot = createSpotlight(ctx);
    return (t) => {
      const sp = spot.step();
      if (!sp) return;
      if (cols !== Math.ceil(ctx.w / g) + 1) dims();
      const dt = prevT ? t - prevT : 16;
      prevT = t;
      spawnAcc += dt;
      if (spawnAcc > 1000 && braces.length < 9) {
        spawnAcc = 0;
        add();
      }
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.strokeStyle = ctx.color;
      c.lineWidth = 1;
      // standing frame — the persistent grid
      c.globalAlpha = 0.13;
      c.beginPath();
      for (let x = 0; x <= cols; x++) {
        c.moveTo(x * g, 0);
        c.lineTo(x * g, ctx.h);
      }
      for (let y = 0; y <= rows; y++) {
        c.moveTo(0, y * g);
        c.lineTo(ctx.w, y * g);
      }
      c.stroke();
      // diagonal braces: paint in quickly, then hold (a persistent lattice that
      // only fades gently at the very end) — the lines being drawn are the motion
      for (let i = braces.length - 1; i >= 0; i--) {
        const b = braces[i];
        b.t += dt;
        const k = b.t / b.life;
        if (k >= 1) {
          braces.splice(i, 1);
          continue;
        }
        const grow = Math.min(1, k * 12);
        const fade = k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1;
        const x = b.gx * g;
        const y = b.gy * g;
        c.globalAlpha = 0.5 * fade;
        c.beginPath();
        if (b.diag === 0) {
          c.moveTo(x, y);
          c.lineTo(x + g * grow, y + g * grow);
        } else {
          c.moveTo(x + g, y);
          c.lineTo(x + g - g * grow, y + g * grow);
        }
        c.stroke();
        if (grow > 0.5) {
          c.globalAlpha = 0.55 * fade;
          c.fillStyle = ctx.color;
          for (const [bx, by] of [[x, y], [x + g, y], [x, y + g], [x + g, y + g]]) {
            c.fillRect(bx - 1.5, by - 1.5, 3, 3);
          }
        }
      }
      // ONE cursor-anchored spotlight: violet-white wash over the grid, under
      // content. Single radial gradient, composited additively on the dark.
      spot.paint(c, sp.x, sp.y);
      c.globalAlpha = 1;
    };
  },

  /* Drift — a calm field of slow particles in the essence color. Default. */
  drift(ctx) {
    const { c } = ctx;
    const N = Math.min(54, Math.floor((ctx.w * ctx.h) / 26000));
    const ps = Array.from({ length: N }, () => ({
      x: Math.random() * ctx.w,
      y: Math.random() * ctx.h,
      vx: rand(-0.18, 0.18),
      vy: rand(-0.18, 0.18),
      s: rand(0.8, 1.8),
    }));
    return () => {
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.fillStyle = ctx.color;
      for (const p of ps) {
        p.x = (p.x + p.vx + ctx.w) % ctx.w;
        p.y = (p.y + p.vy + ctx.h) % ctx.h;
        c.globalAlpha = 0.7;
        c.beginPath();
        c.arc(p.x, p.y, p.s, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    };
  },
};

/* Paper — the quiet motif for the cream `paper` surface (texforge): a scatter
   of short fibres, the flecks in a laid sheet, lying still. The cursor is the
   only input — passing over the stock stirs the fibres it crosses and they
   damp back to rest — so an untouched page reads as paper, not as an
   animation. It is picked in startBackground() by `data-surface="paper"`
   rather than keyed on BgTheme, whose type the experiment registry owns (and
   which is out of scope to extend). The ~30fps cap, the resize handling and
   the hidden-tab pause all come from startBackground; prefers-reduced-motion
   never reaches this module at all, because ThemeBackground returns before
   importing it. */
const PAPER: Runner = (ctx) => {
  const { c } = ctx;
  const N = Math.min(30, Math.max(16, Math.floor((ctx.w * ctx.h) / 34000)));
  type Fibre = { x: number; y: number; a: number; len: number; al: number; vx: number; vy: number; va: number };
  const fibres: Fibre[] = Array.from({ length: N }, () => ({
    x: rand(0, ctx.w),
    y: rand(0, ctx.h),
    a: rand(0, Math.PI),
    len: rand(5, 17),
    al: rand(0.2, 0.5),
    vx: 0,
    vy: 0,
    va: 0,
  }));

  // Cursor stir: fibres within reach pick up a nudge along the pointer's path
  // (at most one impulse per frame), then ease back to rest. The first move
  // only records where the pointer came from, so there is no jump from an
  // off-screen origin. Touch has no pointer to stir with — it stays still,
  // and nothing drifts on its own.
  const REACH = 140;
  let px = 0;
  let py = 0;
  let nx = 0;
  let ny = 0;
  let seen = false;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (!seen) {
        px = e.clientX;
        py = e.clientY;
        seen = true;
      }
      nx = e.clientX;
      ny = e.clientY;
    },
    { passive: true }
  );

  return () => {
    if (seen) {
      const dx = nx - px;
      const dy = ny - py;
      if (dx || dy) {
        for (const f of fibres) {
          const d = Math.hypot(f.x - nx, f.y - ny);
          if (d >= REACH) continue;
          const k = 1 - d / REACH;
          f.vx += dx * k * 0.05;
          f.vy += dy * k * 0.05;
          f.va += (dx + dy) * k * 0.00004;
        }
      }
      px = nx;
      py = ny;
    }

    c.clearRect(0, 0, ctx.w, ctx.h);
    c.strokeStyle = ctx.color;
    c.lineWidth = 1;
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
      c.globalAlpha = f.al;
      c.beginPath();
      c.moveTo(f.x - ca, f.y - sa);
      c.lineTo(f.x + ca, f.y + sa);
      c.stroke();
    }
    c.globalAlpha = 1;
  };
};
