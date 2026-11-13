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

jest.mock('../src/meta', () => {
  const actual = jest.requireActual('../src/meta') as Record<string, unknown>;
  return {
    ...actual,
    sendText: jest.fn(async () => true),
    sendMedia: jest.fn(async () => true),
    markRead: jest.fn(async () => true),
  };
});

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

jest.mock('../src/reasons', () => {
  const actual = jest.requireActual('../src/reasons') as Record<string, unknown>;
  return { ...actual, classify: jest.fn() };
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
import { classify } from '../src/reasons';
import { Conversation, NON_TEXT } from '../src/conversation';
import { es } from '../../../src/i18n/es';

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
      if (query.startsWith('SELECT MAX(at) AS lastAt FROM messages WHERE role = ?')) {
        const userRows = rows.filter((r) => r.role === params[0]);
        const lastAt = userRows.length > 0 ? Math.max(...userRows.map((r) => r.at)) : null;
        return { toArray: () => [{ lastAt }] };
      }
      if (query.startsWith("SELECT text FROM messages WHERE role = 'user' AND text IS NOT NULL")) {
        const userRows = rows.filter((r) => r.role === 'user' && r.text !== null);
        const last = userRows.length > 0 ? userRows[userRows.length - 1].text : null;
        return { toArray: () => (last === null ? [] : [{ text: last }]) };
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
  // The router is pinned to the question path: these tests cover what
  // happens after routing, while reasons.test.ts covers routing itself.
  (classify as jest.Mock).mockResolvedValue('question');
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
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining(operatorErased(CLIENT)));
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

  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining(operatorErased(CLIENT)));
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

// No REGISTRY binds in these tests, so postNote delivers straight to the
// operator phone through sendText, in the same shape as the registry path.
function operatorTexts(): string[] {
  return (sendText as jest.Mock).mock.calls
    .filter((call) => call[1] === OPERATOR)
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
  expect(operatorTexts().some((t) => t.includes('Apartado creado'))).toBe(true);
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
  expect(operatorTexts().some((t) => t.includes('Primera llamada agendada'))).toBe(true);
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
  expect(operatorTexts().some((t) => t.includes('Apartado vencido'))).toBe(true);
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
  const cancelNotes = operatorTexts();
  expect(cancelNotes.some((t) => t.includes('Cita cancelada'))).toBe(true);
  expect(cancelNotes.some((t) => t.includes('estaba pagada'))).toBe(false);
});

