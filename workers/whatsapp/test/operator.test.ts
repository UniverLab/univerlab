/** @jest-environment node */
import type { Inbound } from '../src/meta';
import { HELP } from '../src/commands';

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
  return { ...actual, sendText: jest.fn(async () => true), markRead: jest.fn(async () => true) };
});

jest.mock('../src/schedule', () => {
  const actual = jest.requireActual('../src/schedule') as Record<string, unknown>;
  return { ...actual, formatSlot: jest.fn((iso: string) => iso) };
});

import { sendText, markRead } from '../src/meta';
import { Operator } from '../src/operator';

const OPERATOR_NUMBER = '+57 300 999 8888';
const OPERATOR = '573009998888';
const CLIENT = '573001112222';
// Midday Bogota on a business Monday: outside quiet hours, so notes and
// flushes in these tests send at once unless a test pins its own clock.
// (2026-01-01T00:00Z would read 19:00 Bogota, inside quiet hours.)
const T0 = Date.UTC(2026, 0, 5, 17, 0, 0);

interface Row {
  name: string;
  phone: string;
  lang: string;
  kind: string;
  service: string;
  start: string | null;
  event_id: string | null;
  created_at: number;
  tag: string | null;
  priority: string | null;
}

function makeCtx() {
  const guard = new Map<string, string>();
  const rows: Row[] = [];
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
      if (query.startsWith('DELETE FROM guard WHERE key = ?')) {
        guard.delete(String(params[0]));
        return { toArray: () => [] };
      }
      if (query.startsWith('SELECT name FROM conversations WHERE phone = ?')) {
        return { toArray: () => rows.filter((r) => r.phone === params[0]).map((r) => ({ name: r.name })) };
      }
      if (query.startsWith('SELECT name, phone, lang, kind, service, start, event_id, created_at, tag, priority FROM conversations WHERE name = ?')) {
        return { toArray: () => rows.filter((r) => r.name === params[0]) };
      }
      if (query === 'SELECT name FROM conversations') {
        return { toArray: () => rows.map((r) => ({ name: r.name })) };
      }
      if (query.startsWith('SELECT name, phone, lang, kind, service, start, event_id, created_at, tag, priority FROM conversations ORDER BY')) {
        return { toArray: () => [...rows].sort((a, b) => a.created_at - b.created_at) };
      }
      if (query.startsWith('INSERT INTO conversations')) {
        const [phone, name, lang, kind, service, start, event_id, created_at, tag, priority] = params as Array<
          string | number | null
        >;
        rows.push({
          phone: String(phone),
          name: String(name),
          lang: String(lang),
          kind: String(kind),
          service: String(service),
          start: (start as string | null) ?? null,
          event_id: (event_id as string | null) ?? null,
          created_at: Number(created_at),
          tag: (tag as string | null) ?? null,
          priority: (priority as string | null) ?? null,
        });
        return { toArray: () => [] };
      }
      if (query.startsWith('UPDATE conversations SET tag = ?')) {
        const row = rows.find((r) => r.name === params[2]);
        if (row) {
          row.tag = String(params[0]);
          row.priority = String(params[1]);
        }
        return { toArray: () => [] };
      }
      if (query.startsWith('UPDATE conversations SET lang = ?')) {
        const row = rows.find((r) => r.phone === params[5]);
        if (row) {
          row.lang = String(params[0]);
          row.kind = String(params[1]);
          row.service = String(params[2]);
          row.start = (params[3] as string | null) ?? null;
          row.event_id = (params[4] as string | null) ?? null;
        }
        return { toArray: () => [] };
      }
      if (query.startsWith('DELETE FROM conversations WHERE phone = ?')) {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].phone === params[0]) rows.splice(i, 1);
        }
        return { toArray: () => [] };
      }
      if (query.startsWith('DELETE FROM conversations WHERE name = ?')) {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].name === params[0]) rows.splice(i, 1);
        }
        return { toArray: () => [] };
      }
      return { toArray: () => [] };
    }),
  };
  const storage = {
    sql,
    setAlarm: jest.fn(async () => {}),
    deleteAlarm: jest.fn(async () => {}),
  };
  const ctx = {
    storage,
    blockConcurrencyWhile: (fn: () => unknown) => {
      fn();
    },
  };
  return { ctx, rows, guard, storage };
}

interface ConvOpts {
  confirmOk?: boolean;
  lastAt?: number | null;
  phase?: string | null;
  turns?: Array<{ role: string; text: string }>;
  last?: string;
}

