/** @jest-environment node */
import type { Inbound } from '../src/meta';
import { HELP, parseCommand, registryCall, shortCode } from '../src/registry';

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

jest.mock('../src/schedule', () => {
  const actual = jest.requireActual('../src/schedule') as Record<string, unknown>;
  return { ...actual, formatSlot: jest.fn((iso: string) => iso) };
});

jest.mock('../src/google', () => ({
  accessToken: jest.fn(),
  deleteEvent: jest.fn(),
  getEvent: jest.fn(),
  patchEvent: jest.fn(),
}));

import { sendText, markRead } from '../src/meta';
import { Operator } from '../src/operator';

const OPERATOR_NUMBER = '+57 300 999 8888';
const OPERATOR = '573009998888';
const CLIENT = '573001112222';

interface Row {
  code: string;
  phone: string;
  name: string;
  lang: string;
  kind: string;
  service: string;
  start: string | null;
  event_id: string | null;
  created_at: number;
}

function makeCtx() {
  const state = new Map<string, string>();
  const rows: Row[] = [];
  const sql = {
    exec: jest.fn((query: string, ...params: unknown[]) => {
      if (query.startsWith('SELECT') && query.includes('WHERE code = ?')) {
        return { toArray: () => rows.filter((r) => r.code === params[0]) };
      }
      if (query.startsWith('SELECT') && query.includes('FROM registry')) {
        return { toArray: () => [...rows].sort((a, b) => a.created_at - b.created_at) };
      }
      if (query.startsWith('DELETE FROM registry WHERE phone = ?')) {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].phone === params[0]) rows.splice(i, 1);
        }
        return { toArray: () => [] };
      }
      if (query.startsWith('DELETE FROM registry WHERE code = ?')) {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].code === params[0]) rows.splice(i, 1);
        }
        return { toArray: () => [] };
      }
      if (query.startsWith('INSERT INTO registry')) {
        const [code, phone, name, lang, kind, service, start, event_id, created_at] = params as Array<
          string | number | null
        >;
        const existing = rows.findIndex((r) => r.code === code);
        const row: Row = {
          code: String(code),
          phone: String(phone),
          name: String(name),
          lang: String(lang),
          kind: String(kind),
          service: String(service),
          start: (start as string | null) ?? null,
          event_id: (event_id as string | null) ?? null,
          created_at: Number(created_at),
        };
        if (existing >= 0) rows[existing] = row;
        else rows.push(row);
        return { toArray: () => [] };
      }
      return { toArray: () => [] };
    }),
  };
  const storage = { sql, setAlarm: jest.fn(async () => {}), deleteAlarm: jest.fn(async () => {}) };
  const ctx = {
    storage,
    blockConcurrencyWhile: (fn: () => unknown) => {
      fn();
    },
  };
  return { ctx, rows, state };
}

function controlFetch(result: unknown) {
  return jest.fn(async () => new Response(JSON.stringify(result), { status: 200 }));
}

function makeEnv(fetchMock?: jest.Mock) {
  return {
    OPERATOR_PHONE: OPERATOR_NUMBER,
    AI: {},
    WA_ACCESS_TOKEN: 'token',
    WA_PHONE_NUMBER_ID: 'phone-id',
    CONVERSATION: {
      idFromName: (name: string) => name,
      get: jest.fn(() => ({ fetch: fetchMock ?? controlFetch({ ok: true }) })),
    },
  };
}

function opMsg(overrides: Partial<Inbound> = {}): Inbound {
  return { id: 'wamid.op1', from: OPERATOR, timestamp: 1767225600, type: 'text', text: 'ayuda', ...overrides };
}

