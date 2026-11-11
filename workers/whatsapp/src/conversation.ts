import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { markRead, sendText, type Inbound } from './meta';
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
import { alarmAt, deletionRequest, ERASED, operatorErased } from './erase';
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
  HOLD_PREFIX,
  type GoogleOAuth,
} from './google';
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
    const now = Date.now();
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
          let settled = false;
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
              settled = true;
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
              settled = true;
            }
          } catch {
            /* transient calendar failure: re-arm below and retry */
          }
          if (settled) {
            if (ret > now) await this.ctx.storage.setAlarm(ret);
            else await this.ctx.storage.deleteAlarm();
          } else {
            const next = Math.min(deadline, now + HOLD_CHECK_MS);
            await this.ctx.storage.setAlarm(ret > 0 ? Math.min(next, ret) : next);
          }
          return;
        }
      }
      if (ret > now) {
        await this.ctx.storage.setAlarm(ret);
        return;
      }
    }
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
  }

  private async finishBooking(m: Inbound, st: IntakeState): Promise<void> {
    this.state('handoff', '1');
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    const b = await brief(this.env.AI, st, modelConfig(this.env));
    this.briefs(1, m.timestamp, m.from, m.name ?? '', st.lang, st.service, JSON.stringify(b.bullets));
    const note = formatBrief({
      name: m.name ?? '',
      phone: m.from,
      lang: st.lang,
      service: st.service,
      bullets: b.bullets,
    });
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
    const note = formatBrief({ name, phone: m.from, lang, service, bullets });
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
      await sendText(
        this.env,
        operator,
        formatBrief({ name: st.name, phone: st.phone, lang: st.lang, service: st.service, bullets: st.brief })
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
    if (m.type === 'text') {
      const erased = deletionRequest(m.text ?? '');
      if (erased) {
        await this.erase(m, erased);
        return;
      }
    }
    const existing = this.ctx.storage.sql
      .exec('SELECT 1 FROM messages WHERE id = ? LIMIT 1', m.id)
      .toArray();
    if (existing.length > 0) return;
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
    this.state('retention', String(retention));
    await markRead(this.env, m.id);
    const operator = this.env.OPERATOR_PHONE.replace(/\D/g, '');
    if (m.from === operator) return;
    if (m.type === 'text') {
      const lang = detectLang(m.text ?? '');
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
        .map((r) => ({ role: r.role as Turn['role'], text: r.text }));
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
    const text = (
      'UniverLab · ' + (m.name ? m.name + ' ' : '') + '+' + m.from + ': ' + (m.text ?? '[' + m.type + ']')
    ).slice(0, 900);
    try {
      await sendText(this.env, operator, text);
    } catch {
      /* ignored */
    }
  }
}

