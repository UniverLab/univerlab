/** @jest-environment node */
import {
  accessToken,
  deleteEvent,
  freeBusy,
  getEvent,
  HOLD_PREFIX,
  insertEvent,
  listEvents,
  patchEvent,
  type FetchFn,
} from '../src/google';

function stubFetch(handler: (url: string, init?: RequestInit) => unknown): FetchFn {
  return (async (url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => handler(url, init),
  })) as unknown as FetchFn;
}

function failingFetch(status: number): FetchFn {
  return (async () => ({ ok: false, status, json: async () => ({}) })) as unknown as FetchFn;
}

const OAUTH = { clientId: 'cid', clientSecret: 'csec', refreshToken: 'rtok' };

test('refreshes the access token', async () => {
  let seen: { url: string; init?: RequestInit } | null = null;
  const fetchFn = stubFetch((url, init) => {
    seen = { url, init };
    return { access_token: 'tok123' };
  });
  await expect(accessToken(OAUTH, fetchFn)).resolves.toBe('tok123');
  expect(seen?.url).toContain('oauth2.googleapis.com/token');
  expect(String(seen?.init?.body)).toContain('grant_type=refresh_token');
  expect(String(seen?.init?.body)).toContain('refresh_token=rtok');
});

test('token failures and empty tokens throw', async () => {
  await expect(accessToken(OAUTH, failingFetch(400))).rejects.toThrow('google token 400');
  await expect(accessToken(OAUTH, stubFetch(() => ({})))).rejects.toThrow('empty');
});

test('merges free/busy across calendars', async () => {
  const fetchFn = stubFetch(() => ({
    calendars: {
      primary: { busy: [{ start: '2026-11-17T20:00:00Z', end: '2026-11-17T21:00:00Z' }] },
      workbench: { busy: [{ start: 'a', end: 'b' }, { start: 'x' }] },
    },
  }));
  await expect(
    freeBusy('tok', '2026-11-01T00:00:00Z', '2026-11-30T00:00:00Z', ['primary', 'workbench'], fetchFn)
  ).resolves.toEqual([
    { start: '2026-11-17T20:00:00Z', end: '2026-11-17T21:00:00Z' },
    { start: 'a', end: 'b' },
  ]);
  await expect(freeBusy('tok', 'a', 'b', ['primary'], failingFetch(503))).rejects.toThrow('freeBusy');
});

test('lists timed and all-day events', async () => {
  const fetchFn = stubFetch(() => ({
    items: [
      {
        id: 'e1',
        summary: HOLD_PREFIX + 'Consultation · Ana',
        start: { dateTime: '2026-11-17T20:00:00Z' },
        end: { dateTime: '2026-11-17T21:00:00Z' },
      },
      {
        id: 'e2',
        summary: 'Holiday',
        start: { date: '2026-11-16' },
        end: { date: '2026-11-17' },
      },
      { id: '', summary: 'bad' },
    ],
  }));
  const events = await listEvents('tok', 'wb', '2026-11-01T00:00:00Z', '2026-11-30T00:00:00Z', fetchFn);
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({ id: 'e1', start: '2026-11-17T20:00:00Z' });
  // All-day events cover the Bogota calendar day in UTC.
  expect(events[1]).toMatchObject({
    id: 'e2',
    start: new Date(Date.UTC(2026, 10, 16, 5, 0)).toISOString(),
    end: new Date(Date.UTC(2026, 10, 17, 5, 0)).toISOString(),
  });
});

test('inserts events silently with no attendees', async () => {
  let seen: { url: string; init?: RequestInit } | null = null;
  const fetchFn = stubFetch((url, init) => {
    seen = { url, init };
    return {
      id: 'new1',
      summary: 'First call · Ana',
      start: { dateTime: '2026-11-17T20:00:00Z' },
      end: { dateTime: '2026-11-17T20:15:00Z' },
    };
  });
  const ev = await insertEvent(
    'tok',
    'wb',
    { summary: 'First call · Ana', description: 'brief', startIso: '2026-11-17T20:00:00Z', endIso: '2026-11-17T20:15:00Z' },
    fetchFn
  );
  expect(ev.id).toBe('new1');
  expect(seen?.url).toContain('sendUpdates=none');
  const body = JSON.parse(String(seen?.init?.body)) as Record<string, unknown>;
  expect(body).toMatchObject({
    attendees: [],
    reminders: { useDefault: false, overrides: [] },
    start: { dateTime: '2026-11-17T20:00:00Z', timeZone: 'America/Bogota' },
  });
  await expect(
    insertEvent('tok', 'wb', { summary: 'x', description: '', startIso: 'a', endIso: 'b' }, failingFetch(500))
  ).rejects.toThrow('insertEvent');
});

