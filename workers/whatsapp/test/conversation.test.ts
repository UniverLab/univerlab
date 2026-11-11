/** @jest-environment node */
import type { Inbound } from '../src/meta';

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

jest.mock('../src/meta', () => ({
  sendText: jest.fn(async () => true),
  markRead: jest.fn(async () => true),
}));

jest.mock('../src/brain', () => ({
  answer: jest.fn(),
  runModel: jest.fn(),
  FALLBACK: { es: 'fallback', en: 'fallback' },
  modelConfig: () => ({}),
}));

jest.mock('../src/intake', () => ({
  intake: jest.fn(),
  brief: jest.fn(),
  formatBrief: jest.fn(() => ''),
  CONFIRM_SLOT: { es: 'confirm', en: 'confirm' },
  INTAKE_ASK: { es: 'ask', en: 'ask' },
  INTAKE_FOLLOWUP: { es: 'followup', en: 'followup' },
  normalizeService: jest.fn((raw: string) => {
    const s = raw.trim().toLowerCase().replace(/[_\s]+/g, '-');
    if (s === 'first-call') return 'first-call';
    if (s === 'consultation') return 'consultation';
    return 'other';
  }),
  SERVICE_LABEL: {
    es: { 'first-call': 'Primera llamada', consultation: 'Consultoría' },
    en: { 'first-call': 'First call', consultation: 'Consultation' },
  },
}));

jest.mock('../src/schedule', () => ({
  bookingConfig: jest.fn(() => ({
    windows: [
      [7, 8],
      [15, 19],
    ],
    marginMin: 15,
    maxPerDay: 3,
    noticeHours: 12,
    horizonDays: 14,
  })),
  freeSlots: jest.fn(() => []),
  formatSlot: jest.fn((iso: string) => iso),
  bogotaDateKey: jest.fn(() => '2026-11-09'),
}));

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

jest.mock('../src/booking', () => {
  const actual = jest.requireActual('../src/booking') as Record<string, unknown>;
  return { ...actual, decide: jest.fn() };
});

import { answer, runModel } from '../src/brain';
import { brief, intake } from '../src/intake';
import { markRead, sendText } from '../src/meta';
import { CONFIRM_MS, ERASED, NOT_DELETED, operatorErased, PENDING_ERASE, retentionDeadline } from '../src/erase';
import { accessToken, deleteEvent, freeBusy, getEvent, insertEvent, listEvents } from '../src/google';
import { freeSlots } from '../src/schedule';
import { decide } from '../src/booking';
import { Conversation } from '../src/conversation';

const env = {
  OPERATOR_PHONE: '+57 300 999 8888',
  AI: {},
  WA_ACCESS_TOKEN: 'token',
  WA_PHONE_NUMBER_ID: 'phone-id',
  // The burst window closes at once, so each receive is answered by the
  // alarm that follows it; the waiting itself is covered in burst.test.ts.
  BURST_QUIET_MS: '0',
};

const BOOKING_ENV = {
  ...env,
  GOOGLE_CLIENT_ID: 'cid',
  GOOGLE_CLIENT_SECRET: 'csec',
  GOOGLE_REFRESH_TOKEN: 'rtok',
  WORKBENCH_CALENDAR_ID: 'workbench-id',
};

const SLOT_A = '2026-11-18T20:00:00.000Z';
const SLOT_B = '2026-11-18T20:15:00.000Z';

const CLIENT = '573001112222';
const OPERATOR = '573009998888';
const AT = 1767225600;