async function seedRow(
  op: Operator,
  overrides: Partial<{ phone: string; name: string; service: string; start: string }> = {}
) {
  const phone = overrides.phone ?? CLIENT;
  const res = await op.fetch(
    new Request('https://registry/call', {
      method: 'POST',
      body: JSON.stringify({
        action: 'register',
        phone,
        name: overrides.name ?? 'Ana',
        lang: 'es',
        kind: 'handoff',
        service: overrides.service ?? 'Consultoría',
        ...(overrides.start ? { start: overrides.start } : {}),
      }),
    })
  );
  return ((await res.json()) as { code: string }).code;
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('shortCode is four base-36 chars and ignores formatting', () => {
  expect(shortCode(CLIENT)).toMatch(/^[0-9a-z]{4}$/);
  expect(shortCode('+57 300 111 2222')).toBe(shortCode(CLIENT));
  expect(shortCode(CLIENT)).toBe(shortCode(CLIENT));
});

test('parseCommand accepts the Spanish and English words', () => {
  expect(parseCommand('ayuda')).toEqual({ cmd: 'ayuda' });
  expect(parseCommand('HELP')).toEqual({ cmd: 'ayuda' });
  expect(parseCommand('pendientes')).toEqual({ cmd: 'pendientes' });
  expect(parseCommand('pending')).toEqual({ cmd: 'pendientes' });
  expect(parseCommand('responder ab12 hola Ana')).toEqual({ cmd: 'responder', code: 'ab12', text: 'hola Ana' });
  expect(parseCommand('reply ab12 hi Ana')).toEqual({ cmd: 'responder', code: 'ab12', text: 'hi Ana' });
  expect(parseCommand('tomar ab12')).toEqual({ cmd: 'tomar', code: 'ab12' });
  expect(parseCommand('take ab12')).toEqual({ cmd: 'tomar', code: 'ab12' });
  expect(parseCommand('soltar ab12')).toEqual({ cmd: 'soltar', code: 'ab12' });
  expect(parseCommand('release ab12')).toEqual({ cmd: 'soltar', code: 'ab12' });
  expect(parseCommand('confirmar ab12')).toEqual({ cmd: 'confirmar', code: 'ab12' });
  expect(parseCommand('confirm ab12')).toEqual({ cmd: 'confirmar', code: 'ab12' });
  expect(parseCommand('cancelar ab12')).toEqual({ cmd: 'cancelar', code: 'ab12' });
  expect(parseCommand('cancel ab12')).toEqual({ cmd: 'cancelar', code: 'ab12' });
});

test('parseCommand rejects unknown or malformed commands', () => {
  expect(parseCommand('hola')).toBeNull();
  expect(parseCommand('')).toBeNull();
  expect(parseCommand('responder')).toBeNull();
  expect(parseCommand('responder ab12')).toBeNull();
  expect(parseCommand('responder toolong hola')).toBeNull();
  expect(parseCommand('tomar')).toBeNull();
  expect(parseCommand('tomar ab12 extra')).toBeNull();
  expect(parseCommand('confirmar')).toBeNull();
  expect(parseCommand('ayuda extra')).toBeNull();
});

test('registryCall without a binding resolves an empty code', async () => {
  await expect(registryCall({} as never, { action: 'release', phone: CLIENT })).resolves.toEqual({ code: '' });
});

test('messages from any other number never run commands', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ from: CLIENT, text: 'cancelar ab12' }));

  expect(markRead).not.toHaveBeenCalled();
  expect(sendText).not.toHaveBeenCalled();
});

test('ayuda and unknown text get the ayuda text back', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ id: 'wamid.op2', text: 'ayuda' }));
  await op.command(opMsg({ id: 'wamid.op3', text: 'bailar ab12' }));

  expect(sendText).toHaveBeenCalledTimes(2);
  expect(sendText).toHaveBeenNthCalledWith(1, expect.anything(), OPERATOR, HELP);
  expect(sendText).toHaveBeenNthCalledWith(2, expect.anything(), OPERATOR, HELP);
});

test('pendientes is empty without handoffs', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ text: 'pendientes' }));

  expect(sendText).toHaveBeenCalledWith(expect.anything(), OPERATOR, 'Sin pendientes.');
});

test('pendientes lists every open handoff with its code', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);
  const code = await seedRow(op, { name: 'Ana' });
  await seedRow(op, { phone: '573003334444', name: 'Beto', service: '' });

  await op.command(opMsg({ text: 'pendientes' }));

  const body = (sendText as jest.Mock).mock.calls[0][2] as string;
  expect(body).toContain(code);
  expect(body).toContain('Ana');
  expect(body).toContain('+' + CLIENT);
  expect(body).toContain('Beto');
  expect(body).toContain('+573003334444');
});

test('responder sends through the lab number and stores an operator message', async () => {
  const { ctx } = makeCtx();
  const fetchMock = controlFetch({ ok: true });
  const env = makeEnv(fetchMock);
  const op = new Operator(ctx as never, env as never);
  const code = await seedRow(op);

  await op.command(opMsg({ id: 'wamid.op4', text: 'responder ' + code + ' hola Ana, te confirmo' }));

  expect(sendText).toHaveBeenCalledWith(expect.anything(), CLIENT, 'hola Ana, te confirmo');
  const req = (fetchMock.mock.calls[0] as [Request])[0];
  expect(await req.json()).toEqual({ action: 'operatorMessage', text: 'hola Ana, te confirmo' });
  expect(sendText).toHaveBeenLastCalledWith(expect.anything(), OPERATOR, 'Enviado a ' + code + '.');
});

