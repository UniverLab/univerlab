/**
 * Tests for the bubbles runner (src/scripts/bg-bubbles.ts) — the GitKit
 * background. The cursor stages nearby commit nodes and a >=1200 ms dwell
 * commits them into one labelled hash node; touch never stages; idle float
 * and parent re-linking unchanged. Given-When-Then pattern, like field.test.ts.
 */
import { bubbles } from '../scripts/bg-bubbles';

type BubblesCtx = Parameters<typeof bubbles>[0];

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/** A recording 2D stub. */
function makeCtx(opts: { w?: number; h?: number; bg?: string; color?: string } = {}) {
  const { w = 800, h = 600, bg = '#f5eef5', color = '#e8a4c8' } = opts;
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const clearRect = jest.fn();
  const fill = jest.fn();
  const stroke = jest.fn();
  const arcs: Array<{ x: number; y: number; r: number }> = [];
  const alphas: number[] = [];
  const stops: string[] = [];
  const fillStyles: string[] = [];
  const strokeStyles: string[] = [];
  const texts: Array<{ msg: string; x: number; y: number }> = [];
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const strokeLWs: number[] = [];
  let alpha = 1;
  let fillStyle: unknown = '';
  let strokeStyle: unknown = '';
  let curLW = 1;
  let penX = 0;
  let penY = 0;
  const c = {
    clearRect,
    fill: (...a: unknown[]) => (fill as unknown as (...x: unknown[]) => void)(...a),
    stroke: (...a: unknown[]) => {
      strokeLWs.push(curLW);
      (stroke as unknown as (...x: unknown[]) => void)(...a);
    },
    beginPath: jest.fn(),
    moveTo: jest.fn((x: number, y: number) => {
      penX = x;
      penY = y;
    }),
    lineTo: jest.fn(),
    bezierCurveTo: jest.fn((a: number, b2: number, cc: number, d: number, x2: number, y2: number) => {
      segs.push({ x1: penX, y1: penY, x2, y2 });
    }),
    strokeRect: jest.fn(),
    arc: jest.fn((x: number, y: number, r: number) => arcs.push({ x, y, r })),
    createRadialGradient: jest.fn(() => ({
      addColorStop: jest.fn((_o: number, col: string) => stops.push(col)),
    })),
    fillText: jest.fn((msg: string, x: number, y: number) => texts.push({ msg, x, y })),
    font: '',
    textAlign: 'center' as CanvasTextAlign,
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => {
      alphas.push(v);
      alpha = v;
    },
  });
  Object.defineProperty(c, 'fillStyle', {
    get: () => fillStyle,
    set: (v: unknown) => {
      if (typeof v === 'string') fillStyles.push(v);
      fillStyle = v;
    },
  });
  Object.defineProperty(c, 'strokeStyle', {
    get: () => strokeStyle,
    set: (v: unknown) => {
      if (typeof v === 'string') strokeStyles.push(v);
      strokeStyle = v;
    },
  });
  Object.defineProperty(c, 'lineWidth', {
    get: () => curLW,
    set: (v: number) => {
      curLW = v;
    },
  });
  const ctx: BubblesCtx = { canvas, c, color, bg, w, h };
  const reset = () => {
    arcs.length = 0;
    alphas.length = 0;
    stops.length = 0;
    fillStyles.length = 0;
    strokeStyles.length = 0;
    texts.length = 0;
    segs.length = 0;
    strokeLWs.length = 0;
    clearRect.mockClear();
    (fill as unknown as { mockClear: () => void }).mockClear();
    (stroke as unknown as { mockClear: () => void }).mockClear();
  };
  return {
    ctx, canvas, clearRect, fill, stroke,
    arcs, alphas, stops, fillStyles, strokeStyles, texts, segs, strokeLWs,
    reset,
  };
}

/**
 * Script Math.random for the 7-calls-per-bubble constructor order
 * (vy,x,y,r,vx,ph,amb). `at(i)` places bubble i at (x,y) with radius r;
 * all other fractions default to 0.5. Falls back to 0.5 after exhaustion
 * (hash7 then yields '8's — still valid hex).
 */