function makeCtx(handoff = false) {
  const state = new Map<string, string>();
  if (handoff) state.set('handoff', '1');
  const inserts: unknown[] = [];
  const rows: Array<{ id: string; at: number; role: string; type: string; text: string | null }> = [];
  const sql = {
    exec: jest.fn((query: string, ...params: unknown[]) => {
      if (query.startsWith('SELECT 1 FROM messages WHERE id')) {
        const found = rows.some((r) => r.id === params[0]);
        return { toArray: () => (found ? [1] : []) };
      }
      if (query.startsWith('SELECT id, at, type, text FROM messages WHERE role')) {
        return {
          toArray: () =>
            rows
              .filter((r) => r.role === 'user')
              .map((r) => ({ id: r.id, at: r.at, type: r.type, text: r.text })),
        };
      }
      if (query.startsWith('SELECT role, text FROM messages WHERE text IS NOT NULL')) {
        return {
          toArray: () =>
            rows
              .filter((r) => r.text !== null)
              .reverse()
              .slice(0, 12)
              .map((r) => ({ role: r.role, text: r.text })),
        };
      }
      if (query.startsWith('INSERT INTO messages')) {
        inserts.push(params[0]);
        rows.push({
          id: String(params[0]),
          at: Number(params[1]),
          role: String(params[2]),
          type: String(params[3]),
          text: params[4] as string | null,
        });
        return { toArray: () => [] };
      }
      if (query.startsWith('INSERT INTO state')) state.set(String(params[0]), String(params[1]));
      if (query.startsWith('DELETE FROM state')) state.delete(String(params[0]));
      if (query.startsWith('SELECT value FROM state')) {
        const value = state.get(String(params[0]));
        return { toArray: () => (value === undefined ? [] : [{ value }]) };
      }
      return { toArray: () => [] };
    }),
  };
  const storage = {
    sql,
    setAlarm: jest.fn(async () => {}),
    deleteAlarm: jest.fn(async () => {}),
    deleteAll: jest.fn(async () => {
      state.clear();
    }),
  };
  const ctx = {
    storage,
    blockConcurrencyWhile: (fn: () => unknown) => {
      fn();
    },
  };
  return { ctx, storage, inserts };
}

function inbound(overrides: Partial<Inbound> = {}): Inbound {
  return {
    id: 'wamid.1',
    from: CLIENT,
    timestamp: AT,
    type: 'text',
    text: 'hola',
    ...overrides,
  };
}

// A client message is stored on receive and answered when the burst window
// closes; with BURST_QUIET_MS '0' the alarm right after answers it.
async function say(c: Conversation, msg: Inbound): Promise<void> {
  await c.receive(msg);
  await c.alarm();
}

beforeEach(() => {
  jest.clearAllMocks();
  // Pin the clock near the fixture timestamp so the stored six-month
  // retention still lies in the future while the burst is handled.
  jest.spyOn(Date, 'now').mockReturnValue(AT * 1000 + 3600 * 1000);
  (runModel as jest.Mock).mockResolvedValue('{"delete": false}');
  (decide as jest.Mock).mockResolvedValue({ action: 'other', slot: -1, date: '' });
  (accessToken as jest.Mock).mockResolvedValue('tok');
  (freeBusy as jest.Mock).mockResolvedValue([]);
  (listEvents as jest.Mock).mockResolvedValue([]);
  // A hold the test does not confirm stays a hold: the alarm after every
  // message must not settle it on a previous test's calendar state.
  (getEvent as jest.Mock).mockResolvedValue(null);
  (brief as jest.Mock).mockResolvedValue({ bullets: ['goal x'] });
});

test('deletion request erases storage before any model call and stores nothing', async () => {
  const { ctx, storage, inserts } = makeCtx();
  const c = new Conversation(ctx as never, env as never);

  await c.receive(inbound({ text: ' Bórrar mis datos!!! ' }));

  expect(storage.deleteAll).toHaveBeenCalledTimes(1);
  expect(storage.deleteAlarm).toHaveBeenCalledTimes(1);
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, ERASED.es);
  expect(answer).not.toHaveBeenCalled();
  expect(intake).not.toHaveBeenCalled();
  expect(inserts).toEqual([]);
  expect(storage.setAlarm).not.toHaveBeenCalled();
});

test('deletion reply uses the language of the command', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);

  await c.receive(inbound({ text: 'DELETE MY DATA' }));

  expect(sendText).toHaveBeenCalledWith(env, CLIENT, ERASED.en);
});

test('deletion after a handoff notifies the operator with the phone number', async () => {
  const { ctx } = makeCtx(true);
  const c = new Conversation(ctx as never, env as never);

  await c.receive(inbound({ id: 'wamid.2', text: 'BORRAR MIS DATOS' }));

  const bodies = (sendText as jest.Mock).mock.calls.map((call) => call[2] as string);
  expect(bodies).toContain(ERASED.es);
  expect(bodies).toContain(operatorErased(CLIENT));
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, operatorErased(CLIENT));
});

test('deletion without a handoff does not message the operator', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);

  await c.receive(inbound({ id: 'wamid.3', text: 'BORRAR MIS DATOS' }));

  expect(sendText).toHaveBeenCalledTimes(1);
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, ERASED.es);
});

test('a handoff is remembered, so a later deletion notices the operator', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({
    reply: 'Te paso con una persona',
    booking: false,
    handoff: true,
  });

  await say(c, inbound({ id: 'wamid.7', text: 'quiero hablar con una persona' }));
  await c.receive(inbound({ id: 'wamid.8', text: 'DELETE MY DATA' }));

  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, operatorErased(CLIENT));
});

