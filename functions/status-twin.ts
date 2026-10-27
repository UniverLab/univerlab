/**
 * The live markdown twin of `/status/` and `/es/status/` (AGR1): public
 * announcements-API JSON in, markdown out.
 *
 * Pure on purpose — `_middleware.ts` routes and fetches (edge cache, 3 s
 * deadline, static twin on failure); everything about the twin's *shape* lives
 * here, where it is unit tested without a network.
 *
 * The logbook is AGR2's shared layer, `src/lib/lab-feed.ts`, so a WebMCP tool
 * and this twin can never drift apart. What stays here is the twin itself: its
 * two languages, its front matter and the live-data sentence — plus the
 * re-exports its callers import.
 *
 * The roadmap is not this twin's section any more: it has its own page and its
 * own live twin (`/roadmap/index.md`), so this twin carries a single pointer
 * line instead of a `## Roadmap` section — a reader of `/status/index.md` is
 * never handed the roadmap twice.
 */
import { entryLine, FEED_URL, type Entry } from '../src/lib/lab-feed';

// `status-twin.test.ts` imports these from this module; re-exported so the
// move of the shared layer is invisible to it.
export { FEED_URL } from '../src/lib/lab-feed';
export type { Entry } from '../src/lib/lab-feed';

/** Canonical source of the page this twin mirrors (build-md's `source:`). */
export const SOURCE_URL = 'https://univerlab.org/status/';

export type Lang = 'en' | 'es';

export interface StatusTwinInput {
  lang: Lang;
  entries: Entry[];
}

/**
 * The roadmap twin's address, per language. Both are the English twin: there
 * is no Spanish roadmap page — `/es/roadmap/` 301s to `/roadmap/` (see
 * `public/_redirects`) — and a pointer should name the URL that actually
 * answers, not the redirect on the way to it.
 */
export const ROADMAP_TWIN_URL: Record<Lang, string> = {
  en: 'https://univerlab.org/roadmap/index.md',
  es: 'https://univerlab.org/roadmap/index.md',
};

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
  /** Label of the roadmap pointer line — the status page hardcodes ROADMAP in
   *  both languages, and there is no Spanish status page to take copy from. */
  roadmap: string;
  missionLog: string;
  /** First sentence of the body: the data is live, and here is the feed. */
  live: string;
}

const HEADINGS: Record<Lang, Headings> = {
  en: {
    title: 'Logbook — live status of every UniverLab experiment',
    roadmap: 'Roadmap',
    missionLog: 'Logbook',
    live:
      `This page is rendered live from the UniverLab announcements API on every request; ` +
      `the same data is published as an Atom feed at ${FEED_URL}.`,
  },
  es: {
    title: 'Cuaderno de bitácora — estado en vivo de cada experimento de UniverLab',
    roadmap: 'Roadmap',
    missionLog: 'Cuaderno de bitácora',
    live:
      `Esta página se genera en vivo desde la API de anuncios de UniverLab en cada solicitud; ` +
      `los mismos datos se publican como feed Atom en ${FEED_URL}.`,
  },
};

/**
 * Render the twin: front matter, the live-data sentence, one roadmap pointer
 * line, the mission log.
 *
 * The log comes from the shared layer, so the twin and a WebMCP tool can never
 * print the same data differently. It keeps the order the API returned it in —
 * the twin's job is to mirror the endpoint, not to re-order it — while a tool
 * that promises "newest first" asks `entriesMarkdown` to sort.
 */
export function renderStatusTwin({ lang, entries }: StatusTwinInput): string {
  const H = HEADINGS[lang];
  const out: string[] = [
    '---',
    `title: "${H.title}"`,
    `source: "${SOURCE_URL}"`,
    '---',
    '',
    H.live,
    '',
    `${H.roadmap}: ${ROADMAP_TWIN_URL[lang]}`,
    '',
    `## ${H.missionLog}`,
    '',
  ];

  for (const entry of entries) out.push(entryLine(entry));
  out.push('');

  return out.join('\n');
}
