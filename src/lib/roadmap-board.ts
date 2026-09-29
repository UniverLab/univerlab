import { solDayOfYear } from './mission-time';

export interface EntriesSummary {
  count: number;
  last_date: string | null;
  last_id: string | null;
}

export interface RoadmapCardItem {
  id: string;
  title: string;
  state: string;
  topic: string | null;
  essence_hex?: string | null;
  blocked_reason?: string | null;
  summary?: string | null;
  shipped_at?: string | null;
  updatedAt?: string | null;
  pos: number;
  entries?: EntriesSummary | null;
}

export const ROADMAP_PEEK = 2;

export function shouldShowEntriesMeta(
  entries: EntriesSummary | null | undefined,
): boolean {
  return !!entries && (entries.count ?? 0) > 0;
}

export function peekLane<T>(rows: T[], opts?: { collapsed?: boolean; peek?: number }): {
  visible: T[];
  hiddenCount: number;
} {
  const collapsed = opts?.collapsed ?? true;
  const peek = opts?.peek ?? ROADMAP_PEEK;
  if (!collapsed || rows.length <= peek) return { visible: rows.slice(), hiddenCount: 0 };
  return { visible: rows.slice(0, peek), hiddenCount: rows.length - peek };
}

/** DONE newest first: shipped_at DESC (lexicographic ISO), nulls last, tie pos ASC. */
export function sortDoneNewestFirst<T extends { shipped_at?: string | null; pos: number }>(
  rows: T[],
): T[] {
  return rows
    .slice()
    .sort((a, b) => {
      const sa = a.shipped_at ?? null;
      const sb = b.shipped_at ?? null;
      if (sa === sb) return a.pos - b.pos;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sa < sb ? 1 : -1;
    });
}

export function formatTemplate(tpl: string, vars: Record<string, string | number>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split('{' + k + '}').join(String(v));
  }
  return out;
}

export function entriesMetaText(
  tplOne: string,
  tplMany: string,
  count: number,
  lastDate: string | null,
): string {
  const sol = lastDate ? solDayOfYear(lastDate) : 0;
  return formatTemplate(count === 1 ? tplOne : tplMany, { n: count, sol });
}

export function landedText(tpl: string, shippedAt: string): string {
  return formatTemplate(tpl, { sol: solDayOfYear(shippedAt) });
}

export function moreText(tpl: string, n: number): string {
  return formatTemplate(tpl, { n });
}
