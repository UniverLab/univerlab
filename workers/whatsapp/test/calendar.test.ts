/** @jest-environment node */
import { Calendar } from '../src/calendar';
import { freeSlots, DEFAULT_BOOKING_CONFIG } from '../src/schedule';
import {
  accessToken,
  deleteEvent,
  freeBusy,
  getEvent,
  insertEvent,
  listEvents,
  patchEvent,
} from '../src/google';

jest.mock(
  'cloudflare:workers',
  () => ({
    DurableObject: class {
      ctx: unknown;
      env: unknown;
      constructor(ctx: unknown, env: unknown) {
        this.ctx = ctx;
        this.env = env;
      }
    },
  }),
  { virtual: true }
);

jest.mock('../src/google', () => ({
  accessToken: jest.fn(),
  freeBusy: jest.fn(),
  listEvents: jest.fn(),
  getEvent: jest.fn(),
  insertEvent: jest.fn(),
  patchEvent: jest.fn(),
  deleteEvent: jest.fn(),
  HOLD_PREFIX: '[Por confirmar] ',
}));

const ENV = {
  GOOGLE_CLIENT_ID: 'cid',
  GOOGLE_CLIENT_SECRET: 'csec',
  GOOGLE_REFRESH_TOKEN: 'rtok',
  WORKBENCH_CALENDAR_ID: 'workbench-id',
};

/** Monday 2026-11-09 12:00 Bogota. */
const MON_12 = Date.UTC(2026, 10, 9, 17, 0);

interface Store {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contacts: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reservations: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any;
}

function makeStore(): Store {
  const contacts: Store['contacts'] = [];
  const reservations: Store['reservations'] = [];
  const sql = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exec: (query: string, ...params: any[]) => {
      const q = query.replace(/\s+/g, ' ').trim();
      let rows: unknown[] = [];
      if (q.startsWith('CREATE TABLE')) {
        rows = [];
      } else if (q.startsWith('INSERT INTO contacts')) {
        const [key, last_free_call, moves, updated_at] = params;
        const i = contacts.findIndex((c) => c.key === key);
        const row = { key, last_free_call, moves, updated_at };
        if (i >= 0) contacts[i] = row;
        else contacts.push(row);
      } else if (q.startsWith('DELETE FROM contacts')) {
        const [key] = params;
        for (let i = contacts.length - 1; i >= 0; i--) {
          if (contacts[i].key === key) contacts.splice(i, 1);
        }
      } else if (q.startsWith('SELECT') && q.includes('FROM contacts WHERE key')) {
        rows = contacts.filter((c) => c.key === params[0]).map((c) => ({ ...c }));
      } else if (q.startsWith('SELECT') && q.includes('FROM contacts')) {
        rows = contacts.map((c) => ({ ...c }));
      } else if (q.startsWith('INSERT INTO reservations')) {
        const [key, event_id, start, end, kind, service, status, created_at, day_key, expired_at] = params;
        reservations.push({ key, event_id, start, end, kind, service, status, created_at, day_key, expired_at });
      } else if (q.startsWith("UPDATE reservations SET status = 'expired'")) {
        const [expired_at, event_id] = params;
        const r = reservations.find((x) => x.event_id === event_id);
        if (r) {
          r.status = 'expired';
          r.expired_at = expired_at;
        }
      } else if (q.startsWith("UPDATE reservations SET status = 'stale'")) {
        const r = reservations.find((x) => x.event_id === params[0]);
        if (r) r.status = 'stale';
      } else if (q.startsWith("UPDATE reservations SET status = 'released'")) {
        const r = reservations.find((x) => x.event_id === params[0]);
        if (r) r.status = 'released';
      } else if (q.startsWith("UPDATE reservations SET kind = 'booked'")) {
        const r = reservations.find((x) => x.event_id === params[0]);
        if (r) r.kind = 'booked';
      } else if (q.startsWith('DELETE FROM reservations WHERE event_id')) {
        for (let i = reservations.length - 1; i >= 0; i--) {
          if (reservations[i].event_id === params[0]) reservations.splice(i, 1);
        }
      } else if (q.startsWith('DELETE FROM reservations WHERE key')) {
        for (let i = reservations.length - 1; i >= 0; i--) {
          if (reservations[i].key === params[0]) reservations.splice(i, 1);
        }
      } else if (q.startsWith('DELETE FROM reservations WHERE status IN')) {
        const [cutoff] = params;
        for (let i = reservations.length - 1; i >= 0; i--) {
          if (['released', 'expired', 'stale'].includes(reservations[i].status) && reservations[i].created_at < cutoff) {
            reservations.splice(i, 1);
          }
        }
      } else if (q.startsWith('SELECT') && q.includes('FROM reservations')) {
        let out = reservations.map((r) => ({ ...r }));
        if (q.includes('WHERE key = ?')) out = out.filter((r) => r.key === params[0]);
        if (q.includes("status = 'active'")) out = out.filter((r) => r.status === 'active');
        if (q.includes("status = 'expired'")) out = out.filter((r) => r.status === 'expired');
        if (q.includes('day_key = ?')) {
          const dayKey = params[q.includes('WHERE key = ?') ? 1 : 0];
          out = out.filter((r) => r.day_key === dayKey);
        }
        rows = out;
      }
      return { toArray: () => rows };
    },
  };
  const ctx = {
    storage: { sql, setAlarm: jest.fn(), deleteAlarm: jest.fn(), deleteAll: jest.fn() },
    blockConcurrencyWhile: (fn: () => unknown) => {
      fn();
    },
  };
  return { contacts, reservations, ctx };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let calEvents: any[];
