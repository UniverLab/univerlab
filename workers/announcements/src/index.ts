/**
 * announcements.univerlab.org — Mission Log API
 *
 *   GET  /             → JSON array of entries (served from the KV mirror, edge-cheap)
 *   GET  /events       → SSE stream (pushes `event: entry|update|roadmap`)
 *   PUT  /             → Add entry, optionally linked via roadmap_id (Bearer)
 *   PATCH /:id         → Update an entry's topic and/or roadmap_id (Bearer)
 *   DELETE /:id        → Remove entry by id (Bearer token required)
 *
 *   GET  /roadmap       → roadmap items (KV mirror by default; DO behind ?private=1 / ?state=all)
 *   GET  /roadmap/:id   → one roadmap item + the announcements linked to it
 *   POST /roadmap       → Create a roadmap item (Bearer token required)
 *   PUT  /roadmap/order → Rewrite roadmap order, optimistic versioning (Bearer)
 *   PATCH /roadmap/:id  → Update/archive a roadmap item (Bearer token required)
 *   DELETE /roadmap/:id → Hard delete a roadmap item (Bearer token required)
 *
 * Public roadmap reads return public fields only: `summary`, `shipped_at` and
 * the per-item `entries` roll-up are public; `notes` and `refs` are PRIVATE and
 * exist only behind `?private=1` together with a valid Bearer token — without
 * one that query is a 401, never a silent public answer. The KV mirror and the
 * SSE frames never carry private fields, which is what keeps them off a page
 * anyone can read.
 *
 * Public reads stay KV-only (no DO hit): every write mirrors the latest entries
 * into KV key "entries" and active roadmap items into "roadmap", so GET / and
 * GET /roadmap stay edge-cheap. /events, writes, and authorised private /
 * ?state=all roadmap reads reach the LogHub DO, which owns SQLite, writes and
 * the SSE fan-out. The KV roadmap mirror holds active items only.
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
  /** Roadmap item this announcement reports on; absent when unlinked. */
  roadmap_id?: string | null;
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

/** Internal pointers on a roadmap item — never for the public page. */
type RoadmapRefKind = 'intelligence' | 'queue' | 'graph' | 'spec' | 'pr' | 'commit' | 'url';

/** PRIVATE. One line pointing at where the work actually lives. */
interface RoadmapRef {
  kind: RoadmapRefKind;
  id: string;
  label?: string;
}

/** Roll-up of the announcements linked to an item, computed at read time. */
interface EntriesSummary {
  count: number;
  last_date: string | null;
  last_id: string | null;
}

/** A public projection of an announcement, as listed under a roadmap item. */
interface LinkedAnnouncement {
  id: string;
  date: string;
  title: string;
  type: string;
}

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
  /** PUBLIC one-line summary for the status page. */
  summary: string | null;
  /** PUBLIC, server-managed: ISO instant state became `done`, null otherwise. */
  shipped_at: string | null;
  /** PRIVATE markdown. Absent on mirror rows — only DO reads carry it. */
  notes?: string | null;
  /** PRIVATE internal references. Absent on mirror rows, array in memory. */
  refs?: RoadmapRef[] | null;
  /** PUBLIC roll-up of linked announcements; attached on reads, never stored. */
  entries?: EntriesSummary;
};

/**
 * A `roadmap_items` row as SQLite hands it back: `refs` is still JSON text.
 * Kept separate from `RoadmapItem` because `exec<T>` only accepts columns a
 * query could actually return.
 */
type RoadmapRow = Omit<RoadmapItem, 'refs' | 'entries'> & { refs: string | null };

/** A row from the PUBLIC column list: no `notes`, no `refs`, nothing private. */
type PublicRoadmapRow = Omit<RoadmapItem, 'notes' | 'refs' | 'entries'>;

/** A roadmap item once its `entries` roll-up has been attached. */
type RoadmapWithEntries = RoadmapItem & { entries: EntriesSummary };

/** Value of KV key "roadmap": active items only, `pos` ascending. */
interface RoadmapMirror {
  version: number;
  items: RoadmapItem[];
}

/** What a public roadmap response may ever carry for an item — no `notes`/`refs`. */
type PublicRoadmapItem = Omit<RoadmapItem, 'notes' | 'refs'> & {
  entries: EntriesSummary;
};

