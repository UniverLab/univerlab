/** @jest-environment node */
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

jest.mock('../src/reservations', () => ({ calendarCall: jest.fn() }));

import {
  bookingDigestConfig,
  bookingDigestItems,
  bookingDigestSent,
  changeLine,
  DEFAULT_BOOKING_DIGEST_CONFIG,
  formatBookingDigest,
  isBookingDigestSlot,
  runBookingDigest,
  sameDayAfterBookingDigest,
} from '../src/daybook';
import { calendarCall } from '../src/reservations';

/** 06:30 America/Bogota on Monday 2026-11-09. */
const SLOT = Date.UTC(2026, 10, 9, 11, 30);
/** 06:00 Bogota the same day: before the digest time. */
const EARLY = Date.UTC(2026, 10, 9, 11, 0);
/** 07:00 Bogota the same day: the next wake after the digest time. */
const LATER = Date.UTC(2026, 10, 9, 12, 0);

test('the booking digest defaults to 06:30 and stays enabled', () => {
  expect(DEFAULT_BOOKING_DIGEST_CONFIG).toEqual({ hour: 6, minute: 30, enabled: true });
  expect(bookingDigestConfig({})).toEqual(DEFAULT_BOOKING_DIGEST_CONFIG);
  expect(bookingDigestConfig({ BOOKING_DIGEST_CONFIG: 'no es json' })).toEqual(DEFAULT_BOOKING_DIGEST_CONFIG);
  expect(bookingDigestConfig({ BOOKING_DIGEST_CONFIG: JSON.stringify({ hour: 7 }) })).toEqual({ hour: 7, minute: 30, enabled: true });
});

test('the slot opens at the configured Bogota time and stays open for a retry', () => {
  const cfg = bookingDigestConfig({});
  expect(isBookingDigestSlot(EARLY, cfg)).toBe(false);
  expect(isBookingDigestSlot(SLOT, cfg)).toBe(true);
  expect(isBookingDigestSlot(LATER, cfg)).toBe(true);
  expect(isBookingDigestSlot(SLOT, { ...cfg, enabled: false })).toBe(false);
});

test('items split the hold prefix, speak the operator language and sort by start', () => {
  const items = bookingDigestItems([
    { id: 'b', summary: 'Consultoría · Bea', start: '2026-11-09T12:00:00.000Z', end: '2026-11-09T13:00:00.000Z' },
    { id: 'c', summary: 'First call · Ceci', start: '2026-11-09T13:00:00.000Z', end: '2026-11-09T13:15:00.000Z' },
    {
      id: 'a',
      summary: '[Por confirmar] Consultoría · Ana',
      start: '2026-11-09T11:30:00.000Z',
      end: '2026-11-09T12:30:00.000Z',
    },
  ]);
  expect(items).toEqual([
    { start: '2026-11-09T11:30:00.000Z', service: 'Consultoría', name: 'Ana', paid: false },
    { start: '2026-11-09T12:00:00.000Z', service: 'Consultoría', name: 'Bea', paid: true },
    { start: '2026-11-09T13:00:00.000Z', service: 'Primera llamada', name: 'Ceci', paid: true },
  ]);
});

test('the digest is empty when the day holds nothing, and a first call is free', () => {
  expect(formatBookingDigest([])).toBe('');
  const text = formatBookingDigest([
    { start: '2026-11-09T11:30:00.000Z', service: 'Consultoría', name: 'Ana', paid: false },
    { start: '2026-11-09T12:00:00.000Z', service: 'Primera llamada', name: 'Bea', paid: true },
  ]);
  expect(text).toContain('06:30 · Consultoría · Ana · sin pagar');
  expect(text).toContain('07:00 · Primera llamada · Bea · gratis');
});

test('change lines keep the event naming with the payment state', () => {
  expect(changeLine('Cita cancelada', 'consultation', '2026-11-09T11:30:00.000Z', 'Ana', false)).toContain(
    'Cita cancelada · 06:30 · Consultoría · Ana · sin pagar'
  );
  expect(
    changeLine('Cita cancelada · estaba pagada', 'consultation', '2026-11-09T11:30:00.000Z', 'Ana', true)
  ).toContain('estaba pagada');
  expect(changeLine('Cita agendada', 'first-call', '2026-11-09T11:30:00.000Z', 'Ana', true)).toContain(
    'Primera llamada · Ana · gratis'
  );
});

function registryNs(sent: boolean) {
  return {
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async () => Response.json({ sent }),
    }),
  };
}