function scriptField(at: Record<number, { x: number; y: number; r: number }>, w = 800, h = 600) {
  const vals: number[] = [];
  for (let i = 0; i < 13; i++) {
    const p = at[i];
    vals.push(0.5); // vy
    vals.push(p ? p.x / w : 0.95); // x
    vals.push(p ? p.y / h : 0.95); // y
    vals.push(p ? (p.r - 12) / 23 : 0.5); // r
    vals.push(0.5); // vx
    vals.push(0.5); // ph
    vals.push(0.5); // amb
  }
  const queue = [...vals];
  jest.spyOn(Math, 'random').mockImplementation(() => (queue.length ? queue.shift()! : 0.5));
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

const W = 800;
const H = 600;
/** Ambient nodes per px² — same constant as the runner (card-anchored density). */
const AREA_PER_NODE = 37000;
/** N at 800×600 — same formula as the runner. */
const N = Math.max(1, Math.round((W * H) / AREA_PER_NODE));

describe('bubbles', () => {
  it('rises the ambient field without the cursor: N nodes, ambient alphas, no labels', () => {
    // Given: a fresh bubbles field with no pointer input
    const { ctx, arcs, alphas, texts, segs, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    reset();
    // When: one frame steps
    tick(33);
    // Then: exactly 3 arcs per bubble (halo, core, ring), no labels
    expect(arcs).toHaveLength(3 * N);
    const nodeAlphas = alphas.filter((a) => a !== 1 && a !== 0.14 && a !== 0.22);
    expect(nodeAlphas.length).toBeGreaterThan(0);
    expect(Math.max(...nodeAlphas)).toBeLessThanOrEqual(0.55);
    expect(texts).toHaveLength(0);
    expect(segs.length).toBeLessThanOrEqual(N - 1);
  });

  it('sweeping adds no bubbles — sowing is gone, total arcs stay 3·N', () => {
    // Given: a fresh field with pinned randomness
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const { ctx, arcs, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    // When: the pointer sweeps across the coincident cluster
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    tick(33);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 420, clientY: 300 });
    tick(66);
    reset();
    tick(99);
    // Then: staging lifts but never adds — total count invariant
    expect(arcs).toHaveLength(3 * N);
  });

  it('scales ambient density with canvas area — card window and page are one system', () => {
    // Given: pinned randomness and two canvases — the card window and a page viewport
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const card = makeCtx({ w: 352, h: 210 });
    const page = makeCtx({ w: 1440, h: 900 });
    const tickCard = bubbles(card.ctx);
    tickCard(0);
    const tickPage = bubbles(page.ctx);
    tickPage(0);
    // When: one frame paints on each
    card.reset();
    page.reset();
    tickCard(33);
    tickPage(33);
    // Then: each count is the shared area law N = round(area / AREA_PER_NODE)
    const nCard = card.arcs.length / 3;
    const nPage = page.arcs.length / 3;
    expect(nCard).toBe(Math.max(1, Math.round((352 * 210) / AREA_PER_NODE)));
    expect(nPage).toBe(Math.max(1, Math.round((1440 * 900) / AREA_PER_NODE)));
    // And: the window reads as two circles joined by a line
    expect(nCard).toBe(2);
    // And: the page count is the card count scaled by area, within rounding (±1)
    const ratio = (1440 * 900) / (352 * 210);
    expect(nPage).toBeGreaterThanOrEqual(Math.round(nCard * ratio) - 1);
    expect(nPage).toBeLessThanOrEqual(Math.round(nCard * ratio) + 1);
    // And: doubling the area doubles the count; a tiny canvas still draws ≥ 1
    const single = makeCtx({ w: 800, h: 600 });
    const dbl = makeCtx({ w: 1600, h: 600 });
    const tickSingle = bubbles(single.ctx);
    tickSingle(0);
    const tickDbl = bubbles(dbl.ctx);
    tickDbl(0);
    single.reset();
    dbl.reset();
    tickSingle(66);
    tickDbl(66);
    expect(dbl.arcs.length / 3).toBe(2 * (single.arcs.length / 3));
    const tiny = makeCtx({ w: 100, h: 100 });
    const tickTiny = bubbles(tiny.ctx);
    tickTiny(0);
    tiny.reset();
    tickTiny(99);
    expect(tiny.arcs.length / 3).toBeGreaterThanOrEqual(1);
  });

  it('stages at most 3 bubbles that trail the cursor', () => {
    // Given: pinned randomness (all 13 coincide at 400,300)
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const { ctx, arcs, strokeLWs, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    // When: the pointer sweeps across and ~10 frames pass
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    let t = 33;
    tick(t);
    for (let i = 0; i < 10; i++) {
      t += 33;
      tick(t);
    }
    reset();
    t += 33;
    tick(t);
    // Then: exactly 3 glow-lifted ring strokes (lw > 1.5) — no 4th ever appears
    const lifted = strokeLWs.filter((lw) => lw > 1.5);
    expect(lifted).toHaveLength(3);
    // And: the staged halos cluster near the trail point (~30px behind cursor)
    // (pinned rand keeps the 10 unstaged coincident at first, so assert >= 3)
    const halos = arcs.filter((_, i) => i % 3 === 0);
    const near = halos.filter((a) => Math.hypot(a.x - 400, a.y - 270) < 45);
    expect(near.length).toBeGreaterThanOrEqual(3);
  });

  it('a 1200 ms dwell commits 3 staged into one area-summed labelled bubble', () => {
    // Given: 3 bubbles near the sweep path, rest parked far
    scriptField({ 0: { x: 96, y: 300, r: 12 }, 1: { x: 120, y: 310, r: 12 }, 2: { x: 80, y: 290, r: 12 } });
    const { ctx, arcs, texts, segs, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(16);
    // When: one sweep stages all three, then the pointer rests 1233 ms…
    firePointer('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 300 });
    tick(33);
    reset();
    tick(1266); // 1233 ms after the move ⇒ commit triggers
    tick(1300);
    reset();
    tick(1950); // trigger + 600 ms merge ⇒ complete
    // Then: two members removed → 3·(N−2) arcs
    expect(arcs).toHaveLength(3 * (N - 2));
    // And: the merged halo radius is the area sum (below the cap) — the
    // far bubbles are r=23.5, so locate the merged node by radius, not max
    const halos = arcs.filter((_, i) => i % 3 === 0);
    const merged = halos.filter((a) => Math.abs(a.r - Math.sqrt(3 * 12 * 12)) < 0.05);
    expect(merged).toHaveLength(1);
    const big = merged[0];
    // And: exactly one 7-hex label
    expect(texts).toHaveLength(1);
    expect(texts[0].msg).toMatch(/^[0-9a-f]{7}$/);
    // And: a parent lane links the merged centre to an ambient bubble below it
    const touch = segs.filter(
      (s) =>
        (Math.hypot(s.x1 - big.x, s.y1 - big.y) < 2 && s.y2 > big.y) ||
        (Math.hypot(s.x2 - big.x, s.y2 - big.y) < 2 && s.y1 > big.y)
    );
    expect(touch.length).toBeGreaterThanOrEqual(1);
  });

  it('never jumps more than 4 px per frame during staging (staged ease ≤ 0.6 px)', () => {
    // Given: 3 bubbles near the sweep path, rest parked far
    scriptField({ 0: { x: 96, y: 300, r: 12 }, 1: { x: 120, y: 310, r: 12 }, 2: { x: 80, y: 290, r: 12 } });
    const { ctx, arcs, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(16);
    // NOTE: the top→bottom respawn (y < −2r → y = h + 2r) is an intentional
    // off-screen teleport outside FR3's scope; this run is short with slow
    // bubbles (vy ≈ 0.475 px/tick) so no wrap can occur mid-run.
    const halos = () => arcs.filter((_, i) => i % 3 === 0).map((a) => ({ x: a.x, y: a.y }));
    const frames: Array<Array<{ x: number; y: number }>> = [];
    // When: a sweep stages three, frames step, then the pointer teleports +300 px mid-dwell
    firePointer('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 300 });
    let t = 33;
    for (let i = 0; i < 10; i++) {
      reset();
      tick(t);
      frames.push(halos());
      t += 33;
    }
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    for (let i = 0; i < 10; i++) {
      reset();
      tick(t);
      frames.push(halos());
      t += 33;
    }
    // Then: no node moves more than 4 px in any single frame (660 ms < dwell ⇒ no merge, indices stable)
    expect(frames.length).toBe(20);
    for (let f = 1; f < frames.length; f++) {
      expect(frames[f].length).toBe(N);
      for (let b = 0; b < frames[f].length; b++) {
        const d = Math.hypot(frames[f][b].x - frames[f - 1][b].x, frames[f][b].y - frames[f - 1][b].y);
        expect(d).toBeLessThanOrEqual(4);
      }
    }
    // And: the three staged (scripted) nodes ease at ≤ 0.6 px per frame — even across the teleport
    for (let f = 1; f < frames.length; f++) {
      for (let b = 0; b < 3; b++) {
        const d = Math.hypot(frames[f][b].x - frames[f - 1][b].x, frames[f][b].y - frames[f - 1][b].y);
        expect(d).toBeLessThanOrEqual(0.6 + 1e-9);
      }
    }
  });

  it('links each node to its nearest parent below — the legacy y-chain is gone', () => {
    // Given: positions where nearest-below disagrees with y-successor —
    // A(400,100), C(700,140), B(400,300); the 10 remaining bubbles coincide far above A
    scriptField({
      0: { x: 400, y: 100, r: 12 },
      1: { x: 700, y: 140, r: 12 },
      2: { x: 400, y: 300, r: 12 },
      3: { x: 100, y: 40, r: 12 }, 4: { x: 100, y: 40, r: 12 }, 5: { x: 100, y: 40, r: 12 },
      6: { x: 100, y: 40, r: 12 }, 7: { x: 100, y: 40, r: 12 }, 8: { x: 100, y: 40, r: 12 },
      9: { x: 100, y: 40, r: 12 }, 10: { x: 100, y: 40, r: 12 }, 11: { x: 100, y: 40, r: 12 },
      12: { x: 100, y: 40, r: 12 },
    });
    const { ctx, segs } = makeCtx();
    const tick = bubbles(ctx);
    // When: one frame paints with no pointer input (ambient drift < 1 px)
    tick(33);
    // Then: A links down to B (nearest below, 200 px) …
    const near = (s: { x1: number; y1: number }, x: number, y: number) => Math.hypot(s.x1 - x, s.y1 - y) < 2;
    const near2 = (s: { x2: number; y2: number }, x: number, y: number) => Math.hypot(s.x2 - x, s.y2 - y) < 2;
    const ab = segs.filter(
      (s) => (near(s, 400, 100) && near2(s, 400, 300)) || (near2(s, 400, 100) && near(s, 400, 300))
    );
    expect(ab.length).toBeGreaterThanOrEqual(1);
    // … and the legacy chain edge A→C (y-successor, 303 px) is never drawn …
    const ac = segs.filter(
      (s) => (near(s, 400, 100) && near2(s, 700, 140)) || (near2(s, 400, 100) && near(s, 700, 140))
    );
    expect(ac).toHaveLength(0);
    // … with the graph still acyclic: at most N − 1 edges
    expect(segs.length).toBeLessThanOrEqual(N - 1);
  });

  it('caps the merged radius at 26 px', () => {
    // Given: 3 staged bubbles with r=20 (area sum would be ~34.6)
    scriptField({ 0: { x: 96, y: 300, r: 20 }, 1: { x: 120, y: 310, r: 20 }, 2: { x: 80, y: 290, r: 20 } });
    const { ctx, arcs, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(16);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 300 });
    tick(33);
    tick(1266);
    reset();
    tick(1900);
    // Then: the merged halo is exactly the cap
    const halos = arcs.filter((_, i) => i % 3 === 0);
    expect(Math.max(...halos.map((a) => a.r))).toBe(26);
  });

  it('a single staged bubble is released on dwell, not committed', () => {
    // Given: exactly 1 bubble near the pointer
    scriptField({ 0: { x: 100, y: 300, r: 12 } });
    const { ctx, arcs, alphas, texts, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(16);
    // When: sweep + 1250 ms dwell
    firePointer('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 300 });
    tick(33);
    reset();
    let t = 33 + 1250;
    tick(t);
    // Then: nothing merged, no label
    expect(arcs).toHaveLength(3 * N);
    expect(texts).toHaveLength(0);
    // When: settle frames pass (glow decays frame-rate-independently)
    for (let i = 0; i < 40; i++) {
      t += 133;
      reset();
      tick(t);
    }
    const nodeAlphas = alphas.filter((a) => a !== 1 && a !== 0.14 && a !== 0.22);
    expect(Math.max(...nodeAlphas)).toBeLessThanOrEqual(0.55);
  });

  it('ignores touch pointer input — a tap never stages', () => {
    // Given: bubbles near the touch path
    scriptField({ 0: { x: 300, y: 300, r: 12 }, 1: { x: 310, y: 310, r: 12 } });
    const { ctx, arcs, strokeLWs, texts, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(16);
    // When: a touch pointer sweeps and rests
    firePointer('pointermove', { pointerType: 'touch', clientX: 300, clientY: 300 });
    tick(33);
    firePointer('pointermove', { pointerType: 'touch', clientX: 310, clientY: 310 });
    tick(900);
    reset();
    tick(933);
    // Then: only ambient bubbles, nothing lifted, no label
    expect(arcs).toHaveLength(3 * N);
    expect(strokeLWs.filter((lw) => lw > 1.5)).toHaveLength(0);
    expect(texts).toHaveLength(0);
  });

  it('a parent-less commit still labels but draws no lane to it', () => {
    // Given: the cluster sits below every other bubble (none below it —
    // all 10 far bubbles parked near the top at y≈50)
    scriptField({
      0: { x: 100, y: 500, r: 12 }, 1: { x: 120, y: 510, r: 12 }, 2: { x: 80, y: 490, r: 12 },
      3: { x: 100, y: 50, r: 12 }, 4: { x: 200, y: 50, r: 12 }, 5: { x: 300, y: 50, r: 12 },
      6: { x: 400, y: 50, r: 12 }, 7: { x: 500, y: 50, r: 12 }, 8: { x: 600, y: 50, r: 12 },
      9: { x: 700, y: 50, r: 12 }, 10: { x: 150, y: 80, r: 12 }, 11: { x: 250, y: 80, r: 12 },
      12: { x: 350, y: 80, r: 12 },
    });
    const { ctx, arcs, texts, segs, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(16);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 500 });
    tick(33);
    tick(1266);
    reset();
    tick(1900);
    // Then: merged node + label, but no lane touches it
    const halos = arcs.filter((_, i) => i % 3 === 0);
    const big = halos.reduce((p, q) => (q.r > p.r ? q : p));
    expect(texts).toHaveLength(1);
    const touch = segs.filter(
      (s) => Math.hypot(s.x1 - big.x, s.y1 - big.y) < 2 || Math.hypot(s.x2 - big.x, s.y2 - big.y) < 2
    );
    expect(touch).toHaveLength(0);
  });

  it('the dark branch keeps white cores and labels (bg luminance < 0.4)', () => {
    // Given: a field on a dark page background with bubbles near the cursor
    scriptField({ 0: { x: 300, y: 300, r: 12 }, 1: { x: 320, y: 310, r: 12 } });
    const { ctx, fillStyles, texts } = makeCtx({ bg: '#0a0b0e' });
    const tick = bubbles(ctx);
    tick(16);
    // When: a sweep stages and the dwell commits
    firePointer('pointermove', { pointerType: 'mouse', clientX: 300, clientY: 300 });
    tick(33);
    tick(1266);
    tick(1900);
    // Then: cores and the merged label are white
    expect(fillStyles).toContain('#ffffff');
    expect(texts).toHaveLength(1);
  });

  it('the non-hex color falls back to the GitKit pink (A guard)', () => {
    // Given: a field whose essence is not a 7-char hex
    const { ctx, stops, arcs } = makeCtx({ color: 'pink' });
    // When: one frame paints
    const tick = bubbles(ctx);
    tick(0);
    // Then: halos are built from the fallback pink
    expect(stops.some((s) => s.startsWith('#e8a4c8'))).toBe(true);
    expect(arcs).toHaveLength(3 * N);
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a fresh bubbles field that has drawn
    const { ctx, canvas, clearRect, fill, reset } = makeCtx();
    const tick = bubbles(ctx);
    tick(0);
    expect(fill).toHaveBeenCalled();
    reset();
    // When: the canvas leaves the document and frames keep ticking
    canvas.remove();
    tick(33);
    // Then: no paint happens and listeners are released
    expect(clearRect).not.toHaveBeenCalled();
    expect(fill).not.toHaveBeenCalled();
    reset();
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(() => tick(66)).not.toThrow();
  });
});
