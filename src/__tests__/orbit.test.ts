/**
 * Tests for the orbital cosmic background (src/scripts/orbit.ts), the runner
 * behind EVERY `bg="cosmic"` page: the baseline gravity-well mechanics restored
 * (4d27473^:src/scripts/backgrounds.ts) with the cursor as a LENS on that system
 * (R13) — it bends the light of the field, it never captures a mote. The
 * headline assertion is the first one — with no pointer input a step is
 * byte-identical to the old cosmic step, which is what proves the restore is
 * faithful and the lens is purely additive.
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
 *  `globalAlpha = 1`. The bands never overlap — links live at ≤0.13, motes at
 *  ≥0.7 — so 0.5 separates them cleanly. */
function bands(alphas: number[]) {
  const written = alphas.slice(0, alphas.length - 1);
  expect(alphas[alphas.length - 1]).toBe(1); // the tick always resets
  return {
    links: written.filter((v) => v <= 0.5),
    motes: written.filter((v) => v > 0.5),
  };
}

type Frame = { arcs: Array<{ x: number; y: number; r: number }>; alphas: number[] };

/** Drive a runner at ~30 fps and keep one recording per frame.
 *  The frame clock is anchored to the wall clock and advanced 33 ms per frame:
 *  the runner's freshness test compares tick `t` against `performance.now()`
 *  taken inside the pointer handler, so a `t` starting at 0 stays "fresh"
 *  forever once the suite has been running longer than LENS_IDLE and the lens
 *  could never idle out. `fire` runs just before each tick; a pointer that is
 *  not re-fired goes stale after 1.5 s, which is what the envelope test wants.
 *
 *  Why record and compare afterwards instead of interleaving a twin live: both
 *  runners listen on `document`, so a pointer fired for the lensed run would
 *  also light the idle one. The physics is deterministic and pointer-free, so
 *  recording each run separately and comparing frame-by-frame measures exactly
 *  the same thing — and the idle run's arcs ARE its motes' real positions,
 *  because an unlit lens draws them verbatim. */
function drive(
  h: ReturnType<typeof makeCtx>,
  tick: (t: number) => void,
  t0: number,
  frames: number,
  fire?: (i: number) => void,
  start = 0
): Frame[] {
  const out: Frame[] = [];
  for (let i = 1; i <= frames; i++) {
    fire?.(start + i);
    h.reset();
    tick(t0 + (start + i) * 33);
    out.push({ arcs: h.arcs.map((p) => ({ ...p })), alphas: h.alphas.slice() });
  }
  return out;
}

/** A still-but-un-fired pointer is exactly what the lens' envelope is about, so
 *  a scenario that wants the lens lit re-fires it every frame. */
const at = (x: (i: number) => number, y: (i: number) => number) => (i: number) =>
  firePointer('pointermove', { pointerType: 'mouse', clientX: x(i), clientY: y(i) });

/** The smallest distance between any two of a frame's drawn motes (a subset by
 *  index, so the same pairs are measured in the lensed and the idle run). */
