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
  sendMedia: jest.fn(async () => true),
  markRead: jest.fn(async () => true),
}));

jest.mock('../src/brain', () => ({
  answer: jest.fn(),
  runModel: jest.fn(),
  FALLBACK: { es: 'fallback', en: 'fallback' },
  modelConfig: () => ({}),
}));

jest.mock('../src/audio', () => ({
  transcribe: jest.fn(),
  voiceConfig: jest.fn(() => ({ model: 'voice-model', options: {}, maxSeconds: 180 })),
  VOICE_HANDOFF: {
    es: 'No pude escuchar tu nota de voz. Una persona del laboratorio la escuchará y te responde pronto.',
    en: 'I could not listen to your voice note. Someone at the lab will listen to it and reply soon.',
  },
  DEFAULT_VOICE_MODEL: '@cf/openai/whisper',
  DEFAULT_VOICE_MAX_SECONDS: 180,
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

jest.mock('../src/proof', () => {
  const actual = jest.requireActual('../src/proof') as Record<string, unknown>;
  return { ...actual, readProof: jest.fn(), forwardUnread: jest.fn() };
});

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

jest.mock('../src/reservations', () => {
  const actual = jest.requireActual('../src/reservations') as Record<string, unknown>;
  return { ...actual, calendarCall: jest.fn() };
});

jest.mock('../src/booking', () => {
  const actual = jest.requireActual('../src/booking') as Record<string, unknown>;
  return { ...actual, decide: jest.fn() };
});

import { answer, runModel } from '../src/brain';
import { transcribe } from '../src/audio';
import { brief, intake } from '../src/intake';
import { markRead, sendText } from '../src/meta';
import { CONFIRM_MS, ERASED, NOT_DELETED, operatorErased, PENDING_ERASE, retentionDeadline } from '../src/erase';
import { calendarCall } from '../src/reservations';
import { decide } from '../src/booking';
import { LIMIT_TEXT } from '../src/limits';
import { OPENING } from '../src/opening';
import { PROOF_RECEIVED, forwardUnread, readProof } from '../src/proof';
import { GUARD_PAUSED } from '../src/guard';
import { shortCode } from '../src/registry';
import { Conversation, NON_TEXT } from '../src/conversation';

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
  const rows: Array<{
    id: string;
    at: number;
    role: string;
    type: string;
    text: string | null;
    mediaId: string | null;
    mime: string | null;
  }> = [];
  const sql = {
    exec: jest.fn((query: string, ...params: unknown[]) => {
      if (query.startsWith('SELECT 1 FROM messages WHERE id')) {
        const found = rows.some((r) => r.id === params[0]);
        return { toArray: () => (found ? [1] : []) };
      }
      if (query.startsWith("SELECT 1 FROM messages WHERE role = 'user'")) {
        return { toArray: () => (rows.some((r) => r.role === 'user') ? [1] : []) };
      }
      if (query.startsWith('SELECT id, at, type, text, media_id, mime FROM messages WHERE role')) {
        return {
          toArray: () =>
            rows
              .filter((r) => r.role === 'user')
              .map((r) => ({ id: r.id, at: r.at, type: r.type, text: r.text, media_id: r.mediaId, mime: r.mime })),
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
          mediaId: (params[5] as string | null) ?? null,
          mime: (params[6] as string | null) ?? null,
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
      rows.length = 0;
    }),
  };
  const ctx = {
    storage,
    blockConcurrencyWhile: (fn: () => unknown) => {
      fn();
    },
  };
  return { ctx, storage, inserts, rows };
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
  // The owner answers status with a free contact and two slots unless the
  // test overrides it; every other op is calendar-down by default.
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    return { ok: false, reason: 'calendar-down' };
  });
  (brief as jest.Mock).mockResolvedValue({ bullets: ['goal x'] });
  // A voice note hands off unless the test transcribes it.
  (transcribe as jest.Mock).mockResolvedValue({ ok: false });
  // A receipt falls back to today's handoff unless the test reads it.
  (readProof as jest.Mock).mockResolvedValue(null);
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
  seedMessage(ctx, 'wamid.prior-f2', 'user', 'hola', AT);
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
  await say(c, inbound({ id: 'wamid.b1', text: 'quiero agendar una llamada' }));
  await say(c, inbound({ id: 'wamid.b2', text: 'quiero lograr X, uso Y' }));
  return { ctx, storage, c };
}

test('offers free slots in Colombia time when the intake is ready', async () => {
  await offerSlots('first-call');

  const texts = clientTexts();
  expect(texts.some((t) => t.includes(SLOT_A) && t.includes(SLOT_B))).toBe(true);
  expect(texts.some((t) => t.includes('hora Colombia'))).toBe(true);
  expect(calendarCall).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'reserve' }));
});

test('hands over as today when no slot fits', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, BOOKING_ENV as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'x', booking: true, handoff: true, service: 'first-call' });
  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  (calendarCall as jest.Mock).mockResolvedValue({ ok: true, active: null, slots: [] });
  await say(c, inbound({ id: 'wamid.e1', text: 'quiero agendar una llamada' }));
  await say(c, inbound({ id: 'wamid.e2', text: 'quiero lograr X, uso Y' }));

  // No offer, no event: the brief went to the operator like before.
  expect(calendarCall).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'reserve' }));
  expect(sendText).toHaveBeenCalledWith(BOOKING_ENV, OPERATOR, expect.any(String));
  expect(clientTexts().some((t) => t === 'confirm')).toBe(true);
});