function makeEnv(convFetch?: jest.Mock, aiRun?: jest.Mock, opts: ConvOpts = {}) {
  const fetchMock =
    convFetch ??
    jest.fn(async (req: Request) => {
      const body = (await req.clone().json()) as { action?: string };
      if (body.action === 'summary') {
        return new Response(JSON.stringify({ lastAt: opts.lastAt ?? null, phase: opts.phase ?? null }), { status: 200 });
      }
      if (body.action === 'recapData') {
        return new Response(
          JSON.stringify({
            turns: opts.turns ?? [
              { role: 'user', text: 'quiero una cita' },
              { role: 'assistant', text: 'claro' },
            ],
            last: opts.last ?? 'quiero una cita ya',
          }),
          { status: 200 }
        );
      }
      if (body.action === 'operatorConfirm' || body.action === 'operatorCancel' || body.action === 'operatorReject') {
        return new Response(JSON.stringify({ ok: opts.confirmOk ?? true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
  return {
    OPERATOR_PHONE: OPERATOR_NUMBER,
    AI: { run: aiRun ?? jest.fn(async () => ({ response: '{"recap": "El cliente quiere una cita."}' })) },
    WA_ACCESS_TOKEN: 'token',
    WA_PHONE_NUMBER_ID: 'phone-id',
    CONVERSATION: {
      idFromName: (name: string) => name,
      get: jest.fn(() => ({ fetch: fetchMock })),
    },
    fetchMock,
  };
}

function opMsg(overrides: Partial<Inbound> = {}): Inbound {
  return { id: 'wamid.op1', from: OPERATOR, timestamp: 1767225600, type: 'text', text: '/help', ...overrides };
}

async function register(
  op: Operator,
  overrides: Partial<{ phone: string; name: string; service: string; email: string }> = {}
): Promise<string> {
  const res = await op.fetch(
    new Request('https://registry/call', {
      method: 'POST',
      body: JSON.stringify({
        action: 'register',
        phone: overrides.phone ?? CLIENT,
        name: overrides.name ?? 'Ana',
        lang: 'es',
        kind: 'handoff',
        service: overrides.service ?? 'Consultoría',
        ...(overrides.email ? { email: overrides.email } : {}),
      }),
    })
  );
  return ((await res.json()) as { name: string }).name;
}

async function postNote(
  op: Operator,
  overrides: Partial<{ name: string; text: string; tag: string; priority: string }> = {}
): Promise<void> {
  await op.fetch(
    new Request('https://registry/call', {
      method: 'POST',
      body: JSON.stringify({
        action: 'note',
        name: overrides.name ?? 'ana',
        text: overrides.text ?? 'hola',
        tag: overrides.tag ?? 'MENSAJE',
        priority: overrides.priority ?? 'normal',
      }),
    })
  );
}

function toOperator(): string[] {
  return (sendText as jest.Mock).mock.calls.filter((call) => call[1] === OPERATOR).map((call) => call[2] as string);
}

function toClient(phone: string): string[] {
  return (sendText as jest.Mock).mock.calls.filter((call) => call[1] === phone).map((call) => call[2] as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(T0);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('short names come from the profile name, with -2 and -3 on collision', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  expect(await register(op, { phone: '573001112222', name: 'María G' })).toBe('maria-g');
  expect(await register(op, { phone: '573003334444', name: 'María G.' })).toBe('maria-g-2');
  expect(await register(op, { phone: '573005556666', name: '¡MARÍA G!' })).toBe('maria-g-3');
});

test('long names stay within 16 characters even with a suffix', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  const first = await register(op, { phone: '573001112222', name: 'Alexandra Del Carmen Rodríguez' });
  const second = await register(op, { phone: '573003334444', name: 'Alexandra Del Carmen Rosales' });
  expect(first).toHaveLength(16);
  expect(second.length).toBeLessThanOrEqual(16);
  expect(first).not.toBe(second);
  expect(second).toBe('alexandra-del-2');
  // The cut never leaves a double hyphen before the suffix.
  expect(second).not.toContain('--');
});

test('the same phone keeps its name and the name is freed on erase', async () => {
  const { ctx, rows } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  expect(await register(op, { name: 'María' })).toBe('maria');
  expect(await register(op, { name: 'María Gómez' })).toBe('maria');
  expect(rows).toHaveLength(1);

  await op.fetch(
    new Request('https://registry/call', { method: 'POST', body: JSON.stringify({ action: 'release', phone: CLIENT }) })
  );
  expect(rows).toHaveLength(0);
  expect(await register(op, { phone: '573003334444', name: 'María!' })).toBe('maria');
});

test('an empty name falls back to the email local part, then cliente', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  expect(await register(op, { phone: '573001112222', name: '', email: 'juan@example.com' })).toBe('juan');
  expect(await register(op, { phone: '573003334444', name: '' })).toBe('cliente');
});

test('messages from any other number never run commands', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ from: CLIENT, text: '/cancel ana' }));

  expect(markRead).not.toHaveBeenCalled();
  expect(sendText).not.toHaveBeenCalled();
});

test('/help gets the help text and malformed commands say what was wrong', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ id: 'wamid.op2', text: '/help' }));
  await op.command(opMsg({ id: 'wamid.op3', text: '/take' }));
  await op.command(opMsg({ id: 'wamid.op4', text: '/response ana' }));
  await op.command(opMsg({ id: 'wamid.op5', text: '/bailar' }));
  await op.command(opMsg({ id: 'wamid.op6', text: '' }));

  const bodies = toOperator();
  expect(bodies[0]).toBe(HELP);
  for (const body of bodies.slice(1, 4)) expect(body).toBe('No reconozco ese comando. · /help');
  // Plain text with no passthrough open gets the help text.
  expect(bodies[4]).toBe(HELP);
});

