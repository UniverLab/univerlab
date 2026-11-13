import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { burstConfig } from './env';
import { burstDue, joinBurst, nextAlarm, type BurstState } from './burst';
import { cleanName, markRead, sendText, type Inbound } from './meta';
import { forwardUnread, isProofMedia, proofConfig, readProof } from './proof';
import { transcribe, voiceConfig, VOICE_HANDOFF } from './audio';
import { answer, FALLBACK, modelConfig, type Turn } from './brain';
import {
  burstLimit,
  capBurst,
  capTurn,
  guardConfig,
  GUARD_OVER,
  GUARD_PAUSED,
  guardHandoff,
  guardModelTake,
  guardQuietHold,
  isGuardOver,
  pausedNoticeDue,
  type PausedNotice,
} from './guard';
import { awayNotice, nextBusinessMorning } from './quiet';
import {
  brief,
  CONFIRM_SLOT,
  formatBrief,
  intake,
  INTAKE_ASK,
  INTAKE_FOLLOWUP,
  normalizeService,
  type IntakeState,
} from './intake';
import { detectLang, type Lang } from './lang';
import { OPENING } from './opening';
import {
  alarmAt,
  CONFIRM_MS,
  deletionRequest,
  ERASED,
  fuzzyDeletionRequest,
  isConfirmation,
  NOT_DELETED,
  operatorErased,
  PENDING_ERASE,
} from './erase';
import {
  bookingConfig,
  bogotaDateKey,
  formatSlot,
} from './schedule';
import {
  ask as reasonAsk,
  CAPTURE_MS,
  classify,
  closing as reasonClosing,
  complaintSays,
  fixed as reasonFixed,
  formatReasonNote,
  isCaptureReason,
  isDecline,
  nextCaptureStep,
  priorityOf,
  REASON_TAG,
  routeOf,
  type CaptureReason,
  type CaptureState,
} from './reasons';
import { HOLD_PREFIX } from './google';
import { contactKey, EXISTING, LIMIT_TEXT, SLOT_TAKEN } from './limits';
import { calendarCall, refuseAndHandOff, seedFromActive } from './reservations';
import type { ActiveInfo } from './calendar';
import { register, release, postNote, nameBase } from './registry';
import { noteBody } from './notices';
import {
  CALENDAR_DOWN,
  CANCELLED,
  CONFIRMED,
  decide,
  DELIVERED,
  EXPIRED,
  HOLD_SENT,
  minutesFor,
  MOVE_ONCE,
  offerText,
  paymentText,
  PICKED,
  renderBooking,
  serviceLabel,
  type BookingService,
  type BookingState,
} from './booking';

/** A consultation hold expires 24 hours after it was created. */
const HOLD_MS = 24 * 3600 * 1000;
/** While a hold is pending the alarm re-checks the calendar at least hourly. */
const HOLD_CHECK_MS = 3600 * 1000;

export const NON_TEXT = {
  es: 'Por ahora solo leo mensajes de texto. Le paso esto a una persona del laboratorio.',
  en: 'For now I only read text messages. I am passing this to someone at the lab.',
};

/** Read the capture state; corrupt or foreign content clears to null. */
function parseCapture(raw: string | null): CaptureState | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<CaptureState>;
    if (!isCaptureReason((p as { reason?: unknown }).reason as string)) return null;
    if (p.lang !== 'es' && p.lang !== 'en') return null;
    if (typeof p.phone !== 'string' || !p.phone) return null;
    if (typeof p.opening !== 'string') return null;
    if (!Array.isArray(p.answers)) return null;
    if (typeof p.updatedAt !== 'number' || !Number.isFinite(p.updatedAt)) return null;
    return {
      reason: p.reason as CaptureReason,
      lang: p.lang,
      phone: p.phone,
      name: typeof p.name === 'string' ? p.name : '',
      opening: p.opening,
      answers: p.answers.filter((a): a is string => typeof a === 'string').slice(0, 8),
      asks: typeof p.asks === 'number' && Number.isFinite(p.asks) ? p.asks : 0,
      updatedAt: p.updatedAt,
    };
  } catch {
    return null;
  }
}