test('a same-day change counts only after the digest went out', async () => {
  const sent = { REGISTRY: registryNs(true) };
  const unsent = { REGISTRY: registryNs(false) };
  const noon = Date.UTC(2026, 10, 9, 17, 0);
  const morning = Date.UTC(2026, 10, 9, 11, 0);
  expect(await sameDayAfterBookingDigest(sent as never, '2026-11-09T12:00:00.000Z', noon)).toBe(true);
  expect(await sameDayAfterBookingDigest(unsent as never, '2026-11-09T12:00:00.000Z', noon)).toBe(false);
  // A later-day start waits for its own digest even when today went out.
  expect(await sameDayAfterBookingDigest(sent as never, '2026-11-10T12:00:00.000Z', morning)).toBe(false);
  expect(await bookingDigestSent(unsent as never, '2026-11-09')).toBe(false);
});

/** A stateful operator stub: it remembers the days its digest took. */
function operatorNs() {
  const marked = new Set<string>();
  const calls: Array<{ dateKey: string; text: string }> = [];
  return {
    marked,
    calls,
    ns: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (req: Request) => {
          const body = (await req.json()) as { action: string; dateKey?: string; text?: string };
          const dateKey = body.dateKey ?? '';
          if (body.action === 'bookingDigestSent') return Response.json({ sent: marked.has(dateKey) });
          if (body.action === 'bookingDigest') {
            calls.push({ dateKey, text: body.text ?? '' });
            marked.add(dateKey);
            return Response.json({ sent: Boolean(body.text) });
          }
          return Response.json({ ok: false });
        },
      }),
    },
  };
}

afterEach(() => {
  (calendarCall as jest.Mock).mockReset();
});

test('the morning run sends the day in time order once and never twice', async () => {
  const op = operatorNs();
  (calendarCall as jest.Mock).mockResolvedValue({
    ok: true,
    events: [
      { id: 'b', summary: 'Consultoría · Bea', start: '2026-11-09T20:00:00.000Z', end: '2026-11-09T21:00:00.000Z' },
      { id: 'a', summary: '[Por confirmar] Consultoría · Ana', start: '2026-11-09T12:00:00.000Z', end: '2026-11-09T13:00:00.000Z' },
    ],
  });
  const env = { REGISTRY: op.ns };

  await runBookingDigest(env as never, SLOT);
  expect(calendarCall).toHaveBeenCalledWith(env, { action: 'day', now: SLOT });
  expect(op.calls).toHaveLength(1);
  expect(op.calls[0].dateKey).toBe('2026-11-09');
  expect(op.calls[0].text).toContain('07:00 · Consultoría · Ana · sin pagar');
  expect(op.calls[0].text.indexOf('Ana')).toBeLessThan(op.calls[0].text.indexOf('Bea'));

  await runBookingDigest(env as never, LATER);
  expect(op.calls).toHaveLength(1);
});

test('the run stays silent before its time and on a quiet day binds nothing', async () => {
  const op = operatorNs();
  (calendarCall as jest.Mock).mockResolvedValue({ ok: true, events: [] });
  const env = { REGISTRY: op.ns };

  await runBookingDigest(env as never, EARLY);
  expect(calendarCall).not.toHaveBeenCalled();

  await runBookingDigest(env as never, SLOT);
  expect(op.calls).toEqual([{ dateKey: '2026-11-09', text: '' }]);
});

test('an empty morning still marks the day, so a later same-day booking reaches the operator', async () => {
  const op = operatorNs();
  (calendarCall as jest.Mock).mockResolvedValue({ ok: true, events: [] });
  const env = { REGISTRY: op.ns };
  const noon = Date.UTC(2026, 10, 9, 17, 0);

  expect(await sameDayAfterBookingDigest(env as never, '2026-11-09T20:00:00.000Z', noon)).toBe(false);
  await runBookingDigest(env as never, SLOT);
  expect(await sameDayAfterBookingDigest(env as never, '2026-11-09T20:00:00.000Z', noon)).toBe(true);
  // A later-day booking still waits for its own digest.
  expect(await sameDayAfterBookingDigest(env as never, '2026-11-10T15:00:00.000Z', noon)).toBe(false);
});

test('a failed calendar read retries on the next wake instead of losing the day', async () => {
  const op = operatorNs();
  const env = { REGISTRY: op.ns };
  (calendarCall as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'calendar-down' });

  await runBookingDigest(env as never, SLOT);
  expect(op.calls).toHaveLength(0);

  (calendarCall as jest.Mock).mockResolvedValueOnce({
    ok: true,
    events: [{ id: 'a', summary: 'Consultoría · Ana', start: '2026-11-09T20:00:00.000Z', end: '2026-11-09T21:00:00.000Z' }],
  });
  await runBookingDigest(env as never, LATER);
  expect(op.calls).toHaveLength(1);
  expect(op.calls[0].text).toContain('Ana');
});

test('the switch off means the run does nothing at all', async () => {
  const op = operatorNs();
  const env = { REGISTRY: op.ns, BOOKING_DIGEST_CONFIG: JSON.stringify({ enabled: false }) };
  await runBookingDigest(env as never, SLOT);
  expect(calendarCall).not.toHaveBeenCalled();
  expect(op.calls).toHaveLength(0);
});
