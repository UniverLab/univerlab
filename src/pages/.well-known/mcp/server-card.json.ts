/**
 * `/.well-known/mcp/server-card.json` — the path the isitagentready scanner
 * probes, written into `dist/` at build time.
 *
 * Astro accepts `.well-known` as a page directory (its route manifest skips
 * dot-dirs *except* `.well-known`), so this endpoint builds the card the
 * scanner reads. Prerendered responses drop their headers: the wire behaviour
 * (pinned `Content-Type`, open CORS, no-store) comes from the `_headers` rule
 * for this path, and the body here is the contract — the same JSON the
 * `/mcp/server-card` function route serves with its own headers.
 */
import type { APIRoute } from 'astro';
import { serverCardJson } from '../../../lib/mcp-server-card';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(serverCardJson(), {
    headers: { 'Content-Type': 'application/json' },
  });
