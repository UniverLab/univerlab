/**
 * `POST /api/event` — aggregate, cookieless funnel actions.
 *
 * Records one Analytics Engine data point (`FUNNEL`, dataset
 * `univerlab_funnel`) per funnel action: `copy_install` (with the tool
 * id), `workbench_visit`, `booking_click` and `whatsapp_click`, carrying
 * the tab's active UTM fields when present. Same aggregate shape as the
 * edge landings in `../funnel-landing.ts`: no IP, no user-agent, no
 * cookies, no identifiers.
 *
 * Strict schema: bodies over 2 KB, unknown events, or a `copy_install`
 * without a valid tool id answer 400. A missing `FUNNEL` binding (tests,
 * local dev) answers 204 and records nothing — never throws.
 */

import {
  normalizePathname,
  parseUtmParams,
  recordFunnelEvent,
  TOOL_RE,
  type FunnelEnv,
} from '../funnel-landing';

/** Funnel actions the browser may report. Landings are edge-written only. */
const ALLOWED_EVENTS = new Set([
  'copy_install',
  'workbench_visit',
  'booking_click',
  'whatsapp_click',
]);

/** Bodies stay tiny: event name, tool, path and four short UTM fields. */
const MAX_BODY_BYTES = 2048;

function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

export async function onRequestPost(context: {
  request: Request;
  env: FunnelEnv;
}): Promise<Response> {
  const { request, env } = context;
  let text: string;
  try {
    text = await request.text();
  } catch {
    return badRequest('unreadable body');
  }
  // Byte-accurate: `length` counts UTF-16 units, so multibyte bodies
  // would slip past a character count.
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return badRequest('body too large');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return badRequest('invalid JSON');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return badRequest('invalid payload');
  }
  const body = payload as Record<string, unknown>;
  if (typeof body['event'] !== 'string' || !ALLOWED_EVENTS.has(body['event'])) {
    return badRequest('unknown event');
  }
  const event = body['event'];
  let tool = '';
  if (body['tool'] !== undefined) {
    if (typeof body['tool'] !== 'string' || !TOOL_RE.test(body['tool'])) {
      return badRequest('invalid tool');
    }
    tool = body['tool'];
  }
  if (event === 'copy_install' && tool === '') {
    return badRequest('copy_install requires a tool');
  }
  let path = '';
  if (body['path'] !== undefined) {
    const raw = body['path'];
    if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 256) {
      return badRequest('invalid path');
    }
    // A path only: strip anything after `?` or `#`, then normalize.
    path = normalizePathname(raw.split('?')[0].split('#')[0] || '/');
  }
  // Re-validate the UTM fields inline (never imported from `src/`):
  // anything outside the convention is dropped, never stored.
  const params = new URLSearchParams();
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    if (typeof body[key] === 'string') params.set(key, body[key] as string);
  }
  const utm = parseUtmParams(params);
  if (!env.FUNNEL) return new Response(null, { status: 204 });
  recordFunnelEvent(request, env, event, tool, path, utm);
  return new Response(null, { status: 204 });
}
