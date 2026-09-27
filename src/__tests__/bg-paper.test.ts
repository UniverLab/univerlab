/**
 * Tests for the paper runner (src/scripts/bg-paper.ts) — the texforge ink-mark
 * motif: sparse LaTeX tokens drifting on the sheet and cross-fading like a
 * proof being set. Verifies the typographic draw (fillText, never strokes),
 * the slow idle drift with tiny rotation, the cross-fade respawn, and the
 * cursor contract: marks at rest draw at their ambient alpha; a sweeping
 * pointer nudges the marks it crosses (directional kick, capped) and bumps
 * their brightness for ~1 s before the sheet returns to ambient. Touch never
 * stirs; a detached canvas aborts the listeners. Given-When-Then pattern, like
 * field.test.ts and brain.test.ts.
 */
import { paper } from '../scripts/bg-paper';

type PaperCtx = Parameters<typeof paper>[0];

const TOKENS = ['\\begin', '\\end', '{}', '$', '\\ref', '[htbp]', '0.618', '\\to'];
/** Ambient alpha with Math.random pinned to 0.5 — same expression as the runner. */
const AMBIENT = 0.05 + 0.5 * (0.12 - 0.05);

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/**
 * Harness with Math.random pinned to 0.5: every mark is born at (400, 300)
 * with tok '\\ref', size 17.6 px (rem 16), ambient alpha AMBIENT,
 * life 10500 ms, age 5250 ms (mid-life ⇒ envelope 1) — so ambient and lit
 * draws are directly comparable. Idle drift/rotation stay index-derived, so
 * they survive the stub.
 */
function makeCtx(w = 800, h = 600) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  const clearRect = jest.fn();
  const save = jest.fn();
  const restore = jest.fn();
  const fillText = jest.fn((_text: string) => _text);
  const beginPath = jest.fn();
  const moveTo = jest.fn();
  const lineTo = jest.fn();
  const stroke = jest.fn();
  const positions: Array<{ x: number; y: number }> = [];
  const rotations: number[] = [];
  const texts: string[] = [];
  const fonts: string[] = [];
  const alphas: number[] = [];
  let alpha = 1;
  let font = '';
  const c = {
    clearRect,
    save,
    restore,
    translate: jest.fn((x: number, y: number) => positions.push({ x, y })),
    rotate: jest.fn((a: number) => rotations.push(a)),
    fillText: jest.fn((text: string, _x: number, _y: number) => {
      texts.push(text);
      return fillText(text);
    }),
    beginPath,
    moveTo,
    lineTo,
    stroke,
    fillStyle: '',
    textBaseline: '',
    strokeStyle: '',
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => {
      alphas.push(v);
      alpha = v;
    },
  });
  Object.defineProperty(c, 'font', {
    get: () => font,
    set: (v: string) => {
      fonts.push(v);
      font = v;
    },
  });
  const ctx: PaperCtx = { canvas, c, color: '#6a563e', w, h };
  const reset = () => {
    positions.length = 0;
    rotations.length = 0;
    texts.length = 0;
    fonts.length = 0;
    alphas.length = 0;
    clearRect.mockClear();
    fillText.mockClear();
    beginPath.mockClear();
    moveTo.mockClear();
    lineTo.mockClear();
    stroke.mockClear();
  };
  const ambientAlphas = () => alphas.filter((a) => a !== 1);
  return {
    ctx, canvas, positions, rotations, texts, fonts, alphas, ambientAlphas,
    clearRect, fillText, beginPath, lineTo, stroke, reset, randomSpy,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
  document.documentElement.style.fontSize = '';
});

/** N at 800×600 — same formula as the runner. */
const N = Math.min(18, Math.max(12, Math.floor((800 * 600) / 68000)));