/** A roadmap item as it goes out on the wire: private fields only behind ?private=1. */
type RoadmapResponseItem = PublicRoadmapItem & Partial<Pick<RoadmapItem, 'notes' | 'refs'>>;

const ROADMAP_STATES = new Set<string>(['idea', 'now', 'next', 'later', 'done']);
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_BLOCKED = 500;
const MAX_SUMMARY = 280;
const MAX_NOTES = 4000;
const MAX_REFS = 30;
const MAX_REF_ID = 300;
const MAX_REF_LABEL = 200;
const REF_KINDS = new Set<RoadmapRefKind>([
  'intelligence',
  'queue',
  'graph',
  'spec',
  'pr',
  'commit',
  'url',
]);
/**
 * The ONLY column list that may reach KV or SSE. `notes`/`refs` are deliberately
 * absent: the mirror is readable by anyone, so nothing private may be selected
 * here — and `toPublicRoadmapItem` re-checks it on the way out.
 */
export const ROADMAP_PUBLIC_COLS =
  'id, title, state, topic, essence_hex, blocked_reason, pos, archived_at, updatedAt, summary, shipped_at';
/** Everything, for reads behind `?private=1` only. */
export const ROADMAP_ALL_COLS = `${ROADMAP_PUBLIC_COLS}, notes, refs`;
/** One definition so a new entry column cannot be forgotten in one of four reads. */
export const ENTRY_COLS = 'id, date, title, body, type, topic, link, roadmap_id';
/** Fields POST /roadmap accepts; anything else is a 400, not a silent no-op. */
const ROADMAP_POST_FIELDS = new Set([
  'title',
  'state',
  'topic',
  'essence_hex',
  'blocked_reason',
  'summary',
  'notes',
  'refs',
]);
/**
 * Fields PATCH /roadmap/:id accepts. `shipped_at` is server-managed and stays
 * out of both sets, so sending it is a 400 by construction.
 */
const ROADMAP_PATCH_FIELDS = new Set([...ROADMAP_POST_FIELDS, 'archived', 'archive']);

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

/** The only switch that may expose `notes`/`refs`; anything else is public. */
function wantsPrivate(url: URL): boolean {
  return ['1', 'true'].includes((url.searchParams.get('private') ?? '').toLowerCase());
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

/** PUBLIC one-liner for the status page. Structure errors 400, oversize 413. */
function asSummaryOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new RequestError('summary must be a string', 400);
  const summary = value.trim();
  if (!summary) return null;
  if (summary.length > MAX_SUMMARY) throw new RequestError(`summary max ${MAX_SUMMARY} chars`, 413);
  return summary;
}

/** PRIVATE markdown for us. Same 400/413 split as `summary`. */
function asNotesOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new RequestError('notes must be a string', 400);
  const notes = value.trim();
  if (!notes) return null;
  if (notes.length > MAX_NOTES) throw new RequestError(`notes max ${MAX_NOTES} chars`, 413);
  return notes;
}

/**
 * PRIVATE reference list. Normalised to `{kind,id,label?}` — unknown keys in an
 * entry are rejected so a typo cannot silently become a dead reference.
 */
function asRefsOrNull(value: unknown): RoadmapRef[] | null {
  if (value == null || value === '') return null;
  if (!Array.isArray(value)) throw new RequestError('refs must be an array', 400);
  if (value.length > MAX_REFS) throw new RequestError(`refs max ${MAX_REFS} entries`, 413);

  const refs: RoadmapRef[] = [];
  value.forEach((raw, index) => {
    if (!isPlainObject(raw)) throw new RequestError(`refs[${index}] must be an object`, 400);
    const unknown = Object.keys(raw).filter((key) => key !== 'kind' && key !== 'id' && key !== 'label');
    if (unknown.length) throw new RequestError(`refs[${index}] unknown field(s): ${unknown.join(', ')}`, 400);
    if (typeof raw.kind !== 'string' || !REF_KINDS.has(raw.kind as RoadmapRefKind)) {
      throw new RequestError(`refs[${index}].kind must be one of: ${[...REF_KINDS].join(', ')}`, 400);
    }
    if (typeof raw.id !== 'string' || !raw.id.trim()) throw new RequestError(`refs[${index}] id required`, 400);
    const id = raw.id.trim();
    if (id.length > MAX_REF_ID) throw new RequestError(`refs[${index}].id max ${MAX_REF_ID} chars`, 413);

    const ref: RoadmapRef = { kind: raw.kind as RoadmapRefKind, id };
    if (raw.label != null && raw.label !== '') {
      if (typeof raw.label !== 'string') throw new RequestError(`refs[${index}].label must be a string`, 400);
      const label = raw.label.trim();
      if (label.length > MAX_REF_LABEL) throw new RequestError(`refs[${index}].label max ${MAX_REF_LABEL} chars`, 413);
      if (label) ref.label = label;
    }
    refs.push(ref);
  });
  return refs;
}

