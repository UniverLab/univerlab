import type { FacetCapability, FacetGroup } from './catalogs';

export interface DialArc {
  facet: string;
  label: string;
  count: number;
  span: number;
  start: number;
  end: number;
  d: string;
}

export interface DialCopy {
  checks: Record<string, string>;
  checksByKind: Record<string, string>;
  checked: string;
  seed: string;
}

const FULL = Math.PI * 2;

export function dialArcs(
  groups: FacetGroup[],
  total: number,
  r = 96,
  cx = 120,
  cy = 120,
  gap = 0.035,
): DialArc[] {
  if (total <= 0) return [];
  let start = -Math.PI / 2;
  return groups
    .filter((g) => g.caps.length > 0)
    .map((g) => {
      const span = (g.caps.length / total) * FULL;
      const a0 = start + gap / 2;
      const a1 = start + span - gap / 2;
      const arc: DialArc = {
        facet: g.facet,
        label: g.label,
        count: g.caps.length,
        span,
        start: a0,
        end: a1,
        d: `M ${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}`,
      };
      start += span;
      return arc;
    });
}

export function demoCap(group: FacetGroup): FacetCapability | undefined {
  const caps = group.caps;
  return (
    caps.find((c) => c.kind === group.facet && c.verify) ??
    caps.find((c) => c.kind === group.facet) ??
    caps.find((c) => c.verify) ??
    caps[0]
  );
}

export function demoText(cap: FacetCapability, copy: DialCopy): string {
  const entries = Object.entries(cap.verify ?? {}).slice(0, 2);
  const checks =
    entries.length > 0
      ? entries
          .map(([k, v]) => copy.checks[k]?.replace('{v}', String(v)) ?? `${k} ${v}`)
          .join(' · ')
      : (copy.checksByKind[cap.kind] ?? copy.checked);
  const seed = cap.seed ? ` · ${copy.seed}` : '';
  return `${cap.kind} · ${checks}${seed}`;
}
