/** @jest-environment node */
import { calendarCall, refuseAndHandOff, seedFromActive } from '../src/reservations';
import { LIMIT_TEXT } from '../src/limits';

jest.mock(
  'cloudflare:workers',
  () => ({
    DurableObject: class {},
  }),
  { virtual: true }
);

jest.mock('../src/meta', () => ({
  sendText: jest.fn(async () => true),
  sendMedia: jest.fn(async () => true),
  markRead: jest.fn(async () => true),
}));

jest.mock('../src/registry', () => ({
  register: jest.fn(async () => 'ana-g'),
  release: jest.fn(async () => {}),
  postNote: jest.fn(async () => {}),
}));

import { sendText } from '../src/meta';
import { register, postNote } from '../src/registry';

const ENV = { OPERATOR_PHONE: '+57 300 999 8888' };

beforeEach(() => {
  jest.clearAllMocks();
});

test('without a CALENDAR binding every call is calendar-down', async () => {
  const res = await calendarCall({} as never, { action: 'status' });
  expect(res).toEqual({ ok: false, reason: 'calendar-down' });
});

test('a refusal uses the fixed wording, registers and briefs the operator', async () => {
  const code = await refuseAndHandOff(ENV as never, {
    lang: 'es',
    phone: '573001112222',
    name: 'Ana',
    service: 'consultation',
    brief: ['goal x'],
    reason: 'hold-cap',
  });
  expect(code).toBe('ana-g');
  expect(sendText).toHaveBeenCalledWith(ENV, '573001112222', LIMIT_TEXT['hold-cap'].es);
  expect(register).toHaveBeenCalledWith(
    ENV,
    expect.objectContaining({ phone: '573001112222', kind: 'handoff', service: 'consultation' })
  );
  expect(postNote).toHaveBeenCalledWith(
    ENV,
    expect.objectContaining({ name: 'ana-g', tag: 'CITA', priority: 'normal' })
  );
  const noteText = (postNote as jest.Mock).mock.calls[0][1].text as string;
  expect(noteText).toContain('hold-cap');
});

test('the refusal never calls the text model', async () => {
  await refuseAndHandOff(ENV as never, {
    lang: 'en',
    phone: '573001112222',
    name: '',
    service: 'first-call',
    brief: [],
    reason: 'free-limit',
  });
  expect(sendText).toHaveBeenCalledWith(ENV, '573001112222', LIMIT_TEXT['free-limit'].en);
});

function guardEnv(handler: (body: Record<string, unknown>) => unknown) {
  const fetchMock = jest.fn(async (req: Request) => new Response(JSON.stringify(handler((await req.json()) as Record<string, unknown>)), { status: 200 }));
  return {
    OPERATOR_PHONE: '+57 300 999 8888',
    REGISTRY: { idFromName: (n: string) => n, get: jest.fn(() => ({ fetch: fetchMock })) },
    _fetchMock: fetchMock,
  } as unknown as { OPERATOR_PHONE: string; _fetchMock: jest.Mock };
}

test('a handoff-throttled refusal still tells the client but skips the operator', async () => {
  const g = guardEnv((body) => {
    if (body.op === 'handoff') return { ok: false };
    if (body.op === 'opmsg') return { send: true, firstOver: false, waiting: 0 };
    return { ok: true };
  });
  const code = await refuseAndHandOff(g as never, {
    lang: 'es',
    phone: '573001112222',
    name: 'Ana',
    service: 'consultation',
    brief: ['goal x'],
    reason: 'hold-cap',
  });
  expect(code).toBe('ana-g');
  expect(sendText).toHaveBeenCalledWith(g, '573001112222', LIMIT_TEXT['hold-cap'].es);
  expect(register).toHaveBeenCalled();
  expect(postNote).not.toHaveBeenCalled();
});

test('a refusal posts its note; the Operator applies the hourly cap', async () => {
  const g = guardEnv((body) => {
    if (body.op === 'handoff') return { ok: true };
    if (body.op === 'opmsg') return { send: false, firstOver: true, waiting: 3 };
    return { ok: true };
  });
  await refuseAndHandOff(g as never, {
    lang: 'es',
    phone: '573001112222',
    name: 'Ana',
    service: 'consultation',
    brief: ['goal x'],
    reason: 'day-cap',
  });
  expect(postNote).toHaveBeenCalledTimes(1);
  expect(postNote).toHaveBeenCalledWith(g, expect.objectContaining({ name: 'ana-g', tag: 'CITA' }));
});

test('seeding rebuilds the chat state from the active row', () => {
  const st = seedFromActive(
    { eventId: 'ev1', start: 's', end: 'e', kind: 'hold', service: 'consultation', createdAt: 42 },
    { lang: 'es', phone: '573001112222', name: 'Ana', service: 'consultation', brief: ['b'] }
  );
  expect(st).toMatchObject({ phase: 'held', eventId: 'ev1', start: 's', phone: '573001112222' });
  const booked = seedFromActive(
    { eventId: 'ev2', start: 's', end: 'e', kind: 'booked', service: 'first-call', createdAt: 7 },
    { lang: 'en', phone: 'p', name: '', service: 'first-call' }
  );
  expect(booked.phase).toBe('booked');
});