test('the old Spanish words get the help text, never a relay', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op);

  await op.command(opMsg({ id: 'wamid.op7', text: 'ayuda' }));
  await op.command(opMsg({ id: 'wamid.op8', text: 'tomar ana' }));
  await op.command(opMsg({ id: 'wamid.op9', text: 'responder ana hola' }));

  expect(toOperator()).toEqual([HELP, HELP, HELP]);
  expect(toClient(CLIENT)).toEqual([]);
});

test('plain text with no passthrough open gets the help text', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);
  await register(op);

  await op.command(opMsg({ text: 'hola, ¿sigues ahí?' }));

  expect(toOperator()).toEqual([HELP]);
});

test('a command naming an unknown conversation errors with /help', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ text: '/take nadie' }));

  expect(toOperator()).toEqual(['No hay conversación abierta con [nadie]. · /help']);
});

test('a malformed command during a passthrough is answered, never relayed', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  await op.command(opMsg({ text: '/take ana' }));
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ text: '/bailar' }));
  await op.command(opMsg({ text: '/take' }));

  expect(toOperator()).toEqual([
    'No reconozco ese comando. · /help',
    'No reconozco ese comando. · /help',
  ]);
  // A command-looking message never reaches the client.
  expect(toClient(CLIENT)).toEqual([]);
});

test('/recap is empty without conversations', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ text: '/recap' }));

  expect(toOperator()).toEqual(['Sin conversaciones abiertas.']);
});

test('/recap lists open conversations highest priority first, with minutes', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  jest.spyOn(Date, 'now').mockReturnValue(T0);
  await register(op, { phone: '573001112222', name: 'Ana' });
  await register(op, { phone: '573003334444', name: 'Beto' });
  await register(op, { phone: '573005556666', name: 'Luz' });
  await postNote(op, { name: 'ana', text: 'a', tag: 'CITA', priority: 'normal' });
  await postNote(op, { name: 'beto', text: 'b', tag: 'SOPORTE', priority: 'high' });
  await postNote(op, { name: 'luz', text: 'c', tag: 'COLABORACIÓN', priority: 'low' });
  (env.fetchMock as jest.Mock).mockImplementation(async (req: Request) => {
    const body = (await req.json()) as { action?: string };
    if (body.action === 'summary') return new Response(JSON.stringify({ lastAt: T0 - 5 * 60000, phase: null }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ text: '/recap' }));

  const lines = toOperator()[0].split('\n');
  expect(lines).toHaveLength(3);
  expect(lines[0]).toContain('[beto]');
  expect(lines[0]).toContain('SOPORTE · alta');
  expect(lines[1]).toContain('[ana]');
  expect(lines[2]).toContain('[luz]');
  for (const line of lines) expect(line).toContain('hace 5 min');
});

test('/recap <name> asks the model and ends with the last client message verbatim', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv(undefined, undefined, { last: 'quiero la consulta del lunes, ¿sí?' });
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ text: '/recap ana' }));

  const bodies = toOperator();
  expect(bodies).toHaveLength(1);
  expect(bodies[0].length).toBeLessThanOrEqual(800);
  expect(bodies[0].endsWith('Último mensaje del cliente: «quiero la consulta del lunes, ¿sí?»')).toBe(true);
  // Nothing is sent to the client.
  expect(toClient(CLIENT)).toEqual([]);
  expect(env.AI.run).toHaveBeenCalledTimes(1);
});