test('books a consultation as a hold and tells the client how to pay', async () => {
  const { storage, c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    return { ok: false, reason: 'calendar-down' };
  });

  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  const reserve = (calendarCall as jest.Mock).mock.calls.find((call) => call[1].action === 'reserve');
  expect(reserve).toBeDefined();
  expect(reserve[1].summary.startsWith('[Por confirmar] ')).toBe(true);
  expect(reserve[1].summary).toContain('Consultoría');
  expect(reserve[1].startIso).toBe(SLOT_A);
  const texts = clientTexts();
  expect(texts[texts.length - 1]).toContain('verificar el pago');
  expect(texts[texts.length - 1]).toContain('Bre-B');
  const alarms = (storage.setAlarm as jest.Mock).mock.calls.map((call) => call[0] as number);
  expect(alarms[alarms.length - 1]).toBeLessThan(retentionDeadline(AT * 1000));
});

test('books a first call without a hold prefix', async () => {
  const { storage, c } = await offerSlots('first-call');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 2, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev2', start: SLOT_B, end: SLOT_B, kind: 'booked' };
    return { ok: false, reason: 'calendar-down' };
  });

  await say(c, inbound({ id: 'wamid.b3', text: 'el segundo' }));

  const reserve = (calendarCall as jest.Mock).mock.calls.find((call) => call[1].action === 'reserve');
  expect(reserve[1].summary.startsWith('[Por confirmar] ')).toBe(false);
  expect(reserve[1].summary).toContain('Primera llamada');
  const texts = clientTexts();
  expect(texts[texts.length - 1]).toContain('agendé');
  const alarms = (storage.setAlarm as jest.Mock).mock.calls.map((call) => call[0] as number);
  expect(alarms[alarms.length - 1]).toBe(retentionDeadline(AT * 1000));
});

test('deletes an expired hold and tells the client', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'expire') return { ok: true, expired: true, eventId: 'ev1' };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  const t0 = Date.now();
  const spy = jest.spyOn(Date, 'now').mockReturnValue(t0 + 25 * 3600 * 1000 + 60000);
  try {
    await c.alarm();
  } finally {
    spy.mockRestore();
  }

  expect(calendarCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'expire' }));
  expect(clientTexts().some((t) => t.includes('venció'))).toBe(true);
});

test('tells the client when the operator confirmed the hold', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'expire') return { ok: true, expired: false, confirmed: true, start: SLOT_A };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  await c.alarm();

  expect(calendarCall).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'release' }));
  expect(clientTexts().some((t) => t.includes('confirmada'))).toBe(true);
});

test('a calendar failure apologises, notifies the operator and books nothing', async () => {
  const { c } = await offerSlots('first-call');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

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
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev9', start: SLOT_A, end: SLOT_B, kind: 'booked' };
    if (body.action === 'release') return { ok: true, eventId: 'ev9', start: SLOT_A };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  (decide as jest.Mock).mockResolvedValue({ action: 'cancel', slot: -1, date: '' });

  await say(c, inbound({ id: 'wamid.b4', text: 'mejor cancela' }));

  expect(calendarCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'release' }));
  expect(clientTexts().some((t) => t.includes('cancelé'))).toBe(true);
  expect(sendText).toHaveBeenCalledWith(BOOKING_ENV, OPERATOR, expect.any(String));
});

test('a paid consultation inside 24 hours is moved instead of refunded', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') {
      return {
        ok: true,
        active: { eventId: 'ev7', start: SLOT_A, end: SLOT_B, kind: 'hold', service: 'consultation', createdAt: AT * 1000 },
        slots: [SLOT_A, SLOT_B],
      };
    }
    if (body.action === 'reserve') return { ok: true, eventId: 'ev7', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'expire') return { ok: true, expired: false, confirmed: true, start: SLOT_A };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  // The owner reports the hold confirmed: the alarm marks the booking as paid.
  await c.alarm();
  (Date.now as jest.Mock).mockReturnValue(Date.parse(SLOT_A) - 2 * 3600 * 1000);
  (decide as jest.Mock).mockResolvedValue({ action: 'cancel', slot: -1, date: '' });

  await say(c, inbound({ id: 'wamid.b4', text: 'mejor cancela' }));

  expect(calendarCall).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'release' }));
  expect(clientTexts().some((t) => t.includes('una vez sin costo'))).toBe(true);
});

test('cancelling an unpaid hold inside 24 hours just releases it', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev8', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'release') return { ok: true, eventId: 'ev8', start: SLOT_A };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  (Date.now as jest.Mock).mockReturnValue(Date.parse(SLOT_A) - 2 * 3600 * 1000);
  (decide as jest.Mock).mockResolvedValue({ action: 'cancel', slot: -1, date: '' });

  await say(c, inbound({ id: 'wamid.b4', text: 'mejor cancela' }));

  expect(calendarCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'release' }));
  expect(clientTexts().some((t) => t.includes('cancelé'))).toBe(true);
  expect(clientTexts().some((t) => t.includes('una vez sin costo'))).toBe(false);
});

test('a client message during a hold keeps the hold alarm ahead of retention', async () => {
  const { storage, c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'expire') return { ok: true, expired: false, pending: true };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  (decide as jest.Mock).mockResolvedValue({ action: 'other', slot: -1, date: '' });

  await say(c, inbound({ id: 'wamid.b4', text: 'ya realicé el pago' }));

  const alarms = (storage.setAlarm as jest.Mock).mock.calls.map((call) => call[0] as number);
  expect(alarms[alarms.length - 1]).toBeLessThan(retentionDeadline(AT * 1000));
});

test('an unconfirmed hold re-arms the alarm before the 24h deadline', async () => {
  const { storage, c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'expire') return { ok: true, expired: false, pending: true };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  await c.alarm();

  const alarms = (storage.setAlarm as jest.Mock).mock.calls.map((call) => call[0] as number);
  const last = alarms[alarms.length - 1];
  expect(last).toBeGreaterThan(Date.now());
  expect(last).toBeLessThan(retentionDeadline(AT * 1000));
  expect(calendarCall).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'release' }));
});

