/** facetMedia background: the faceting machine's lap at large scale.
 *
 *  Concentric rings and a protractor graduation turn slowly from the lower
 *  left over a fine animated static. The cursor is the machine's arm: when
 *  it rests, a 24-edge gem is cut on the spot edge by edge; a finished gem
 *  turns signal yellow with `24/24 ✓`. Moving starts a new gem.
 */
import { hostCanvas, pointerIn, loop } from './runtime';
import type { Fondo, FondoOpts, MountFondo } from './runtime';

export const BONE = '#e7ded1';
export const SIGNAL = '#e8c547';
export const EDGES = 24;
export const REST_MS = 250;
export const EDGE_MS = 90;
export const GEM_R = 44;
export const NOISE_MS = 90;
export const NOISE_ALPHA = 0.085;
export const SPIN = 0.00004;

/** 24 segments around (x, y): 8 girdle edges, 8 spokes, 8 table edges. */
export function gemEdges(x: number, y: number, r: number): [number, number][][] {
  const outer: [number, number][] = [];
  const table: [number, number][] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    outer.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
    table.push([x + (r / 2) * Math.cos(a), y + (r / 2) * Math.sin(a)]);
  }
  const segs: [number, number][][] = [];
  for (let k = 0; k < 8; k++) segs.push([outer[k], outer[(k + 1) % 8]]);
  for (let k = 0; k < 8; k++) segs.push([outer[k], table[k]]);
  for (let k = 0; k < 8; k++) segs.push([table[k], table[(k + 1) % 8]]);
  return segs;
}

export const mount: MountFondo = (host: HTMLElement, opts: FondoOpts): Fondo => {
  const { canvas, ctx, size } = hostCanvas(host);
  const noise = document.createElement('canvas');
  const noiseCtx = noise.getContext('2d') as CanvasRenderingContext2D;

  let angle = 0;
  let last = 0;
  let noiseAt = -1e9;
  const pointer = { x: 0, y: 0, still: 0, on: false };
  const gem = { x: 0, y: 0, prog: 0, alpha: 0, placed: false };

  const noisePaint = () => {
    const { w, h } = size();
    const nw = Math.max(1, Math.floor(w / 4));
    const nh = Math.max(1, Math.floor(h / 4));
    noise.width = nw;
    noise.height = nh;
    const img = noiseCtx.createImageData(nw, nh);
    for (let i = 0; i < img.data.length; i += 4) {
      const g = 40 + Math.random() * 200;
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
    noiseCtx.putImageData(img, 0, 0);
  };

  const onMove = (x: number, y: number) => {
    if (pointer.on && Math.hypot(x - pointer.x, y - pointer.y) > 2) pointer.still = 0;
    if (!gem.placed || Math.hypot(x - gem.x, y - gem.y) > 6) {
      gem.x = x;
      gem.y = y;
      gem.prog = 0;
      gem.placed = true;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.on = true;
  };
  const onLeave = () => {
    pointer.on = false;
  };

  const draw = (now: number) => {
    const { w, h, dpr } = size();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 1;

    if (now - noiseAt >= NOISE_MS) {
      noiseAt = now;
      noisePaint();
    }
    ctx.globalAlpha = NOISE_ALPHA;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(noise, 0, 0, w, h);
    ctx.globalAlpha = 1;

    const cx = 0.2 * w;
    const cy = 1.02 * h;
    const R = 0.78 * Math.max(w, h);
    for (let r = 0.18 * R; r <= R; r += 0.055 * R) {
      ctx.strokeStyle = BONE;
      ctx.globalAlpha = r > 0.9 * R ? 0.3 : 0.12;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let t = 0; t < 180; t++) {
      const a = angle + (t * Math.PI) / 90;
      const fifth = t % 5 === 0;
      const r1 = (fifth ? 0.86 : 0.9) * R;
      const r2 = 0.95 * R;
      ctx.strokeStyle = BONE;
      ctx.globalAlpha = fifth ? 0.34 : 0.18;
      ctx.beginPath();
      ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
      ctx.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a));
      ctx.stroke();
    }
    for (let s = 0; s < 12; s++) {
      const a = 0.6 * angle + (s * Math.PI) / 6;
      ctx.strokeStyle = BONE;
      ctx.globalAlpha = 0.08;
      ctx.beginPath();
      ctx.moveTo(cx + 0.18 * R * Math.cos(a), cy + 0.18 * R * Math.sin(a));
      ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (gem.placed && gem.prog > 0 && gem.alpha > 0) {
      const segs = gemEdges(gem.x, gem.y, GEM_R);
      const done = gem.prog >= EDGES;
      const n = Math.min(Math.floor(gem.prog), EDGES);
      ctx.strokeStyle = done ? SIGNAL : BONE;
      ctx.globalAlpha = (done ? 0.95 : 0.6) * gem.alpha;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(segs[i][0][0], segs[i][0][1]);
        ctx.lineTo(segs[i][1][0], segs[i][1][1]);
        ctx.stroke();
      }
      if (!done && gem.prog > n) {
        const f = gem.prog - n;
        const [p0, p1] = segs[n];
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f);
        ctx.stroke();
      }
    }
    if (gem.placed && gem.alpha > 0) {
      const done = gem.prog >= EDGES;
      const text = done ? '24/24 ✓' : `${Math.ceil(Math.min(gem.prog, EDGES))}/24`;
      ctx.font = "11px 'Sometype Mono', ui-monospace, Menlo, monospace";
      ctx.fillStyle = done ? SIGNAL : BONE;
      ctx.globalAlpha = gem.alpha;
      ctx.fillText(text, gem.x + 54, gem.y + 4);
    }
    ctx.globalAlpha = 1;
  };

  const frame = (now: number) => {
    const dt = last ? Math.min(64, Math.max(0, now - last)) : 0;
    last = now;
    if (pointer.on) pointer.still += dt;
    if (!opts.reduced) angle += SPIN * dt;
    if (pointer.on && pointer.still > REST_MS) {
      gem.prog = Math.min(EDGES, gem.prog + dt / EDGE_MS);
      gem.alpha = Math.min(1, gem.alpha + dt / EDGE_MS);
    } else {
      gem.alpha = Math.max(0, gem.alpha - dt / EDGE_MS);
    }
    draw(now);
  };

  const unsub = pointerIn(host, onMove, onLeave);
  const stop = loop(host, frame);

  return {
    setNight() {},
    destroy() {
      unsub();
      stop();
      canvas.remove();
    },
  };
};
