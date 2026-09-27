/**
 * announcements.univerlab.org — Mission Log API
 *
 *   GET  /             → JSON array of entries (served from the KV mirror, edge-cheap)
 *   GET  /events       → SSE stream (pushes `event: entry|update|roadmap`)
 *   PUT  /             → Add entry (Bearer token required)
 *   PATCH /:id         → Update an entry's topic (Bearer token required)
 *   DELETE /:id        → Remove entry by id (Bearer token required)
 *
 *   GET  /roadmap       → roadmap items from the KV mirror ({items,total,hasMore,version})
 *   POST /roadmap       → Create a roadmap item (Bearer token required)
 *   PUT  /roadmap/order → Rewrite roadmap order, optimistic versioning (Bearer)
 *   PATCH /roadmap/:id  → Update/archive a roadmap item (Bearer token required)
 *   DELETE /roadmap/:id → Hard delete a roadmap item (Bearer token required)
 *
 * Reads never touch the Durable Object: every write mirrors the latest entries
 * into KV key "entries", so GET / stays a plain edge read. Only /events, PUT and
 * PATCH reach the LogHub DO, which owns writes and the SSE fan-out. The roadmap
 * follows that same path through KV key "roadmap", which holds active items only.
 *
 * A single hub instance is deliberate — there is one mission log, so the log is
 * the coordination atom. That also makes writes serialized by construction,
 * which is why there is no advisory lock anywhere in here.
 */

import { DurableObject } from 'cloudflare:workers';
import { buildFeedXml, etagForFeed } from './feed';

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
  topic: string;
  link?: string;
}

/** Entries kept in the KV mirror. SQLite in the DO retains the full history. */
const MIRROR_LIMIT = 100;
const MAX_TITLE = 200;
const MAX_BODY = 2000;
const MAX_LINK = 500;
/** Ceiling on concurrent SSE clients, so a stuck client set cannot grow unbounded. */
const MAX_CLIENTS = 200;
const TYPES = new Set(['update', 'launch', 'incident', 'note']);
const DEFAULT_TOPIC = 'general';
const TOPICS = new Set([
  DEFAULT_TOPIC,
  'canopy',
  'astro-denoise',
  'texforge',
  'gitkit',
  'ghscaff',
  'cadspec',
  'demostage',
  'quorum',
]);

/** Roadmap lifecycle: rough idea → in flight → shipped. Mirrors ROADMAP.md. */
type RoadmapState = 'idea' | 'now' | 'next' | 'later' | 'done';

/** `type` (not `interface`) so it satisfies `exec<T>`'s index-signature constraint. */
type RoadmapItem = {
  id: string;
  title: string;
  state: RoadmapState;
  topic: string | null;
  essence_hex: string | null;
  blocked_reason: string | null;
  /** Dense 0..n-1 over non-archived rows. */
  pos: number;
  /** ms epoch while archived, NULL when active. */
  archived_at: number | null;
  updatedAt: string;
};

/** Value of KV key "roadmap": active items only, `pos` ascending. */
interface RoadmapMirror {
  version: number;
  items: RoadmapItem[];
}

const ROADMAP_STATES = new Set<string>(['idea', 'now', 'next', 'later', 'done']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_BLOCKED = 500;
/** Shared column list so every roadmap read returns the same shape. */
const ROADMAP_COLS = 'id, title, state, topic, essence_hex, blocked_reason, pos, archived_at, updatedAt';
/** Fields PATCH /roadmap/:id accepts; anything else is a 400, not a silent no-op. */
const ROADMAP_PATCH_FIELDS = new Set([
  'title',
  'topic',
  'state',
  'essence_hex',
  'blocked_reason',
  'archived',
  'archive',
]);

const CORS = {
  'Access-Control-Allow-Origin': 'https://univerlab.org',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function normalizeTopic(topic: unknown): string {
  return typeof topic === 'string' && TOPICS.has(topic) ? topic : DEFAULT_TOPIC;
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

/** Validation failure the worker maps straight onto an HTTP status. */
class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function asRoadmapState(value: unknown): RoadmapState {
  if (typeof value !== 'string' || !ROADMAP_STATES.has(value)) {
    throw new RequestError(`state must be one of: ${[...ROADMAP_STATES].join(', ')}`, 400);
  }
  return value as RoadmapState;
}

/** Reuses the entries vocabulary — the roadmap must not invent a second one. */
function asTopicOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new RequestError('topic must be a string', 400);
  const topic = value.trim();
  if (!topic) return null;
  if (!TOPICS.has(topic)) throw new RequestError(`topic must be one of: ${[...TOPICS].join(', ')}`, 400);
  return topic;
}

function asHexOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !HEX_RE.test(value.trim())) {
    throw new RequestError('essence_hex must look like #rrggbb', 400);
  }
  return value.trim();
}

function asBlockedOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new RequestError('blocked_reason must be a string', 400);
  const reason = value.trim();
  if (!reason) return null;
  if (reason.length > MAX_BLOCKED) throw new RequestError(`blocked_reason max ${MAX_BLOCKED} chars`, 413);
  return reason;
}

function asTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new RequestError('title required', 400);
  const title = value.trim();
  if (title.length > MAX_TITLE) throw new RequestError(`title max ${MAX_TITLE} chars`, 413);
  return title;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Tolerant mirror read — a corrupt value degrades to an empty roadmap, never a 500. */
function readRoadmapMirror(raw: string | null): RoadmapMirror {
  if (!raw) return { version: 0, items: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || !Array.isArray(parsed.items)) return { version: 0, items: [] };
    return {
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      items: parsed.items as RoadmapItem[],
    };
  } catch {
    return { version: 0, items: [] };
  }
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
           type  TEXT NOT NULL,
           topic TEXT NOT NULL DEFAULT 'general'
        )
      `);
      // Migration: add link column if missing
      const cols = this.ctx.storage.sql.exec("PRAGMA table_info('entries')").toArray();
      if (!cols.some((c: any) => c.name === 'link')) {
        this.ctx.storage.sql.exec("ALTER TABLE entries ADD COLUMN link TEXT");
      }
      if (!cols.some((c: any) => c.name === 'topic')) {
        this.ctx.storage.sql.exec("ALTER TABLE entries ADD COLUMN topic TEXT NOT NULL DEFAULT 'general'");
      }

      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS roadmap_items (
          id             TEXT PRIMARY KEY,
          title          TEXT NOT NULL,
          state          TEXT NOT NULL CHECK (state IN ('idea','now','next','later','done')),
          topic          TEXT,
          essence_hex    TEXT,
          blocked_reason TEXT,
          pos            INTEGER NOT NULL,
          archived_at    INTEGER,
          updatedAt      TEXT NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS roadmap_meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)
      `);
      // Migration: add roadmap columns if an older DO created the table short.
      // NOT NULL columns need defaults here — ALTER TABLE cannot add them bare.
      const roadmapCols = this.ctx.storage.sql.exec("PRAGMA table_info('roadmap_items')").toArray();
      const roadmapColumnDdl: Record<string, string> = {
        title: "TEXT NOT NULL DEFAULT ''",
        state: "TEXT NOT NULL DEFAULT 'idea' CHECK (state IN ('idea','now','next','later','done'))",
        topic: 'TEXT',
        essence_hex: 'TEXT',
        blocked_reason: 'TEXT',
        pos: 'INTEGER NOT NULL DEFAULT 0',
        archived_at: 'INTEGER',
        updatedAt: "TEXT NOT NULL DEFAULT ''",
      };
      for (const [name, ddl] of Object.entries(roadmapColumnDdl)) {
        if (!roadmapCols.some((c: any) => c.name === name)) {
          this.ctx.storage.sql.exec(`ALTER TABLE roadmap_items ADD COLUMN ${name} ${ddl}`);
        }
      }
      this.ctx.storage.sql.exec("INSERT OR IGNORE INTO roadmap_meta (k, v) VALUES ('version', 0)");
    });
  }

  /**
   * Append an entry, refresh the KV mirror, then fan out to SSE clients.
   * SQLite writes are synchronous and this DO is single-threaded, so the
   * read-modify-write that used to need a lock cannot interleave here.
   */
  async addEntry(input: { title: string; body: string; type: string; topic: string; link?: string }): Promise<Entry> {
    const entry: Entry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      title: input.title,
      body: input.body,
      type: input.type,
      topic: input.topic,
      ...(input.link ? { link: input.link } : {}),
    };

    this.ctx.storage.sql.exec(
      'INSERT INTO entries (id, date, title, body, type, topic, link) VALUES (?, ?, ?, ?, ?, ?, ?)',
      entry.id,
      entry.date,
      entry.title,
      entry.body,
      entry.type,
      entry.topic,
      entry.link ?? null
    );

    const latest = this.ctx.storage.sql
      .exec<Omit<Entry, never>>(
        'SELECT id, date, title, body, type, topic, link FROM entries ORDER BY seq DESC LIMIT ?',
        MIRROR_LIMIT
      )
      .toArray();

    // Persist first, broadcast second — a client must never see an entry that
    // did not make it into the mirror.
    await this.env.ANNOUNCEMENTS.put('entries', JSON.stringify(latest));
    this.broadcast('entry', entry);

    return entry;
  }

  async updateTopic(id: string, topic: string): Promise<Entry | null> {
    const result = this.ctx.storage.sql.exec('UPDATE entries SET topic = ? WHERE id = ?', topic, id);
    if (result.rowsWritten === 0) return null;

    const updated = this.ctx.storage.sql
      .exec<Omit<Entry, never>>('SELECT id, date, title, body, type, topic, link FROM entries WHERE id = ?', id)
      .toArray()[0];
    if (!updated) return null;

    const latest = this.ctx.storage.sql
      .exec<Omit<Entry, never>>('SELECT id, date, title, body, type, topic, link FROM entries ORDER BY seq DESC LIMIT ?', MIRROR_LIMIT)
      .toArray();

    await this.env.ANNOUNCEMENTS.put('entries', JSON.stringify(latest));
    this.broadcast('update', updated);
    return updated;
  }

  async removeEntry(id: string): Promise<boolean> {
    const result = this.ctx.storage.sql.exec('DELETE FROM entries WHERE id = ?', id);
    if (result.rowsWritten === 0) return false;

    const latest = this.ctx.storage.sql
      .exec<Omit<Entry, never>>(
        'SELECT id, date, title, body, type, topic, link FROM entries ORDER BY seq DESC LIMIT ?',
        MIRROR_LIMIT
      )
      .toArray();

    await this.env.ANNOUNCEMENTS.put('entries', JSON.stringify(latest));
    return true;
  }

  // ---- Roadmap -------------------------------------------------------------

  /** Optimistic-lock counter. Seeded on boot; self-heals if the row went missing. */
  private getRoadmapVersion(): number {
    const rows = this.ctx.storage.sql
      .exec<{ v: number }>("SELECT v FROM roadmap_meta WHERE k = 'version'")
      .toArray();
    if (rows.length) return Number(rows[0].v);
    this.ctx.storage.sql.exec("INSERT OR IGNORE INTO roadmap_meta (k, v) VALUES ('version', 0)");
    return 0;
  }

  private bumpRoadmapVersion(): number {
    const next = this.getRoadmapVersion() + 1;
    this.ctx.storage.sql.exec("UPDATE roadmap_meta SET v = ? WHERE k = 'version'", next);
    return next;
  }

  /** Next free slot: dense 0..n-1 over active rows means max(active pos)+1. */
  private nextRoadmapPos(): number {
    const rows = this.ctx.storage.sql
      .exec<{ max_pos: number | null }>('SELECT MAX(pos) AS max_pos FROM roadmap_items WHERE archived_at IS NULL')
      .toArray();
    const max = rows.length && rows[0].max_pos != null ? Number(rows[0].max_pos) : -1;
    return max + 1;
  }

  /** Re-number survivors to a dense 0..n-1 after a delete or an archive. */
  private compactRoadmapPos(): void {
    const rows = this.ctx.storage.sql
      .exec<{ id: string }>('SELECT id FROM roadmap_items WHERE archived_at IS NULL ORDER BY pos ASC, id ASC')
      .toArray();
    rows.forEach((row, index) => {
      this.ctx.storage.sql.exec('UPDATE roadmap_items SET pos = ? WHERE id = ?', index, row.id);
    });
  }

  private readActiveRoadmap(): RoadmapMirror {
    const items = this.ctx.storage.sql
      .exec<RoadmapItem>(`SELECT ${ROADMAP_COLS} FROM roadmap_items WHERE archived_at IS NULL ORDER BY pos ASC`)
      .toArray();
    return { version: this.getRoadmapVersion(), items };
  }

  /**
   * The single roadmap write funnel: every mutation lands here — mirror the
   * active snapshot to KV first, then fan out. KV is never read-modified-written
   * from outside this DO, and archived rows never reach the mirror.
   */
  private async syncRoadmapMirror(): Promise<RoadmapMirror> {
    const payload = this.readActiveRoadmap();
    await this.env.ANNOUNCEMENTS.put('roadmap', JSON.stringify(payload));
    this.broadcast('roadmap', payload);
    return payload;
  }

  async createRoadmapItem(input: {
    title: string;
    state: RoadmapState;
    topic: string | null;
    essence_hex: string | null;
    blocked_reason: string | null;
  }): Promise<RoadmapItem> {
    const item: RoadmapItem = {
      id: crypto.randomUUID(),
      title: input.title,
      state: input.state,
      topic: input.topic,
      essence_hex: input.essence_hex,
      blocked_reason: input.blocked_reason,
      pos: this.nextRoadmapPos(),
      archived_at: null,
      updatedAt: new Date().toISOString(),
    };

    this.ctx.storage.sql.exec(
      `INSERT INTO roadmap_items (id, title, state, topic, essence_hex, blocked_reason, pos, archived_at, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      item.title,
      item.state,
      item.topic,
      item.essence_hex,
      item.blocked_reason,
      item.pos,
      item.archived_at,
      item.updatedAt
    );

    this.bumpRoadmapVersion();
    await this.syncRoadmapMirror();
    return item;
  }

  async patchRoadmapItem(
    id: string,
    patch: {
      title?: string;
      topic?: string | null;
      state?: RoadmapState;
      essence_hex?: string | null;
      blocked_reason?: string | null;
      archived?: boolean;
    }
  ): Promise<RoadmapItem | null> {
    const current = this.ctx.storage.sql
      .exec<RoadmapItem>(`SELECT ${ROADMAP_COLS} FROM roadmap_items WHERE id = ?`, id)
      .toArray()[0];
    if (!current) return null;

    const wasArchived = current.archived_at !== null;
    const willArchive = patch.archived === true && !wasArchived;
    const willRestore = patch.archived === false && wasArchived;

    const next: RoadmapItem = {
      id: current.id,
      title: patch.title ?? current.title,
      state: patch.state ?? current.state,
      topic: patch.topic !== undefined ? patch.topic : current.topic,
      essence_hex: patch.essence_hex !== undefined ? patch.essence_hex : current.essence_hex,
      blocked_reason: patch.blocked_reason !== undefined ? patch.blocked_reason : current.blocked_reason,
      pos: current.pos,
      archived_at: current.archived_at,
      updatedAt: new Date().toISOString(),
    };
    if (willArchive) next.archived_at = Date.now();
    if (willRestore) {
      next.archived_at = null;
      next.pos = this.nextRoadmapPos(); // unarchive appends at the end
    }

    this.ctx.storage.sql.exec(
      'UPDATE roadmap_items SET title = ?, state = ?, topic = ?, essence_hex = ?, blocked_reason = ?, pos = ?, archived_at = ?, updatedAt = ? WHERE id = ?',
      next.title,
      next.state,
      next.topic,
      next.essence_hex,
      next.blocked_reason,
      next.pos,
      next.archived_at,
      next.updatedAt,
      next.id
    );

    if (willArchive) this.compactRoadmapPos();

    this.bumpRoadmapVersion();
    await this.syncRoadmapMirror();
    return next;
  }

  /** Hard delete — no tombstone. Survivors are re-compacted to 0..n-1. */
  async removeRoadmapItem(id: string): Promise<boolean> {
    const result = this.ctx.storage.sql.exec('DELETE FROM roadmap_items WHERE id = ?', id);
    if (result.rowsWritten === 0) return false;

    this.compactRoadmapPos();
    this.bumpRoadmapVersion();
    await this.syncRoadmapMirror();
    return true;
  }

  /** Full-array rewrite guarded by the client's version; mismatch reports back. */
  async reorderRoadmap(
    clientVersion: number,
    ids: string[]
  ): Promise<
    | { ok: true; payload: RoadmapMirror }
    | { ok: false; reason: 'version_mismatch'; current: RoadmapMirror }
    | { ok: false; reason: 'invalid'; error: string }
  > {
    if (clientVersion !== this.getRoadmapVersion()) {
      return { ok: false, reason: 'version_mismatch', current: this.readActiveRoadmap() };
    }

    const activeIds = this.ctx.storage.sql
      .exec<{ id: string }>('SELECT id FROM roadmap_items WHERE archived_at IS NULL ORDER BY pos ASC')
      .toArray()
      .map((row) => row.id);
    const unique = new Set(ids);
    if (ids.length !== activeIds.length || unique.size !== ids.length || activeIds.some((id) => !unique.has(id))) {
      return { ok: false, reason: 'invalid', error: 'items must list every active roadmap id exactly once' };
    }

    const updatedAt = new Date().toISOString();
    ids.forEach((id, index) => {
      this.ctx.storage.sql.exec('UPDATE roadmap_items SET pos = ?, updatedAt = ? WHERE id = ?', index, updatedAt, id);
    });

    this.bumpRoadmapVersion();
    const payload = await this.syncRoadmapMirror();
    return { ok: true, payload };
  }

  /**
   * Admin view for ?state=all: active (pos ASC) then archived (newest first),
   * including archived rows. Never mirrored — the KV snapshot stays active-only
   * so a public read cannot leak them.
   */
  async getRoadmapAll(): Promise<RoadmapMirror> {
    const items = [
      ...this.ctx.storage.sql
        .exec<RoadmapItem>(`SELECT ${ROADMAP_COLS} FROM roadmap_items WHERE archived_at IS NULL ORDER BY pos ASC`)
        .toArray(),
      ...this.ctx.storage.sql
        .exec<RoadmapItem>(`SELECT ${ROADMAP_COLS} FROM roadmap_items WHERE archived_at IS NOT NULL ORDER BY archived_at DESC`)
        .toArray(),
    ];
    return { version: this.getRoadmapVersion(), items };
  }

  private broadcast(event: 'entry' | 'update' | 'roadmap', payload: Entry | RoadmapMirror) {
    const frame = this.encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    for (const controller of this.clients) {
      try {
        controller.enqueue(frame);
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

    // GET / — mirror read with pagination
    if (req.method === 'GET' && url.pathname === '/') {
      const raw = await env.ANNOUNCEMENTS.get('entries');
      let entries: Entry[];
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        entries = Array.isArray(parsed)
          ? parsed.map((entry) => ({ ...entry, topic: normalizeTopic(entry.topic) }))
          : [];
      } catch {
        entries = [];
      }
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
      const sliced = entries.slice(offset, offset + limit);
      return json({ entries: sliced, total: entries.length, hasMore: offset + limit < entries.length });
    }

    if (req.method === 'GET' && url.pathname === '/feed.atom') {
      const raw = await env.ANNOUNCEMENTS.get('entries');
      let entries: Entry[];
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        entries = Array.isArray(parsed)
          ? parsed.map((entry) => ({ ...entry, topic: normalizeTopic(entry.topic) }))
          : [];
      } catch {
        entries = [];
      }
      const xml = buildFeedXml(entries);
      const etag = etagForFeed(xml);
      const inm = req.headers.get('If-None-Match');
      if (inm && inm === etag) {
        return new Response(null, {
          status: 304,
          headers: { ETag: etag, 'Cache-Control': 'public, max-age=300', ...CORS },
        });
      }
      return new Response(xml, {
        status: 200,
        headers: {
          'Content-Type': 'application/atom+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          ETag: etag,
          ...CORS,
        },
      });
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      return env.LOG_HUB.getByName('hub').fetch(req);
    }

    // ---- Roadmap -------------------------------------------------------------
    // Kept ahead of the generic PATCH/DELETE entry handlers below so
    // /roadmap/:id can never be mistaken for an entry id.
    if (url.pathname === '/roadmap' || url.pathname.startsWith('/roadmap/')) {
      try {
        const hub = env.LOG_HUB.getByName('hub');

        // GET /roadmap — public read of the KV mirror (active items only).
        // ?state=all is the sole archived-item path and is Bearer-gated via the DO.
        if (req.method === 'GET' && url.pathname === '/roadmap') {
          const stateParam = url.searchParams.get('state') ?? 'active';
          let mirror: RoadmapMirror;
          if (stateParam === 'active') {
            mirror = readRoadmapMirror(await env.ANNOUNCEMENTS.get('roadmap'));
          } else if (stateParam === 'all') {
            const auth = req.headers.get('Authorization') ?? '';
            if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
              return json({ error: 'Unauthorized' }, 401);
            }
            mirror = await hub.getRoadmapAll();
          } else if (ROADMAP_STATES.has(stateParam)) {
            const source = readRoadmapMirror(await env.ANNOUNCEMENTS.get('roadmap'));
            mirror = {
              version: source.version,
              items: source.items.filter((item) => item.state === stateParam),
            };
          } else {
            return json(
              { error: `state must be one of: active, all, ${[...ROADMAP_STATES].join(', ')}` },
              400
            );
          }

          const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
          const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
          const sliced = mirror.items.slice(offset, offset + limit);
          return json({
            items: sliced,
            total: mirror.items.length,
            hasMore: offset + limit < mirror.items.length,
            version: mirror.version,
          });
        }

        // POST /roadmap — create (Bearer).
        if (req.method === 'POST' && url.pathname === '/roadmap') {
          const auth = req.headers.get('Authorization') ?? '';
          if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
            return json({ error: 'Unauthorized' }, 401);
          }

          let body: unknown;
          try {
            body = await req.json();
          } catch {
            return json({ error: 'Invalid JSON' }, 400);
          }
          if (!isPlainObject(body)) return json({ error: 'Invalid JSON' }, 400);

          const item = await hub.createRoadmapItem({
            title: asTitle(body.title),
            state: body.state === undefined ? 'idea' : asRoadmapState(body.state),
            topic: asTopicOrNull(body.topic),
            essence_hex: asHexOrNull(body.essence_hex),
            blocked_reason: asBlockedOrNull(body.blocked_reason),
          });
          return json(item, 201);
        }

        // PUT /roadmap/order — full-array rewrite under optimistic versioning (Bearer).
        if (req.method === 'PUT' && url.pathname === '/roadmap/order') {
          const auth = req.headers.get('Authorization') ?? '';
          if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
            return json({ error: 'Unauthorized' }, 401);
          }

          let body: unknown;
          try {
            body = await req.json();
          } catch {
            return json({ error: 'Invalid JSON' }, 400);
          }
          if (!isPlainObject(body)) return json({ error: 'Invalid JSON' }, 400);
          if (typeof body.version !== 'number' || !Number.isInteger(body.version)) {
            return json({ error: 'version must be an integer' }, 400);
          }
          if (!Array.isArray(body.items) || body.items.some((id) => typeof id !== 'string' || !id)) {
            return json({ error: 'items must be an array of non-empty ids' }, 400);
          }

          const result = await hub.reorderRoadmap(body.version, body.items as string[]);
          if (!result.ok) {
            if (result.reason === 'version_mismatch') {
              // Current state rides along so the client can rebase in one round-trip.
              return json(
                { error: 'version_mismatch', version: result.current.version, items: result.current.items },
                409
              );
            }
            return json({ error: result.error }, 400);
          }
          return json(result.payload);
        }

        // PATCH /roadmap/:id — strict partial update or archive (Bearer).
        if (req.method === 'PATCH' && url.pathname.startsWith('/roadmap/')) {
          const auth = req.headers.get('Authorization') ?? '';
          if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
            return json({ error: 'Unauthorized' }, 401);
          }

          const id = url.pathname.slice('/roadmap/'.length);
          if (!id || id.includes('/') || id === 'order') return json({ error: 'id required' }, 400);

          let body: Record<string, unknown>;
          try {
            body = await req.json();
          } catch {
            return json({ error: 'Invalid JSON' }, 400);
          }
          if (!isPlainObject(body)) return json({ error: 'Invalid JSON' }, 400);

          const unknown = Object.keys(body).filter((key) => !ROADMAP_PATCH_FIELDS.has(key));
          if (unknown.length) return json({ error: `unknown field(s): ${unknown.join(', ')}` }, 400);
          if (!Object.keys(body).length) return json({ error: 'empty patch' }, 400);

          const patch: {
            title?: string;
            topic?: string | null;
            state?: RoadmapState;
            essence_hex?: string | null;
            blocked_reason?: string | null;
            archived?: boolean;
          } = {};
          if (body.title !== undefined) patch.title = asTitle(body.title);
          if (body.topic !== undefined) patch.topic = asTopicOrNull(body.topic);
          if (body.state !== undefined) patch.state = asRoadmapState(body.state);
          if (body.essence_hex !== undefined) patch.essence_hex = asHexOrNull(body.essence_hex);
          if (body.blocked_reason !== undefined) patch.blocked_reason = asBlockedOrNull(body.blocked_reason);
          const archived = body.archived ?? body.archive;
          if (archived !== undefined) {
            if (typeof archived !== 'boolean') return json({ error: 'archived must be a boolean' }, 400);
            patch.archived = archived;
          }

          const item = await hub.patchRoadmapItem(id, patch);
          if (!item) return json({ error: 'Not found' }, 404);
          return json(item);
        }

        // DELETE /roadmap/:id — hard delete (Bearer).
        if (req.method === 'DELETE' && url.pathname.startsWith('/roadmap/')) {
          const auth = req.headers.get('Authorization') ?? '';
          if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
            return json({ error: 'Unauthorized' }, 401);
          }

          const id = url.pathname.slice('/roadmap/'.length);
          if (!id || id.includes('/') || id === 'order') return json({ error: 'id required' }, 400);

          const removed = await hub.removeRoadmapItem(id);
          if (!removed) return json({ error: 'Not found' }, 404);
          return json({ ok: true });
        }

        return json({ error: 'Not found' }, 404);
      } catch (err) {
        if (err instanceof RequestError) return json({ error: err.message }, err.status);
        throw err;
      }
    }

    if (req.method === 'PUT' && url.pathname === '/') {
      const auth = req.headers.get('Authorization') ?? '';
      if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
        return json({ error: 'Unauthorized' }, 401);
      }

      let body: { title?: unknown; body?: unknown; type?: unknown; topic?: unknown; link?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }

      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      const type = typeof body.type === 'string' && body.type ? body.type : 'update';
      const topic = body.topic == null || (typeof body.topic === 'string' && !body.topic.trim())
        ? DEFAULT_TOPIC
        : typeof body.topic === 'string' ? body.topic.trim() : '';
      const link = typeof body.link === 'string' && body.link.trim() ? body.link.trim() : undefined;

      if (!title || !text) {
        return json({ error: 'title and body required' }, 400);
      }
      if (title.length > MAX_TITLE || text.length > MAX_BODY) {
        return json({ error: `title max ${MAX_TITLE} chars, body max ${MAX_BODY}` }, 413);
      }
      if (link && link.length > MAX_LINK) {
        return json({ error: `link max ${MAX_LINK} chars` }, 413);
      }
      if (!TYPES.has(type)) {
        return json({ error: `type must be one of: ${[...TYPES].join(', ')}` }, 400);
      }
      if (!TOPICS.has(topic)) {
        return json({ error: `topic must be one of: ${[...TOPICS].join(', ')}` }, 400);
      }

      const entry = await env.LOG_HUB.getByName('hub').addEntry({ title, body: text, type, topic, link });
      return json(entry, 201);
    }

    if (req.method === 'PATCH' && url.pathname !== '/') {
      const auth = req.headers.get('Authorization') ?? '';
      if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
        return json({ error: 'Unauthorized' }, 401);
      }

      let body: { topic?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }

      const topic = body.topic == null || (typeof body.topic === 'string' && !body.topic.trim())
        ? DEFAULT_TOPIC
        : typeof body.topic === 'string' ? body.topic.trim() : '';
      if (!TOPICS.has(topic)) {
        return json({ error: `topic must be one of: ${[...TOPICS].join(', ')}` }, 400);
      }

      const id = url.pathname.slice(1);
      if (!id) return json({ error: 'id required' }, 400);

      const entry = await env.LOG_HUB.getByName('hub').updateTopic(id, topic);
      if (!entry) return json({ error: 'Not found' }, 404);
      return json(entry);
    }

    // DELETE /:id — remove entry from SQLite + KV mirror
    if (req.method === 'DELETE') {
      const auth = req.headers.get('Authorization') ?? '';
      if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const id = url.pathname.replace('/', '');
      if (!id) return json({ error: 'id required' }, 400);

      const deleted = await env.LOG_HUB.getByName('hub').removeEntry(id);
      if (!deleted) return json({ error: 'Not found' }, 404);
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  },
};