test('cancelling a paid consultation tells the operator it was paid, high priority', async () => {
  const { c } = await offerSlots('consultation');
  (decide as jest.Mock).mockResolvedValue({ action: 'pick', slot: 1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [SLOT_A, SLOT_B] };
    if (body.action === 'reserve') return { ok: true, eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold' };
    if (body.action === 'confirm') return { ok: true, eventId: 'ev1' };
    if (body.action === 'release') return { ok: true, eventId: 'ev1', start: SLOT_A };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.b3', text: 'el primero' }));
  expect(await c.control({ action: 'operatorConfirm' })).toEqual({ ok: true });

  // The slot is more than 24 hours out, so the paid booking releases with a
  // paid-cancellation note instead of the move-once reoffer.
  (decide as jest.Mock).mockResolvedValue({ action: 'cancel', slot: -1, date: '' });
  await say(c, inbound({ id: 'wamid.b4', text: 'mejor cancela' }));

  expect(calendarCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'release' }));
  const paid = operatorTexts().filter((t) => t.includes('estaba pagada'));
  expect(paid.length).toBeGreaterThan(0);
  expect(paid.some((t) => t.includes('Cita cancelada'))).toBe(true);
  expect(paid.some((t) => t.includes('· alta'))).toBe(true);
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
  expect(operatorTexts().some((t) => t.includes('Cita movida'))).toBe(true);
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

function seedTaken(ctx: unknown, name: string, at: number): void {
  const storage = (ctx as { storage: { sql: { exec: (...args: unknown[]) => unknown } } }).storage;
  storage.sql.exec(
    'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    'taken',
    JSON.stringify({ name, at })
  );
}

/** The note posts a REGISTRY-bound conversation made, oldest first. */
async function notePosts(fetchMock: jest.Mock): Promise<Array<Record<string, unknown>>> {
  return Promise.all(
    fetchMock.mock.calls.map(async (call) => (await (call[0] as Request).json()) as Record<string, unknown>)
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
  // The relay carries the conversation name and the text, nothing else.
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, '[ab12] hola?');
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

test('an idle passthrough clears the flag and tells the Operator, which notifies', async () => {
  const fetchMock = jest.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, REGISTRY_ENV(fetchMock) as never);
  seedTaken(ctx, 'ab12', Date.now() - 16 * 60 * 1000);

  await c.alarm();

  // The conversation clears its flag and the Operator owns the notice.
  expect(await notePosts(fetchMock)).toContainEqual({ action: 'passExpired', name: 'ab12' });
  expect(sendText).not.toHaveBeenCalledWith(expect.anything(), OPERATOR, expect.anything());
  (answer as jest.Mock).mockResolvedValue({ reply: 'Hola de nuevo', booking: false, handoff: false });
  await say(c, inbound({ id: 'wamid.t2', text: 'sigues ahí?' }));
  expect(answer).toHaveBeenCalled();
});

test('the recap data reads the last client turn and its time in milliseconds', async () => {
  const { ctx } = makeCtx();
  seedMessage(ctx, 'wamid.r1', 'user', 'quiero una cita', AT);
  seedMessage(ctx, 'wamid.r2', 'assistant', 'claro', AT + 30);
  seedMessage(ctx, 'wamid.r3', 'user', 'el lunes', AT + 60);
  const c = new Conversation(ctx as never, env as never);
  const call = (action: string) =>
    c
      .fetch(
        new Request('https://conversation/control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        })
      )
      .then((r) => r.json());

  // messages.at holds WhatsApp epoch seconds; /recap compares it with
  // Date.now(), so the summary hands back milliseconds.
  expect(await call('summary')).toMatchObject({ lastAt: (AT + 60) * 1000, phase: null });

  const data = (await call('recapData')) as { turns: Array<{ role: string; text: string }>; last: string };
  expect(data.last).toBe('el lunes');
  expect(data.turns).toContainEqual({ role: 'user', text: 'quiero una cita' });
  expect(data.turns).toContainEqual({ role: 'assistant', text: 'claro' });
});

test('a handoff registers the client and posts a named note', async () => {
  const fetchMock = jest.fn(async () => new Response(JSON.stringify({ name: 'ana' }), { status: 200 }));
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, REGISTRY_ENV(fetchMock) as never);
  (answer as jest.Mock).mockResolvedValue({
    reply: 'Te paso con una persona',
    booking: false,
    handoff: true,
  });

  await say(c, inbound({ id: 'wamid.n1', text: 'quiero hablar con una persona' }));

  // Model admission, register and the handoff throttle all reach the single
  // Operator owner, and the note travels as a post, never as a sendText.
  expect(fetchMock).toHaveBeenCalledTimes(4);
  const payloads = await notePosts(fetchMock);
  expect(payloads).toContainEqual(
    expect.objectContaining({ action: 'register', phone: CLIENT, kind: 'handoff' })
  );
  const note = payloads.find((p) => p.action === 'note') as { name?: string; text?: string; tag?: string };
  expect(note).toMatchObject({ name: 'ana', tag: 'MENSAJE' });
  expect(note.text).toContain('quiero hablar con una persona');
  expect(
    (sendText as jest.Mock).mock.calls.filter((call) => call[1] === OPERATOR)
  ).toHaveLength(0);
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
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, '[ab12] hola?');
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
  await c.control({ action: 'take', name: 'ab12' });

  await c.alarm();

  expect(answer).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(burstEnv, OPERATOR, '[ab12] hola?');
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
      name: unknown
    ) => ({
      operatorText: 'comprobante de Ana: 150000 COP. Confirma con: /confirm ' + name,
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
  // The proof summary travels under the registered conversation name.
  expect(proofCall[5]).toBe('cliente');
  const opBodies = (sendText as jest.Mock).mock.calls
    .filter((call) => call[1] === OPERATOR)
    .map((call) => call[2] as string);
  expect(opBodies.some((b) => b.includes('[cliente] PAGO · normal') && b.includes('comprobante'))).toBe(true);
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
  jest.fn(async (req: Request) => new Response(JSON.stringify(handler((await req.clone().json()) as Record<string, unknown>)), {
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
    operatorText: 'comprobante sin leer',
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
  const notes = (await notePosts(fetchMock)).filter((p) => p.action === 'note');
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ name: 'cliente', tag: 'MENSAJE' });
  expect(notes[0].text as string).toContain('hola');
  // No command or operator note ever reaches the client.
  for (const t of clientTexts()) {
    expect(t.startsWith('/')).toBe(false);
  }
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
    if (body.action === 'register') return { name: 'ana' };
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

  const notes = (await notePosts(fetchMock)).filter((p) => p.action === 'note');
  // One handoff notice total; every failure still tells its client.
  expect(notes.filter((n) => String(n.text).includes('agenda falló'))).toHaveLength(1);
  expect(clientTexts().filter((t) => t.includes('no responde')).length).toBeGreaterThanOrEqual(2);
});

test('two no-slot handoffs inside 10 minutes send one operator notice', async () => {
  let handoffs = 0;
  const fetchMock = guardFetchMock((body) => {
    if (body.action === 'register') return { name: 'ana' };
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

  const notes = (await notePosts(fetchMock)).filter((p) => p.action === 'note');
  // FR5: at most one handoff notice per client every 10 minutes, but every
  // handoff still tells its client.
  expect(notes).toHaveLength(1);
  expect(clientTexts().filter((t) => t === 'confirm')).toHaveLength(2);
});

test('two booking cancels inside 10 minutes each send an operator note', async () => {
  let handoffs = 0;
  const fetchMock = guardFetchMock((body) => {
    if (body.action === 'register') return { name: 'ana' };
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

  const notes = (await notePosts(fetchMock)).filter((p) => p.action === 'note');
  // Every booking event reaches the operator on its own note, even inside
  // the 10-minute handoff window; every cancel still tells its client.
  expect(notes.filter((n) => String(n.text).includes('Cita cancelada'))).toHaveLength(2);
  expect(notes).toHaveLength(4);
  expect(clientTexts().filter((t) => t.includes('cancelé'))).toHaveLength(2);
});

test('past the Worker model limit a held receipt falls back instead of going unread', async () => {
  // The burst-level admission passes, then the limit fills before the
  // vision reading: the inner denial must still fall back, never NON_TEXT.
  let models = 0;
  const fetchMock = guardFetchMock((body) => {
    if (body.action === 'register') return { name: 'ana' };
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

// A new topic classified into a capture reason asks the fixed first question:
// no model reply, no calendar call, no operator note yet.
test.each([
  ['support'],
  ['audit-fixes'],
  ['publish'],
  ['refund'],
  ['invoice'],
  ['data-rights'],
  ['human'],
  ['collab'],
] as Array<[string]>)('a new topic classified as %s asks its fixed first question', async (reason) => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue(reason);
  const ask = (es as unknown as { wa: { ask: Record<string, string[]> } }).wa.ask;

  await say(c, inbound({ id: 'wamid.r1-' + reason, text: 'hola, necesito ayuda' }));

  expect(clientTexts()).toEqual([OPENING.es, ask[reason][0]]);
  expect(classify).toHaveBeenCalledTimes(1);
  expect(answer).not.toHaveBeenCalled();
  expect(calendarCall).not.toHaveBeenCalled();
  expect(operatorBodies()).toHaveLength(0);
});

test('a complaint that already says what happened skips the question', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('complaint');
  const wa = (es as unknown as { wa: { fixed: Record<string, string>; closing: Record<string, string> } }).wa;

  await say(c, inbound({ id: 'wamid.r2', text: 'me cobraron dos veces y nadie responde' }));

  expect(clientTexts()).toEqual([OPENING.es, wa.fixed.complaintAck, wa.closing.complaint]);
  const ops = operatorBodies();
  expect(ops).toHaveLength(1);
  expect(ops[0]).toContain('RECLAMO');
  expect(ops[0]).toContain('prioridad alta');
  expect(ops[0]).toContain('me cobraron dos veces');
});

test('a short complaint is asked once, in the same message as the ack', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('complaint');
  const wa = (es as unknown as { wa: { ask: Record<string, string[]>; fixed: Record<string, string> } }).wa;

  await say(c, inbound({ id: 'wamid.r3', text: 'todo mal' }));

  expect(clientTexts()).toEqual([OPENING.es, wa.fixed.complaintAck + '\n' + wa.ask.complaint[0]]);
});

test('a support capture asks twice, then hands off with tag, priority and answers', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('support');
  const wa = (es as unknown as { wa: { ask: Record<string, string[]>; closing: Record<string, string> } }).wa;

  await say(c, inbound({ id: 'wamid.r4a', text: 'se cayó el flujo' }));
  await say(c, inbound({ id: 'wamid.r4b', text: 'el proyecto atlas no carga' }));
  await say(c, inbound({ id: 'wamid.r4c', text: 'desde ayer y sí me frena' }));

  expect(clientTexts()).toEqual([OPENING.es, wa.ask.support[0], wa.ask.support[1], wa.closing.support]);
  // The capture owns the follow-ups: nothing is classified twice.
  expect(classify).toHaveBeenCalledTimes(1);
  const ops = operatorBodies();
  expect(ops).toHaveLength(1);
  expect(ops[0]).toContain('SOPORTE');
  expect(ops[0]).toContain('prioridad alta');
  expect(ops[0]).toContain('se cayó el flujo');
  expect(ops[0]).toContain('el proyecto atlas no carga');
  expect(ops[0]).toContain('desde ayer y sí me frena');
  expect(calendarCall).not.toHaveBeenCalled();
});

test('a human capture asks once, then hands off', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('human');
  const wa = (es as unknown as { wa: { ask: Record<string, string[]>; closing: Record<string, string> } }).wa;

  await say(c, inbound({ id: 'wamid.r5a', text: 'necesito hablar con alguien' }));
  await say(c, inbound({ id: 'wamid.r5b', text: 'es sobre una alianza' }));

  expect(clientTexts()).toEqual([OPENING.es, wa.ask.human[0], wa.closing.human]);
  const ops = operatorBodies();
  expect(ops).toHaveLength(1);
  expect(ops[0]).toContain('PERSONA');
  expect(ops[0]).toContain('es sobre una alianza');
});

test('declining to answer still hands off with what was gathered', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('support');
  const wa = (es as unknown as { wa: { ask: Record<string, string[]>; closing: Record<string, string> } }).wa;

  await say(c, inbound({ id: 'wamid.r6a', text: 'se cayó el flujo' }));
  await say(c, inbound({ id: 'wamid.r6b', text: 'no gracias' }));

  expect(clientTexts()).toEqual([OPENING.es, wa.ask.support[0], wa.closing.support]);
  const ops = operatorBodies();
  expect(ops).toHaveLength(1);
  expect(ops[0]).toContain('SOPORTE');
  expect(ops[0]).toContain('se cayó el flujo');
});

test('a long sentence starting with no stays an answer inside the capture', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('support');
  const wa = (es as unknown as { wa: { ask: Record<string, string[]> } }).wa;

  await say(c, inbound({ id: 'wamid.r7a', text: 'se cayó el flujo' }));
  await say(c, inbound({ id: 'wamid.r7b', text: 'no puedo entrar al panel desde ayer' }));

  // Not a decline: the second fixed question is asked, the content is kept.
  expect(clientTexts()).toEqual([OPENING.es, wa.ask.support[0], wa.ask.support[1]]);
});

test.each([['first-call'], ['consultation']] as Array<[string]>)(
  'a new topic classified as %s starts the booking intake without booking',
  async (reason) => {
    const { ctx } = makeCtx();
    const c = new Conversation(ctx as never, env as never);
    (classify as jest.Mock).mockResolvedValue(reason);

    await say(c, inbound({ id: 'wamid.r8-' + reason, text: 'quiero agendar' }));

    expect(clientTexts()).toEqual([OPENING.es, 'ask']);
    expect(calendarCall).not.toHaveBeenCalled();
    expect(operatorBodies()).toHaveLength(0);
  }
);

test('a flow intake that completes tags the operator note FLUJO', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('flow');

  await say(c, inbound({ id: 'wamid.r9a', text: 'quiero un flujo' }));
  expect(clientTexts()).toEqual([OPENING.es, 'ask']);

  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  await say(c, inbound({ id: 'wamid.r9b', text: 'automatizar reportes' }));

  expect(clientTexts()).toContain('confirm');
  const ops = operatorBodies();
  expect(ops).toHaveLength(1);
  expect(ops[0]).toContain('FLUJO');
});

test('a tag from an aborted flow intake does not leak into the next booking note', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValueOnce('flow').mockResolvedValue('first-call');

  await say(c, inbound({ id: 'wamid.r10a', text: 'quiero una auditoría' }));
  (intake as jest.Mock).mockResolvedValueOnce({ status: 'handoff', reply: '' });
  await say(c, inbound({ id: 'wamid.r10b', text: 'mejor hablemos' }));

  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') return { ok: true, active: null, slots: [] };
    return { ok: false, reason: 'calendar-down' };
  });
  await say(c, inbound({ id: 'wamid.r10c', text: 'quiero agendar la primera' }));
  (intake as jest.Mock).mockResolvedValue({ status: 'ready', reply: '' });
  await say(c, inbound({ id: 'wamid.r10d', text: 'para la próxima semana' }));

  const ops = operatorBodies();
  expect(ops.length).toBeGreaterThan(0);
  expect(ops.some((b) => b.includes('FLUJO'))).toBe(false);
  expect(ops.some((b) => b.includes('AUDITOR'))).toBe(false);
});

