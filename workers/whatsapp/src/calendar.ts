import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { admit, type ContactState, type LimitReason } from './limits';
import { minutesFor } from './booking';
import {
  bookingConfig,
  bogotaDateKey,
  freeSlots,
} from './schedule';
import {
  accessToken,
  deleteEvent,
  freeBusy,
  getEvent,
  insertEvent,
  listEvents,
  patchEvent,
  HOLD_PREFIX,
  type BusyBlock,
  type CalEvent,
  type GoogleOAuth,
} from './google';

/** A consultation hold expires 24 hours after it was created. */
export const HOLD_MS = 24 * 3600 * 1000;

const DAY_MS = 86400000;

function googleOAuth(env: Env): GoogleOAuth | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
    return null;
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_REFRESH_TOKEN,
  };
}

export interface ActiveInfo {
  eventId: string;
  start: string;
  end: string;
  kind: 'hold' | 'booked';
  service: string;
  createdAt: number;
}

interface Row {
  key: string;
  event_id: string;
  start: string;
  end: string;
  kind: string;
  service: string;
  status: string;
  created_at: number;
  day_key: string;
  expired_at: number | null;
}

interface ContactRow {
  key: string;
  last_free_call: number | null;
  moves: number;
  updated_at: number;
}

type Sql = {
  exec(query: string, ...params: unknown[]): { toArray(): unknown[] };
};

/** The owner owns the hold prefix: strip whatever the caller sent and re-add it by row kind. */
function holdSummary(summary: string, hold: boolean): string {
  const bare = summary.startsWith(HOLD_PREFIX) ? summary.slice(HOLD_PREFIX.length) : summary;
  return (hold ? HOLD_PREFIX : '') + bare;
}

function asRows(value: unknown[]): Row[] {
  return value as Row[];
}

function asContacts(value: unknown[]): ContactRow[] {
  return value as ContactRow[];
}

/**
 * The one serialized owner of every Workbench calendar write. All client
 * conversations reach the calendar through this object (`Calendar` bound
 * under the fixed name `calendar`), and every mutating op runs inside a
 * single promise chain so a check-then-create race has exactly one winner:
 * the slot is re-checked free at write time and the loser gets `slot-taken`.
 * The calendar stays the source of truth: `verify` reconciles our rows with
 * the listing, so an event the operator deleted or confirmed by hand never
 * leaves the limits counting a booking that no longer exists.
 */
