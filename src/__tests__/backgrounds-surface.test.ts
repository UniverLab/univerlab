/**
 * Tests for src/scripts/backgrounds.ts — the module a home card window
 * mounts. Two things live here: the optional 5th `surface` argument (a card
 * previews the SAME runner its page runs: paper for texforge, studio for
 * demostage, blueprint for cadspec…), and the three runners that still live
 * inline in this file (primitives · starfield · forge) — their split-out siblings (brain/orbit/bubbles/takes/spiral/
 * paper/scaffold) are covered by their own suites. Given-When-Then, like
 * brain.test.ts and bg-paper.test.ts.
 */
import { startBackground, pickRunner } from '../scripts/backgrounds';
import { experiments } from '../lib/experiments';
import type { BgTheme } from '../lib/experiments';

type BgCtx = Parameters<ReturnType<typeof pickRunner>>[0];

/* ---------- recording 2D context + canvas harness ---------- */

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/** A recording 2D context stub: every method is logged, every property kept. */
function makeCtx(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {
    globalAlpha: 1,
    lineWidth: 1,
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textBaseline: '',
    lineCap: '',
    shadowBlur: 0,
    shadowColor: '',
  };
  const calls: string[] = [];
  const gradient = { addColorStop: (offset: number, color: string) => { void offset; void color; } };
  const proxy = new Proxy(state, {
    get(t, p) {
      if (typeof p !== 'string') return Reflect.get(t, p);
      if (p in t) return t[p];
      return (...args: unknown[]) => {
        void args;
        calls.push(p);
        if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return gradient;
        if (p === 'measureText') return { width: 8 };
        if (p === 'isPointInPath' || p === 'isPointInStroke') return false;
        if (p === 'getImageData' || p === 'createImageData') return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
        return undefined;
      };
    },
    set(t, p, v) {
      if (typeof p === 'string') t[p] = v;
      return true;
    },
  });
  return Object.assign(proxy, { __calls: calls }) as unknown as CanvasRenderingContext2D;
}

/** How many times `method` was called on a recording context. */
function count(c: CanvasRenderingContext2D, method: string): number {
  return ((c as unknown as { __calls: string[] }).__calls || []).filter((m) => m === method).length;
}

/** A detached-size canvas with a recording context — for the runner suites. */
function sheet(w = 280, h = 240, color = '#6ec6e6', bg = '#0b1020'): BgCtx {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: h, configurable: true });
  const c = makeCtx();
  canvas.getContext = (() => c) as unknown as typeof canvas.getContext;
  document.body.appendChild(canvas);
  return { canvas, c, color, bg, w, h, dpr: 1 };
}

/** Every experiment surface the registry can hand a card. */
const SURFACES: BgTheme[] = [
  'cosmic', 'spiral', 'brain', 'primitives', 'starfield',
  'forge', 'scaffold', 'bubbles', 'takes',
];

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.surface;
});

/* ---------- startBackground: the surface argument ---------- */

