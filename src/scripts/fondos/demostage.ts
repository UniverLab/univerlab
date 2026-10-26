import { hostCanvas, pointerIn, loop, loadImage } from './runtime';
import type { Fondo, FondoOpts, MountFondo } from './runtime';

export const FRAMES = 11;
export const STEP_PX = 70;
export const ACCENT = '#e7654b';
const GRAIN_PX = 192;

export function tint(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = img.naturalWidth;
  out.height = img.naturalHeight;
  const k = out.getContext('2d') as CanvasRenderingContext2D;
  k.drawImage(img, 0, 0);
  k.globalCompositeOperation = 'source-in';
  k.fillStyle = color;
  k.fillRect(0, 0, out.width, out.height);
  return out;
}

export function makeGrain(): HTMLCanvasElement {
  const grain = document.createElement('canvas');
  grain.width = GRAIN_PX;
  grain.height = GRAIN_PX;
  const k = grain.getContext('2d') as CanvasRenderingContext2D;
  const data = k.createImageData(GRAIN_PX, GRAIN_PX);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.random() * 255;
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  k.putImageData(data, 0, 0);
  return grain;
}

export const mount: MountFondo = (host: HTMLElement, opts: FondoOpts): Fondo => {
  const { base, reduced } = opts;
  const { canvas, ctx: c, size } = hostCanvas(host);

  let sheet: HTMLImageElement | null = null;
  let lit: HTMLCanvasElement | null = null;
  let grain: HTMLCanvasElement | null = null;
  let frame = 0;
  let travel = 0;
  let last: { x: number; y: number } | null = null;

  const paint = () => {
    if (!sheet || !lit || !grain) return;
    const { w, h, dpr } = size();
    const fw = sheet.naturalWidth / FRAMES;
    const fh = sheet.naturalHeight;
    const n = frame % FRAMES;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bw = Math.min(w * 0.86, 1100);
    const bh = (bw * fh) / fw;
    c.globalAlpha = 0.14 + Math.random() * 0.02;
    c.drawImage(sheet, n * fw, 0, fw, fh, (w - bw) / 2, h * 0.1, bw, bh);

    const sw = Math.min(w - 24, 980);
    const cell = sw / FRAMES;
    const sh = (cell * fh) / fw;
    const sx = (w - sw) / 2;
    const sy = h - sh - 16;
    for (let i = 0; i < FRAMES; i++) {
      const active = i === n;
      c.globalAlpha = active ? 0.85 : 0.14;
      c.drawImage(active ? lit : sheet, i * fw, 0, fw, fh, sx + i * cell, sy, cell - 3, sh);
    }

    c.globalAlpha = 0.05;
    c.globalCompositeOperation = 'screen';
    c.drawImage(grain, Math.random() * -GRAIN_PX, Math.random() * -GRAIN_PX, w + 2 * GRAIN_PX, h + 2 * GRAIN_PX);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  };

  const ready = loadImage(base + 'galope.webp').then((image) => {
    sheet = image;
    lit = tint(image, ACCENT);
    grain = makeGrain();
  });

  if (reduced) {
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => paint()) : null;
    ro?.observe(host);
    ready.then(paint);
    return {
      setNight() {},
      destroy() {
        ro?.disconnect();
        (canvas as any).__ro?.disconnect?.();
        canvas.remove();
      },
    };
  }

  const onMove = (x: number, y: number) => {
    if (last) travel += Math.hypot(x - last.x, y - last.y);
    while (travel >= STEP_PX) {
      travel -= STEP_PX;
      frame += 1;
    }
    last = { x, y };
  };
  const onLeave = () => {
    last = null;
  };
  // A press starts a new stroke: the jump to the pressed point is not travel.
  const onPointerDown = () => {
    last = null;
  };

  window.addEventListener('pointerdown', onPointerDown);
  const unsubPointer = pointerIn(host, onMove, onLeave);
  const stopLoop = loop(host, () => paint());

  return {
    setNight() {},
    destroy() {
      window.removeEventListener('pointerdown', onPointerDown);
      unsubPointer();
      stopLoop();
      (canvas as any).__ro?.disconnect?.();
      canvas.remove();
    },
  };
};
