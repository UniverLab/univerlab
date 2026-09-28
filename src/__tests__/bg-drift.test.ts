/**
 * Tests for the drift runner (src/scripts/bg-drift.ts) — the DemoStage
 * background, split out of backgrounds.ts so that module stays within its
 * size budget. Verifies the cursor contract: travel within REACH kicks and
 * flashes the motes, a moving pointer sows a faint ~300 ms comet trail that
 * prunes itself within ~2 s, glow decays to the byte-identical idle draw,
 * touch never stirs, and a detached canvas aborts the listeners.
 * Given-When-Then pattern, like field.test.ts and brain.test.ts.
 */
import { drift } from '../scripts/bg-drift';

type DriftCtx = Parameters<typeof drift>[0];

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
  const arcs: Array<{ x: number; y: number; r: number }> = [];
  const alphas: number[] = [];
  let alpha = 1;
  const c = {
    clearRect,
    fill,
    stroke: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn((x: number, y: number, r: number) => arcs.push({ x, y, r })),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => {
      alphas.push(v);
      alpha = v;
    },
  });
  const ctx: DriftCtx = { canvas, c, color: '#ef8354', w, h };
  const reset = () => {
    arcs.length = 0;
    alphas.length = 0;
    clearRect.mockClear();
    fill.mockClear();
  };
  return { ctx, canvas, clearRect, fill, arcs, alphas, reset };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

/** N at 800×600 — same formula as the runner. */
const W = 800;
const H = 600;
const N = Math.min(54, Math.floor((W * H) / 26000));

/** Toroidal 1-D distance (motes wrap at the canvas edges). */
const wrapStep = (a: number, b: number, size: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, size - d);
};