describe('startBackground — an explicit surface picks that surface\'s runner', () => {
  let frames: FrameRequestCallback[] = [];
  let raf: jest.SpyInstance;
  let caf: jest.SpyInstance;

  beforeEach(() => {
    frames = [];
    raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    caf = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => 0);
    document.body.innerHTML = '';
    delete document.documentElement.dataset.surface;
  });

  /** Mount a background and expose a manual frame stepper. */
  function mount(theme: BgTheme, color: string, bg: string, surface?: string) {
    const w = 280;
    const h = 120;
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: w, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: h, configurable: true });
    const c = makeCtx();
    canvas.getContext = (() => c) as unknown as typeof canvas.getContext;
    document.body.appendChild(canvas);
    startBackground(canvas, theme, color, bg, surface);
    const bgCtx = (canvas as unknown as { __bgCtx?: BgCtx }).__bgCtx;
    return { canvas, c, bgCtx, step: (t: number) => { const cb = frames.shift(); cb?.(t); } };
  }

  it('mounts the parchment runner when the card passes paper, whatever the page says', () => {
    // Given: the home page (no surface of its own) while the card says `paper`
    document.documentElement.dataset.surface = 'studio';
    // When: texforge's card mounts its own surface
    const { bgCtx, c, step } = mount('forge', '#e0a458', '#fffaf0', 'paper');
    // Then: bistre ink — the paper override, not the forge amber
    expect(bgCtx?.color).toBe('#6a563e');
    // And: the runner that paints is paper's, not the ember field
    step(0);
    step(40);
    expect(count(c, 'fillText')).toBeGreaterThan(0);
  });

  it('gives every experiment the runner its own page runs', () => {
    // Given: the registry — each experiment's own theme and surface
    for (const exp of experiments) {
      // When: that experiment's card mounts with the pair from the registry
      const { bgCtx } = mount(exp.bg, '#ffffff', '#000000', exp.surface);
      // Then: only the two surface colour overrides ever rewrite the colour —
      // every other surface keeps the colour the caller handed it
      const expected =
        exp.surface === 'paper' ? '#6a563e' : exp.surface === 'pastel' ? '#6d28d9' : '#ffffff';
      expect(bgCtx?.color).toBe(expected);
    }
  });

  it('lets an explicit surface beat the page\'s data-surface', () => {
    // Given: a page that runs the paper surface…
    document.documentElement.dataset.surface = 'paper';
    // When: a card for another experiment mounts with its own surface
    const { bgCtx, c, step } = mount('forge', '#e0a458', '#0a0b0e', 'observatory');
    // Then: no bistre rewrite — the argument won
    expect(bgCtx?.color).toBe('#e0a458');
    // And: the forge embers mount, not the parchment motif
    step(0);
    step(40);
    expect(count(c, 'arc')).toBeGreaterThan(0);
    expect(count(c, 'fillText')).toBe(0);
  });

  it('falls back to the page data-surface when no argument is passed', () => {
    // Given: an experiment page whose <html> carries the surface
    document.documentElement.dataset.surface = 'paper';
    // When: ThemeBackground calls the unchanged 4-arg page path
    const { bgCtx } = mount('forge', '#e0a458', '#fffaf0');
    // Then: the page's own surface decides — paper wins, bistre ink
    expect(bgCtx?.color).toBe('#6a563e');
  });

  it('paints voltage violet on the pastel surface and keeps registry pink elsewhere', () => {
    // Given/When: gitkit's card (pastel) and a card with no surface at all
    const pastel = mount('bubbles', '#e8a4c8', '#120b14', 'pastel');
    const plain = mount('bubbles', '#e8a4c8', '#120b14', 'quorum');
    // Then: the surface override only fires for its own surface
    expect(pastel.bgCtx?.color).toBe('#6d28d9');
    expect(plain.bgCtx?.color).toBe('#e8a4c8');
  });

  it('returns without mounting when the canvas has no 2D context', () => {
    // Given: a canvas jsdom cannot give a context to
    const canvas = document.createElement('canvas');
    canvas.getContext = (() => null) as typeof canvas.getContext;
    // When/Then: nothing is mounted and no loop is scheduled
    startBackground(canvas, 'forge', '#e0a458', '#0a0b0e', 'paper');
    expect((canvas as unknown as { __bgCtx?: BgCtx }).__bgCtx).toBeUndefined();
    expect(raf).not.toHaveBeenCalled();
  });

  it('caps the loop near 30 fps and pauses it while the tab is hidden', () => {
    // Given: a mounted forge background
    const { c, step } = mount('forge', '#e0a458', '#0a0b0e', 'observatory');
    // When: frames land inside the 33 ms budget, then outside it
    step(0); // first frame: 0 − 0 → skipped
    expect(count(c, 'clearRect')).toBe(0);
    step(40); // 40 ms later → a real frame
    expect(count(c, 'clearRect')).toBe(1);
    step(50); // 10 ms later → skipped
    expect(count(c, 'clearRect')).toBe(1);
    // And: hiding the tab cancels the pending frame…
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(caf).toHaveBeenCalled();
    // …and showing it schedules a fresh one that paints again
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const batch = frames.splice(0);
    expect(batch.length).toBeGreaterThan(0);
    batch.forEach((cb) => cb(100));
    expect(count(c, 'clearRect')).toBe(2);
  });

  it('re-measures the canvas once per burst of resize events', async () => {
    // Given: a freshly mounted background (one setTransform from the mount)
    const { c } = mount('forge', '#e0a458', '#0a0b0e', 'observatory');
    const before = count(c, 'setTransform');
    expect(before).toBe(1);
    // When: two resizes land inside the debounce window
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    await new Promise((r) => setTimeout(r, 320));
    // Then: exactly one trailing re-measure
    expect(count(c, 'setTransform')).toBe(before + 1);
  });
});