let evCounter: number;

function googleCalendar() {
  calEvents = [];
  evCounter = 0;
  (accessToken as jest.Mock).mockImplementation(async () => 'tok');
  (freeBusy as jest.Mock).mockImplementation(async () => []);
  (listEvents as jest.Mock).mockImplementation(async () => calEvents.map((e) => ({ ...e })));
  (getEvent as jest.Mock).mockImplementation(async (_t: string, _c: string, id: string) => {
    const e = calEvents.find((x) => x.id === id);
    return e ? { ...e } : null;
  });
  (insertEvent as jest.Mock).mockImplementation(async (_t: string, _c: string, ev: { summary: string; startIso: string; endIso: string }) => {
    evCounter += 1;
    const created = { id: 'ev' + evCounter, summary: ev.summary, start: ev.startIso, end: ev.endIso };
    calEvents.push(created);
    return { ...created };
  });
  (patchEvent as jest.Mock).mockImplementation(async (_t: string, _c: string, id: string, patch: { summary?: string }) => {
    const e = calEvents.find((x) => x.id === id);
    if (e && patch.summary !== undefined) e.summary = patch.summary;
    return { ...(e ?? {}) };
  });
  (deleteEvent as jest.Mock).mockImplementation(async (_t: string, _c: string, id: string) => {
    calEvents = calEvents.filter((x) => x.id !== id);
  });
}