test('moving a confirmed consultation keeps it confirmed', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') {
      return {
        ok: true,
        active: { eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold', service: 'consultation', createdAt: AT * 1000 },
        slots: [SLOT_A, SLOT_B],
      };
    }
    if (body.action === 'reserve') return { ok: true, eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'expire') return { ok: true, expired: false, confirmed: true, start: SLOT_A };
    if (body.action === 'move') return { ok: true, eventId: 'ev2', start: SLOT_B, end: SLOT_B, kind: 'booked' };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  await c.alarm();

  (decide as jest.Mock).mockResolvedValue({ action: 'move', slot: -1, date: '' });
  await say(c, inbound({ id: 'wamid.b4', text: 'mejor otro horario' }));
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 2, date: '' });
  await say(c, inbound({ id: 'wamid.b5', text: 'el segundo' }));

  const move = (calendarCall as jest.Mock).mock.calls.find((call) => call[1].action === 'move');
  expect(move).toBeDefined();
  expect(move[1].startIso).toBe(SLOT_B);
  expect(calendarCall).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'release' }));
  expect(clientTexts().some((t) => t.includes('Consultoría'))).toBe(true);
});

test('erasing releases the held event and clears the owner records', async () => {
  const { storage, c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'release') return { ok: true, eventId: 'ev1', start: SLOT_A };
    if (body.action === 'erase') return { ok: true };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  await c.receive(inbound({ id: 'wamid.b5', text: 'BORRAR MIS DATOS' }));

  expect(calendarCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'release' }));
  expect(calendarCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'erase' }));
  expect(storage.deleteAll).toHaveBeenCalled();
  expect(clientTexts().some((t) => t.includes('borré'))).toBe(true);
});

test('a limit refusal hands off with the fixed wording and creates no event', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, BOOKING_ENV as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'x', booking: true, handoff: true, service: 'consultation' });
  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  (calendarCall as jest.Mock).mockResolvedValue({ ok: false, reason: 'hold-cap' });
  await say(c, inbound({ id: 'wamid.l1', text: 'quiero agendar una llamada' }));
  await say(c, inbound({ id: 'wamid.l2', text: 'quiero lograr X, uso Y' }));

  expect(clientTexts()).toContain(LIMIT_TEXT['hold-cap'].es);
  expect(sendText).toHaveBeenCalledWith(BOOKING_ENV, OPERATOR, expect.stringContaining('hold-cap'));
  expect(calendarCall).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'reserve' }));
});

test('an active booking is pointed at, never doubled', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, BOOKING_ENV as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'x', booking: true, handoff: true, service: 'consultation' });
  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') {
      return {
        ok: true,
        active: { eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold', service: 'consultation', createdAt: AT * 1000 },
        slots: [],
      };
    }
    if (body.action === 'release') return { ok: true, eventId: 'ev1', start: SLOT_A };
    return { ok: false, reason: 'calendar-down' };
  });
  (decide as jest.Mock).mockResolvedValue({ action: 'cancel', slot: -1, date: '' });

  await say(c, inbound({ id: 'wamid.b3', text: 'quiero otra cita' }));
  await say(c, inbound({ id: 'wamid.b3x', text: 'quiero lograr X, uso Y' }));

  expect(clientTexts().some((t) => t.includes('Ya tienes'))).toBe(true);
  expect(calendarCall).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'reserve' }));

  await say(c, inbound({ id: 'wamid.b4', text: 'mejor cancela' }));

  expect(calendarCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'release' }));
  expect(clientTexts().some((t) => t.includes('cancelé'))).toBe(true);
});

test('a lost race re-offers the slots that remain', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_B] };
    if (body.action === 'reserve') return { ok: false, reason: 'slot-taken' };
    return { ok: false, reason: 'calendar-down' };
  });

  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  expect(clientTexts().some((t) => t.includes('se acaba de ocupar'))).toBe(true);
  expect(clientTexts().some((t) => t.includes(SLOT_B))).toBe(true);
});

function seedTaken(ctx: unknown, code: string, at: number): void {
  const storage = (ctx as { storage: { sql: { exec: (...args: unknown[]) => unknown } } }).storage;
  storage.sql.exec(
    'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    'taken',
    JSON.stringify({ code, at })
  );
}

function seedMessage(
  ctx: unknown,
  id: string,
  role: string,
  text: string,
  at: number
): void {
  const storage = (ctx as { storage: { sql: { exec: (...args: unknown[]) => unknown } } }).storage;
  storage.sql.exec(
    'INSERT INTO messages (id, at, role, type, text, media_id) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    at,
    role,
    'text',
    text,
    null
  );
}

const REGISTRY_ENV = (fetchMock: jest.Mock) => ({
  ...env,
  REGISTRY: {
    idFromName: (name: string) => name,
    get: jest.fn(() => ({ fetch: fetchMock })),
  },
});

test('a taken conversation relays the client message instead of answering', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  seedTaken(ctx, 'ab12', Date.now());
  (answer as jest.Mock).mockResolvedValue({ reply: 'Hola', booking: false, handoff: false });

  await c.receive(inbound({ id: 'wamid.t1', text: 'hola?', name: 'Ana' }));

  expect(answer).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('[ab12]'));
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('+573001112222'));
  expect(clientTexts()).toEqual([]);
});

test('an operator message reads as assistant history', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  seedMessage(ctx, 'wamid.h1', 'user', 'cuánto cuesta', AT);
  seedMessage(ctx, 'op-1', 'operator', 'Hola Ana, te confirmo el precio', AT + 1);
  (answer as jest.Mock).mockResolvedValue({ reply: 'listo', booking: false, handoff: false });

  await say(c, inbound({ id: 'wamid.h2', text: 'gracias' }));

  expect(answer).toHaveBeenCalled();
  const history = (answer as jest.Mock).mock.calls[0][1] as Array<{ role: string; text: string }>;
  expect(history).toContainEqual({ role: 'assistant', text: 'Hola Ana, te confirmo el precio' });
  expect(history.some((h) => h.role === 'operator')).toBe(false);
});

