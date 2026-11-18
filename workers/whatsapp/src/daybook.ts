import type { Env } from './env';
import { SERVICE_LABEL } from './intake';
import { bogotaDateKey, bogotaParts } from './schedule';

/**
 * The conversation-path booking notes. The digest run itself (config,
 * items, formatting, scheduled send) lives in the standalone booking
 * worker; this module keeps what the agent's own bookings still need:
 * the one-line change note and the "did today's digest go out" check,
 * both answered against the operator registry in this worker.
 */

/** Bogota HH:mm of an event start; the raw input when it does not parse. */
function bogotaHHMM(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const p = bogotaParts(ms);
  return String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0');
}

/** A first call is free; a paid session is paid or still waiting for it. */
function paymentLabel(service: string, paid: boolean): string {
  if (service === SERVICE_LABEL.es['first-call']) return 'gratis';
  return paid ? 'pagada' : 'sin pagar';
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

/** Whether the digest run for this Bogota day already happened. */
export async function bookingDigestSent(env: Env, dateKey: string): Promise<boolean> {
  try {
    const ns = env.REGISTRY;
    if (!ns) return false;
    const stub = ns.get(ns.idFromName('operator'));
    const res = await stub.fetch(
      new Request('https://booking-digest/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'bookingDigestSent', dateKey }),
      })
    );
    const data = (await res.json()) as { sent?: unknown };
    return data.sent === true;
  } catch {
    return false;
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
