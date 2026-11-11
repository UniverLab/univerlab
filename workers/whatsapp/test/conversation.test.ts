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
}));

import { answer } from '../src/brain';
import { intake } from '../src/intake';
import { markRead, sendText } from '../src/meta';
import { ERASED, operatorErased, retentionDeadline } from '../src/erase';
import { Conversation } from '../src/conversation';

const env = {
  OPERATOR_PHONE: '+57 300 999 8888',
  AI: {},
  WA_ACCESS_TOKEN: 'token',
  WA_PHONE_NUMBER_ID: 'phone-id',
};

const CLIENT = '573001112222';
const OPERATOR = '573009998888';
const AT = 1767225600;

function makeCtx(handoff = false) {
  const state = new Map<string, string>();
  if (handoff) state.set('handoff', '1');
  const inserts: unknown[] = [];
  const sql = {
    exec: jest.fn((query: string, ...params: unknown[]) => {
      if (query.startsWith('INSERT INTO messages')) inserts.push(params[0]);
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

beforeEach(() => {
  jest.clearAllMocks();
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

  await c.receive(inbound({ id: 'wamid.7', text: 'quiero hablar con una persona' }));
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

  await c.receive(inbound({ id: 'wamid.4' }));

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
  await c.receive(inbound({ id: 'wamid.6', text: 'hola de nuevo', timestamp: AT + 60 }));

  expect(answer).toHaveBeenCalled();
  expect(storage.setAlarm).toHaveBeenCalledWith(retentionDeadline((AT + 60) * 1000));
  expect((sendText as jest.Mock).mock.calls.map((call) => call[2])).toContain(ERASED.es);
});