/* ---------- pickRunner: the pure selector ---------- */

describe('pickRunner — the surface wins, the theme is the fallback', () => {
  it('hands paper to every theme on the paper surface', () => {
    for (const theme of SURFACES) {
      expect(pickRunner(theme, 'paper')).toBe(pickRunner('forge', 'paper'));
    }
  });

  it('falls back to cosmic for a theme it does not know', () => {
    expect(pickRunner('nope' as BgTheme, 'quorum')).toBe(pickRunner('cosmic', 'quorum'));
    expect(pickRunner('nope' as BgTheme)).toBe(pickRunner('cosmic'));
  });

  it('reads the page data-surface when no surface argument is passed', () => {
    document.documentElement.dataset.surface = 'paper';
    try {
      expect(pickRunner('scaffold')).toBe(pickRunner('scaffold', 'paper'));
    } finally {
      delete document.documentElement.dataset.surface;
    }
    expect(pickRunner('scaffold')).toBe(pickRunner('scaffold', 'industrial'));
  });
});

/* ---------- the runners that still live inline in backgrounds.ts ---------- */

describe('primitives (cadspec) — every geometry kind, cursor and idle', () => {
  it('draws lines, arcs, curves and cotas, and retires what expires', () => {
    // Given: a deterministic sheet per kind (kind = floor(rand(0, 4)))
    for (const v of [0.1, 0.3, 0.5, 0.9]) {
      jest.spyOn(Math, 'random').mockReturnValue(v);
      const ctx = sheet();
      const tick = pickRunner('primitives', 'blueprint')(ctx);
      // When: twelve spawn windows elapse (650 ms cadence, 9-item cap)
      for (let t = 700; t <= 700 * 12; t += 700) tick(t);
      // Then: the sheet was cleared and painted, and old elements were spliced
      expect(count(ctx.c, 'clearRect')).toBeGreaterThan(0);
      expect(count(ctx.c, 'stroke')).toBeGreaterThan(0);
      if (v === 0.9) {
        // the cota branch prints its measured value once grown past 0.35
        expect(count(ctx.c, 'fillText')).toBeGreaterThan(0);
      }
    }
  });

  it('spawns from the pointer while it is recent and from the sheet when it is not', () => {
    // Given: a recent window measured against a pinned clock
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    jest.spyOn(performance, 'now').mockReturnValue(0);
    const ctx = sheet();
    const tick = pickRunner('primitives', 'blueprint')(ctx);
    tick(16);
    // When: a touch move is ignored and a mouse move arms the window
    firePointer('pointermove', { pointerType: 'touch', clientX: 40, clientY: 40 });
    firePointer('pointermove', { pointerType: 'mouse', clientX: 140, clientY: 120 });
    tick(700); // idle→recent transition pulls spawnAcc to the 650 ms bar
    tick(900); // …and the first cursor-born element lands inside the disc
    expect(count(ctx.c, 'stroke')).toBeGreaterThan(0);
    // And: leaving the window drops the pointer back to the idle path
    firePointer('pointerout', { relatedTarget: null });
    tick(1100);
    // And: a pointer parked outside the sheet never seeds the edge
    firePointer('pointermove', { pointerType: 'mouse', clientX: 999, clientY: 999 });
    tick(1900);
    // And: a pointer that comes back releases a listener it once owned
    firePointer('pointerout', { relatedTarget: document.body });
    expect(count(ctx.c, 'clearRect')).toBeGreaterThan(3);
    // Then: a detached sheet aborts the runner's listeners and stops drawing
    (ctx.canvas as HTMLElement).remove();
    const painted = count(ctx.c, 'clearRect');
    tick(2100);
    expect(count(ctx.c, 'clearRect')).toBe(painted);
  });
});

