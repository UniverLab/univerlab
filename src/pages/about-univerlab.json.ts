/**
 * `/about-univerlab.json` — the build-time about text as a static artefact.
 *
 * The same `buildSiteAbout` text every page inlines as `<script
 * id="webmcp-about">`, emitted once at build so the remote MCP server's
 * `about_univerlab` tool can read it through `env.ASSETS.fetch` instead of
 * duplicating a single character of it in source. Prerendered: no request ever
 * runs this. `.json` is in the middleware's `MARKDOWN_EXTS`, so no markdown
 * twin is negotiated for it, and `build-md` globs only `index.html`.
 */
import type { APIRoute } from 'astro';
import { buildSiteAbout } from '../lib/site-about';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL('https://univerlab.org');
  return new Response(JSON.stringify({ about: buildSiteAbout(origin) }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