test('responder with an unknown code gets the ayuda text back', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ text: 'responder zzzz hola' }));

  expect(sendText).toHaveBeenCalledWith(expect.anything(), OPERATOR, HELP);
});

test('tomar pauses the agent and soltar resumes it', async () => {
  const { ctx } = makeCtx();
  const fetchMock = controlFetch({ ok: true });
  const op = new Operator(ctx as never, makeEnv(fetchMock) as never);
  const code = await seedRow(op);

  await op.command(opMsg({ id: 'wamid.op5', text: 'tomar ' + code }));
  const takeReq = (fetchMock.mock.calls[0] as [Request])[0];
  expect(await takeReq.json()).toEqual({ action: 'take', code });
  expect(sendText).toHaveBeenLastCalledWith(
    expect.anything(),
    OPERATOR,
    expect.stringContaining('Tomado ' + code)
  );

  await op.command(opMsg({ id: 'wamid.op6', text: 'soltar ' + code }));
  const releaseReq = (fetchMock.mock.calls[1] as [Request])[0];
  expect(await releaseReq.json()).toEqual({ action: 'releaseTake' });
  expect(sendText).toHaveBeenLastCalledWith(expect.anything(), OPERATOR, expect.stringContaining('Soltado'));
});

test('confirmar confirms and drops the row', async () => {
  const { ctx, rows } = makeCtx();
  const op = new Operator(ctx as never, makeEnv(controlFetch({ ok: true })) as never);
  const code = await seedRow(op);
  expect(rows).toHaveLength(1);

  await op.command(opMsg({ id: 'wamid.op7', text: 'confirmar ' + code }));

  expect(rows).toHaveLength(0);
  expect(sendText).toHaveBeenLastCalledWith(expect.anything(), OPERATOR, 'Confirmado ' + code + '.');
});

test('a failed confirmar keeps the row and says so', async () => {
  const { ctx, rows } = makeCtx();
  const op = new Operator(ctx as never, makeEnv(controlFetch({ ok: false })) as never);
  const code = await seedRow(op);

  await op.command(opMsg({ id: 'wamid.op8', text: 'confirmar ' + code }));

  expect(rows).toHaveLength(1);
  expect(sendText).toHaveBeenLastCalledWith(
    expect.anything(),
    OPERATOR,
    'No pude confirmar ' + code + '. Intenta de nuevo en un momento.'
  );
});