function makeCal(store: Store): Calendar {
  return new Calendar(store.ctx as never, ENV as never);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(cal: Calendar, body: any): Promise<any> {
  const res = await cal.fetch(
    new Request('https://calendar/call', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return (await res.json()) as unknown;
}

function quoteCfg() {
  return {
    ...DEFAULT_BOOKING_CONFIG,
    windows: DEFAULT_BOOKING_CONFIG.windows.map((w) => [...w] as [number, number]),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(MON_12);
  googleCalendar();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('the same slot raced by two contacts has one winner and one insert', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  const slot = slots[0];
  const summary = (n: string) => '[Por confirmar] Consultoría · ' + n;
  const [a, b] = await Promise.all([
    call(cal, { action: 'reserve', contactKey: 'wa:111', service: 'consultation', startIso: slot, minutes: 60, summary: summary('a'), description: '', now: MON_12 }),
    call(cal, { action: 'reserve', contactKey: 'wa:222', service: 'consultation', startIso: slot, minutes: 60, summary: summary('b'), description: '', now: MON_12 }),
  ]);
  const oks = [a, b].filter((r) => r.ok);
  const taken = [a, b].filter((r) => !r.ok && r.reason === 'slot-taken');
  expect(oks).toHaveLength(1);
  expect(taken).toHaveLength(1);
  expect(insertEvent).toHaveBeenCalledTimes(1);
  expect(store.reservations.filter((r) => r.status === 'active')).toHaveLength(1);
});

test('four open holds block the fifth and four creations a day block the fifth', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  for (let i = 0; i < 4; i++) {
    const r = await call(cal, {
      action: 'reserve', contactKey: 'wa:h' + i, service: 'consultation',
      startIso: slots[i], minutes: 60, summary: '[Por confirmar] h' + i, description: '', now: MON_12,
    });
    expect(r.ok).toBe(true);
  }
  const fifth = await call(cal, {
    action: 'reserve', contactKey: 'wa:h4', service: 'consultation',
    startIso: slots[4], minutes: 60, summary: '[Por confirmar] h4', description: '', now: MON_12,
  });
  expect(fifth.ok).toBe(false);
  expect(fifth.reason).toBe('hold-cap');

  // First calls are never holds, so the day cap is what stops the fifth one.
  const store2 = makeStore();
  const cal2 = makeCal(store2);
  calEvents = [];
  evCounter = 0;
  const daySlots = freeSlots(quoteCfg(), [], [], 15, MON_12);
  for (let i = 0; i < 4; i++) {
    const r = await call(cal2, {
      action: 'reserve', contactKey: 'wa:f' + i, service: 'first-call',
      startIso: daySlots[i], minutes: 15, summary: 'f' + i, description: '', now: MON_12,
    });
    expect(r.ok).toBe(true);
  }
  const over = await call(cal2, {
    action: 'reserve', contactKey: 'wa:f4', service: 'first-call',
    startIso: daySlots[4], minutes: 15, summary: 'f4', description: '', now: MON_12,
  });
  expect(over.ok).toBe(false);
  expect(over.reason).toBe('day-cap');
});

test('a hand-deleted event stops counting the booking', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  const first = await call(cal, {
    action: 'reserve', contactKey: 'wa:gone', service: 'consultation',
    startIso: slots[0], minutes: 60, summary: 'x', description: '', now: MON_12,
  });
  expect(first.ok).toBe(true);
  // The operator deletes the event by hand: the listing no longer has it.
  calEvents = [];
  const status = await call(cal, {
    action: 'status', contactKey: 'wa:gone', service: 'consultation', minutes: 60, now: MON_12,
  });
  expect(status.ok).toBe(true);
  expect(status.active).toBeNull();
  expect((status.slots as string[]).length).toBeGreaterThan(0);
  expect(store.reservations.find((r) => r.event_id === first.eventId).status).toBe('stale');
});

test('a hand-confirmed hold settles without counting as a hold', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  const first = await call(cal, {
    action: 'reserve', contactKey: 'wa:op', service: 'consultation',
    startIso: slots[0], minutes: 60, summary: '[Por confirmar] Consultoría · Ana', description: '', now: MON_12,
  });
  expect(first.ok).toBe(true);
  calEvents[0].summary = 'Consultoría · Ana';
  const confirm = await call(cal, { action: 'confirm', contactKey: 'wa:op', summary: 'Consultoría · Ana' });
  expect(confirm.ok).toBe(true);
  // The confirmed booking no longer counts toward the hold cap.
  const status = await call(cal, {
    action: 'status', contactKey: 'wa:other', service: 'consultation', minutes: 60, now: MON_12,
  });
  expect(status.ok).toBe(true);
});

test('erase removes the contact records while the release frees the event', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  await call(cal, {
    action: 'reserve', contactKey: 'wa:bye', service: 'consultation',
    startIso: slots[0], minutes: 60, summary: 'x', description: '', now: MON_12,
  });
  expect(calEvents).toHaveLength(1);
  const released = await call(cal, { action: 'release', contactKey: 'wa:bye' });
  expect(released.ok).toBe(true);
  expect(calEvents).toHaveLength(0);
  const erased = await call(cal, { action: 'erase', contactKey: 'wa:bye' });
  expect(erased.ok).toBe(true);
  expect(store.contacts).toHaveLength(0);
  expect(store.reservations).toHaveLength(0);
  const status = await call(cal, {
    action: 'status', contactKey: 'wa:bye', service: 'consultation', minutes: 60, now: MON_12,
  });
  expect(status.ok).toBe(true);
  expect(status.active).toBeNull();
});

test('a delivery reserve books direct with no hold prefix', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  const res = await call(cal, {
    action: 'reserve', contactKey: 'wa:del', service: 'delivery',
    startIso: slots[0], minutes: 60, summary: 'Entrega de auditoría · Ana', description: '', now: MON_12,
  });
  expect(res.ok).toBe(true);
  expect(res.kind).toBe('booked');
  expect(calEvents).toHaveLength(1);
  expect(calEvents[0].summary.startsWith('[Por confirmar]')).toBe(false);
  expect(calEvents[0].summary).toBe('Entrega de auditoría · Ana');
  expect(store.reservations).toHaveLength(1);
  expect(store.reservations[0].kind).toBe('booked');
  expect(store.reservations[0].service).toBe('delivery');
});