test('reads one event and reports a missing one as null', async () => {
  const fetchFn = stubFetch(() => ({
    id: 'e1',
    summary: HOLD_PREFIX + 'x',
    start: { dateTime: '2026-11-17T20:00:00Z' },
    end: { dateTime: '2026-11-17T21:00:00Z' },
  }));
  await expect(getEvent('tok', 'wb', 'e1', fetchFn)).resolves.toMatchObject({ id: 'e1' });
  await expect(getEvent('tok', 'wb', 'gone', failingFetch(404))).resolves.toBeNull();
  await expect(getEvent('tok', 'wb', 'e1', failingFetch(500))).rejects.toThrow('getEvent');
});

test('the web booking invites one guest, attaches Meet and notifies', async () => {
  let seen: { url: string; init?: RequestInit } | null = null;
  const fetchFn = stubFetch((url, init) => {
    seen = { url, init };
    return {
      id: 'web1',
      summary: 'First call · Ana',
      start: { dateTime: '2026-11-17T20:00:00Z' },
      end: { dateTime: '2026-11-17T20:15:00Z' },
      hangoutLink: 'https://meet.google.com/abc-defg-hij',
    };
  });
  const ev = await insertEvent(
    'tok',
    'wb',
    {
      summary: 'First call · Ana',
      description: 'brief',
      startIso: '2026-11-17T20:00:00Z',
      endIso: '2026-11-17T20:15:00Z',
      attendee: 'ana@example.com',
      conference: true,
    },
    fetchFn,
    'all'
  );
  // The meeting link survives parsing so the booking can answer it.
  expect(ev.hangoutLink).toBe('https://meet.google.com/abc-defg-hij');
  expect(seen?.url).toContain('sendUpdates=all');
  expect(seen?.url).toContain('conferenceDataVersion=1');
  const body = JSON.parse(String(seen?.init?.body)) as Record<string, unknown>;
  expect(body).toMatchObject({ attendees: [{ email: 'ana@example.com' }] });
  const conference = body.conferenceData as {
    createRequest: { conferenceSolutionKey: { type: string } };
  };
  expect(conference.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
});

test('events without video carry no meeting link', async () => {
  const fetchFn = stubFetch(() => ({
    id: 'e9',
    summary: 'First call · Ana',
    start: { dateTime: '2026-11-17T20:00:00Z' },
    end: { dateTime: '2026-11-17T20:15:00Z' },
  }));
  const ev = await insertEvent(
    'tok',
    'wb',
    { summary: 'x', description: '', startIso: '2026-11-17T20:00:00Z', endIso: '2026-11-17T20:15:00Z' },
    fetchFn
  );
  expect(ev.hangoutLink).toBeUndefined();
});

test('a cancel delete notifies the guest', async () => {
  let seenUrl = '';
  const inner = stubFetch(() => ({}));
  const fetchFn = (async (url: string, init?: RequestInit) => {
    seenUrl = url;
    return inner(url, init);
  }) as FetchFn;
  await deleteEvent('tok', 'wb', 'e1', fetchFn, 'all');
  expect(seenUrl).toContain('sendUpdates=all');
});

test('patches titles and tolerates a deleted-away delete', async () => {
  const fetchFn = stubFetch(() => ({
    id: 'e1',
    summary: 'Consultation · Ana',
    start: { dateTime: '2026-11-17T20:00:00Z' },
    end: { dateTime: '2026-11-17T21:00:00Z' },
  }));
  const patched = await patchEvent('tok', 'wb', 'e1', { summary: 'Consultation · Ana' }, fetchFn);
  expect(patched.summary).toBe('Consultation · Ana');
  await expect(deleteEvent('tok', 'wb', 'gone', failingFetch(404))).resolves.toBeUndefined();
  await expect(deleteEvent('tok', 'wb', 'e1', failingFetch(500))).rejects.toThrow('deleteEvent');
  const okDelete = stubFetch(() => ({}));
  await expect(deleteEvent('tok', 'wb', 'e1', okDelete)).resolves.toBeUndefined();
});
