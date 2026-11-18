import type { Env } from './env';
import { guardHandoff } from './guard';
import { sendText } from './meta';
import { formatBrief } from './intake';
import { LIMIT_TEXT, type LimitReason } from './limits';
import type { Lang } from './lang';
import { register, postNote } from './registry';
import type { BookingService, BookingState } from './booking';

export type CalendarReply = { ok: true; [key: string]: unknown } | { ok: false; reason: string };

/** The active booking row the owner returns, rebuilt into chat state. */
export interface ActiveInfo {
  eventId: string;
  start: string;
  end: string;
  kind: 'hold' | 'booked';
  service: string;
  createdAt: number;
}

/**
 * Call the booking worker over the BOOKING service binding: the same
 * action envelope the owner speaks, with no public round trip and no
 * Turnstile anywhere in this path. A missing binding or a missing shared
 * secret reads as calendar-down, like a failing owner.
 */
export async function calendarCall(env: Env, body: Record<string, unknown>): Promise<CalendarReply> {
  try {
    const booking = env.BOOKING;
    const secret = env.INTERNAL_CALL_SECRET;
    if (!booking || !secret) return { ok: false, reason: 'calendar-down' };
    const res = await booking.fetch(
      new Request('https://booking/internal/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify(body),
      })
    );
    return (await res.json()) as CalendarReply;
  } catch {
    return { ok: false, reason: 'calendar-down' };
  }
}

export interface RefuseInput {
  lang: Lang;
  phone: string;
  name: string;
  service: string;
  brief: string[];
  reason: Exclude<LimitReason, 'existing' | 'slot-taken'>;
}

/**
 * Refuse a booking by fixed code wording (never the text model): tell the
 * client, register the handoff and brief the operator with the same reason.
 */
export async function refuseAndHandOff(env: Env, input: RefuseInput): Promise<string> {
  const text = LIMIT_TEXT[input.reason][input.lang];
  await sendText(env, input.phone, text);
  const name = await register(env, {
    phone: input.phone,
    name: input.name,
    lang: input.lang,
    kind: 'handoff',
    service: input.service,
  });
  // FR5: the operator gets at most one handoff notice per client every 10
  // minutes. A throttled refusal still tells the client and keeps the
  // registry row; the note itself goes through the Operator.
  if (!(await guardHandoff(env, input.phone))) return name;
  const note = formatBrief({
    name: input.name,
    phone: input.phone,
    lang: input.lang,
    service: input.service,
    bullets: input.brief,
  });
  await postNote(env, {
    name,
    text: 'Límite de agenda (' + input.reason + '): no se creó evento.\n' + note,
    tag: 'CITA',
    priority: 'normal',
  });
  return name;
}

/** Rebuild conversation state from the owner's active row after EXISTING. */
export function seedFromActive(
  active: ActiveInfo,
  input: { lang: Lang; phone: string; name: string; service: BookingService; brief?: string[] }
): BookingState {
  return {
    service: input.service,
    lang: input.lang,
    offered: [active.start],
    phase: active.kind === 'booked' ? 'booked' : 'held',
    eventId: active.eventId,
    start: active.start,
    createdAt: active.createdAt,
    phone: input.phone,
    name: input.name,
    brief: input.brief ?? [],
  };
}