test.each([
  ['payment', 'Puedes pagar por Bre-B'],
  ['vendor', 'no recibimos propuestas de venta'],
  ['off-topic', 'Solo puedo ayudarte con UniverLab'],
] as Array<[string, string]>)('a new topic classified as %s gets its fixed sentence with no handoff', async (reason, snippet) => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue(reason);

  await say(c, inbound({ id: 'wamid.r11-' + reason, text: 'hola' }));

  expect(clientTexts()).toEqual([OPENING.es, expect.stringContaining(snippet)]);
  expect(answer).not.toHaveBeenCalled();
  expect(calendarCall).not.toHaveBeenCalled();
  expect(operatorBodies()).toHaveLength(0);
});

test('a my-booking topic with an active hold shows it and offers move or cancel', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('my-booking');
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'status') {
      return {
        ok: true,
        active: { eventId: 'ev1', start: SLOT_A, end: SLOT_B, kind: 'hold', service: 'first-call', createdAt: Date.now() },
        slots: [],
      };
    }
    return { ok: false, reason: 'calendar-down' };
  });

  await say(c, inbound({ id: 'wamid.r12', text: 'cuándo es mi cita' }));

  expect(clientTexts()).toEqual([OPENING.es, expect.stringContaining('Ya tienes un espacio reservado')]);
  expect(clientTexts()[1]).toContain('moverlo o cancelarlo');
  expect(operatorBodies()).toHaveLength(0);
});

