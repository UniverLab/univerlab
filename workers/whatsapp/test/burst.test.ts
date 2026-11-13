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
  return { ...actual, readProof: jest.fn() };
});

jest.mock('../src/schedule', () => {
  const actual = jest.requireActual('../src/schedule') as Record<string, unknown>;
  return {
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
    // The quiet-hours module needs the real pure time functions.
    bogotaParts: actual.bogotaParts,
    bogotaToUtcMs: actual.bogotaToUtcMs,
    colombiaHolidays: actual.colombiaHolidays,
  };
});

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

jest.mock('../src/reservations', () => {
  const actual = jest.requireActual('../src/reservations') as Record<string, unknown>;
  return { ...actual, calendarCall: jest.fn() };
});

jest.mock('../src/reasons', () => {
  const actual = jest.requireActual('../src/reasons') as Record<string, unknown>;
  return { ...actual, classify: jest.fn() };
});

import { answer, runModel } from '../src/brain';
import { transcribe } from '../src/audio';
import { markRead, sendText } from '../src/meta';
import { ERASED, retentionDeadline } from '../src/erase';
import { burstConfig } from '../src/env';
import { burstDue, joinBurst, nextAlarm } from '../src/burst';
import { decide } from '../src/booking';
import { readProof } from '../src/proof';
import { calendarCall } from '../src/reservations';
import { classify } from '../src/reasons';
import { Conversation } from '../src/conversation';
import { OPENING } from '../src/opening';

const env = {
  OPERATOR_PHONE: '+57 300 999 8888',
  AI: {},
  WA_ACCESS_TOKEN: 'token',
  WA_PHONE_NUMBER_ID: 'phone-id',
};

const BOOKING_ENV = {
  ...env,
  GOOGLE_CLIENT_ID: 'cid',
  GOOGLE_CLIENT_SECRET: 'csec',
  GOOGLE_REFRESH_TOKEN: 'rtok',
  WORKBENCH_CALENDAR_ID: 'workbench-id',
};

const CLIENT = '573001112222';
const AT = 1767225600;
// Pin the clock near the fixture timestamp so the stored six-month
// retention still lies in the future while the burst is handled.
const T0 = AT * 1000 + 3600 * 1000;

let nowMs = T0;

function makeCtx() {
  const state = new Map<string, string>();
  const rows: Array<{ id: string; at: number; role: string; type: string; text: string | null; mediaId: string | null; mime: string | null }> = [];
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
      if (query.startsWith('INSERT INTO state')) {
        state.set(String(params[0]), String(params[1]));
        return { toArray: () => [] };
      }
      if (query.startsWith('DELETE FROM state')) {
        state.delete(String(params[0]));
        return { toArray: () => [] };
      }
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
  return { ctx, storage, rows };
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


function clientTexts(): string[] {
  return (sendText as jest.Mock).mock.calls
    .filter((call) => call[1] === CLIENT)
    .map((call) => call[2] as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  nowMs = T0;
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  (runModel as jest.Mock).mockResolvedValue('{"delete": false}');
  // The router is pinned to the question path: these tests cover burst
  // batching, while reasons.test.ts covers routing itself.
  (classify as jest.Mock).mockResolvedValue('question');
  (decide as jest.Mock).mockResolvedValue({ action: 'other', slot: -1, date: '' });
  (calendarCall as jest.Mock).mockImplementation(async () => ({ ok: false, reason: 'calendar-down' }));
  // A voice note hands off unless the test transcribes it.
  (transcribe as jest.Mock).mockResolvedValue({ ok: false });
  // A receipt falls back to today's handoff unless the test reads it.
  (readProof as jest.Mock).mockResolvedValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('a burst of four messages produces one model call and one reply', async () => {
  const { ctx, storage, rows } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'todo junto', booking: false, handoff: false });
  const texts = ['hola', 'una pregunta', 'cuanto cuesta la consulta?', 'y aceptan paypal?'];

  for (let i = 0; i < texts.length; i++) {
    await c.receive(inbound({ id: `wamid.b${i}`, text: texts[i], timestamp: AT + i }));
  }

  // Stored and read at once, not answered yet.
  expect(rows.filter((r) => r.role === 'user')).toHaveLength(4);
  expect(markRead).toHaveBeenCalledTimes(4);
  expect(answer).not.toHaveBeenCalled();
  expect(clientTexts()).toEqual([OPENING.es]);

  nowMs += 7000;
  await c.alarm();

  expect(answer).toHaveBeenCalledTimes(1);
  expect(runModel).toHaveBeenCalledTimes(1);
  expect(clientTexts()).toEqual([OPENING.es, 'todo junto']);
  expect(storage.setAlarm).toHaveBeenCalledWith(retentionDeadline((AT + 3) * 1000));
  // The history keeps each message separately, in order, as one client turn.
  const history = (answer as jest.Mock).mock.calls[0][1] as Array<{ role: string; text: string }>;
  expect(history.filter((t) => t.role === 'user').map((t) => t.text)).toEqual(texts);
});

test('a single message is answered after the quiet window, not before', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'hola', booking: false, handoff: false });

  await c.receive(inbound({ id: 'wamid.s1', text: 'hola' }));

  nowMs += 1000;
  await c.alarm();
  expect(answer).not.toHaveBeenCalled();
  expect(clientTexts()).toEqual([OPENING.es]);

  nowMs += 6000;
  await c.alarm();
  expect(answer).toHaveBeenCalledTimes(1);
  expect(clientTexts()).toEqual([OPENING.es, 'hola']);
});