describe('starfield (astro-denoise) — arcs, aurora, shots and traced edges', () => {
  /** Ticks at a fixed step, with the pointer parked at a star cluster. */
  function run(random: number, steps: number[], pointer?: { x: number; y: number }) {
    jest.spyOn(Math, 'random').mockReturnValue(random);
    const ctx = sheet(1200, 800, '#a78bfa', '#05060f');
    const tick = pickRunner('starfield', 'observatory')(ctx);
    if (pointer) firePointer('pointermove', { pointerType: 'mouse', clientX: pointer.x, clientY: pointer.y });
    for (const t of steps) tick(t);
    return { ctx, tick };
  }

  it('draws on-frame stars, aurora and shots without ever re-seeding', () => {
    // Given: seeds that land on the frame (random 0.5 → all stars at (600,400))
    const steps = Array.from({ length: 25 }, (_, i) => (i + 1) * 100);
    const { ctx } = run(0.5, steps, { x: 600, y: 400 });
    // Then: the aurora gradient, the speckle, the stars and the shot all painted
    expect(count(ctx.c, 'createLinearGradient')).toBeGreaterThan(0);
    expect(count(ctx.c, 'fillRect')).toBeGreaterThan(0);
    expect(count(ctx.c, 'arc')).toBeGreaterThan(0);
    expect(count(ctx.c, 'stroke')).toBeGreaterThan(0);
    // And: the traced edges were drawn between the clustered stars
    expect(count(ctx.c, 'moveTo')).toBeGreaterThan(0);
    // And: a far-later frame sweeps stale edges out of the trace map
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const late = sheet(1200, 800, '#a78bfa', '#05060f');
    const lateTick = pickRunner('starfield', 'observatory')(late);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 600, clientY: 400 });
    for (const t of [100, 200, 300]) lateTick(t);
    lateTick(4000); // age > 1500 → the pair is deleted
    expect(count(late.c, 'clearRect')).toBe(4);
  });

  it('re-seeds stars swept off the frame and paints the chromatic fringe', () => {
    // Given: seeds that all land below the pole, off the frame
    const { ctx } = run(0, [100, 400, 700]);
    // Then: every star re-seeded in place and painted with its chroma pair
    expect(count(ctx.c, 'arc')).toBeGreaterThan(0);
    expect(count(ctx.c, 'fill')).toBeGreaterThan(0);
    expect(count(ctx.c, 'clearRect')).toBe(3);
  });

  it('ignores touch pointers when tracing edges', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const ctx = sheet(1200, 800, '#a78bfa', '#05060f');
    const tick = pickRunner('starfield', 'observatory')(ctx);
    firePointer('pointermove', { pointerType: 'touch', clientX: 600, clientY: 400 });
    tick(100);
    firePointer('pointerout', { relatedTarget: null });
    tick(200);
    expect(count(ctx.c, 'clearRect')).toBe(2);
    // A detached sheet stops the runner
    (ctx.canvas as HTMLElement).remove();
    tick(300);
    expect(count(ctx.c, 'clearRect')).toBe(2);
  });
});

describe('forge (texforge) — embers rise, flicker and respawn', () => {
  it('paints every ember and respawns the ones that leave the sheet', () => {
    // Given: slow, late embers on a short sheet
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    const ctx = sheet(280, 120, '#e0a458', '#0a0b0e');
    const tick = pickRunner('forge', 'observatory')(ctx);
    // When: enough frames pass for the top embers to cycle past −10
    for (let i = 1; i <= 300; i++) tick(i * 16);
    // Then: the field painted and the respawn path ran without stalling
    expect(count(ctx.c, 'clearRect')).toBe(300);
    expect(count(ctx.c, 'arc')).toBeGreaterThan(300);
    expect(count(ctx.c, 'fill')).toBeGreaterThan(300);
  });
});
