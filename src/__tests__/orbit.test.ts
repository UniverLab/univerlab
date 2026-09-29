/**
 * Tests for the orbital cosmic background (src/scripts/orbit.ts), the runner
 * behind EVERY `bg="cosmic"` page: the baseline gravity-well mechanics restored
 * (4d27473^:src/scripts/backgrounds.ts) with the cursor as a second, moving
 * mass (R13). The headline assertion is the first one — with no pointer input
 * a step is byte-identical to the old cosmic step, which is what proves the
 * restore is faithful and the cursor is purely additive.
 * Given-When-Then pattern, like field.test.ts and takes.test.ts.
 */
import { orbit } from '../scripts/orbit';

type OrbitCtx = Parameters<typeof orbit>[0];

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/** A tiny harness: attached canvas + a recording 2D context stub. */
function makeCtx(w = 800, h = 600) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const clearRect = jest.fn();
  const fill = jest.fn();
  const stroke = jest.fn();
  const arcs: Array<{ x: number; y: number; r: number }> = [];
  const alphas: number[] = [];
  let alpha = 1;
  const c = {
    clearRect,
    fill,
    stroke,
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn((x: number, y: number, r: number) => arcs.push({ x, y, r })),
    strokeStyle: '',
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => {
      alphas.push(v);
      alpha = v;
    },
  });
  const ctx: OrbitCtx = { canvas, c, color: '#e6c84a', w, h };
  const reset = () => {
    arcs.length = 0;
    alphas.length = 0;
    clearRect.mockClear();
    fill.mockClear();
    stroke.mockClear();
  };
  return { ctx, canvas, clearRect, fill, stroke, arcs, alphas, reset };
}

/* With Math.random pinned to 0.5 every mote spawns identically:
   a = π, r = 40 + ½(300−40) = 170, s = 0.6 + ½(1) = 1.1
   ⇒ p0 = (400 − 170, 300) = (230, 300), v0 = (≈0, +0.25) */
const PIN = () => jest.spyOn(Math, 'random').mockReturnValue(0.5);
/** A deterministic but realistically spread stream: the same seed gives two
 *  runners the identical sequence of spawns, so a trajectory can be compared
 *  without collapsing all 90 motes onto one point. */
const SEED = () => {
  let s = 20260928 >>> 0;
  jest.spyOn(Math, 'random').mockImplementation(() => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
};
const P0X = 230;
const P0Y = 300;
const S0 = 1.1;

/** One baseline home step, derived from the constants (not from the code). */
const HOME_STEP = {
  // well at (w/2, 0.42h) = (400, 252)
  ax: (14 * 170) / (170 * 170 + 48 * 48 + 2000),
  ay: (14 * -48) / (170 * 170 + 48 * 48 + 2000),
};

/** Split one frame's alpha log into its two bands, dropping the tick's closing
 *  `globalAlpha = 1`. The bands never overlap — links live at ≤0.12, motes at
 *  ≥0.7 — so 0.5 separates them cleanly. */
function bands(alphas: number[]) {
  const written = alphas.slice(0, alphas.length - 1);
  expect(alphas[alphas.length - 1]).toBe(1); // the tick always resets
  return {
    links: written.filter((v) => v <= 0.5),
    motes: written.filter((v) => v > 0.5),
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
  history.pushState({}, '', '/');
});

/* The cosmic runner as it was BEFORE lvis-home-windows (4d27473^), pasted
   byte-for-byte so the equivalence assertion is against history and not
   against a paraphrase of it. */
const legacyRand = (a: number, b: number) => a + Math.random() * (b - a);
function legacyCosmic(ctx: { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D; color: string; w: number; h: number }): (t: number) => void {
  const { c } = ctx;
  const N = Math.min(90, Math.floor((ctx.w * ctx.h) / 16000));
  const ps = Array.from({ length: N }, () => spawn(ctx));
  function spawn(x: { w: number; h: number }) {
    const a = legacyRand(0, Math.PI * 2);
    const r = legacyRand(40, Math.min(x.w, x.h) * 0.5);
    return {
      x: x.w / 2 + Math.cos(a) * r,
      y: x.h / 2 + Math.sin(a) * r,
      vx: Math.sin(a) * 0.25,
      vy: -Math.cos(a) * 0.25,
      s: legacyRand(0.6, 1.6),
    };
  }
  return () => {
    c.clearRect(0, 0, ctx.w, ctx.h);
    const cx = ctx.w / 2;
    const cy = ctx.h * 0.42;
    for (const p of ps) {
      const dx = cx - p.x;
      const dy = cy - p.y;
      const d2 = dx * dx + dy * dy + 2000;
      const f = 14 / d2;
      p.vx += dx * f;
      p.vy += dy * f;
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -20 || p.x > ctx.w + 20 || p.y < -20 || p.y > ctx.h + 20) {
        Object.assign(p, spawn(ctx));
      }
    }
    // faint links
    c.strokeStyle = ctx.color;
    c.globalAlpha = 0.05;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[i].x - ps[j].x;
        const dy = ps[i].y - ps[j].y;
        if (dx * dx + dy * dy < 9000) {
          c.beginPath();
          c.moveTo(ps[i].x, ps[i].y);
          c.lineTo(ps[j].x, ps[j].y);
          c.stroke();
        }
      }
    }
    c.globalAlpha = 0.7;
    c.fillStyle = ctx.color;
    for (const p of ps) {
      c.beginPath();
      c.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  };
}

