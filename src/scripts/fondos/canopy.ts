import { hostCanvas, pointerIn, loop, loadImage } from './runtime';
import type { Fondo, FondoOpts, MountFondo } from './runtime';

const TEAL = '#3fb8b0';
const STEP_MS = 120;
export const ON = 1;
export const DYING = 2;
const BIRTH = 0.8;
const HALO = 0.5;
const COMB_ALPHA = 0.035;
const REVIVE_IDLE = 4000;
const REVIVE_GAP = 3000;
export const MASK = 'radial-gradient(ellipse 70% 78% at 50% 45%, transparent 0 46%, #000 92%)';

export interface CanopyCell {
  x: number;
  y: number;
  w: number;
  h: number;
  n: number[];
}

export function stepCells(
  state: Uint8Array,
  next: Uint8Array,
  cells: Array<{ n: number[] } | null>,
  rand: () => number = Math.random
): Uint8Array {
  for (let k = 0; k < state.length; k++) {
    const cell = cells[k];
    if (!cell) {
      next[k] = 0;
      continue;
    }
    if (state[k] === ON) {
      next[k] = DYING;
    } else if (state[k] === DYING) {
      next[k] = 0;
    } else {
      let on = 0;
      for (const j of cell.n) {
        if (state[j] === ON) on++;
      }
      next[k] = on === 2 && rand() < BIRTH ? ON : 0;
    }
  }
  return next;
}

