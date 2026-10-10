/**
 * The lab's public feed — one data layer for every reader of it.
 *
 * AGR1's markdown twin (`functions/status-twin.ts`) and AGR2's WebMCP tools
 * (`src/lib/webmcp.ts`) both read the same two public endpoints of the
 * announcements API, and both must say the same thing: the agent that asks a
 * tool and the reader that fetches `/status/index.md` get one format, one
 * filter rule, one ordering. So the fetch, the filtering and the markdown live
 * here, and both callers only decide *how much* to ask for.
 *
 * Pure by design: no i18n import (that is what keeps this safe to ship to the
 * browser — the only `src/` types it reuses are the API's own row shapes), no
 * timers, no DOM. `fetch` is injected through `LoadOpts.fetchImpl` so the
 * browser, workerd and the tests all reach the same code.
 *
 * Read-only: `GET /roadmap` and `GET /` are the public, unauthenticated
 * endpoints. They already exclude the private roadmap columns (see
 * `ROADMAP_PUBLIC_COLS` in `workers/announcements/src/index.ts`); nothing here
 * sends a token or asks for `state=all`.
 */
import type { Entry as FieldNotesEntry, RoadmapItem as FieldNotesRoadmapItem } from './field-notes';

/** The announcements API — the lab's own public data host. */
export const ANNOUNCEMENTS_API = 'https://announcements.univerlab.org';

/** `GET /roadmap` — the roadmap board, active rows only. */
export const ROADMAP_URL = `${ANNOUNCEMENTS_API}/roadmap`;

/** `GET /` — the Mission Log entries. */
export const ENTRIES_URL = `${ANNOUNCEMENTS_API}/`;

/** The Atom feed every page advertises — the fallback a failure points at. */
export const FEED_URL = `${ANNOUNCEMENTS_API}/feed.atom`;

/** Lane order as the board renders it: work in flight first, shipped last. */
export const LANE_ORDER = ['now', 'next', 'later', 'idea', 'done'] as const;
export type Lane = (typeof LANE_ORDER)[number];

/** The `done` lane lists at most this many of the most recently shipped items. */
export const DONE_CAP = 10;

/** The default page size for `list_announcements`. */
export const ENTRIES_DEFAULT_LIMIT = 10;

/** The largest page size `list_announcements` accepts. */
export const ENTRIES_MAX_LIMIT = 20;

/** How many rows one read asks the API for — one round trip, no pagination. */
export const FETCH_LIMIT = 100;

/** A public `GET /roadmap` item, plus the field the twin prints. */
export interface RoadmapItem extends FieldNotesRoadmapItem {
  blocked_reason?: string | null;
}

export type Entry = FieldNotesEntry;

/**
 * Section labels. The twin passes its dictionary's copy (both languages); a
 * tool passes nothing and gets English, which is what the tools are written in.
 */
export interface FeedLabels {
  /** Label per lane, keyed by lane id. */
  lanes?: Partial<Record<Lane, string>>;
  /** Prefix for `blocked_reason` — the dictionaries call it `hold`. */
  hold?: string;
  /** Shown when a filter matches nothing. `''` renders nothing at all, which
   *  is what the twin wants: an empty roadmap is an empty section, not prose. */
  empty?: string;
}

export interface FeedOpts {
  /** Keep only this lane (roadmap) — undefined renders every lane. */
  lane?: Lane;
  /** Keep only rows whose topic is exactly this (both callers). */
  topic?: string;
  /** Keep only entries of this exact `type` (entries only). */
  type?: string;
  /** Render at most this many rows, after filtering (entries only). */
  limit?: number;
  labels?: FeedLabels;
}

/** How a reader reaches the API. `fetchImpl` is the seam; `init`/`signal` let
 *  workerd pass its edge-cache options and its deadline. */
export interface LoadOpts {
  fetchImpl?: typeof fetch;
  init?: RequestInit;
  signal?: AbortSignal;
  /** `?limit=` on the request. Defaults to `FETCH_LIMIT`. */
  limit?: number;
}

const DEFAULT_LANES: Record<Lane, string> = {
  now: 'Now',
  next: 'Next',
  later: 'Later',
  idea: 'Idea',
  done: 'Done',
};

const DEFAULT_LABELS: Required<Omit<FeedLabels, 'lanes'>> & { lanes: Record<Lane, string> } = {
  lanes: DEFAULT_LANES,
  hold: 'hold',
  empty: 'Nothing on the roadmap.',
};

const labels = (l?: FeedLabels) => ({
  lanes: { ...DEFAULT_LANES, ...l?.lanes },
  hold: l?.hold ?? DEFAULT_LABELS.hold,
  empty: l?.empty ?? DEFAULT_LABELS.empty,
});

/** ISO instants (`2026-10-06T01:09:26.735Z`) to their date part. */
export const isoDate = (v: string): string => (v ?? '').slice(0, 10);

/** The API's `body` is plain text with blank-line paragraphs — first one only,
 *  flattened, so one entry stays one line. */
export const firstParagraph = (body: string): string =>
  (body ?? '').split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();

/** `topic` may be null or empty; the board calls that `general`. */
export const topicOf = (topic?: string | null): string => (topic && topic.trim() ? topic.trim() : 'general');