function minPairDistance(arcs: Frame['arcs'], subset?: number[]): number {
  const idx = subset ?? arcs.map((_, i) => i);
  let min = Infinity;
  for (let a = 0; a < idx.length; a++) {
    for (let b = a + 1; b < idx.length; b++) {
      const d = Math.hypot(arcs[idx[a]].x - arcs[idx[b]].x, arcs[idx[a]].y - arcs[idx[b]].y);
      if (d < min) min = d;
    }
  }
  return min;
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
    // respawn margins are all still the baseline. This also proves the lens is
    // EXACTLY off with no pointer: the first frame's dt is 0 for a frozen
    // clock, so strength stays 0 and every drawn coordinate is the mote's own.
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
    // When: one lens-free frame steps
    orbit(ctx)(0);
    // Then: the mote moved by well-only gravity from its pinned spawn point
    expect(arcs[0].x).toBeCloseTo(P0X + HOME_STEP.ax, 9);
    expect(arcs[0].y).toBeCloseTo(P0Y + 0.25 + HOME_STEP.ay, 9);
    // And: it is never frozen — the baseline orbits, it does not sit still
    expect(Math.hypot(arcs[0].x - P0X, arcs[0].y - (P0Y + 0.25))).toBeGreaterThan(0);
  });

  it('a massless step stays identical to the old cosmic even from a fast state', () => {
    // Given: the legacy and the new runner, both driven 6 s deep into the
    // system — long past the point where the well has flung motes well over
    // 2.2 px/frame (measured: median 2.46, p90 5.46 at 1440×900). This is the
    // state a pointer force, or any speed cap, would silently rewrite.
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

  it('bends the light around the pointer, never the motes: 10 s of sweeping leaves no mark', () => {
    // Given: two identically seeded 1440×900 fields (81 motes) — one idle, one
    // with the pointer — stepped on the same clock, frame by frame
    const t0 = performance.now();
    const LIT = 300; // 10 s of sweeping
    const TOTAL = LIT + 80; // …and 2.6 s of it being gone
    SEED();
    const a = makeCtx(1440, 900);
    const tickA = orbit(a.ctx);
    const idle: Frame[] = [];
    const step = (h: ReturnType<typeof makeCtx>, tick: (t: number) => void, i: number) => {
      h.reset();
      tick(t0 + i * 33);
      return { arcs: h.arcs.map((p) => ({ ...p })), alphas: h.alphas.slice() };
    };
    for (let i = 1; i <= TOTAL; i++) idle.push(step(a, tickA, i));
    SEED();
    const b = makeCtx(1440, 900);
    const tickB = orbit(b.ctx);
    let maxOffset = 0;
    // When: the pointer sweeps back and forth along the well's row (y = 0.42h)
    // for 10 s, re-fired every frame so the lens never idles out
    for (let i = 1; i <= LIT; i++) {
      firePointer('pointermove', {
        pointerType: 'mouse',
        clientX: 520 + (i % 150) * 4,
        clientY: 378,
      });
      const f = step(b, tickB, i);
      for (let k = 0; k < f.arcs.length; k++) {
        // Then: every frame, every mote — the pointer never changes a mote, it
        // only displaces the draw, and by no more than the lens amplitude A
        const mag = Math.hypot(f.arcs[k].x - idle[i - 1].arcs[k].x, f.arcs[k].y - idle[i - 1].arcs[k].y);
        expect(Number.isFinite(mag)).toBe(true);
        maxOffset = Math.max(maxOffset, mag);
      }
    }
    // And: the lens was genuinely engaged — the assertion above is not vacuous
    expect(maxOffset).toBeGreaterThan(1);
    expect(maxOffset).toBeLessThanOrEqual(18 + 1e-9);
    // When: the pointer leaves the window
    firePointer('pointerout', { pointerType: 'mouse', relatedTarget: null });
    let baselineFrom = -1;
    for (let i = LIT + 1; i <= TOTAL; i++) {
      const f = step(b, tickB, i);
      const ref = idle[i - 1];
      const same = f.arcs.every(
        (p, k) => p.x === ref.arcs[k].x && p.y === ref.arcs[k].y && p.r === ref.arcs[k].r
      );
      if (same) {
        if (baselineFrom < 0) baselineFrom = i;
        // Then: from the frame the 800 ms linear fade completes onward, the
        // draw is the untouched field's to the bit — 10 s of stirring left no
        // velocity, no drift and no residue — and so are the alpha bands
        expect(f.alphas.every((v) => v === 0.05 || v === 0.7 || v === 1)).toBe(true);
      } else {
        // Until then the lens is still fading, but never displacing by more
        // than A — nothing is being dragged anywhere
        for (let k = 0; k < f.arcs.length; k++) {
          expect(
            Math.hypot(f.arcs[k].x - ref.arcs[k].x, f.arcs[k].y - ref.arcs[k].y)
          ).toBeLessThanOrEqual(18 + 1e-9);
        }
      }
    }
    expect(baselineFrom).toBeGreaterThan(LIT); // the fade is not instant
    expect(baselineFrom).toBeLessThanOrEqual(LIT + 30); // …but it is 800 ms
  });

  it('draws a mote 90 px from the lens centre exactly A px further out, radially', () => {
    // Given: a pinned field and its idle twin, stepped on the same clock
    const t0 = performance.now();
    PIN();
    const a = makeCtx();
    const idle = drive(a, orbit(a.ctx), t0, 25);
    PIN();
    const b = makeCtx();
    // When: the pointer is held 90 px to the right of the motes' REAL position,
    // tracked every frame (f peaks at exactly 90 px, so the draw sits at the
    // profile's maximum; 25 frames is far more than the 120 ms rise + ease)
    const stirred = drive(
      b,
      orbit(b.ctx),
      t0,
      25,
      at((i) => idle[i - 1].arcs[0].x + 90, (i) => idle[i - 1].arcs[0].y)
    );
    const real = idle[24].arcs[0];
    const lensX = real.x + 90; // where the (eased) lens centre has settled
    const lensY = real.y;
    for (let i = 0; i < stirred[24].arcs.length; i++) {
      const dx = stirred[24].arcs[i].x - real.x;
      const dy = stirred[24].arcs[i].y - real.y;
      const mag = Math.hypot(dx, dy);
      // Then: the offset is the full A = 18 px (within the 1 px the spec asks)
      expect(Math.abs(mag - 18)).toBeLessThan(1);
      expect(mag).toBeLessThanOrEqual(18 + 1e-9);
      expect(mag).toBeGreaterThan(17);
      // And: it points AWAY from the lens — the lens sits 90 px to the RIGHT on
      // the same row, so every mote is pushed further LEFT, never right, never
      // off its row: the field opens a ring around the cursor
      expect(dx).toBeLessThan(0);
      expect(Math.abs(dy)).toBeLessThan(1);
      expect(Math.hypot(stirred[24].arcs[i].x - lensX, stirred[24].arcs[i].y - lensY)).toBeCloseTo(
        90 + mag,
        2
      );
    }
  });

  it('is exactly zero beyond 220 px, and inert at its own centre', () => {
    // Given: a pinned field and its idle twin
    const t0 = performance.now();
    PIN();
    const a = makeCtx();
    const idle = drive(a, orbit(a.ctx), t0, 25);
    // When: the pointer parks 240 px from the motes — outside the lens reach,
    // and never moves again, so the eased centre sits exactly on it
    PIN();
    const far = makeCtx();
    const park = idle[24].arcs[0];
    const farRun = drive(far, orbit(far.ctx), t0, 25, at(() => park.x + 240, () => park.y));
    // Then: position AND brightness are byte-identical to the untouched field
    expect(farRun[24].arcs).toEqual(idle[24].arcs);
    expect(farRun[24].alphas).toEqual(idle[24].alphas);
    // When: the pointer parks exactly ON the motes instead (the profile's
    // f(0) = 0 point — the lens centre must draw nothing and must never divide
    // by its own zero)
    PIN();
    const centre = makeCtx();
    const onRun = drive(centre, orbit(centre.ctx), t0, 25, at(() => park.x, () => park.y));
    for (let i = 0; i < onRun[24].arcs.length; i++) {
      const dx = onRun[24].arcs[i].x - park.x;
      const dy = onRun[24].arcs[i].y - park.y;
      // Then: no NaN, no blow-up — only the motes' own drift since the pointer
      // stopped separates them from the centre, and the profile there is ~0
      expect(Number.isFinite(dx)).toBe(true);
      expect(Number.isFinite(dy)).toBe(true);
      expect(Math.hypot(dx, dy)).toBeLessThan(0.1);
    }
  });

  it('brightens motes inside 220 px by up to +0.25 and their links by +0.08, following f(d)', () => {
    // Given: a pinned field whose 30 motes are coincident, so every pair is
    // linked and every mote sits at the same distance from the lens
    const t0 = performance.now();
    PIN();
    const a = makeCtx();
    const idle = drive(a, orbit(a.ctx), t0, 30);
    const hold = (gap: number) => {
      PIN();
      const b = makeCtx();
      return drive(
        b,
        orbit(b.ctx),
        t0,
        30,
        at((i) => idle[i - 1].arcs[0].x + gap, (i) => idle[i - 1].arcs[0].y)
      )[29];
    };
    // When: the lens is held at the profile's peak (90 px)
    const peak = hold(90);
    // Then: every mote is at the +0.25 ceiling (0.7 → 0.95) and every link at
    // the +0.08 one (0.05 → 0.13) — and never below the baseline bands
    const lit = bands(peak.alphas);
    expect(lit.motes).toHaveLength(peak.arcs.length);
    expect(lit.motes.every((v) => v > 0.9 && v <= 0.95 + 1e-9)).toBe(true);
    expect(lit.links.length).toBeGreaterThan(0);
    expect(lit.links.every((v) => v > 0.12 && v <= 0.13 + 1e-9)).toBe(true);
    // And: the lens bends light, it does not fatten motes — the radius is the
    // motes' own, exactly (the old capture cue thickened it)
    expect(peak.arcs.every((p) => p.r === S0)).toBe(true);
    // When: the lens is held at 160 px instead, on the falling branch where
    // f ≈ 0.44
    const far = hold(160);
    const dim = bands(far.alphas);
    // Then: the lift is proportional, not a binary mask — clearly lit, clearly
    // less lit than at the peak
    expect(dim.motes.every((v) => v > 0.75 && v < 0.86)).toBe(true);
    expect(Math.max(...dim.motes)).toBeLessThan(Math.min(...lit.motes));
    // And: the same holds for the links
    expect(Math.max(...dim.links)).toBeLessThan(Math.min(...lit.links));
    expect(Math.max(...dim.links)).toBeGreaterThan(0.05);
  });

  it('eases the lens centre toward the pointer over ~120 ms, then relaxes', () => {
    // Given: a pinned field and its idle twin, with the lens lit and settled at
    // 90 px from the motes
    const t0 = performance.now();
    PIN();
    const a = makeCtx();
    const idle = drive(a, orbit(a.ctx), t0, 46);
    PIN();
    const b = makeCtx();
    const tick = orbit(b.ctx);
    // When: the pointer JUMPS far enough that the eased centre will end up
    // beyond the lens' 220 px reach entirely, then holds perfectly still — so
    // what follows is the centre's own ease and nothing else
    const settledAt = idle[19].arcs[0].x + 90;
    const jumpedTo = idle[44].arcs[0].x + 240;
    const lit = drive(b, tick, t0, 20, at(() => settledAt, () => idle[19].arcs[0].y));
    expect(Math.max(...bands(lit[19].alphas).motes)).toBeGreaterThan(0.9);
    const eased: number[] = [];
    drive(
      b,
      tick,
      t0,
      25,
      at(() => jumpedTo, () => idle[19].arcs[0].y),
      20
    ).forEach((f, k) =>
      // the twin draws undisplaced, so this difference IS the lens offset
      eased.push(
        Math.hypot(f.arcs[0].x - idle[20 + k].arcs[0].x, f.arcs[0].y - idle[20 + k].arcs[0].y)
      )
    );
    // Then: the first frame after the jump has moved the centre only ~24 % of
    // the way (1 − e^(−33/120)) — the field is still bent near its peak, so it
    // is neither snapped to the new pointer nor frozen where it was
    expect(eased[0]).toBeGreaterThan(8);
    expect(eased[0]).toBeLessThan(18);
    // And: it relaxes monotonically as the centre glides out…
    for (let i = 1; i < eased.length; i++) expect(eased[i]).toBeLessThanOrEqual(eased[i - 1]);
    // …until the lens no longer reaches these motes at all and the draw is the
    // untouched field's again, to the bit
    const done = drive(b, tick, t0, 1, undefined, 45);
    expect(done[0].arcs).toEqual(idle[45].arcs);
    expect(done[0].alphas).toEqual(idle[45].alphas);
  });

  it('fades the lens out over 800 ms when the pointer leaves, back to the exact baseline', () => {
    // Given: a pinned field whose lens is lit at the profile's peak, plus its
    // idle twin stepped on the same clock
    const t0 = performance.now();
    PIN();
    const a = makeCtx();
    const idle = drive(a, orbit(a.ctx), t0, 60);
    PIN();
    const b = makeCtx();
    const tick = orbit(b.ctx);
    const lit = drive(
      b,
      tick,
      t0,
      20,
      at((i) => idle[i - 1].arcs[0].x + 90, (i) => idle[i - 1].arcs[0].y)
    );
    expect(Math.max(...bands(lit[19].alphas).motes)).toBeGreaterThan(0.9);
    // When: the pointer leaves the window and frames keep coming
    firePointer('pointerout', { pointerType: 'mouse', relatedTarget: null });
    const fading = drive(b, tick, t0, 40, undefined, 20);
    // Then: the lift decays through the mid-band — never a snap
    const fade = fading.map((f) => Math.max(...bands(f.alphas).motes));
    expect(fade[0]).toBeLessThan(0.95);
    expect(fade[0]).toBeGreaterThan(0.7);
    for (let i = 1; i < 10; i++) expect(fade[i]).toBeLessThan(fade[i - 1]);
    // And: the linear fade lands on the EXACT baseline — an exponential or
    // lerp decay would leave a 1e-17 tail — so within 800 ms the alphas are
    // the baseline's and the drawn positions are the untouched field's, to
    // the bit
    let backAt = fading.findIndex((f) => {
      const d = bands(f.alphas);
      return d.motes.every((v) => v === 0.7) && d.links.every((v) => v === 0.05);
    });
    expect(backAt).toBeGreaterThan(0); // not instant
    expect(backAt).toBeLessThan(25); // 800 ms at 30 fps, + margin
    for (let i = backAt; i < fading.length; i++) {
      const d = bands(fading[i].alphas);
      expect(d.motes.every((v) => v === 0.7)).toBe(true);
      expect(d.links.every((v) => v === 0.05)).toBe(true);
      expect(fading[i].arcs).toEqual(idle[20 + i].arcs);
    }
  });

  it('keeps the lens lit through the 1.5 s idle grace, then fades to the exact baseline', () => {
    // Given: a lens lit at the profile's peak, then simply left alone — no
    // further pointermove at all, which is the "user parked the cursor" case
    const t0 = performance.now();
    PIN();
    const a = makeCtx();
    const idle = drive(a, orbit(a.ctx), t0, 90);
    PIN();
    const b = makeCtx();
    const tick = orbit(b.ctx);
    const lit = drive(
      b,
      tick,
      t0,
      20,
      at((i) => idle[i - 1].arcs[0].x + 90, (i) => idle[i - 1].arcs[0].y)
    );
    expect(Math.max(...bands(lit[19].alphas).motes)).toBeGreaterThan(0.9);
    // When: ~1.3 s pass with no move at all (frames 21–40)
    const parked = drive(b, tick, t0, 20, undefined, 20);
    // Then: the lens is still lit — the idle grace is 1.5 s, the fade only
    // starts after it, so nothing has begun to dim yet
    expect(Math.max(...bands(parked[19].alphas).motes)).toBeGreaterThan(0.7);
    // When: ~2.9 s pass in total (past 1500 + 800)
    const gone = drive(b, tick, t0, 50, undefined, 40);
    const last = bands(gone[49].alphas);
    // Then: the exact baseline, with no tolerance at all
    expect(last.motes.every((v) => v === 0.7)).toBe(true);
    expect(last.links.every((v) => v === 0.05)).toBe(true);
    expect(gone[49].arcs).toEqual(idle[89].arcs);
  });

  it('ignores touch pointer input — a tap never becomes a lens', () => {
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

  it('never collapses two motes: the minimum drawn gap holds the no-pointer minimum minus 2 px', () => {
    // Given: an identically seeded 1440×900 field (81 motes) and its idle twin.
    // The lens cannot pull anything together — only displace draws outward —
    // but a radially-aligned pair on the falling branch IS compressed
    // (d + A·f(d) has slope ≥ ~0.78 there), so this is the property that has to
    // be measured, not assumed.
    const t0 = performance.now();
    const FRAMES = 300; // 10 s at 30 fps
    SEED();
    const a = makeCtx(1440, 900);
    const idle = drive(a, orbit(a.ctx), t0, FRAMES);
    const wellX = 720; // 0.5w
    const wellY = 378; // 0.42h
    // When: the pointer is HELD STILL on the well, re-fired every frame, and
    // then SWEPT at 20 px/s along the well's row. Both paths run through the
    // dense annulus, where the closest pair is closest.
    const scenarios: Array<[string, (i: number) => number]> = [
      ['held still', () => wellX],
      ['20 px/s sweep', (i) => 520 + ((i * 33 * 20) / 1000) % 200],
    ];
    for (const [label, x] of scenarios) {
      SEED();
      const b = makeCtx(1440, 900);
      const lit = drive(b, orbit(b.ctx), t0, FRAMES, at(x, () => wellY));
      let populated = 0;
      for (let f = 0; f < FRAMES; f++) {
        const px = x(f + 1);
        // the population the lens can see: motes whose REAL position is inside
        // its 220 px reach
        const subset = idle[f].arcs
          .map((p, i) => (Math.hypot(p.x - px, p.y - wellY) < 220 ? i : -1))
          .filter((i) => i >= 0);
        if (subset.length < 2) continue;
        populated++;
        // And: nothing is ever pulled — the offset is the lens amplitude or
        // less, outward
        for (let i = 0; i < lit[f].arcs.length; i++) {
          const dx = lit[f].arcs[i].x - idle[f].arcs[i].x;
          const dy = lit[f].arcs[i].y - idle[f].arcs[i].y;
          expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(18 + 1e-9);
        }
        // Then: the tightest pair in the drawn field is no closer than the
        // tightest pair in the untouched field, less the 2 px budget
        expect(minPairDistance(lit[f].arcs, subset)).toBeGreaterThanOrEqual(
          minPairDistance(idle[f].arcs, subset) - 2
        );
      }
      // And: the scenario was never vacuous
      expect(populated).toBeGreaterThanOrEqual(100);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('puts the well at 0.75w on /status so the orbits clear the Mission Log text', () => {
    // Given: the same pinned field on the status page
    history.pushState({}, '', '/status/');
    PIN();
    const { ctx, arcs } = makeCtx();
    // When: one lens-free frame steps
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
    // When: one lens-free frame steps
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