describe('orbit', () => {
  it('with no pointer input a step is byte-identical to the pre-lvis-home-windows cosmic', () => {
    // Given: the legacy cosmic runner and the new orbit runner over the same
    // pinned state
    PIN();
    const a = makeCtx();
    legacyCosmic(a.ctx)(0);
    PIN();
    const b = makeCtx();
    orbit(b.ctx)(0);
    // Then: every mote lands on exactly the same pixel at the same radius —
    // the ring spawn, the tangential velocity, the (w/2, 0.42h) well and the
    // respawn margins are all still the baseline
    expect(b.arcs).toHaveLength(a.arcs.length);
    expect(b.arcs).toEqual(a.arcs);
    // And: the only alphas the baseline could ever write are still the only
    // ones written (faint links, motes, reset) — the new code adds no new hue
    // and no new alpha band
    expect(b.alphas.every((v) => v === 0.05 || v === 0.7 || v === 1)).toBe(true);
    expect(a.alphas.every((v) => v === 0.05 || v === 0.7 || v === 1)).toBe(true);
    // And: the links the baseline drew are still drawn (all 435 pairs of the
    // 30 coincident motes are within 95 px)
    expect(b.stroke).toHaveBeenCalledTimes(a.stroke.mock.calls.length);
  });

  it('the baseline step matches the well maths derived by hand', () => {
    // Given: a pinned field
    PIN();
    const { ctx, arcs } = makeCtx();
    // When: one massless frame steps
    orbit(ctx)(0);
    // Then: the mote moved by well-only gravity from its pinned spawn point
    expect(arcs[0].x).toBeCloseTo(P0X + HOME_STEP.ax, 9);
    expect(arcs[0].y).toBeCloseTo(P0Y + 0.25 + HOME_STEP.ay, 9);
    // And: it is never frozen — the baseline orbits, it does not sit still
    expect(Math.hypot(arcs[0].x - P0X, arcs[0].y - (P0Y + 0.25))).toBeGreaterThan(0);
  });

  it('a pointer inside its reach bends every mote toward it', () => {
    // Given: two identical pinned runs, one untouched and one stirred
    PIN();
    const a = makeCtx();
    orbit(a.ctx)(0);
    PIN();
    const b = makeCtx();
    const tickB = orbit(b.ctx); // the runner owns the listener: build it first
    firePointer('pointermove', { pointerType: 'mouse', clientX: 275, clientY: 300 });
    tickB(0);
    // When: the difference between them is read
    const dx = b.arcs[0].x - a.arcs[0].x;
    const dy = b.arcs[0].y - a.arcs[0].y;
    // Then: the whole delta IS the pointer's pull — 45 px to the right, same
    // row, so the acceleration points exactly at it: 35/(45²+2000) per px
    expect(dx).toBeCloseTo((35 * 45) / (45 * 45 + 2000), 9);
    expect(Math.abs(dy)).toBeLessThan(1e-12);
    // And: every mote feels it (they are all coincident, so every arc shifts)
    for (let i = 0; i < a.arcs.length; i++) {
      expect(b.arcs[i].x - a.arcs[i].x).toBeCloseTo(dx, 9);
    }
  });

  it('a pointer beyond 260 px exerts exactly zero force', () => {
    // Given: the same untouched run and a run with the pointer 300 px away
    PIN();
    const a = makeCtx();
    orbit(a.ctx)(0);
    PIN();
    const b = makeCtx();
    const tickB = orbit(b.ctx);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 530, clientY: 300 });
    tickB(0);
    // Then: the hard cut holds — the draw is byte-identical to the idle step
    expect(b.arcs).toEqual(a.arcs);
    expect(b.alphas).toEqual(a.alphas);
  });

  it('a massless step stays identical to the old cosmic even from a fast state', () => {
    // Given: the legacy and the new runner, both driven 6 s deep into the
    // system — long past the point where the well has flung motes well over
    // 2.2 px/frame (measured: median 2.46, p90 5.46 at 1440×900). This is the
    // state a flat speed cap would silently rewrite.
    SEED();
    const a = makeCtx(1920, 1080); // 90 motes, the N cap
    const legacyTick = legacyCosmic(a.ctx);
    legacyTick(0);
    for (let i = 0; i < 179; i++) legacyTick(0);
    a.reset();
    legacyTick(0);
    const hotA = a.arcs.map((p) => ({ ...p }));
    a.reset();
    legacyTick(0);
    // Then: this really is a hot state — a flat |v| ≤ 2.2 cap would bind here,
    // so the next assertion is the one that would catch such a cap
    const hot = Math.max(
      ...a.arcs.map((p, i) => Math.hypot(p.x - hotA[i].x, p.y - hotA[i].y))
    );
    expect(hot).toBeGreaterThan(2.2);
    SEED();
    const b = makeCtx(1920, 1080);
    const tick = orbit(b.ctx);
    tick(0);
    for (let i = 0; i < 179; i++) tick(0);
    b.reset();
    tick(0);
    // Then: the hot, fast state is still the baseline, pixel for pixel
    expect(b.arcs).toEqual(hotA);
  });

  it('the cursor can add at most 2.2 px/frame of speed, and never ejects the system', () => {
    // Given: two identical pinned runs — one untouched, one with the pointer
    // trailing 45 px behind the motes and re-fired every frame: a sustained
    // pull, not a flick
    PIN();
    const a = makeCtx();
    const tickA = orbit(a.ctx);
    tickA(0);
    PIN();
    const b = makeCtx();
    const tickB = orbit(b.ctx);
    tickB(0);
    let prev = a.arcs[0].x;
    let prevB = b.arcs[0].x;
    let maxExtra = 0;
    let maxStep = 0;
    // When: 20 frames of continuous attraction
    for (let i = 1; i <= 20; i++) {
      firePointer('pointermove', { pointerType: 'mouse', clientX: prevB + 45, clientY: 300 });
      const before = { x: a.arcs[0].x, y: a.arcs[0].y };
      const beforeB = { x: b.arcs[0].x, y: b.arcs[0].y };
      a.reset(); b.reset();
      tickA(i * 33);
      tickB(i * 33);
      const idle = Math.hypot(a.arcs[0].x - before.x, a.arcs[0].y - before.y);
      const stirred = Math.hypot(b.arcs[0].x - beforeB.x, b.arcs[0].y - beforeB.y);
      // Then: the cursor never contributes more than the 2.2 px/frame cap
      // beyond what the well alone was already doing…
      maxExtra = Math.max(maxExtra, stirred - idle);
      // …and no frame throws a mote off the sheet (no ejection, no respawn)
      expect(b.arcs[0].x).toBeGreaterThan(-20);
      expect(b.arcs[0].x).toBeLessThan(800 + 20);
      expect(b.arcs[0].y).toBeGreaterThan(-20);
      expect(b.arcs[0].y).toBeLessThan(600 + 20);
      maxStep = Math.max(maxStep, stirred);
      prev = a.arcs[0].x;
      prevB = b.arcs[0].x;
    }
    expect(maxExtra).toBeLessThanOrEqual(2.2 + 1e-9);
    // And: the cap actually engaged — the uncapped pull would have run away
    expect(maxStep).toBeGreaterThan(2.19);
  });

  it('carried motes brighten and light their links into a constellation, then relax back', () => {
    // Given: a pinned field with the pointer held beside the motes
    PIN();
    const { ctx, arcs, alphas, stroke, reset } = makeCtx();
    const tick = orbit(ctx);
    // Anchor the synthetic frame clock to the wall clock: the runner's
    // freshness test compares tick `t` against `performance.now()` taken in
    // the pointer handler, so a `t` starting at 0 stays "fresh" forever once
    // the suite has been running longer than FRESH — the mass would never die
    // and the relax assertion would flake under --coverage load.
    let t = performance.now();
    for (let i = 0; i < 30; i++) {
      t += 33;
      firePointer('pointermove', { pointerType: 'mouse', clientX: 275, clientY: 300 });
      reset();
      tick(t);
    }
    // Then: the motes are drawn near-full alpha and noticeably thicker
    const { links, motes } = bands(alphas);
    expect(motes).toHaveLength(arcs.length);
    expect(Math.min(...motes)).toBeGreaterThan(0.9);
    expect(Math.max(...arcs.map((p) => p.r))).toBeGreaterThan(S0 + 0.3);
    // And: the links between carried motes draw brighter than the faint default
    expect(links).toHaveLength(stroke.mock.calls.length);
    expect(links.every((v) => v === 0.12)).toBe(true);
    // When: the pointer parks and ~7 s pass
    for (let i = 0; i < 200; i++) {
      t += 33;
      const before = { x: arcs[0].x, y: arcs[0].y };
      reset();
      tick(t);
      // Then: the system never freezes while the mass dies — it keeps
      // orbiting the well the whole time
      expect(Math.hypot(arcs[0].x - before.x, arcs[0].y - before.y)).toBeGreaterThan(1e-6);
    }
    // And: the draw is back to the exact baseline — alpha, radius and links.
    // The capture level is a lerp toward 0, so it arrives at 0 asymptotically:
    // "back to baseline" is a tolerance, not an identity.
    const back = bands(alphas);
    expect(back.motes).toHaveLength(arcs.length);
    expect(back.motes.every((v) => Math.abs(v - 0.7) < 1e-3)).toBe(true);
    expect(back.links.every((v) => v === 0.05)).toBe(true);
    expect(arcs.every((p) => Math.abs(p.r - S0) < 1e-3)).toBe(true);
  });

  it('ignores touch pointer input — a tap never becomes a mass', () => {
    // Given: an untouched run
    PIN();
    const a = makeCtx();
    orbit(a.ctx)(0);
    // When: a touch pointer sweeps right across the motes
    PIN();
    const b = makeCtx();
    const tickB = orbit(b.ctx);
    firePointer('pointermove', { pointerType: 'touch', clientX: 275, clientY: 300 });
    firePointer('pointermove', { pointerType: 'touch', clientX: 300, clientY: 300 });
    tickB(0);
    // Then: nothing moved and nothing brightened
    expect(b.arcs).toEqual(a.arcs);
    expect(b.alphas).toEqual(a.alphas);
  });

  it('pointerout lets the mass die: a re-entry-free window returns to the single well', () => {
    // Given: a pinned field the pointer has stirred
    PIN();
    const { ctx, arcs, alphas, reset } = makeCtx();
    const tick = orbit(ctx);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 275, clientY: 300 });
    let t = 0;
    for (let i = 0; i < 30; i++) {
      t += 33;
      firePointer('pointermove', { pointerType: 'mouse', clientX: 275, clientY: 300 });
      reset();
      tick(t);
    }
    expect(Math.max(...alphas.filter((v) => v > 0.5))).toBeGreaterThan(0.9);
    // When: the pointer leaves the window and time passes
    firePointer('pointerout', { pointerType: 'mouse', relatedTarget: null });
    for (let i = 0; i < 200; i++) {
      t += 33;
      reset();
      tick(t);
    }
    // Then: the system is the plain single-well orbit again
    const back = bands(alphas);
    expect(back.motes).toHaveLength(arcs.length);
    expect(back.motes.every((v) => Math.abs(v - 0.7) < 1e-3)).toBe(true);
    expect(back.links.every((v) => v === 0.05)).toBe(true);
    expect(arcs.every((p) => Math.abs(p.r - S0) < 1e-3)).toBe(true);
  });

  it('puts the well at 0.75w on /status so the orbits clear the Mission Log text', () => {
    // Given: the same pinned field on the status page
    history.pushState({}, '', '/status/');
    PIN();
    const { ctx, arcs } = makeCtx();
    // When: one massless frame steps
    orbit(ctx)(0);
    // Then: the well is at (600, 252), not (400, 252): the mote's step is
    // 14·370/141204, clearly shallower than the home page's 14·170/33204
    const statusAx = (14 * 370) / (370 * 370 + 48 * 48 + 2000);
    expect(arcs[0].x - P0X).toBeCloseTo(statusAx, 9);
    expect(HOME_STEP.ax - statusAx).toBeGreaterThan(0.03);
    // And: the i18n twin behaves the same way
    history.pushState({}, '', '/es/status');
    PIN();
    const es = makeCtx();
    orbit(es.ctx)(0);
    expect(es.arcs[0].x - P0X).toBeCloseTo(statusAx, 9);
  });

  it('holds the N budget of the baseline at both ends of the size range', () => {
    // Given: unpinned runs at a small and a large sheet
    const small = makeCtx(800, 600);
    orbit(small.ctx)(0);
    const large = makeCtx(1920, 1080);
    orbit(large.ctx)(0);
    // Then: N = min(90, w·h/16000) — 30 and the 90 cap, unchanged
    expect(small.arcs).toHaveLength(Math.min(90, Math.floor((800 * 600) / 16000)));
    expect(large.arcs).toHaveLength(90);
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a fresh orbit that has drawn at least once
    const { ctx, canvas, clearRect, fill, reset } = makeCtx();
    const tick = orbit(ctx);
    tick(0);
    expect(fill).toHaveBeenCalled();
    reset();
    // When: the canvas leaves the document and frames keep ticking
    canvas.remove();
    tick(0);
    tick(33);
    // Then: no paint happens and listeners are released
    expect(clearRect).not.toHaveBeenCalled();
    expect(fill).not.toHaveBeenCalled();
    reset();
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(() => tick(66)).not.toThrow();
  });

  it('moves the well to the figure centre while it is on screen', () => {
    // Given: a pinned field with the home figure on screen (well at (600, 300))
    // and a canvas whose own rect is zeros in jsdom
    const marker = document.createElement('div');
    marker.setAttribute('data-orbit-well', '');
    document.body.appendChild(marker);
    marker.getBoundingClientRect = () =>
      ({ left: 500, top: 200, width: 200, height: 200 }) as DOMRect;
    PIN();
    const { ctx, arcs } = makeCtx();
    // When: one massless frame steps
    orbit(ctx)(0);
    // Then: the mote falls toward the figure centre, not the baseline well —
    // dy = 0 (same row), dx = 14·370/(370²+2000), far from the home baseline
    const wellAx = (14 * 370) / (370 * 370 + 2000);
    expect(arcs[0].x - P0X).toBeCloseTo(wellAx, 9);
    expect(arcs[0].y - P0Y).toBeCloseTo(0.25, 9);
    expect(Math.abs(arcs[0].x - P0X - HOME_STEP.ax)).toBeGreaterThan(0.03);
  });

  it('falls back to the baseline well for zero-size, off-screen or missing figures', () => {
    // Given: the same pinned field and the untouched home baseline
    PIN();
    const base = makeCtx();
    orbit(base.ctx)(0);
    const baseArcs = base.arcs.map((p) => ({ ...p }));
    // When: the marker is zero-size, then parked far off-screen
    const marker = document.createElement('div');
    marker.setAttribute('data-orbit-well', '');
    document.body.appendChild(marker);
    marker.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 }) as DOMRect;
    PIN();
    const zero = makeCtx();
    orbit(zero.ctx)(0);
    marker.getBoundingClientRect = () => ({ left: 0, top: -5000, width: 200, height: 200 }) as DOMRect;
    PIN();
    const away = makeCtx();
    orbit(away.ctx)(0);
    // Then: both reproduce the baseline exactly — and with no marker at all
    // the byte-parity guard for every other page still holds
    expect(zero.arcs).toEqual(baseArcs);
    expect(away.arcs).toEqual(baseArcs);
  });
});