/** Active rows only. The API already serves them; this keeps every reader
 *  correct against an archived row that slipped into a mirror. */
export function activeRoadmap(items: RoadmapItem[]): RoadmapItem[] {
  return items.filter((i) => i.archived_at == null);
}

/**
 * One lane's rows, in order: by `pos` everywhere except `done`, which reads
 * newest-first by `shipped_at` and stops at `DONE_CAP` (items never shipped
 * sort last rather than first).
 */
export function laneRows(items: RoadmapItem[], lane: Lane): RoadmapItem[] {
  const rows = items.filter((i) => i.state === lane);
  if (lane !== 'done') return rows.sort((a, b) => a.pos - b.pos);
  return rows
    .sort((a, b) => {
      const sa = a.shipped_at ?? '';
      const sb = b.shipped_at ?? '';
      if (sa === sb) return a.pos - b.pos;
      return sa < sb ? 1 : -1;
    })
    .slice(0, DONE_CAP);
}

/** One roadmap row — the twin's line, minus the heading it sits under. */
export function roadmapLine(item: RoadmapItem, hold: string = DEFAULT_LABELS.hold): string {
  let line = `- **${item.title}** · ${topicOf(item.topic)}`;
  if (item.blocked_reason) line += ` — ${hold}: ${item.blocked_reason}`;
  return line;
}

/** One Mission Log entry — one line, first paragraph, optional link.
 *  The mission-date label carries its ISO in parentheses so an agent reading
 *  the twin never has to convert. */
export function entryLine(e: Entry): string {
  const d = new Date(e.date);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const iso = `${isoDate(e.date)}T${hh}:${mm}Z`;
  const sol = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const head = `**TERRA ${d.getFullYear()} \u00b7 Sol ${sol} \u00b7 ${hh}:${mm} UTC** (${iso})`;
  const bits = [head];
  if (e.type) bits.push(e.type);
  bits.push(topicOf(e.topic));
  let line = `- ${bits.join(' · ')} — **${e.title}**: ${firstParagraph(e.body)}`;
  if (e.link) line += ` [link](${e.link})`;
  return line;
}

/** Entries newest first: ISO date desc, `id` desc as the tie-break. */
export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** Filter + sort + cap, shared by every reader of the log. (Not the experiment
 *  matcher of the same name in `field-notes.ts` — that one scores free text.) */
export function filterEntries(
  entries: Entry[],
  opts: { topic?: string; type?: string; limit?: number } = {},
): Entry[] {
  const rows = entries.filter((e) => {
    if (opts.topic && topicOf(e.topic) !== opts.topic) return false;
    if (opts.type && e.type !== opts.type) return false;
    return true;
  });
  return sortEntries(rows).slice(0, opts.limit ?? rows.length);
}

/**
 * The roadmap as markdown, in AGR1's format: one `###` per non-empty lane, one
 * bullet per row. `lane`/`topic` narrow it; an empty result is `labels.empty`
 * (or nothing at all when the caller passes `empty: ''`).
 */
export function roadmapMarkdown(items: RoadmapItem[], opts: FeedOpts = {}): string {
  const L = labels(opts.labels);
  const active = activeRoadmap(items).filter(
    (i) => !opts.topic || topicOf(i.topic) === opts.topic,
  );
  const lanes = opts.lane ? [opts.lane] : LANE_ORDER;
  const sections: string[] = [];
  for (const lane of lanes) {
    const rows = laneRows(active, lane);
    if (!rows.length) continue;
    sections.push(`### ${L.lanes[lane]}\n\n${rows.map((i) => roadmapLine(i, L.hold)).join('\n')}`);
  }
  return sections.join('\n\n') || L.empty;
}

/** The Mission Log as markdown, in AGR1's format: one line per entry, newest
 *  first, capped at `limit`. */
export function entriesMarkdown(entries: Entry[], opts: FeedOpts = {}): string {
  const rows = filterEntries(entries, opts);
  if (!rows.length) return opts.labels?.empty ?? 'Nothing in the Mission Log.';
  return rows.map(entryLine).join('\n');
}

/** One public GET. Throws on a non-OK body — every caller has its own fallback
 *  (the twin serves the static twin, a tool answers with an error text). */
async function apiJson<T>(url: string, o: LoadOpts): Promise<T> {
  const f = o.fetchImpl ?? fetch;
  const init: RequestInit = { ...o.init };
  if (o.signal) init.signal = o.signal;
  const res = await f(url, init);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

/** `GET /roadmap?limit=<n>` — active rows only. */
export async function loadRoadmap(o: LoadOpts = {}): Promise<RoadmapItem[]> {
  const json = await apiJson<{ items?: RoadmapItem[] }>(`${ROADMAP_URL}?limit=${o.limit ?? FETCH_LIMIT}`, o);
  return activeRoadmap(Array.isArray(json?.items) ? json.items : []);
}

/** `GET /?limit=<n>` — Mission Log entries, in the order the API returns them. */
export async function loadEntries(o: LoadOpts = {}): Promise<Entry[]> {
  const json = await apiJson<{ entries?: Entry[] }>(`${ENTRIES_URL}?limit=${o.limit ?? FETCH_LIMIT}`, o);
  return Array.isArray(json?.entries) ? json.entries : [];
}