/**
 * An announcement's roadmap link: `null`/`''` unlinks, any other string must
 * name an item that exists. Returns the error text instead of throwing because
 * the entry handlers sit outside the roadmap block's RequestError → status catch.
 */
async function resolveRoadmapLink(
  value: unknown,
  exists: (id: string) => Promise<boolean>
): Promise<{ error: string } | { id: string | null }> {
  if (value == null || value === '') return { id: null };
  if (typeof value !== 'string') return { error: 'roadmap_id must be a string' };
  const id = value.trim();
  if (!id) return { id: null };
  if (!(await exists(id))) return { error: 'unknown roadmap_id' };
  return { id };
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

/** Tolerant read of the mirrored entries — used to roll up `entries` from KV. */
function readEntriesMirror(raw: string | null): Entry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Server-managed `shipped_at`: stamped the first time an item lands in `done`,
 * kept while it stays there, cleared the moment it leaves. Idempotent, so an
 * unrelated edit on a `done` item never restamps it. `prevState` is part of the
 * signature so call sites always name the transition they are computing.
 */
export function computeShippedAt(
  prevState: RoadmapState,
  nextState: RoadmapState,
  prevShippedAt: string | null,
  now: Date = new Date()
): string | null {
  if (nextState !== 'done') return null;
  return prevShippedAt ?? now.toISOString();
}

/**
 * Roll up linked announcements per roadmap id: `{count,last_date,last_id}`.
 * Rows without a `roadmap_id` are ignored. ISO dates compare lexicographically,
 * so the largest date is the newest; equal dates break on `id` DESC so the
 * public KV roll-up matches the DO's `ORDER BY date DESC, id DESC`.
 */
export function summarizeEntries(
  rows: Array<{ id: string; date: string; roadmap_id?: string | null }>
): Record<string, EntriesSummary> {
  const summary: Record<string, EntriesSummary> = {};
  for (const row of rows) {
    if (typeof row.roadmap_id !== 'string' || !row.roadmap_id) continue;
    let bucket = summary[row.roadmap_id];
    if (!bucket) {
      bucket = { count: 0, last_date: null, last_id: null };
      summary[row.roadmap_id] = bucket;
    }
    bucket.count += 1;
    if (
      bucket.last_date === null ||
      row.date > bucket.last_date ||
      (row.date === bucket.last_date && row.id > (bucket.last_id ?? ''))
    ) {
      bucket.last_date = row.date;
      bucket.last_id = row.id;
    }
  }
  return summary;
}

/**
 * The shape of every public roadmap response, rebuilt field by field: a poisoned
 * or legacy mirror row carrying `notes`/`refs` cannot leak through it, and old
 * mirror rows without the new columns read as `null` instead of `undefined`.
 */
export function toPublicRoadmapItem(item: RoadmapItem): PublicRoadmapItem {
  return {
    id: item.id,
    title: item.title,
    state: item.state,
    topic: item.topic ?? null,
    essence_hex: item.essence_hex ?? null,
    blocked_reason: item.blocked_reason ?? null,
    pos: item.pos ?? 0,
    archived_at: item.archived_at ?? null,
    updatedAt: item.updatedAt,
    summary: item.summary ?? null,
    shipped_at: item.shipped_at ?? null,
    entries: item.entries ?? { count: 0, last_date: null, last_id: null },
  };
}

/** SQLite stores `refs` as TEXT; reads hand back an array. Corrupt ⇒ null. */
function parseRefs(raw: RoadmapRef[] | string | null): RoadmapRef[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RoadmapRef[]) : null;
  } catch {
    return null;
  }
}

