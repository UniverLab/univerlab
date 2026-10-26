import { hostCanvas, pointerIn, loop, loadImage } from './runtime';
import type { Fondo, FondoOpts, MountFondo } from './runtime';

const RAD = Math.PI / 180;

export const TURN_DEG_PER_S = 0.3;
export const PAN = 0.06;
export const EASE = 0.04;
export const POLE = { x: 0.6, y: 0.3 };

export const STOPS: Array<[number, number[]]> = [
  [-0.3, [196, 210, 245]],
  [0.0, [236, 236, 230]],
  [0.6, [242, 228, 192]],
  [1.1, [238, 200, 150]],
  [1.8, [226, 168, 122]],
];

export function tint(bv: number): string {
  for (let i = 1; i < STOPS.length; i++) {
    if (bv <= STOPS[i][0] || i === STOPS.length - 1) {
      const [b0, c0] = STOPS[i - 1];
      const [b1, c1] = STOPS[i];
      const f = Math.max(0, Math.min(1, (bv - b0) / (b1 - b0)));
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * f)).join(',')})`;
    }
  }
  return `rgb(236,236,230)`;
}

export function rho(dec: number, k: number = 1): number {
  return k * Math.tan((90 - dec) / 2 * RAD);
}

export const mount: MountFondo = (host: HTMLElement, opts: FondoOpts): Fondo => {
  const { base, reduced } = opts;

  const { canvas, ctx: c, size } = hostCanvas(host);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let k = 1;
  let reach = 1;

  let stars: Array<{ ra: number; dec: number; mag: number; color: string; size: number; alpha: number }> = [];
  let lines: any[] = [];
  let paper: HTMLImageElement | null = null;

  let aim = { x: 0, y: 0 };
  let view = { x: 0, y: 0 };
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  let loaded = false;

  const recompute = () => {
    const s = size();
    dpr = s.dpr;
    w = s.w;
    h = s.h;
    const px0 = w * POLE.x;
    const py0 = h * POLE.y;
    reach = Math.max(
      Math.hypot(px0, py0),
      Math.hypot(w - px0, py0),
      Math.hypot(px0, h - py0),
      Math.hypot(w - px0, h - py0),
    ) * 1.1;
    k = reach / Math.tan((90 - 5) / 2 * RAD);
  };

  const render = (rot: number) => {
    const s = size();
    if (s.w !== w || s.h !== h || s.dpr !== dpr || w === 0) recompute();
    const px = w * (POLE.x - view.x);
    const py = h * (POLE.y - view.y);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.save();
    c.translate(px, py);
    c.rotate(-rot);
    if (paper) {
      c.globalAlpha = 0.9;
      c.drawImage(paper, -reach, -reach * 0.6, reach * 2, reach * 1.2);
    }
    c.strokeStyle = '#e9e0c8';
    c.lineWidth = 0.6;
    for (let d = 80; d >= -20; d -= 10) {
      c.globalAlpha = d % 30 === 0 ? 0.2 : 0.11;
      c.beginPath();
      c.arc(0, 0, rho(d, k), 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 0.12;
    for (let ra = 0; ra < 360; ra += 30) {
      const a = -ra * RAD;
      c.beginPath();
      c.moveTo(Math.cos(a) * rho(80, k), Math.sin(a) * rho(80, k));
      c.lineTo(Math.cos(a) * rho(-25, k), Math.sin(a) * rho(-25, k));
      c.stroke();
    }
    c.setLineDash([3, 4]);
    c.lineWidth = 0.8;
    c.globalAlpha = 0.22;
    for (const line of lines) {
      c.beginPath();
      (line as any[]).forEach(([ra, dec]: any, i: number) => {
        const r = rho(dec, k);
        const a = -ra * RAD;
        if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      });
      c.stroke();
    }
    c.setLineDash([]);
    for (const s of stars) {
      const r = rho(s.dec, k);
      const a = -s.ra * RAD;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      c.globalAlpha = s.alpha;
      c.fillStyle = s.color;
      c.beginPath();
      c.arc(x, y, s.size, 0, Math.PI * 2);
      c.fill();
      if (s.mag < 1.6) {
        c.strokeStyle = s.color;
        c.lineWidth = 0.7;
        c.globalAlpha = 0.55;
        const l = s.size * 3.2;
        c.beginPath();
        c.moveTo(x - l, y);
        c.lineTo(x + l, y);
        c.moveTo(x, y - l);
        c.lineTo(x, y + l);
        c.stroke();
      }
    }
    c.restore();
    c.globalAlpha = 1;
  };

  const loadAll = async () => {
    try {
      paper = await loadImage(base + 'papel.webp');
    } catch {
      paper = null;
    }
    try {
      const r = await fetch(base + 'lineas.json');
      lines = await r.json();
    } catch {
      lines = [];
    }
    try {
      const r = await fetch(base + 'estrellas.json');
      const rows = await r.json();
      stars = (rows as any[]).map(([ra, dec, mag, bv]: any) => ({
        ra,
        dec,
        mag,
        color: tint(bv),
        size: Math.max(0.5, 3.0 - 0.48 * mag),
        alpha: Math.max(0.35, Math.min(1, 1.25 - 0.13 * mag)),
      })).sort((p: any, q: any) => q.mag - p.mag);
    } catch {
      stars = [];
    }
    loaded = true;
    if (reduced) render(0);
  };

  let unsubPointer: (() => void) | null = null;
  let stopLoop: (() => void) | null = null;

  if (!reduced) {
    unsubPointer = pointerIn(
      host,
      (x, y) => {
        if (w === 0) recompute();
        aim = { x: (x / w - 0.5) * PAN, y: (y / h - 0.5) * PAN };
      },
      () => {
        aim = { x: 0, y: 0 };
      },
    );
    stopLoop = loop(host, (now: number) => {
      if (!loaded) return;
      if (w === 0) recompute();
      view.x += (aim.x - view.x) * EASE;
      view.y += (aim.y - view.y) * EASE;
      const rot = ((now - t0) / 1000) * TURN_DEG_PER_S * RAD;
      render(rot);
    });
  }

  loadAll();

  return {
    setNight() {},
    destroy() {
      if (unsubPointer) unsubPointer();
      if (stopLoop) stopLoop();
      (canvas as any).__ro?.disconnect?.();
      canvas.remove();
    },
  };
};