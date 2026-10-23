import { hostCanvas, pointerIn, loop, loadImage } from './runtime';
import type { Fondo, FondoOpts, MountFondo } from './runtime';

const BANDS = 48;
const SWAY = 6;
const LIFT_EXP = 1.6;
const BASE_ALPHA = 0.2;
const BLOOM_RADIUS = 70;
const BLOOM_ALPHA = 0.12;
const DRY_ALPHA = 0.0025;
const COMPOSITE_ALPHA = 0.85;
const PINK = '#c13d9b';

interface Drawable {
  naturalWidth?: number;
  naturalHeight?: number;
  width?: number;
  height?: number;
}

export function tint(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const o = document.createElement('canvas');
  o.width = img.naturalWidth || img.width || 0;
  o.height = img.naturalHeight || img.height || 0;
  const k = o.getContext('2d') as CanvasRenderingContext2D | null;
  if (k) {
    k.drawImage(img, 0, 0);
    k.globalCompositeOperation = 'source-in';
    k.fillStyle = color;
    k.fillRect(0, 0, o.width, o.height);
  }
  return o;
}

export function cover(img: Drawable, w: number, h: number): [number, number, number, number] {
  const nw = (img.naturalWidth || img.width)!;
  const nh = (img.naturalHeight || img.height)!;
  const s = Math.max(w / nw, h / nh);
  const dw = nw * s;
  const dh = nh * s;
  return [(w - dw) / 2, (h - dh) / 2, dw, dh];
}

export const mount: MountFondo = (host: HTMLElement, opts: FondoOpts): Fondo => {
  const { base, reduced } = opts;
  const { canvas, ctx: c, size } = hostCanvas(host);

  let dpr = 1;
  let w = 0;
  let h = 0;
  let cana: HTMLImageElement | null = null;
  let canaPink: HTMLCanvasElement | null = null;
  let ready = false;

  let bloom: HTMLCanvasElement | null = null;
  let bl: CanvasRenderingContext2D | null = null;
  let pinkCover: HTMLCanvasElement | null = null;
  let pc: CanvasRenderingContext2D | null = null;
  let mix: HTMLCanvasElement | null = null;
  let mc: CanvasRenderingContext2D | null = null;

  if (!reduced) {
    bloom = document.createElement('canvas');
    bl = bloom.getContext('2d') as CanvasRenderingContext2D | null;
    pinkCover = document.createElement('canvas');
    pc = pinkCover.getContext('2d') as CanvasRenderingContext2D | null;
    mix = document.createElement('canvas');
    mc = mix.getContext('2d') as CanvasRenderingContext2D | null;
  }

  const resizeExtras = () => {
    if (!bloom) return;
    const dw = Math.floor(w * dpr);
    const dh = Math.floor(h * dpr);
    for (const cv of [bloom, pinkCover, mix]) {
      (cv as HTMLCanvasElement).width = dw;
      (cv as HTMLCanvasElement).height = dh;
    }
  };

  const layout = () => {
    const sz = size();
    dpr = sz.dpr;
    w = sz.w;
    h = sz.h;
    resizeExtras();
    if (ready && reduced) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(performance.now());
    }
  };

  const swayed = (k: CanvasRenderingContext2D, img: Drawable, now: number) => {
    const geom = cana || img;
    const [x, y, dw, dh] = cover(geom as Drawable, w, h);
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const sh = ih / BANDS;
    const bh = dh / BANDS;
    const t = now / 1000;
    for (let b = 0; b < BANDS; b++) {
      const lift = Math.pow(1 - b / BANDS, LIFT_EXP);
      const dx = SWAY * lift * (Math.sin(t * 0.7 + b * 0.05) + 0.4 * Math.sin(t * 1.9 + b * 0.11));
      k.drawImage(img as CanvasImageSource, 0, b * sh, iw, sh + 1, x + dx, y + b * bh, dw, bh + 1);
    }
  };

  const paintPink = (now: number) => {
    if (!canaPink || !pc) return;
    pc.setTransform(dpr, 0, 0, dpr, 0, 0);
    pc.clearRect(0, 0, w, h);
    swayed(pc, canaPink, now);
  };

  const render = (now: number) => {
    if (!cana) return;
    c.globalAlpha = BASE_ALPHA;
    swayed(c, cana, now);
    if (mix) c.globalAlpha = 1;
    if (canaPink && pc) paintPink(now);
    if (bl && bloom) {
      bl.globalCompositeOperation = 'destination-out';
      bl.fillStyle = `rgba(0,0,0,${DRY_ALPHA})`;
      bl.fillRect(0, 0, bloom.width, bloom.height);
    }
    if (mc && pinkCover) {
      mc.globalCompositeOperation = 'copy';
      mc.drawImage(pinkCover, 0, 0);
    }
    if (mc && bloom) {
      mc.globalCompositeOperation = 'destination-in';
      mc.drawImage(bloom, 0, 0);
    }
    if (mix) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = COMPOSITE_ALPHA;
      c.drawImage(mix, 0, 0);
      c.restore();
      c.globalAlpha = 1;
    }
  };

  const frame = (now: number) => {
    const s = size();
    if (s.w !== w || s.h !== h || s.dpr !== dpr || w === 0) layout();
    if (!ready) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(now);
  };

  const blossom = (x: number, y: number) => {
    if (!bl) return;
    bl.globalCompositeOperation = 'source-over';
    bl.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = bl.createRadialGradient(x, y, 0, x, y, BLOOM_RADIUS);
    g.addColorStop(0, `rgba(0,0,0,${BLOOM_ALPHA})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    bl.fillStyle = g;
    bl.fillRect(x - BLOOM_RADIUS, y - BLOOM_RADIUS, BLOOM_RADIUS * 2, BLOOM_RADIUS * 2);
    bl.setTransform(1, 0, 0, 1, 0, 0);
  };

  loadImage(base + 'cana.webp').then((img) => {
    cana = img;
    canaPink = tint(img, PINK);
    ready = true;
    layout();
  });

  if (reduced) {
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        if (!canvas.isConnected) {
          ro?.disconnect();
          return;
        }
        layout();
      });
      ro.observe(host);
    }
    return {
      setNight() {},
      destroy() {
        ro?.disconnect();
        (canvas as any).__ro?.disconnect?.();
        canvas.remove();
      },
    };
  }

  const unsubPointer = pointerIn(host, (x, y) => blossom(x, y));
  const stopLoop = loop(host, frame);

  return {
    setNight() {
      // night state is carried by the page surface; the engraving is unchanged.
    },
    destroy() {
      unsubPointer();
      stopLoop();
      (canvas as any).__ro?.disconnect?.();
      canvas.remove();
      bloom?.remove();
      pinkCover?.remove();
      mix?.remove();
    },
  };
};

export { BANDS, SWAY, LIFT_EXP, BLOOM_RADIUS, BLOOM_ALPHA, DRY_ALPHA, BASE_ALPHA, COMPOSITE_ALPHA, PINK };
