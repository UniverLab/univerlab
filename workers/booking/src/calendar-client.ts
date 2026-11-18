import type { Env } from './env';

export type CalendarReply = { ok: true; [key: string]: unknown } | { ok: false; reason: string };

/** Call the one serialized calendar owner bound to this worker. */
export async function calendarCall(env: Env, body: Record<string, unknown>): Promise<CalendarReply> {
  try {
    const ns = env.CALENDAR;
    if (!ns) return { ok: false, reason: 'calendar-down' };
    const stub = ns.get(ns.idFromName('calendar'));
    const res = await stub.fetch(
      new Request('https://calendar/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
    return (await res.json()) as CalendarReply;
  } catch {
    return { ok: false, reason: 'calendar-down' };
  }
}
