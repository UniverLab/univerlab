/**
 * Tests for the paper runner (src/scripts/bg-paper.ts) — the texforge sheet:
 * the quiet ambient ink-mark scatter (typographic texture, slow drift, proof-like
 * cross-fade), and the product's own act as the cursor's language (R13): a
 * sweep lays grey LaTeX SOURCE fragments along its path that ~550 ms later
 * compile — cross-fading into their typeset serif forms while snapping onto an
 * invisible 28 px baseline grid — then hold and bleed out. Verifies the compile
 * mapping, the grid snap, the 5-pointer-fragment cap, the ≥450 ms spawn
 * throttle with a ≥12 px travel floor (a parked pointer compiles nothing), the
 * 6 s / 5 s idle compiler, that touch never seeds from a pointer (and gets no
 * listener at all on touch devices), that the ambient draw is untouched, and
 * that a detached canvas aborts the listeners. Given-When-Then pattern, like
 * brain.test.ts and orbit.test.ts.
 */
import {
  paper,
  COMPILE_MAP,
  SOURCE_MS,
  FADE_MS,
  SNAP_MS,
  HOLD_MS,
  LIFE_MS,
  GRID_PX,
  MAX_POINTER_FRAGS,
  SPAWN_EVERY,
  MOVE_PX,
  IDLE_AFTER,
  IDLE_EVERY,
  SOURCE_ALPHA,
  COMPILED_ALPHA,
} from '../scripts/bg-paper';

type PaperCtx = Parameters<typeof paper>[0];

const TOKENS = ['\\begin', '\\end', '{}', '$', '\\ref', '[htbp]', '0.618', '\\to'];
const SRCS = COMPILE_MAP.map(([src]) => src);
const SETS = COMPILE_MAP.map(([, set]) => set);
/** Anything that is not an ambient token is a fragment of the compile. */
const isFrag = (text: string) => !TOKENS.includes(text);
/** Ambient alpha with Math.random pinned to 0.5 — same expression as the runner. */
const AMBIENT = 0.05 + 0.5 * (0.12 - 0.05);
/** Paper's own greys — the source pass never borrows an accent colour. */
const SOURCE_GREY = '#66635f';
const BISTRE = '#87222c';

/** Dispatch a pointer-like event; jsdom has no PointerEvent constructor. */
function firePointer(type: string, props: Record<string, unknown>) {
  const e = new Event(type);
  Object.assign(e, props);
  document.dispatchEvent(e);
}

/** Move the mouse pointer to (x, y) and step one frame at time t. */
function move(tick: (t: number) => void, t: number, x: number, y: number) {
  firePointer('pointermove', { pointerType: 'mouse', clientX: x, clientY: y });
  tick(t);
}

type Draw = {
  text: string;
  x: number;
  y: number;
  alpha: number;
  font: string;
  fillStyle: string;
};

/**
 * Harness with Math.random pinned to 0.5: every mark is born at (400, 300)
 * with tok '\\ref', size 17.6 px (rem 16), ambient alpha AMBIENT, life 19000 ms,
 * age 9500 ms (mid-life ⇒ envelope 1) — so ambient and lit draws are directly
 * comparable. Idle drift/rotation stay index-derived, so they survive the stub.
 * Every fillText is recorded with the alpha, font, fillStyle and position that
 * were in force at that moment — the compile asserts on those.
 */
