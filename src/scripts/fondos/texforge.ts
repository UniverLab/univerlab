import { hostCanvas, pointerIn, loop, loadImage } from './runtime';
import type { Fondo, FondoOpts, MountFondo } from './runtime';

const TILE_W = 620;
const DRY = 0.018;
const ROLLER = 48;
const GARNET = '#7d2c34';

export const mount: MountFondo = (host: HTMLElement, opts: FondoOpts): Fondo => {
  const { base, reduced } = opts;

  const caseEl = document.createElement('div');
  caseEl.style.position = 'absolute';
  caseEl.style.inset = '0';
  caseEl.style.pointerEvents = 'none';
  caseEl.style.backgroundImage = `url(${base}galera.webp)`;
  caseEl.style.backgroundSize = `${TILE_W}px auto`;
  caseEl.style.backgroundRepeat = 'repeat';
  caseEl.style.opacity = '0.1';
  host.appendChild(caseEl);

  if (reduced) {
    return {
      setNight() {},
      destroy() {
        caseEl.remove();
      },
    };
  }

  const { canvas, ctx: c, size } = hostCanvas(host);
  const trail = document.createElement('canvas');
  const inked = document.createElement('canvas');
  const t = trail.getContext('2d') as CanvasRenderingContext2D;
  const k = inked.getContext('2d') as CanvasRenderingContext2D;

  let dpr = 1;
  let w = 0;
  let h = 0;
  let last: { x: number; y: number } | null = null;
  let ready = false;
  let image: HTMLImageElement | null = null;

  const paintInkedCase = () => {
    if (!image) return;
    const pattern = k.createPattern(image, 'repeat');
    if (!pattern) return;
    pattern.setTransform(new DOMMatrix().scale(TILE_W / image.naturalWidth));
    k.setTransform(dpr, 0, 0, dpr, 0, 0);
    k.globalCompositeOperation = 'source-over';
    k.clearRect(0, 0, w, h);
    k.fillStyle = pattern as any;
    k.fillRect(0, 0, w, h);
    k.globalCompositeOperation = 'source-in';
    k.fillStyle = GARNET;
    k.fillRect(0, 0, w, h);
  };

  const resize = () => {
    const s = size();
    dpr = s.dpr;
    w = s.w;
    h = s.h;
    for (const cv of [trail, inked]) {
      cv.width = Math.floor(w * dpr);
      cv.height = Math.floor(h * dpr);
    }
    t.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (ready) paintInkedCase();
  };

  const roll = (x: number, y: number) => {
    const from = last || { x, y };
    t.globalCompositeOperation = 'source-over';
    t.strokeStyle = 'rgba(0,0,0,0.38)';
    t.lineCap = 'round';
    t.lineWidth = ROLLER;
    t.shadowColor = 'rgba(0,0,0,0.6)';
    t.shadowBlur = 14;
    t.beginPath();
    t.moveTo(from.x, from.y);
    t.lineTo(x, y);
    t.stroke();
    last = { x, y };
  };

  const frame = () => {
    const s = size();
    if (s.w !== w || s.h !== h || s.dpr !== dpr || w === 0) resize();
    if (!ready || !image) return;
    t.globalCompositeOperation = 'destination-out';
    t.shadowBlur = 0;
    t.fillStyle = `rgba(0,0,0,${DRY})`;
    t.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.globalAlpha = 0.7;
    c.drawImage(inked, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(trail, 0, 0);
  };

  const resetLast = () => {
    last = null;
  };
  window.addEventListener('pointerdown', resetLast);

  const unsubPointer = pointerIn(host, (x, y) => roll(x, y), () => {
    last = null;
  });

  const stopLoop = loop(host, frame);

  loadImage(base + 'galera.webp').then((img) => {
    image = img;
    ready = true;
    resize();
  });

  return {
    setNight() {
      // night state is carried by the page surface; the engraving is unchanged.
    },
    destroy() {
      window.removeEventListener('pointerdown', resetLast);
      unsubPointer();
      stopLoop();
      (canvas as any).__ro?.disconnect?.();
      canvas.remove();
      caseEl.remove();
    },
  };
};