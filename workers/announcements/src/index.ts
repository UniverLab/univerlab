/**
 * announcements.univerlab.org — Mission Log API
 *
 *   GET  /        → JSON array of all entries
 *   GET  /events  → SSE stream (pushes `event: entry`)
 *   PUT  /        → Add entry (Bearer token required)
 *
 * KV key "entries" holds the JSON array.
 * KV key "auth_token" holds the Bearer token.
 */

interface Env {
  ANNOUNCEMENTS: KVNamespace;
}

interface Entry {
  id: string;
  date: string;
  title: string;
  body: string;
  type: string;
}

const CORS = {
  'Access-Control-Allow-Origin': 'https://univerlab.org',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const clients = new Map<string, ReadableStreamDefaultController>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // GET / — return all entries
    if (req.method === 'GET' && url.pathname === '/') {
      const raw = await env.ANNOUNCEMENTS.get('entries');
      const entries: Entry[] = raw ? JSON.parse(raw) : [];
      return json(entries);
    }

    // GET /events — SSE stream
    if (req.method === 'GET' && url.pathname === '/events') {
      const id = crypto.randomUUID();
      const stream = new ReadableStream({
        start(controller) {
          clients.set(id, controller);
          controller.enqueue(':ping\n\n');
        },
        cancel() {
          clients.delete(id);
        },
      });

      // Keep-alive ping every 30s
      const interval = setInterval(() => {
        const c = clients.get(id);
        if (c) {
          try { c.enqueue(':ping\n\n'); } catch { clients.delete(id); clearInterval(interval); }
        } else {
          clearInterval(interval);
        }
      }, 30_000);

      // Clean up on disconnect
      stream.cancel = (() => {
        const orig = stream.cancel;
        return () => { clearInterval(interval); clients.delete(id); return orig.call(stream); };
      })();

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...CORS,
        },
      });
    }

    // PUT / — add entry (Bearer token required)
    if (req.method === 'PUT' && url.pathname === '/') {
      const auth = req.headers.get('Authorization');
      const storedToken = await env.ANNOUNCEMENTS.get('auth_token');

      if (!storedToken || auth !== `Bearer ${storedToken}`) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const body = await req.json<{ title?: string; body?: string; type?: string }>();
      if (!body.title || !body.body) {
        return json({ error: 'title and body required' }, 400);
      }

      const raw = await env.ANNOUNCEMENTS.get('entries');
      const entries: Entry[] = raw ? JSON.parse(raw) : [];

      const entry: Entry = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        title: body.title,
        body: body.body,
        type: body.type || 'update',
      };

      entries.unshift(entry);
      await env.ANNOUNCEMENTS.put('entries', JSON.stringify(entries));

      // Broadcast to all SSE clients
      const payload = `event: entry\ndata: ${JSON.stringify(entry)}\n\n`;
      for (const [clientId, controller] of clients) {
        try {
          controller.enqueue(payload);
        } catch {
          clients.delete(clientId);
        }
      }

      return json(entry, 201);
    }

    return json({ error: 'Not found' }, 404);
  },
};
