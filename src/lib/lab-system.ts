import { experiments, type Experiment, type Status, type ExperimentId } from './experiments';

export const LAB = {
  vbW: 460, vbH: 420,
  /* The mark/orbits sit at the viewBox centre so the svg centre — where the
     orbit runner places its well (`data-orbit-well`) — is the diagram's own
     gravitational centre: the drifting motes and the diagram share one. */
  cx: 230, cy: 210,
  squash: 0.72,
  planetR: 24,
  stops: 16,
  /* One ring per ring actually used (4, not 16): two satellites per ring.
     The tightest pair is cross-ring (inner ring vs its neighbour at closest
     approach), measured ≥ 26 px over the full sampled period; the inner ring
     (85) also keeps every label side clear of the planet disc (r=24). */
  ringRx: [85, 120, 160, 200] as const,
  ringPeriods: [60, 90, 120, 180] as const,
} as const;

/** Satellite disc radii by experiment status, plus the pointer hit area. */
export const SAT = { active: 6, beta: 5, research: 4, hit: 15 } as const;
/** Minimum allowed satellite centre distance, px (spec §3). */
export const MIN_GAP = 26;
/** Label box used by the solver; mirrors the <text> offsets in LabSystem.astro. */
export const LABEL = { w: 46, h: 12, gap: 6 } as const;
/** LCM of the ring periods: sampling [0, FULL_PERIOD) covers all time. */
export const FULL_PERIOD = 360;
export const SAMPLE_STEP = 0.5;

export type Side = 'right' | 'left' | 'above' | 'below';
export const SIDES: Side[] = ['right', 'left', 'above', 'below'];

export interface Rect { x: number; y: number; w: number; h: number }

export interface LabBody {
  id: ExperimentId; number: string; name: string; status: Status;
  essenceHex: string;
  surface: string | undefined;
  motif: string;
  ring: number;
  radius: number;
  rx: number; ry: number;
  period: number;
  phase: number;
  side: Side;
  pts: { x: number; y: number }[];
}

export function buildLabBodies(list: Experiment[] = experiments): LabBody[] {
  const ranked = list
    .map((e, i) => ({ e, i }))
    .sort((a, z) => {
      const da = a.e.startDate ?? '9999';
      const dz = z.e.startDate ?? '9999';
      return da < dz ? -1 : da > dz ? 1 : a.i - z.i;
    });
  const nRings = LAB.ringRx.length;
  const inRing = new Array<number>(nRings).fill(0);
  const byOrig = new Array<LabBody>(list.length);
  for (let rank = 0; rank < ranked.length; rank++) {
    const { e, i } = ranked[rank];
    const ring = Math.min(nRings - 1, Math.floor((rank * nRings) / ranked.length));
    const k = inRing[ring]++;
    const rx = LAB.ringRx[ring];
    const ry = rx * LAB.squash;
    const period = LAB.ringPeriods[ring];
    const phase = (ring * Math.PI) / 4 + k * Math.PI;
    const pts = Array.from({ length: LAB.stops }, (_, s) => {
      const a = phase + ((Math.PI * 2 * s) / LAB.stops);
      return { x: LAB.cx + rx * Math.cos(a), y: LAB.cy + ry * Math.sin(a) };
    });
    byOrig[i] = {
      id: e.id, number: e.number, name: e.name, status: e.status,
      essenceHex: e.essenceHex, surface: e.surface, motif: e.motif,
      ring, radius: SAT[e.status], rx, ry, period, phase,
      side: 'right',
      pts,
    };
  }
  const sides = chooseLabelSides(byOrig);
  byOrig.forEach((b, i) => { b.side = sides[i]; });
  return byOrig;
}

export function labVarStyle(b: LabBody): string {
  const vars: string[] = [];
  b.pts.forEach((p, s) => {
    vars.push(`--k${s}x: ${p.x.toFixed(2)}px; --k${s}y: ${p.y.toFixed(2)}px;`);
  });
  vars.push(`--period: ${b.period}s;`);
  return vars.join(' ');
}

export function labRings(bodies: LabBody[]): { rx: number; ry: number }[] {
  const seen = new Map<number, { rx: number; ry: number }>();
  for (const b of bodies) {
    if (!seen.has(b.ring)) seen.set(b.ring, { rx: b.rx, ry: b.ry });
  }
  return [...seen.entries()].sort((a, z) => a[0] - z[0]).map(([, r]) => r);
}

/** Satellite centre on its ellipse at time t (seconds). */
export function satPosAt(b: LabBody, t: number): { x: number; y: number } {
  const a = b.phase + ((2 * Math.PI * t) / b.period);
  return { x: LAB.cx + b.rx * Math.cos(a), y: LAB.cy + b.ry * Math.sin(a) };
}

/** AABB a label would occupy for a given side. Keep in lockstep with the
 *  <text> offsets in LabSystem.astro. */
export function labelRect(
  side: Side, sx: number, sy: number, r: number,
  box: { w: number; h: number; gap: number } = LABEL,
): Rect {
  const { w, h, gap } = box;
  switch (side) {
    case 'right': return { x: sx + r + gap, y: sy - h / 2, w, h };
    case 'left': return { x: sx - r - gap - w, y: sy - h / 2, w, h };
    case 'above': return { x: sx - w / 2, y: sy - r - gap - h, w, h };
    case 'below': return { x: sx - w / 2, y: sy + r + gap, w, h };
  }
}