test('the retention alarm erases everything the object stores', async () => {
  const { ctx, storage } = makeCtx();
  const c = new Conversation(ctx as never, env as never);

  await c.alarm();

  expect(storage.deleteAll).toHaveBeenCalledTimes(1);
  expect(storage.deleteAlarm).toHaveBeenCalledTimes(1);
});

test('an incoming message schedules deletion six months after it', async () => {
  const { ctx, storage, inserts } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'Hola', booking: false, handoff: false });

  await say(c, inbound({ id: 'wamid.4' }));

  expect(storage.setAlarm).toHaveBeenCalledWith(retentionDeadline(AT * 1000));
  expect(storage.deleteAll).not.toHaveBeenCalled();
  expect(inserts[0]).toBe('wamid.4');
  expect(markRead).toHaveBeenCalledWith(env, 'wamid.4');
});

test('a number that writes again after an erasure starts a fresh conversation', async () => {
  const { ctx, storage } = makeCtx(true);
  const c = new Conversation(ctx as never, env as never);

  await c.receive(inbound({ id: 'wamid.5', text: 'BORRAR MIS DATOS' }));
  expect(storage.deleteAll).toHaveBeenCalledTimes(1);

  (answer as jest.Mock).mockResolvedValue({ reply: 'Hola', booking: false, handoff: false });
  await say(c, inbound({ id: 'wamid.6', text: 'hola de nuevo', timestamp: AT + 60 }));

  expect(answer).toHaveBeenCalled();
  expect(storage.setAlarm).toHaveBeenCalledWith(retentionDeadline((AT + 60) * 1000));
  expect((sendText as jest.Mock).mock.calls.map((call) => call[2])).toContain(ERASED.es);
});

function clientTexts(): string[] {
  return (sendText as jest.Mock).mock.calls
    .filter((call) => call[1] === CLIENT)
    .map((call) => call[2] as string);
}

function seedPending(ctx: unknown, lang: 'es' | 'en', expiresAt: number): void {
  const storage = (ctx as { storage: { sql: { exec: (...args: unknown[]) => unknown } } }).storage;
  storage.sql.exec(
    'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    'pendingErase',
    JSON.stringify({ lang, expiresAt })
  );
}

test('a fuzzy deletion request asks for confirmation without erasing', async () => {
  const { ctx, storage } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (runModel as jest.Mock).mockResolvedValue('{"delete": true}');

  await say(c, inbound({ id: 'wamid.f1', text: 'quiero que borren mis datos' }));

  expect(storage.deleteAll).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, PENDING_ERASE.es);
  expect(answer).not.toHaveBeenCalled();
  expect(intake).not.toHaveBeenCalled();
});

test('confirming a pending request erases like the exact phrase', async () => {
  const { ctx, storage } = makeCtx();
  seedPending(ctx, 'es', Date.now() + CONFIRM_MS);
  const c = new Conversation(ctx as never, env as never);

  await say(c, inbound({ id: 'wamid.f2', text: 'SÍ' }));

  // The flush erases; the alarm after finds nothing pending and sleeps wiped.
  expect(storage.deleteAll).toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledTimes(1);
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, ERASED.es);
});

test('any other answer cancels the request and continues normally', async () => {
  const { ctx, storage } = makeCtx();
  seedPending(ctx, 'es', Date.now() + CONFIRM_MS);
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'hola hola', booking: false, handoff: false });

  await say(c, inbound({ id: 'wamid.f3', text: 'ya no quiero' }));

  expect(storage.deleteAll).not.toHaveBeenCalled();
  expect(clientTexts()).toContain(NOT_DELETED.es);
  expect(answer).toHaveBeenCalled();
  expect(clientTexts()).toContain('hola hola');

  // The request is cleared: a later SÍ is just another message.
  await say(c, inbound({ id: 'wamid.f4', text: 'SÍ' }));
  expect(storage.deleteAll).not.toHaveBeenCalled();
});

test('an expired pending confirmation is ignored', async () => {
  const { ctx, storage } = makeCtx();
  seedPending(ctx, 'es', Date.now() - 1000);
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'hola hola', booking: false, handoff: false });

  await say(c, inbound({ id: 'wamid.f5', text: 'SÍ' }));

  expect(storage.deleteAll).not.toHaveBeenCalled();
  expect(clientTexts()).not.toContain(NOT_DELETED.es);
  expect(answer).toHaveBeenCalled();
});

