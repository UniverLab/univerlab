import { parseInbound, verifySignature } from './meta';
import type { Env } from './env';

export { Conversation } from './conversation';

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
        ctx.waitUntil(env.CONVERSATION.get(env.CONVERSATION.idFromName(m.from)).receive(m));
      }
      return new Response('ok', { status: 200 });
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  },
};
