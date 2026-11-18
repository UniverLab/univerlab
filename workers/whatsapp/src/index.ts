import { parseInbound, verifySignature } from './meta';
import type { Env } from './env';

export { Conversation } from './conversation';
export { Operator } from './operator';

/**
 * Payloads the standalone booking worker posts over the OPERATOR service
 * binding. The endpoint is reachable over plain HTTP too, so every field
 * is strictly validated and the note door only writes one fixed operator
 * tag: forged traffic cannot reach any other surface.
 */
type BookingNotify =
  | { type: 'digestSent'; dateKey: string }
  | { type: 'digest'; dateKey: string; text: string }
  | { type: 'note'; name: string; text: string };

function parseBookingNotify(payload: unknown): BookingNotify | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (body.type === 'digestSent' || body.type === 'digest') {
    if (typeof body.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.dateKey)) return null;
    if (body.type === 'digestSent') return { type: 'digestSent', dateKey: body.dateKey };
    if (typeof body.text !== 'string' || body.text.length > 4000) return null;
    return { type: 'digest', dateKey: body.dateKey, text: body.text };
  }
  if (body.type === 'note') {
    if (typeof body.name !== 'string' || !body.name || body.name.length > 80) return null;
    if (typeof body.text !== 'string' || !body.text || body.text.length > 2000) return null;
    return { type: 'note', name: body.name, text: body.text };
  }
  return null;
}

async function handleBookingNotify(req: Request, env: Env): Promise<Response> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }
  const notify = parseBookingNotify(payload);
  if (!notify || !env.REGISTRY) return new Response('bad request', { status: 400 });
  const stub = env.REGISTRY.get(env.REGISTRY.idFromName('operator'));
  const call = async (body: Record<string, unknown>): Promise<Response> =>
    stub.fetch(
      new Request('https://operator/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  if (notify.type === 'digestSent') {
    return call({ action: 'bookingDigestSent', dateKey: notify.dateKey });
  }
  if (notify.type === 'digest') {
    return call({ action: 'bookingDigest', dateKey: notify.dateKey, text: notify.text });
  }
  return call({ action: 'note', name: notify.name, text: notify.text, tag: 'CITA', priority: 'normal' });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname === '/webhook') {
      if (
        url.searchParams.get('hub.mode') === 'subscribe' &&
        url.searchParams.get('hub.verify_token') === env.WA_VERIFY_TOKEN
      ) {
        return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
      }
      return new Response('forbidden', { status: 403 });
    }
    if (req.method === 'POST' && url.pathname === '/webhook') {
      const body = await req.text();
      if (!(await verifySignature(body, req.headers.get('x-hub-signature-256'), env.WA_APP_SECRET))) {
        return new Response('unauthorized', { status: 401 });
      }
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return new Response('bad request', { status: 400 });
      }
      for (const m of parseInbound(payload)) {
        // Messages from the operator's own number are commands, never
        // client conversations; every other number never runs commands.
        const operator = (env.OPERATOR_PHONE ?? '').replace(/\D/g, '');
        if (m.from !== '' && m.from === operator && env.REGISTRY) {
          ctx.waitUntil(env.REGISTRY.get(env.REGISTRY.idFromName('operator')).command(m));
        } else {
          ctx.waitUntil(env.CONVERSATION.get(env.CONVERSATION.idFromName(m.from)).receive(m));
        }
      }
      return new Response('ok', { status: 200 });
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }
    if (req.method === 'POST' && url.pathname === '/internal/booking-notify') {
      return handleBookingNotify(req, env);
    }
    // The site's signing flow reports here when a document is signed: one
    // line through the operator gate, so quiet hours and away still hold it.
    // Shared secret with the site's SIGN_NOTIFY_* env, never committed.
    if (req.method === 'POST' && url.pathname === '/internal/signed') {
      const secret = env.SIGN_NOTIFY_SECRET;
      if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
        return new Response('unauthorized', { status: 401 });
      }
      let payload: unknown;
      try {
        payload = await req.json();
      } catch {
        return new Response('bad request', { status: 400 });
      }
      const text =
        typeof payload === 'object' && payload !== null && typeof (payload as { text?: unknown }).text === 'string'
          ? ((payload as { text: string }).text ?? '')
          : '';
      if (text === '' || !env.REGISTRY) return new Response('bad request', { status: 400 });
      const stub = env.REGISTRY.get(env.REGISTRY.idFromName('operator'));
      await stub.fetch(
        new Request('https://operator/note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'note', name: 'firma', text, tag: 'FIRMA', priority: 'normal' }),
        }),
      );
      return new Response('ok', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  },
};