export const mount: MountFondo = (host: HTMLElement, opts: FondoOpts): Fondo => {
  const { base, reduced } = opts;

  const { canvas, ctx: c, size } = hostCanvas(host);
  canvas.style.setProperty('mask-image', MASK);
  canvas.style.setProperty('-webkit-mask-image', MASK);

  if (reduced) {
    let still: HTMLImageElement | null = null;
    // A resize clears the canvas (hostCanvas reassigns its size), so the still is repainted on every resize.
    const paintStill = () => {
      if (!still) return;
      const sz = size();
      const mapW = still.naturalWidth || 1;
      const mapH = still.naturalHeight || 1;
      const s = Math.max(sz.w / mapW, sz.h / mapH);
      const ox = (sz.w - mapW * s) / 2;
      const oy = (sz.h - mapH * s) / 2;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.setTransform(sz.dpr * s, 0, 0, sz.dpr * s, sz.dpr * ox, sz.dpr * oy);
      c.globalAlpha = COMB_ALPHA;
      c.drawImage(still, 0, 0);
      c.globalAlpha = 1;
    };
    loadImage(base + 'panal.webp').then((img) => {
      still = img;
      paintStill();
    });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paintStill) : null;
    ro?.observe(host);
    return {
      setNight() {},
      destroy() {
        ro?.disconnect();
        (canvas as any).__ro?.disconnect?.();
        canvas.remove();
      },
    };
  }

  const lit = document.createElement('canvas');
  const lc = lit.getContext('2d') as CanvasRenderingContext2D;
  const glow = document.createElement('canvas');
  const gc = glow.getContext('2d') as CanvasRenderingContext2D;

  let dpr = 1;
  let w = 0;
  let h = 0;
  let s = 1;
  let ox = 0;
  let oy = 0;
  let map: { w: number; h: number; cells: CanopyCell[] } | null = null;
  let comb: HTMLImageElement | null = null;
  let cells: CanopyCell[] = [];
  let sprites: Array<HTMLCanvasElement | null> = [];
  let ids: Int32Array | null = null;
  let state: Uint8Array | null = null;
  let next: Uint8Array | null = null;
  let vis: Float32Array | null = null;

  let lastStep = 0;
  let lastInput = 0;
  let lastRevive = 0;
  let lastCell = -1;
  let ready = false;

  const layout = () => {
    const sz = size();
    dpr = sz.dpr;
    w = sz.w;
    h = sz.h;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    if (map) {
      s = Math.max(w / map.w, h / map.h);
      ox = (w - map.w * s) / 2;
      oy = (h - map.h * s) / 2;
    }
  };

  const buildSprites = (labels: HTMLImageElement) => {
    if (!map) return;
    const k = document.createElement('canvas');
    k.width = map.w;
    k.height = map.h;
    const kc = k.getContext('2d') as CanvasRenderingContext2D;
    kc.drawImage(labels, 0, 0);
    const px = kc.getImageData(0, 0, map.w, map.h).data;
    ids = new Int32Array(map.w * map.h);
    for (let i = 0; i < ids.length; i++) {
      ids[i] = px[i * 4] + px[i * 4 + 1] * 256;
    }
    const m = TEAL.match(/\w\w/g) as string[];
    const [r, g, b] = m.map((x) => parseInt(x, 16));
    sprites = cells.map((cell, n) => {
      if (!cell) return null;
      const id = n + 1;
      const sp = document.createElement('canvas');
      sp.width = cell.w;
      sp.height = cell.h;
      const sc = sp.getContext('2d') as CanvasRenderingContext2D;
      const img = sc.createImageData(cell.w, cell.h);
      for (let y = 0; y < cell.h; y++) {
        for (let x = 0; x < cell.w; x++) {
          if (ids![(cell.y + y) * map!.w + cell.x + x] !== id) continue;
          const o = (y * cell.w + x) * 4;
          img.data[o] = r;
          img.data[o + 1] = g;
          img.data[o + 2] = b;
          img.data[o + 3] = 255;
        }
      }
      sc.putImageData(img, 0, 0);
      return sp;
    });
  };

  const cellAt = (x: number, y: number): number => {
    if (!ids || !map) return -1;
    const ix = Math.floor((x - ox) / s);
    const iy = Math.floor((y - oy) / s);
    if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return -1;
    return ids[iy * map.w + ix] - 1;
  };

  const seed = (k: number) => {
    if (k < 0 || !cells[k] || !state) return;
    state[k] = ON;
    const ns = cells[k].n;
    if (ns && ns.length) {
      state[ns[(Math.random() * ns.length) | 0]] = ON;
    }
  };

  const input = (x: number, y: number) => {
    lastInput = performance.now();
    const k = cellAt(x, y);
    if (k !== lastCell) {
      seed(k);
      lastCell = k;
    }
  };

  const frame = (now: number) => {
    if (!ready || !map || !comb || !state || !next || !vis) return;
    const sz = size();
    if (sz.w !== w || sz.h !== h || sz.dpr !== dpr || w === 0) layout();
    if (now - lastStep > STEP_MS) {
      stepCells(state, next, cells, Math.random);
      const tmp = state;
      state = next;
      next = tmp;
      lastStep = now;
      let alive = 0;
      for (let k = 0; k < state.length; k++) if (state[k] === ON) alive++;
      if (
        alive < 2 &&
        now - lastInput > REVIVE_IDLE &&
        now - lastRevive > REVIVE_GAP
      ) {
        seed((Math.random() * cells.length) | 0);
        lastRevive = now;
      }
    }

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    c.globalAlpha = COMB_ALPHA;
    c.drawImage(comb, 0, 0);

    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, lit.width, lit.height);
    for (let k = 0; k < cells.length; k++) {
      if (!sprites[k]) continue;
      const target = state[k] === ON ? 0.55 : state[k] === DYING ? 0.18 : 0;
      vis[k] += (target - vis[k]) * (target > vis[k] ? 0.5 : 0.08);
      if (vis[k] < 0.01) continue;
      lc.globalAlpha = vis[k];
      lc.drawImage(
        sprites[k] as HTMLCanvasElement,
        cells[k].x * HALO,
        cells[k].y * HALO,
        cells[k].w * HALO,
        cells[k].h * HALO
      );
    }
    lc.globalAlpha = 1;

    c.globalAlpha = 1;
    c.drawImage(lit, 0, 0, map.w, map.h);

    gc.globalCompositeOperation = 'copy';
    gc.filter = 'blur(5px)';
    gc.drawImage(lit, 0, 0);
    gc.filter = 'none';
    gc.globalCompositeOperation = 'source-in';
    gc.drawImage(comb, 0, 0, glow.width, glow.height);

    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.9;
    c.drawImage(glow, 0, 0, map.w, map.h);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  };

  const unsubPointer = pointerIn(
    host,
    (x, y) => input(x, y),
    () => {
      lastCell = -1;
    }
  );

  const stopLoop = loop(host, frame);

  Promise.all([
    fetch(base + 'celdas.json').then((r) => r.json()),
    loadImage(base + 'celdas.png'),
    loadImage(base + 'panal.webp'),
  ]).then(([m, labels, img]) => {
    map = m;
    cells = m.cells;
    comb = img;
    state = new Uint8Array(cells.length);
    next = new Uint8Array(cells.length);
    vis = new Float32Array(cells.length);
    buildSprites(labels);
    layout();
    lit.width = glow.width = Math.round(map!.w * HALO);
    lit.height = glow.height = Math.round(map!.h * HALO);
    for (let i = 0; i < 6; i++) seed((Math.random() * cells.length) | 0);
    ready = true;
  });

  return {
    setNight() {},
    destroy() {
      unsubPointer();
      stopLoop();
      (canvas as any).__ro?.disconnect?.();
      canvas.remove();
    },
  };
};