/**
 * The live markdown twin of `/status/` and `/es/status/` (AGR1): public
 * announcements-API JSON in, markdown out.
 *
 * Pure on purpose — `_middleware.ts` routes and fetches (edge cache, 3 s
 * deadline, static twin on failure); everything about the twin's *shape* lives
 * here, where it is unit tested without a network.
 *
 * Types are the public API's own shapes, reused where the Functions build can
 * reach them: `Entry` is `src/lib/field-notes.ts`'s (a type-only import, so the
 * only `src/` code this bundles is the two i18n dictionaries the lane headings
 * come from). `RoadmapItem` extends the field-notes shape with
 * `blocked_reason`, which it does not carry but `GET /roadmap` returns — see
 * `ROADMAP_PUBLIC_COLS` in `workers/announcements/src/index.ts`.
 */
import type { Entry as FieldNotesEntry, RoadmapItem as FieldNotesRoadmapItem } from '../src/lib/field-notes';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';

/** The same feed every page advertises — the twin names it in its first line. */
export const FEED_URL = 'https://announcements.univerlab.org/feed.atom';

/** Canonical source of the page this twin mirrors (build-md's `source:`). */
export const SOURCE_URL = 'https://univerlab.org/status/';

/** Lane order as the board renders it: work in flight first, shipped last. */
export const LANE_ORDER = ['now', 'next', 'later', 'idea', 'done'] as const;
export type Lane = (typeof LANE_ORDER)[number];

/** The `done` lane lists at most this many of the most recently shipped items. */
export const DONE_CAP = 10;

/** A public `GET /roadmap` item, plus the field this twin prints. */
export interface RoadmapItem extends FieldNotesRoadmapItem {
  blocked_reason?: string | null;
}

export type Entry = FieldNotesEntry;

export type Lang = 'en' | 'es';

export interface StatusTwinInput {
  lang: Lang;
  roadmap: RoadmapItem[];
  entries: Entry[];
}

/**
 * The four paths the live twin serves, mapped to a language. `/status` and
 * `/es/status` (no trailing slash) match too — the same routes, one redirect
 * away. Anything else, including a topic filter such as `/status/?topic=…`
 * already stripped by the URL parse and `/status/archive/`, is not ours.
 */
export function statusTwinRoute(pathname: string): Lang | null {
  const p = pathname.replace(/\/index\.md$/, '').replace(/\/+$/, '') || '/';
  if (p === '/status') return 'en';
  if (p === '/es/status') return 'es';
  return null;
}

interface Headings {
  /** Front-matter title — the HTML page's own `<title>`, so the live twin, the
   *  static twin an outage falls back to, and the page all agree. */
  title: string;
  /** Section labels: the status page hardcodes ROADMAP / MISSION LOG in both
   *  languages, and there is no Spanish status page to take copy from. */
  roadmap: string;
  missionLog: string;
  /** Prefix for `blocked_reason` — `roadmap.hold` from the dictionaries. */
  hold: string;
  lanes: Record<Lane, string>;
  /** First sentence of the body: the data is live, and here is the feed. */
  live: string;
}

const HEADINGS: Record<Lang, Headings> = {
  en: {
    title: 'Mission Log — live status of every UniverLab experiment',
    roadmap: 'Roadmap',
    missionLog: 'Mission Log',
    hold: en.roadmap.hold,
    lanes: en.roadmap.lanes,
    live:
      `This page is rendered live from the UniverLab announcements API on every request; ` +
      `the same data is published as an Atom feed at ${FEED_URL}.`,
  },
  es: {
    title: 'Mission Log — estado en vivo de cada experimento de UniverLab',
    roadmap: 'Roadmap',
    missionLog: 'Mission Log',
    hold: es.roadmap.hold,
    lanes: es.roadmap.lanes,
    live:
      `Esta página se genera en vivo desde la API de anuncios de UniverLab en cada solicitud; ` +
      `los mismos datos se publican como feed Atom en ${FEED_URL}.`,
  },
};

/** ISO instants (`2026-10-06T01:09:26.735Z`) to their date part. */
const isoDate = (v: string): string => (v ?? '').slice(0, 10);

/** The API's `body` is plain text with blank-line paragraphs — first one only,
 *  flattened, so one entry stays one line in the twin. */
const firstParagraph = (body: string): string =>
  (body ?? '').split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();

/** `topic` may be null or empty; the board calls that `general`. */
const topicOf = (topic?: string | null): string => (topic && topic.trim() ? topic.trim() : 'general');

/**
 * One lane's rows, in order: by `pos` everywhere except `done`, which reads
 * newest-first by `shipped_at` and stops at `DONE_CAP` (items never shipped
 * sort last rather than first).
 */
function laneRows(items: RoadmapItem[], lane: Lane): RoadmapItem[] {
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

/** Render the twin: front matter, the live-data sentence, roadmap, mission log. */
export function renderStatusTwin({ lang, roadmap, entries }: StatusTwinInput): string {
  const H = HEADINGS[lang];
  const out: string[] = [
    '---',
    `title: "${H.title}"`,
    `source: "${SOURCE_URL}"`,
    '---',
    '',
    H.live,
    '',
    `## ${H.roadmap}`,
    '',
  ];

  // The API already serves active items only; filtering here keeps the twin
  // correct against an archived row that slipped into a mirror.
  const active = roadmap.filter((i) => i.archived_at == null);
  for (const lane of LANE_ORDER) {
    const rows = laneRows(active, lane);
    if (!rows.length) continue;
    out.push(`### ${H.lanes[lane]}`, '');
    for (const item of rows) {
      let line = `- **${item.title}** · ${topicOf(item.topic)}`;
      if (item.blocked_reason) line += ` — ${H.hold}: ${item.blocked_reason}`;
      out.push(line);
    }
    out.push('');
  }

  out.push(`## ${H.missionLog}`, '');
  for (const entry of entries) {
    const bits = [`**${isoDate(entry.date)}**`];
    if (entry.type) bits.push(entry.type);
    bits.push(topicOf(entry.topic));
    let line = `- ${bits.join(' · ')} — **${entry.title}**: ${firstParagraph(entry.body)}`;
    if (entry.link) line += ` [link](${entry.link})`;
    out.push(line);
  }
  out.push('');

  return out.join('\n');
}