test('a client who keeps typing is answered at the 25-second cap', async () => {
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'ya voy', booking: false, handoff: false });
  const texts = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis'];

  for (let i = 0; i < texts.length; i++) {
    nowMs = T0 + i * 6000;
    await c.receive(inbound({ id: `wamid.c${i}`, text: texts[i], timestamp: AT + i }));
    await c.alarm();
    if (i < texts.length - 1) {
      expect(answer).not.toHaveBeenCalled();
    }
  }

  expect(answer).toHaveBeenCalledTimes(1);
  expect(clientTexts()).toEqual([OPENING.es, 'ya voy']);
  const history = (answer as jest.Mock).mock.calls[0][1] as Array<{ role: string; text: string }>;
  expect(history.filter((t) => t.role === 'user').map((t) => t.text)).toEqual(texts);
});

test('a voice note that fails transcription hands off at receive, outside the burst', async () => {
  const OPERATOR = '573009998888';
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (transcribe as jest.Mock).mockResolvedValue({ ok: false });
  (answer as jest.Mock).mockResolvedValue({ reply: 'claro que sí', booking: false, handoff: false });

  await c.receive(inbound({ id: 'wamid.m1', text: 'hola, una pregunta', timestamp: AT }));
  await c.receive(
    inbound({ id: 'wamid.m2', type: 'audio', text: undefined, timestamp: AT + 1, mediaId: 'media-1' })
  );

  // The failed note hands off at once; the text still waits for its burst.
  expect(answer).not.toHaveBeenCalled();
  expect(clientTexts()).toEqual([
    OPENING.es,
    'No pude escuchar tu nota de voz. Una persona del laboratorio la escuchará y te responde pronto.',
  ]);
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('[audio]'));

  nowMs += 7000;
  await c.alarm();

  // One model call for the text burst, no second handoff for the audio.
  expect(answer).toHaveBeenCalledTimes(1);
  expect(clientTexts()).toContain('claro que sí');
  expect(clientTexts()).toHaveLength(3);
});

test('a burst mixing text and audio answers the text and hands the media off once', async () => {
  const OPERATOR = '573009998888';
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'claro que sí', booking: false, handoff: false });

  await c.receive(inbound({ id: 'wamid.m1', text: 'hola, una pregunta', timestamp: AT }));
  await c.receive(
    inbound({ id: 'wamid.m2', type: 'image', text: undefined, timestamp: AT + 1, mediaId: 'media-1' })
  );

  expect(answer).not.toHaveBeenCalled();
  expect(clientTexts()).toEqual([OPENING.es]);

  nowMs += 7000;
  await c.alarm();

  // One model call for the whole burst, the text reply plus today's media
  // handoff, and one operator note about the image.
  expect(answer).toHaveBeenCalledTimes(1);
  expect(clientTexts()).toHaveLength(3);
  expect(clientTexts()).toContain('claro que sí');
  expect(clientTexts()).toContain('Por ahora solo leo mensajes de texto. Le paso esto a una persona del laboratorio.');
  expect(sendText).toHaveBeenCalledWith(env, OPERATOR, expect.stringContaining('[image]'));
});

test('a transcribed voice note joins the burst as one answer with no handoff', async () => {
  const OPERATOR = '573009998888';
  const { ctx } = makeCtx();
  const c = new Conversation(ctx as never, env as never);
  (transcribe as jest.Mock).mockResolvedValue({ ok: true, text: 'qué precio tiene' });
  (answer as jest.Mock).mockResolvedValue({ reply: 'cuesta tanto', booking: false, handoff: false });

  await c.receive(inbound({ id: 'wamid.m1', text: 'hola, una pregunta', timestamp: AT }));
  await c.receive(
    inbound({ id: 'wamid.m2', type: 'audio', text: undefined, timestamp: AT + 1, mediaId: 'media-1' })
  );

  expect(answer).not.toHaveBeenCalled();
  expect(clientTexts()).toEqual([OPENING.es]);

  nowMs += 7000;
  await c.alarm();

  // One model call for the whole burst, one reply, no handoff anywhere.
  expect(answer).toHaveBeenCalledTimes(1);
  const history = (answer as jest.Mock).mock.calls[0][1] as Array<{ role: string; text: string }>;
  expect(history.filter((t) => t.role === 'user').map((t) => t.text)).toEqual([
    'hola, una pregunta',
    'qué precio tiene',
  ]);
  expect(clientTexts()).toEqual([OPENING.es, 'cuesta tanto']);
  expect(sendText).not.toHaveBeenCalledWith(env, OPERATOR, expect.anything());
});