test('a taken conversation returns to the agent after 24 hours and tells the operator', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  seedTaken(ctx, 'ab12', Date.now() - 25 * 3600 * 1000);

  await c.alarm();

  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('retomé'));
  (answer as jest.Mock).mockResolvedValue({ reply: 'Hola de nuevo', booking: false, handoff: false });
  await say(c, inbound({ id: 'wamid.t2', text: 'sigues ahí?' }));
  expect(answer).toHaveBeenCalled();
});

test('a handoff registers the client and carries the code', async () => {
  const fetchMock = jest.fn(async () => new Response(JSON.stringify({ code: 'zz99' }), { status: 200 }));
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, REGISTRY_ENV(fetchMock) as never);
  (answer as jest.Mock).mockResolvedValue({
    reply: 'Te paso con una persona',
    booking: false,
    handoff: true,
  });

  await say(c, inbound({ id: 'wamid.n1', text: 'quiero hablar con una persona' }));

  // Register plus the spending-guard checks (model admission, handoff
  // throttle, operator hourly cap) all reach the single Operator owner.
  expect(fetchMock).toHaveBeenCalledTimes(4);
  const payloads = await Promise.all(
    fetchMock.mock.calls.map(async (call) => (await (call[0] as Request).json()) as Record<string, unknown>)
  );
  expect(payloads).toContainEqual(
    expect.objectContaining({ action: 'register', phone: CLIENT, kind: 'handoff' })
  );
  const bodies = (sendText as jest.Mock).mock.calls
    .filter((call) => call[1] === OPERATOR)
    .map((call) => call[2] as string);
  expect(bodies.some((b) => b.includes('[zz99]'))).toBe(true);
});

test('erasing also releases the client from the registry', async () => {
  const fetchMock = jest.fn(async () => new Response(JSON.stringify({ code: 'zz99' }), { status: 200 }));
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, REGISTRY_ENV(fetchMock) as never);

  await c.receive(inbound({ id: 'wamid.n2', text: 'BORRAR MIS DATOS' }));

  const payloads = await Promise.all(
    fetchMock.mock.calls.map(async (call) => ((await (call[0] as Request).json()) as { action: string }))
  );
  expect(payloads).toContainEqual({ action: 'release', phone: CLIENT });
});

test('an operator confirm patches the hold and tells the client', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'confirm') return { ok: true, eventId: 'ev1' };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  const res = await c.control({ action: 'operatorConfirm' });

  expect(res).toEqual({ ok: true });
  const confirm = (calendarCall as jest.Mock).mock.calls.find((call) => call[1].action === 'confirm');
  expect(confirm).toBeDefined();
  expect(confirm[1].summary).not.toContain('[Por confirmar]');
  expect(clientTexts().some((t) => t.includes('confirmada'))).toBe(true);
});

test('an operator cancel straight-cancels without the move-once reoffer', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev9', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'release') return { ok: true, eventId: 'ev9', start: SLOT_A };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));

  const res = await c.control({ action: 'operatorCancel' });

  expect(res).toEqual({ ok: true });
  expect(calendarCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'release' }));
  expect(clientTexts().some((t) => t.includes('cancelé'))).toBe(true);
  expect(clientTexts().some((t) => t.includes('una vez sin costo'))).toBe(false);
});

test('a burst queued before tomar is relayed, not answered, while taken', async () => {
  const { ctx } = makeCtx();
  seedMessage(ctx, 'wamid.prior-t3', 'user', 'hola', AT);
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'Hola', booking: false, handoff: false });
  await c.receive(inbound({ id: 'wamid.t3', text: 'hola?', name: 'Ana' }));
  seedTaken(ctx, 'ab12', Date.now());

  await c.alarm();

  expect(answer).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('[ab12]'));
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('Ana +573001112222'));
  expect(clientTexts()).toEqual([]);
});

test('tomar on an overdue burst flushes it as a relay right away', async () => {
  const burstEnv = { ...env, BURST_QUIET_MS: '60000' };
  const { ctx } = makeCtx();
  seedMessage(ctx, 'wamid.prior-t4', 'user', 'hola', AT);
  const c = new Conversation(ctx as never, burstEnv as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'Hola', booking: false, handoff: false });
  await c.receive(inbound({ id: 'wamid.t4', text: 'hola?', name: 'Ana' }));
  // The burst window closes while the conversation is taken.
  jest.spyOn(Date, 'now').mockReturnValue(AT * 1000 + 3600 * 1000 + 120000);
  await c.control({ action: 'take', code: 'ab12' });

  await c.alarm();

  expect(answer).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(burstEnv, OPERATOR, expect.stringContaining('[ab12]'));
  expect(clientTexts()).toEqual([]);
});

test('a transcribed voice note is stored and answered like typed text', async () => {
  const { ctx, rows } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (transcribe as jest.Mock).mockResolvedValue({ ok: true, text: 'qué precio tiene' });
  (answer as jest.Mock).mockResolvedValue({ reply: 'cuesta tanto', booking: false, handoff: false });

  await say(
    c,
    inbound({ id: 'wamid.v1', type: 'audio', text: undefined, mediaId: 'media-1', duration: 5.4 })
  );

  // The history keeps the transcript marked as a voice note; the audio is gone.
  expect(rows.find((r) => r.id === 'wamid.v1')).toMatchObject({
    type: 'audio',
    text: 'qué precio tiene',
    mediaId: null,
  });
  expect(answer).toHaveBeenCalledTimes(1);
  const history = (answer as jest.Mock).mock.calls[0][1] as Array<{ role: string; text: string }>;
  expect(history.filter((t) => t.role === 'user').map((t) => t.text)).toEqual(['qué precio tiene']);
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, 'cuesta tanto');
});

