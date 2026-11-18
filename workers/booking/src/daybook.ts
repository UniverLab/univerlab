import type { Env } from './env';
import { HOLD_PREFIX, type CalEvent } from './google';
import { SERVICE_LABEL } from './booking-common';
import { calendarCall } from './calendar-client';
import { bogotaDateKey, bogotaParts } from './schedule';

/**
 * The morning booking digest: one scheduled message with the day's bookings. The
 * Worker wakes every 30 minutes on its Cron Trigger; only the 06:30
 * America/Bogota run sends, so the time is configuration, not code.
 */
export interface BookingDigestConfig {
  /** Bogota wall-clock hour of the digest run. */
  hour: number;
  /** Bogota wall-clock minute of the digest run. */
  minute: number;
  /** The scheduled run sends nothing while false. */
  enabled: boolean;
}

export const DEFAULT_BOOKING_DIGEST_CONFIG: BookingDigestConfig = { hour: 6, minute: 30, enabled: true };

/** Parse the BOOKING_DIGEST_CONFIG deploy variable; any missing or invalid field falls back. */
export function bookingDigestConfig(env: { BOOKING_DIGEST_CONFIG?: string }): BookingDigestConfig {
  const base: BookingDigestConfig = { ...DEFAULT_BOOKING_DIGEST_CONFIG };
  const raw = env.BOOKING_DIGEST_CONFIG?.trim();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as { hour?: unknown; minute?: unknown; enabled?: unknown };
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return base;
    if (
      typeof parsed.hour === 'number' &&
      Number.isFinite(parsed.hour) &&
      parsed.hour >= 0 &&
      parsed.hour <= 23
    ) {
      base.hour = Math.floor(parsed.hour);
    }
    if (
      typeof parsed.minute === 'number' &&
      Number.isFinite(parsed.minute) &&
      parsed.minute >= 0 &&
      parsed.minute <= 59
    ) {
      base.minute = Math.floor(parsed.minute);
    }
    if (typeof parsed.enabled === 'boolean') base.enabled = parsed.enabled;
    return base;
  } catch {
    return base;
  }
}

/**
 * Whether this instant is at or after the configured digest time in Bogota
 * wall time. The Worker wakes every 30 minutes, so a configured minute the
 * cron never hits (:15, say) fires on the next wake instead of never, and a
 * run that failed retries on the next wake; the day marker keeps the retries
 * from sending twice.
 */
export function isBookingDigestSlot(nowMs: number, cfg: BookingDigestConfig): boolean {
  if (!cfg.enabled) return false;
  const p = bogotaParts(nowMs);
  return p.hour * 60 + p.minute >= cfg.hour * 60 + cfg.minute;
}

export interface BookingDigestItem {
  start: string;
  service: string;
  name: string;
  /** A hold ([Por confirmar] prefix) is unpaid; anything else counts as paid. */
  paid: boolean;
}

/**
 * The calendar summary carries the service in the client's language; the
 * operator reads Spanish, so a known label is folded back to the Spanish one.
 */
const SERVICE_KEY_BY_LABEL = new Map<string, string>();
for (const labels of Object.values(SERVICE_LABEL)) {
  for (const [key, label] of Object.entries(labels)) {
    SERVICE_KEY_BY_LABEL.set(label.trim().toLowerCase(), key);
  }
}

function serviceLabelEs(raw: string): string {
  const key = SERVICE_KEY_BY_LABEL.get(raw.trim().toLowerCase());
  return key ? SERVICE_LABEL.es[key] : raw;
}

/** A first call is free; a paid session is paid or still waiting for it. */
function paymentLabel(service: string, paid: boolean): string {
  if (service === SERVICE_LABEL.es['first-call']) return 'gratis';
  return paid ? 'pagada' : 'sin pagar';
}

/**
 * The day's bookings from the same calendar events the booking code writes:
 * the hold prefix carries the payment state, `label · name` the service and
 * the conversation name. Unknown summaries are kept as they are.
 */