function makeCtx(w = 800, h = 600) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
  const clearRect = jest.fn();
  const save = jest.fn();
  const restore = jest.fn();
  const beginPath = jest.fn();
  const moveTo = jest.fn();
  const lineTo = jest.fn();
  const stroke = jest.fn();
  const positions: Array<{ x: number; y: number }> = [];
  const rotations: number[] = [];
  const draws: Draw[] = [];
  let alpha = 1;
  let font = '';
  let fill = '';
  const c = {
    clearRect,
    save,
    restore,
    translate: jest.fn((x: number, y: number) => positions.push({ x, y })),
    rotate: jest.fn((a: number) => rotations.push(a)),
    fillText: jest.fn((text: string, x: number, y: number) => {
      draws.push({ text, x, y, alpha, font, fillStyle: fill });
      return text;
    }),
    beginPath,
    moveTo,
    lineTo,
    stroke,
    textBaseline: '',
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(c, 'globalAlpha', {
    get: () => alpha,
    set: (v: number) => {
      alpha = v;
    },
  });
  Object.defineProperty(c, 'font', {
    get: () => font,
    set: (v: string) => {
      font = v;
    },
  });
  Object.defineProperty(c, 'fillStyle', {
    get: () => fill,
    set: (v: string) => {
      fill = v;
    },
  });
  const ctx: PaperCtx = { canvas, c, color: BISTRE, w, h };
  const reset = () => {
    positions.length = 0;
    rotations.length = 0;
    draws.length = 0;
    clearRect.mockClear();
    save.mockClear();
    restore.mockClear();
    (c.fillText as jest.Mock).mockClear();
    beginPath.mockClear();
    moveTo.mockClear();
    lineTo.mockClear();
    stroke.mockClear();
  };
  return {
    ctx,
    canvas,
    positions,
    rotations,
    get draws() {
      return draws.slice();
    },
    get texts() {
      return draws.map((d) => d.text);
    },
    get fragDraws() {
      return draws.filter((d) => isFrag(d.text));
    },
    get ambientDraws() {
      return draws.filter((d) => !isFrag(d.text));
    },
    get ambientAlphas() {
      return draws.filter((d) => !isFrag(d.text)).map((d) => d.alpha);
    },
    get fonts() {
      return draws.map((d) => d.font);
    },
    clearRect,
    beginPath,
    lineTo,
    stroke,
    fillText: c.fillText as jest.Mock,
    reset,
    randomSpy,
  };
}

type Harness = ReturnType<typeof makeCtx>;

/**
 * Fragments live on the frame: both passes of one fragment (source and typeset
 * during the cross-fade) share x and y, so distinct positions count fragments.
 */
const liveCount = (h: Harness) => new Set(h.fragDraws.map((d) => `${d.x},${d.y}`)).size;

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
  document.documentElement.style.fontSize = '';
});

/** N at 800×600 — same formula as the runner. */
const N = Math.min(9, Math.max(6, Math.floor((800 * 600) / 136000)));