test('/response sends the text once, stores it, and keeps the agent in charge', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ id: 'wamid.op10', text: '/response ana hola Ana, te confirmo' }));

  expect(toClient(CLIENT)).toEqual(['hola Ana, te confirmo']);
  const req = (env.fetchMock.mock.calls[0] as [Request])[0];
  expect(await req.json()).toEqual({ action: 'operatorMessage', text: 'hola Ana, te confirmo' });
  expect(toOperator()).toEqual(['Enviado a [ana].']);
});

test('/response to an unknown conversation says so', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ text: '/response nadie hola' }));

  expect(toOperator()).toEqual(['No hay conversación abierta con [nadie]. · /help']);
  expect(toClient(CLIENT)).toEqual([]);
});

test('/take opens the passthrough and relays both ways', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ id: 'wamid.op11', text: '/take ana' }));
  const takeReq = (env.fetchMock.mock.calls[0] as [Request])[0];
  expect(await takeReq.json()).toEqual({ action: 'take', name: 'ana' });
  expect(toOperator()).toEqual(['Abierto [ana]: lo que escribas (que no sea un comando) va al cliente.']);

  // Plain operator text goes to the client as is, never as a command.
  (sendText as jest.Mock).mockClear();
  await op.command(opMsg({ id: 'wamid.op12', text: 'hola Ana, /take no es un comando aquí' }));
  expect(toClient(CLIENT)).toEqual(['hola Ana, /take no es un comando aquí']);
  expect(toOperator()).toEqual([]);
  const relayReq = (env.fetchMock.mock.calls[1] as [Request])[0];
  expect(await relayReq.json()).toEqual({ action: 'operatorMessage', text: 'hola Ana, /take no es un comando aquí' });
});

test('a second /take names the open passthrough and must be released first', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op, { phone: CLIENT, name: 'Ana' });
  await register(op, { phone: '573003334444', name: 'Beto' });

  await op.command(opMsg({ text: '/take ana' }));
  (sendText as jest.Mock).mockClear();
  await op.command(opMsg({ text: '/take beto' }));

  expect(toOperator()).toEqual(['Ya está abierto [ana]. Usa /release.']);
});

test('a /take the conversation refuses opens no passthrough', async () => {
  const convFetch = jest.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 200 }));
  const { ctx } = makeCtx();
  const env = makeEnv(convFetch);
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ text: '/take ana' }));

  expect(toOperator()).toEqual(['No pude abrir [ana]. Intenta de nuevo en un momento.']);
  // The pass was never opened, so a note goes out instead of queuing.
  (sendText as jest.Mock).mockClear();
  await postNote(op, { name: 'ana', text: 'nota', tag: 'MENSAJE', priority: 'normal' });
  expect(toOperator()).toEqual(['[ana] MENSAJE · normal\nnota']);
});

test('a /release the conversation cannot take keeps the passthrough open', async () => {
  let failRelease = false;
  const convFetch = jest.fn(async (req: Request) => {
    const body = (await req.clone().json()) as { action?: string };
    if (body.action === 'releaseTake' && failRelease) {
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const { ctx } = makeCtx();
  const env = makeEnv(convFetch);
  const op = new Operator(ctx as never, env as never);
  await register(op, { phone: CLIENT, name: 'Ana' });
  await register(op, { phone: '573003334444', name: 'Beto' });
  await op.command(opMsg({ text: '/take ana' }));
  failRelease = true;
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ text: '/release' }));

  expect(toOperator()).toEqual(['No pude liberar [ana]. Intenta de nuevo en un momento.']);
  // Still open: another take is refused and names it.
  (sendText as jest.Mock).mockClear();
  await op.command(opMsg({ text: '/take beto' }));
  expect(toOperator()).toEqual(['Ya está abierto [ana]. Usa /release.']);
  // A release that reaches the conversation closes it.
  failRelease = false;
  (sendText as jest.Mock).mockClear();
  await op.command(opMsg({ text: '/release' }));
  expect(toOperator()[0]).toBe('Liberado [ana]: el agente retoma.');
});