test('a my-booking topic with nothing booked says so and offers to book', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('my-booking');

  await say(c, inbound({ id: 'wamid.r13', text: 'cuándo es mi cita' }));

  expect(clientTexts()).toEqual([OPENING.es, expect.stringContaining('No veo ninguna reserva')]);
  expect(operatorBodies()).toHaveLength(0);
});

test('an open-source answer never hands off, even when the reply check fails', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('open-source');
  const wa = (es as unknown as { wa: { fixed: Record<string, string> } }).wa;

  (answer as jest.Mock).mockResolvedValue({ reply: 'mira https://evil.example/x', booking: false, handoff: true });
  await say(c, inbound({ id: 'wamid.r14', text: 'cómo instalo canopy' }));

  expect(clientTexts()).toEqual([OPENING.es, wa.fixed.openSourceFallback]);
  expect(operatorBodies()).toHaveLength(0);
});

test('the exact deletion phrase wins over an open capture', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (classify as jest.Mock).mockResolvedValue('support');

  await say(c, inbound({ id: 'wamid.r15a', text: 'se cayó el flujo' }));
  await c.receive(inbound({ id: 'wamid.r15b', text: 'BORRAR MIS DATOS' }));

  expect(clientTexts()).toContain(ERASED.es);
  expect(operatorBodies().some((b) => b.includes('SOPORTE'))).toBe(false);

  (classify as jest.Mock).mockResolvedValue('human');
  const ask = (es as unknown as { wa: { ask: Record<string, string[]> } }).wa.ask;
  await say(c, inbound({ id: 'wamid.r15c', text: 'hola de nuevo' }));
  expect(clientTexts()).toContain(ask.human[0]);
});

function operatorBodies(): string[] {
  return (sendText as jest.Mock).mock.calls
    .filter((call) => call[1] === OPERATOR)
    .map((call) => call[2] as string);
}