describe('paper', () => {
  it('the untouched sheet reads as typesetting: fillText tokens at ambient alpha, never strokes', () => {
    // Given: a fresh paper sheet with no pointer input
    const { ctx, texts, fonts, ambientAlphas, beginPath, lineTo, stroke, fillText } = makeCtx();
    const tick = paper(ctx);
    // When: a frame steps
    tick(0);
    // Then: every mark draws as a LaTeX token in the mono stack at ambient alpha
    expect(fillText).toHaveBeenCalledTimes(N);
    expect(texts).toHaveLength(N);
    for (const t of texts) expect(TOKENS).toContain(t);
    for (const a of ambientAlphas()) expect(a).toBeGreaterThanOrEqual(0.05), expect(a).toBeLessThanOrEqual(0.12);
    for (const f of fonts) {
      expect(f).toMatch(/^1[4-9](\.\d+)?px ui-monospace|20(\.\d+)?px ui-monospace/);
      expect(parseFloat(f)).toBeGreaterThanOrEqual(14.4);
      expect(parseFloat(f)).toBeLessThanOrEqual(20.8);
    }
    // And: no stroke path anywhere — the sheet holds characters, not fibres
    expect(beginPath).not.toHaveBeenCalled();
    expect(lineTo).not.toHaveBeenCalled();
    expect(stroke).not.toHaveBeenCalled();
    // And: the shared canvas never leaks alpha, bistre comes from the caller
    expect(ctx.c.globalAlpha).toBe(1);
    expect(ctx.c.fillStyle).toBe('#6a563e');
    expect(ctx.c.textBaseline).toBe('top');
  });

  it('idle drift is slow and rotation tiny — quiet paper, not static fibres, not an animation', () => {
    // Given: a fresh sheet that has painted one idle frame
    const { ctx, positions, rotations, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    const p1 = positions.map((p) => ({ ...p }));
    const r1 = [...rotations];
    reset();
    // When: one more idle frame steps
    tick(33);
    // Then: every mark crept by a fraction of a pixel and barely turned
    expect(positions).toHaveLength(N);
    for (let i = 0; i < N; i++) {
      expect(Math.abs(positions[i].x - p1[i].x)).toBeLessThanOrEqual(0.12);
      expect(Math.abs(positions[i].y - p1[i].y)).toBeLessThanOrEqual(0.12);
      expect(Math.abs(rotations[i] - r1[i])).toBeLessThanOrEqual(0.0004);
    }
  });

  it('marks cross-fade like a proof being set: fade out, respawn, fade back to ambient', () => {
    // Given: a fresh sheet ageing mid-life (age 5250 of 10500 ms)
    const { ctx, ambientAlphas, reset } = makeCtx();
    const tick = paper(ctx);
    let t = 0;
    tick(t);
    // When: ~4 s+ of idle frames pass
    let sawFade = false;
    let respawned = false;
    for (let i = 0; i < 400 && !respawned; i++) {
      t += 50;
      reset();
      tick(t);
      const as = ambientAlphas();
      if (as.some((a) => a < AMBIENT - 1e-9)) sawFade = true;
      if (as.some((a) => a === 0)) respawned = true;
    }
    // Then: some frame drew below ambient (the fade-out) and a mark respawned
    expect(sawFade).toBe(true);
    expect(respawned).toBe(true);
    // When: the fade-in completes (~1.5 s more of still frames)
    for (let i = 0; i < 60; i++) {
      t += 50;
      reset();
      tick(t);
    }
    // Then: every mark reads ambient again — the sheet never blanks as a whole
    expect(ambientAlphas()).toEqual(new Array(N).fill(AMBIENT));
  });

  it('the first move only records the entry — no kick from an off-screen origin', () => {
    // Given: a fresh sheet
    const { ctx, positions, ambientAlphas, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    reset();
    // When: the pointer enters exactly over the marks and a frame steps
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    tick(33);
    // Then: nothing brightened and nothing left its idle drift (moved < 0.5 px from spawn)
    expect(ambientAlphas()).toEqual(new Array(N).fill(AMBIENT));
    expect(Math.abs(positions[0].x - 400)).toBeLessThan(0.5);
    expect(Math.abs(positions[0].y - 300)).toBeLessThan(0.5);
  });

  it('a sweep nudges reachable marks and bumps their brightness', () => {
    // Given: a sheet whose pointer has entered over the marks
    const { ctx, positions, rotations, ambientAlphas, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    tick(33);
    const r1 = [...rotations];
    reset();
    // When: the pointer travels and a frame steps
    firePointer('pointermove', { pointerType: 'mouse', clientX: 430, clientY: 330 });
    tick(66);
    // Then: the kick shows — marks drew hotter and displaced in travel direction
    expect(Math.max(...ambientAlphas())).toBeGreaterThan(0.3);
    expect(positions[0].x).toBeGreaterThan(400);
    expect(positions[0].y).toBeGreaterThan(300);
    // And: the sweep visibly reoriented the marks
    expect(Math.abs(rotations[0] - r1[0])).toBeGreaterThan(0.001);
  });

  it('caps the flick so no mark is flung more than VCAP = 3 px in one frame', () => {
    // Given: a sheet with the pointer seeded at (0, 0)
    const { ctx, positions, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 0, clientY: 0 });
    tick(33);
    const before = positions.map((p) => ({ ...p }));
    reset();
    // When: a screen-wide flick lands on the marks
    firePointer('pointermove', { pointerType: 'mouse', clientX: 410, clientY: 310 });
    tick(66);
    // Then: the per-frame displacement is clamped to VCAP (3)
    for (let i = 0; i < N; i++) {
      expect(Math.abs(positions[i].x - before[i].x)).toBeLessThanOrEqual(3 + 1e-6);
      expect(Math.abs(positions[i].y - before[i].y)).toBeLessThanOrEqual(3 + 1e-6);
    }
  });

  it('the bump decays over ~1 s and the sheet returns to the ambient draw', () => {
    // Given: a sheet that was just swept once
    const { ctx, ambientAlphas, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    tick(33);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 430, clientY: 330 });
    tick(66);
    // When: 3 s of still frames pass (τ = 400 ms ⇒ glow snaps to 0)
    let t = 66;
    for (let i = 0; i < 60; i++) {
      t += 50;
      reset();
      tick(t);
    }
    // Then: alpha back to exactly ambient on every mark
    expect(ambientAlphas()).toEqual(new Array(N).fill(AMBIENT));
  });

  it('ignores touch pointer input — touch adds no kick and no brightness', () => {
    // Given: a fresh sheet
    const { ctx, positions, ambientAlphas, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    const before = positions.map((p) => ({ ...p }));
    reset();
    // When: a finger sweeps across the marks
    firePointer('pointermove', { pointerType: 'touch', clientX: 400, clientY: 300 });
    firePointer('pointermove', { pointerType: 'touch', clientX: 500, clientY: 400 });
    tick(33);
    // Then: nothing beyond idle drift moved, nothing brightened
    for (let i = 0; i < N; i++) {
      expect(Math.abs(positions[i].x - before[i].x)).toBeLessThanOrEqual(0.12);
      expect(Math.abs(positions[i].y - before[i].y)).toBeLessThanOrEqual(0.12);
    }
    expect(ambientAlphas()).toEqual(new Array(N).fill(AMBIENT));
  });

  it('pointerout re-arms the seed: re-entry over the marks carries no stale-exit kick', () => {
    // Given: a sheet whose pointer travelled far away from the marks
    const { ctx, positions, ambientAlphas, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 50, clientY: 50 }); // seed
    tick(33);
    firePointer('pointermove', { pointerType: 'mouse', clientX: 750, clientY: 550 }); // far travel, out of reach
    tick(66);
    // When: the pointer leaves and re-enters exactly over the marks
    firePointer('pointerout', { pointerType: 'mouse', relatedTarget: null });
    firePointer('pointermove', { pointerType: 'mouse', clientX: 405, clientY: 305 });
    reset();
    tick(100);
    // Then: the re-entry frame has zero travel (px re-seeded) — the stale
    // 750→405 exit jump never became a kick: drift only, no bump
    for (let i = 0; i < N; i++) {
      expect(Math.abs(positions[i].x - 400)).toBeLessThan(1.5);
      expect(Math.abs(positions[i].y - 300)).toBeLessThan(1.5);
    }
    expect(ambientAlphas()).toEqual(new Array(N).fill(AMBIENT));
    // When: the pointer genuinely sweeps from the re-entry point
    firePointer('pointermove', { pointerType: 'mouse', clientX: 425, clientY: 325 });
    reset();
    tick(133);
    // Then: the sweep kicks (20 px travel ⇒ visible nudge + brightness bump)
    expect(Math.max(...ambientAlphas())).toBeGreaterThan(0.3);
    expect(positions[0].x).toBeGreaterThan(400);
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a sheet that has painted
    const { ctx, canvas, clearRect, fillText, reset } = makeCtx();
    const tick = paper(ctx);
    tick(0);
    expect(fillText).toHaveBeenCalledTimes(N);
    reset();
    // When: the canvas leaves the document and frames keep ticking
    canvas.remove();
    tick(33);
    tick(66);
    // Then: no paint happens and listeners are released
    expect(clearRect).not.toHaveBeenCalled();
    expect(fillText).not.toHaveBeenCalled();
    reset();
    firePointer('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(() => tick(99)).not.toThrow();
  });

  it('sizes glyphs from the root rem: 20 px root ⇒ 18–26 px, default ⇒ 14.4–20.8 px', () => {
    // Given: a 20 px root font size
    document.documentElement.style.fontSize = '20px';
    const big = makeCtx();
    const tickBig = paper(big.ctx);
    // When: a frame steps
    tickBig(0);
    // Then: every glyph sits in the 0.9–1.3 rem band of the larger root
    expect(big.fonts).toHaveLength(N);
    for (const f of big.fonts) {
      expect(parseFloat(f)).toBeGreaterThanOrEqual(18);
      expect(parseFloat(f)).toBeLessThanOrEqual(26);
    }
    big.randomSpy.mockRestore();
    big.canvas.remove();
    // Given: the default root (jsdom reports '' ⇒ 16 px fallback)
    document.documentElement.style.fontSize = '';
    const def = makeCtx();
    const tickDef = paper(def.ctx);
    // When: a frame steps
    tickDef(0);
    // Then: every glyph sits in the default band
    for (const f of def.fonts) {
      expect(parseFloat(f)).toBeGreaterThanOrEqual(14.4);
      expect(parseFloat(f)).toBeLessThanOrEqual(20.8);
    }
  });
});