test('notes queue while a passthrough is open and flush highest priority first', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op, { phone: CLIENT, name: 'Ana' });
  await register(op, { phone: '573003334444', name: 'Beto' });
  await register(op, { phone: '573005556666', name: 'Luz' });
  await op.command(opMsg({ text: '/take ana' }));
  (sendText as jest.Mock).mockClear();

  await postNote(op, { name: 'beto', text: 'primero', tag: 'MENSAJE', priority: 'normal' });
  await postNote(op, { name: 'luz', text: 'urgente', tag: 'SOPORTE', priority: 'high' });
  await postNote(op, { name: 'beto', text: 'segundo', tag: 'MENSAJE', priority: 'normal' });
  expect(toOperator()).toEqual([]);

  await op.command(opMsg({ text: '/release' }));
  const bodies = toOperator();
  expect(bodies[0]).toBe('Liberado [ana]: el agente retoma.');
  expect(bodies.slice(1)).toEqual([
    '[luz] SOPORTE · alta\nurgente',
    '[beto] MENSAJE · normal\nprimero',
    '[beto] MENSAJE · normal\nsegundo',
  ]);
});

test('a passthrough with no traffic for 15 minutes releases on its own', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op, { phone: CLIENT, name: 'Ana' });
  await register(op, { phone: '573003334444', name: 'Beto' });
  await op.command(opMsg({ text: '/take ana' }));
  await postNote(op, { name: 'beto', text: 'pendiente', tag: 'MENSAJE', priority: 'normal' });
  (sendText as jest.Mock).mockClear();
  jest.spyOn(Date, 'now').mockReturnValue(T0 + 16 * 60 * 1000);

  // Any command trips the idle check first.
  await op.command(opMsg({ text: '/recap' }));

  const bodies = toOperator();
  expect(bodies[0]).toBe('[ana] liberada por inactividad');
  expect(bodies.slice(1).join('\n')).toContain('[beto] MENSAJE · normal\npendiente');
  const actions = await Promise.all(
    env.fetchMock.mock.calls.map(async (call) => ((await (call[0] as Request).json()) as { action: string }).action)
  );
  expect(actions).toContain('releaseTake');
});

test('/release with nothing open says so', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ text: '/release' }));

  expect(toOperator()).toEqual(['No hay ningún directo abierto. · /help']);
});

test('/confirm confirms and releases the name', async () => {
  const { ctx, rows } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);
  await register(op, { name: 'Ana' });
  expect(rows).toHaveLength(1);
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ id: 'wamid.op13', text: '/confirm ana' }));

  expect(rows).toHaveLength(0);
  expect(toOperator()).toEqual(['Confirmado [ana].']);
});

test('a failed /confirm keeps the row and says so', async () => {
  const { ctx, rows } = makeCtx();
  const env = makeEnv(undefined, undefined, { confirmOk: false });
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ id: 'wamid.op14', text: '/confirm ana' }));

  expect(rows).toHaveLength(1);
  expect(toOperator()).toEqual(['No pude confirmar [ana]. Intenta de nuevo en un momento.']);
});

test('/reject routes to operatorReject and keeps the row', async () => {
  const { ctx, rows } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ id: 'wamid.op17', text: '/reject ana' }));

  const req = (env.fetchMock.mock.calls[0] as [Request])[0];
  expect(await req.json()).toEqual({ action: 'operatorReject' });
  expect(rows).toHaveLength(1);
  expect(toOperator()).toEqual(['Sin confirmar [ana]: el apartado sigue en pie.']);

  await op.command(opMsg({ id: 'wamid.op18', text: '/reject nadie' }));
  expect(toOperator()[1]).toBe('No hay conversación abierta con [nadie]. · /help');
});

test('a failed /reject keeps the row and says so', async () => {
  const { ctx, rows } = makeCtx();
  const env = makeEnv(undefined, undefined, { confirmOk: false });
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ id: 'wamid.op19', text: '/reject ana' }));

  expect(rows).toHaveLength(1);
  expect(toOperator()).toEqual(['No pude rechazar [ana]. Intenta de nuevo en un momento.']);
});

test('/cancel cancels and releases the name', async () => {
  const { ctx, rows } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ id: 'wamid.op15', text: '/cancel ana' }));

  const req = (env.fetchMock.mock.calls[0] as [Request])[0];
  expect(await req.json()).toEqual({ action: 'operatorCancel' });
  expect(rows).toHaveLength(0);
  expect(toOperator()).toEqual(['Cancelado [ana].']);
});

