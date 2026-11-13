import { parseInbound, verifySignature } from './meta';
import { handleAgenda } from './agenda';
import { runAgenda } from './daybook';
import type { Env } from './env';

export { Conversation } from './conversation';
export { Operator } from './operator';
export { Calendar } from './calendar';
export { Gate } from './gate';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const agenda = await handleAgenda(req, env);
    if (agenda) return agenda;
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
  async scheduled(event: { scheduledTime: number }, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runAgenda(env, event.scheduledTime));
  },
};