test('an insert failure is calendar-down and stores no row', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  (insertEvent as jest.Mock).mockRejectedValueOnce(new Error('down'));
  const slots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  const res = await call(cal, {
    action: 'reserve', contactKey: 'wa:fail', service: 'consultation',
    startIso: slots[0], minutes: 60, summary: 'x', description: '', now: MON_12,
  });
  expect(res.ok).toBe(false);
  expect(res.reason).toBe('calendar-down');
  expect(store.reservations).toHaveLength(0);
});

test('a move replaces its event and the third one is refused', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  const first = await call(cal, {
    action: 'reserve', contactKey: 'wa:m', service: 'consultation',
    startIso: slots[0], minutes: 60, summary: 'x', description: '', now: MON_12,
  });
  expect(first.ok).toBe(true);
  const second = await call(cal, {
    action: 'move', contactKey: 'wa:m', startIso: slots[1], minutes: 60, summary: 'x', description: '', now: MON_12,
  });
  expect(second.ok).toBe(true);
  expect(calEvents).toHaveLength(1);
  expect(calEvents[0].start).toBe(slots[1]);
  const third = await call(cal, {
    action: 'move', contactKey: 'wa:m', startIso: slots[2], minutes: 60, summary: 'x', description: '', now: MON_12,
  });
  expect(third.ok).toBe(true);
  const fourth = await call(cal, {
    action: 'move', contactKey: 'wa:m', startIso: slots[3], minutes: 60, summary: 'x', description: '', now: MON_12,
  });
  expect(fourth.ok).toBe(false);
  expect(fourth.reason).toBe('moves');
});

test('a hand-confirmed hold moves as a booking and a moved hold restarts its clock', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  const first = await call(cal, {
    action: 'reserve', contactKey: 'wa:mv', service: 'consultation',
    startIso: slots[0], minutes: 60, summary: '[Por confirmar] Consultoría · Ana', description: '', now: MON_12,
  });
  expect(first.ok).toBe(true);
  // The operator confirms by hand, then the client moves the slot an hour later.
  calEvents[0].summary = 'Consultoría · Ana';
  const later = MON_12 + 3600_000;
  jest.spyOn(Date, 'now').mockReturnValue(later);
  const moved = await call(cal, {
    action: 'move', contactKey: 'wa:mv', startIso: slots[1], minutes: 60,
    summary: '[Por confirmar] Consultoría · Ana', description: '', now: later,
  });
  expect(moved.ok).toBe(true);
  expect(moved.kind).toBe('booked');
  expect(calEvents).toHaveLength(1);
  expect(calEvents[0].summary.startsWith('[Por confirmar]')).toBe(false);
  expect(store.reservations[0].kind).toBe('booked');
  expect(store.reservations[0].created_at).toBe(MON_12);

  // An unpaid hold moved restarts its 24 hours, like the old re-create did.
  const store2 = makeStore();
  const cal2 = makeCal(store2);
  calEvents = [];
  evCounter = 0;
  const first2 = await call(cal2, {
    action: 'reserve', contactKey: 'wa:mh', service: 'consultation',
    startIso: slots[2], minutes: 60, summary: '[Por confirmar] h', description: '', now: MON_12,
  });
  expect(first2.ok).toBe(true);
  const moved2 = await call(cal2, {
    action: 'move', contactKey: 'wa:mh', startIso: slots[3], minutes: 60,
    summary: '[Por confirmar] h', description: '', now: later,
  });
  expect(moved2.ok).toBe(true);
  expect(moved2.kind).toBe('hold');
  expect(calEvents[0].summary.startsWith('[Por confirmar]')).toBe(true);
  expect(store2.reservations[0].created_at).toBe(later);
});

