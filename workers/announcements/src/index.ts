/**
 * announcements.univerlab.org — Mission Log API
 *
 *   GET  /        → JSON array of entries (served from the KV mirror, edge-cheap)
 *   GET  /events  → SSE stream (pushes `event: entry`)
 *   PUT  /        → Add entry (Bearer token required)
 *
 * Reads never touch the Durable Object: every write mirrors the latest entries
 * into KV key "entries", so GET / stays a plain edge read. Only /events and PUT
 * reach the LogHub DO, which owns the append and the SSE fan-out.
 *
 * A single hub instance is deliberate — there is one mission log, so the log is
 * the coordination atom. That also makes writes serialized by construction,
 * which is why there is no advisory lock anywhere in here.
 */

import { DurableObject } from 'cloudflare:workers';

export interface Env {
  ANNOUNCEMENTS: KVNamespace;
  LOG_HUB: DurableObjectNamespace<LogHub>;
  AUTH_TOKEN: string;
}

interface Entry {
  id: string;
  date: string;
  title: string;
  body: string;
  type: string;
}

/** Entries kept in the KV mirror. SQLite in the DO retains the full history. */
const MIRROR_LIMIT = 100;
const MAX_TITLE = 200;
const MAX_BODY = 4000;
/** Ceiling on concurrent SSE clients, so a stuck client set cannot grow unbounded. */
const MAX_CLIENTS = 200;
const TYPES = new Set(['update', 'launch', 'incident', 'note']);

const CORS = {
  'Access-Control-Allow-Origin': 'https://univerlab.org',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

/**
 * Constant-time comparison. Lengths are compared first and leak only the token
 * length, which is not secret; the digest step equalises the compared buffers so
 * timingSafeEqual never sees a length mismatch.
 */
async function tokenMatches(presented: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(presented)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export class LogHub extends DurableObject<Env> {
  private clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private encoder = new TextEncoder();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS entries (
          seq   INTEGER PRIMARY KEY AUTOINCREMENT,
          id    TEXT NOT NULL UNIQUE,
          date  TEXT NOT NULL,
          title TEXT NOT NULL,
          body  TEXT NOT NULL,
          type  TEXT NOT NULL
        )
      `);
    });
  }

  /**
   * Append an entry, refresh the KV mirror, then fan out to SSE clients.
   * SQLite writes are synchronous and this DO is single-threaded, so the
   * read-modify-write that used to need a lock cannot interleave here.
   */
  async addEntry(input: { title: string; body: string; type: string }): Promise<Entry> {
    const entry: Entry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      title: input.title,
      body: input.body,
      type: input.type,
    };

    this.ctx.storage.sql.exec(
      'INSERT INTO entries (id, date, title, body, type) VALUES (?, ?, ?, ?, ?)',
      entry.id,
      entry.date,
      entry.title,
      entry.body,
      entry.type
    );

    const latest = this.ctx.storage.sql
      .exec<Omit<Entry, never>>(
        'SELECT id, date, title, body, type FROM entries ORDER BY seq DESC LIMIT ?',
        MIRROR_LIMIT
      )
      .toArray();

    // Persist first, broadcast second — a client must never see an entry that
    // did not make it into the mirror.
    await this.env.ANNOUNCEMENTS.put('entries', JSON.stringify(latest));
    this.broadcast(entry);

    return entry;
  }

  private broadcast(entry: Entry) {
    const payload = this.encoder.encode(`event: entry\ndata: ${JSON.stringify(entry)}\n\n`);
    for (const controller of this.clients) {
      try {
        controller.enqueue(payload);
      } catch {
        this.clients.delete(controller);
      }
    }
  }

  /** SSE stream. Streams cannot cross an RPC boundary, so this stays on fetch(). */
  override async fetch(req: Request): Promise<Response> {
    if (new URL(req.url).pathname !== '/events') {
      return json({ error: 'Not found' }, 404);
    }
    if (this.clients.size >= MAX_CLIENTS) {
      return json({ error: 'Too many listeners, retry shortly' }, 503);
    }

    let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controllerRef = controller;
        this.clients.add(controller);
        controller.enqueue(this.encoder.encode(':ok\n\n'));

        // Safe to keep an interval here: the DO stays resident for as long as a
        // connection is open, unlike a stateless isolate which can be evicted.
        ping = setInterval(() => {
          try {
            controller.enqueue(this.encoder.encode(':ping\n\n'));
          } catch {
            this.clients.delete(controller);
            if (ping) clearInterval(ping);
          }
        }, 30_000);
      },
      cancel: () => {
        if (ping) clearInterval(ping);
        if (controllerRef) this.clients.delete(controllerRef);
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
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // GET / — mirror read, never touches the DO
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

    if (req.method === 'GET' && url.pathname === '/events') {
      return env.LOG_HUB.getByName('hub').fetch(req);
    }

    if (req.method === 'PUT' && url.pathname === '/') {
      const auth = req.headers.get('Authorization') ?? '';
      if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
        return json({ error: 'Unauthorized' }, 401);
      }

      let body: { title?: unknown; body?: unknown; type?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }

      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      const type = typeof body.type === 'string' && body.type ? body.type : 'update';

      if (!title || !text) {
        return json({ error: 'title and body required' }, 400);
      }
      if (title.length > MAX_TITLE || text.length > MAX_BODY) {
        return json({ error: `title max ${MAX_TITLE} chars, body max ${MAX_BODY}` }, 413);
      }
      if (!TYPES.has(type)) {
        return json({ error: `type must be one of: ${[...TYPES].join(', ')}` }, 400);
      }

      const entry = await env.LOG_HUB.getByName('hub').addEntry({ title, body: text, type });
      return json(entry, 201);
    }

    return json({ error: 'Not found' }, 404);
  },
};
