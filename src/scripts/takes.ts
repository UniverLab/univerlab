// DemoStage takes — the cursor's own gesture becomes a take that the
// background records and replays. Record → normalize → replay: "the demo is
// the source". While the pointer moves, its path is sampled into the current
// take and drawn live with a REC dot; when it stops, the path is compiled
// (Ramer–Douglas–Peucker) into a clean score with keyframe ticks, and a ghost
// cursor replays it at a constant pace before the take fades. Idle (or touch)
// gets one short synthetic take every few seconds — quieter than real use.
// No motes, no comet, no particle field.
//
// Reduced motion never reaches here at all: ThemeBackground returns before
// importing this module. Split out of backgrounds.ts (DemoStage).

/* The subset of backgrounds.ts `Ctx` that this runner reads, declared locally
   (the same move brain.ts made) so the module needs no runtime dependency on
   backgrounds.ts — keep the field names in sync with it. */
interface TakesCtx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  w: number;
  h: number;
}

export type Pt = { x: number; y: number };

const SAMPLE_MS = 40; // path sample interval while moving
const MAX_SAMPLES = 60; // ≈ 2.4 s hard stop → compile
export const STILL_MS = 600; // stillness → compile
const RDP_EPS = 6; // px, in canvas CSS space (context is pre-scaled)
export const MAX_TAKES = 3; // oldest compiled take drops first
const REPLAY_DUR_MULT = 1.2; // replay wall-clock = recordedMs × 1.2
const FADE_MS = 2000; // take fades out after its replay ends
const IDLE_AFTER = 8000; // ms without pointer before synthetic takes
const IDLE_EVERY = 6000; // ms between synthetic takes
const REC_R = 4; // pulsing REC head radius
const GHOST_R = 6; // hollow ghost cursor radius
const PATH_A = 0.5; // max path alpha
const GHOST_A = 0.8; // ghost stroke alpha
const TICK_EVERY = 4; // keyframe tick every Nth normalized point

/** Pure Ramer–Douglas–Peucker simplification, for the normalize step. */
export function rdp(points: Pt[], epsilon: number): Pt[] {
  if (points.length <= 2) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const denom = Math.hypot(dx, dy);
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d =
      denom === 0
        ? Math.hypot(points[i].x - first.x, points[i].y - first.y)
        : Math.abs(dy * points[i].x - dx * points[i].y + last.x * first.y - last.y * first.x) / denom;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > epsilon) {
    const left = rdp(points.slice(0, idx + 1), epsilon);
    const right = rdp(points.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

type Phase = 'normalized' | 'replaying' | 'fading';
interface Take {
  phase: Phase;
  score: Pt[]; // RDP-normalized path
  t0: number; // phase-local clock (replay start / fade start)
  recordedMs: number; // wall time from first → last sample
  trail: Array<Pt & { t: number }>; // fading ghost trail samples
  alpha: number; // fades 1 → 0 while fading
}
interface TakesTick {
  (t: number): void;
  takes: Take[]; // live compiled takes, oldest first (for tests)
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** Arc-length position along a polyline at progress u ∈ [0, 1]. */
function posAt(score: Pt[], u: number): Pt {
  if (score.length === 1 || u <= 0) return score[0];
  if (u >= 1) return score[score.length - 1];
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < score.length; i++) {
    const L = Math.hypot(score[i].x - score[i - 1].x, score[i].y - score[i - 1].y);
    segs.push(L);
    total += L;
  }
  if (total === 0) return score[0];
  let d = u * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const s = segs[i] === 0 ? 0 : d / segs[i];
      return {
        x: score[i].x + (score[i + 1].x - score[i].x) * s,
        y: score[i].y + (score[i + 1].y - score[i].y) * s,
      };
    }
    d -= segs[i];
  }
  return score[score.length - 1];
}