test('a voice note that fails transcription goes to the operator', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (transcribe as jest.Mock).mockResolvedValue({ ok: false });

  await c.receive(inbound({ id: 'wamid.v2', type: 'audio', text: undefined, mediaId: 'media-2' }));

  expect(transcribe).toHaveBeenCalledTimes(1);
  expect(sendText).toHaveBeenCalledWith(
    env,
    CLIENT,
    expect.stringContaining('No pude escuchar tu nota de voz')
  );
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('[audio]'));
  expect(answer).not.toHaveBeenCalled();

  await c.alarm();
  expect(answer).not.toHaveBeenCalled();
});

test('a voice note longer than the limit goes to the operator untranscribed', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);

  await c.receive(
    inbound({ id: 'wamid.v3', type: 'audio', text: undefined, mediaId: 'media-3', duration: 181 })
  );

  expect(transcribe).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(
    env,
    CLIENT,
    expect.stringContaining('No pude escuchar tu nota de voz')
  );
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('[audio]'));
  expect(answer).not.toHaveBeenCalled();
});

test('a voice note saying the deletion phrase erases everything', async () => {
  const { ctx, storage, inserts } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (transcribe as jest.Mock).mockResolvedValue({ ok: true, text: 'borrar mis datos' });

  await c.receive(inbound({ id: 'wamid.v4', type: 'audio', text: undefined, mediaId: 'media-4' }));

  expect(storage.deleteAll).toHaveBeenCalledTimes(1);
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, ERASED.es);
  expect(answer).not.toHaveBeenCalled();
  expect(inserts).toEqual([]);
});

test('an operator confirm still lands when the client notice fails', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev2', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'confirm') return { ok: true, eventId: 'ev2' };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b4', text: 'el primero' }));
  (sendText as jest.Mock).mockImplementationOnce(async () => {
    throw new Error('whatsapp down');
  });

  const res = await c.control({ action: 'operatorConfirm' });

  expect(res).toEqual({ ok: true });
  const confirm = (calendarCall as jest.Mock).mock.calls.find((call) => call[1].action === 'confirm');
  expect(confirm).toBeDefined();
  expect(confirm[1].summary).not.toContain('[Por confirmar]');
});

function imageInbound(id: string): Inbound {
  return inbound({ id, type: 'image', text: undefined, mediaId: 'media-9', mime: 'image/jpeg' });
}

async function holdConsultation() {
  const { ctx, storage, c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'expire') return { ok: true, expired: false, pending: true };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  return { ctx, storage, c };
}

test('a held booking image goes to the operator with the proof, never NON_TEXT', async () => {
  const { storage, c } = await holdConsultation();
  (readProof as jest.Mock).mockImplementation(
    async (
      _env: unknown,
      _st: unknown,
      _media: unknown,
      _cfg: unknown,
      _payee: unknown,
      code: unknown
    ) => ({
      operatorText: 'UniverLab [' + code + '] · comprobante de Ana: 150000 COP. confirmar ' + code,
      clientText: PROOF_RECEIVED.es,
      proof: {
        readable: true,
        amount: 150000,
        currency: 'COP',
        date: '2026-11-10',
        method: 'Bre-B',
        reference: '123',
        payee: '',
        flag: '',
      },
    })
  );

  const answersBefore = (answer as jest.Mock).mock.calls.length;
  await say(c, imageInbound('wamid.p1'));
  expect((answer as jest.Mock).mock.calls.length).toBe(answersBefore);

  expect(readProof).toHaveBeenCalledTimes(1);
  const proofCall = (readProof as jest.Mock).mock.calls[0];
  expect(proofCall[1]).toMatchObject({ phase: 'held' });
  expect(proofCall[2]).toMatchObject({ id: 'media-9', kind: 'image', mime: 'image/jpeg' });
  expect(proofCall[5]).toBe(shortCode(CLIENT));
  const opBodies = (sendText as jest.Mock).mock.calls
    .filter((call) => call[1] === OPERATOR)
    .map((call) => call[2] as string);
  expect(opBodies.some((b) => b.includes('[' + shortCode(CLIENT) + ']') && b.includes('comprobante'))).toBe(true);
  expect(clientTexts()).toContain(PROOF_RECEIVED.es);
  expect(clientTexts()).not.toContain(NON_TEXT.es);
  // The extraction is kept on the booking for the operator's confirmar.
  const bookingWrites = (storage.sql.exec as jest.Mock).mock.calls.filter(
    (call) => String(call[0]).startsWith('INSERT INTO state') && call[1] === 'booking'
  );
  const saved = JSON.parse(bookingWrites[bookingWrites.length - 1][2] as string) as {
    proof?: { amount: number; currency: string; flag: string };
  };
  expect(saved.proof).toMatchObject({ amount: 150000, currency: 'COP', flag: '' });
});

test('an image without a held booking keeps today handoff', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);

  await say(c, imageInbound('wamid.p2'));

  expect(readProof).not.toHaveBeenCalled();
  expect(clientTexts()).toContain(NON_TEXT.es);
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('[image]'));
  expect(answer).not.toHaveBeenCalled();
});

function seedState(ctx: unknown, key: string, value: string): void {
  const storage = (ctx as { storage: { sql: { exec: (...args: unknown[]) => unknown } } }).storage;
  storage.sql.exec(
    'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

const guardFetchMock = (handler: (body: Record<string, unknown>) => unknown) =>
  jest.fn(async (req: Request) => new Response(JSON.stringify(handler((await req.json()) as Record<string, unknown>)), {
    status: 200,
  }));

test('past 12 bursts an hour the client gets one notice and nothing else happens', async () => {
  const { ctx, rows } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'Hola', booking: false, handoff: false });
  const now = Date.now();
  seedState(ctx, 'guardBursts', JSON.stringify(Array.from({ length: 12 }, () => now)));

  await say(c, inbound({ id: 'wamid.g1', text: 'hola uno' }));
  await say(c, inbound({ id: 'wamid.g2', text: 'hola dos' }));

  // One fixed notice for the window, and the messages are only stored.
  const paused = (sendText as jest.Mock).mock.calls.filter(
    (call) => call[1] === CLIENT && call[2] === GUARD_PAUSED.es
  );
  expect(paused).toHaveLength(1);
  expect(answer).not.toHaveBeenCalled();
  expect(runModel).not.toHaveBeenCalled();
  expect(
    (sendText as jest.Mock).mock.calls.some((call) => call[1] === OPERATOR)
  ).toBe(false);
  expect(rows.filter((r) => r.role === 'user')).toHaveLength(2);
});

