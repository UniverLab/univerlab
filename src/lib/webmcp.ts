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
 * The four tools are read-only. Their shapes live in `src/lib/lab-tools.ts`, shared with the
 * future remote MCP server (AGR4); this module owns only the browser plumbing: finding the
 * API, deferred registration, and the about-text read. Nothing here runs where the API is
 * absent: `findModelContext()` returns null, `initWebMcp()` returns before scheduling
 * anything, and no request is made until a tool is actually called.
 */
import { buildTools, TOPICS, type McpTool, type ToolDeps } from './lab-tools';

export type { McpTool, ToolDeps };
export { buildTools, TOPICS } from './lab-tools';

export interface ModelContextLike {
  registerTool(tool: McpTool, options?: { signal?: AbortSignal }): Promise<unknown>;
}

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

/** Register the four tools. A rejection (a duplicate name, say) is the caller's to swallow:
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