test('/delivery authorises the delivery and keeps the row', async () => {
  const { ctx, rows } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ id: 'wamid.op16', text: '/delivery ana' }));

  const req = (env.fetchMock.mock.calls[0] as [Request])[0];
  expect(await req.json()).toEqual({ action: 'operatorDelivery', phone: CLIENT, name: 'ana', lang: 'es' });
  expect(rows).toHaveLength(1);
  expect(toOperator()).toEqual(['Entrega autorizada para [ana].']);
});

test('a second /delivery reports the booked delivery', async () => {
  const { ctx } = makeCtx();
  const already = jest.fn(
    async () => new Response(JSON.stringify({ ok: true, already: true }), { status: 200 })
  );
  const env = makeEnv(already);
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ id: 'wamid.op17', text: '/delivery ana' }));

  expect(toOperator()).toEqual(['[ana] ya tiene su entrega agendada.']);
});

test('a failed /delivery keeps the row and says so', async () => {
  const { ctx, rows } = makeCtx();
  const failing = jest.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 200 }));
  const env = makeEnv(failing);
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ id: 'wamid.op18', text: '/delivery ana' }));

  expect(rows).toHaveLength(1);
  expect(toOperator()).toEqual(['No pude autorizar la entrega de [ana]. · /help']);
});

test('/delivery without a conversation says so', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  await op.command(opMsg({ id: 'wamid.op19', text: '/delivery ana' }));

  expect(toOperator()).toEqual(['No hay conversación abierta con [ana]. · /help']);
});

test('the guard denies other phones sends while a passthrough is open', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);
  await register(op, { phone: CLIENT, name: 'Ana' });
  await op.command(opMsg({ text: '/take ana' }));

  const denied = await op.fetch(
    new Request('https://guard/call', { method: 'POST', body: JSON.stringify({ action: 'guard', op: 'opmsg', phone: '573003334444' }) })
  );
  expect(await denied.json()).toMatchObject({ send: false });

  const own = await op.fetch(
    new Request('https://guard/call', { method: 'POST', body: JSON.stringify({ action: 'guard', op: 'opmsg', phone: CLIENT }) })
  );
  expect(await own.json()).toMatchObject({ send: true });
});

test('the Worker-wide model counter admits, then denies, and tells the operator once', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  (env as Record<string, unknown>).GUARD_CONFIG = JSON.stringify({ modelsPerDay: 2 });
  const op = new Operator(ctx as never, env as never);
  const now = Date.UTC(2026, 10, 9, 17, 0, 0);
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const call = (body: Record<string, unknown>) =>
    op.fetch(new Request('https://guard/call', { method: 'POST', body: JSON.stringify(body) })).then((r) => r.json());

  expect(await call({ action: 'guard', op: 'model', now, lang: 'es' })).toEqual({ ok: true });
  expect(await call({ action: 'guard', op: 'model', now, lang: 'es' })).toEqual({ ok: true });
  expect(await call({ action: 'guard', op: 'model', now, lang: 'es' })).toEqual({ ok: false });
  expect(
    (sendText as jest.Mock).mock.calls.filter(
      (c) => c[1] === OPERATOR && String(c[2]).includes('límite diario')
    )
  ).toHaveLength(1);
  expect(await call({ action: 'guard', op: 'model', now, lang: 'es' })).toEqual({ ok: false });
  expect(
    (sendText as jest.Mock).mock.calls.filter(
      (c) => c[1] === OPERATOR && String(c[2]).includes('límite diario')
    )
  ).toHaveLength(1);
});

test('one handoff notice per client every 10 minutes', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);
  const now = Date.UTC(2026, 10, 9, 17, 0, 0);
  const mock = jest.spyOn(Date, 'now').mockReturnValue(now);
  const call = (body: Record<string, unknown>) =>
    op.fetch(new Request('https://guard/call', { method: 'POST', body: JSON.stringify(body) })).then((r) => r.json());

  expect(await call({ action: 'guard', op: 'handoff', now, client: CLIENT })).toEqual({ ok: true });
  expect(await call({ action: 'guard', op: 'handoff', now, client: CLIENT })).toEqual({ ok: false });
  expect(await call({ action: 'guard', op: 'handoff', now, client: '573009990000' })).toEqual({ ok: true });
  mock.mockReturnValue(now + 11 * 60 * 1000);
  expect(await call({ action: 'guard', op: 'handoff', now: now + 11 * 60 * 1000, client: CLIENT })).toEqual({ ok: true });
});