describe('paper', () => {
  it('pins the calm-paper spec values: 6–9 marks, 5 pointer frags, 450 ms, 12 px', () => {
    // Given: the spec's sparse-slow numbers
    // When: the runner's exports are read
    // Then: they match the spec exactly — no drift back to 18/14/220 ms
    expect(MAX_POINTER_FRAGS).toBe(5);
    expect(SPAWN_EVERY).toBe(450);
    expect(MOVE_PX).toBe(12);
    expect(Math.min(9, Math.max(6, Math.floor((1440 * 900) / 136000)))).toBe(9);
    expect(Math.min(9, Math.max(6, Math.floor((800 * 600) / 136000)))).toBe(6);
  });

  it('the untouched sheet reads as typesetting: fillText tokens at ambient alpha, never strokes', () => {
    // Given: a fresh paper sheet with no pointer input
    const h = makeCtx();
    const tick = paper(h.ctx);
    // When: a frame steps
    tick(0);
    // Then: every mark draws as a LaTeX token in the mono stack at ambient alpha
    expect(h.fillText).toHaveBeenCalledTimes(N);
    expect(h.texts).toHaveLength(N);
    expect(h.fragDraws).toHaveLength(0); // idle compiles only after 6 s of stillness
    for (const t of h.texts) expect(TOKENS).toContain(t);
    expect(h.ambientAlphas).toHaveLength(N);
    for (const a of h.ambientAlphas) {
      expect(a).toBeGreaterThanOrEqual(0.05);
      expect(a).toBeLessThanOrEqual(0.12);
    }
    for (const d of h.ambientDraws) {
      expect(d.fillStyle).toBe(BISTRE);
      expect(d.font).toMatch(/^1[4-9](\.\d+)?px ui-monospace|20(\.\d+)?px ui-monospace/);
      expect(parseFloat(d.font)).toBeGreaterThanOrEqual(14.4);
      expect(parseFloat(d.font)).toBeLessThanOrEqual(20.8);
    }
    // And: no stroke path anywhere — the sheet holds characters, not fibres
    expect(h.beginPath).not.toHaveBeenCalled();
    expect(h.lineTo).not.toHaveBeenCalled();
    expect(h.stroke).not.toHaveBeenCalled();
    // And: the shared canvas never leaks alpha, garnet comes from the caller
    expect(h.ctx.c.globalAlpha).toBe(1);
    expect(h.ctx.c.fillStyle).toBe(BISTRE);
    expect(h.ctx.c.textBaseline).toBe('top');
  });

  it('idle drift is slow and rotation tiny — quiet paper, not static fibres, not an animation', () => {
    // Given: a fresh sheet that has painted one idle frame
    const h = makeCtx();
    const tick = paper(h.ctx);
    tick(0);
    const p1 = h.positions.map((p) => ({ ...p }));
    const r1 = [...h.rotations];
    h.reset();
    // When: one more idle frame steps
    tick(33);
    // Then: every mark crept by a fraction of a pixel and barely turned
    expect(h.positions).toHaveLength(N);
    for (let i = 0; i < N; i++) {
      expect(Math.abs(h.positions[i].x - p1[i].x)).toBeLessThanOrEqual(0.12);
      expect(Math.abs(h.positions[i].y - p1[i].y)).toBeLessThanOrEqual(0.12);
      expect(Math.abs(h.rotations[i] - r1[i])).toBeLessThanOrEqual(0.0004);
    }
  });

  it('marks cross-fade like a proof being set: fade out, respawn, fade back to ambient', () => {
    // Given: a fresh sheet ageing mid-life (age 9500 of 19000 ms)
    const h = makeCtx();
    const tick = paper(h.ctx);
    let t = 0;
    tick(t);
    // When: ~4 s+ of idle frames pass
    let sawFade = false;
    let respawned = false;
    for (let i = 0; i < 400 && !respawned; i++) {
      t += 50;
      h.reset();
      tick(t);
      const as = h.ambientAlphas;
      if (as.some((a) => a < AMBIENT - 1e-9)) sawFade = true;
      if (as.some((a) => a === 0)) respawned = true;
    }
    // Then: some frame drew below ambient (the fade-out) and a mark respawned
    expect(sawFade).toBe(true);
    expect(respawned).toBe(true);
    // When: the fade-in completes (~2.5 s more of still frames)
    for (let i = 0; i < 60; i++) {
      t += 50;
      h.reset();
      tick(t);
    }
    // Then: every mark reads ambient again — the sheet never blanks as a whole
    expect(h.ambientAlphas).toEqual(new Array(N).fill(AMBIENT));
  });

  it('a sweep lays grey LaTeX source that compiles ~550 ms later into its mapped typeset form', () => {
    // Given: a sheet whose pointer entered and then travelled
    const h = makeCtx();
    const tick = paper(h.ctx);
    tick(0);
    move(tick, 33, 100, 100); // entry: seeds the path, no travel ⇒ no spawn
    move(tick, 66, 200, 300); // travel ⇒ the first source fragment, born at 66
    // When: 549 ms pass — just short of the compile
    h.reset();
    tick(66 + SOURCE_MS - 1);
    // Then: the fragment is still its source, in mono grey where it fell
    const src = h.fragDraws;
    expect(src).toHaveLength(1);
    expect(src[0].text).toBe('\\frac{a}{b}'); // first pair of the fixed map
    expect(src[0].font).toMatch(/ui-monospace/);
    expect(src[0].fillStyle).toBe(SOURCE_GREY);
    expect(src[0].alpha).toBeCloseTo(SOURCE_ALPHA);
    expect(src[0].x).toBe(200);
    // When: the compile window closes (550 + 250 ms)
    h.reset();
    tick(66 + SOURCE_MS + FADE_MS);
    // Then: the source is gone and the typeset form stands in garnet serif
    const set = h.fragDraws;
    expect(set).toHaveLength(1);
    expect(set[0].text).toBe('a⁄b');
    expect(set[0].font).toMatch(/serif/);
    expect(set[0].font).not.toMatch(/italic/);
    expect(set[0].fillStyle).toBe(BISTRE);
    expect(set[0].alpha).toBeCloseTo(COMPILED_ALPHA);
    // And: it holds ~1.5 s, then bleeds out over ~1 s and leaves the sheet
    h.reset();
    tick(66 + SOURCE_MS + FADE_MS + HOLD_MS - 100); // still holding
    expect(h.fragDraws).toHaveLength(1);
    expect(h.fragDraws[0].alpha).toBeCloseTo(COMPILED_ALPHA);
    h.reset();
    tick(66 + SOURCE_MS + FADE_MS + HOLD_MS + 600); // 600 ms into the 1 s bleed
    expect(h.fragDraws[0].alpha).toBeCloseTo(COMPILED_ALPHA * 0.4);
    h.reset();
    tick(66 + LIFE_MS);
    expect(h.fragDraws).toHaveLength(0);
  });

  it('compiles onto the invisible 28 px baseline grid — set lines share their baselines', () => {
    // Given: two fragments laid 10 px apart in y (14 px in x)
    const h = makeCtx();
    const tick = paper(h.ctx);
    tick(0);
    move(tick, 33, 100, 100); // entry seed
    move(tick, 66, 200, 300); // spawn 1 at y = 300
    move(tick, 521, 260, 310); // spawn 2 at y = 310 (521 − 66 = 455 ≥ 450)
    // When: both are still source
    h.reset();
    tick(66 + SOURCE_MS - 1);
    // Then: each sits where the cursor laid it, unsnapped
    expect(h.fragDraws.map((d) => d.y).sort((a, b) => a - b)).toEqual([300, 310]);
    // When: 90 ms into the 180 ms ease-out snap
    h.reset();
    tick(66 + SOURCE_MS + 90);
    const mid = h.fragDraws.filter((d) => d.text === '\\frac{a}{b}');
    expect(mid).toHaveLength(1);
    expect(mid[0].y).toBeGreaterThan(300);
    expect(mid[0].y).toBeLessThan(308); // eased toward the line, never past it
    // When: the second fragment's snap window closes too
    h.reset();
    tick(521 + SOURCE_MS + SNAP_MS);
    // Then: both set lines are on grid multiples measured from the canvas top…
    const set = h.fragDraws.filter((d) => SETS.includes(d.text));
    expect(set.map((d) => d.text).sort()).toEqual(['a⁄b', '∫₀¹']);
    for (const d of set) expect(d.y % GRID_PX).toBe(0);
    // …and on the same line: 300 and 310 both round to round(y/28)·28 = 308
    expect(new Set(set.map((d) => d.y))).toEqual(new Set([308]));
  });

  it('keeps at most 5 pointer-born fragments alive — the oldest drops when a sixth would spawn', () => {
    // Given: a sweep whose spawns outpace the 3.3 s fragment life
    const h = makeCtx();
    const tick = paper(h.ctx);
    tick(0);
    move(tick, 33, 100, 100); // entry seed, no travel ⇒ no spawn
    let t = 33;
    let peak = 0;
    for (let i = 1; i <= 9; i++) {
      t += SPAWN_EVERY + 5; // one spawn per frame, 455 ms apart
      h.reset();
      move(tick, t, 120 + i * 20, 200 + i * 20); // travel ≈ 28.3 px ≥ 12
      peak = Math.max(peak, liveCount(h));
    }
    // Then: no frame ever held more than the pointer cap…
    expect(peak).toBeLessThanOrEqual(MAX_POINTER_FRAGS);
    // …the last frame sits exactly on it…
    expect(liveCount(h)).toBe(MAX_POINTER_FRAGS);
    const xs = new Set(h.fragDraws.map((d) => d.x));
    expect(xs.size).toBe(MAX_POINTER_FRAGS);
    // …and the oldest (spawn 1, x = 140) was the one dropped, while spawn 5
    // (x = 220) still stands with the newer four
    expect(xs.has(140)).toBe(false);
    expect(xs.has(220)).toBe(true);
  });

  it('spawns at most one fragment per ~450 ms of travel, and never under 12 px of travel', () => {
    // Given: a fresh sheet whose pointer entered
    const h = makeCtx();
    const tick = paper(h.ctx);
    tick(0);
    move(tick, 33, 100, 100); // entry seed
    h.reset();
    move(tick, 60, 150, 150); // ≥12 px, first window ⇒ fragment 1 (born 60)
    expect(liveCount(h)).toBe(1);
    h.reset();
    move(tick, 200, 250, 250); // 140 ms after the spawn — throttled
    expect(liveCount(h)).toBe(1);
    h.reset();
    move(tick, 300, 300, 300); // 240 ms — throttled
    expect(liveCount(h)).toBe(1);
    h.reset();
    move(tick, 509, 350, 350); // 449 ms — still throttled
    expect(liveCount(h)).toBe(1);
    h.reset();
    move(tick, 511, 400, 400); // 451 ms + travel ⇒ fragment 2
    expect(liveCount(h)).toBe(2);
    h.reset();
    // 489 ms elapsed but only 9.9 px since the last spawn — under the floor
    move(tick, 1000, 400 + MOVE_PX - 2.1, 400);
    expect(liveCount(h)).toBe(2);
    h.reset();
    move(tick, 1100, 400 + MOVE_PX, 400); // exactly MOVE_PX of travel ⇒ fragment 3
    expect(liveCount(h)).toBe(3);
  });

  it('a parked pointer spawns nothing for 10 s — only the ambient set lives', () => {
    // Given: a sheet whose pointer arrived and then stood still
    const h = makeCtx();
    const tick = paper(h.ctx);
    tick(0);
    move(tick, 33, 100, 100); // entry seed — no travel ⇒ no spawn
    // When: 10 s of frames pass with the pointer parked on the page
    let t = 33;
    for (let i = 0; i < 100; i++) {
      t += 100;
      h.reset();
      tick(t);
    }
    // Then: not one pointer-born fragment was compiled — the sweep throttle
    // needs travel, and the idle compiler is gated off while a pointer is present
    expect(h.fragDraws).toHaveLength(0);
    // And: the ambient set alone carries the sheet, respawned on its own slow clock
    expect(h.ambientAlphas.length).toBe(N);
    expect(h.fillText).toHaveBeenCalledTimes(N);
  });

  it('the ambient set stays sparse: at 1440×900 the runner keeps at most 9 marks', () => {
    // Given: a full-HD-ish viewport (area/136000 ⇒ 9 before the cap)
    const h = makeCtx(1440, 900);
    const tick = paper(h.ctx);
    // When: a frame steps
    tick(0);
    // Then: the mark count is inside the 6–9 band the spec pins
    expect(h.ambientAlphas.length).toBeLessThanOrEqual(9);
    expect(h.ambientAlphas.length).toBeGreaterThanOrEqual(6);
    expect(h.ambientAlphas.length).toBe(
      Math.min(9, Math.max(6, Math.floor((1440 * 900) / 136000))),
    );
    expect(h.fragDraws).toHaveLength(0);
  });

  it('idle: past 6 s without a pointer the sheet keeps its marks and compiles one lone fragment every ~5 s', () => {
    // Given: a sheet nobody has touched (no pointer events at all)
    const h = makeCtx();
    const tick = paper(h.ctx);
    tick(0);
    // When: stillness passes the idle window
    h.reset();
    tick(IDLE_AFTER + 500); // 6500 ⇒ the lone compiler is armed, not fired
    expect(h.fragDraws).toHaveLength(0);
    expect(h.ambientAlphas).toHaveLength(N); // the quiet motif carries on
    h.reset();
    tick(IDLE_AFTER + 500 + IDLE_EVERY); // 11500 ⇒ one fragment, inside the viewport
    const lone = h.fragDraws;
    expect(lone).toHaveLength(1);
    expect(SRCS).toContain(lone[0].text);
    expect(lone[0].fillStyle).toBe(SOURCE_GREY);
    expect(lone[0].x).toBeGreaterThanOrEqual(40);
    expect(lone[0].x).toBeLessThanOrEqual(760);
    expect(lone[0].y).toBeGreaterThanOrEqual(40);
    // Then: it compiles like any cursor fragment, onto the grid
    h.reset();
    tick(IDLE_AFTER + 500 + IDLE_EVERY + SOURCE_MS + FADE_MS);
    expect(h.fragDraws).toHaveLength(1);
    expect(SETS).toContain(h.fragDraws[0].text);
    expect(h.fragDraws[0].fillStyle).toBe(BISTRE);
    expect(h.fragDraws[0].y % GRID_PX).toBe(0);
    // And: it dies on the same 3.3 s clock
    h.reset();
    tick(IDLE_AFTER + 500 + IDLE_EVERY + LIFE_MS);
    expect(h.fragDraws).toHaveLength(0);
    // And: the next lone compile comes ~5 s later, not sooner
    h.reset();
    tick(IDLE_AFTER + 500 + IDLE_EVERY + IDLE_EVERY);
    expect(h.fragDraws).toHaveLength(1);
  });

  it('touch lays no source from the pointer — the finger only ever reaches the idle compiler', () => {
    // Given: a fresh sheet
    const h = makeCtx();
    const tick = paper(h.ctx);
    tick(0);
    const before = h.positions.map((p) => ({ ...p }));
    h.reset();
    // When: a finger sweeps across the sheet
    firePointer('pointermove', { pointerType: 'touch', clientX: 400, clientY: 300 });
    firePointer('pointermove', { pointerType: 'touch', clientX: 500, clientY: 400 });
    tick(33);
    // Then: nothing was compiled and nothing was stirred
    expect(h.fragDraws).toHaveLength(0);
    for (let i = 0; i < N; i++) {
      expect(Math.abs(h.positions[i].x - before[i].x)).toBeLessThanOrEqual(0.12);
      expect(Math.abs(h.positions[i].y - before[i].y)).toBeLessThanOrEqual(0.12);
    }
    expect(h.ambientAlphas).toEqual(new Array(N).fill(AMBIENT));
    // And: touch input does not feed the idle clock — the lone compile still fires
    h.reset();
    tick(IDLE_AFTER + 500);
    expect(h.fragDraws).toHaveLength(0);
    h.reset();
    tick(IDLE_AFTER + 500 + IDLE_EVERY);
    expect(h.fragDraws).toHaveLength(1);
  });

  it('never attaches a pointer listener on touch devices — only the idle compiler runs', () => {
    // Given: a touch device (ontouchstart present + a nonzero touch point)
    const hadTouch = Object.getOwnPropertyDescriptor(window, 'ontouchstart');
    const hadPoints = Object.getOwnPropertyDescriptor(window.navigator, 'maxTouchPoints');
    Object.defineProperty(window, 'ontouchstart', { value: null, configurable: true });
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      value: 1,
      configurable: true,
    });
    try {
      const h = makeCtx();
      const tick = paper(h.ctx);
      tick(0);
      // When: a mouse sweeps the page anyway (hybrid laptop)
      move(tick, 300, 300, 300);
      move(tick, 600, 500, 400);
      h.reset();
      tick(1000);
      // Then: no fragment was ever spawned from the pointer
      expect(h.fragDraws).toHaveLength(0);
      expect(h.ambientAlphas).toHaveLength(N);
      // And: the idle compiler still runs on its own clock
      h.reset();
      tick(IDLE_AFTER + 500);
      expect(h.fragDraws).toHaveLength(0);
      h.reset();
      tick(IDLE_AFTER + 500 + IDLE_EVERY);
      expect(h.fragDraws).toHaveLength(1);
    } finally {
      if (hadTouch) Object.defineProperty(window, 'ontouchstart', hadTouch);
      else delete (window as { ontouchstart?: unknown }).ontouchstart;
      if (hadPoints) Object.defineProperty(window.navigator, 'maxTouchPoints', hadPoints);
      else delete (window.navigator as { maxTouchPoints?: unknown }).maxTouchPoints;
    }
  });

  it('\\emph{ink} compiles into an italic serif set form', () => {
    // Given: a sweep that walks the whole fixed map (the 12th fragment is emph)
    const h = makeCtx();
    const tick = paper(h.ctx);
    tick(0);
    move(tick, 33, 100, 100); // entry seed
    let t = 33;
    for (let i = 1; i <= 12; i++) {
      t += SPAWN_EVERY + 5;
      // travel √(12² + 16²) = 20 px ≥ 12 — well clear of the floor
      move(tick, t, 120 + i * 12, 200 + i * 16);
    }
    const emphBorn = t;
    // When: that fragment compiles
    h.reset();
    tick(emphBorn + SOURCE_MS - 1);
    const raw = h.fragDraws.filter((d) => d.text === '\\emph{ink}');
    expect(raw).toHaveLength(1);
    expect(raw[0].font).toMatch(/ui-monospace/);
    h.reset();
    tick(emphBorn + SOURCE_MS + FADE_MS);
    // Then: it sets in the page's serif, italic, garnet ink
    const ink = h.fragDraws.filter((d) => d.text === 'ink');
    expect(ink).toHaveLength(1);
    expect(ink[0].font).toMatch(/^italic /);
    expect(ink[0].font).toMatch(/serif/);
    expect(ink[0].fillStyle).toBe(BISTRE);
    expect(ink[0].y % GRID_PX).toBe(0);
  });

  it('stops drawing and aborts its listeners once the canvas is detached', () => {
    // Given: a sheet that has painted
    const h = makeCtx();
    const tick = paper(h.ctx);
    tick(0);
    expect(h.fillText).toHaveBeenCalledTimes(N);
    h.reset();
    // When: the canvas leaves the document and frames keep ticking
    h.canvas.remove();
    tick(33);
    tick(66);
    // Then: no paint happens and listeners are released
    expect(h.clearRect).not.toHaveBeenCalled();
    expect(h.fillText).not.toHaveBeenCalled();
    h.reset();
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
