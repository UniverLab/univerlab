/** @jest-environment node */
import {
  CALENDAR_DOWN,
  CANCELLED,
  CONFIRMED,
  decide,
  DEFAULT_PAYMENTS,
  EXPIRED,
  HOLD_SENT,
  MOVE_ONCE,
  OFFER,
  offerText,
  parseDecide,
  paymentText,
  PICKED,
  renderBooking,
  serviceLabel,
  type DecideInput,
} from '../src/booking';
import { DEFAULT_BOOKING_CONFIG } from '../src/schedule';

const INPUT: DecideInput = {
  lang: 'es',
  service: 'consultation',
  phase: 'offered',
  offered: ['martes 17 de noviembre, 15:00 (hora Colombia)'],
  today: '2026-11-09',
};

function aiFor(raw: string | null, throws = false) {
  return {
    run: jest.fn(async () => {
      if (throws) throw new Error('down');
      return { response: raw ?? '' };
    }),
  };
}

test('offer text numbers slots and names Colombia time', () => {
  for (const lang of ['es', 'en'] as const) {
    const text = offerText(lang, ['slot-a', 'slot-b']);
    expect(text).toContain('1) slot-a');
    expect(text).toContain('2) slot-b');
    expect(text).toBe(OFFER[lang].replace('{slots}', '1) slot-a\n2) slot-b'));
  }
});

test('every template exists in both languages and renders placeholders', () => {
  for (const record of [PICKED, HOLD_SENT, EXPIRED, CONFIRMED, CANCELLED, MOVE_ONCE, CALENDAR_DOWN]) {
    expect(typeof record.es).toBe('string');
    expect(typeof record.en).toBe('string');
    expect(record.es.length).toBeGreaterThan(0);
    expect(record.en.length).toBeGreaterThan(0);
  }
  expect(renderBooking(HOLD_SENT.es, { slot: 'S', payments: 'P' })).toContain('S');
  expect(renderBooking(HOLD_SENT.es, { slot: 'S', payments: 'P' })).toContain('P');
  expect(renderBooking(HOLD_SENT.es, { slot: 'S', payments: 'P' })).not.toContain('{slot}');
  expect(serviceLabel('es', 'first-call')).toBe('Primera llamada');
  expect(serviceLabel('en', 'consultation')).toBe('Consultation');
});

test('payment copy falls back to Bre-B/PayPal and honours BOOKING_CONFIG', () => {
  expect(paymentText(DEFAULT_BOOKING_CONFIG, 'es')).toBe(DEFAULT_PAYMENTS.es);
  expect(DEFAULT_PAYMENTS.es).toContain('Bre-B');
  expect(DEFAULT_PAYMENTS.en).toContain('PayPal');
  const cfg = { ...DEFAULT_BOOKING_CONFIG, payments: { es: 'E', en: 'F' } };
  expect(paymentText(cfg, 'en')).toBe('F');
});

test('decide routes a pick with its slot number', async () => {
  const ai = aiFor('{"action":"pick","slot":2,"date":""}');
  const res = await decide(ai, { model: 'm', options: {} }, INPUT, 'el segundo');
  expect(res).toEqual({ action: 'pick', slot: 2, date: '' });
  const input = ai.run.mock.calls[0][1] as { messages: Array<{ content: string }> };
  expect(input.messages[0].content).toContain('martes 17');
});

test('decide routes days with a Bogota date', async () => {
  const ai = aiFor('ok {"action": "day", "slot": -1, "date": "2026-11-18"} tail');
  await expect(decide(ai, { model: 'm', options: {} }, INPUT, 'mejor el miércoles')).resolves.toEqual({
    action: 'day',
    slot: -1,
    date: '2026-11-18',
  });
});

test('decide falls back to other when the model fails or rambles', async () => {
  await expect(
    decide(aiFor('not json at all'), { model: 'm', options: {} }, INPUT, 'hola')
  ).resolves.toEqual({ action: 'other', slot: -1, date: '' });
  await expect(
    decide(aiFor(null, true), { model: 'm', options: {} }, INPUT, 'hola')
  ).resolves.toEqual({ action: 'other', slot: -1, date: '' });
  await expect(
    decide(aiFor('{"action":"refund","slot":1,"date":"tomorrow"}'), { model: 'm', options: {} }, INPUT, 'x')
  ).resolves.toEqual({ action: 'other', slot: -1, date: '' });
});

test('parseDecide validates each field', () => {
  expect(parseDecide('{"action":"cancel","slot":0,"date":""}')).toEqual({ action: 'cancel', slot: 0, date: '' });
  expect(parseDecide('{"action":"move","slot":"two","date":null}')).toEqual({ action: 'move', slot: -1, date: '' });
  expect(parseDecide('{"action":"day","slot":-1,"date":"18/11"}')).toEqual({ action: 'day', slot: -1, date: '' });
  expect(parseDecide('')).toEqual({ action: 'other', slot: -1, date: '' });
});