export class Conversation extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ensureSchema();
    });
  }

  private ensureSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        role TEXT NOT NULL,
        type TEXT NOT NULL,
        text TEXT,
        media_id TEXT,
        mime TEXT
      )
    `);
    try {
      // Columns outlive the code that added them: old objects gain mime here.
      this.ctx.storage.sql.exec('ALTER TABLE messages ADD COLUMN mime TEXT');
    } catch {
      /* the column already exists */
    }
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS briefs (
        id INTEGER PRIMARY KEY,
        at INTEGER NOT NULL,
        phone TEXT NOT NULL,
        name TEXT NOT NULL,
        lang TEXT NOT NULL,
        service TEXT NOT NULL,
        bullets TEXT NOT NULL
      )
    `);
  }

  private state(key: string): string | null;
  private state(key: string, value: string | null): void;
  private state(key: string, value?: string | null): string | null | void {
    if (value === undefined) {
      const rows = this.ctx.storage.sql
        .exec('SELECT value FROM state WHERE key = ? LIMIT 1', key)
        .toArray() as Array<{ value: string }>;
      return rows.length > 0 ? rows[0].value : null;
    }
    if (value === null) {
      this.ctx.storage.sql.exec('DELETE FROM state WHERE key = ?', key);
    } else {
      this.ctx.storage.sql.exec(
        'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value
      );
    }
  }

  private briefs(
    id: number,
    at: number,
    phone: string,
    name: string,
    lang: string,
    service: string,
    bullets: string
  ): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO briefs (id, at, phone, name, lang, service, bullets) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET at = excluded.at, phone = excluded.phone, name = excluded.name, ' +
        'lang = excluded.lang, service = excluded.service, bullets = excluded.bullets',
      id,
      at,
      phone,
      name,
      lang,
      service,
      bullets
    );
  }

  private storeAssistant(at: number, id: string, text: string): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO messages (id, at, role, type, text, media_id) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      at,
      'assistant',
      'text',
      text,
      null
    );
  }

  /** The taken flag's conversation name, '' when absent or corrupt. */
  private takenName(): string {
    try {
      const raw = this.state('taken');
      if (!raw) return '';
      return ((JSON.parse(raw) as { name?: unknown }).name as string) ?? '';
    } catch {
      return '';
    }
  }

  /** The conversation language for fixed notices: intake, booking, else Spanish. */
  private guardLang: Lang = 'es';

  /** Every text-model call goes through here so the Worker-wide daily
   *  counter admits it first. Past the limit the call never runs and the
   *  burst falls back to the fixed sentence with a handoff. */
  private ai(): { run(model: string, input: unknown): Promise<unknown> } {
    const env = this.env;
    const self = this;
    return {
      run: async (model: string, input: unknown): Promise<unknown> => {
        if (!(await guardModelTake(env, self.guardLang))) throw new Error(GUARD_OVER);
        const run = env.AI.run.bind(env.AI) as (
          model: string,
          input: unknown
        ) => Promise<unknown>;
        return run(model, input);
      },
    };
  }

  private clientLang(): Lang {
    for (const key of ['intake', 'booking']) {
      try {
        const raw = this.state(key);
        if (raw) {
          const lang = (JSON.parse(raw) as { lang?: unknown }).lang;
          if (lang === 'es' || lang === 'en') return lang;
        }
      } catch {
        /* corrupt state: try the next source */
      }
    }
    return 'es';
  }

  /** Epoch ms of every answered burst, oldest first, capped in memory. */
  private answeredMs(): number[] {
    try {
      const raw = this.state('guardBursts');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
    } catch {
      return [];
    }
  }

  private countAnswered(now: number): void {
    this.state('guardBursts', JSON.stringify([...this.answeredMs(), now].slice(-80)));
  }

  private pausedNotice(): PausedNotice | null {
    try {
      const raw = this.state('guardPaused');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PausedNotice>;
      return {
        hourMs: typeof parsed.hourMs === 'number' ? parsed.hourMs : null,
        dayKey: typeof parsed.dayKey === 'string' ? parsed.dayKey : null,
      };
    } catch {
      return null;
    }
  }

  private voiceUse(): { day: string; count: number } {
    try {
      const raw = this.state('guardVoice');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{ day: string; count: number }>;
        if (typeof parsed.day === 'string' && typeof parsed.count === 'number') {
          return { day: parsed.day, count: parsed.count };
        }
      }
    } catch {
      /* corrupt state counts as unused */
    }
    return { day: '', count: 0 };
  }

  private proofUse(): { hold: string; count: number } {
    try {
      const raw = this.state('guardProof');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{ hold: string; count: number }>;
        if (typeof parsed.hold === 'string' && typeof parsed.count === 'number') {
          return { hold: parsed.hold, count: parsed.count };
        }
      }
    } catch {
      /* corrupt state counts as unused */
    }
    return { hold: '', count: 0 };
  }

  /**
   * One agent note toward the operator. The Operator serializes it: while a
   * passthrough is open it is queued, otherwise it goes out at once (a
   * high-priority note skips the hourly cap). Taken-conversation relays
   * never go through here, so they are never limited or queued.
   */
  private async note(text: string, tag: string, priority: 'high' | 'normal' | 'low'): Promise<void> {
    const name = this.state('name');
    if (!name) return;
    await postNote(this.env, { name, text, tag, priority });
  }

  /** Tell the Operator the passthrough saw traffic; keeps its idle clock fresh. */
  private async passAlive(name: string, at: number): Promise<void> {
    try {
      const ns = this.env.REGISTRY;
      if (!ns || !name) return;
      const stub = ns.get(ns.idFromName('operator'));
      await stub.fetch(
        new Request('https://registry/call', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'passAlive', name, at }),
        })
      );
    } catch {
      /* the operator's own idle check still runs */
    }
  }

  /** Tell the Operator the passthrough went idle; it tells the operator and flushes. */
  private async passExpired(name: string): Promise<void> {
    try {
      const ns = this.env.REGISTRY;
      if (!ns || !name) return;
      const stub = ns.get(ns.idFromName('operator'));
      await stub.fetch(
        new Request('https://registry/call', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'passExpired', name }),
        })
      );
    } catch {
      /* the taken flag below is still cleared */
    }
  }

  /** Drop the client from the operator registry; never throws. */
  private async deregister(phone: string): Promise<void> {
    try {
      await release(this.env, phone);
    } catch {
      /* the registry is best effort */
    }
  }

  /** Operator control entry over HTTP (the Operator DO POSTs JSON here). */
  async fetch(req: Request): Promise<Response> {
    this.ensureSchema();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ ok: false }, { status: 400 });
    }
    if (typeof body !== 'object' || body === null) {
      return Response.json({ ok: false }, { status: 400 });
    }
    const action = (body as { action?: unknown }).action;
    if (action === 'summary') return Response.json(await this.summary());
    if (action === 'recapData') return Response.json(await this.recapData());
    return Response.json(await this.control(body as { action?: unknown }));
  }

  /** What /recap lists: the last client message and the booking state, if any. */
  private async summary(): Promise<{ lastAt: number | null; phase: string | null }> {
    let lastAt: number | null = null;
    try {
      const rows = this.ctx.storage.sql
        .exec('SELECT MAX(at) AS lastAt FROM messages WHERE role = ?', 'user')
        .toArray() as Array<{ lastAt: number | null }>;
      // messages.at holds the WhatsApp epoch in seconds; the recap compares
      // it with Date.now() milliseconds.
      if (rows.length > 0 && typeof rows[0].lastAt === 'number') lastAt = rows[0].lastAt * 1000;
    } catch {
      /* a missing table reads as no message yet */
    }
    let phase: string | null = null;
    try {
      const raw = this.state('booking');
      if (raw) {
        const st = JSON.parse(raw) as { phase?: unknown; start?: unknown };
        if (st.phase === 'held') phase = 'apartado';
        else if (st.phase === 'booked') phase = 'reservado';
        else if (st.phase === 'offered') phase = 'eligiendo horario';
      }
    } catch {
      /* corrupt booking state reads as no booking */
    }
    return { lastAt, phase };
  }

  /** What /recap <name> summarizes: the stored turns and the last client text. */
  private async recapData(): Promise<{ turns: Array<{ role: string; text: string }>; last: string }> {
    const turns = this.historyTurns().map((t) => ({ role: t.role, text: t.text }));
    let last = '';
    try {
      const rows = this.ctx.storage.sql
        .exec("SELECT text FROM messages WHERE role = 'user' AND text IS NOT NULL ORDER BY rowid DESC LIMIT 1")
        .toArray() as Array<{ text: string }>;
      if (rows.length > 0 && typeof rows[0].text === 'string') last = rows[0].text;
    } catch {
      /* a missing table reads as no message yet */
    }
    return { turns, last };
  }

  /** Run one operator command against this conversation. */
  async control(action: {
    action?: unknown;
    name?: unknown;
    text?: unknown;
    phone?: unknown;
    lang?: unknown;
  }): Promise<{ ok: boolean }> {
    this.ensureSchema();
    if (action.action === 'take') {
      if (typeof action.name !== 'string' || !action.name) return { ok: false };
      this.state('taken', JSON.stringify({ name: action.name, at: Date.now() }));
      await this.armNext(Date.now());
      return { ok: true };
    }
    if (action.action === 'releaseTake') {
      this.state('taken', null);
      await this.armNext(Date.now());
      return { ok: true };
    }
    if (action.action === 'operatorMessage') {
      if (typeof action.text !== 'string' || !action.text.trim()) return { ok: false };
      const at = Date.now();
      this.ctx.storage.sql.exec(
        'INSERT INTO messages (id, at, role, type, text, media_id) VALUES (?, ?, ?, ?, ?, ?)',
        'op-' + at + '-' + Math.floor(Math.random() * 1000000),
        Math.floor(at / 1000),
        'operator',
        'text',
        (action.text as string).slice(0, 1000),
        null
      );
      // An operator message restarts the passthrough idle clock.
      const takenRaw = this.state('taken');
      if (takenRaw) {
        try {
          const taken = JSON.parse(takenRaw) as { name?: string };
          this.state('taken', JSON.stringify({ name: taken.name ?? '', at }));
        } catch {
          /* a corrupt taken flag is left alone */
        }
      }
      await this.armNext(at);
      return { ok: true };
    }
    if (action.action === 'operatorConfirm') {
      return await this.operatorConfirm();
    }
    if (action.action === 'operatorCancel') {
      return await this.operatorCancel();
    }
    if (action.action === 'operatorDelivery') {
      return await this.operatorDelivery(action);
    }
    return { ok: false };
  }

  /** Confirm a held paid booking, the same as removing [Por confirmar] in the calendar. */
  private async operatorConfirm(): Promise<{ ok: boolean }> {
    try {
      const raw = this.state('booking');
      if (!raw) return { ok: false };
      const st = JSON.parse(raw) as BookingState;
      if (st.phase !== 'held' || !st.eventId) return { ok: false };
      const res = await calendarCall(this.env, {
        action: 'confirm',
        contactKey: contactKey('wa', st.phone),
        summary: serviceLabel(st.lang, st.service) + ' · ' + (st.name || '+' + st.phone),
      });
      if (!res.ok) return { ok: false };
      st.phase = 'booked';
      this.state('booking', JSON.stringify(st));
      const at = Date.now();
      const text = renderBooking(CONFIRMED[st.lang], {
        slot: formatSlot(st.start ?? '', st.lang),
      });
      try {
        await sendText(this.env, st.phone, text);
      } catch {
        /* the hold is confirmed even when the client notice fails */
      }
      this.storeAssistant(Math.floor(at / 1000), 'a-op-confirm-' + st.eventId, text);
      await this.deregister(st.phone);
      await this.armNext(at);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  /** Cancel a booking and tell the client, applying the cancellation policy text. */
  private async operatorCancel(): Promise<{ ok: boolean }> {
    try {
      const raw = this.state('booking');
      if (!raw) return { ok: false };
      const st = JSON.parse(raw) as BookingState;
      // The operator cancel always straight-cancels: no MOVE_ONCE reoffer.
      if (!st.eventId || !st.start) return { ok: false };
      const res = await calendarCall(this.env, {
        action: 'release',
        contactKey: contactKey('wa', st.phone),
      });
      if (!res.ok && res.reason !== 'no-booking') return { ok: false };
      this.state('booking', null);
      const at = Date.now();
      const text = renderBooking(CANCELLED[st.lang], {
        service: serviceLabel(st.lang, st.service),
        slot: formatSlot(st.start, st.lang),
      });
      try {
        await sendText(this.env, st.phone, text);
      } catch {
        /* the booking is cancelled even when the client notice fails */
      }
      this.storeAssistant(Math.floor(at / 1000), 'a-op-cancel-' + st.eventId, text);
      await this.deregister(st.phone);
      await this.armNext(at);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  /** The client phone behind this conversation, from whatever state keeps it. */
  private deliveryPhone(): string {
    for (const key of ['booking', 'intake', 'capture']) {
      try {
        const raw = this.state(key);
        if (!raw) continue;
        const phone = (JSON.parse(raw) as { phone?: unknown }).phone;
        if (typeof phone === 'string' && phone) return phone;
      } catch {
        /* corrupt state: try the next source */
      }
    }
    return '';
  }

  /** Authorise one delivery session: offer the consultation-style slots, or
   *  report the delivery already booked. The authorisation is consumed by the
   *  booking it enables. */
  private async operatorDelivery(action: {
    phone?: unknown;
    name?: unknown;
    lang?: unknown;
  }): Promise<{ ok: boolean; already?: boolean }> {
    try {
      const raw = this.state('booking');
      if (raw) {
        const st = JSON.parse(raw) as BookingState;
        if (st.service === 'delivery' && st.eventId) return { ok: true, already: true };
      }
    } catch {
      /* a corrupt booking state authorises fresh below */
    }
    const lang: Lang = action.lang === 'en' ? 'en' : action.lang === 'es' ? 'es' : this.clientLang();
    const phone = (typeof action.phone === 'string' && action.phone) || this.deliveryPhone();
    const name = typeof action.name === 'string' ? action.name : (this.state('name') ?? '');
    if (!phone) return { ok: false };
    const res = await calendarCall(this.env, {
      action: 'status',
      contactKey: contactKey('wa', phone),
      service: 'delivery',
      minutes: minutesFor('delivery'),
      now: Date.now(),
    });
    if (!res.ok) {
      return { ok: false };
    }
    if (res.active) {
      const active = res.active as ActiveInfo;
      const svc: BookingService =
        active.service === 'delivery'
          ? 'delivery'
          : active.service === 'consultation'
            ? 'consultation'
            : 'first-call';
      const seeded = seedFromActive(active, { lang, phone, name, service: svc, brief: [] });
      this.state('booking', JSON.stringify(seeded));
      const text = renderBooking(EXISTING[lang], { slot: formatSlot(active.start, lang) });
      try {
        await sendText(this.env, phone, text);
      } catch {
        /* the seeded state still stands */
      }
      this.storeAssistant(Math.floor(Date.now() / 1000), 'a-op-delivery-existing-' + active.eventId, text);
      // No alarm: the next client message sets the retention deadline, and an
      // empty armNext would wipe the stored booking. A booking the calendar
      // already holds never authorises a new delivery session.
      if (svc === 'delivery') return { ok: true, already: true };
      return { ok: true };
    }
    const slots = ((res.slots ?? []) as string[]).slice(0, 5);
    if (slots.length === 0) {
      return { ok: false };
    }
    // The authorisation is created only with the offer it enables: a failed
    // or refused /delivery must never book later.
    this.state('deliveryAuth', '1');
    const now = Date.now();
    const booking: BookingState = {
      service: 'delivery',
      lang,
      offered: slots,
      phase: 'offered',
      createdAt: now,
      phone,
      name,
      brief: [],
    };
    this.state('booking', JSON.stringify(booking));
    const text = offerText(lang, slots.map((s) => formatSlot(s, lang)));
    try {
      await sendText(this.env, phone, text);
    } catch {
      /* the offer stands in state even when the notice fails */
    }
    this.storeAssistant(Math.floor(now / 1000), 'a-op-delivery-offer', text);
    // No alarm: the next client message sets the retention deadline, and an
    // empty armNext would wipe the stored booking.
    return { ok: true };
  }

  private async erase(m: Inbound, lang: Lang): Promise<void> {
    try {
      const raw = this.state('booking');
      if (raw) {
        const st = JSON.parse(raw) as Partial<BookingState>;
        if (st.eventId) {
          // The owner releases the event; a missing one is already gone.
          await calendarCall(this.env, {
            action: 'release',
            contactKey: contactKey('wa', (st.phone as string) ?? m.from),
          });
        }
      }
    } catch {
      /* storage without a booking leaves nothing to release */
    }
    // Erasure also removes the contact's records from the owner.
    try {
      await calendarCall(this.env, { action: 'erase', contactKey: contactKey('wa', m.from) });
    } catch {
      /* the local wipe below still runs */
    }
    const handedOff = this.state('handoff') !== null;
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    const erasedName = this.state('name') ?? nameBase(m.name ?? '');
    await this.deregister(m.from);
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    try {
      await markRead(this.env, m.id);
    } catch {
      /* ignored */
    }
    await sendText(this.env, m.from, ERASED[lang]);
    if (handedOff && m.from !== operator) {
      await postNote(this.env, { name: erasedName, text: operatorErased(m.from), tag: 'DATOS', priority: 'normal' });
    }
  }

  async alarm(): Promise<void> {
    this.ensureSchema();
    let now = Date.now();
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    // An idle passthrough closes on its own; the Operator tells the
    // operator and delivers the queued notes.
    const takenRaw = this.state('taken');
    if (takenRaw) {
      try {
        const taken = JSON.parse(takenRaw) as { name?: string; at?: number };
        const idle = guardConfig(this.env).passthroughIdleMs;
        if (typeof taken.at === 'number' && taken.name && now >= taken.at + idle) {
          this.state('taken', null);
          // The Operator tells the operator and flushes the queued notes;
          // the notice never enters the client's history as an assistant turn.
          await this.passExpired(taken.name);
        }
      } catch {
        this.state('taken', null);
      }
      now = Date.now();
    }
    // The one alarm fires for the earliest pending deadline: when the burst
    // window has closed the burst is answered first, then the other work.
    const burstRaw = this.state('burst');
    if (burstRaw) {
      let open: BurstState | null = null;
      try {
        const parsed = JSON.parse(burstRaw) as Partial<BurstState>;
        if (
          typeof parsed.firstAt === 'number' &&
          typeof parsed.quietDue === 'number' &&
          typeof parsed.maxDue === 'number' &&
          Array.isArray(parsed.ids) &&
          typeof parsed.from === 'string'
        ) {
          open = parsed as BurstState;
        }
      } catch {
        open = null;
      }
      if (open === null) {
        this.state('burst', null);
      } else if (burstDue(open, now)) {
        await this.flushBurst();
        now = Date.now();
      }
    }
    // A capture abandoned for 24 hours hands off with what was gathered,
    // even when no new message arrives to trigger it.
    const capRaw = this.state('capture');
    if (capRaw) {
      const cap = parseCapture(capRaw);
      if (!cap) {
        this.state('capture', null);
      } else if (now >= cap.updatedAt + CAPTURE_MS) {
        await this.reasonHandoff(
          { from: cap.phone, name: cap.name },
          cap.reason,
          cap.lang,
          cap.opening,
          cap.answers,
          'alarm-' + String(cap.updatedAt)
        );
        await this.armNext(Date.now());
        return;
      }
    }
    const raw = this.state('booking');
    const ret = Number(this.state('retention') ?? '0');
    if (raw && !(ret > 0 && now >= ret)) {
      let st: BookingState | null = null;
      try {
        st = JSON.parse(raw) as BookingState;
      } catch {
        st = null;
      }
      if (st === null || typeof st !== 'object') {
        this.state('booking', null);
      } else if (st.phase === 'held' && st.eventId && Number.isFinite(st.createdAt)) {
        // The owner decides expiry against the calendar: a hand-confirmed
        // hold settles, a hand-deleted one stops counting, the deadline
        // releases the event. A failure only re-arms and retries.
        const res = await calendarCall(this.env, {
          action: 'expire',
          contactKey: contactKey('wa', st.phone),
          now,
        });
        if (res.ok && res.expired === true) {
          this.state('booking', null);
          const text = EXPIRED[st.lang];
          await sendText(this.env, st.phone, text);
          this.storeAssistant(Math.floor(now / 1000), 'a-alarm-expire-' + st.eventId, text);
          await postNote(this.env, {
            name: this.state('name') || nameBase(st.name || st.phone),
            text: noteBody(
              'Apartado vencido',
              st.service,
              st.start ?? '',
              st.lang,
              formatBrief({ name: st.name, phone: st.phone, lang: st.lang, service: st.service, bullets: st.brief })
            ),
            tag: 'Cita',
            priority: 'normal',
          });
          await this.deregister(st.phone);
        } else if (res.ok && res.confirmed === true) {
          st.phase = 'booked';
          this.state('booking', JSON.stringify(st));
          const text = renderBooking(CONFIRMED[st.lang], {
            slot: formatSlot(st.start ?? '', st.lang),
          });
          await sendText(this.env, st.phone, text);
          this.storeAssistant(Math.floor(now / 1000), 'a-alarm-confirm-' + st.eventId, text);
          await this.deregister(st.phone);
        }
        await this.armNext(now);
        return;
      }
      await this.armNext(now);
      return;
    }
    if (ret > 0 && now >= ret) {
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.armNext(now);
  }

  private async finishBooking(m: Inbound, st: IntakeState): Promise<void> {
    this.state('handoff', '1');
    const b = await brief(this.ai(), st, modelConfig(this.env));
    this.briefs(1, m.timestamp, m.from, m.name ?? '', st.lang, st.service, JSON.stringify(b.bullets));
    const name = await register(this.env, {
      phone: m.from,
      name: m.name ?? '',
      lang: st.lang,
      kind: 'handoff',
      service: st.service,
    });
    this.state('name', name);
    const intakeReason = this.state('intakeReason');
    this.state('intakeReason', null);
    let note = formatBrief({
      name: m.name ?? '',
      phone: m.from,
      lang: st.lang,
      service: st.service,
      bullets: b.bullets,
    });
    if (intakeReason === 'flow' || intakeReason === 'audit') {
      note +=
        '\n' +
        (st.lang === 'es' ? 'Motivo: ' : 'Reason: ') +
        (intakeReason === 'flow' ? 'FLUJO' : 'AUDITORÍA');
    }
    // FR5: at most one handoff notice per client every 10 minutes. A
    // throttled handoff still tells the client and keeps the registry row.
    if (await guardHandoff(this.env, m.from)) {
      await this.note(note, 'CITA', 'normal');
    }
    const confirm = CONFIRM_SLOT[st.lang];
    await sendText(this.env, m.from, confirm);
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-confirm', confirm);
    this.state('intake', null);
  }

  private async calendarDown(
    m: Inbound,
    lang: Lang,
    service: string,
    bullets: string[],
    name: string
  ): Promise<void> {
    this.state('booking', null);
    this.state('handoff', '1');
    const registered = await register(this.env, {
      phone: m.from,
      name,
      lang,
      kind: 'handoff',
      service,
    });
    this.state('name', registered);
    // FR5: at most one handoff notice per client every 10 minutes. A
    // throttled failure still tells the client and keeps the registry row.
    if (await guardHandoff(this.env, m.from)) {
      const note = formatBrief({ name, phone: m.from, lang, service, bullets });
      await this.note('La agenda falló: agendar a mano.\n' + note, 'CITA', 'normal');
    }
    const down = CALENDAR_DOWN[lang];
    await sendText(this.env, m.from, down);
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-caldown', down);
  }

  /** A limit refusal: no event, the client gets the fixed wording and a person gets the brief. */
  private async limitRefusal(
    m: Inbound,
    lang: BookingState['lang'],
    phone: string,
    name: string,
    service: string,
    brief: string[],
    reason: 'free-limit' | 'expired-holds' | 'hold-cap' | 'day-cap' | 'moves'
  ): Promise<void> {
    this.state('booking', null);
    this.state('handoff', '1');
    const registered = await refuseAndHandOff(this.env, { lang, phone, name, service, brief, reason });
    this.state('name', registered);
    const text = LIMIT_TEXT[reason][lang];
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-limit', text);
  }

  private async startBooking(
    m: Inbound,
    st: IntakeState,
    service: BookingService
  ): Promise<void> {
    // A delivery offer needs the operator's authorisation; without it the
    // request hands off instead of ever showing slots.
    if (service === 'delivery' && this.state('deliveryAuth') !== '1') {
      await this.limitRefusal(m, st.lang, m.from, m.name ?? '', st.service, [], 'day-cap');
      return;
    }
    const b = await brief(this.ai(), st, modelConfig(this.env));
    const minutes = minutesFor(service);
    // The owner answers first: an active booking seeds the chat instead of
    // offering, a limit refuses with fixed wording, and only a free contact
    // gets an offer. Calendar trouble hands off as it does today.
    const res = await calendarCall(this.env, {
      action: 'status',
      contactKey: contactKey('wa', m.from),
      service,
      minutes,
      now: Date.now(),
    });
    if (!res.ok) {
      if (res.reason === 'calendar-down') {
        await this.calendarDown(m, st.lang, st.service, b.bullets, m.name ?? '');
        return;
      }
      await this.limitRefusal(m, st.lang, m.from, m.name ?? '', st.service, b.bullets, res.reason as 'free-limit' | 'expired-holds' | 'hold-cap' | 'day-cap' | 'moves');
      return;
    }
    if (res.active) {
      const active = res.active as ActiveInfo;
      const seeded = seedFromActive(active, {
        lang: st.lang,
        phone: m.from,
        name: m.name ?? '',
        service,
        brief: b.bullets,
      });
      this.state('booking', JSON.stringify(seeded));
      this.state('intake', null);
      const text = renderBooking(EXISTING[st.lang], { slot: formatSlot(active.start, st.lang) });
      await sendText(this.env, m.from, text);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-existing', text);
      return;
    }
    const slots = ((res.slots ?? []) as string[]).slice(0, 5);
    if (slots.length === 0) {
      await this.finishBooking(m, st);
      return;
    }
    const now = Date.now();
    const booking: BookingState = {
      service,
      lang: st.lang,
      offered: slots,
      phase: 'offered',
      createdAt: now,
      phone: m.from,
      name: m.name ?? '',
      brief: b.bullets,
    };
    this.state('booking', JSON.stringify(booking));
    this.state('intake', null);
    const text = offerText(st.lang, slots.map((s) => formatSlot(s, st.lang)));
    await sendText(this.env, m.from, text);
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-offer', text);
  }

  /** The lost race: the slot is gone, so the remaining ones are offered. */
  private async slotTaken(m: Inbound, st: BookingState, minutes: number): Promise<void> {
    // A delivery re-offer without the operator's authorisation hands off
    // instead of showing slots; retrying a booked delivery's move skips this gate.
    if (st.service === 'delivery' && st.eventId === undefined && this.state('deliveryAuth') !== '1') {
      await this.limitRefusal(m, st.lang, st.phone, st.name, st.service, st.brief, 'day-cap');
      return;
    }
    const res = await calendarCall(this.env, {
      action: 'status',
      contactKey: contactKey('wa', m.from),
      service: st.service,
      minutes,
      forMove: st.eventId !== undefined,
      now: Date.now(),
    });
    if (!res.ok) {
      if (res.reason === 'calendar-down') {
        await this.calendarDown(m, st.lang, st.service, st.brief, st.name);
        return;
      }
      await this.limitRefusal(m, st.lang, st.phone, st.name, st.service, st.brief, res.reason as 'free-limit' | 'expired-holds' | 'hold-cap' | 'day-cap' | 'moves');
      return;
    }
    if (res.active && !st.eventId) {
      const active = res.active as ActiveInfo;
      const seeded = seedFromActive(active, {
        lang: st.lang,
        phone: st.phone,
        name: st.name,
        service: st.service,
        brief: st.brief,
      });
      this.state('booking', JSON.stringify(seeded));
      const text = renderBooking(EXISTING[st.lang], { slot: formatSlot(active.start, st.lang) });
      await sendText(this.env, m.from, text);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-existing', text);
      return;
    }
    const slots = ((res.slots ?? []) as string[]).slice(0, 5);
    if (slots.length === 0) {
      await this.notify(m);
      const fallback = FALLBACK[st.lang];
      await sendText(this.env, m.from, fallback);
      this.storeAssistant(m.timestamp, 'a-' + m.id, fallback);
      return;
    }
    st.offered = slots;
    this.state('booking', JSON.stringify(st));
    const text = SLOT_TAKEN[st.lang] + '\n' + offerText(st.lang, st.offered.map((s) => formatSlot(s, st.lang)));
    await sendText(this.env, m.from, text);
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-retaken', text);
  }

  private async pickSlot(
    m: Inbound,
    st: BookingState,
    slot1: number
  ): Promise<void> {
    const idx = slot1 - 1;
    if (!(idx >= 0 && idx < st.offered.length)) {
      const text = offerText(st.lang, st.offered.map((s) => formatSlot(s, st.lang)));
      await sendText(this.env, m.from, text);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-reoffer', text);
      return;
    }
    const startIso = st.offered[idx];
    // A delivery pick without the operator's authorisation hands off instead
    // of booking; a booked delivery moves like any other booking.
    if (st.service === 'delivery' && st.eventId === undefined && this.state('deliveryAuth') !== '1') {
      await this.limitRefusal(m, st.lang, st.phone, st.name, st.service, st.brief, 'day-cap');
      return;
    }
    const minutes = minutesFor(st.service);
    // A paid (operator-confirmed) consultation stays confirmed when the
    // client moves it; only unpaid holds carry the [Por confirmar] prefix. A
    // delivery never holds: it books straight away like a first call.
    const hold = st.service === 'consultation' && st.phase !== 'booked';
    const summary =
      st.service === 'delivery'
        ? 'Entrega de auditoría · ' + (st.name || '+' + st.phone)
        : (hold ? HOLD_PREFIX : '') + serviceLabel(st.lang, st.service) + ' · ' + (st.name || '+' + st.phone);
    const description = formatBrief({
      name: st.name,
      phone: st.phone,
      lang: st.lang,
      service: st.service,
      bullets: st.brief,
    });
    // The serialized owner checks the slot free again at write time: when
    // two clients pick the same slot at once exactly one gets it.
    // A paid consultation's move returns kind 'booked', so the moved note
    // keys on the action, not on the returned kind.
    const isMove = Boolean(st.eventId);
    const res = st.eventId
      ? await calendarCall(this.env, {
          action: 'move',
          contactKey: contactKey('wa', st.phone),
          startIso,
          minutes,
          summary,
          description,
          now: Date.now(),
        })
      : await calendarCall(this.env, {
          action: 'reserve',
          contactKey: contactKey('wa', st.phone),
          service: st.service,
          startIso,
          minutes,
          summary,
          description,
          now: Date.now(),
        });
    if (!res.ok) {
      if (res.reason === 'slot-taken' || res.reason === 'no-booking') {
        // The booking vanished under us (hand-deleted and reconciled): drop
        // the stale event and re-offer as a fresh pick would.
        if (res.reason === 'no-booking') {
          st.eventId = undefined;
          st.start = undefined;
          st.phase = 'offered';
          this.state('booking', JSON.stringify(st));
        }
        await this.slotTaken(m, st, minutes);
        return;
      }
      if (res.reason === 'calendar-down') {
        await this.calendarDown(m, st.lang, st.service, st.brief, st.name);
        return;
      }
      if (res.reason === 'existing' && !st.eventId) {
        const status = await calendarCall(this.env, {
          action: 'status',
          contactKey: contactKey('wa', st.phone),
          service: st.service,
          minutes,
          now: Date.now(),
        });
        if (status.ok && status.active) {
          const active = status.active as ActiveInfo;
          const seeded = seedFromActive(active, {
            lang: st.lang,
            phone: st.phone,
            name: st.name,
            service: st.service,
            brief: st.brief,
          });
          this.state('booking', JSON.stringify(seeded));
          const text = renderBooking(EXISTING[st.lang], { slot: formatSlot(active.start, st.lang) });
          await sendText(this.env, m.from, text);
          this.storeAssistant(m.timestamp, 'a-' + m.id + '-existing', text);
          return;
        }
      }
      await this.limitRefusal(m, st.lang, st.phone, st.name, st.service, st.brief, res.reason as 'free-limit' | 'expired-holds' | 'hold-cap' | 'day-cap' | 'moves');
      return;
    }
    const cfg = bookingConfig(this.env);
    const now = Date.now();
    const kind = res.kind === 'booked' ? 'booked' : 'hold';
    st.phase = kind === 'hold' ? 'held' : 'booked';
    st.eventId = res.eventId as string;
    st.start = startIso;
    if (kind === 'hold') st.createdAt = now;
    // One authorisation books once: the delivery consumes it here.
    if (st.service === 'delivery') this.state('deliveryAuth', null);
    this.state('booking', JSON.stringify(st));
    if (kind === 'hold') {
      const held = await register(this.env, {
        phone: st.phone,
        name: st.name,
        lang: st.lang,
        kind: 'hold',
        service: st.service,
        start: startIso,
        eventId: st.eventId,
      });
      this.state('name', held);
    }
    const ev =
      st.service === 'delivery'
        ? isMove
          ? 'Entrega movida'
          : 'Entrega agendada'
        : isMove
          ? 'Cita movida'
          : kind === 'hold'
            ? 'Apartado creado'
            : st.service === 'first-call'
              ? 'Primera llamada agendada'
              : 'Cita agendada';
    await postNote(this.env, {
      name: this.state('name') || nameBase(st.name || st.phone),
      text: noteBody(ev, st.service, startIso, st.lang, description),
      tag: 'Cita',
      priority: 'normal',
    });
    const slotText = formatSlot(startIso, st.lang);
    const text =
      st.service === 'delivery'
        ? renderBooking(DELIVERED[st.lang], { slot: slotText })
        : kind === 'hold'
          ? renderBooking(HOLD_SENT[st.lang], { slot: slotText, payments: paymentText(cfg, st.lang, st.phone) })
          : renderBooking(PICKED[st.lang], {
              slot: slotText,
              service: serviceLabel(st.lang, st.service),
            });
    await sendText(this.env, m.from, text);
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-booked', text);
    const ret = Number(this.state('retention') ?? '0');
    const when = kind === 'hold'
      ? ret > 0
        ? Math.min(now + HOLD_CHECK_MS, ret)
        : now + HOLD_CHECK_MS
      : ret;
    if (when > 0) await this.ctx.storage.setAlarm(when);
  }

  private async cancelBooking(
    m: Inbound,
    st: BookingState
  ): Promise<void> {
    if (!st.eventId || !st.start) {
      await this.notify(m);
      const fallback = FALLBACK[st.lang];
      await sendText(this.env, m.from, fallback);
      this.storeAssistant(m.timestamp, 'a-' + m.id, fallback);
      return;
    }
    // The Terms' 24-hour move-once rule covers paid sessions, i.e. holds the
    // operator already confirmed; an unpaid hold is simply released.
    if (st.service === 'consultation' && st.phase === 'booked' && Date.parse(st.start) - Date.now() < HOLD_MS) {
      await this.reoffer(m, st, '', true);
      return;
    }
    const res = await calendarCall(this.env, {
      action: 'release',
      contactKey: contactKey('wa', st.phone),
    });
    if (!res.ok && res.reason !== 'no-booking') {
      await this.calendarDown(m, st.lang, st.service, st.brief, st.name);
      return;
    }
    this.state('booking', null);
    this.state('handoff', '1');
    const cancelled = await register(this.env, {
      phone: st.phone,
      name: st.name,
      lang: st.lang,
      kind: 'handoff',
      service: st.service,
    });
    this.state('name', cancelled);
    // Every cancellation reaches the operator at once; a paid one is high
    // priority so it skips the hourly cap and is never dropped in a queue.
    const paid = st.service === 'consultation' && st.phase === 'booked';
    await postNote(this.env, {
      name: cancelled,
      text: noteBody(
        paid ? 'Cita cancelada · estaba pagada' : 'Cita cancelada',
        st.service,
        st.start ?? '',
        st.lang,
        formatBrief({ name: st.name, phone: st.phone, lang: st.lang, service: st.service, bullets: st.brief })
      ),
      tag: 'Cita',
      priority: paid ? 'high' : 'normal',
    });
    const text = renderBooking(CANCELLED[st.lang], {
      service: serviceLabel(st.lang, st.service),
      slot: formatSlot(st.start, st.lang),
    });
    await sendText(this.env, m.from, text);
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-cancel', text);
  }

  private async reoffer(
    m: Inbound,
    st: BookingState,
    dayKey = '',
    movedNote = false
  ): Promise<void> {
    // A delivery re-offer without the operator's authorisation hands off
    // instead of showing slots; moving a booked delivery skips this gate.
    if (st.service === 'delivery' && st.eventId === undefined && this.state('deliveryAuth') !== '1') {
      await this.limitRefusal(m, st.lang, st.phone, st.name, st.service, st.brief, 'day-cap');
      return;
    }
    const minutes = minutesFor(st.service);
    const res = await calendarCall(this.env, {
      action: 'status',
      contactKey: contactKey('wa', st.phone),
      service: st.service,
      minutes,
      forMove: true,
      now: Date.now(),
    });
    if (!res.ok) {
      if (res.reason === 'calendar-down') {
        await this.calendarDown(m, st.lang, st.service, st.brief, st.name);
        return;
      }
      await this.limitRefusal(m, st.lang, st.phone, st.name, st.service, st.brief, res.reason as 'free-limit' | 'expired-holds' | 'hold-cap' | 'day-cap' | 'moves');
      return;
    }
    let slots = (res.slots ?? []) as string[];
    const picked = dayKey ? slots.filter((s) => bogotaDateKey(Date.parse(s)) === dayKey) : slots;
    if (picked.length > 0) slots = picked;
    if (slots.length === 0) {
      await this.notify(m);
      const fallback = FALLBACK[st.lang];
      await sendText(this.env, m.from, fallback);
      this.storeAssistant(m.timestamp, 'a-' + m.id, fallback);
      return;
    }
    st.offered = slots.slice(0, 5);
    this.state('booking', JSON.stringify(st));
    const text =
      (movedNote ? MOVE_ONCE[st.lang] : '') +
      offerText(st.lang, st.offered.map((s) => formatSlot(s, st.lang)));
    await sendText(this.env, m.from, text);
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-reoffer', text);
  }

  private async handleBooking(m: Inbound, st: BookingState): Promise<void> {
    const res = await decide(
      this.ai(),
      modelConfig(this.env),
      {
        lang: st.lang,
        service: st.service,
        phase: st.phase,
        offered: st.offered.map((s) => formatSlot(s, st.lang)),
        today: bogotaDateKey(Date.now()),
        horizonDays: bookingConfig(this.env).horizonDays,
        eventStart: st.start,
      },
      m.text ?? ''
    );
    if (res.action === 'pick') {
      await this.pickSlot(m, st, res.slot);
      return;
    }
    if (res.action === 'cancel') {
      await this.cancelBooking(m, st);
      return;
    }
    if (res.action === 'move' || res.action === 'day') {
      await this.reoffer(m, st, res.action === 'day' ? res.date : '');
      return;
    }
    await this.notify(m);
    const fallback = FALLBACK[st.lang];
    await sendText(this.env, m.from, fallback);
    this.storeAssistant(m.timestamp, 'a-' + m.id, fallback);
  }

  async receive(m: Inbound): Promise<void> {
    this.ensureSchema();
    const existing = this.ctx.storage.sql
      .exec('SELECT 1 FROM messages WHERE id = ? LIMIT 1', m.id)
      .toArray();
    if (existing.length > 0) return;
    // A voice note is transcribed first and processed exactly as if the
    // client had typed the transcript; the audio itself is never stored.
    let voiceFailed = false;
    let voiceGlobalOver = false;
    if ((m.type === 'audio' || m.type === 'voice') && m.text === undefined) {
      const cfg = voiceConfig(this.env);
      if (m.duration !== undefined && m.duration > cfg.maxSeconds) {
        voiceFailed = true;
      } else if (m.mediaId === undefined) {
        voiceFailed = true;
      } else {
        // At most 5 transcriptions a day per number: later notes go to a
        // person untranscribed, with no model call. Only heard notes count.
        const gcfg = guardConfig(this.env);
        const today = bogotaDateKey(Date.now());
        const use = this.voiceUse();
        const usedToday = use.day === today ? use.count : 0;
        if (usedToday >= gcfg.voicePerDay) {
          voiceFailed = true;
        } else if (!(await guardModelTake(this.env, this.clientLang()))) {
          voiceGlobalOver = true;
        } else {
          const t = await transcribe(this.env, cfg, m.mediaId);
          if (t.ok) {
            m.text = t.text;
            m.mediaId = undefined;
            this.state('guardVoice', JSON.stringify({ day: today, count: usedToday + 1 }));
          } else {
            voiceFailed = true;
          }
        }
      }
    }
    if (m.text !== undefined) {
      const erased = deletionRequest(m.text);
      if (erased) {
        await this.erase(m, erased);
        return;
      }
    }
    const firstContact =
      this.ctx.storage.sql.exec("SELECT 1 FROM messages WHERE role = 'user' LIMIT 1").toArray().length === 0;
    this.ctx.storage.sql.exec(
      'INSERT INTO messages (id, at, role, type, text, media_id, mime) VALUES (?, ?, ?, ?, ?, ?, ?)',
      m.id,
      m.timestamp,
      'user',
      m.type,
      m.text ?? null,
      m.mediaId ?? null,
      m.mime ?? null
    );
    const retention = alarmAt(m.timestamp);
    this.state('retention', String(retention));
    await markRead(this.env, m.id);
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    if (m.from === operator) {
      // The operator's own messages are stored and read, never answered.
      let alarm = retention;
      try {
        const raw = this.state('booking');
        if (raw) {
          const b = JSON.parse(raw) as BookingState;
          if (b.phase === 'held' && Number.isFinite(b.createdAt)) {
            // A pending hold keeps its own deadline/check alarm; retention must
            // not push it months out or the 24h expiry never runs.
            alarm = Math.min(alarm, b.createdAt + HOLD_MS, Date.now() + HOLD_CHECK_MS);
          }
        }
      } catch {
        /* corrupt booking state: the retention alarm stands */
      }
      await this.ctx.storage.setAlarm(alarm);
      return;
    }
    if (firstContact && this.state('taken') === null) {
      const lang = detectLang(m.text ?? '');
      const text = OPENING[lang];
      await sendText(this.env, m.from, text);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-opening', text);
    }
    // The Worker is over its daily model calls: the stored voice note gets
    // the fixed fallback sentence and a handoff, with no model call.
    if (voiceGlobalOver) {
      const lang = this.clientLang();
      await sendText(this.env, m.from, FALLBACK[lang]);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-global', FALLBACK[lang]);
      await this.notify(m);
      await this.armNext(Date.now());
      return;
    }
    // While taken, the agent stays silent and the client's messages are
    // relayed to the operator under the conversation's name.
    const takenRaw = this.state('taken');
    if (takenRaw) {
      const name = this.takenName();
      const relay = ('[' + name + '] ' + (m.text ?? '[' + m.type + ']')).slice(0, 900);
      try {
        await sendText(this.env, operator, relay);
      } catch {
        /* ignored */
      }
      // Either direction restarts the idle clock, on both sides.
      const at = Date.now();
      try {
        this.state('taken', JSON.stringify({ name, at }));
      } catch {
        /* a corrupt taken flag is left alone */
      }
      await this.passAlive(name, at);
      await this.armNext(at);
      return;
    }
    // A voice note that could not be transcribed goes to a person, like
    // every other non-text message, and the client is told who listens.
    if (voiceFailed) {
      const voiceLang = this.clientLang();
      await sendText(this.env, m.from, VOICE_HANDOFF[voiceLang]);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-voice', VOICE_HANDOFF[voiceLang]);
      await this.notify(m);
      await this.armNext(Date.now());
      return;
    }
    // The message joins the open burst and is answered when the client pauses:
    // the burst timer never pushes the retention or hold deadlines out.
    const cfg = burstConfig(this.env);
    const now = Date.now();
    let firstAt = now;
    let ids: string[] = [];
    try {
      const prev = this.state('burst');
      if (prev) {
        const parsed = JSON.parse(prev) as Partial<BurstState>;
        if (typeof parsed.firstAt === 'number' && Number.isFinite(parsed.firstAt)) {
          firstAt = parsed.firstAt;
        }
        if (Array.isArray(parsed.ids)) {
          ids = parsed.ids.filter((id): id is string => typeof id === 'string');
        }
      }
    } catch {
      firstAt = now;
      ids = [];
    }
    ids.push(m.id);
    const burst: BurstState = {
      firstAt,
      quietDue: now + cfg.quietMs,
      maxDue: firstAt + cfg.maxMs,
      ids,
      from: m.from,
    };
    if (m.name !== undefined) burst.name = m.name;
    this.state('burst', JSON.stringify(burst));
    await this.ctx.storage.setAlarm(
      nextAlarm(Math.min(burst.quietDue, burst.maxDue), retention, this.holdDue(now))
    );
    return;
  }

  /** The capture deadline, if a reason capture is open. */
  private captureDue(now: number): number | undefined {
    try {
      const cap = parseCapture(this.state('capture'));
      if (!cap) return undefined;
      const due = cap.updatedAt + CAPTURE_MS;
      return due > now ? due : now;
    } catch {
      /* corrupt capture state: no capture deadline */
      return undefined;
    }
  }

  /** The next pending hold deadline, if a consultation hold is open. */
  private holdDue(now: number): number | undefined {
    try {
      const raw = this.state('booking');
      if (!raw) return undefined;
      const b = JSON.parse(raw) as Partial<BookingState>;
      if (b.phase === 'held' && typeof b.createdAt === 'number' && Number.isFinite(b.createdAt)) {
        return Math.min(b.createdAt + HOLD_MS, now + HOLD_CHECK_MS);
      }
    } catch {
      /* corrupt booking state: no hold deadline */
    }
    return undefined;
  }

  private burstRows(
    ids: string[]
  ): Array<{ id: string; at: number; type: string; text: string | null; media_id: string | null; mime: string | null }> {
    const rows = this.ctx.storage.sql
      .exec("SELECT id, at, type, text, media_id, mime FROM messages WHERE role = 'user' ORDER BY at ASC, rowid ASC")
      .toArray() as Array<{ id: string; at: number; type: string; text: string | null; media_id: string | null; mime: string | null }>;
    const wanted = new Set(ids);
    return rows.filter((r) => wanted.has(r.id));
  }

  /** Re-arm the one alarm for the earliest still-pending deadline. When
   *  nothing is pending the object sleeps with nothing stored. */
  private async armNext(now: number): Promise<void> {
    const deadlines: number[] = [];
    try {
      const raw = this.state('burst');
      if (raw) {
        const burst = JSON.parse(raw) as Partial<BurstState>;
        if (typeof burst.quietDue === 'number' && typeof burst.maxDue === 'number') {
          const due = Math.min(burst.quietDue, burst.maxDue);
          // An overdue burst (its window closed while the conversation was
          // taken) flushes as soon as the object wakes, not at retention.
          deadlines.push(due > now ? due : now);
        }
      }
    } catch {
      /* a corrupt burst never re-arms */
    }
    const ret = Number(this.state('retention') ?? '0');
    if (ret > now) deadlines.push(ret);
    const hold = this.holdDue(now);
    if (hold !== undefined && hold > now) deadlines.push(hold);
    const capture = this.captureDue(now);
    if (capture !== undefined && capture > now) deadlines.push(capture);
    else if (capture !== undefined) deadlines.push(now);
    try {
      const raw = this.state('taken');
      if (raw) {
        const taken = JSON.parse(raw) as Partial<{ at: number }>;
        const idle = guardConfig(this.env).passthroughIdleMs;
        if (typeof taken.at === 'number' && Number.isFinite(taken.at) && taken.at + idle > now) {
          deadlines.push(taken.at + idle);
        }
      }
    } catch {
      /* a corrupt taken flag never re-arms */
    }
    if (deadlines.length === 0) {
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }

  /** Answer the open burst as one client turn: every message of the burst,
   *  oldest first, is the input to the usual pipeline. */
  private async flushBurst(): Promise<void> {
    const raw = this.state('burst');
    this.state('burst', null);
    let ids: string[] = [];
    let from = '';
    let name: string | undefined;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<BurstState>;
        if (Array.isArray(parsed.ids)) {
          ids = parsed.ids.filter((id): id is string => typeof id === 'string');
        }
        if (typeof parsed.from === 'string') from = parsed.from;
        if (typeof parsed.name === 'string') name = parsed.name;
      } catch {
        ids = [];
      }
    }
    const rows = ids.length > 0 ? this.burstRows(ids) : [];
    if (rows.length === 0 || from === '') return;
    // While taken the agent stays silent: messages already queued in the
    // burst before tomar are relayed to the operator, never answered.
    if (this.state('taken')) {
      const taken = this.takenName();
      const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
      for (const r of rows) {
        const relay = ('[' + taken + '] ' + (r.text ?? '[' + r.type + ']')).slice(0, 900);
        try {
          await sendText(this.env, operator, relay);
        } catch {
          /* ignored */
        }
      }
      return;
    }
    const last = rows[rows.length - 1];
    // Transcribed voice notes carry their transcript as text and join the
    // burst like typed messages; only untranscribed media is handed off.
    const texts = rows.filter((r) => r.text !== null && r.text !== '');
    const joined = joinBurst(texts.map((r) => ({ at: r.at, text: r.text as string })));
    const gcfg = guardConfig(this.env);
    const now = Date.now();
    // One number gets at most 12 answered bursts an hour and 40 a Bogota
    // day. Past either, the stored messages cause no model call, no reply
    // and no operator message; the client hears about it once per window.
    const limit = burstLimit(now, this.answeredMs(), gcfg);
    if (!limit.ok) {
      const notice = this.pausedNotice();
      if (pausedNoticeDue(now, limit.window, notice)) {
        const lang = detectLang(joined);
        await sendText(this.env, from, GUARD_PAUSED[lang]);
        this.storeAssistant(last.at, 'a-' + last.id + '-paused', GUARD_PAUSED[lang]);
        this.state(
          'guardPaused',
          JSON.stringify({
            hourMs: limit.window === 'hour' ? now : (notice?.hourMs ?? null),
            dayKey: limit.window === 'day' ? bogotaDateKey(now) : (notice?.dayKey ?? null),
          })
        );
      }
      return;
    }
    this.countAnswered(now);
    const m: Inbound = {
      id: last.id,
      from,
      timestamp: last.at,
      type: texts.length > 0 ? 'text' : last.type,
    };
    if (name !== undefined) m.name = name;
    // Client text reaching any model is capped; storage keeps the full text.
    if (joined !== '') m.text = capBurst(gcfg, joined);
    this.guardLang = detectLang(joined);
    // The Worker makes at most 1,500 model calls a Bogota day. Past it,
    // every client gets the fixed fallback sentence and a handoff, with no
    // model call, until the next day; the operator is told once.
    if (!(await guardModelTake(this.env, this.guardLang))) {
      const fallback = FALLBACK[this.guardLang];
      await sendText(this.env, from, fallback);
      this.storeAssistant(last.at, 'a-' + last.id + '-global', fallback);
      await this.notify(m);
      return;
    }
    let replied = false;
    try {
      const firstMedia = rows.find((r) => r.type !== 'text' && r.text === null);
      if (texts.length > 0 && firstMedia !== undefined) {
        // A burst mixing text and media: the text is answered below as one
        // turn. A held booking's receipt is read as a proof instead of
        // keeping today's handoff; other media keeps it exactly once.
        const mediaIn: Inbound = { id: firstMedia.id, from, timestamp: firstMedia.at, type: firstMedia.type };
        if (firstMedia.media_id) mediaIn.mediaId = firstMedia.media_id;
        if (firstMedia.mime) mediaIn.mime = firstMedia.mime;
        if (name !== undefined) mediaIn.name = name;
        if (!(await this.proofIfHeld(mediaIn))) {
          const mediaLang = detectLang(joined);
          await sendText(this.env, from, NON_TEXT[mediaLang]);
          this.storeAssistant(firstMedia.at, 'a-' + firstMedia.id + '-nontext', NON_TEXT[mediaLang]);
          await this.notify(mediaIn);
          replied = true;
        }
      }
    if (m.type === 'text') {
      const pendingRaw = this.state('pendingErase');
      if (pendingRaw) {
        let pendingLang: Lang = 'es';
        let live = false;
        try {
          const pending = JSON.parse(pendingRaw) as Partial<{ lang: Lang; expiresAt: number }>;
          pendingLang = pending.lang === 'en' ? 'en' : 'es';
          live = typeof pending.expiresAt === 'number' && Date.now() <= pending.expiresAt;
        } catch {
          live = false;
        }
        this.state('pendingErase', null);
        if (live) {
          if (isConfirmation(m.text ?? '')) {
            await this.erase(m, pendingLang);
            return;
          }
          await sendText(this.env, m.from, NOT_DELETED[pendingLang]);
          this.storeAssistant(m.timestamp, 'a-' + m.id + '-notdeleted', NOT_DELETED[pendingLang]);
        }
      }
      const text = m.text ?? '';
      const lang = detectLang(text);
      if (await fuzzyDeletionRequest(this.ai(), modelConfig(this.env), lang, text)) {
        this.state('pendingErase', JSON.stringify({ lang, expiresAt: Date.now() + CONFIRM_MS }));
        await sendText(this.env, m.from, PENDING_ERASE[lang]);
        this.storeAssistant(m.timestamp, 'a-' + m.id + '-pending', PENDING_ERASE[lang]);
        return;
      }
      const booked = this.state('booking');
      if (booked) {
        try {
          await this.handleBooking(m, JSON.parse(booked) as BookingState);
          return;
        } catch {
          this.state('booking', null);
        }
      }
      // A capture in progress owns the next message: after 24 hours of
      // silence the note goes out with what was gathered and this message
      // starts a fresh topic instead.
      const capRaw = this.state('capture');
      if (capRaw) {
        const cap = parseCapture(capRaw);
        if (!cap) {
          this.state('capture', null);
        } else if (Date.now() - cap.updatedAt >= CAPTURE_MS) {
          this.state('capture', null);
          await this.reasonHandoff(m, cap.reason, cap.lang, cap.opening, cap.answers, m.id + '-silent');
        } else {
          await this.answerCapture(m, cap);
          return;
        }
      }
      const saved = this.state('intake');
      if (saved) {
        const st = JSON.parse(saved) as IntakeState;
        const res = await intake(this.ai(), st, m.text ?? '', modelConfig(this.env));
        if (res.status === 'handoff') {
          this.state('intake', null);
          this.state('intakeReason', null);
          const fallback = FALLBACK[lang];
          await sendText(this.env, m.from, fallback);
          this.storeAssistant(m.timestamp, 'a-' + m.id, fallback);
          await this.notify(m);
          return;
        }
        st.answers.push((m.text ?? '').slice(0, 500));
        st.answers = st.answers.slice(-8);
        if (res.status === 'more' && st.asks < 2) {
          const follow = res.reply || INTAKE_FOLLOWUP[st.lang];
          await sendText(this.env, m.from, follow);
          this.storeAssistant(m.timestamp, 'a-' + m.id, follow);
          // An empty follow-up means the model text failed the reply
          // check: a person takes over from here.
          if (!res.reply) await this.notify(m);
          st.asks += 1;
          this.state('intake', JSON.stringify(st));
          return;
        }
        if (res.status === 'ready') {
          const service = normalizeService(st.service);
          if (service === 'first-call' || service === 'consultation') {
            await this.startBooking(m, st, service);
            return;
          }
        }
        await this.finishBooking(m, st);
        return;
      }
      // A new topic (no booking, intake or capture in progress) is
      // classified into exactly one reason; code decides what happens.
      const reason = await classify(this.ai(), modelConfig(this.env), joined, lang);
      const startIntake = async (service: IntakeState['service']): Promise<void> => {
        const ask = INTAKE_ASK[lang];
        await sendText(this.env, m.from, ask);
        this.storeAssistant(m.timestamp, 'a-' + m.id, ask);
        // A fresh intake starts with no reason tag: the tag is set only by
        // the flow/audit routes below, and finishBooking consumes it. Without
        // this, a tag from an aborted earlier intake would leak into the next
        // booking's operator note.
        this.state('intakeReason', null);
        const st: IntakeState = {
          lang,
          service,
          opening: (m.text ?? '').slice(0, 500),
          answers: [],
          asks: 1,
          phone: m.from,
        };
        this.state('intake', JSON.stringify(st));
      };
      switch (routeOf(reason)) {
        case 'question': {
          const history = this.historyTurns();
          const a = await answer(this.ai(), history, lang, modelConfig(this.env), m.from);
          if (a.booking) {
            // FR6: the service is model output, so it enters the state only
            // through the closed set; everything downstream (brief prompt,
            // registry, briefs table) reads the normalized value.
            await startIntake(normalizeService(a.service));
            return;
          }
          await sendText(this.env, m.from, a.reply);
          this.storeAssistant(m.timestamp, 'a-' + m.id, a.reply);
          if (a.handoff) await this.notify(m);
          return;
        }
        case 'booking-first-call':
        case 'booking-consultation': {
          await startIntake(routeOf(reason) === 'booking-consultation' ? 'consultation' : 'first-call');
          return;
        }
        case 'intake-flow':
        case 'intake-audit': {
          await startIntake('audit-flow');
          this.state('intakeReason', reason);
          return;
        }
        case 'my-booking': {
          const res = await calendarCall(this.env, {
            action: 'status',
            contactKey: contactKey('wa', m.from),
            service: 'first-call',
            minutes: 15,
            now: Date.now(),
          });
          if (!res.ok) {
            await this.calendarDown(m, lang, 'my-booking', [(m.text ?? '').slice(0, 500)], m.name ?? '');
            return;
          }
          if (res.active) {
            const active = res.active as ActiveInfo;
            const svc: BookingService =
            active.service === 'delivery'
              ? 'delivery'
              : active.service === 'consultation'
                ? 'consultation'
                : 'first-call';
            const seeded = seedFromActive(active, {
              lang,
              phone: m.from,
              name: m.name ?? '',
              service: svc,
              brief: [(m.text ?? '').slice(0, 500)],
            });
            this.state('booking', JSON.stringify(seeded));
            this.state('intake', null);
            const text = renderBooking(EXISTING[lang], { slot: formatSlot(active.start, lang) });
            await sendText(this.env, m.from, text);
            this.storeAssistant(m.timestamp, 'a-' + m.id + '-existing', text);
            return;
          }
          const text = reasonFixed('noBooking', lang);
          await sendText(this.env, m.from, text);
          this.storeAssistant(m.timestamp, 'a-' + m.id + '-nobooking', text);
          return;
        }
        case 'payment': {
          // How to pay is fixed code text; a receipt follows the proof path.
          const text = reasonFixed('howToPay', lang);
          await sendText(this.env, m.from, text);
          this.storeAssistant(m.timestamp, 'a-' + m.id + '-howtopay', text);
          return;
        }
        case 'open-source': {
          const history = this.historyTurns();
          const a = await answer(this.ai(), history, lang, modelConfig(this.env), m.from, ['github.com']);
          // Docs and issues links live on github.com, so the check admits
          // that host; a failing reply still never hands off to a person.
          const text = a.handoff ? reasonFixed('openSourceFallback', lang) : a.reply;
          await sendText(this.env, m.from, text);
          this.storeAssistant(m.timestamp, 'a-' + m.id, text);
          return;
        }
        case 'vendor': {
          const text = reasonFixed('vendor', lang);
          await sendText(this.env, m.from, text);
          this.storeAssistant(m.timestamp, 'a-' + m.id + '-vendor', text);
          return;
        }
        case 'off-topic': {
          const text = reasonFixed('offTopic', lang);
          await sendText(this.env, m.from, text);
          this.storeAssistant(m.timestamp, 'a-' + m.id + '-offtopic', text);
          return;
        }
        default: {
          if (!isCaptureReason(reason)) {
            await this.notify(m);
            const fallback = FALLBACK[lang];
            await sendText(this.env, m.from, fallback);
            this.storeAssistant(m.timestamp, 'a-' + m.id, fallback);
            return;
          }
          if (reason === 'complaint' && complaintSays(joined)) {
            // The message already says what happened: ack and hand off.
            const ack = reasonFixed('complaintAck', lang);
            await sendText(this.env, m.from, ack);
            this.storeAssistant(m.timestamp, 'a-' + m.id + '-ack', ack);
            await this.reasonHandoff(m, reason, lang, joined.slice(0, 500), [], m.id);
            return;
          }
          await this.startCapture(m, reason, lang, joined.slice(0, 500));
          return;
        }
      }
    } else {
      this.state('intake', null);
      const lang = 'es' as const;
      const mediaIn: Inbound = { id: last.id, from, timestamp: last.at, type: last.type };
      if (last.media_id) mediaIn.mediaId = last.media_id;
      if (last.mime) mediaIn.mime = last.mime;
      if (name !== undefined) mediaIn.name = name;
      // A held booking's receipt is read as a proof and never says NON_TEXT.
      if (await this.proofIfHeld(mediaIn)) return;
      await sendText(this.env, m.from, NON_TEXT[lang]);
      this.storeAssistant(m.timestamp, 'a-' + m.id, NON_TEXT[lang]);
      await this.notify(m);
      }
    } catch (e) {
      if (!isGuardOver(e)) throw e;
      // The Worker ran out of model calls mid-burst: the fixed sentence
      // and a handoff, unless this burst already answered the client.
      if (!replied) {
        const lang = detectLang(joined);
        await sendText(this.env, from, FALLBACK[lang]);
        this.storeAssistant(last.at, 'a-' + last.id + '-global', FALLBACK[lang]);
        await this.notify(m);
      }
    }
  }

  /** A held consultation's receipt goes to the operator next to the vision
   *  model's reading, and the client is told a person checks it. The agent
   *  never confirms a payment by itself. Resolves to true only when the
   *  proof path ran; anything else keeps today's handoff. */
  private async proofIfHeld(mediaIn: Inbound): Promise<boolean> {
    try {
      if (!mediaIn.mediaId) return false;
      if (!isProofMedia(mediaIn.type, mediaIn.mime)) return false;
      const raw = this.state('booking');
      if (!raw) return false;
      const st = JSON.parse(raw) as BookingState;
      if (st.phase !== 'held') return false;
      // One hold gets at most 3 receipt readings: later files are forwarded
      // to the operator unread, with no vision-model call.
      const gcfg = guardConfig(this.env);
      const holdKey = st.eventId ?? st.start ?? 'held';
      const use = this.proofUse();
      const usedHold = use.hold === holdKey ? use.count : 0;
      if (usedHold >= gcfg.proofsPerHold) {
        const fwd = await forwardUnread(
          this.env,
          st,
          { id: mediaIn.mediaId, kind: mediaIn.type, mime: mediaIn.mime },
          this.state('name') ?? ''
        );
        if (!fwd) return false;
        await this.note(fwd.operatorText, 'PAGO', 'normal');
        await sendText(this.env, mediaIn.from, fwd.clientText);
        this.storeAssistant(mediaIn.timestamp, 'a-' + mediaIn.id + '-proof', fwd.clientText);
        await this.armNext(Date.now());
        return true;
      }
      // The vision reading is a model call: it never runs past the daily limit.
      if (!(await guardModelTake(this.env, st.lang))) throw new Error(GUARD_OVER);
      const cfg = bookingConfig(this.env);
      const res = await readProof(
        this.env,
        st,
        { id: mediaIn.mediaId, kind: mediaIn.type, mime: mediaIn.mime },
        proofConfig(this.env),
        cfg.payee ?? '',
        this.state('name') ?? ''
      );
      if (!res) return false;
      st.proof = res.proof;
      this.state('booking', JSON.stringify(st));
      this.state('guardProof', JSON.stringify({ hold: holdKey, count: usedHold + 1 }));
      await this.note(res.operatorText, 'PAGO', 'normal');
      await sendText(this.env, mediaIn.from, res.clientText);
      this.storeAssistant(mediaIn.timestamp, 'a-' + mediaIn.id + '-proof', res.clientText);
      await this.armNext(Date.now());
      return true;
    } catch (e) {
      // The Worker-wide limit denies the vision reading: the burst must
      // fall back to the fixed sentence with a handoff, never NON_TEXT.
      if (isGuardOver(e)) throw e;
      return false;
    }
  }

  /** The last client turns, capped for any model call; storage keeps the full text. */
  private historyTurns(): Array<Turn> {
    const gcfg = guardConfig(this.env);
    const rows = this.ctx.storage.sql
      .exec('SELECT role, text FROM messages WHERE text IS NOT NULL ORDER BY rowid DESC LIMIT 12')
      .toArray() as Array<{ role: string; text: string }>;
    return rows
      .reverse()
      .map((r) => ({ role: (r.role === 'operator' ? 'assistant' : r.role) as Turn['role'], text: capTurn(gcfg, r.text) }));
  }

  /** Hand off a reason capture: the tagged operator note, then the closing template. */
  private async reasonHandoff(
    m: { from: string; name?: string },
    reason: CaptureReason,
    lang: Lang,
    opening: string,
    answers: string[],
    stamp: string
  ): Promise<void> {
    this.state('handoff', '1');
    this.state('capture', null);
    const registered = await register(this.env, {
      phone: m.from,
      name: m.name ?? '',
      lang,
      kind: 'handoff',
      service: reason,
    });
    this.state('name', registered);
    const tag = REASON_TAG[reason] ?? 'PERSONA';
    const priority = priorityOf(reason);
    const note = formatReasonNote({
      name: cleanName(m.name ?? ''),
      phone: m.from,
      lang,
      tag,
      priority,
      opening,
      answers,
    });
    // High-priority notes skip the per-client throttle: they always go out.
    if (priority === 'high' || (await guardHandoff(this.env, m.from))) {
      await this.note(note, tag, priority);
    }
    // While the operator holds notices the client hears when a person
    // answers instead of the closing, and the agent keeps answering.
    const held = await guardQuietHold(this.env);
    const text = held
      ? awayNotice(lang, formatSlot(new Date(nextBusinessMorning(Date.now())).toISOString(), lang))
      : reasonClosing(reason, lang);
    await sendText(this.env, m.from, text);
    this.storeAssistant(Math.floor(Date.now() / 1000), 'a-' + stamp + '-closing', text);
    await this.armNext(Date.now());
  }

  /** One more answer inside an open capture: ask next, or hand off. */
  private async answerCapture(m: Inbound, cap: CaptureState): Promise<void> {
    const declined = isDecline(m.text ?? '', cap.lang);
    if (!declined) cap.answers.push((m.text ?? '').slice(0, 500));
    cap.updatedAt = Date.now();
    const step = nextCaptureStep(cap.reason, cap.lang, cap.answers, declined);
    if (step.action === 'handoff') {
      await this.reasonHandoff(m, cap.reason, cap.lang, cap.opening, cap.answers, m.id);
      return;
    }
    cap.asks += 1;
    this.state('capture', JSON.stringify(cap));
    await sendText(this.env, m.from, step.question);
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-capture', step.question);
    await this.armNext(Date.now());
  }

  /** A new topic that needs a person: ask the first fixed question. */
  private async startCapture(m: Inbound, reason: CaptureReason, lang: Lang, opening: string): Promise<void> {
    const cap: CaptureState = {
      reason,
      lang,
      phone: m.from,
      name: m.name ?? '',
      opening: opening.slice(0, 500),
      answers: [],
      asks: 1,
      updatedAt: Date.now(),
    };
    this.state('capture', JSON.stringify(cap));
    if (reason === 'complaint') {
      const text = reasonFixed('complaintAck', lang) + '\n' + reasonAsk(reason, lang)[0];
      await sendText(this.env, m.from, text);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-capture', text);
    } else {
      const question = reasonAsk(reason, lang)[0];
      await sendText(this.env, m.from, question);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-capture', question);
    }
    await this.armNext(Date.now());
  }

  private async notify(m: Inbound): Promise<void> {
    this.state('handoff', '1');
    const lang = detectLang(m.text ?? '');
    const registered = await register(this.env, {
      phone: m.from,
      name: m.name ?? '',
      lang,
      kind: 'handoff',
      service: '',
    });
    this.state('name', registered);
    // The operator gets at most one handoff notice per client every 10
    // minutes: a later notice inside that window is dropped here.
    if (!(await guardHandoff(this.env, m.from))) return;
    const who = (m.name ? m.name + ' ' : '') + '+' + m.from;
    const text = (who + ': ' + (m.text ?? '[' + m.type + ']')).slice(0, 900);
    await this.note(text, 'MENSAJE', 'normal');
  }
}

