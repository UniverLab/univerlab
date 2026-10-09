/**
 * WebMCP tools for a browser agent already on a univerlab.org page (AGR2).
 *
 * API shape matched to the sources, fetched 2026-10-09:
 *   - W3C WebML Community Group, WebMCP draft — https://webmachinelearning.github.io/webmcp/
 *     (`partial interface Document { readonly attribute ModelContext modelContext }`,
 *     `[SecureContext]`; `registerTool(tool, options?)` returns a Promise and rejects on a
 *     duplicate `name`, an empty `description` or an invalid `inputSchema`; the tool's
 *     `execute(inputObject, { signal })` result is JSON-serialized for the caller).
 *   - Chrome developer docs — https://developer.chrome.com/docs/ai/webmcp/imperative-api
 *     (last updated 2026-09-21) and https://developer.chrome.com/docs/ai/webmcp
 *     (last updated 2026-10-07): `document.modelContext.registerTool({ name, description,
 *     inputSchema, execute, annotations })`, samples return a plain string, and
 *     `annotations` carries `readOnlyHint` / `untrustedContentHint` / `consequentialHint` /
 *     `debugging`. The origin trial runs from Chrome 149; its token is not this module's
 *     business.
 *   - `document.modelContext` is the current surface. `navigator.modelContext` was the name
 *     earlier builds of the same trial shipped, so it stays as a fallback — the spec asks for
 *     it, and it costs one guarded property read.
 *
 * The three tools are read-only and reuse `lab-feed.ts`, the same layer AGR1's markdown twin
 * uses, so an agent and `/status/index.md` can never disagree about the data.
 *
 * Nothing here runs where the API is absent: `findModelContext()` returns null, `initWebMcp()`
 * returns before scheduling anything, and no request is made until a tool is actually called.
 */
import { experiments } from './experiments';
import {
  ENTRIES_DEFAULT_LIMIT,
  ENTRIES_MAX_LIMIT,
  ENTRIES_URL,
  FEED_URL,
  entriesMarkdown,
  LANE_ORDER,
  loadEntries,
  loadRoadmap,
  roadmapMarkdown,
  ROADMAP_URL,
  type Lane,
} from './lab-feed';

/** The topics a tool accepts: the registry's experiment slugs plus `general`. */
export const TOPICS: readonly string[] = ['general', ...experiments.map((e) => e.id)];

/** What `registerTool` needs. Only the members the draft defines are declared — the DOM lib
 *  has no `ModelContext` yet, so these are local shapes, not a copy of the IDL. */
export interface McpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input?: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<string>;
}

export interface ModelContextLike {
  registerTool(tool: McpTool, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface ToolDeps {
  /** The `about_univerlab` text, composed at build time by `lab-about.ts`. */
  about: string;
  /** Injectable fetch — the tests pass a fixture, the page passes nothing (global `fetch`). */
  fetchImpl?: typeof fetch;
}

/** Read-only, and the payload is data from another origin — both hints the draft defines. */
const READ_ONLY = { readOnlyHint: true, untrustedContentHint: true } as const;

/** `document.modelContext` first, `navigator.modelContext` as the older name. */
export function findModelContext(): ModelContextLike | null {
  const from = (host: unknown): ModelContextLike | null => {
    const mc = (host as { modelContext?: ModelContextLike } | null | undefined)?.modelContext;
    return mc && typeof mc.registerTool === 'function' ? mc : null;
  };
  if (typeof document !== 'undefined') {
    const doc = from(document);
    if (doc) return doc;
  }
  return typeof navigator !== 'undefined' ? from(navigator) : null;
}

/** The build-time about text, inlined by BaseLayout as `<script id="webmcp-about">`. */
export function readAbout(root?: Document): string {
  const doc = root ?? (typeof document === 'undefined' ? undefined : document);
  const el = doc?.getElementById?.('webmcp-about');
  const text = el?.textContent ?? '';
  if (!text) return '';
  try {
    const parsed = JSON.parse(text) as { about?: unknown };
    return typeof parsed.about === 'string' ? parsed.about : '';
  } catch {
    return '';
  }
}

/** Deferred so registration never competes with first paint. `requestIdleCallback` where it
 *  exists (Chrome ships it), `setTimeout` everywhere else. */
export function schedule(fn: () => void): void {
  const w = globalThis as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 0);
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A model that guessed a topic gets the valid ones, not silence. */
const unknownTopic = (topic: string): string =>
  `Unknown topic "${topic}". Valid topics: ${TOPICS.join(', ')}.`;

const unknownLane = (lane: string): string =>
  `Unknown lane "${lane}". Valid lanes: ${LANE_ORDER.join(', ')}.`;

/** An API failure names the failure and points at the feed. Never a thrown error. */
const unavailable = (what: string, url: string, err: unknown): string => {
  const why = err instanceof Error && err.message ? err.message : 'request failed';
  return (
    `UniverLab ${what} is unavailable right now (${why}). ` +
    `Read ${url} instead, or follow the Atom feed: ${FEED_URL}`
  );
};

const fetcher = (deps: ToolDeps): typeof fetch =>
  deps.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

/** The `limit` clamp: an integer in 1–20, default 10. Anything that is not a
 *  number at all (absent, `null`, a word) means "no opinion" and takes the
 *  default, rather than collapsing to one entry. */
function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return ENTRIES_DEFAULT_LIMIT;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return ENTRIES_DEFAULT_LIMIT;
  return Math.min(ENTRIES_MAX_LIMIT, Math.max(1, Math.trunc(n)));
}

/** The three tools. Pure construction — nothing is fetched until an `execute` runs. */
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

  return [roadmap, announcements, about];
}

/** Register the three tools. A rejection (a duplicate name, say) is the caller's to swallow:
 *  a failed registration must never break the page it was loaded from. */
export async function registerUniverLabTools(
  mc: ModelContextLike,
  deps: ToolDeps,
): Promise<void> {
  await Promise.all(buildTools(deps).map((tool) => mc.registerTool(tool)));
}

/** Boot: find the API, and if it is not there, do nothing at all. The about text
 *  is read inside the deferred callback, so it never depends on where Astro
 *  hoists this module's `<script>` relative to the inlined JSON. */
export function initWebMcp(deps?: ToolDeps): void {
  const mc = findModelContext();
  if (!mc) return;
  schedule(() => {
    void registerUniverLabTools(mc, deps ?? { about: readAbout() }).catch(() => {});
  });
}

// The page imports this module for its side effect only.
if (typeof document !== 'undefined') initWebMcp();