test('the exact phrase still deletes without calling the model', async () => {
  const { ctx, storage } = makeCtx();
  const c = new Conversation(ctx as never, env as never);

  await c.receive(inbound({ id: 'wamid.f6', text: 'BORRAR MIS DATOS' }));

  expect(storage.deleteAll).toHaveBeenCalledTimes(1);
  expect(runModel).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, ERASED.es);
});

test('a question about stored data is answered, not treated as deletion', async () => {
  const { ctx, storage } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'guardamos X', booking: false, handoff: false });

  await say(c, inbound({ id: 'wamid.f7', text: '¿qué datos guardan?' }));

  expect(storage.deleteAll).not.toHaveBeenCalled();
  expect(clientTexts()).not.toContain(PENDING_ERASE.es);
  expect(answer).toHaveBeenCalled();
  expect(clientTexts()).toContain('guardamos X');
});

test('a fuzzy deletion request in english confirms in english', async () => {
  const { ctx, storage } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (runModel as jest.Mock).mockResolvedValue('{"delete": true}');

  await say(c, inbound({ id: 'wamid.f8', text: 'please delete all my data, thanks' }));

  expect(storage.deleteAll).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, PENDING_ERASE.en);

  await say(c, inbound({ id: 'wamid.f9', text: 'YES' }));

  expect(storage.deleteAll).toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, ERASED.en);
});

test('a fuzzy deletion request wins over an active booking flow', async () => {
  const { c } = await offerSlots('first-call');
  (runModel as jest.Mock).mockResolvedValue('{"delete": true}');

  await say(c, inbound({ id: 'wamid.bf', text: 'mejor borren toda mi información' }));

  expect(clientTexts()).toContain(PENDING_ERASE.es);
  expect(decide).not.toHaveBeenCalled();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function offerSlots(service: string) {
  // Pin the clock near the fixture timestamp so the stored six-month
  // retention still lies in the future while the booking is handled.
  jest.spyOn(Date, 'now').mockReturnValue(AT * 1000 + 3600 * 1000);
  const { ctx, storage } = makeCtx();
  const c = new Conversation(ctx as never, BOOKING_ENV as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'x', booking: true, handoff: true, service });
  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  (freeSlots as jest.Mock).mockReturnValue([SLOT_A, SLOT_B]);
  await say(c, inbound({ id: 'wamid.b1', text: 'quiero agendar una llamada' }));
  await say(c, inbound({ id: 'wamid.b2', text: 'quiero lograr X, uso Y' }));
  return { ctx, storage, c };
}

test('offers free slots in Colombia time when the intake is ready', async () => {
  await offerSlots('first-call');

  const texts = clientTexts();
  expect(texts.some((t) => t.includes(SLOT_A) && t.includes(SLOT_B))).toBe(true);
  expect(texts.some((t) => t.includes('hora Colombia'))).toBe(true);
  expect(insertEvent).not.toHaveBeenCalled();
});

test('hands over as today when no slot fits', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, BOOKING_ENV as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'x', booking: true, handoff: true, service: 'first-call' });
  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  (freeSlots as jest.Mock).mockReturnValue([]);
  await say(c, inbound({ id: 'wamid.e1', text: 'quiero agendar una llamada' }));
  await say(c, inbound({ id: 'wamid.e2', text: 'quiero lograr X, uso Y' }));

  // No offer, no event: the brief went to the operator like before.
  expect(insertEvent).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(BOOKING_ENV, OPERATOR, expect.any(String));
  expect(clientTexts().some((t) => t === 'confirm')).toBe(true);
});

