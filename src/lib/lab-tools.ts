/**
 * UniverLab MCP tool definitions — shared between the browser's WebMCP
 * registration (`src/lib/webmcp.ts`) and the future remote MCP server (AGR4).
 *
 * Everything about a tool *shape* lives here: name, description, inputSchema
 * and the execute function. What stays in `webmcp.ts` is the browser-only
 * plumbing — finding `document.modelContext`, deferred scheduling, swallowing
 * a failed registration so the page never breaks.
 *
 * The four tools are read-only and make no mutations. `get_roadmap` and
 * `list_announcements` fetch the public announcements API; `about_univerlab`
 * and `translate_mission_date` are pure and make no network calls.
 */
import { experiments } from './experiments';
import {
  ENTRIES_DEFAULT_LIMIT,
  ENTRIES_MAX_LIMIT,
  ENTRIES_URL,
  FEED_URL,
  LANE_ORDER,
  loadEntries,
  loadRoadmap,
  roadmapMarkdown,
  ROADMAP_URL,
  entriesMarkdown,
  type Lane,
} from './lab-feed';
import { translateMissionDate } from './mission-time';

/** The topics a tool accepts: the registry's experiment slugs plus `general`. */
export const TOPICS: readonly string[] = ['general', ...experiments.map((e) => e.id)];

/** What `registerTool` needs. Only the members the draft defines are declared. */
export interface McpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input?: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<string>;
}

export interface ToolDeps {
  /** The `about_univerlab` text, composed at build time by `lab-about.ts`. */
  about: string;
  /** Injectable fetch — the tests pass a fixture, the page passes nothing (global `fetch`). */
  fetchImpl?: typeof fetch;
}

/** Read-only, and the payload is data from another origin — both hints the draft defines. */
const READ_ONLY = { readOnlyHint: true, untrustedContentHint: true } as const;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const unknownTopic = (topic: string): string =>
  `Unknown topic "${topic}". Valid topics: ${TOPICS.join(', ')}.`;

const unknownLane = (lane: string): string =>
  `Unknown lane "${lane}". Valid lanes: ${LANE_ORDER.join(', ')}.`;

const unavailable = (what: string, url: string, err: unknown): string => {
  const why = err instanceof Error && err.message ? err.message : 'request failed';
  return (
    `UniverLab ${what} is unavailable right now (${why}). ` +
    `Read ${url} instead, or follow the Atom feed: ${FEED_URL}`
  );
};

const fetcher = (deps: ToolDeps): typeof fetch =>
  deps.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

/** The `limit` clamp: an integer in 1–20, default 10. */
function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return ENTRIES_DEFAULT_LIMIT;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return ENTRIES_DEFAULT_LIMIT;
  return Math.min(ENTRIES_MAX_LIMIT, Math.max(1, Math.trunc(n)));
}

/** The four tools. Pure construction — nothing is fetched until an `execute` runs. */
export function buildTools(deps: ToolDeps): McpTool[] {
  const roadmap: McpTool = {
    name: 'get_roadmap',
    title: 'UniverLab roadmap',
    description:
      'Live UniverLab roadmap from the lab’s public announcements API, grouped by lane ' +
      '(now, next, later, idea, done) and read fresh on every call. Archived items are excluded. ' +
      `Valid topics: ${TOPICS.join(', ')}.`,
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: `Only rows for this experiment (or "general"). One of: ${TOPICS.join(', ')}.`,
        },
        lane: {
          type: 'string',
          enum: [...LANE_ORDER],
          description: 'Only this lane.',
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    execute: async (input = {}, { signal } = {}) => {
      const topic = str(input.topic);
      const lane = str(input.lane);
      if (topic && !TOPICS.includes(topic)) return unknownTopic(topic);
      if (lane && !(LANE_ORDER as readonly string[]).includes(lane)) return unknownLane(lane);
      try {
        const items = await loadRoadmap({ fetchImpl: fetcher(deps), signal });
        return roadmapMarkdown(items, {
          topic: topic || undefined,
          lane: (lane || undefined) as Lane | undefined,
        });
      } catch (err) {
        return unavailable('roadmap', ROADMAP_URL, err);
      }
    },
  };

  const announcements: McpTool = {
    name: 'list_announcements',
    title: 'UniverLab Mission Log',
    description:
      'The UniverLab Mission Log: announcements, launches and releases, newest first, read ' +
      'fresh from the lab’s public announcements API on every call.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: `Only entries for this experiment (or "general"). One of: ${TOPICS.join(', ')}.`,
        },
        type: {
          type: 'string',
          description: 'Only entries of this type, exactly as published (e.g. launch, release, note).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: ENTRIES_MAX_LIMIT,
          default: ENTRIES_DEFAULT_LIMIT,
          description: `How many entries to return, 1–${ENTRIES_MAX_LIMIT}.`,
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    execute: async (input = {}, { signal } = {}) => {
      const topic = str(input.topic);
      const type = str(input.type);
      if (topic && !TOPICS.includes(topic)) return unknownTopic(topic);
      try {
        const entries = await loadEntries({ fetchImpl: fetcher(deps), signal });
        return entriesMarkdown(entries, {
          topic: topic || undefined,
          type: type || undefined,
          limit: clampLimit(input.limit),
        });
      } catch (err) {
        return unavailable('Mission Log', ENTRIES_URL, err);
      }
    },
  };

  const about: McpTool = {
    name: 'about_univerlab',
    title: 'About UniverLab',
    description:
      'Who UniverLab is: the lab’s description and method, its founder, and every experiment ' +
      'with its status, tagline and URL. Static text, composed from the site’s own pages.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ_ONLY,
    execute: async () =>
      deps.about ||
      `About UniverLab: read ${new URL('/llms.txt', 'https://univerlab.org').href} — the lab’s ` +
        'own description, its experiments and its founder.',
  };

  const translateMissionDateTool: McpTool = {
    name: 'translate_mission_date',
    title: 'Translate a mission date',
    description:
      'Converts between a UniverLab mission date and a calendar date. ' +
      'Mission dates use the form "TERRA <year> · Sol <n> · <HH:MM> UTC" — Sol n is the n-th ' +
      'day of the year (Sol 1 = 1 January). Converts a mission date to its ISO/calendar date, ' +
      'or an ISO date (2026-10-09) / datetime (2026-10-09T14:00Z) to its mission-date label. ' +
      'Read-only, no network calls.',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description:
            'A mission date ("TERRA 2026 · Sol 282", "Sol 282", "sol282") or an ISO date/datetime ' +
            '("2026-10-09", "2026-10-09T14:00Z").',
        },
        lang: {
          type: 'string',
          enum: ['en', 'es'],
          description: 'Language for the human-readable calendar date: "en" (default) or "es".',
        },
      },
      required: ['input'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    execute: async (input = {}) => {
      const raw = str(input.input);
      const lang = str(input.lang) === 'es' ? 'es' : 'en';
      return JSON.stringify(translateMissionDate(raw, lang));
    },
  };

  return [roadmap, announcements, about, translateMissionDateTool];
}