test('past 40 bursts a day the day notice goes once and the window resets', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'Hola', booking: false, handoff: false });
  const now = Date.now();
  // All older than the rolling hour, all the same Bogota day (mocked): the
  // hour cap passes and the day cap blocks.
  seedState(
    ctx,
    'guardBursts',
    JSON.stringify(Array.from({ length: 40 }, (_, i) => now - (61 + i) * 60 * 1000))
  );

  await say(c, inbound({ id: 'wamid.g3', text: 'hola tres' }));
  await say(c, inbound({ id: 'wamid.g4', text: 'hola cuatro' }));

  const paused = (sendText as jest.Mock).mock.calls.filter(
    (call) => call[1] === CLIENT && call[2] === GUARD_PAUSED.es
  );
  expect(paused).toHaveLength(1);
  expect(answer).not.toHaveBeenCalled();
});

test('the exact deletion phrase still erases over the hourly limit', async () => {
  const { ctx, storage } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  seedState(ctx, 'guardBursts', JSON.stringify(Array.from({ length: 12 }, () => Date.now())));

  await c.receive(inbound({ id: 'wamid.g5', text: 'BORRAR MIS DATOS' }));

  expect(storage.deleteAll).toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, ERASED.es);
  expect(runModel).not.toHaveBeenCalled();
  expect(
    (sendText as jest.Mock).mock.calls.some((call) => call[1] === CLIENT && call[2] === GUARD_PAUSED.es)
  ).toBe(false);
});

test('the 6th voice note in a day goes untranscribed with no model call', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  seedState(ctx, 'guardVoice', JSON.stringify({ day: '2026-11-09', count: 5 }));

  await c.receive(inbound({ id: 'wamid.g6', type: 'audio', text: undefined, mediaId: 'media-6' }));

  expect(transcribe).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(
    env,
    CLIENT,
    expect.stringContaining('No pude escuchar tu nota de voz')
  );
  // The note keeps today's handoff like any untranscribed voice note.
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('[audio]'));
});

test('the 4th receipt on one hold is forwarded unread with no vision call', async () => {
  const { ctx: holdCtx, c } = await holdConsultation();
  (forwardUnread as jest.Mock).mockResolvedValue({
    operatorText: 'UniverLab [code] · comprobante sin leer',
    clientText: PROOF_RECEIVED.es,
  });
  seedState(holdCtx, 'guardProof', JSON.stringify({ hold: 'ev1', count: 3 }));

  await say(c, imageInbound('wamid.g7'));

  expect(readProof).not.toHaveBeenCalled();
  expect(forwardUnread).toHaveBeenCalledTimes(1);
  expect(clientTexts()).toContain(PROOF_RECEIVED.es);
  expect(clientTexts()).not.toContain(NON_TEXT.es);
});

test('past the Worker model limit every client gets the fallback and a handoff', async () => {
  const fetchMock = guardFetchMock((body) => {
    if (body.action === 'guard' && body.op === 'model') return { ok: false };
    if (body.action === 'guard' && body.op === 'handoff') return { ok: true };
    if (body.action === 'guard' && body.op === 'opmsg') return { send: true, firstOver: false, waiting: 0 };
    return { code: 'zz99' };
  });
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, REGISTRY_ENV(fetchMock) as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'Hola', booking: false, handoff: false });

  await say(c, inbound({ id: 'wamid.g8', text: 'hola' }));

  expect(runModel).not.toHaveBeenCalled();
  expect(answer).not.toHaveBeenCalled();
  expect(clientTexts()).toContain('fallback');
  const opBodies = (sendText as jest.Mock).mock.calls
    .filter((call) => call[1] === OPERATOR)
    .map((call) => call[2] as string);
  expect(opBodies.some((b) => b.includes('[zz99]'))).toBe(true);
});

test('a long burst reaches the model capped while storage keeps the full text', async () => {
  const { ctx, rows } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'ok', booking: false, handoff: false });
  const long = 'x'.repeat(2500);
  seedMessage(ctx, 'wamid.g9a', 'user', long, AT);

  await say(c, inbound({ id: 'wamid.g9b', text: 'corto' }));

  // The fuzzy deletion check sees the joined burst capped at 2,000.
  const fuzzyCall = (runModel as jest.Mock).mock.calls[0];
  const fuzzyInput = fuzzyCall[2] as Array<{ role: string; content: string }>;
  expect(Math.max(...fuzzyInput.map((m) => m.content.length))).toBeLessThanOrEqual(2000);
  // Every history turn reaching the answer model is capped at 1,000.
  const history = (answer as jest.Mock).mock.calls[0][1] as Array<{ role: string; text: string }>;
  expect(history.length).toBeGreaterThan(0);
  expect(Math.max(...history.map((t) => t.text.length))).toBeLessThanOrEqual(1000);
  // Storage keeps the full text.
  const stored = rows.find((r) => r.id === 'wamid.g9a');
  expect(stored?.text).toHaveLength(2500);
});