test('the exact deletion phrase mid-burst discards the burst with no answer', async () => {
  const { ctx, storage } = makeCtx();
  const c = new Conversation(ctx as never, env as never);

  await c.receive(inbound({ id: 'wamid.d1', text: 'hola' }));
  await c.receive(inbound({ id: 'wamid.d2', text: 'una pregunta' }));
  await c.receive(inbound({ id: 'wamid.d3', text: 'BORRAR MIS DATOS' }));

  expect(storage.deleteAll).toHaveBeenCalledTimes(1);
  expect(answer).not.toHaveBeenCalled();
  expect(runModel).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledTimes(2);
  expect(sendText).toHaveBeenCalledWith(env, CLIENT, ERASED.es);
  expect(clientTexts()[0]).toBe(OPENING.es);

  nowMs += 30000;
  await c.alarm();
  expect(answer).not.toHaveBeenCalled();
});

test('a hold deadline still fires while a burst is open, then the burst is answered', async () => {
  const { ctx, storage } = makeCtx();
  const c = new Conversation(ctx as never, BOOKING_ENV as never);
  (answer as jest.Mock).mockResolvedValue({ reply: 'hola', booking: false, handoff: false });
  (ctx.storage.sql as jest.Mock).exec(
    'INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    'booking',
    JSON.stringify({
      phase: 'held',
      eventId: 'ev1',
      createdAt: nowMs - 25 * 3600 * 1000,
      lang: 'es',
      phone: CLIENT,
      service: 'consultation',
      offered: [],
      brief: ['meta x'],
      start: '2026-11-18T20:00:00.000Z',
    })
  );
  (calendarCall as jest.Mock).mockImplementation(async (_env: unknown, body: { action: string }) => {
    if (body.action === 'expire') return { ok: true, expired: true, eventId: 'ev1' };
    return { ok: false, reason: 'calendar-down' };
  });

  await c.receive(inbound({ id: 'wamid.h1', text: 'hola' }));

  nowMs += 1000;
  await c.alarm();

  // The expired hold fires even though the burst is still open.
  expect(calendarCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'expire' }));
  expect(clientTexts().some((t) => t.includes('venció'))).toBe(true);
  expect(answer).not.toHaveBeenCalled();

  // The burst survives the hold alarm and is answered after the quiet window.
  nowMs += 7000;
  await c.alarm();
  expect(answer).toHaveBeenCalledTimes(1);
  expect(clientTexts()).toContain('hola');
  expect(storage.setAlarm).toHaveBeenCalledWith(retentionDeadline(AT * 1000));
});

describe('burst helpers', () => {
  test('burstConfig falls back to 7s quiet and 25s max', () => {
    expect(burstConfig({})).toEqual({ quietMs: 7000, maxMs: 25000 });
    expect(burstConfig({ BURST_QUIET_MS: 'nope', BURST_MAX_MS: '' })).toEqual({
      quietMs: 7000,
      maxMs: 25000,
    });
    expect(burstConfig({ BURST_QUIET_MS: '3000', BURST_MAX_MS: '10000' })).toEqual({
      quietMs: 3000,
      maxMs: 10000,
    });
  });

  test('joinBurst orders by arrival and joins with newlines', () => {
    expect(
      joinBurst([
        { at: 3, text: 'c' },
        { at: 1, text: 'a' },
        { at: 2, text: 'b' },
      ])
    ).toBe('a\nb\nc');
  });

  test('nextAlarm takes the earliest pending deadline', () => {
    expect(nextAlarm(100, 200, 300)).toBe(100);
    expect(nextAlarm(500, 200)).toBe(200);
    expect(nextAlarm(0, 200)).toBe(200);
  });

  test('burstDue closes on quiet or on the cap', () => {
    const burst = { firstAt: T0, quietDue: T0 + 7000, maxDue: T0 + 25000, ids: [], from: CLIENT };
    expect(burstDue(null, T0)).toBe(false);
    expect(burstDue(burst, T0 + 1000)).toBe(false);
    expect(burstDue(burst, T0 + 7000)).toBe(true);
    expect(burstDue({ ...burst, quietDue: T0 + 60000 }, T0 + 25000)).toBe(true);
  });
});