test('books a consultation as a hold and tells the client how to pay', async () => {
  const { storage, c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (insertEvent as jest.Mock).mockResolvedValue({ id: 'ev1', summary: '', start: SLOT_A, end: SLOT_B });

  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  expect(insertEvent).toHaveBeenCalledTimes(1);
  const [, calendarId, body] = (insertEvent as jest.Mock).mock.calls[0] as [string, string, { summary: string }];
  expect(calendarId).toBe('workbench-id');
  expect(body.summary.startsWith('[Por confirmar] ')).toBe(true);
  expect(body.summary).toContain('Consultoría');
  const texts = clientTexts();
  expect(texts[texts.length - 1]).toContain('verificar el pago');
  expect(texts[texts.length - 1]).toContain('Bre-B');
  const alarms = (storage.setAlarm as jest.Mock).mock.calls.map((call) => call[0] as number);
  expect(alarms[alarms.length - 1]).toBeLessThan(retentionDeadline(AT * 1000));
});

test('books a first call without a hold prefix', async () => {
  const { storage, c } = await offerSlots('first-call');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 2, date: '' });
  (insertEvent as jest.Mock).mockResolvedValue({ id: 'ev2', summary: '', start: SLOT_B, end: SLOT_B });

  await say(c, inbound({ id: 'wamid.b3', text: 'el segundo' }));

  const [, , body] = (insertEvent as jest.Mock).mock.calls[0] as [string, string, { summary: string }];
  expect(body.summary.startsWith('[Por confirmar] ')).toBe(false);
  expect(body.summary).toContain('Primera llamada');
  const texts = clientTexts();
  expect(texts[texts.length - 1]).toContain('agendé');
  const alarms = (storage.setAlarm as jest.Mock).mock.calls.map((call) => call[0] as number);
  expect(alarms[alarms.length - 1]).toBe(retentionDeadline(AT * 1000));
});

test('deletes an expired hold and tells the client', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (insertEvent as jest.Mock).mockResolvedValue({ id: 'ev1', summary: '', start: SLOT_A, end: SLOT_B });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  (getEvent as jest.Mock).mockResolvedValue({
    id: 'ev1',
    summary: '[Por confirmar] Consultoría · Ana',
    start: SLOT_A,
    end: SLOT_B,
  });

  const t0 = Date.now();
  const spy = jest.spyOn(Date, 'now').mockReturnValue(t0 + 25 * 3600 * 1000 + 60000);
  try {
    await c.alarm();
  } finally {
    spy.mockRestore();
  }

  expect(deleteEvent).toHaveBeenCalledWith('tok', 'workbench-id', 'ev1');
  expect(clientTexts().some((t) => t.includes('venció'))).toBe(true);
});

test('tells the client when the operator confirmed the hold', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (insertEvent as jest.Mock).mockResolvedValue({ id: 'ev1', summary: '', start: SLOT_A, end: SLOT_B });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  (getEvent as jest.Mock).mockResolvedValue({
    id: 'ev1',
    summary: 'Consultoría · Ana',
    start: SLOT_A,
    end: SLOT_B,
  });

  await c.alarm();

  expect(deleteEvent).not.toHaveBeenCalled();
  expect(clientTexts().some((t) => t.includes('confirmada'))).toBe(true);
});

test('a calendar failure apologises, notifies the operator and books nothing', async () => {
  const { c } = await offerSlots('first-call');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (accessToken as jest.Mock).mockRejectedValue(new Error('revoked'));
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  expect(insertEvent).not.toHaveBeenCalled();
  expect(clientTexts().some((t) => t.includes('agenda no responde'))).toBe(true);
  expect(sendText).toHaveBeenCalledWith(BOOKING_ENV, OPERATOR, expect.any(String));

  // The booking is cleared: the next message starts over instead of deciding.
  (answer as jest.Mock).mockResolvedValue({ reply: 'hola', booking: false, handoff: false });
  await say(c, inbound({ id: 'wamid.b4', text: 'hola de nuevo' }));
  expect(answer).toHaveBeenCalledTimes(2);
});

test('cancelling a first call deletes the event and tells the client', async () => {
  const { c } = await offerSlots('first-call');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (insertEvent as jest.Mock).mockResolvedValue({ id: 'ev9', summary: '', start: SLOT_A, end: SLOT_B });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  (decide as jest.Mock).mockResolvedValue({ action: 'cancel', slot: -1, date: '' });

  await say(c, inbound({ id: 'wamid.b4', text: 'mejor cancela' }));

  expect(deleteEvent).toHaveBeenCalledWith('tok', 'workbench-id', 'ev9');
  expect(clientTexts().some((t) => t.includes('cancelé'))).toBe(true);
  expect(sendText).toHaveBeenCalledWith(BOOKING_ENV, OPERATOR, expect.any(String));
});

test('a paid consultation inside 24 hours is moved instead of refunded', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (insertEvent as jest.Mock).mockResolvedValue({ id: 'ev7', summary: '', start: SLOT_A, end: SLOT_B });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  // The operator confirmed the hold: the alarm marks the booking as paid.
  (getEvent as jest.Mock).mockResolvedValue({
    id: 'ev7',
    summary: 'Consultoría · Ana',
    start: SLOT_A,
    end: SLOT_B,
  });
  await c.alarm();
  (Date.now as jest.Mock).mockReturnValue(Date.parse(SLOT_A) - 2 * 3600 * 1000);
  (decide as jest.Mock).mockResolvedValue({ action: 'cancel', slot: -1, date: '' });

  await say(c, inbound({ id: 'wamid.b4', text: 'mejor cancela' }));

  expect(deleteEvent).not.toHaveBeenCalled();
  expect(clientTexts().some((t) => t.includes('una vez sin costo'))).toBe(true);
});