test('a taken relay is never limited even when the registry denies everything', async () => {
  const fetchMock = guardFetchMock(() => ({ ok: false, send: false, firstOver: false, waiting: 99 }));
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, REGISTRY_ENV(fetchMock) as never);
  seedTaken(ctx, 'ab12', Date.now());

  await c.receive(inbound({ id: 'wamid.g10', text: 'hola?' }));
  await c.alarm();

  expect(answer).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(
    expect.objectContaining({ OPERATOR_PHONE: env.OPERATOR_PHONE }),
    OPERATOR,
    expect.stringContaining('[ab12]')
  );
});

test('two calendar failures inside 10 minutes send one handoff notice', async () => {
  let handoffs = 0;
  const fetchMock = guardFetchMock((body) => {
    if (body.action === 'register') return { code: 'zz99' };
    if (body.action === 'guard' && body.op === 'handoff') {
      handoffs += 1;
      return handoffs === 1 ? { ok: true } : { ok: false };
    }
    if (body.action === 'guard' && body.op === 'opmsg') return { send: true, firstOver: false, waiting: 0 };
    if (body.action === 'guard' && body.op === 'model') return { ok: true };
    return { ok: true };
  });
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, REGISTRY_ENV(fetchMock) as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'x', booking: true, handoff: true, service: 'first-call' });
  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  (calendarCall as jest.Mock).mockResolvedValue({ ok: false, reason: 'calendar-down' });

  // First booking attempt hits a calendar outage.
  await say(c, inbound({ id: 'wamid.hd1', text: 'quiero agendar una llamada' }));
  await say(c, inbound({ id: 'wamid.hd2', text: 'quiero lograr X, uso Y' }));
  // Second booking attempt hits it again inside the 10-minute window.
  await say(c, inbound({ id: 'wamid.hd3', text: 'quiero agendar otra' }));
  await say(c, inbound({ id: 'wamid.hd4', text: 'quiero lograr Z, uso W' }));

  const opBodies = (sendText as jest.Mock).mock.calls
    .filter((call) => call[1] === OPERATOR)
    .map((call) => call[2] as string);
  // One handoff notice total; every failure still tells its client.
  expect(opBodies.filter((b) => b.includes('agenda falló')).length).toBe(1);
  expect(clientTexts().filter((t) => t.includes('no responde')).length).toBeGreaterThanOrEqual(2);
});

test('two no-slot handoffs inside 10 minutes send one operator notice', async () => {
  let handoffs = 0;
  const fetchMock = guardFetchMock((body) => {
    if (body.action === 'register') return { code: 'zz99' };
    if (body.action === 'guard' && body.op === 'handoff') {
      handoffs += 1;
      return handoffs === 1 ? { ok: true } : { ok: false };
    }
    if (body.action === 'guard' && body.op === 'opmsg') return { send: true, firstOver: false, waiting: 0 };
    if (body.action === 'guard' && body.op === 'model') return { ok: true };
    return { ok: true };
  });
  const bookingRegistryEnv = {
    ...BOOKING_ENV,
    REGISTRY: {
      idFromName: (name: string) => name,
      get: jest.fn(() => ({ fetch: fetchMock })),
    },
  };
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, bookingRegistryEnv as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'x', booking: true, handoff: true, service: 'first-call' });
  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  (calendarCall as jest.Mock).mockResolvedValue({ ok: true, active: null, slots: [] });

  // No free slot both times, so both intakes hand off via finishBooking.
  await say(c, inbound({ id: 'wamid.hf1', text: 'quiero agendar una llamada' }));
  await say(c, inbound({ id: 'wamid.hf2', text: 'quiero lograr X, uso Y' }));
  await say(c, inbound({ id: 'wamid.hf3', text: 'quiero agendar otra' }));
  await say(c, inbound({ id: 'wamid.hf4', text: 'quiero lograr Z, uso W' }));

  const opCalls = (sendText as jest.Mock).mock.calls.filter((call) => call[1] === OPERATOR);
  // FR5: at most one handoff notice per client every 10 minutes, but every
  // handoff still tells its client.
  expect(opCalls).toHaveLength(1);
  expect(clientTexts().filter((t) => t === 'confirm')).toHaveLength(2);
});

test('two booking cancels inside 10 minutes send one operator notice', async () => {
  let handoffs = 0;
  const fetchMock = guardFetchMock((body) => {
    if (body.action === 'register') return { code: 'zz99' };
    if (body.action === 'guard' && body.op === 'handoff') {
      handoffs += 1;
      return handoffs === 1 ? { ok: true } : { ok: false };
    }
    if (body.action === 'guard' && body.op === 'opmsg') return { send: true, firstOver: false, waiting: 0 };
    if (body.action === 'guard' && body.op === 'model') return { ok: true };
    return { ok: true };
  });
  const bookingRegistryEnv = {
    ...BOOKING_ENV,
    REGISTRY: {
      idFromName: (name: string) => name,
      get: jest.fn(() => ({ fetch: fetchMock })),
    },
  };
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, bookingRegistryEnv as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'x', booking: true, handoff: true, service: 'first-call' });
  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev9', start: SLOT_A, end: SLOT_B, kind: 'booked' };
    if (body.action === 'release') return { ok: true, eventId: 'ev9', start: SLOT_A };
    return { ok: false, reason: 'calendar-down' };
  });

  // First book-then-cancel cycle hands off; the rebooked cancel is throttled.
  await say(c, inbound({ id: 'wamid.hc1', text: 'quiero agendar una llamada' }));
  await say(c, inbound({ id: 'wamid.hc2', text: 'quiero lograr X, uso Y' }));
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  await say(c, inbound({ id: 'wamid.hc3', text: 'el primero' }));
  (decide as jest.Mock).mockResolvedValue({ action: 'cancel', slot: -1, date: '' });
  await say(c, inbound({ id: 'wamid.hc4', text: 'mejor cancela' }));
  await say(c, inbound({ id: 'wamid.hc5', text: 'quiero agendar otra vez' }));
  await say(c, inbound({ id: 'wamid.hc6', text: 'quiero lograr Z, uso W' }));
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  await say(c, inbound({ id: 'wamid.hc7', text: 'el primero' }));
  (decide as jest.Mock).mockResolvedValue({ action: 'cancel', slot: -1, date: '' });
  await say(c, inbound({ id: 'wamid.hc8', text: 'mejor cancela de nuevo' }));

  const opCalls = (sendText as jest.Mock).mock.calls.filter((call) => call[1] === OPERATOR);
  // FR5: at most one handoff notice per client every 10 minutes, but every
  // cancel still tells its client.
  expect(opCalls).toHaveLength(1);
  expect(clientTexts().filter((t) => t.includes('cancelé'))).toHaveLength(2);
});

