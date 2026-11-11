import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { burstConfig } from './env';
import { burstDue, joinBurst, nextAlarm, type BurstState } from './burst';
import { markRead, sendText, type Inbound } from './meta';
import { transcribe, voiceConfig, VOICE_HANDOFF } from './audio';
import { answer, FALLBACK, modelConfig, type Turn } from './brain';
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
  freeSlots,
  type BookingConfig,
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
  type GoogleOAuth,
} from './google';
import { register, release } from './registry';
import {
  CALENDAR_DOWN,
  CANCELLED,
  CONFIRMED,
  decide,
  EXPIRED,
  HOLD_SENT,
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
/** A taken conversation returns to the agent after 24 hours without operator messages. */
const TAKEN_MS = 24 * 3600 * 1000;
/** While a hold is pending the alarm re-checks the calendar at least hourly. */
const HOLD_CHECK_MS = 3600 * 1000;

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

function calendarReady(env: Env): boolean {
  return googleOAuth(env) !== null && !!env.WORKBENCH_CALENDAR_ID;
}

export const NON_TEXT = {
  es: 'Por ahora solo leo mensajes de texto. Le paso esto a una persona del laboratorio.',
  en: 'For now I only read text messages. I am passing this to someone at the lab.',
};

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
        media_id TEXT
      )
    `);
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

  /** The taken flag's short code, '' when absent or corrupt. */
  private takenCode(): string {
    try {
      const raw = this.state('taken');
      if (!raw) return '';
      return ((JSON.parse(raw) as { code?: unknown }).code as string) ?? '';
    } catch {
      return '';
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
    return Response.json(await this.control(body as { action?: unknown }));
  }

  /** Run one operator command against this conversation. */
  async control(action: { action?: unknown; code?: unknown; text?: unknown }): Promise<{ ok: boolean }> {
    this.ensureSchema();
    if (action.action === 'take') {
      if (typeof action.code !== 'string' || !action.code) return { ok: false };
      this.state('taken', JSON.stringify({ code: action.code, at: Date.now() }));
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
      // An operator message restarts the 24-hour taken clock.
      const takenRaw = this.state('taken');
      if (takenRaw) {
        try {
          const taken = JSON.parse(takenRaw) as { code?: string };
          this.state('taken', JSON.stringify({ code: taken.code ?? '', at }));
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
    return { ok: false };
  }

  /** Confirm a held paid booking, the same as removing [Por confirmar] in the calendar. */
  private async operatorConfirm(): Promise<{ ok: boolean }> {
    try {
      const raw = this.state('booking');
      if (!raw) return { ok: false };
      const st = JSON.parse(raw) as BookingState;
      if (st.phase !== 'held' || !st.eventId) return { ok: false };
      const oauth = googleOAuth(this.env);
      const wbId = this.env.WORKBENCH_CALENDAR_ID;
      if (!oauth || !wbId) return { ok: false };
      const token = await accessToken(oauth);
      await patchEvent(token, wbId, st.eventId, {
        summary: serviceLabel(st.lang, st.service) + ' · ' + (st.name || '+' + st.phone),
      });
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
      const oauth = googleOAuth(this.env);
      const wbId = this.env.WORKBENCH_CALENDAR_ID;
      if (!oauth || !wbId) return { ok: false };
      const token = await accessToken(oauth);
      try {
        await deleteEvent(token, wbId, st.eventId);
      } catch {
        /* already gone */
      }
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

  private async erase(m: Inbound, lang: Lang): Promise<void> {
    try {
      const raw = this.state('booking');
      if (raw) {
        const st = JSON.parse(raw) as Partial<BookingState>;
        const oauth = googleOAuth(this.env);
        if (st.eventId && oauth && this.env.WORKBENCH_CALENDAR_ID) {
          try {
            await deleteEvent(await accessToken(oauth), this.env.WORKBENCH_CALENDAR_ID, st.eventId);
          } catch {
            /* the event is already gone */
          }
        }
      }
    } catch {
      /* storage without a booking leaves nothing to release */
    }
    const handedOff = this.state('handoff') !== null;
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
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
      try {
        await sendText(this.env, operator, operatorErased(m.from));
      } catch {
        /* ignored */
      }
    }
  }

  async alarm(): Promise<void> {
    this.ensureSchema();
    let now = Date.now();
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    // A taken conversation returns to the agent on its own after 24 hours
    // without operator messages, and the operator is told.
    const takenRaw = this.state('taken');
    if (takenRaw) {
      try {
        const taken = JSON.parse(takenRaw) as { code?: string; at?: number };
        if (typeof taken.at === 'number' && now >= taken.at + TAKEN_MS) {
          this.state('taken', null);
          const text =
            'UniverLab [' + (taken.code ?? '') + '] · pasaron 24 horas sin mensajes del operador: retomé la conversación.';
          try {
            await sendText(this.env, operator, text);
          } catch {
            /* ignored */
          }
          // The notice is for the operator: it never enters the client's
          // history as an assistant turn.
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
        const oauth = googleOAuth(this.env);
        const wbId = this.env.WORKBENCH_CALENDAR_ID;
        if (oauth && wbId) {
          const deadline = st.createdAt + HOLD_MS;
          try {
            const token = await accessToken(oauth);
            const ev = await getEvent(token, wbId, st.eventId);
            if (ev !== null && !ev.summary.startsWith(HOLD_PREFIX)) {
              st.phase = 'booked';
              this.state('booking', JSON.stringify(st));
              const text = renderBooking(CONFIRMED[st.lang], {
                slot: formatSlot(st.start ?? '', st.lang),
              });
              await sendText(this.env, st.phone, text);
              this.storeAssistant(Math.floor(now / 1000), 'a-alarm-confirm-' + st.eventId, text);
              await this.deregister(st.phone);
            } else if (now >= deadline) {
              if (ev !== null) {
                try {
                  await deleteEvent(token, wbId, st.eventId);
                } catch {
                  /* already gone */
                }
              }
              this.state('booking', null);
              const text = EXPIRED[st.lang];
              await sendText(this.env, st.phone, text);
              this.storeAssistant(Math.floor(now / 1000), 'a-alarm-expire-' + st.eventId, text);
              await this.deregister(st.phone);
            }
          } catch {
            /* transient calendar failure: re-arm below and retry */
          }
          await this.armNext(now);
          return;
        }
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
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    const b = await brief(this.env.AI, st, modelConfig(this.env));
    this.briefs(1, m.timestamp, m.from, m.name ?? '', st.lang, st.service, JSON.stringify(b.bullets));
    const code = await register(this.env, {
      phone: m.from,
      name: m.name ?? '',
      lang: st.lang,
      kind: 'handoff',
      service: st.service,
    });
    this.state('code', code);
    const note = formatBrief({
      name: m.name ?? '',
      phone: m.from,
      lang: st.lang,
      service: st.service,
      bullets: b.bullets,
    }).replace('UniverLab ·', 'UniverLab [' + code + '] ·');
    await sendText(this.env, operator, note);
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
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    const code = await register(this.env, {
      phone: m.from,
      name,
      lang,
      kind: 'handoff',
      service,
    });
    this.state('code', code);
    const note = formatBrief({ name, phone: m.from, lang, service, bullets }).replace(
      'UniverLab ·',
      'UniverLab [' + code + '] ·'
    );
    try {
      await sendText(this.env, operator, 'La agenda falló: agendar a mano.\n' + note);
    } catch {
      /* ignored */
    }
    const down = CALENDAR_DOWN[lang];
    await sendText(this.env, m.from, down);
    this.storeAssistant(m.timestamp, 'a-' + m.id + '-caldown', down);
  }

  private async startBooking(
    m: Inbound,
    st: IntakeState,
    service: BookingService
  ): Promise<void> {
    const cfg = bookingConfig(this.env);
    if (!calendarReady(this.env)) {
      await this.finishBooking(m, st);
      return;
    }
    const b = await brief(this.env.AI, st, modelConfig(this.env));
    const minutes = service === 'consultation' ? 60 : 15;
    try {
      const oauth = googleOAuth(this.env) as GoogleOAuth;
      const wbId = this.env.WORKBENCH_CALENDAR_ID as string;
      const token = await accessToken(oauth);
      const now = Date.now();
      const timeMin = new Date(now).toISOString();
      const timeMax = new Date(now + cfg.horizonDays * 86400000).toISOString();
      const busy = await freeBusy(token, timeMin, timeMax, ['primary']);
      const events = await listEvents(token, wbId, timeMin, timeMax);
      const slots = freeSlots(cfg, busy, events, minutes, now).slice(0, 5);
      if (slots.length === 0) {
        await this.finishBooking(m, st);
        return;
      }
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
    } catch {
      await this.calendarDown(m, st.lang, st.service, b.bullets, m.name ?? '');
    }
  }

  private async pickSlot(
    m: Inbound,
    st: BookingState,
    cfg: BookingConfig,
    oauth: GoogleOAuth,
    wbId: string,
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
    const minutes = st.service === 'consultation' ? 60 : 15;
    const endIso = new Date(Date.parse(startIso) + minutes * 60000).toISOString();
    // A paid (operator-confirmed) consultation stays confirmed when the
    // client moves it; only unpaid holds carry the [Por confirmar] prefix.
    const hold = st.service === 'consultation' && st.phase !== 'booked';
    let createdId: string | undefined;
    try {
      const token = await accessToken(oauth);
      if (st.eventId) {
        try {
          await deleteEvent(token, wbId, st.eventId);
        } catch {
          /* replaced anyway */
        }
      }
      const ev = await insertEvent(token, wbId, {
        summary:
          (hold ? HOLD_PREFIX : '') + serviceLabel(st.lang, st.service) + ' · ' + (st.name || '+' + st.phone),
        description: formatBrief({
          name: st.name,
          phone: st.phone,
          lang: st.lang,
          service: st.service,
          bullets: st.brief,
        }),
        startIso,
        endIso,
      });
      createdId = ev.id;
      const now = Date.now();
      st.phase = hold ? 'held' : 'booked';
      st.eventId = ev.id;
      st.start = startIso;
      if (hold) st.createdAt = now;
      this.state('booking', JSON.stringify(st));
      if (hold) {
        const code = await register(this.env, {
          phone: st.phone,
          name: st.name,
          lang: st.lang,
          kind: 'hold',
          service: st.service,
          start: startIso,
          eventId: ev.id,
        });
        this.state('code', code);
      }
      const slotText = formatSlot(startIso, st.lang);
      const text = hold
        ? renderBooking(HOLD_SENT[st.lang], { slot: slotText, payments: paymentText(cfg, st.lang) })
        : renderBooking(PICKED[st.lang], {
            slot: slotText,
            service: serviceLabel(st.lang, st.service),
          });
      await sendText(this.env, m.from, text);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-booked', text);
      const ret = Number(this.state('retention') ?? '0');
      const when = hold
        ? ret > 0
          ? Math.min(now + HOLD_CHECK_MS, ret)
          : now + HOLD_CHECK_MS
        : ret;
      if (when > 0) await this.ctx.storage.setAlarm(when);
    } catch {
      if (createdId) {
        try {
          await deleteEvent(await accessToken(oauth), wbId, createdId);
        } catch {
          /* best effort: the operator still gets the brief */
        }
      }
      await this.calendarDown(m, st.lang, st.service, st.brief, st.name);
    }
  }

  private async cancelBooking(
    m: Inbound,
    st: BookingState,
    cfg: BookingConfig,
    oauth: GoogleOAuth,
    wbId: string
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
      await this.reoffer(m, st, cfg, oauth, wbId, '', true);
      return;
    }
    try {
      const token = await accessToken(oauth);
      try {
        await deleteEvent(token, wbId, st.eventId);
      } catch {
        /* already gone */
      }
      this.state('booking', null);
      this.state('handoff', '1');
      const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
      const code = await register(this.env, {
        phone: st.phone,
        name: st.name,
        lang: st.lang,
        kind: 'handoff',
        service: st.service,
      });
      this.state('code', code);
      await sendText(
        this.env,
        operator,
        formatBrief({ name: st.name, phone: st.phone, lang: st.lang, service: st.service, bullets: st.brief }).replace(
          'UniverLab ·',
          'UniverLab [' + code + '] ·'
        )
      );
      const text = renderBooking(CANCELLED[st.lang], {
        service: serviceLabel(st.lang, st.service),
        slot: formatSlot(st.start, st.lang),
      });
      await sendText(this.env, m.from, text);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-cancel', text);
    } catch {
      await this.calendarDown(m, st.lang, st.service, st.brief, st.name);
    }
  }

  private async reoffer(
    m: Inbound,
    st: BookingState,
    cfg: BookingConfig,
    oauth: GoogleOAuth,
    wbId: string,
    dayKey = '',
    movedNote = false
  ): Promise<void> {
    const minutes = st.service === 'consultation' ? 60 : 15;
    try {
      const token = await accessToken(oauth);
      const now = Date.now();
      const timeMin = new Date(now).toISOString();
      const timeMax = new Date(now + cfg.horizonDays * 86400000).toISOString();
      const busy = await freeBusy(token, timeMin, timeMax, ['primary']);
      const events = await listEvents(token, wbId, timeMin, timeMax);
      const slots = freeSlots(cfg, busy, events, minutes, now);
      let picked = dayKey ? slots.filter((s) => bogotaDateKey(Date.parse(s)) === dayKey) : slots;
      if (picked.length === 0) picked = slots;
      if (picked.length === 0) {
        await this.notify(m);
        const fallback = FALLBACK[st.lang];
        await sendText(this.env, m.from, fallback);
        this.storeAssistant(m.timestamp, 'a-' + m.id, fallback);
        return;
      }
      st.offered = picked.slice(0, 5);
      this.state('booking', JSON.stringify(st));
      const text =
        (movedNote ? MOVE_ONCE[st.lang] : '') +
        offerText(st.lang, st.offered.map((s) => formatSlot(s, st.lang)));
      await sendText(this.env, m.from, text);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-reoffer', text);
    } catch {
      await this.calendarDown(m, st.lang, st.service, st.brief, st.name);
    }
  }

  private async handleBooking(m: Inbound, st: BookingState): Promise<void> {
    const cfg = bookingConfig(this.env);
    const oauth = googleOAuth(this.env);
    const wbId = this.env.WORKBENCH_CALENDAR_ID;
    if (!oauth || !wbId) {
      await this.calendarDown(m, st.lang, st.service, st.brief, st.name);
      return;
    }
    const res = await decide(
      this.env.AI,
      modelConfig(this.env),
      {
        lang: st.lang,
        service: st.service,
        phase: st.phase,
        offered: st.offered.map((s) => formatSlot(s, st.lang)),
        today: bogotaDateKey(Date.now()),
        eventStart: st.start,
      },
      m.text ?? ''
    );
    if (res.action === 'pick') {
      await this.pickSlot(m, st, cfg, oauth, wbId, res.slot);
      return;
    }
    if (res.action === 'cancel') {
      await this.cancelBooking(m, st, cfg, oauth, wbId);
      return;
    }
    if (res.action === 'move' || res.action === 'day') {
      await this.reoffer(m, st, cfg, oauth, wbId, res.action === 'day' ? res.date : '');
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
    if ((m.type === 'audio' || m.type === 'voice') && m.text === undefined) {
      const cfg = voiceConfig(this.env);
      const t =
        !(m.duration !== undefined && m.duration > cfg.maxSeconds) && m.mediaId !== undefined
          ? await transcribe(this.env, cfg, m.mediaId)
          : { ok: false as const };
      if (t.ok) {
        m.text = t.text;
        m.mediaId = undefined;
      } else {
        voiceFailed = true;
      }
    }
    if (m.text !== undefined) {
      const erased = deletionRequest(m.text);
      if (erased) {
        await this.erase(m, erased);
        return;
      }
    }
    this.ctx.storage.sql.exec(
      'INSERT INTO messages (id, at, role, type, text, media_id) VALUES (?, ?, ?, ?, ?, ?)',
      m.id,
      m.timestamp,
      'user',
      m.type,
      m.text ?? null,
      m.mediaId ?? null
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
    // While taken, the agent stays silent and the client's messages are
    // relayed to the operator with the short code.
    const takenRaw = this.state('taken');
    if (takenRaw) {
      const code = this.takenCode();
      const relay = (
        'UniverLab [' + code + '] · ' + (m.name ? m.name + ' ' : '') + '+' + m.from + ': ' + (m.text ?? '[' + m.type + ']')
      ).slice(0, 900);
      try {
        await sendText(this.env, operator, relay);
      } catch {
        /* ignored */
      }
      await this.armNext(Date.now());
      return;
    }
    // A voice note that could not be transcribed goes to a person, like
    // every other non-text message, and the client is told who listens.
    if (voiceFailed) {
      await sendText(this.env, m.from, VOICE_HANDOFF['es']);
      this.storeAssistant(m.timestamp, 'a-' + m.id + '-voice', VOICE_HANDOFF['es']);
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
  ): Array<{ id: string; at: number; type: string; text: string | null }> {
    const rows = this.ctx.storage.sql
      .exec("SELECT id, at, type, text FROM messages WHERE role = 'user' ORDER BY at ASC, rowid ASC")
      .toArray() as Array<{ id: string; at: number; type: string; text: string | null }>;
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
    try {
      const raw = this.state('taken');
      if (raw) {
        const taken = JSON.parse(raw) as Partial<{ at: number }>;
        if (typeof taken.at === 'number' && Number.isFinite(taken.at) && taken.at + TAKEN_MS > now) {
          deadlines.push(taken.at + TAKEN_MS);
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
      const code = this.takenCode();
      const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
      for (const r of rows) {
        const relay = (
          'UniverLab [' + code + '] · ' + (name ? name + ' ' : '') + '+' + from + ': ' + (r.text ?? '[' + r.type + ']')
        ).slice(0, 900);
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
    const m: Inbound = {
      id: last.id,
      from,
      timestamp: last.at,
      type: texts.length > 0 ? 'text' : last.type,
    };
    if (name !== undefined) m.name = name;
    const joined = joinBurst(texts.map((r) => ({ at: r.at, text: r.text as string })));
    if (joined !== '') m.text = joined;
    const firstMedia = rows.find((r) => r.type !== 'text' && r.text === null);
    if (texts.length > 0 && firstMedia !== undefined) {
      // A burst mixing text and media: the text is answered below as one
      // turn, and the media keeps today's handoff exactly once per burst.
      const mediaLang = detectLang(joined);
      await sendText(this.env, from, NON_TEXT[mediaLang]);
      this.storeAssistant(firstMedia.at, 'a-' + firstMedia.id + '-nontext', NON_TEXT[mediaLang]);
      const mediaIn: Inbound = { id: firstMedia.id, from, timestamp: firstMedia.at, type: firstMedia.type };
      if (name !== undefined) mediaIn.name = name;
      await this.notify(mediaIn);
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
      if (await fuzzyDeletionRequest(this.env.AI, modelConfig(this.env), lang, text)) {
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
      const saved = this.state('intake');
      if (saved) {
        const st = JSON.parse(saved) as IntakeState;
        const res = await intake(this.env.AI, st, m.text ?? '', modelConfig(this.env));
        if (res.status === 'handoff') {
          this.state('intake', null);
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
      const rows = this.ctx.storage.sql
        .exec('SELECT role, text FROM messages WHERE text IS NOT NULL ORDER BY rowid DESC LIMIT 12')
        .toArray() as Array<{ role: string; text: string }>;
      const history = rows
        .reverse()
        .map((r) => ({ role: (r.role === 'operator' ? 'assistant' : r.role) as Turn['role'], text: r.text }));
      const a = await answer(this.env.AI, history, lang, modelConfig(this.env));
      if (a.booking) {
        const ask = INTAKE_ASK[lang];
        await sendText(this.env, m.from, ask);
        this.storeAssistant(m.timestamp, 'a-' + m.id, ask);
        const st: IntakeState = {
          lang,
          service: a.service,
          opening: (m.text ?? '').slice(0, 500),
          answers: [],
          asks: 1,
        };
        this.state('intake', JSON.stringify(st));
        return;
      }
      await sendText(this.env, m.from, a.reply);
      this.storeAssistant(m.timestamp, 'a-' + m.id, a.reply);
      if (a.handoff) await this.notify(m);
    } else {
      this.state('intake', null);
      const lang = 'es' as const;
      await sendText(this.env, m.from, NON_TEXT[lang]);
      this.storeAssistant(m.timestamp, 'a-' + m.id, NON_TEXT[lang]);
      await this.notify(m);
    }
  }

  private async notify(m: Inbound): Promise<void> {
    this.state('handoff', '1');
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    const code = await register(this.env, {
      phone: m.from,
      name: m.name ?? '',
      lang: detectLang(m.text ?? ''),
      kind: 'handoff',
      service: '',
    });
    this.state('code', code);
    const text = (
      'UniverLab [' + code + '] · ' + (m.name ? m.name + ' ' : '') + '+' + m.from + ': ' + (m.text ?? '[' + m.type + ']')
    ).slice(0, 900);
    try {
      await sendText(this.env, operator, text);
    } catch {
      /* ignored */
    }
  }
}