export function bookingDigestItems(events: CalEvent[]): BookingDigestItem[] {
  return events
    .map((e) => {
      const paid = !e.summary.startsWith(HOLD_PREFIX);
      const bare = paid ? e.summary : e.summary.slice(HOLD_PREFIX.length);
      const sep = bare.indexOf(' · ');
      return {
        start: e.start,
        service: serviceLabelEs(sep >= 0 ? bare.slice(0, sep).trim() || bare : bare),
        name: sep >= 0 ? bare.slice(sep + 3).trim() : '',
        paid,
      } satisfies BookingDigestItem;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** Bogota HH:mm of an event start; the raw input when it does not parse. */
function bogotaHHMM(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const p = bogotaParts(ms);
  return String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0');
}

/**
 * The digest body the operator receives. Empty when the day holds nothing,
 * so a quiet day sends nothing at all.
 */
export function formatBookingDigest(items: BookingDigestItem[]): string {
  if (items.length === 0) return '';
  const lines = items.map(
    (i) =>
      bogotaHHMM(i.start) + ' · ' + i.service + ' · ' + i.name + ' · ' + paymentLabel(i.service, i.paid)
  );
  return 'Agenda de hoy (' + items.length + '):\n' + lines.join('\n');
}

/**
 * One same-day change after the digest went out: the event keeps the
 * booking-notes naming (Cita agendada, Cita movida, Cita cancelada,
 * Cita cancelada · estaba pagada), followed by the time, service, name and
 * payment state.
 */
export function changeLine(event: string, service: string, slotIso: string, name: string, paid: boolean): string {
  const label = SERVICE_LABEL.es[service] ?? service;
  return event + ' · ' + bogotaHHMM(slotIso) + ' · ' + label + ' · ' + name + ' · ' + paymentLabel(label, paid);
}

/** Whether the digest run for this Bogota day already happened. The
 *  sent marker lives in the WhatsApp worker's operator registry: this
 *  worker asks it through the OPERATOR service binding, and a missing
 *  binding or a failed ask reads as "not sent", like a quiet day.
 */
export async function bookingDigestSent(env: Env, dateKey: string): Promise<boolean> {
  try {
    const operator = env.OPERATOR;
    if (!operator) return false;
    const res = await operator.fetch(
      new Request('https://operator/internal/booking-notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'digestSent', dateKey }),
      })
    );
    const data = (await res.json()) as { sent?: unknown };
    return data.sent === true;
  } catch {
    return false;
  }
}

export interface OperatorNoteInput {
  name: string;
  text: string;
  tag: string;
  priority: 'high' | 'normal' | 'low';
}

/** Post one operator note through the WhatsApp worker; never throws. The
 *  digest-day change lines for web bookings travel this way: best effort,
 *  like every other operator-bound send.
 */
export async function postOperatorNote(env: Env, input: OperatorNoteInput): Promise<void> {
  if (!input.name) return;
  try {
    const operator = env.OPERATOR;
    if (!operator) return;
    await operator.fetch(
      new Request('https://operator/internal/booking-notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'note', ...input }),
      })
    );
  } catch {
    /* the note is best effort */
  }
}

/**
 * Whether a booking change still reaches the operator at once: its start
 * falls on today and today's digest already went out. Anything for a later
 * day waits for that day's digest instead.
 */
export async function sameDayAfterBookingDigest(
  env: Env,
  startIso: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return false;
  const today = bogotaDateKey(nowMs);
  if (bogotaDateKey(startMs) !== today) return false;
  return bookingDigestSent(env, today);
}

/**
 * The scheduled run: from the configured Bogota time on, the day's bookings
 * go to the operator as one message. A day with nothing booked sends nothing
 * but still marks the day, so a booking that lands later that day still gets
 * its immediate line. A retried run on the same day sends nothing twice.
 */
export async function runBookingDigest(env: Env, nowMs: number): Promise<void> {
  if (!isBookingDigestSlot(nowMs, bookingDigestConfig(env))) return;
  const dateKey = bogotaDateKey(nowMs);
  if (await bookingDigestSent(env, dateKey)) return;
  const day = await calendarCall(env, { action: 'day', now: nowMs });
  if (!day.ok || !Array.isArray(day.events)) return;
  const text = formatBookingDigest(bookingDigestItems(day.events as CalEvent[]));
  // The WhatsApp worker marks the day when its operator takes the note, so
  // a retry never sends twice; without a binding the digest is skipped.
  try {
    const operator = env.OPERATOR;
    if (!operator) return;
    await operator.fetch(
      new Request('https://operator/internal/booking-notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'digest', dateKey, text }),
      })
    );
  } catch {
    /* the next wake retries: the day stays unmarked until the operator takes it */
  }
}
