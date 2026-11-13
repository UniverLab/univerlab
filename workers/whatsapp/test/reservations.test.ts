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
  register: jest.fn(async () => 'zz99'),
  release: jest.fn(async () => {}),
  shortCode: jest.fn(() => '0000'),
}));

import { sendText } from '../src/meta';
import { register } from '../src/registry';

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
  expect(code).toBe('zz99');
  expect(sendText).toHaveBeenCalledWith(ENV, '573001112222', LIMIT_TEXT['hold-cap'].es);
  expect(register).toHaveBeenCalledWith(
    ENV,
    expect.objectContaining({ phone: '573001112222', kind: 'handoff', service: 'consultation' })
  );
  const operatorNote = (sendText as jest.Mock).mock.calls.find((call) => call[1] === '573009998888')?.[2] as string;
  expect(operatorNote).toContain('hold-cap');
  expect(operatorNote).toContain('zz99');
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