export class Calendar extends DurableObject<Env> {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ensureSchema();
    });
  }

  private ensureSchema(): void {
    const sql = this.ctx.storage.sql as unknown as Sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        key TEXT PRIMARY KEY,
        last_free_call INTEGER,
        moves INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )
    `);
    sql.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        key TEXT NOT NULL,
        event_id TEXT NOT NULL UNIQUE,
        start TEXT NOT NULL,
        end TEXT NOT NULL,
        kind TEXT NOT NULL,
        service TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        day_key TEXT NOT NULL,
        expired_at INTEGER
      )
    `);
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn) as Promise<T>;
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async fetch(req: Request): Promise<Response> {
    this.ensureSchema();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false, reason: 'calendar-down' }, { status: 400 });
    }
    const action = (body as { action?: unknown }).action;
    try {
      if (typeof body !== 'object' || body === null || typeof action !== 'string') {
        return Response.json({ ok: false, reason: 'calendar-down' }, { status: 400 });
      }
      const args = body as Record<string, unknown>;
      switch (action) {
        case 'status':
          return Response.json(await this.serial(() => this.opStatus(args)));
        case 'quote':
          return Response.json(await this.serial(() => this.opQuote(args)));
        case 'reserve':
          return Response.json(await this.serial(() => this.opReserve(args)));
        case 'cancel':
          return Response.json(await this.serial(() => this.opCancel(args)));
        case 'move':
          return Response.json(await this.serial(() => this.opMove(args)));
        case 'confirm':
          return Response.json(await this.serial(() => this.opConfirm(args)));
        case 'release':
          return Response.json(await this.serial(() => this.opRelease(args)));
        case 'expire':
          return Response.json(await this.serial(() => this.opExpire(args)));
        case 'erase':
          return Response.json(await this.serial(() => this.opErase(args)));
        default:
          return Response.json({ ok: false, reason: 'calendar-down' }, { status: 400 });
      }
    } catch {
      return Response.json({ ok: false, reason: 'calendar-down' });
    }
  }

  private sql(): Sql {
    return this.ctx.storage.sql as unknown as Sql;
  }

  private getContact(key: string): ContactRow | null {
    const rows = asContacts(
      this.sql()
        .exec('SELECT key, last_free_call, moves, updated_at FROM contacts WHERE key = ? LIMIT 1', key)
        .toArray()
    );
    return rows.length > 0 ? rows[0] : null;
  }

  private putContact(row: ContactRow): void {
    this.sql().exec(
      'INSERT INTO contacts (key, last_free_call, moves, updated_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET last_free_call = excluded.last_free_call, ' +
        'moves = excluded.moves, updated_at = excluded.updated_at',
      row.key,
      row.last_free_call,
      row.moves,
      row.updated_at
    );
  }

  private activeFor(key: string): Row | null {
    const rows = asRows(
      this.sql()
        .exec(
          "SELECT key, event_id, start, end, kind, service, status, created_at, day_key, expired_at " +
            "FROM reservations WHERE key = ? AND status = 'active' LIMIT 1",
          key
        )
        .toArray()
    );
    return rows.length > 0 ? rows[0] : null;
  }

  private allActive(): Row[] {
    return asRows(
      this.sql()
        .exec(
          "SELECT key, event_id, start, end, kind, service, status, created_at, day_key, expired_at " +
            "FROM reservations WHERE status = 'active'"
        )
        .toArray()
    );
  }

  private expiredFor(key: string): number[] {
    return asRows(
      this.sql()
        .exec(
          "SELECT key, event_id, start, end, kind, service, status, created_at, day_key, expired_at " +
            "FROM reservations WHERE key = ? AND status = 'expired'",
          key
        )
        .toArray()
    )
      .map((r) => r.expired_at)
      .filter((t): t is number => typeof t === 'number');
  }

  private countCreated(dayKey: string): number {
    return asRows(
      this.sql()
        .exec(
          'SELECT key, event_id, start, end, kind, service, status, created_at, day_key, expired_at ' +
            'FROM reservations WHERE day_key = ?',
          dayKey
        )
        .toArray()
    ).filter((r) => r.status !== 'stale').length;
  }

  /** Reconcile our active rows with the calendar listing. */
  private verify(listing: CalEvent[]): void {
    const byId = new Map(listing.map((e) => [e.id, e]));
    for (const row of this.allActive()) {
      const ev = byId.get(row.event_id);
      if (!ev) {
        this.sql().exec("UPDATE reservations SET status = 'stale' WHERE event_id = ?", row.event_id);
      } else if (row.kind === 'hold' && !ev.summary.startsWith(HOLD_PREFIX)) {
        this.sql().exec("UPDATE reservations SET kind = 'booked' WHERE event_id = ?", row.event_id);
      }
    }
  }

  /** Drop records older than the longest limit window. */
  private prune(cutoff: number): void {
    this.sql().exec(
      "DELETE FROM reservations WHERE status IN ('released', 'expired', 'stale') AND created_at < ?",
      cutoff
    );
    const actives = new Set(this.allActive().map((r) => r.key));
    const contacts = asContacts(this.sql().exec('SELECT key, last_free_call, moves, updated_at FROM contacts').toArray());
    for (const c of contacts) {
      if (c.updated_at < cutoff && !actives.has(c.key)) {
        this.sql().exec('DELETE FROM contacts WHERE key = ?', c.key);
        this.sql().exec('DELETE FROM reservations WHERE key = ?', c.key);
      }
    }
  }

  private contactState(key: string): ContactState {
    const c = this.getContact(key);
    return {
      hasActive: this.activeFor(key) !== null,
      lastFreeCallMs: c?.last_free_call ?? null,
      expiredHoldsMs: this.expiredFor(key),
      moves: c?.moves ?? 0,
    };
  }

  private async listing(
    oauth: GoogleOAuth,
    wbId: string,
    now: number,
    horizonDays: number
  ): Promise<{ busy: BusyBlock[]; events: CalEvent[] } | null> {
    try {
      const token = await accessToken(oauth);
      const timeMin = new Date(now).toISOString();
      const timeMax = new Date(now + horizonDays * DAY_MS).toISOString();
      const busy = await freeBusy(token, timeMin, timeMax, ['primary']);
      const events = await listEvents(token, wbId, timeMin, timeMax);
      return { busy, events };
    } catch {
      return null;
    }
  }

  private quote(
    service: string,
    minutes: number,
    now: number,
    busy: BusyBlock[],
    events: CalEvent[]
  ): string[] {
    const cfg = bookingConfig(this.env);
    const extra = this.allActive().map((r) => ({ start: r.start, end: r.end }));
    return freeSlots(cfg, busy, [...events, ...extra], minutes, now);
  }

  private async opStatus(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = typeof args.contactKey === 'string' ? args.contactKey : '';
    const service = typeof args.service === 'string' ? args.service : 'consultation';
    const minutes = typeof args.minutes === 'number' ? args.minutes : minutesFor(service);
    const now = typeof args.now === 'number' ? args.now : Date.now();
    if (!key) return { ok: false, reason: 'calendar-down' };
    const oauth = googleOAuth(this.env);
    const wbId = this.env.WORKBENCH_CALENDAR_ID;
    if (!oauth || !wbId) return { ok: false, reason: 'calendar-down' };
    const cfg = bookingConfig(this.env);
    const live = await this.listing(oauth, wbId, now, cfg.horizonDays);
    if (!live) return { ok: false, reason: 'calendar-down' };
    this.verify(live.events);
    this.prune(now - Math.max(cfg.freeCallDays, cfg.expiredHoldDays) * DAY_MS);
    const active = this.activeFor(key);
    if (active && args.forMove === true) {
      // A move re-offers around the booking being replaced: the moves cap
      // still applies, but new-creation caps do not, and the quote excludes
      // the event and row being replaced.
      const contact = this.contactState(key);
      if (contact.moves >= cfg.movesMax) {
        return { ok: false, reason: 'moves' };
      }
      const events = live.events.filter((e) => e.id !== active.event_id);
      const extra = this.allActive()
        .filter((r) => r.event_id !== active.event_id)
        .map((r) => ({ start: r.start, end: r.end }));
      return {
        ok: true,
        active: {
          eventId: active.event_id,
          start: active.start,
          end: active.end,
          kind: active.kind === 'booked' ? 'booked' : 'hold',
          service: active.service,
          createdAt: active.created_at,
        } satisfies ActiveInfo,
        slots: freeSlots(cfg, live.busy, [...events, ...extra], minutes, now),
      };
    }
    if (active) {
      return {
        ok: true,
        active: {
          eventId: active.event_id,
          start: active.start,
          end: active.end,
          kind: active.kind === 'booked' ? 'booked' : 'hold',
          service: active.service,
          createdAt: active.created_at,
        } satisfies ActiveInfo,
        slots: [],
      };
    }
    const contact = this.contactState(key);
    const openHolds = this.allActive().filter((r) => r.kind === 'hold').length;
    const hold = service === 'consultation';
    const decision = admit(cfg, now, contact, openHolds, this.countCreated(bogotaDateKey(now)), {
      service,
      hold,
      move: false,
    });
    if (!decision.ok) {
      return { ok: false, reason: (decision as { reason: LimitReason }).reason };
    }
    return { ok: true, active: null, slots: this.quote(service, minutes, now, live.busy, live.events) };
  }

  /**
   * Public slot read: the free first-call slots under the same configuration
   * and rules as the agent's offers, with no contact admitted and no model
   * anywhere in the path.
   */
  private async opQuote(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const now = typeof args.now === 'number' ? args.now : Date.now();
    const oauth = googleOAuth(this.env);
    const wbId = this.env.WORKBENCH_CALENDAR_ID;
    if (!oauth || !wbId) return { ok: false, reason: 'calendar-down' };
    const cfg = bookingConfig(this.env);
    const live = await this.listing(oauth, wbId, now, cfg.horizonDays);
    if (!live) return { ok: false, reason: 'calendar-down' };
    this.verify(live.events);
    this.prune(now - Math.max(cfg.freeCallDays, cfg.expiredHoldDays) * DAY_MS);
    return { ok: true, slots: this.quote('first-call', 15, now, live.busy, live.events) };
  }

  private async opReserve(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = typeof args.contactKey === 'string' ? args.contactKey : '';
    const service = typeof args.service === 'string' ? args.service : 'consultation';
    const startIso = typeof args.startIso === 'string' ? args.startIso : '';
    const minutes = typeof args.minutes === 'number' ? args.minutes : minutesFor(service);
    const summary = typeof args.summary === 'string' ? args.summary : service;
    const description = typeof args.description === 'string' ? args.description : '';
    const attendee = typeof args.attendee === 'string' && args.attendee ? args.attendee : undefined;
    const conference = args.conference === true;
    const sendUpdates = args.sendUpdates === 'all' ? 'all' : 'none';
    const now = typeof args.now === 'number' ? args.now : Date.now();
    if (!key || !startIso) return { ok: false, reason: 'calendar-down' };
    const oauth = googleOAuth(this.env);
    const wbId = this.env.WORKBENCH_CALENDAR_ID;
    if (!oauth || !wbId) return { ok: false, reason: 'calendar-down' };
    const cfg = bookingConfig(this.env);
    const live = await this.listing(oauth, wbId, now, cfg.horizonDays);
    if (!live) return { ok: false, reason: 'calendar-down' };
    this.verify(live.events);
    this.prune(now - Math.max(cfg.freeCallDays, cfg.expiredHoldDays) * DAY_MS);
    if (this.activeFor(key)) {
      return { ok: false, reason: 'existing' satisfies LimitReason };
    }
    const contact = this.contactState(key);
    const openHolds = this.allActive().filter((r) => r.kind === 'hold').length;
    const hold = service === 'consultation';
    const decision = admit(cfg, now, contact, openHolds, this.countCreated(bogotaDateKey(now)), {
      service,
      hold,
      move: false,
    });
    if (!decision.ok) {
      return { ok: false, reason: (decision as { reason: LimitReason }).reason };
    }
    const slots = this.quote(service, minutes, now, live.busy, live.events);
    if (!slots.includes(startIso)) {
      return { ok: false, reason: 'slot-taken' satisfies LimitReason };
    }
    const endIso = new Date(Date.parse(startIso) + minutes * 60000).toISOString();
    let created: CalEvent;
    try {
      const token = await accessToken(oauth);
      created = await insertEvent(
        token,
        wbId,
        {
          summary: holdSummary(summary, hold),
          description,
          startIso,
          endIso,
          attendee,
          conference,
        },
        undefined,
        sendUpdates
      );
    } catch {
      return { ok: false, reason: 'calendar-down' };
    }
    this.sql().exec(
      'INSERT INTO reservations (key, event_id, start, end, kind, service, status, created_at, day_key, expired_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      key,
      created.id,
      startIso,
      endIso,
      hold ? 'hold' : 'booked',
      service,
      'active',
      now,
      bogotaDateKey(now),
      null
    );
    const prev = this.getContact(key);
    this.putContact({
      key,
      last_free_call: service === 'first-call' ? now : (prev?.last_free_call ?? null),
      moves: 0,
      updated_at: now,
    });
    return { ok: true, eventId: created.id, start: startIso, end: endIso, kind: hold ? 'hold' : 'booked', meet: created.hangoutLink ?? '' };
  }
  /**
   * Public booking cancel: the web cancel link carries the contact and the
   * exact booked start; a mismatch is no-booking, a started call is gone,
   * and the delete notifies the guest like the booking did.
   */
  private async opCancel(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = typeof args.contactKey === 'string' ? args.contactKey : '';
    const startIso = typeof args.startIso === 'string' ? args.startIso : '';
    const now = typeof args.now === 'number' ? args.now : Date.now();
    if (!key || !startIso) return { ok: false, reason: 'calendar-down' };
    const oauth = googleOAuth(this.env);
    const wbId = this.env.WORKBENCH_CALENDAR_ID;
    if (!oauth || !wbId) return { ok: false, reason: 'calendar-down' };
    const row = this.activeFor(key);
    if (!row || row.start !== startIso) return { ok: false, reason: 'no-booking' };
    if (now >= Date.parse(row.start)) return { ok: false, reason: 'started' };
    try {
      const token = await accessToken(oauth);
      // A failed delete must not report a cancellation: the guest would keep
      // the invitation. Leave the row active so confirming again still works.
      await deleteEvent(token, wbId, row.event_id, undefined, 'all');
      this.sql().exec("UPDATE reservations SET status = 'released' WHERE event_id = ?", row.event_id);
      return { ok: true, start: row.start };
    } catch {
      return { ok: false, reason: 'calendar-down' };
    }
  }

  private async opMove(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = typeof args.contactKey === 'string' ? args.contactKey : '';
    const startIso = typeof args.startIso === 'string' ? args.startIso : '';
    const minutes = typeof args.minutes === 'number' ? args.minutes : 60;
    const summary = typeof args.summary === 'string' ? args.summary : '';
    const description = typeof args.description === 'string' ? args.description : '';
    const now = typeof args.now === 'number' ? args.now : Date.now();
    if (!key || !startIso) return { ok: false, reason: 'calendar-down' };
    const oauth = googleOAuth(this.env);
    const wbId = this.env.WORKBENCH_CALENDAR_ID;
    if (!oauth || !wbId) return { ok: false, reason: 'calendar-down' };
    const active = this.activeFor(key);
    if (!active) return { ok: false, reason: 'no-booking' };
    const cfg = bookingConfig(this.env);
    const contact = this.contactState(key);
    const hold = active.kind !== 'booked';
    const decision = admit(cfg, now, contact, 0, 0, { service: active.service, hold, move: true });
    if (!decision.ok) {
      return { ok: false, reason: (decision as { reason: LimitReason }).reason };
    }
    const live = await this.listing(oauth, wbId, now, cfg.horizonDays);
    if (!live) return { ok: false, reason: 'calendar-down' };
    this.verify(live.events);
    const kept = this.activeFor(key);
    if (!kept || kept.event_id !== active.event_id) {
      return { ok: false, reason: 'slot-taken' satisfies LimitReason };
    }
    const events = live.events.filter((e) => e.id !== active.event_id);
    const extra = this.allActive()
      .filter((r) => r.event_id !== active.event_id)
      .map((r) => ({ start: r.start, end: r.end }));
    const slots = freeSlots(cfg, live.busy, [...events, ...extra], minutes, now);
    if (!slots.includes(startIso)) {
      return { ok: false, reason: 'slot-taken' satisfies LimitReason };
    }
    // The post-verify row is the truth: a hold the operator confirmed by
    // hand moves as a booking, and a moved hold restarts its 24 hours like
    // the old delete-and-recreate did.
    const kind = kept.kind === 'booked' ? 'booked' : 'hold';
    const endIso = new Date(Date.parse(startIso) + minutes * 60000).toISOString();
    let created: CalEvent;
    try {
      const token = await accessToken(oauth);
      created = await insertEvent(token, wbId, {
        summary: holdSummary(summary || active.service, kind === 'hold'),
        description,
        startIso,
        endIso,
      });
    } catch {
      return { ok: false, reason: 'calendar-down' };
    }
    try {
      const token = await accessToken(oauth);
      await deleteEvent(token, wbId, active.event_id);
    } catch {
      /* the old event is removed anyway from our rows; the operator sees both */
    }
    this.sql().exec('DELETE FROM reservations WHERE event_id = ?', active.event_id);
    this.sql().exec(
      'INSERT INTO reservations (key, event_id, start, end, kind, service, status, created_at, day_key, expired_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      key,
      created.id,
      startIso,
      endIso,
      kind,
      active.service,
      'active',
      kind === 'hold' ? now : active.created_at,
      active.day_key,
      null
    );
    const prev = this.getContact(key);
    this.putContact({
      key,
      last_free_call: prev?.last_free_call ?? null,
      moves: (prev?.moves ?? 0) + 1,
      updated_at: now,
    });
    return { ok: true, eventId: created.id, start: startIso, end: endIso, kind };
  }

  private async opConfirm(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = typeof args.contactKey === 'string' ? args.contactKey : '';
    const summary = typeof args.summary === 'string' ? args.summary : '';
    if (!key) return { ok: false, reason: 'calendar-down' };
    const oauth = googleOAuth(this.env);
    const wbId = this.env.WORKBENCH_CALENDAR_ID;
    if (!oauth || !wbId) return { ok: false, reason: 'calendar-down' };
    const active = this.activeFor(key);
    if (!active) return { ok: false, reason: 'no-booking' };
    try {
      const token = await accessToken(oauth);
      await patchEvent(token, wbId, active.event_id, { summary });
      this.sql().exec("UPDATE reservations SET kind = 'booked' WHERE event_id = ?", active.event_id);
      return { ok: true, eventId: active.event_id };
    } catch {
      return { ok: false, reason: 'calendar-down' };
    }
  }

  private async opRelease(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = typeof args.contactKey === 'string' ? args.contactKey : '';
    if (!key) return { ok: false, reason: 'calendar-down' };
    const oauth = googleOAuth(this.env);
    const wbId = this.env.WORKBENCH_CALENDAR_ID;
    if (!oauth || !wbId) return { ok: false, reason: 'calendar-down' };
    const active = this.activeFor(key);
    if (!active) return { ok: false, reason: 'no-booking' };
    try {
      const token = await accessToken(oauth);
      try {
        await deleteEvent(token, wbId, active.event_id);
      } catch {
        /* already gone */
      }
      this.sql().exec("UPDATE reservations SET status = 'released' WHERE event_id = ?", active.event_id);
      const prev = this.getContact(key);
      if (prev) {
        this.putContact({ key, last_free_call: prev.last_free_call, moves: 0, updated_at: Date.now() });
      }
      return { ok: true, eventId: active.event_id, start: active.start };
    } catch {
      return { ok: false, reason: 'calendar-down' };
    }
  }

  private async opExpire(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = typeof args.contactKey === 'string' ? args.contactKey : '';
    const now = typeof args.now === 'number' ? args.now : Date.now();
    if (!key) return { ok: false, reason: 'calendar-down' };
    const oauth = googleOAuth(this.env);
    const wbId = this.env.WORKBENCH_CALENDAR_ID;
    if (!oauth || !wbId) return { ok: false, reason: 'calendar-down' };
    const active = this.activeFor(key);
    if (!active) return { ok: true, expired: false, empty: true };
    try {
      const token = await accessToken(oauth);
      const ev = await getEvent(token, wbId, active.event_id);
      if (ev === null) {
        this.sql().exec("UPDATE reservations SET status = 'stale' WHERE event_id = ?", active.event_id);
        return { ok: true, expired: false, gone: true };
      }
      if (!ev.summary.startsWith(HOLD_PREFIX)) {
        this.sql().exec("UPDATE reservations SET kind = 'booked' WHERE event_id = ?", active.event_id);
        return { ok: true, expired: false, confirmed: true, start: active.start };
      }
      if (now < active.created_at + HOLD_MS) {
        return { ok: true, expired: false, pending: true };
      }
      try {
        await deleteEvent(token, wbId, active.event_id);
      } catch {
        /* already gone */
      }
      this.sql().exec("UPDATE reservations SET status = 'expired', expired_at = ? WHERE event_id = ?", now, active.event_id);
      const prev = this.getContact(key);
      if (prev) {
        this.putContact({ key, last_free_call: prev.last_free_call, moves: 0, updated_at: now });
      }
      return { ok: true, expired: true, eventId: active.event_id };
    } catch {
      return { ok: false, reason: 'calendar-down' };
    }
  }

  private async opErase(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const key = typeof args.contactKey === 'string' ? args.contactKey : '';
    if (!key) return { ok: false, reason: 'calendar-down' };
    this.sql().exec('DELETE FROM reservations WHERE key = ?', key);
    this.sql().exec('DELETE FROM contacts WHERE key = ?', key);
    return { ok: true };
  }
}