export function takes(ctx: TakesCtx): TakesTick {
  const { c } = ctx;
  const takes: Take[] = [];
  // The live recording lives outside `takes[]` so enforcing MAX_TAKES can
  // never drop the in-progress gesture.
  let raw: Pt[] = [];
  let firstT = 0;
  let lastSampleT = -1e9;
  let lastMoveT = -1; // −1 until the first frame lands
  let pending: Pt | null = null; // latest pointer position, consumed per tick
  let nextIdleT = -1;
  let synthCount = 0;
  // Touch has no cursor to record with, so no pointer listener is attached at
  // all — idle synthetics only. Same gate as brain.ts.
  const isTouch = 'ontouchstart' in window && navigator.maxTouchPoints > 0;

  const ac = new AbortController();
  if (!isTouch) {
    document.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        // clientX/Y are CSS pixels and the context is already scaled to CSS
        // pixels, so the rect mapping keeps small inset canvases honest.
        const rect = ctx.canvas.getBoundingClientRect();
        pending = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      },
      { passive: true, signal: ac.signal }
    );
  }

  function pushTake(score: Pt[], recordedMs: number, t: number) {
    takes.push({ phase: 'replaying', score, t0: t, recordedMs: Math.max(1, recordedMs), trail: [], alpha: 1 });
    if (takes.length > MAX_TAKES) takes.splice(0, takes.length - MAX_TAKES);
  }

  function compile(t: number) {
    pushTake(rdp(raw, RDP_EPS), lastSampleT - firstT, t);
    raw = [];
  }

  // One short synthetic take — a gentle seeded arc, shorter than a real
  // gesture so idle reads clearly quieter than use.
  function synthetic(t: number) {
    synthCount++;
    const rnd = mulberry32(
      ((ctx.w * 73856093) ^ (ctx.h * 19349663) ^ (synthCount * 83492791)) >>> 0
    );
    const R = Math.min(ctx.w, ctx.h) * 0.12 + 20;
    const cx = ctx.w * (0.3 + rnd() * 0.4);
    const cy = ctx.h * (0.3 + rnd() * 0.4);
    const a0 = rnd() * Math.PI * 2;
    const sweep = (0.8 + rnd() * 0.8) * (rnd() < 0.5 ? 1 : -1);
    const n = 12 + Math.floor(rnd() * 9);
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (sweep * i) / (n - 1);
      const rr = R * (1 + 0.12 * Math.sin(i * 1.3));
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.8 });
    }
    pushTake(rdp(pts, RDP_EPS), 1200, t);
  }

  function strokePath(pts: Pt[]) {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();
  }

  // The compiled score: clean polyline plus keyframe ticks — small
  // perpendicular marks every TICK_EVERY-th point.
  function drawScore(k: Take) {
    if (k.score.length === 0) return;
    c.globalAlpha = PATH_A * k.alpha;
    c.lineWidth = 1.25;
    if (k.score.length === 1) {
      c.beginPath();
      c.arc(k.score[0].x, k.score[0].y, 1, 0, Math.PI * 2);
      c.stroke();
    } else {
      strokePath(k.score);
    }
    c.lineWidth = 1;
    for (let i = 0; i < k.score.length; i += TICK_EVERY) {
      const p = k.score[i];
      const q = k.score[Math.min(i + 1, k.score.length - 1)];
      const o = k.score[Math.max(i - 1, 0)];
      let dx = q.x - o.x;
      let dy = q.y - o.y;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      const h = 5; // px half-length
      c.beginPath();
      c.moveTo(p.x - dy * h, p.y + dx * h);
      c.lineTo(p.x + dy * h, p.y - dx * h);
      c.stroke();
    }
  }

  const tick = ((t: number) => {
    // The canvas is gone — we were navigated away. Stop drawing and drop the
    // listener rather than recording into a detached canvas forever.
    if (!ctx.canvas.isConnected) {
      ac.abort();
      return;
    }
    if (lastMoveT < 0) lastMoveT = t;

    // RECORD — consume the latest pointer position into the current take.
    if (pending) {
      if (raw.length === 0) firstT = t;
      if (t - lastSampleT >= SAMPLE_MS && raw.length < MAX_SAMPLES) {
        raw.push(pending);
        lastSampleT = t;
      }
      lastMoveT = t;
      nextIdleT = -1;
      pending = null;
    }
    // NORMALIZE — stillness (or a full take) compiles the raw path into a
    // score. A lone sample is not a gesture: it needs ≥ 2 points.
    if (raw.length >= 2 && (raw.length >= MAX_SAMPLES || t - lastMoveT >= STILL_MS)) {
      compile(t);
    } else if (raw.length === 1 && t - lastMoveT >= STILL_MS) {
      raw = []; // a lone sample is not a gesture — discard, never compile
    }

    // IDLE — no pointer for a while (or touch): a short synthetic take every
    // few seconds so the page is never dead. Fires as soon as idle is entered,
    // then on cadence; any real move re-arms it.
    if (t - lastMoveT > IDLE_AFTER) {
      if (nextIdleT < 0 || t >= nextIdleT) {
        synthetic(t);
        nextIdleT = t + IDLE_EVERY;
      }
    }

    c.clearRect(0, 0, ctx.w, ctx.h);
    c.strokeStyle = ctx.color;
    c.fillStyle = ctx.color;

    // Older takes first, live recording on top.
    for (let i = takes.length - 1; i >= 0; i--) {
      const k = takes[i];
      if (k.phase === 'replaying') {
        const u = (t - k.t0) / (k.recordedMs * REPLAY_DUR_MULT);
        if (u >= 1) {
          k.phase = 'fading';
          k.t0 = t;
          k.alpha = 1;
        } else {
          drawScore(k);
          // REPLAY — the hollow ghost replays the score at a constant pace,
          // leaving a fading trail behind it.
          const g = posAt(k.score, u);
          k.trail.push({ x: g.x, y: g.y, t });
          while (k.trail.length > 24 || (k.trail.length > 0 && t - k.trail[0].t > 600)) {
            k.trail.shift();
          }
          c.globalAlpha = GHOST_A * k.alpha;
          c.lineWidth = 1.25;
          c.beginPath();
          c.arc(g.x, g.y, GHOST_R, 0, Math.PI * 2);
          c.stroke();
          for (const s of k.trail) {
            const age = t - s.t;
            if (age < 0) continue;
            c.globalAlpha = GHOST_A * k.alpha * (1 - age / 600) * 0.5;
            c.beginPath();
            c.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
            c.stroke();
          }
          continue;
        }
      }
      if (k.phase === 'fading') {
        // FADE — the take dissolves over FADE_MS, then leaves the array.
        k.alpha = 1 - (t - k.t0) / FADE_MS;
        if (k.alpha <= 0) {
          takes.splice(i, 1);
          continue;
        }
        drawScore(k);
      } else if (k.phase === 'normalized') {
        k.phase = 'replaying';
        k.t0 = t;
        drawScore(k);
      }
    }

    // The live path: thin line in the essence colour with a pulsing REC dot
    // at the head.
    if (raw.length > 0) {
      c.globalAlpha = PATH_A;
      c.lineWidth = 1.25;
      if (raw.length === 1) {
        c.beginPath();
        c.arc(raw[0].x, raw[0].y, 1, 0, Math.PI * 2);
        c.stroke();
      } else {
        strokePath(raw);
      }
      const head = raw[raw.length - 1];
      c.globalAlpha = 0.35 + 0.35 * Math.sin(t / 180);
      c.beginPath();
      c.arc(head.x, head.y, REC_R, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }) as TakesTick;
  tick.takes = takes;
  return tick;
}