test('a 72h-out hold stays pending 30h in and expires a day before the session', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  const start = slots.find((s) => Date.parse(s) >= MON_12 + 72 * 3600_000) as string;
  const created = await call(cal, {
    action: 'reserve', contactKey: 'wa:exp', service: 'consultation',
    startIso: start, minutes: 60, summary: '[Por confirmar] h', description: '', now: MON_12,
  });
  expect(created.ok).toBe(true);
  const early = await call(cal, { action: 'expire', contactKey: 'wa:exp', now: MON_12 + 30 * 3600_000 });
  expect(early).toMatchObject({ ok: true, expired: false, pending: true });
  expect(calEvents).toHaveLength(1);
  const late = await call(cal, {
    action: 'expire', contactKey: 'wa:exp', now: Date.parse(start) - 24 * 3600_000 + 1,
  });
  expect(late).toMatchObject({ ok: true, expired: true });
  expect(calEvents).toHaveLength(0);
  expect(store.reservations.find((r) => r.event_id === created.eventId)?.status).toBe('expired');
});

test('a second free first call inside 90 days is refused after the first is released', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 15, MON_12);
  const first = await call(cal, {
    action: 'reserve', contactKey: 'wa:free', service: 'first-call',
    startIso: slots[0], minutes: 15, summary: 'f', description: '', now: MON_12,
  });
  expect(first.ok).toBe(true);
  await call(cal, { action: 'release', contactKey: 'wa:free' });
  const second = await call(cal, {
    action: 'status', contactKey: 'wa:free', service: 'first-call', minutes: 15, now: MON_12 + DAY_MS,
  });
  expect(second.ok).toBe(false);
  expect(second.reason).toBe('free-limit');
});

const DAY_MS = 86400000;

test('quote offers the same free first-call slots as the agent rules', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const res = await call(cal, { action: 'quote', now: MON_12 });
  expect(res.ok).toBe(true);
  // No contact is admitted and no limits are checked: the public read only
  // quotes. The offer matches the agent's own computation exactly.
  expect(res.slots).toEqual(freeSlots(quoteCfg(), [], [], 15, MON_12));
  expect(res.slots.length).toBeGreaterThan(0);
});

test('quote sees the same busy blocks as the agent, in both calendars', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const before = (await call(cal, { action: 'quote', now: MON_12 })).slots as string[];
  expect(before.length).toBeGreaterThan(1);
  // Blocking the first offered slot in the primary calendar removes it.
  const first = before[0];
  (freeBusy as jest.Mock).mockImplementation(async () => [
    { start: first, end: new Date(Date.parse(first) + 15 * 60000).toISOString() },
  ]);
  const after = (await call(cal, { action: 'quote', now: MON_12 })).slots as string[];
  expect(after).not.toContain(first);
});

test('a web reserve invites the guest, attaches Meet and answers the link', async () => {
  // The insert mock answers a Meet link, like Google does for conference events.
  (insertEvent as jest.Mock).mockImplementation(
    async (_t: string, _c: string, ev: { summary: string; startIso: string; endIso: string }) => {
      evCounter += 1;
      const created = {
        id: 'ev' + evCounter,
        summary: ev.summary,
        start: ev.startIso,
        end: ev.endIso,
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
      };
      calEvents.push(created);
      return { ...created };
    }
  );
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 15, MON_12);
  const res = await call(cal, {
    action: 'reserve',
    service: 'first-call',
    contactKey: 'web:ana@example.com',
    startIso: slots[0],
    minutes: 15,
    summary: 'Primera llamada · Ana',
    description: 'UniverLab · Ana <ana@example.com>',
    attendee: 'ana@example.com',
    conference: true,
    sendUpdates: 'all',
    now: MON_12,
  });
  expect(res.ok).toBe(true);
  expect(res.meet).toBe('https://meet.google.com/abc-defg-hij');
  const sent = (insertEvent as jest.Mock).mock.calls[0];
  expect(sent[2]).toMatchObject({ attendee: 'ana@example.com', conference: true });
  expect(sent[4]).toBe('all');
  // The agent path still books without guests, Meet or notifications, taking
  // a 60-minute start (a 15-minute start cannot hold a 60-minute session).
  const hourSlots = freeSlots(quoteCfg(), [], [], 60, MON_12, 48);
  const agent = await call(cal, {
    action: 'reserve', contactKey: 'wa:111', service: 'consultation',
    startIso: hourSlots[hourSlots.length - 1], minutes: 60, summary: '[Por confirmar] h', description: '', now: MON_12,
  });
  expect(agent.ok).toBe(true);
  const agentSent = (insertEvent as jest.Mock).mock.calls[1];
  expect(agentSent[2]).toMatchObject({ attendee: undefined, conference: false });
  expect(agentSent[4]).toBe('none');
});

