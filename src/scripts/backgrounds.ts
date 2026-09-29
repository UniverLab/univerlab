/** Lazy themed canvas backgrounds.
 *  Loaded only after the page has fully loaded, and never under
 *  prefers-reduced-motion. Each theme is intentionally light: small element
 *  counts, capped DPR, and animation paused while the tab is hidden. */

import type { BgTheme as Theme } from '../lib/experiments';
import { brain } from './brain';
import { orbit } from './orbit';
import { bubbles } from './bg-bubbles';
import { takes } from './takes';
import { spiral } from './bg-spiral';
import { paper } from './bg-paper';
import { scaffold } from './bg-scaffold';

interface Ctx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  bg: string;
  w: number;
  h: number;
  dpr: number;
}

/** Mount a themed runner on a canvas.
 *  `surface` is optional: when passed it selects the runner (and the surface's
 *  colour overrides) instead of `documentElement.dataset.surface` — the home
 *  cards pass their experiment's own surface so a card window previews exactly
 *  what its page runs. With no 5th argument the behavior is bit-for-bit what
 *  the pages do today. */
export function startBackground(
  canvas: HTMLCanvasElement,
  theme: Theme,
  color: string,
  bg = '#0a0b0e',
  surface?: string
) {
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
    ctx.c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', debounce(resize, 200));

  // The surface selector — the explicit `surface` argument when the caller
  // has one (the home card passes its experiment's own surface, so the window
  // previews exactly what its page runs), else the page's `data-surface` on
  // <html>, which is the path every experiment page takes. The cream `paper`
  // surface (texforge) mounts its own quiet motif instead of the experiment's
  // BgTheme: forge embers are the wrong register on parchment, and BgTheme's
  // type is owned by the experiment registry (out of scope to extend with a
  // new key), so the surface flag is the selector.
  // Reduced motion never reaches this module at all — ThemeBackground returns
  // before importing it.
  const surf = surface ?? document.documentElement.dataset.surface;
  const isPaper = surf === 'paper';
  if (isPaper) ctx.color = '#6a563e'; // bistre ink marks, never amber embers
  const isPastel = surf === 'pastel';
  if (isPastel) ctx.color = '#6d28d9'; // voltage violet, not registry pink
  const runner = pickRunner(theme, surf);
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

/** Which runner a theme gets on a given surface. The surface wins whenever it
 *  is known: `paper` (texforge) mounts the quiet parchment motif instead of
 *  the theme's own runner, so a landing card that passes its experiment's
 *  surface runs the very runner its page runs. With no surface the selector
 *  falls back to the page's `data-surface` — the unchanged path for every
 *  experiment page. Pure: no DOM write, one DOM read (the page fallback). */
export function pickRunner(theme: Theme, surface?: string): Runner {
  const surf = surface ?? document.documentElement.dataset.surface;
  return surf === 'paper' ? paper : (THEMES[theme] ?? THEMES.cosmic);
}

const THEMES: Record<Theme, Runner> = {
  /* Cosmic — motes orbiting a gravity well at (w/2, 0.42h): the universe /
   Pensamiento Cósmico of the main site, with faint links between neighbours.
   The cursor is a second, moving mass in that same system (R13) — it pulls the
   motes it passes into temporary orbits and brightens the links between them,
   so the pointer speaks the product's own language (gravity) instead of
   blowing generic particles about. /status moves the well to 0.75w so the
   orbits stay clear of the Mission Log column's text; every other cosmic page
   keeps the centred well. Restores the pre-lvis-home-windows mechanics on
   every cosmic page; the home-only "field" runner is gone. orbit.ts. */
  cosmic: orbit,

  /* Golden fractal — the Fibonacci whirling squares with the golden
     spiral they inscribe, and sparks wandering it. Quorum. The cursor
     biases spark spawning toward the nearest arc point (bg-spiral.ts). */
  spiral,

  brain,

  /* Primitives — lines, arcs, bézier curves and dimension lines (cotas)
     emerging at random positions, drawing themselves in, then fading. The
     CAD drafting feel: geometry appearing on the sheet. Cursor-near spawn:
     while the pointer has moved within the last second, a new element is
     born inside a 160 px disc under it; idle (or pointer left the window,
     or touch) falls back to the original whole-sheet randomness. Idle
     cadence, cap and draw are unchanged. */
  primitives(ctx) {
    const { c } = ctx;
    type P = { kind: number; x: number; y: number; r: number; a0: number; bend: number; t: number; life: number };
    const items: P[] = [];
    let spawnAcc = 0;
    let prev = 0;
    // Cursor input — the lfix-cursor-reactions house pattern (bubbles/spiral):
    // document-level listeners with an AbortController, touch ignored, the
    // position folded into canvas coordinates. The tick decides whether the
    // pointer is still "recent". Reduced motion never reaches this module
    // (ThemeBackground returns before importing it).
    const RECENT_MS = 1000; // how long a move stays recent
    const REACH = 160;      // px — spawn disc radius around the pointer
    let px = -9999;
    let py = -9999;
    let hasPointer = false;
    let lastMove = -Infinity;
    const ac = new AbortController();
    document.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        const rect = ctx.canvas.getBoundingClientRect();
        px = e.clientX - rect.left;   // rect math is mandatory: on the home
        py = e.clientY - rect.top;    // card the canvas is a small box in a card
        hasPointer = true;
        lastMove = performance.now();
      },
      { passive: true, signal: ac.signal }
    );
    document.addEventListener(
      'pointerout',
      (e: PointerEvent) => {
        if (!e.relatedTarget) hasPointer = false; // left the window → idle
      },
      { passive: true, signal: ac.signal }
    );
    // "Recent pointer, inside the sheet" — one expression, used both by the
    // spawn gate and by `add`, so the two can never disagree. The in-bounds
    // test keeps a pointer parked outside the canvas from piling elements on
    // the edge (on /cadspec the canvas is the viewport, so it is always true;
    // on the home card it is false whenever the pointer is off-card).
    const recentAt = (t: number) =>
      hasPointer && t - lastMove < RECENT_MS &&
      px >= 0 && px <= ctx.w && py >= 0 && py <= ctx.h;

    const add = (t: number) => {
      let x: number;
      let y: number;
      if (recentAt(t)) {
        // uniform sample inside the 160 px disc (sqrt keeps it a disc, not a
        // ring), clamped into the same margins the whole-sheet band uses so a
        // pointer at the edge can never push geometry off the sheet
        const a = rand(0, Math.PI * 2);
        const d = REACH * Math.sqrt(Math.random());
        x = px + Math.cos(a) * d;
        y = py + Math.sin(a) * d;
        x = Math.min(Math.max(x, 0.1 * ctx.w), 0.9 * ctx.w);
        y = Math.min(Math.max(y, 0.12 * ctx.h), 0.88 * ctx.h);
      } else {
        x = rand(0.1, 0.9) * ctx.w;   // the old whole-sheet randomness
        y = rand(0.12, 0.88) * ctx.h;
      }
      items.push({
        kind: Math.floor(rand(0, 4)), // 0 line · 1 arc · 2 curve · 3 cota
        x,
        y,
        r: rand(50, 150),
        a0: rand(0, Math.PI * 2),
        bend: rand(0.35, 0.85) * (Math.random() < 0.5 ? -1 : 1),
        t: 0,
        life: rand(2800, 4400),
      });
    };

    let sawRecent = false;
    return (t) => {
      if (!ctx.canvas.isConnected) {
        ac.abort(); // the runner now owns listeners (house pattern)
        return;
      }
      const dt = prev ? t - prev : 16;
      prev = t;
      spawnAcc += dt;
      // idle→recent transition pulls the first cursor-born element onto the
      // sheet right away (same cadence pull as spiral in lfix-cursor-reactions),
      // so the reaction lands well inside the 0.5 s bar. From there the old
      // 650 ms throttle and the 9-item cap apply unchanged in both states.
      const recent = recentAt(t);
      if (recent && !sawRecent) spawnAcc = 650;
      sawRecent = recent;
      if (spawnAcc > 650 && items.length < 9) {
        spawnAcc = 0;
        add(t);
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

  /* Bubbles — GitKit's drifting commit graph. The cursor stages nearby
     commit nodes and a dwell commits them (bg-bubbles.ts). */
  bubbles,

  /* Scaffold — the lattice the cursor raises: cells near the pointer build
     their members in sequence (uprights → ledger → brace) and a re-pass
     levels them instead of stacking. bg-scaffold.ts (R13 · ghscaff). */
  scaffold,

  /* Takes — the cursor's own gesture becomes a take that the background
     records, normalizes into a score, and replays with a ghost cursor.
     DemoStage: "the demo is the source" (takes.ts). */
  takes,
};
