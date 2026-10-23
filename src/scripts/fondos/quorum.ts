import { hostCanvas, pointerIn, loop } from './runtime';
import type { Fondo, FondoOpts, MountFondo } from './runtime';

export const K = Math.log(1.618) / (Math.PI / 2);
export const COLOR_NIGHT = '#d6ad5a';
export const COLOR_DAY = '#b58d39';
export const BG_NIGHT = '#201a16';
export const BG_DAY = '#ece7de';

export const TRACE_RADIUS = 150;
export const TRACE_DRY = 0.008;
export const PLATE_NIGHT = 0.45;
export const PLATE_DAY = 0.55;

export const PU = 0.0;
export const PV = 0.5;
export const R_MIN = 0.28;

export interface Square { x: number; y: number; s: number }

export function getSquares(): { squares: Square[]; bx: number; by: number; bw: number; bh: number } {
  let bx = 0, by = 0, bw = 1, bh = 1;
  const squares: Square[] = [{ x: 0, y: 0, s: 1 }];
  const dirs = ['left', 'top', 'right', 'bottom'];
  for (let i = 0; i < 8; i++) {
    const d = dirs[i % 4];
    if (d === 'left') { const s = bh; bx -= s; bw += s; squares.push({ x: bx, y: by, s }); }
    else if (d === 'top') { const s = bw; by -= s; bh += s; squares.push({ x: bx, y: by, s }); }
    else if (d === 'right') { const s = bh; squares.push({ x: bx + bw, y: by, s }); bw += s; }
    else { const s = bw; squares.push({ x: bx, y: by + bh, s }); bh += s; }
  }
  return { squares, bx, by, bw, bh };
}

const tiling = getSquares();
export const TILING = tiling;
export const R_MAX = Math.max(tiling.bw, tiling.bh) * 0.5;
export const TH_MAX = Math.log(R_MAX / R_MIN) / K;
export const SQUARE_COUNT = tiling.squares.length;

export function reflect(q: number, lo: number, hi: number): number {
  const r = hi - lo;
  const m = (((q - lo) % (2 * r)) + 2 * r) % (2 * r);
  return m <= r ? lo + m : hi - (m - r);
}

export function hashId(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

export function seededRand(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s * 1664525 + 1013904223) | 0; return (s >>> 0) / 4294967296; };
}

export interface Spark {
  alive: boolean;
  born: number;
  s0: number;
  drift: number;
  amp: number;
  w1: number;
  w2: number;
  p1: number;
  p2: number;
  fadeOut: number;
}

export function makeSpark(peerId: string, t: number): Spark {
  const rng = seededRand(hashId(peerId));
  return {
    alive: true,
    born: t,
    s0: 0.1 + rng() * 0.35,
    drift: -0.1 + rng() * 0.5,
    amp: 0.14 + rng() * 0.16,
    w1: 0.0004 + rng() * 0.0006,
    w2: 0.0009 + rng() * 0.0008,
    p1: rng() * 6.283,
    p2: rng() * 6.283,
    fadeOut: 0,
  };
}

export function getSparkPos(sp: Spark, t: number, w: number, h: number) {
  const lt = t - sp.born;
  let s = sp.s0 + sp.drift * Math.sin(lt * 0.0002) +
    sp.amp * (Math.sin(lt * sp.w1 + sp.p1) + 0.6 * Math.sin(lt * sp.w2 + sp.p2));
  s = reflect(s, 0.05, 0.95);
  const rHead = R_MIN + s * (R_MAX - R_MIN);
  const thHead = Math.log(rHead / R_MIN) / K;
  const S = (h * 0.82) / tiling.bh;
  const ox = w * 0.64 - (tiling.bx + tiling.bw / 2) * S;
  const oy = h * 0.5 - (tiling.by + tiling.bh / 2) * S;
  return {
    x: ox + (PU + rHead * Math.cos(thHead)) * S,
    y: oy + (PV + rHead * Math.sin(thHead)) * S,
  };
}

export const PEERS = [{ id: 'ada' }, { id: 'kepler' }, { id: 'noether' }];

