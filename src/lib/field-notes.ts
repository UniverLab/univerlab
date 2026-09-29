/** Field-notes selection logic — pure, unit-tested. Components only render. */
import { experiments, type Experiment } from './experiments';
import { startSolLabel } from './mission-time';

export interface Entry {
  id: string;
  date: string;
  title: string;
  body: string;
  type?: string;
  topic?: string | null;
  link?: string | null;
  roadmap_id?: string | null;
}

export interface RoadmapItem {
  id: string;
  title: string;
  state: string;
  topic?: string | null;
  pos: number;
  archived_at?: number | null;
  shipped_at?: string | null;
}

/** Known topics derived from the registry + 'general' — never a hardcoded list. */
export const KNOWN_TOPICS: ReadonlySet<string> = new Set([
  'general',
  ...experiments.map((e) => e.id),
]);

/** Unknown / null / non-string → 'general' (mirrors the worker + status page). */
export function normalizeTopic(raw: unknown): string {
  if (typeof raw !== 'string') return 'general';
  const t = raw.trim().toLowerCase();
  return KNOWN_TOPICS.has(t) ? t : 'general';
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The matching rule, word-bounded, case-insensitive. */
export function matchesExperiment(
  entry: Entry,
  exp: Pick<Experiment, 'id' | 'name'>,
): boolean {
  const t = normalizeTopic(entry.topic);
  if (t === exp.id) return true;
  if (t !== 'general') return false;
  const hay = `${entry.title ?? ''}\n${entry.body ?? ''}`;
  for (const needle of [exp.id, exp.name]) {
    if (!needle) continue;
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeRe(needle)}(?![\\p{L}\\p{N}_])`,
      'iu',
    );
    if (re.test(hay)) return true;
  }
  return false;
}

/** Matching entries, newest first (ISO desc, id desc tie-break), capped at `limit`. */
export function selectEntries(
  entries: Entry[],
  exp: Pick<Experiment, 'id' | 'name'>,
  limit = 3,
): Entry[] {
  return entries
    .filter((e) => matchesExperiment(e, exp))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    })
    .slice(0, limit);
}

/** The experiment's roadmap items: topic === id, non-done, pos ASC. */
export function topicRoadmap(items: RoadmapItem[], id: string): RoadmapItem[] {
  return items
    .filter((i) => normalizeTopic(i.topic) === id && i.state !== 'done')
    .sort((a, b) => a.pos - b.pos);
}

/** First non-done item by pos → its `state`, else null. */
export function firstNonDone(items: RoadmapItem[], id: string): string | null {
  const mine = [...items]
    .filter((i) => normalizeTopic(i.topic) === id)
    .sort((a, b) => a.pos - b.pos);
  const first = mine.find((i) => i.state !== 'done');
  return first ? first.state : null;
}

/** First ~160 chars: collapse whitespace, cut on a word boundary, append '…'. */
export function excerpt(body: string, max = 160): string {
  const flat = (body ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut;
  return head.trimEnd() + '…';
}

/** Static plate prefix: `EXP-00N · <statusLabel> · Sol <n>`. */
export function plateStatics(exp: Experiment, statusLabel: string): string {
  const base = `${exp.number} · ${statusLabel}`;
  if (!exp.startDate) return base;
  return `${base} · ${startSolLabel(exp.startDate)}`;
}
