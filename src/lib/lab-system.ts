import { experiments, type Experiment, type Status, type ExperimentId } from './experiments';

export const LAB = {
  vbW: 460, vbH: 420,
  cx: 210, cy: 210,
  squash: 0.66,
  rMin: 62, rMax: 168,
  stops: 16,
  periodMin: 60, periodMax: 180,
} as const;

export interface LabBody {
  id: ExperimentId; number: string; essenceHex: string; status: Status;
  ring: number;
  rx: number; ry: number;
  period: number;
  pts: { x: number; y: number }[];
}

export function buildLabBodies(list: Experiment[] = experiments): LabBody[] {
  const dated = [...new Set(list.map((e) => e.startDate).filter((d): d is string => Boolean(d)))].sort();
  let rings = dated.length;
  const ringOf = (e: Experiment): number => {
    if (!e.startDate) return rings;
    const r = dated.indexOf(e.startDate);
    return r < 0 ? rings : r;
  };
  const missing = list.some((e) => !e.startDate);
  if (missing) rings += 1;
  if (rings < 1) rings = 1;
  const span = rings - 1 || 1;
  return list.map((e, index) => {
    const ring = ringOf(e);
    const rx = LAB.rMin + (ring * (LAB.rMax - LAB.rMin)) / span;
    const ry = rx * LAB.squash;
    const period = LAB.periodMin + (ring * (LAB.periodMax - LAB.periodMin)) / span;
    const phase = (index / list.length) * Math.PI * 2;
    const pts = Array.from({ length: LAB.stops }, (_, s) => {
      const a = phase + ((Math.PI * 2 * s) / LAB.stops);
      return { x: LAB.cx + rx * Math.cos(a), y: LAB.cy + ry * Math.sin(a) };
    });
    return { id: e.id, number: e.number, essenceHex: e.essenceHex, status: e.status, ring, rx, ry, period, pts };
  });
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
