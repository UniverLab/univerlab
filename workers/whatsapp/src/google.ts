import { bogotaToUtcMs, type BusyBlock } from './schedule';

export type { BusyBlock };

export const HOLD_PREFIX = '[Por confirmar] ';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const TIME_ZONE = 'America/Bogota';

export interface GoogleOAuth {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
}

function auth(token: string): Record<string, string> {
  return { Authorization: 'Bearer ' + token };
}

/** Exchange the stored refresh token for a short-lived access token. */
export async function accessToken(oauth: GoogleOAuth, fetchFn: FetchFn = fetch): Promise<string> {
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      refresh_token: oauth.refreshToken,
    }).toString(),
  });
  if (!res.ok) throw new Error('google token ' + res.status);
  const data = (await res.json()) as { access_token?: unknown };
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('google token empty');
  }
  return data.access_token;
}

interface FreeBusyResponse {
  calendars?: Record<string, { busy?: Array<{ start?: unknown; end?: unknown }> }>;
}

/** Busy blocks of every listed calendar between timeMin and timeMax (ISO). */
export async function freeBusy(
  token: string,
  timeMin: string,
  timeMax: string,
  calendarIds: string[],
  fetchFn: FetchFn = fetch
): Promise<BusyBlock[]> {
  const res = await fetchFn(API + '/freeBusy', {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin, timeMax, items: calendarIds.map((id) => ({ id })) }),
  });
  if (!res.ok) throw new Error('google freeBusy ' + res.status);
  const data = (await res.json()) as FreeBusyResponse;
  const out: BusyBlock[] = [];
  const calendars = data.calendars ?? {};
  for (const id of Object.keys(calendars)) {
    for (const b of calendars[id].busy ?? []) {
      if (typeof b.start === 'string' && typeof b.end === 'string') {
        out.push({ start: b.start, end: b.end });
      }
    }
  }
  return out;
}

function parseEvent(item: unknown, fallbackStart: string, fallbackEnd: string): CalEvent | null {
  if (typeof item !== 'object' || item === null) return null;
  const e = item as {
    id?: unknown;
    summary?: unknown;
    start?: { dateTime?: unknown; date?: unknown };
    end?: { dateTime?: unknown; date?: unknown };
  };
  if (typeof e.id !== 'string' || !e.id) return null;
  let start: string | null = null;
  let end: string | null = null;
  if (e.start && typeof e.start.dateTime === 'string') start = e.start.dateTime;
  else if (e.start && typeof e.start.date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.start.date);
    if (!m) return null;
    start = new Date(bogotaToUtcMs(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0)).toISOString();
  }
  if (e.end && typeof e.end.dateTime === 'string') end = e.end.dateTime;
  else if (e.end && typeof e.end.date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.end.date);
    if (!m) return null;
    end = new Date(bogotaToUtcMs(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0)).toISOString();
  }
  return {
    id: e.id,
    summary: typeof e.summary === 'string' ? e.summary : '',
    start: start ?? fallbackStart,
    end: end ?? fallbackEnd,
  };
}

/** Timed and all-day events of one calendar in range (single instances). */
export async function listEvents(
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  fetchFn: FetchFn = fetch
): Promise<CalEvent[]> {
  const url =
    API + '/calendars/' + encodeURIComponent(calendarId) + '/events' +
    '?timeMin=' + encodeURIComponent(timeMin) +
    '&timeMax=' + encodeURIComponent(timeMax) +
    '&singleEvents=true&orderBy=startTime&maxResults=100';
  const res = await fetchFn(url, { headers: auth(token) });
  if (!res.ok) throw new Error('google listEvents ' + res.status);
  const data = (await res.json()) as { items?: unknown };
  if (!Array.isArray(data.items)) return [];
  return data.items
    .map((item) => parseEvent(item, timeMin, timeMax))
    .filter((e): e is CalEvent => e !== null);
}

/** One event by id; null when it no longer exists. */
export async function getEvent(
  token: string,
  calendarId: string,
  eventId: string,
  fetchFn: FetchFn = fetch
): Promise<CalEvent | null> {
  const res = await fetchFn(
    API + '/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId),
    { headers: auth(token) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('google getEvent ' + res.status);
  return parseEvent(await res.json(), '', '');
}

export interface NewEvent {
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
}

function eventBody(ev: NewEvent): Record<string, unknown> {
  return {
    summary: ev.summary,
    description: ev.description,
    start: { dateTime: ev.startIso, timeZone: TIME_ZONE },
    end: { dateTime: ev.endIso, timeZone: TIME_ZONE },
    // The lab confirms everything in the WhatsApp chat: no attendees, no emails.
    attendees: [],
    reminders: { useDefault: false, overrides: [] },
  };
}

/** Create an event without attendees, emails or notifications; returns its id. */
export async function insertEvent(
  token: string,
  calendarId: string,
  ev: NewEvent,
  fetchFn: FetchFn = fetch
): Promise<CalEvent> {
  const res = await fetchFn(
    API + '/calendars/' + encodeURIComponent(calendarId) + '/events?sendUpdates=none',
    {
      method: 'POST',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody(ev)),
    }
  );
  if (!res.ok) throw new Error('google insertEvent ' + res.status);
  const parsed = parseEvent(await res.json(), ev.startIso, ev.endIso);
  if (!parsed) throw new Error('google insertEvent empty');
  return parsed;
}

/** Change an event's summary/description without sending notifications. */
export async function patchEvent(
  token: string,
  calendarId: string,
  eventId: string,
  patch: { summary?: string; description?: string },
  fetchFn: FetchFn = fetch
): Promise<CalEvent> {
  const res = await fetchFn(
    API + '/calendars/' + encodeURIComponent(calendarId) + '/events/' +
      encodeURIComponent(eventId) + '?sendUpdates=none',
    {
      method: 'PATCH',
      headers: { ...auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) throw new Error('google patchEvent ' + res.status);
  const parsed = parseEvent(await res.json(), '', '');
  if (!parsed) throw new Error('google patchEvent empty');
  return parsed;
}

/** Delete an event without sending notifications; missing events are fine. */
export async function deleteEvent(
  token: string,
  calendarId: string,
  eventId: string,
  fetchFn: FetchFn = fetch
): Promise<void> {
  const res = await fetchFn(
    API + '/calendars/' + encodeURIComponent(calendarId) + '/events/' +
      encodeURIComponent(eventId) + '?sendUpdates=none',
    { method: 'DELETE', headers: auth(token) }
  );
  if (res.status === 404 || res.status === 410) return;
  if (!res.ok) throw new Error('google deleteEvent ' + res.status);
}