test('the operator hourly cap sends one queue count, then drops', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  (env as Record<string, unknown>).GUARD_CONFIG = JSON.stringify({ opMsgsPerHour: 2 });
  const op = new Operator(ctx as never, env as never);
  const now = Date.UTC(2026, 10, 9, 17, 0, 0);
  const call = (body: Record<string, unknown>) =>
    op.fetch(new Request('https://guard/call', { method: 'POST', body: JSON.stringify(body) })).then((r) => r.json());

  expect(await call({ action: 'guard', op: 'opmsg', now })).toMatchObject({ send: true });
  expect(await call({ action: 'guard', op: 'opmsg', now })).toMatchObject({ send: true });
  expect(await call({ action: 'guard', op: 'opmsg', now })).toMatchObject({ send: false, firstOver: true, waiting: 1 });
  expect(await call({ action: 'guard', op: 'opmsg', now })).toMatchObject({ send: false, firstOver: false });
});

test('an unknown guard op is refused', async () => {
  const { ctx } = makeCtx();
  const op = new Operator(ctx as never, makeEnv() as never);

  expect(
    await op
      .fetch(new Request('https://guard/call', { method: 'POST', body: JSON.stringify({ action: 'guard', op: 'nope' }) }))
      .then((r) => r.json())
  ).toEqual({ ok: false });
});

// Monday 20:00 and Tuesday 07:00 Bogota, around a business night.
const NIGHT = Date.UTC(2026, 0, 6, 1, 0, 0);
const MORNING = Date.UTC(2026, 0, 6, 12, 0, 0);

function quietHold(op: Operator, now: number) {
  return op
    .fetch(new Request('https://guard/call', { method: 'POST', body: JSON.stringify({ action: 'guard', op: 'quietHold', now }) }))
    .then((r) => r.json());
}

test('/afk holds every note and only /active ends it', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await register(op, { name: 'Ana' });
  (sendText as jest.Mock).mockClear();

  await op.command(opMsg({ text: '/afk' }));
  expect(toOperator()).toEqual(['Anotado: nada me llega hasta que envíes /active.']);
  expect(await quietHold(op, T0)).toEqual({ held: true });

  // Notes queue instead of reaching the phone.
  (sendText as jest.Mock).mockClear();
  await postNote(op, { name: 'ana', text: 'hola', tag: 'MENSAJE', priority: 'normal' });
  expect(toOperator()).toEqual([]);

  // Another command still works and never clears the away state.
  await op.command(opMsg({ text: '/recap' }));
  expect(toOperator()).toHaveLength(1);
  expect(await quietHold(op, T0)).toEqual({ held: true });
  (sendText as jest.Mock).mockClear();
  await postNote(op, { name: 'ana', text: 'otra', tag: 'MENSAJE', priority: 'normal' });
  expect(toOperator()).toEqual([]);

  // /active confirms and delivers the held notes as one summary.
  await op.command(opMsg({ text: '/active' }));
  expect(toOperator()).toEqual([
    'De vuelta: esto fue lo que quedó en espera.',
    'UniverLab · mensajes en espera\n[ana] MENSAJE · normal\nhola\n[ana] MENSAJE · normal\notra',
  ]);
  expect(await quietHold(op, T0)).toEqual({ held: false });
});

test('away survives a Worker restart on the same storage', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await op.command(opMsg({ text: '/afk' }));
  (sendText as jest.Mock).mockClear();

  const restarted = new Operator(ctx as never, env as never);
  await postNote(restarted, { name: 'ana', text: 'hola', tag: 'MENSAJE', priority: 'normal' });
  expect(toOperator()).toEqual([]);
  expect(await quietHold(restarted, T0)).toEqual({ held: true });
});

test('notes queue during quiet hours and flush as one summary at 07:00', async () => {
  const { ctx, storage } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  jest.spyOn(Date, 'now').mockReturnValue(NIGHT);
  await register(op, { phone: CLIENT, name: 'Ana' });
  await register(op, { phone: '573003334444', name: 'Beto' });
  expect(await quietHold(op, NIGHT)).toEqual({ held: true });
  (sendText as jest.Mock).mockClear();

  await postNote(op, { name: 'ana', text: 'primero', tag: 'MENSAJE', priority: 'normal' });
  await postNote(op, { name: 'beto', text: 'urgente', tag: 'SOPORTE', priority: 'high' });
  expect(toOperator()).toEqual([]);
  expect(storage.setAlarm).toHaveBeenCalledWith(MORNING);

  // The 07:00 alarm delivers one grouped summary, oldest first.
  jest.spyOn(Date, 'now').mockReturnValue(MORNING);
  (sendText as jest.Mock).mockClear();
  (storage.setAlarm as jest.Mock).mockClear();
  await op.alarm();
  expect(toOperator()).toEqual([
    'UniverLab · mensajes en espera\n' +
      '[ana] MENSAJE · normal\nprimero\n' +
      '[beto] SOPORTE · alta\nurgente\n' +
      'Pendientes: beto',
  ]);
  // A second alarm finds nothing held.
  (sendText as jest.Mock).mockClear();
  await op.alarm();
  expect(toOperator()).toEqual([]);
});

