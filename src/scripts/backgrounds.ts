/** Lazy themed canvas backgrounds.
 *  Loaded only after the page has fully loaded, and never under
 *  prefers-reduced-motion. Each theme is intentionally light: small element
 *  counts, capped DPR, and animation paused while the tab is hidden. */

import type { BgTheme as Theme } from '../lib/experiments';

interface Ctx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  w: number;
  h: number;
  dpr: number;
}

export function startBackground(canvas: HTMLCanvasElement, theme: Theme, color: string) {
  const c = canvas.getContext('2d');
  if (!c) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const ctx: Ctx = { canvas, c, color, w: 0, h: 0, dpr };

  function resize() {
    ctx.w = canvas.clientWidth;
    ctx.h = canvas.clientHeight;
    canvas.width = Math.floor(ctx.w * dpr);
    canvas.height = Math.floor(ctx.h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', debounce(resize, 200));

  const runner = THEMES[theme] ?? THEMES.drift;
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

  /* Brian's Brain — the same 3-state automaton as the Canopy TUI, rendered the
     way the terminal draws it: in Braille glyphs (U+2800–U+28FF). The automaton
     runs on a fine sub-grid and every 2×4 block of cells is packed into one
     Braille character, so the field reads as varied glyphs instead of uniform
     dots. Firing cells are drawn bright, dying cells faint. Starts sparse and
     reseeds in small clusters when activity fades, so it revives instead of
     flickering into static. */
  brain(ctx) {
    const { c } = ctx;
    // On-screen size of one Braille character; each packs 2×4 automaton cells.
    const charW = 9;
    const charH = 16;
    // Sub-cell → Braille dot bit, indexed [row 0..3][col 0..1].
    const DOT = [
      [0x01, 0x08],
      [0x02, 0x10],
      [0x04, 0x20],
      [0x40, 0x80],
    ];
    const glyph = (mask: number) => String.fromCharCode(0x2800 + mask);

    let cols = 0; // character columns
    let rows = 0; // character rows
    let gw = 0; // sub-grid width  (cols × 2)
    let gh = 0; // sub-grid height (rows × 4)
    let grid: Uint8Array;

    function init() {
      cols = Math.ceil(ctx.w / charW) + 1;
      rows = Math.ceil(ctx.h / charH) + 1;
      gw = cols * 2;
      gh = rows * 4;
      grid = new Uint8Array(gw * gh);
      // start with little noise
      for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.03 ? 1 : 0;
    }
    init();

    const idx = (x: number, y: number) => ((y + gh) % gh) * gw + ((x + gw) % gw);

    // A cluster of adjacent firing cells: neighbours then see exactly 2 firing
    // cells and ignite, so reseeding actually propagates instead of dying out.
    function seedCluster() {
      const x = Math.floor(Math.random() * gw);
      const y = Math.floor(Math.random() * gh);
      grid[idx(x, y)] = 1;
      grid[idx(x + 1, y)] = 1;
      grid[idx(x, y + 1)] = 1;
    }

    let acc = 0;
    let prev = 0;
    return (t) => {
      if (cols !== Math.ceil(ctx.w / charW) + 1) init();
      acc += prev ? t - prev : 0;
      prev = t;
      if (acc > 130) {
        acc = 0;
        const next = new Uint8Array(grid.length);
        let firing = 0;
        for (let y = 0; y < gh; y++) {
          for (let x = 0; x < gw; x++) {
            const s = grid[y * gw + x];
            if (s === 1) next[y * gw + x] = 2; // firing -> dying
            else if (s === 2) next[y * gw + x] = 0; // dying -> ready
            else {
              let n = 0;
              for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++)
                  if ((dx || dy) && grid[idx(x + dx, y + dy)] === 1) n++;
              next[y * gw + x] = n === 2 ? 1 : 0;
              if (n === 2) firing++;
            }
          }
        }
        grid = next;
        // Gentle revival: only step in once activity is low, with a few
        // propagating clusters so the field stays sparse rather than busy.
        const threshold = Math.max(8, Math.floor(grid.length * 0.006));
        if (firing < threshold) {
          const clusters = Math.max(3, Math.floor(grid.length * 0.0012));
          for (let i = 0; i < clusters; i++) seedCluster();
        }
      }
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.fillStyle = ctx.color;
      c.textBaseline = 'top';
      c.font = `${charH}px ui-monospace, "DejaVu Sans Mono", monospace`;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          let fire = 0;
          let dying = 0;
          for (let r = 0; r < 4; r++) {
            for (let col = 0; col < 2; col++) {
              const s = grid[(cy * 4 + r) * gw + (cx * 2 + col)];
              if (s === 1) fire |= DOT[r][col];
              else if (s === 2) dying |= DOT[r][col];
            }
          }
          if (!fire && !dying) continue;
          const px = cx * charW;
          const py = cy * charH;
          if (dying) {
            c.globalAlpha = 0.12;
            c.fillText(glyph(dying), px, py);
          }
          if (fire) {
            c.globalAlpha = 0.45;
            c.fillText(glyph(fire), px, py);
          }
        }
      }
      c.globalAlpha = 1;
    };
  },

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

  /* Starfield — stars drifting and twinkling, teased out of noise, with the
     occasional shooting star. Astro Denoise. */
  starfield(ctx) {
    const { c } = ctx;
    const N = Math.min(150, Math.floor((ctx.w * ctx.h) / 8000));
    const stars = Array.from({ length: N }, () => ({
      x: Math.random() * ctx.w,
      y: Math.random() * ctx.h,
      r: rand(0.4, 1.6),
      ph: rand(0, Math.PI * 2),
      sp: rand(0.5, 1.7),
      vy: rand(0.05, 0.28), // slow parallax drift
    }));
    type Shot = { x: number; y: number; vx: number; vy: number; t: number; life: number };
    let shot: Shot | null = null;
    let nextShot = rand(1800, 4200);
    let acc = 0;
    let prevT = 0;
    return (t) => {
      const dt = prevT ? t - prevT : 16;
      prevT = t;
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.fillStyle = ctx.color;
      // sparse noise speckle that never resolves
      for (let i = 0; i < 30; i++) {
        c.globalAlpha = 0.05;
        c.fillRect(Math.random() * ctx.w, Math.random() * ctx.h, 1, 1);
      }
      for (const s of stars) {
        s.y += s.vy;
        if (s.y > ctx.h + 2) {
          s.y = -2;
          s.x = Math.random() * ctx.w;
        }
        const tw = 0.3 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.0016 * s.sp + s.ph));
        c.globalAlpha = tw;
        c.beginPath();
        c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        c.fill();
      }
      // shooting star
      acc += dt;
      if (!shot && acc > nextShot) {
        acc = 0;
        nextShot = rand(3000, 7000);
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
        c.globalAlpha = Math.max(0, fade) * 0.8;
        c.strokeStyle = ctx.color;
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(shot.x, shot.y);
        c.lineTo(shot.x - shot.vx * len, shot.y - shot.vy * len);
        c.stroke();
        if (k >= 1) shot = null;
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
        c.globalAlpha = flick * (0.35 + 0.5 * heat);
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

  /* Scaffold — an orthogonal frame, braced diagonally and bolted at the
     joints. Ghscaff. */
  scaffold(ctx) {
    const { c } = ctx;
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
        life: rand(2600, 4200),
      });
    for (let i = 0; i < 5; i++) add();
    let spawnAcc = 0;
    let prevT = 0;
    return (t) => {
      if (cols !== Math.ceil(ctx.w / g) + 1) dims();
      const dt = prevT ? t - prevT : 16;
      prevT = t;
      spawnAcc += dt;
      if (spawnAcc > 520 && braces.length < 14) {
        spawnAcc = 0;
        add();
      }
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.strokeStyle = ctx.color;
      c.lineWidth = 1;
      // standing frame (faint)
      c.globalAlpha = 0.06;
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
      // diagonal braces drawing in, then fading
      for (let i = braces.length - 1; i >= 0; i--) {
        const b = braces[i];
        b.t += dt;
        const k = b.t / b.life;
        if (k >= 1) {
          braces.splice(i, 1);
          continue;
        }
        const grow = Math.min(1, k * 3);
        const fade = k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
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
      s: rand(0.6, 1.5),
    }));
    return () => {
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.fillStyle = ctx.color;
      for (const p of ps) {
        p.x = (p.x + p.vx + ctx.w) % ctx.w;
        p.y = (p.y + p.vy + ctx.h) % ctx.h;
        c.globalAlpha = 0.5;
        c.beginPath();
        c.arc(p.x, p.y, p.s, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    };
  },
};