test('cancelling an unpaid hold inside 24 hours just releases it', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (insertEvent as jest.Mock).mockResolvedValue({ id: 'ev8', summary: '', start: SLOT_A, end: SLOT_B });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  (Date.now as jest.Mock).mockReturnValue(Date.parse(SLOT_A) - 2 * 3600 * 1000);
  (decide as jest.Mock).mockResolvedValue({ action: 'cancel', slot: -1, date: '' });

  await say(c, inbound({ id: 'wamid.b4', text: 'mejor cancela' }));

  expect(deleteEvent).toHaveBeenCalledWith('tok', 'workbench-id', 'ev8');
  expect(clientTexts().some((t) => t.includes('cancelé'))).toBe(true);
  expect(clientTexts().some((t) => t.includes('una vez sin costo'))).toBe(false);
});

test('a client message during a hold keeps the hold alarm ahead of retention', async () => {
  const { storage, c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (insertEvent as jest.Mock).mockResolvedValue({ id: 'ev1', summary: '', start: SLOT_A, end: SLOT_B });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  (decide as jest.Mock).mockResolvedValue({ action: 'other', slot: -1, date: '' });

  await say(c, inbound({ id: 'wamid.b4', text: 'ya realicé el pago' }));

  const alarms = (storage.setAlarm as jest.Mock).mock.calls.map((call) => call[0] as number);
  expect(alarms[alarms.length - 1]).toBeLessThan(retentionDeadline(AT * 1000));
});

test('an unconfirmed hold re-arms the alarm before the 24h deadline', async () => {
  const { storage, c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (insertEvent as jest.Mock).mockResolvedValue({ id: 'ev1', summary: '', start: SLOT_A, end: SLOT_B });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  (getEvent as jest.Mock).mockResolvedValue({
    id: 'ev1',
    summary: '[Por confirmar] Consultoría · Ana',
    start: SLOT_A,
    end: SLOT_B,
  });

  await c.alarm();

  const alarms = (storage.setAlarm as jest.Mock).mock.calls.map((call) => call[0] as number);
  const last = alarms[alarms.length - 1];
  expect(last).toBeGreaterThan(Date.now());
  expect(last).toBeLessThan(retentionDeadline(AT * 1000));
  expect(deleteEvent).not.toHaveBeenCalled();
});

test('moving a confirmed consultation keeps it confirmed', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (insertEvent as jest.Mock)
    .mockResolvedValueOnce({ id: 'ev1', summary: '', start: SLOT_A, end: SLOT_B })
    .mockResolvedValue({ id: 'ev2', summary: '', start: SLOT_B, end: SLOT_B });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  (getEvent as jest.Mock).mockResolvedValue({
    id: 'ev1',
    summary: 'Consultoría · Ana',
    start: SLOT_A,
    end: SLOT_B,
  });
  await c.alarm();

  (decide as jest.Mock).mockResolvedValue({ action: 'move', slot: -1, date: '' });
  await say(c, inbound({ id: 'wamid.b4', text: 'mejor otro horario' }));
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 2, date: '' });
  await say(c, inbound({ id: 'wamid.b5', text: 'el segundo' }));

  expect(deleteEvent).toHaveBeenCalledWith('tok', 'workbench-id', 'ev1');
  const calls = (insertEvent as jest.Mock).mock.calls as Array<[string, string, { summary: string }]>;
  expect(calls).toHaveLength(2);
  expect(calls[1][2].summary.startsWith('[Por confirmar] ')).toBe(false);
  expect(clientTexts().some((t) => t.includes('Consultoría'))).toBe(true);
});

test('erasing releases the held event', async () => {
  const { storage, c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (insertEvent as jest.Mock).mockResolvedValue({ id: 'ev1', summary: '', start: SLOT_A, end: SLOT_B });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  await c.receive(inbound({ id: 'wamid.b5', text: 'BORRAR MIS DATOS' }));

  expect(deleteEvent).toHaveBeenCalledWith('tok', 'workbench-id', 'ev1');
  expect(storage.deleteAll).toHaveBeenCalled();
  expect(clientTexts().some((t) => t.includes('borré'))).toBe(true);
});
