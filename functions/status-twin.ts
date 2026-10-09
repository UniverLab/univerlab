/**
 * The live markdown twin of `/status/` and `/es/status/` (AGR1): public
 * announcements-API JSON in, markdown out.
 *
 * Pure on purpose — `_middleware.ts` routes and fetches (edge cache, 3 s
 * deadline, static twin on failure); everything about the twin's *shape* lives
 * here, where it is unit tested without a network.
 *
 * The feed, the filtering and the row/entry formats are AGR2's shared layer,
 * `src/lib/lab-feed.ts`, so a WebMCP tool and this twin can never drift apart.
 * What stays here is the twin itself: its two languages, its front matter and
 * the live-data sentence — plus the re-exports its callers import.
 */
import {
  entryLine,
  FEED_URL,
  roadmapMarkdown,
  type Entry,
  type Lane,
  type RoadmapItem,
} from '../src/lib/lab-feed';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';

// `status-twin.test.ts` imports these three from this module; re-exported so
// the move of the shared layer is invisible to it.
export { DONE_CAP, FEED_URL, LANE_ORDER } from '../src/lib/lab-feed';
export type { Entry, Lane, RoadmapItem } from '../src/lib/lab-feed';

/** Canonical source of the page this twin mirrors (build-md's `source:`). */
export const SOURCE_URL = 'https://univerlab.org/status/';

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

/**
 * Render the twin: front matter, the live-data sentence, roadmap, mission log.
 *
 * Both sections come from the shared layer, so the twin and a WebMCP tool can
 * never print the same data differently. The log keeps the order the API
 * returned it in — the twin's job is to mirror the endpoint, not to re-order
 * it — while a tool that promises "newest first" asks `entriesMarkdown` to sort.
 */
export function renderStatusTwin({ lang, roadmap, entries }: StatusTwinInput): string {
  const H = HEADINGS[lang];
  // The twin prints nothing when a section is empty, so it opts out of the
  // shared layer's "nothing here" line with `empty: ''`.
  const board = roadmapMarkdown(roadmap, {
    labels: { lanes: H.lanes, hold: H.hold, empty: '' },
  });
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

  if (board) out.push(board, '');
  out.push(`## ${H.missionLog}`, '');
  for (const entry of entries) out.push(entryLine(entry));
  out.push('');

  return out.join('\n');
}