test('cancelar cancels and drops the row', async () => {
  const { ctx, rows } = makeCtx();
  const fetchMock = controlFetch({ ok: true });
  const op = new Operator(ctx as never, makeEnv(fetchMock) as never);
  const code = await seedRow(op);

  await op.command(opMsg({ id: 'wamid.op9', text: 'cancelar ' + code }));

  const req = (fetchMock.mock.calls[0] as [Request])[0];
  expect(await req.json()).toEqual({ action: 'operatorCancel' });
  expect(rows).toHaveLength(0);
  expect(sendText).toHaveBeenLastCalledWith(expect.anything(), OPERATOR, 'Cancelado ' + code + '.');
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeGuardCtx() {
  const guard = new Map<string, string>();
  const sql = {
    exec: jest.fn((query: string, ...params: unknown[]) => {
      if (query.startsWith('SELECT value FROM guard WHERE key = ?')) {
        const value = guard.get(String(params[0]));
        return { toArray: () => (value === undefined ? [] : [{ value }]) };
      }
      if (query.startsWith('INSERT INTO guard')) {
        guard.set(String(params[0]), String(params[1]));
        return { toArray: () => [] };
      }
      return { toArray: () => [] };
    }),
  };
  const storage = { sql, setAlarm: jest.fn(async () => {}), deleteAlarm: jest.fn(async () => {}) };
  const ctx = {
    storage,
    blockConcurrencyWhile: (fn: () => unknown) => {
      fn();
    },
  };
  return { ctx, guard };
}

function guardEnv(guardConfig: Record<string, number>) {
  return {
    OPERATOR_PHONE: OPERATOR_NUMBER,
    AI: {},
    WA_ACCESS_TOKEN: 'token',
    WA_PHONE_NUMBER_ID: 'phone-id',
    GUARD_CONFIG: JSON.stringify(guardConfig),
  };
}

async function guardCall(op: Operator, body: Record<string, unknown>) {
  const res = await op.fetch(
    new Request('https://guard/call', { method: 'POST', body: JSON.stringify(body) })
  );
  return (await res.json()) as Record<string, unknown>;
}

function dailyNotices(): unknown[][] {
  return (sendText as jest.Mock).mock.calls.filter(
    (call) => call[1] === OPERATOR && String(call[2]).includes('límite diario')
  );
}

test('the Worker-wide model counter admits, then denies, and tells the operator once', async () => {
  const { ctx } = makeGuardCtx();
  const op = new Operator(ctx as never, guardEnv({ modelsPerDay: 2 }) as never);
  const now = Date.UTC(2026, 10, 9, 17, 0, 0);
  jest.spyOn(Date, 'now').mockReturnValue(now);

  expect(await guardCall(op, { action: 'guard', op: 'model', now, lang: 'es' })).toEqual({ ok: true });
  expect(await guardCall(op, { action: 'guard', op: 'model', now, lang: 'es' })).toEqual({ ok: true });
  expect(await guardCall(op, { action: 'guard', op: 'model', now, lang: 'es' })).toEqual({ ok: false });
  expect(dailyNotices()).toHaveLength(1);
  // A later denial the same day is silent: the operator heard it once.
  expect(await guardCall(op, { action: 'guard', op: 'model', now, lang: 'es' })).toEqual({ ok: false });
  expect(dailyNotices()).toHaveLength(1);
});

test('the model counter resets on the next Bogota day', async () => {
  const { ctx } = makeGuardCtx();
  const op = new Operator(ctx as never, guardEnv({ modelsPerDay: 1 }) as never);
  const day1 = Date.UTC(2026, 10, 9, 17, 0, 0);
  const day2 = day1 + 24 * 3600 * 1000;
  jest.spyOn(Date, 'now').mockReturnValue(day1);

  expect(await guardCall(op, { action: 'guard', op: 'model', now: day1, lang: 'es' })).toEqual({ ok: true });
  expect(await guardCall(op, { action: 'guard', op: 'model', now: day1, lang: 'es' })).toEqual({ ok: false });
  expect(dailyNotices()).toHaveLength(1);
  expect(await guardCall(op, { action: 'guard', op: 'model', now: day2, lang: 'en' })).toEqual({ ok: true });
});

test('one handoff notice per client every 10 minutes', async () => {
  const { ctx } = makeGuardCtx();
  const op = new Operator(ctx as never, guardEnv({}) as never);
  const now = Date.UTC(2026, 10, 9, 17, 0, 0);
  const mock = jest.spyOn(Date, 'now').mockReturnValue(now);

  expect(await guardCall(op, { action: 'guard', op: 'handoff', now, client: CLIENT })).toEqual({ ok: true });
  expect(await guardCall(op, { action: 'guard', op: 'handoff', now, client: CLIENT })).toEqual({ ok: false });
  // Another client is unaffected by the first client's window.
  expect(await guardCall(op, { action: 'guard', op: 'handoff', now, client: '573009990000' })).toEqual({
    ok: true,
  });
  mock.mockReturnValue(now + 11 * 60 * 1000);
  expect(
    await guardCall(op, { action: 'guard', op: 'handoff', now: now + 11 * 60 * 1000, client: CLIENT })
  ).toEqual({ ok: true });
});

test('the operator hourly cap sends one queue count, then drops', async () => {
  const { ctx } = makeGuardCtx();
  const op = new Operator(ctx as never, guardEnv({ opMsgsPerHour: 2 }) as never);
  const now = Date.UTC(2026, 10, 9, 17, 0, 0);

  expect(await guardCall(op, { action: 'guard', op: 'opmsg', now })).toMatchObject({ send: true });
  expect(await guardCall(op, { action: 'guard', op: 'opmsg', now })).toMatchObject({ send: true });
  expect(await guardCall(op, { action: 'guard', op: 'opmsg', now })).toMatchObject({
    send: false,
    firstOver: true,
    waiting: 1,
  });
  expect(await guardCall(op, { action: 'guard', op: 'opmsg', now })).toMatchObject({
    send: false,
    firstOver: false,
  });
});

test('an unknown guard op is refused', async () => {
  const { ctx } = makeGuardCtx();
  const op = new Operator(ctx as never, guardEnv({}) as never);

  expect(await guardCall(op, { action: 'guard', op: 'nope', now: Date.now() })).toEqual({ ok: false });
});