test('past the Worker model limit a held receipt falls back instead of going unread', async () => {
  // The burst-level admission passes, then the limit fills before the
  // vision reading: the inner denial must still fall back, never NON_TEXT.
  let models = 0;
  const fetchMock = guardFetchMock((body) => {
    if (body.action === 'register') return { code: 'zz99' };
    if (body.action === 'guard' && body.op === 'model') {
      models += 1;
      return models === 1 ? { ok: true } : { ok: false };
    }
    if (body.action === 'guard' && body.op === 'handoff') return { ok: true };
    if (body.action === 'guard' && body.op === 'opmsg') return { send: true, firstOver: false, waiting: 0 };
    return { ok: true };
  });
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, REGISTRY_ENV(fetchMock) as never);
  seedState(
    ctx,
    'booking',
    JSON.stringify({
      service: 'consultation',
      lang: 'es',
      offered: [],
      phase: 'held',
      eventId: 'ev1',
      start: SLOT_A,
      createdAt: Date.now(),
      phone: CLIENT,
      name: 'Ana',
      brief: ['goal x'],
    })
  );

  await say(c, imageInbound('wamid.g11'));

  // The denied vision reading never runs and the file is not forwarded
  // unread: FR4 sends every client the fixed fallback sentence and a handoff.
  expect(readProof).not.toHaveBeenCalled();
  expect(forwardUnread).not.toHaveBeenCalled();
  expect(clientTexts()).toContain('fallback');
  expect(clientTexts()).not.toContain(NON_TEXT.es);
});

test('an over-limit voice note uses the conversation language', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  seedMessage(ctx, 'wamid.prior-g12', 'user', 'hola', AT);
  seedState(
    ctx,
    'intake',
    JSON.stringify({ lang: 'en', service: 'other', opening: 'hi', answers: [], asks: 0 })
  );
  seedState(ctx, 'guardVoice', JSON.stringify({ day: '2026-11-09', count: 5 }));

  await c.receive(inbound({ id: 'wamid.g12', type: 'audio', text: undefined, mediaId: 'media-12' }));

  expect(transcribe).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, expect.stringContaining('could not listen'));
});

test('the first message of a conversation hears the fixed opening before the answer', async () => {
  const { ctx, rows } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'respuesta', booking: false, handoff: false });

  await say(c, inbound({ id: 'wamid.o1', text: 'hola, quiero info' }));

  const texts = clientTexts();
  expect(texts[0]).toBe(OPENING.es);
  expect(texts).toContain('respuesta');
  expect(rows).toContainEqual(
    expect.objectContaining({ id: 'a-wamid.o1-opening', role: 'assistant', text: OPENING.es })
  );
});

test('the opening follows the language of the first message', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'answer-text', booking: false, handoff: false });

  await say(c, inbound({ id: 'wamid.o2', text: 'hello, I want to book a session' }));

  const texts = clientTexts();
  expect(texts[0]).toBe(OPENING.en);
  expect(texts).toContain('answer-text');
});

test('the opening is sent only once per conversation', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'respuesta', booking: false, handoff: false });

  await say(c, inbound({ id: 'wamid.o3a', text: 'hola' }));
  await say(c, inbound({ id: 'wamid.o3b', text: 'sigues ahí?' }));

  expect(clientTexts().filter((t) => t === OPENING.es)).toHaveLength(1);
});

test('a number that writes after an erasure hears the opening again', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'respuesta', booking: false, handoff: false });

  await say(c, inbound({ id: 'wamid.o4a', text: 'hola' }));
  await c.receive(inbound({ id: 'wamid.o4b', text: 'BORRAR MIS DATOS' }));
  await say(c, inbound({ id: 'wamid.o4c', text: 'hola de nuevo', timestamp: AT + 60 }));

  expect(clientTexts().filter((t) => t === OPENING.es)).toHaveLength(2);
  expect(clientTexts()).toContain(ERASED.es);
});

test('the exact deletion phrase as first message sends only the erasure notice', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);

  await c.receive(inbound({ id: 'wamid.o5', text: 'BORRAR MIS DATOS' }));

  expect(sendText).toHaveBeenCalledTimes(1);
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, ERASED.es);
  expect(clientTexts()).not.toContain(OPENING.es);
});

test('the operator number never hears the opening', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);

  await c.receive(inbound({ id: 'wamid.o6', from: OPERATOR, text: 'hola' }));

  expect(sendText).not.toHaveBeenCalledWith(env, OPERATOR, OPENING.es);
  expect(sendText).not.toHaveBeenCalledWith(env, OPERATOR, OPENING.en);
});

test('a taken conversation stays silent instead of sending the opening', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  seedTaken(ctx, 'ab12', Date.now());
  (answer as jest.Mock).mockResolvedValue({ reply: 'respuesta', booking: false, handoff: false });

  await c.receive(inbound({ id: 'wamid.o7', text: 'hola?', name: 'Ana' }));

  expect(answer).not.toHaveBeenCalled();
  expect(clientTexts()).not.toContain(OPENING.es);
  expect(clientTexts()).not.toContain(OPENING.en);
});
