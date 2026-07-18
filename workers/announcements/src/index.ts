/**
 * announcements.univerlab.org — Mission Log API
 *
 *   GET  /        → JSON array of all entries
 *   GET  /events  → SSE stream (pushes `event: entry`)
 *   PUT  /        → Add entry (Bearer token required)
 *
 * KV key "entries" holds the JSON array.
 * KV key "auth_token" holds the Bearer token.
 * KV key "write_lock" is an advisory lock with 5s TTL for concurrent PUT protection.
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
  'Access-Control-Max-Age': '86400',
};

const clients = new Map<string, ReadableStreamDefaultController>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
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
      let entries: Entry[];
      try {
        entries = raw ? JSON.parse(raw) : [];
      } catch {
        entries = [];
      }
      return json(entries);
    }

    // GET /events — SSE stream
    if (req.method === 'GET' && url.pathname === '/events') {
      const id = crypto.randomUUID();
      let interval: ReturnType<typeof setInterval>;

      const stream = new ReadableStream({
        start(controller) {
          clients.set(id, controller);
          controller.enqueue(':ping\n\n');

          // Keep-alive ping every 30s
          interval = setInterval(() => {
            const c = clients.get(id);
            if (c) {
              try { c.enqueue(':ping\n\n'); } catch { clients.delete(id); clearInterval(interval); }
            } else {
              clearInterval(interval);
            }
          }, 30_000);
        },
        cancel() {
          clearInterval(interval);
          clients.delete(id);
        },
      });

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

      if (!storedToken || !auth || !timingSafeEqual(auth, `Bearer ${storedToken}`)) {
        return json({ error: 'Unauthorized' }, 401);
      }

      let body: { title?: string; body?: string; type?: string };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }

      if (!body.title || !body.body) {
        return json({ error: 'title and body required' }, 400);
      }

      // Advisory lock — prevents concurrent read-modify-write on the entries array.
      // KV has no atomic compare-and-swap, so two simultaneous PUTs could lose one.
      const lock = await env.ANNOUNCEMENTS.get('write_lock');
      if (lock) {
        return json({ error: 'Concurrent write in progress, retry' }, 409);
      }
      await env.ANNOUNCEMENTS.put('write_lock', 'locked', { expirationTtl: 5 });

      try {
        const raw = await env.ANNOUNCEMENTS.get('entries');
        let entries: Entry[];
        try {
          entries = raw ? JSON.parse(raw) : [];
        } catch {
          entries = [];
        }

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
      } finally {
        await env.ANNOUNCEMENTS.delete('write_lock');
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
