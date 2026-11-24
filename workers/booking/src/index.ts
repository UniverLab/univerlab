import { handlePublicBooking } from './public-booking';
import { runBookingDigest } from './daybook';
import type { Env } from './env';

export { Calendar } from './calendar';
export { Gate } from './gate';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const booking = await handlePublicBooking(req, env);
    if (booking) return booking;
    const url = new URL(req.url);
    // The agent door: the WhatsApp worker forwards calendar actions over
    // its BOOKING service binding. Same action envelope the owner speaks,
    // and no Turnstile anywhere in this path. It shares the public
    // hostname but needs the shared binding secret: anyone on the
    // internet could POST here otherwise and book under any contact key.
    if (req.method === 'POST' && url.pathname === '/internal/call') {
      const secret = env.INTERNAL_CALL_SECRET;
      if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
        return Response.json({ ok: false, reason: 'calendar-down' }, { status: 401 });
      }
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return Response.json({ ok: false, reason: 'calendar-down' }, { status: 400 });
      }
      if (typeof body !== 'object' || body === null || typeof (body as { action?: unknown }).action !== 'string') {
        return Response.json({ ok: false, reason: 'calendar-down' }, { status: 400 });
      }
      try {
        const ns = env.CALENDAR;
        if (!ns) return Response.json({ ok: false, reason: 'calendar-down' }, { status: 503 });
        const stub = ns.get(ns.idFromName('calendar'));
        return await stub.fetch(
          new Request('https://calendar/call', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
        );
      } catch {
        return Response.json({ ok: false, reason: 'calendar-down' }, { status: 503 });
      }
    }
    if (url.pathname === '/health') {
      // The admin room reads this cross-origin in the browser: echo the
      // origin only for the site's own origins (the same list /slots
      // trusts), never `*`. Anything else gets the bare body, no ACAO.
      const origin = req.headers.get('origin');
      const allowed =
        origin === 'https://univerlab.org' ||
        (origin !== null && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
      if (req.method === 'OPTIONS') {
        const headers: Record<string, string> = {
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '86400',
          vary: 'Origin',
        };
        if (allowed && origin !== null) headers['access-control-allow-origin'] = origin;
        return new Response(null, { status: 204, headers });
      }
      if (req.method === 'GET') {
        const headers: Record<string, string> = { vary: 'Origin' };
        if (allowed && origin !== null) headers['access-control-allow-origin'] = origin;
        return new Response('ok', { status: 200, headers });
      }
    }
    return new Response('not found', { status: 404 });
  },
  async scheduled(event: { scheduledTime: number }, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBookingDigest(env, event.scheduledTime));
  },
};