/** Label rects for all bodies at t, using each body's chosen side. */
export function labelRects(bodies: LabBody[], t: number): Rect[] {
  return bodies.map((b) => {
    const p = satPosAt(b, t);
    return labelRect(b.side, p.x, p.y, b.radius);
  });
}

/** Pure AABB overlap (edge-touching counts as clear). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Minimum pairwise satellite centre distance over [0, period) every step. */
export function minPairDistance(
  bodies: LabBody[],
  opts?: { period?: number; step?: number },
): number {
  const period = opts?.period ?? FULL_PERIOD;
  const step = opts?.step ?? SAMPLE_STEP;
  let min = Infinity;
  for (let t = 0; t < period; t += step) {
    const ps = bodies.map((b) => satPosAt(b, t));
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y);
        if (d < min) min = d;
      }
    }
  }
  return min;
}

interface SampleSet {
  pos: { x: number; y: number }[][];
  count: number;
}

function sampleAll(bodies: LabBody[], period: number, step: number): SampleSet {
  const count = Math.ceil(period / step);
  const pos = bodies.map((b) => {
    const arr: { x: number; y: number }[] = [];
    for (let s = 0; s < count; s++) arr.push(satPosAt(b, s * step));
    return arr;
  });
  return { pos, count };
}

function discRect(px: number, py: number, r: number): Rect {
  return { x: px - r, y: py - r, w: r * 2, h: r * 2 };
}

/** Rect vs planet-disc overlap (edge-touching counts as clear). */
export function rectCircleOverlap(r: Rect, cx: number, cy: number, cr: number): boolean {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.w));
  const ny = Math.max(r.y, Math.min(cy, r.y + r.h));
  return Math.hypot(nx - cx, ny - cy) < cr;
}

/** Greedy + backtracking label side solver: deterministic, runs once at build.
 *  A side is valid when, for every sample, its rect stays inside the viewBox,
 *  clears the planet disc, overlaps no satellite disc, and overlaps no
 *  already-placed label. */
export function chooseLabelSides(
  bodies: LabBody[],
  opts?: { period?: number; step?: number },
): Side[] {
  const period = opts?.period ?? FULL_PERIOD;
  const step = opts?.step ?? SAMPLE_STEP;
  const boxes = [LABEL, { w: 40, h: 12, gap: 8 }, { w: 36, h: 12, gap: 8 }];
  for (const box of boxes) {
    const found = solveWith(bodies, sampleAll(bodies, period, step), box);
    if (found) return found;
  }
  return greedyFallback(bodies, sampleAll(bodies, period, step), boxes[0]);
}

function solveWith(bodies: LabBody[], samples: SampleSet, box: { w: number; h: number; gap: number }): Side[] | null {
  const order = bodies
    .map((b, i) => ({ b, i }))
    .sort((a, z) => a.b.ring - z.b.ring || a.b.phase - z.b.phase);
  const chosen = new Array<Side>(bodies.length);
  const placed: number[] = [];

  const valid = (bi: number, side: Side): boolean => {
    const b = bodies[bi];
    for (let s = 0; s < samples.count; s++) {
      const p = samples.pos[bi][s];
      const rect = labelRect(side, p.x, p.y, b.radius, box);
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > LAB.vbW || rect.y + rect.h > LAB.vbH) return false;
      if (rectCircleOverlap(rect, LAB.cx, LAB.cy, LAB.planetR)) return false;
      for (let j = 0; j < bodies.length; j++) {
        if (j === bi) continue;
        const q = samples.pos[j][s];
        if (rectsOverlap(rect, discRect(q.x, q.y, bodies[j].radius))) return false;
      }
      for (const pi of placed) {
        const q = samples.pos[pi][s];
        if (rectsOverlap(rect, labelRect(chosen[pi], q.x, q.y, bodies[pi].radius, box))) return false;
      }
    }
    return true;
  };

  const rec = (depth: number): boolean => {
    if (depth === order.length) return true;
    const bi = order[depth].i;
    for (const side of SIDES) {
      if (!valid(bi, side)) continue;
      chosen[bi] = side;
      placed.push(bi);
      if (rec(depth + 1)) return true;
      placed.pop();
    }
    return false;
  };

  return rec(0) ? (chosen as Side[]) : null;
}

/** Best-effort fallback so the build never breaks: per body, the side with
 *  the fewest violating samples. The test is the oracle — it must never pass
 *  on this path for the shipped registry. */
function greedyFallback(bodies: LabBody[], samples: SampleSet, box: { w: number; h: number; gap: number }): Side[] {
  return bodies.map((b, bi) => {
    let best: Side = 'right';
    let bestBad = Infinity;
    for (const side of SIDES) {
      let bad = 0;
      for (let s = 0; s < samples.count; s++) {
        const p = samples.pos[bi][s];
        const rect = labelRect(side, p.x, p.y, b.radius, box);
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > LAB.vbW || rect.y + rect.h > LAB.vbH) { bad++; continue; }
        for (let j = 0; j < bodies.length; j++) {
          if (j === bi) continue;
          const q = samples.pos[j][s];
          if (rectsOverlap(rect, discRect(q.x, q.y, bodies[j].radius))) { bad++; break; }
        }
      }
      if (bad < bestBad) { bestBad = bad; best = side; }
    }
    return best;
  });
}
