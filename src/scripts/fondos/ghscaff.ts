import { hostCanvas, pointerIn, loop, loadImage } from './runtime';
import type { Fondo, FondoOpts, MountFondo } from './runtime';

export const TILE_W = 900;
export const REST = 0.06;
export const MASK = 0.8;
export const BLUE = '#70bede';
export const TRAIL_W = 90;
export const SHADOW_BLUR = 30;
export const DRY = 0.006;

function scaleMatrix(s: number): any {
  if (typeof DOMMatrix !== 'undefined') return new DOMMatrix().scale(s);
  return { a: s, b: 0, c: 0, d: s, e: 0, f: 0 };
}

export function tint(img: HTMLImageElement, color: string = BLUE): HTMLCanvasElement {
  const o = document.createElement('canvas');
  o.width = (img as any).naturalWidth || (img as any).width || 0;
  o.height = (img as any).naturalHeight || (img as any).height || 0;
  const k = o.getContext('2d') as CanvasRenderingContext2D | null;
  if (k) {
    k.drawImage(img, 0, 0);
    k.globalCompositeOperation = 'source-in';
    k.fillStyle = color;
    k.fillRect(0, 0, o.width, o.height);
  }
  return o;
}

export const mount: MountFondo = (host: HTMLElement, opts: FondoOpts): Fondo => {
  const { base, reduced } = opts;

  if (reduced) {
    const { canvas, ctx: c, size } = hostCanvas(host);
    let dpr = 1;
    let w = 0;
    let h = 0;
    let image: HTMLImageElement | null = null;
    let ready = false;

    const paint = () => {
      const s = size();
      dpr = s.dpr;
      w = s.w;
      h = s.h;
      if (!ready || !image) return;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const p = c.createPattern(image, 'repeat');
      if (p) p.setTransform(scaleMatrix(TILE_W / image.naturalWidth));
      c.globalAlpha = REST;
      c.fillStyle = p as any;
      c.fillRect(0, 0, w, h);
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        if (!canvas.isConnected) {
          ro?.disconnect();
          return;
        }
        paint();
      });
      ro.observe(host);
    }

    loadImage(base + 'andamio.webp').then((img) => {
      image = img;
      ready = true;
      paint();
    });

    return {
      setNight() {},
      destroy() {
        ro?.disconnect();
        (canvas as any).__ro?.disconnect?.();
        canvas.remove();
      },
    };
  }

  const { canvas, ctx: c, size } = hostCanvas(host);
  const trail = document.createElement('canvas');
  const lit = document.createElement('canvas');
  const mix = document.createElement('canvas');
  const t = trail.getContext('2d') as CanvasRenderingContext2D;
  const l = lit.getContext('2d') as CanvasRenderingContext2D;
  const m = mix.getContext('2d') as CanvasRenderingContext2D;

  let dpr = 1;
  let w = 0;
  let h = 0;
  let last: { x: number; y: number } | null = null;
  let ready = false;
  let image: HTMLImageElement | null = null;
  let imageBlue: HTMLCanvasElement | null = null;

  const resizeLit = () => {
    if (!ready || !imageBlue || !image) return;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.clearRect(0, 0, lit.width, lit.height);
    const p = l.createPattern(imageBlue, 'repeat');
    if (p) p.setTransform(scaleMatrix(dpr * TILE_W / image.naturalWidth));
    l.fillStyle = p as any;
    l.fillRect(0, 0, lit.width, lit.height);
  };

  const resize = () => {
    const s = size();
    dpr = s.dpr;
    w = s.w;
    h = s.h;
    for (const cv of [trail, lit, mix]) {
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
    }
    resizeLit();
  };

  const frame = () => {
    const s = size();
    if (s.w !== w || s.h !== h || s.dpr !== dpr || w === 0) resize();
    if (!ready || !image) return;

    // dry the trail slowly
    t.globalCompositeOperation = 'destination-out';
    t.shadowBlur = 0;
    t.fillStyle = `rgba(0,0,0,${DRY})`;
    t.fillRect(0, 0, trail.width, trail.height);

    // clear main canvas
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // rest engraving
    const rp = c.createPattern(image, 'repeat');
    if (rp) rp.setTransform(scaleMatrix(TILE_W / image.naturalWidth));
    c.globalAlpha = REST;
    c.fillStyle = rp as any;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;

    // mix lit through trail mask
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'copy';
    m.drawImage(lit, 0, 0);
    m.globalCompositeOperation = 'destination-in';
    m.drawImage(trail, 0, 0);
    c.globalAlpha = MASK;
    c.drawImage(mix, 0, 0);
    c.restore();
    c.globalAlpha = 1;
  };

  const lanternFn = (x: number, y: number) => {
    const from = last || { x, y };
    t.globalCompositeOperation = 'source-over';
    t.setTransform(dpr, 0, 0, dpr, 0, 0);
    t.strokeStyle = 'rgba(0,0,0,0.3)';
    t.lineCap = 'round';
    t.lineWidth = TRAIL_W;
    t.shadowColor = 'rgba(0,0,0,0.5)';
    t.shadowBlur = SHADOW_BLUR;
    t.beginPath();
    t.moveTo(from.x, from.y);
    t.lineTo(x, y);
    t.stroke();
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.shadowBlur = 0;
    last = { x, y };
  };

  const resetLast = () => {
    last = null;
  };
  window.addEventListener('pointerdown', resetLast);

  const unsubPointer = pointerIn(host, (x, y) => lanternFn(x, y), () => {
    last = null;
  });

  const stopLoop = loop(host, frame);

  loadImage(base + 'andamio.webp').then((img) => {
    image = img;
    imageBlue = tint(img, BLUE);
    ready = true;
    resize();
  });

  return {
    setNight() {},
    destroy() {
      window.removeEventListener('pointerdown', resetLast);
      unsubPointer();
      stopLoop();
      (canvas as any).__ro?.disconnect?.();
      canvas.remove();
      trail.remove();
      lit.remove();
      mix.remove();
    },
  };
};