test('the 07:00 alarm sends nothing while away; /active delivers it', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  await op.command(opMsg({ text: '/afk' }));
  jest.spyOn(Date, 'now').mockReturnValue(NIGHT);
  (sendText as jest.Mock).mockClear();
  await postNote(op, { name: 'ana', text: 'noche', tag: 'MENSAJE', priority: 'normal' });
  expect(toOperator()).toEqual([]);

  jest.spyOn(Date, 'now').mockReturnValue(MORNING);
  await op.alarm();
  expect(toOperator()).toEqual([]);

  await op.command(opMsg({ text: '/active' }));
  expect(toOperator()).toEqual([
    'De vuelta: esto fue lo que quedó en espera.',
    'UniverLab · mensajes en espera\n[ana] MENSAJE · normal\nnoche',
  ]);
});

test('exemptQuiet skips quiet hours but never away', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  jest.spyOn(Date, 'now').mockReturnValue(NIGHT);
  const deliver = (
    op as unknown as {
      deliver: (note: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<void>;
    }
  ).deliver.bind(op);
  (sendText as jest.Mock).mockClear();

  await deliver({ name: 'ana', text: 'temprano', tag: 'AVISO', priority: 'normal' }, { exemptQuiet: true });
  expect(toOperator()).toEqual(['[ana] AVISO · normal\ntemprano']);

  await op.command(opMsg({ text: '/afk' }));
  (sendText as jest.Mock).mockClear();
  await deliver({ name: 'ana', text: 'nada', tag: 'AVISO', priority: 'normal' }, { exemptQuiet: true });
  expect(toOperator()).toEqual([]);
});

async function agenda(op: Operator, dateKey: string, text = 'Agenda de hoy (1):\n06:30 · Consultoría · Ana · pagada'): Promise<boolean> {
  const res = await op.fetch(
    new Request('https://registry/call', {
      method: 'POST',
      body: JSON.stringify({ action: 'agenda', dateKey, text }),
    })
  );
  return ((await res.json()) as { sent: boolean }).sent;
}

async function agendaSent(op: Operator, dateKey: string): Promise<boolean> {
  const res = await op.fetch(
    new Request('https://registry/call', {
      method: 'POST',
      body: JSON.stringify({ action: 'agendaSent', dateKey }),
    })
  );
  return ((await res.json()) as { sent: boolean }).sent;
}

test('the agenda sends once in quiet hours, a retry sends nothing twice', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  jest.spyOn(Date, 'now').mockReturnValue(NIGHT);
  (sendText as jest.Mock).mockClear();

  await expect(agenda(op, '2026-01-05')).resolves.toBe(true);
  expect(toOperator()).toEqual(['[agenda] AGENDA · normal\nAgenda de hoy (1):\n06:30 · Consultoría · Ana · pagada']);
  await expect(agendaSent(op, '2026-01-05')).resolves.toBe(true);

  await expect(agenda(op, '2026-01-05')).resolves.toBe(false);
  expect(toOperator()).toHaveLength(1);
});

test('the agenda waits while away and goes out on /active', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  jest.spyOn(Date, 'now').mockReturnValue(NIGHT);
  await op.command(opMsg({ text: '/afk' }));
  (sendText as jest.Mock).mockClear();

  await expect(agenda(op, '2026-01-05')).resolves.toBe(true);
  expect(toOperator()).toEqual([]);

  await op.command(opMsg({ text: '/active' }));
  expect(toOperator().some((t) => t.includes('Agenda de hoy'))).toBe(true);
});

test('a quiet day marks the agenda as handled without sending anything', async () => {
  const { ctx } = makeCtx();
  const env = makeEnv();
  const op = new Operator(ctx as never, env as never);
  jest.spyOn(Date, 'now').mockReturnValue(NIGHT);
  (sendText as jest.Mock).mockClear();

  await expect(agenda(op, '2026-01-05', '')).resolves.toBe(false);
  expect(toOperator()).toEqual([]);
  await expect(agendaSent(op, '2026-01-05')).resolves.toBe(true);
});