export const mount: MountFondo = (host: HTMLElement, opts: FondoOpts): Fondo => {
  const { reduced } = opts;
  let night = opts.night;

  const { canvas, ctx: c, size } = hostCanvas(host);

  let plate: HTMLCanvasElement | null = null;
  let pc: CanvasRenderingContext2D | null = null;
  let trace: HTMLCanvasElement | null = null;
  let tc: CanvasRenderingContext2D | null = null;

  let dpr = 1;
  let w = 0;
  let h = 0;

  const peerSparks = new Map<string, Spark>();
  const now0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  for (const p of PEERS) peerSparks.set(p.id, makeSpark(p.id, now0));

  const resize = () => {
    const s = size();
    dpr = s.dpr;
    w = s.w;
    h = s.h;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    if (!plate) {
      plate = document.createElement('canvas');
      pc = plate.getContext('2d');
      trace = document.createElement('canvas');
      tc = trace.getContext('2d');
    }
    if (plate && trace) {
      plate.width = trace.width = canvas.width;
      plate.height = trace.height = canvas.height;
    }
  };

  const traceAt = (x: number, y: number) => {
    if (!tc) return;
    tc.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    tc.globalCompositeOperation = 'source-over';
    const g = tc.createRadialGradient ? tc.createRadialGradient(x, y, 0, x, y, TRACE_RADIUS) : null;
    if (!g) return;
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    tc.fillStyle = g;
    tc.fillRect(x - TRACE_RADIUS, y - TRACE_RADIUS, TRACE_RADIUS * 2, TRACE_RADIUS * 2);
  };

  const isDay = () => !night;
  const getColor = () => (isDay() ? COLOR_DAY : COLOR_NIGHT);
  const getBg = () => (isDay() ? BG_DAY : BG_NIGHT);

  const drawBoard = (t: number) => {
    const A = getColor();
    const day = isDay();
    const base = day ? 0.24 : 0.12;

    tiling.squares.forEach((q) => {
      const S = (h * 0.82) / tiling.bh;
      const ox = w * 0.64 - (tiling.bx + tiling.bw / 2) * S;
      const oy = h * 0.5 - (tiling.by + tiling.bh / 2) * S;
      const toX = (u: number) => ox + u * S;
      const toY = (v: number) => oy + v * S;
      const x = toX(q.x);
      const y = toY(q.y);
      const side = q.s * S;
      c.strokeStyle = A;
      c.lineWidth = 1;
      c.globalAlpha = base;
      c.strokeRect?.(x, y, side, side);
    });

    if (pc && plate && trace && tc) {
      pc.setTransform?.(1, 0, 0, 1, 0, 0);
      pc.clearRect?.(0, 0, plate.width, plate.height);
      pc.setTransform?.(dpr, 0, 0, dpr, 0, 0);
      pc.strokeStyle = A;
      pc.fillStyle = A;
      pc.lineWidth = 1;
      pc.globalAlpha = 1;

      const S = (h * 0.82) / tiling.bh;
      const ox = w * 0.64 - (tiling.bx + tiling.bw / 2) * S;
      const oy = h * 0.5 - (tiling.by + tiling.bh / 2) * S;
      const toX = (u: number) => ox + u * S;
      const toY = (v: number) => oy + v * S;

      tiling.squares.forEach((q) => {
        const x = toX(q.x);
        const y = toY(q.y);
        const side = q.s * S;
        for (const [cx, cy] of [[x, y], [x + side, y], [x, y + side], [x + side, y + side]]) {
          pc!.beginPath?.();
          pc!.arc?.(cx, cy, 1.4, 0, Math.PI * 2);
          pc!.fill?.();
        }
        const tk = Math.min(6, side * 0.06);
        pc!.beginPath?.();
        pc!.moveTo?.(x + side / 2, y - tk);
        pc!.lineTo?.(x + side / 2, y + tk);
        pc!.moveTo?.(x + side / 2, y + side - tk);
        pc!.lineTo?.(x + side / 2, y + side + tk);
        pc!.moveTo?.(x - tk, y + side / 2);
        pc!.lineTo?.(x + tk, y + side / 2);
        pc!.moveTo?.(x + side - tk, y + side / 2);
        pc!.lineTo?.(x + side + tk, y + side / 2);
        pc!.stroke?.();
        const fs = Math.min(15, side * 0.09);
        if (fs >= 9) {
          pc!.font = `italic ${fs}px "Old Standard TT", Georgia, serif`;
          pc!.textBaseline = 'top';
          pc!.fillText?.(String(q.s), x + fs * 0.5, y + fs * 0.4);
        }
      });

      tc.setTransform?.(1, 0, 0, 1, 0, 0);
      tc.globalCompositeOperation = 'destination-out';
      tc.fillStyle = `rgba(0,0,0,${TRACE_DRY})`;
      tc.fillRect?.(0, 0, trace.width, trace.height);

      pc.setTransform?.(1, 0, 0, 1, 0, 0);
      pc.globalCompositeOperation = 'destination-in';
      pc.drawImage?.(trace, 0, 0);
      pc.globalCompositeOperation = 'source-over';

      c.save?.();
      c.setTransform?.(1, 0, 0, 1, 0, 0);
      c.globalAlpha = day ? PLATE_DAY : PLATE_NIGHT;
      c.drawImage?.(plate, 0, 0);
      c.restore?.();
    }

    const S = (h * 0.82) / tiling.bh;
    const ox = w * 0.64 - (tiling.bx + tiling.bw / 2) * S;
    const oy = h * 0.5 - (tiling.by + tiling.bh / 2) * S;
    const toX = (u: number) => ox + u * S;
    const toY = (v: number) => oy + v * S;

    c.lineCap = 'round';
    c.strokeStyle = A;
    c.lineWidth = day ? 1.6 : 1.3;
    c.globalAlpha = day ? 0.27 : 0.12;
    c.beginPath?.();
    for (let i = 0; i <= 220; i++) {
      const th = (i / 220) * TH_MAX;
      const r = R_MIN * Math.exp(K * th);
      const x = toX(PU + r * Math.cos(th));
      const y = toY(PV + r * Math.sin(th));
      if (i) c.lineTo?.(x, y); else c.moveTo?.(x, y);
    }
    c.stroke?.();
    c.globalAlpha = 1;

    const FADE_MS = 2000;
    for (const [id, sp] of peerSparks) {
      const lt = t - sp.born;
      const fadeIn = Math.min(1, lt / 1200);
      const env = fadeIn * (sp.fadeOut ? 0 : 1);
      if (sp.fadeOut) {
        const fp = (t - sp.fadeOut) / FADE_MS;
        if (fp >= 1) { peerSparks.delete(id); continue; }
      }
      const pos = getSparkPos(sp, t, w, h);
      const hx = pos.x;
      const hy = pos.y;
      const tw = 0.7 + 0.3 * Math.sin(t * 0.004 + sp.p1);
      const baseRad = 8;
      const rad = baseRad * (0.8 + 0.2 * tw);
      const g = c.createRadialGradient ? c.createRadialGradient(hx, hy, 0, hx, hy, rad) : null;
      if (!g) { c.globalAlpha = 1; continue; }
      g.addColorStop(0, A + 'cc');
      g.addColorStop(0.35, A + '33');
      g.addColorStop(1, A + '00');
      c.globalAlpha = env;
      c.fillStyle = g;
      c.beginPath?.();
      c.arc?.(hx, hy, rad, 0, Math.PI * 2);
      c.fill?.();
      c.fillStyle = A;
      c.globalAlpha = env * (0.5 + 0.35 * tw);
      c.beginPath?.();
      c.arc?.(hx, hy, 1.6, 0, Math.PI * 2);
      c.fill?.();
    }
    c.globalAlpha = 1;
  };

  const render = (t: number) => {
    const s = size();
    if (s.w !== w || s.h !== h || s.dpr !== dpr || w === 0) resize();
    if (w === 0 || h === 0) return;
    c.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    c.clearRect?.(0, 0, w, h);
    c.fillStyle = getBg();
    c.fillRect?.(0, 0, w, h);
    drawBoard(t);
  };

  resize();

  if (reduced) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    render(t0);
    return {
      setNight(n: boolean) { night = n; },
      destroy() {
        (canvas as any).__ro?.disconnect?.();
        canvas.remove();
        plate?.remove();
        trace?.remove();
      },
    };
  }

  const unsubPointer = pointerIn(host, (x, y) => traceAt(x, y));
  const stopLoop = loop(host, (now: number) => render(now));

  return {
    setNight(n: boolean) { night = n; },
    destroy() {
      unsubPointer();
      stopLoop();
      (canvas as any).__ro?.disconnect?.();
      canvas.remove();
      plate?.remove();
      trace?.remove();
    },
  };
};
