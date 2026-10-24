import { hostCanvas, pointerIn, loop, loadImage } from './runtime';
import type { Fondo, FondoOpts, MountFondo } from './runtime';

// Tile width of the rest case at desktop viewports (~1.25 cases per 1440px).
export const TILE_W = 1180;
// Tile width on viewports narrower than 40rem.
export const TILE_W_NARROW = 760;
// Opacity of the faint rest case frame.
export const REST_OPACITY = 0.05;
// Draw alpha of the garnet ink revealed by the roller.
export const INK_ALPHA = 0.5;
// Alpha of the roller's trail stroke.
export const TRAIL_ALPHA = 0.32;
export const DRY = 0.018;
export const ROLLER = 48;
export const GARNET = '#7d2c34';
// Radial mask that keeps the page edges engraved and the reading column clean.
export const MASK = 'radial-gradient(ellipse 62% 72% at 50% 42%, transparent 0 38%, #000 88%)';

const tileW = () => {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(max-width: 40rem)').matches ? TILE_W_NARROW : TILE_W;
  }
  return window.innerWidth < 680 ? TILE_W_NARROW : TILE_W;
};

export const mount: MountFondo = (host: HTMLElement, opts: FondoOpts): Fondo => {
  const { base, reduced } = opts;

  const caseEl = document.createElement('div');
  caseEl.style.position = 'absolute';
  caseEl.style.inset = '0';
  caseEl.style.pointerEvents = 'none';
  caseEl.style.backgroundImage = `url(${base}galera.webp)`;
  caseEl.style.backgroundSize = `${tileW()}px auto`;
  caseEl.style.backgroundRepeat = 'repeat';
  caseEl.style.opacity = String(REST_OPACITY);
  caseEl.style.setProperty('mask-image', MASK);
  caseEl.style.setProperty('-webkit-mask-image', MASK);
  host.appendChild(caseEl);

  if (reduced) {
    const onResize = () => {
      caseEl.style.backgroundSize = `${tileW()}px auto`;
    };
    window.addEventListener('resize', onResize);
    return {
      setNight() {},
      destroy() {
        window.removeEventListener('resize', onResize);
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
    pattern.setTransform(new DOMMatrix().scale(tileW() / image.naturalWidth));
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
    caseEl.style.backgroundSize = `${tileW()}px auto`;
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

  const onResize = () => {
    caseEl.style.backgroundSize = `${tileW()}px auto`;
    if (ready) paintInkedCase();
  };
  window.addEventListener('resize', onResize);

  const roll = (x: number, y: number) => {
    const from = last || { x, y };
    t.globalCompositeOperation = 'source-over';
    t.strokeStyle = `rgba(0,0,0,${TRAIL_ALPHA})`;
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
    c.globalAlpha = INK_ALPHA;
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
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', resetLast);
      unsubPointer();
      stopLoop();
      (canvas as any).__ro?.disconnect?.();
      canvas.remove();
      caseEl.remove();
    },
  };
};