function serializeRefs(refs: RoadmapRef[] | null | undefined): string | null {
  return refs == null ? null : JSON.stringify(refs);
}

/** Row → object: `refs` arrives as JSON text, everything else already matches. */
function hydrateRoadmapItem(row: RoadmapRow): RoadmapItem {
  return { ...row, refs: parseRefs(row.refs) };
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
      if (!cols.some((c: any) => c.name === 'roadmap_id')) {
        this.ctx.storage.sql.exec('ALTER TABLE entries ADD COLUMN roadmap_id TEXT');
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
        // All nullable: a legacy row simply reads as "unset".
        summary: 'TEXT',
        notes: 'TEXT',
        refs: 'TEXT',
        shipped_at: 'TEXT',
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
  async addEntry(input: {
    title: string;
    body: string;
    type: string;
    topic: string;
    link?: string;
    roadmap_id?: string | null;
  }): Promise<Entry> {
    const entry: Entry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      title: input.title,
      body: input.body,
      type: input.type,
      topic: input.topic,
      ...(input.link ? { link: input.link } : {}),
      ...(input.roadmap_id ? { roadmap_id: input.roadmap_id } : {}),
    };

    this.ctx.storage.sql.exec(
      'INSERT INTO entries (id, date, title, body, type, topic, link, roadmap_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      entry.id,
      entry.date,
      entry.title,
      entry.body,
      entry.type,
      entry.topic,
      entry.link ?? null,
      entry.roadmap_id ?? null
    );

    const latest = this.ctx.storage.sql
      .exec<Omit<Entry, never>>(
        `SELECT ${ENTRY_COLS} FROM entries ORDER BY seq DESC LIMIT ?`,
        MIRROR_LIMIT
      )
      .toArray();

    // Persist first, broadcast second — a client must never see an entry that
    // did not make it into the mirror.
    await this.env.ANNOUNCEMENTS.put('entries', JSON.stringify(latest));
    this.broadcast('entry', entry);

    return entry;
  }

  /**
   * Patch an entry's metadata. Only the keys present in `patch` are written, so
   * a `roadmap_id`-only update cannot silently reclassify the announcement.
   */
  async updateEntryMeta(id: string, patch: { topic?: string; roadmap_id?: string | null }): Promise<Entry | null> {
    const set: string[] = [];
    const args: (string | null)[] = [];
    if (patch.topic !== undefined) {
      set.push('topic = ?');
      args.push(patch.topic);
    }
    if (patch.roadmap_id !== undefined) {
      set.push('roadmap_id = ?');
      args.push(patch.roadmap_id);
    }

    if (set.length) {
      const result = this.ctx.storage.sql.exec(
        `UPDATE entries SET ${set.join(', ')} WHERE id = ?`,
        ...args,
        id
      );
      if (result.rowsWritten === 0) return null;
    }

    const updated = this.ctx.storage.sql
      .exec<Omit<Entry, never>>(`SELECT ${ENTRY_COLS} FROM entries WHERE id = ?`, id)
      .toArray()[0];
    if (!updated) return null;

    const latest = this.ctx.storage.sql
      .exec<Omit<Entry, never>>(`SELECT ${ENTRY_COLS} FROM entries ORDER BY seq DESC LIMIT ?`, MIRROR_LIMIT)
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
        `SELECT ${ENTRY_COLS} FROM entries ORDER BY seq DESC LIMIT ?`,
        MIRROR_LIMIT
      )
      .toArray();

    await this.env.ANNOUNCEMENTS.put('entries', JSON.stringify(latest));
    return true;
  }

  /** Does this roadmap item exist? Used to validate an announcement's link. */
  async roadmapItemExists(id: string): Promise<boolean> {
    const rows = this.ctx.storage.sql
      .exec<{ one: number }>('SELECT 1 AS one FROM roadmap_items WHERE id = ?', id)
      .toArray();
    return rows.length > 0;
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
    // PUBLIC cols only: this snapshot is what lands in KV and on the SSE wire.
    const items = this.ctx.storage.sql
      .exec<PublicRoadmapRow>(`SELECT ${ROADMAP_PUBLIC_COLS} FROM roadmap_items WHERE archived_at IS NULL ORDER BY pos ASC`)
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
    summary: string | null;
    notes: string | null;
    refs: RoadmapRef[] | null;
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
      summary: input.summary,
      shipped_at: computeShippedAt('idea', input.state, null),
      notes: input.notes,
      refs: input.refs,
    };

    this.ctx.storage.sql.exec(
      `INSERT INTO roadmap_items (id, title, state, topic, essence_hex, blocked_reason, pos, archived_at, updatedAt, summary, notes, refs, shipped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      item.title,
      item.state,
      item.topic,
      item.essence_hex,
      item.blocked_reason,
      item.pos,
      item.archived_at,
      item.updatedAt,
      item.summary,
      item.notes,
      serializeRefs(item.refs),
      item.shipped_at
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
      summary?: string | null;
      notes?: string | null;
      refs?: RoadmapRef[] | null;
      archived?: boolean;
    }
  ): Promise<RoadmapItem | null> {
    const row = this.ctx.storage.sql
      .exec<RoadmapRow>(`SELECT ${ROADMAP_ALL_COLS} FROM roadmap_items WHERE id = ?`, id)
      .toArray()[0];
    if (!row) return null;
    const current = hydrateRoadmapItem(row);

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
      summary: patch.summary !== undefined ? patch.summary : current.summary,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
      refs: patch.refs !== undefined ? patch.refs : current.refs,
      // Stamped on entering `done`, cleared on leaving; unchanged otherwise.
      shipped_at: computeShippedAt(current.state, patch.state ?? current.state, current.shipped_at),
    };
    if (willArchive) next.archived_at = Date.now();
    if (willRestore) {
      next.archived_at = null;
      next.pos = this.nextRoadmapPos(); // unarchive appends at the end
    }

    this.ctx.storage.sql.exec(
      `UPDATE roadmap_items SET title = ?, state = ?, topic = ?, essence_hex = ?, blocked_reason = ?, pos = ?,
       archived_at = ?, updatedAt = ?, summary = ?, notes = ?, refs = ?, shipped_at = ? WHERE id = ?`,
      next.title,
      next.state,
      next.topic,
      next.essence_hex,
      next.blocked_reason,
      next.pos,
      next.archived_at,
      next.updatedAt,
      next.summary,
      next.notes,
      serializeRefs(next.refs),
      next.shipped_at,
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
   * Admin view for ?state=all and ?private=1: active (pos ASC) then archived
   * (newest first), including archived rows and the private fields. Never
   * mirrored — the KV snapshot stays active-only and public, so a public read
   * can leak neither an archived row nor `notes`/`refs`.
   */
  async getRoadmapAll(): Promise<{ version: number; items: RoadmapWithEntries[] }> {
    const rows = [
      ...this.ctx.storage.sql
        .exec<RoadmapRow>(`SELECT ${ROADMAP_ALL_COLS} FROM roadmap_items WHERE archived_at IS NULL ORDER BY pos ASC`)
        .toArray(),
      ...this.ctx.storage.sql
        .exec<RoadmapRow>(`SELECT ${ROADMAP_ALL_COLS} FROM roadmap_items WHERE archived_at IS NOT NULL ORDER BY archived_at DESC`)
        .toArray(),
    ];

    // Private counts are exact: they come from the full SQLite history, not the
    // ≤100-row mirror the public read rolls up from.
    const linked = this.ctx.storage.sql
      .exec<{ id: string; date: string; roadmap_id: string | null }>(
        'SELECT id, date, roadmap_id FROM entries WHERE roadmap_id IS NOT NULL ORDER BY date DESC, id DESC'
      )
      .toArray();
    const summary = summarizeEntries(linked);

    const items: RoadmapWithEntries[] = rows.map((row) => ({
      ...hydrateRoadmapItem(row),
      entries: summary[row.id] ?? { count: 0, last_date: null, last_id: null },
    }));
    return { version: this.getRoadmapVersion(), items };
  }

  /** One item (private fields included) plus the announcements linked to it. */
  async getRoadmapItem(
    id: string
  ): Promise<{ item: RoadmapItem; announcements: LinkedAnnouncement[]; entries: EntriesSummary } | null> {
    const row = this.ctx.storage.sql
      .exec<RoadmapRow>(`SELECT ${ROADMAP_ALL_COLS} FROM roadmap_items WHERE id = ?`, id)
      .toArray()[0];
    if (!row) return null;

    const announcements = this.ctx.storage.sql
      .exec<{ id: string; date: string; title: string; type: string }>(
        'SELECT id, date, title, type FROM entries WHERE roadmap_id = ? ORDER BY date DESC, id DESC',
        id
      )
      .toArray();

    const summary = summarizeEntries(
      announcements.map((entry) => ({ id: entry.id, date: entry.date, roadmap_id: id }))
    );
    return {
      item: hydrateRoadmapItem(row),
      announcements,
      entries: summary[id] ?? { count: 0, last_date: null, last_id: null },
    };
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

        // GET /roadmap — ?private=1 reads the DO (Bearer required: no valid
        // token means 401, never a silent public answer) and carries `notes` +
        // `refs`. Without it the answer is built from KV alone, so a public read
        // never reaches the DO — even when a token happens to be in the headers.
        // ?state=all keeps its old contract: Bearer-gated DO read, projected
        // back to public fields.
        if (req.method === 'GET' && url.pathname === '/roadmap') {
          const stateParam = url.searchParams.get('state') ?? 'active';
          const wantPrivate = wantsPrivate(url);
          const isLane = ROADMAP_STATES.has(stateParam);
          if (stateParam !== 'active' && stateParam !== 'all' && !isLane) {
            return json(
              { error: `state must be one of: active, all, ${[...ROADMAP_STATES].join(', ')}` },
              400
            );
          }

          const readsDo = wantPrivate || stateParam === 'all';
          if (readsDo) {
            const auth = req.headers.get('Authorization') ?? '';
            if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
              return json({ error: 'Unauthorized' }, 401);
            }
          }

          let items: RoadmapResponseItem[];
          let version: number;

          if (readsDo) {
            const source = await hub.getRoadmapAll(); // private cols + exact entries
            const selected = source.items.filter((item) => {
              if (stateParam === 'all') return true;
              if (stateParam === 'active') return item.archived_at === null;
              return item.state === stateParam;
            });
            version = source.version;
            items = wantPrivate ? selected : selected.map(toPublicRoadmapItem);
          } else {
            const source = readRoadmapMirror(await env.ANNOUNCEMENTS.get('roadmap'));
            const linked = readEntriesMirror(await env.ANNOUNCEMENTS.get('entries'));
            const summary = summarizeEntries(linked);
            version = source.version;
            items = source.items
              .filter((item) => stateParam === 'active' || item.state === stateParam)
              .map((item) => toPublicRoadmapItem({ ...item, entries: summary[item.id] ?? undefined }));
          }

          const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
          const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
          const sliced = items.slice(offset, offset + limit);
          return json({
            items: sliced,
            total: items.length,
            hasMore: offset + limit < items.length,
            version,
          });
        }

        // GET /roadmap/:id — one item plus the announcements that report on it.
        // Publicly the item must be in the KV mirror, so archived items are a
        // 404 until you ask for them with ?private=1.
        if (req.method === 'GET' && url.pathname.startsWith('/roadmap/')) {
          const id = url.pathname.slice('/roadmap/'.length);
          if (!id || id.includes('/') || id === 'order') return json({ error: 'id required' }, 400);

          if (wantsPrivate(url)) {
            const auth = req.headers.get('Authorization') ?? '';
            if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
              return json({ error: 'Unauthorized' }, 401);
            }
            const detail = await hub.getRoadmapItem(id);
            if (!detail) return json({ error: 'Not found' }, 404);
            return json({
              item: { ...detail.item, entries: detail.entries },
              announcements: detail.announcements,
            });
          }

          const mirror = readRoadmapMirror(await env.ANNOUNCEMENTS.get('roadmap'));
          const found = mirror.items.find((item) => item.id === id);
          if (!found) return json({ error: 'Not found' }, 404);

          const linked = readEntriesMirror(await env.ANNOUNCEMENTS.get('entries'));
          const summary = summarizeEntries(linked);
          // Same order as the DO query: date DESC, id DESC (id breaks ties).
          const announcements = linked
            .filter((entry) => entry.roadmap_id === id)
            .sort((a, b) =>
              a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0
            )
            .map((entry) => ({ id: entry.id, date: entry.date, title: entry.title, type: entry.type }));
          return json({
            item: toPublicRoadmapItem({ ...found, entries: summary[id] ?? undefined }),
            announcements,
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

          const unknown = Object.keys(body).filter((key) => !ROADMAP_POST_FIELDS.has(key));
          if (unknown.length) return json({ error: `unknown field(s): ${unknown.join(', ')}` }, 400);

          const item = await hub.createRoadmapItem({
            title: asTitle(body.title),
            state: body.state === undefined ? 'idea' : asRoadmapState(body.state),
            topic: asTopicOrNull(body.topic),
            essence_hex: asHexOrNull(body.essence_hex),
            blocked_reason: asBlockedOrNull(body.blocked_reason),
            summary: asSummaryOrNull(body.summary),
            notes: asNotesOrNull(body.notes),
            refs: asRefsOrNull(body.refs),
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
            summary?: string | null;
            notes?: string | null;
            refs?: RoadmapRef[] | null;
            archived?: boolean;
          } = {};
          if (body.title !== undefined) patch.title = asTitle(body.title);
          if (body.topic !== undefined) patch.topic = asTopicOrNull(body.topic);
          if (body.state !== undefined) patch.state = asRoadmapState(body.state);
          if (body.essence_hex !== undefined) patch.essence_hex = asHexOrNull(body.essence_hex);
          if (body.blocked_reason !== undefined) patch.blocked_reason = asBlockedOrNull(body.blocked_reason);
          if (body.summary !== undefined) patch.summary = asSummaryOrNull(body.summary);
          if (body.notes !== undefined) patch.notes = asNotesOrNull(body.notes);
          if (body.refs !== undefined) patch.refs = asRefsOrNull(body.refs);
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

      let body: {
        title?: unknown;
        body?: unknown;
        type?: unknown;
        topic?: unknown;
        link?: unknown;
        roadmap_id?: unknown;
      };
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

      const hub = env.LOG_HUB.getByName('hub');
      let roadmapId: string | null = null;
      if (isPlainObject(body) && 'roadmap_id' in body) {
        const resolved = await resolveRoadmapLink(body.roadmap_id, (candidate) => hub.roadmapItemExists(candidate));
        if ('error' in resolved) return json({ error: resolved.error }, 400);
        roadmapId = resolved.id;
      }

      const entry = await hub.addEntry({ title, body: text, type, topic, link, roadmap_id: roadmapId });
      return json(entry, 201);
    }

    if (req.method === 'PATCH' && url.pathname !== '/') {
      const auth = req.headers.get('Authorization') ?? '';
      if (!env.AUTH_TOKEN || !(await tokenMatches(auth, `Bearer ${env.AUTH_TOKEN}`))) {
        return json({ error: 'Unauthorized' }, 401);
      }

      let body: { topic?: unknown; roadmap_id?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }

      const hasTopic = isPlainObject(body) && 'topic' in body;
      const hasRoadmapId = isPlainObject(body) && 'roadmap_id' in body;

      // Neither key present → exactly today's behaviour: reclassify as general.
      // With `roadmap_id` present, `topic` is only touched if its key is too,
      // so re-linking an announcement cannot silently change its topic.
      let topic: string | undefined;
      if (hasTopic) {
        const value = body.topic == null || (typeof body.topic === 'string' && !body.topic.trim())
          ? DEFAULT_TOPIC
          : typeof body.topic === 'string' ? body.topic.trim() : '';
        if (!TOPICS.has(value)) {
          return json({ error: `topic must be one of: ${[...TOPICS].join(', ')}` }, 400);
        }
        topic = value;
      } else if (!hasRoadmapId) {
        topic = DEFAULT_TOPIC;
      }

      const hub = env.LOG_HUB.getByName('hub');
      let roadmapId: string | null | undefined;
      if (hasRoadmapId) {
        const resolved = await resolveRoadmapLink(body.roadmap_id, (candidate) => hub.roadmapItemExists(candidate));
        if ('error' in resolved) return json({ error: resolved.error }, 400);
        roadmapId = resolved.id;
      }

      const id = url.pathname.slice(1);
      if (!id) return json({ error: 'id required' }, 400);

      const patch: { topic?: string; roadmap_id?: string | null } = {};
      if (topic !== undefined) patch.topic = topic;
      if (roadmapId !== undefined) patch.roadmap_id = roadmapId;

      const entry = await hub.updateEntryMeta(id, patch);
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