test('cancel frees the slot, notifies, and rejects replays and started calls', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 15, MON_12);
  const booked = await call(cal, {
    action: 'reserve', contactKey: 'web:ana@example.com', service: 'first-call',
    startIso: slots[0], minutes: 15, summary: 'Primera llamada · Ana', description: '', now: MON_12,
  });
  expect(booked.ok).toBe(true);
  const cancelled = await call(cal, {
    action: 'cancel', contactKey: 'web:ana@example.com', startIso: slots[0], now: MON_12,
  });
  expect(cancelled).toEqual({ ok: true, start: slots[0] });
  expect(deleteEvent).toHaveBeenCalledWith('tok', 'workbench-id', booked.eventId, undefined, 'all');
  expect(store.reservations[0].status).toBe('released');
  // A replay finds no booking, like a forged start does.
  expect(await call(cal, {
    action: 'cancel', contactKey: 'web:ana@example.com', startIso: slots[0], now: MON_12,
  })).toEqual({ ok: false, reason: 'no-booking' });
  expect(await call(cal, {
    action: 'cancel', contactKey: 'web:ana@example.com', startIso: slots[1], now: MON_12,
  })).toEqual({ ok: false, reason: 'no-booking' });
  // Once the call has started the link is dead instead of cancelling.
  const store2 = makeStore();
  const cal2 = makeCal(store2);
  await call(cal2, {
    action: 'reserve', contactKey: 'web:bea@example.com', service: 'first-call',
    startIso: slots[1], minutes: 15, summary: 'f', description: '', now: MON_12,
  });
  expect(await call(cal2, {
    action: 'cancel', contactKey: 'web:bea@example.com', startIso: slots[1], now: Date.parse(slots[1]),
  })).toEqual({ ok: false, reason: 'started' });
});

test('a failed delete is not a cancellation: the row stays active and a retry works', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  const slots = freeSlots(quoteCfg(), [], [], 15, MON_12);
  const booked = await call(cal, {
    action: 'reserve', contactKey: 'web:ana@example.com', service: 'first-call',
    startIso: slots[0], minutes: 15, summary: 'Primera llamada · Ana', description: '', now: MON_12,
  });
  expect(booked.ok).toBe(true);
  (deleteEvent as jest.Mock).mockRejectedValueOnce(new Error('google deleteEvent 500'));
  expect(await call(cal, {
    action: 'cancel', contactKey: 'web:ana@example.com', startIso: slots[0], now: MON_12,
  })).toEqual({ ok: false, reason: 'calendar-down' });
  // Nothing was released and the event still exists, so confirming again cancels it.
  expect(store.reservations[0].status).toBe('active');
  expect(calEvents.map((e) => e.id)).toContain(booked.eventId);
  expect(await call(cal, {
    action: 'cancel', contactKey: 'web:ana@example.com', startIso: slots[0], now: MON_12,
  })).toEqual({ ok: true, start: slots[0] });
  expect(store.reservations[0].status).toBe('released');
  expect(calEvents.map((e) => e.id)).not.toContain(booked.eventId);
});

test('the day read keeps only the events starting today, from midnight', async () => {
  const store = makeStore();
  const cal = makeCal(store);
  // Monday 2026-11-09 12:00 Bogota and the next morning: only the first
  // starts today, so the agenda lists exactly that one.
  calEvents.push(
    { id: 'today', summary: 'Consultoría · Ana', start: '2026-11-09T17:00:00.000Z', end: '2026-11-09T18:00:00.000Z' },
    { id: 'tomorrow', summary: 'Consultoría · Bea', start: '2026-11-10T17:00:00.000Z', end: '2026-11-10T18:00:00.000Z' }
  );
  expect(await call(cal, { action: 'day', now: MON_12 })).toEqual({
    ok: true,
    events: [
      { id: 'today', summary: 'Consultoría · Ana', start: '2026-11-09T17:00:00.000Z', end: '2026-11-09T18:00:00.000Z' },
    ],
  });
  // The read starts at 00:00 Bogota, not at the run time: a late run still
  // lists the morning's appointments.
  const last = (listEvents as jest.Mock).mock.calls.at(-1) as unknown[];
  expect(last[2]).toBe('2026-11-09T05:00:00.000Z');
});
