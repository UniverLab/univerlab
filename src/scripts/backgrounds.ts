/** Lazy themed canvas backgrounds.
 *  Loaded only after the page has fully loaded, and never under
 *  prefers-reduced-motion. Each theme is intentionally light: small element
 *  counts, capped DPR, and animation paused while the tab is hidden. */

type Theme = 'cosmic' | 'brain' | 'primitives' | 'starfield' | 'drift';

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

  /* Brian's Brain — the same 3-state automaton as the Canopy TUI, drawn as
     dots. Starts calm (sparse) and reseeds in small clusters when activity
     fades, so the field revives instead of flickering into static. */
  brain(ctx) {
    const { c } = ctx;
    const cell = 15;
    let cols = 0;
    let rows = 0;
    let grid: Uint8Array;

    function init() {
      cols = Math.ceil(ctx.w / cell) + 1;
      rows = Math.ceil(ctx.h / cell) + 1;
      grid = new Uint8Array(cols * rows);
      // start with little noise
      for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.06 ? 1 : 0;
    }
    init();

    const idx = (x: number, y: number) => ((y + rows) % rows) * cols + ((x + cols) % cols);

    // A cluster of adjacent firing cells: neighbours then see exactly 2 firing
    // cells and ignite, so reseeding actually propagates instead of dying out.
    function seedCluster() {
      const x = Math.floor(Math.random() * cols);
      const y = Math.floor(Math.random() * rows);
      grid[idx(x, y)] = 1;
      grid[idx(x + 1, y)] = 1;
      grid[idx(x, y + 1)] = 1;
    }

    let acc = 0;
    let prev = 0;
    return (t) => {
      if (cols !== Math.ceil(ctx.w / cell) + 1) init();
      acc += prev ? t - prev : 0;
      prev = t;
      if (acc > 130) {
        acc = 0;
        const next = new Uint8Array(grid.length);
        let firing = 0;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const s = grid[y * cols + x];
            if (s === 1) next[y * cols + x] = 2; // firing -> dying
            else if (s === 2) next[y * cols + x] = 0; // dying -> ready
            else {
              let n = 0;
              for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++)
                  if ((dx || dy) && grid[idx(x + dx, y + dy)] === 1) n++;
              next[y * cols + x] = n === 2 ? 1 : 0;
              if (n === 2) firing++;
            }
          }
        }
        grid = next;
        // Stronger revival: kick in earlier and seed several propagating clusters.
        const threshold = Math.max(10, Math.floor(grid.length * 0.012));
        if (firing < threshold) {
          const clusters = Math.max(5, Math.floor(grid.length * 0.0022));
          for (let i = 0; i < clusters; i++) seedCluster();
        }
      }
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.fillStyle = ctx.color;
      const cx = cell / 2;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const s = grid[y * cols + x];
          if (!s) continue;
          c.globalAlpha = s === 1 ? 0.7 : 0.16;
          c.beginPath();
          c.arc(x * cell + cx, y * cell + cx, s === 1 ? cell * 0.2 : cell * 0.12, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.globalAlpha = 1;
    };
  },

  /* Primitives — lines, arcs and point maps emerging at random positions,
     animating their parameter, then fading. The CAD drafting feel. */
  primitives(ctx) {
    const { c } = ctx;
    type P = { kind: number; x: number; y: number; r: number; a0: number; t: number; life: number };
    const items: P[] = [];
    let spawnAcc = 0;
    let prev = 0;
    const add = () => items.push({
      kind: Math.floor(rand(0, 3)),
      x: rand(0.1, 0.9) * ctx.w,
      y: rand(0.1, 0.9) * ctx.h,
      r: rand(40, 130),
      a0: rand(0, Math.PI * 2),
      t: 0,
      life: rand(2600, 4200),
    });
    return (t) => {
      const dt = prev ? t - prev : 16;
      prev = t;
      spawnAcc += dt;
      if (spawnAcc > 700 && items.length < 9) {
        spawnAcc = 0;
        add();
      }
      c.clearRect(0, 0, ctx.w, ctx.h);
      c.strokeStyle = ctx.color;
      c.fillStyle = ctx.color;
      for (let i = items.length - 1; i >= 0; i--) {
        const p = items[i];
        p.t += dt;
        const k = p.t / p.life;
        if (k >= 1) {
          items.splice(i, 1);
          continue;
        }
        const grow = Math.min(1, k * 3); // draw-in over first third
        const fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        c.globalAlpha = 0.5 * fade;
        c.beginPath();
        if (p.kind === 0) {
          // semicircle sweeping its angle
          c.arc(p.x, p.y, p.r, p.a0, p.a0 + Math.PI * grow);
        } else if (p.kind === 1) {
          // line drawing in
          c.moveTo(p.x, p.y);
          c.lineTo(p.x + Math.cos(p.a0) * p.r * grow, p.y + Math.sin(p.a0) * p.r * grow);
        } else {
          // point map appearing
          const pts = Math.floor(grow * 9);
          for (let n = 0; n < pts; n++) {
            const px = p.x + Math.cos(p.a0 + n) * (p.r * 0.5) + (n % 3) * 10;
            const py = p.y + Math.sin(p.a0 + n) * (p.r * 0.5) + Math.floor(n / 3) * 10;
            c.moveTo(px, py);
            c.arc(px, py, 1.5, 0, Math.PI * 2);
          }
        }
        c.stroke();
        if (p.kind === 2) c.fill();
      }
      c.globalAlpha = 1;
    };
  },

  /* Starfield — faint stars teased out of noise. Astro Denoise. */
  starfield(ctx) {
    const { c } = ctx;
    const N = Math.min(140, Math.floor((ctx.w * ctx.h) / 9000));
    const stars = Array.from({ length: N }, () => ({
      x: Math.random() * ctx.w,
      y: Math.random() * ctx.h,
      r: rand(0.4, 1.5),
      ph: rand(0, Math.PI * 2),
      sp: rand(0.4, 1.4),
    }));
    return (t) => {
      c.clearRect(0, 0, ctx.w, ctx.h);
      // sparse noise speckle that never resolves
      c.fillStyle = ctx.color;
      for (let i = 0; i < 30; i++) {
        c.globalAlpha = 0.05;
        c.fillRect(Math.random() * ctx.w, Math.random() * ctx.h, 1, 1);
      }
      for (const s of stars) {
        const tw = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.sp + s.ph));
        c.globalAlpha = tw;
        c.beginPath();
        c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        c.fill();
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