describe('drift', () => {
  it('draws every mote at the resting alpha while the pointer never entered', () => {
    // Given: a fresh drift field with no pointer input
    const { ctx, arcs, alphas, fill } = makeCtx();
    const tick = drift(ctx);
    // When: one frame steps
    tick(0);
    // Then: exactly N motes are drawn, each at the byte-identical idle alpha
    expect(arcs).toHaveLength(N);
    expect(fill).toHaveBeenCalledTimes(N);
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.7));
  });

  it('keeps the field breathing at idle: each mote drifts within its own bounds', () => {
    // Given: a fresh field, no pointer
    const { ctx, arcs, reset } = makeCtx();
    const tick = drift(ctx);
    tick(0);
    const first = [...arcs];
    reset();
    // When: a second frame steps
    tick(33);
    // Then: positions moved a little (idle drift ≤ 0.18 px/frame, wrap-safe) —
    // the field is quiet but never frozen
    const maxStep = Math.max(
      ...first.map((p, i) =>
        Math.max(wrapStep(arcs[i].x, p.x, W), wrapStep(arcs[i].y, p.y, H))
      )
    );
    expect(maxStep).toBeGreaterThan(0);
    expect(maxStep).toBeLessThanOrEqual(0.18 + 1e-9);
  });

  it('stirs and flashes motes along the pointer path, then settles back to the idle draw', () => {
    // Given: a field whose motes all sit at (400, 300) (Math.random pinned)
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const { ctx, arcs, alphas, reset } = makeCtx();
    const tick = drift(ctx);
    tick(0);
    // When: the first pointer move only seeds the sampled position
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    reset();
    tick(100);
    // Then: zero seeded travel ⇒ no flash — every mote at exactly 0.7
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.7));
    const seeded = [...arcs];
    // When: a sweeping move arrives under the motes and a frame steps
    firePointer('pointermove', { pointerType: 'mouse', clientX: 430, clientY: 330 });
    reset();
    tick(133);
    // Then: the motes flash brighter than idle and the wake moves them
    expect(Math.max(...alphas.filter((a) => a !== 1))).toBeGreaterThan(0.7);
    expect(Math.max(...arcs.slice(0, N).map((p, i) => Math.abs(p.x - seeded[i].x)))).toBeGreaterThan(0.18);
    // And: lit motes are drawn a touch bigger (the extra ink cue) — the
    // trailing arcs belong to the comet trail and are checked on their own
    expect(Math.max(...arcs.slice(0, N).map((p) => p.r))).toBeGreaterThan(1.3 + 1e-9);
    // When: the pointer parks and ~6 s pass (τ = 550 ms ⇒ glow snaps to 0)
    let t = 183;
    for (let i = 0; i < 120; i++) {
      t += 50;
      reset();
      tick(t);
    }
    // Then: the wake is gone — alpha and radius back to the exact idle draw
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.7));
    expect(Math.max(...arcs.map((p) => p.r))).toBeCloseTo(1.3, 6);
    randomSpy.mockRestore();
  });

  it('caps a hard flick so no mote is ever flung more than CAP pixels in a frame', () => {
    // Given: a field with one seeded move at the origin
    const { ctx, arcs, reset } = makeCtx();
    const tick = drift(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 0, clientY: 0 });
    reset();
    tick(33);
    const before = [...arcs];
    // When: the pointer flicks across the whole window in one event
    firePointer('pointermove', { pointerType: 'mouse', clientX: 799, clientY: 599 });
    reset();
    tick(66);
    // Then: every mote advanced at most CAP = 3.8 px (wrap-safe)
    for (let i = 0; i < N; i++) {
      expect(wrapStep(arcs[i].x, before[i].x, W)).toBeLessThanOrEqual(3.8 + 1e-9);
      expect(wrapStep(arcs[i].y, before[i].y, H)).toBeLessThanOrEqual(3.8 + 1e-9);
    }
  });

  it('sows a faint comet trail at the cursor per ~300 ms beat while moving, then prunes it within ~2 s', () => {
    // Given: a field whose pointer has seeded once (no travel yet)
    const { ctx, arcs, alphas, reset } = makeCtx();
    const tick = drift(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    reset();
    tick(50);
    expect(arcs).toHaveLength(N);
    // When: a drag — the pointer sweeps 40 px between frames, 100 ms apart
    let t = 50;
    let prev = [...arcs];
    let maxStep = 0;
    for (let i = 1; i <= 6; i++) {
      t += 100;
      firePointer('pointermove', { pointerType: 'mouse', clientX: 400 + i * 40, clientY: 300 + i * 20 });
      reset();
      tick(t);
      for (let k = 0; k < N; k++) {
        maxStep = Math.max(maxStep, wrapStep(arcs[k].x, prev[k].x, W), wrapStep(arcs[k].y, prev[k].y, H));
      }
      prev = arcs.slice(0, N);
    }
    // Then: the motes visibly scatter along the path — far beyond the 0.18 px idle drift
    expect(maxStep).toBeGreaterThan(1);
    // And: the beat left faint motes behind the cursor (N motes + trail)
    expect(arcs.length).toBeGreaterThan(N);
    // The frame drew N motes, then the trail, then reset the alpha to 1
    const trailAlphas = alphas.slice(N, alphas.length - 1);
    expect(trailAlphas.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...trailAlphas)).toBeLessThan(0.5);
    expect(Math.min(...trailAlphas)).toBeGreaterThan(0);
    // When: the pointer parks and 6 s pass (trail life ≤ 2.2 s, glow τ = 550 ms)
    for (let i = 0; i < 60; i++) {
      t += 100;
      reset();
      tick(t);
    }
    // Then: the trail is gone — exactly N motes at the byte-identical idle draw
    expect(arcs).toHaveLength(N);
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.7));
  });

  it('ignores touch pointer input — a tap never stirs the field', () => {
    // Given: a fresh field that has painted once
    const { ctx, alphas, reset } = makeCtx();
    const tick = drift(ctx);
    tick(0);
    reset();
    // When: a touch pointer sweeps the window
    firePointer('pointermove', { pointerType: 'touch', clientX: 40, clientY: 60 });
    firePointer('pointermove', { pointerType: 'touch', clientX: 400, clientY: 300 });
    tick(33);
    // Then: every mote still draws at exactly the idle alpha
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.7));
  });

  it('pointerout parks the stir: re-entry seeds first, and sweeping again re-lights the field', () => {
    // Given: a field whose motes all sit at (400, 300), already stirred once
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const { ctx, alphas, reset } = makeCtx();
    const tick = drift(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    tick(100);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 430, clientY: 330 });
    tick(133);
    // When: the wake fully decays after the pointer leaves the window
    firePointer('pointerout', { pointerType: 'mouse', relatedTarget: null });
    let t = 183;
    for (let i = 0; i < 120; i++) {
      t += 50;
      tick(t);
    }
    reset();
    // Then: the parked sample glides home without re-lighting anything
    tick(t + 50);
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.7));
    // When: the pointer re-enters — the first move only seeds the sample
    firePointer('pointermove', { pointerType: 'mouse', clientX: 430, clientY: 330 });
    reset();
    tick(t + 100);
    expect(alphas.filter((a) => a !== 1)).toEqual(new Array(N).fill(0.7));
    // When: a second in-window move travels under the motes
    firePointer('pointermove', { pointerType: 'mouse', clientX: 460, clientY: 360 });
    reset();
    tick(t + 150);
    // Then: stirring resumed — motes flash again
    expect(Math.max(...alphas.filter((a) => a !== 1))).toBeGreaterThan(0.7);
    randomSpy.mockRestore();
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a fresh drift that has drawn at least once
    const { ctx, canvas, clearRect, fill, reset } = makeCtx();
    const tick = drift(ctx);
    tick(0);
    expect(fill).toHaveBeenCalled();
    reset();
    // When: the canvas leaves the document and frames keep ticking
    canvas.remove();
    tick(33);
    tick(66);
    // Then: no paint happens and listeners are released
    expect(clearRect).not.toHaveBeenCalled();
    expect(fill).not.toHaveBeenCalled();
    reset();
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(() => tick(99)).not.toThrow();
  });
});
