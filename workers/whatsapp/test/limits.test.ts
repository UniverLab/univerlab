/** @jest-environment node */
import {
  admit,
  contactKey,
  EXISTING,
  LIMIT_TEXT,
  SLOT_TAKEN,
  type ContactState,
} from '../src/limits';
import { DEFAULT_BOOKING_CONFIG } from '../src/schedule';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 17, 15, 0);

const FREE: ContactState = { hasActive: false, lastFreeCallMs: null, expiredHoldsMs: [], moves: 0 };

function contact(over: Partial<ContactState>): ContactState {
  return { ...FREE, ...over };
}

test('a free contact may reserve', () => {
  expect(admit(DEFAULT_BOOKING_CONFIG, NOW, FREE, 0, 0, { service: 'consultation', hold: true, move: false })).toEqual({
    ok: true,
  });
});

test('an active booking blocks another reserve but not a move', () => {
  const busy = contact({ hasActive: true });
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, busy, 0, 0, { service: 'consultation', hold: true, move: false }).reason
  ).toBe('existing');
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, busy, 0, 0, { service: 'consultation', hold: true, move: true })
  ).toEqual({ ok: true });
});

test('a free first call blocks the next one inside 90 days only', () => {
  const recent = contact({ lastFreeCallMs: NOW - 89 * DAY });
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, recent, 0, 0, { service: 'first-call', hold: false, move: false }).reason
  ).toBe('free-limit');
  const old = contact({ lastFreeCallMs: NOW - 90 * DAY });
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, old, 0, 0, { service: 'first-call', hold: false, move: false })
  ).toEqual({ ok: true });
  // A consultation is not a free first call.
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, recent, 0, 0, { service: 'consultation', hold: true, move: false })
  ).toEqual({ ok: true });
});

test('two expired holds inside 14 days block the third, older ones do not', () => {
  const blocked = contact({ expiredHoldsMs: [NOW - 13 * DAY, NOW - DAY] });
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, blocked, 0, 0, { service: 'consultation', hold: true, move: false }).reason
  ).toBe('expired-holds');
  const stale = contact({ expiredHoldsMs: [NOW - 15 * DAY, NOW - DAY] });
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, stale, 0, 0, { service: 'consultation', hold: true, move: false })
  ).toEqual({ ok: true });
  // One expired hold is still fine.
  const one = contact({ expiredHoldsMs: [NOW - DAY] });
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, one, 0, 0, { service: 'consultation', hold: true, move: false })
  ).toEqual({ ok: true });
});

test('the third move is refused', () => {
  const twice = contact({ hasActive: true, moves: 2 });
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, twice, 0, 0, { service: 'consultation', hold: true, move: true }).reason
  ).toBe('moves');
  const once = contact({ hasActive: true, moves: 1 });
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, once, 0, 0, { service: 'consultation', hold: true, move: true })
  ).toEqual({ ok: true });
});

test('four open holds block a fifth; four creations a day block the fifth', () => {
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, FREE, 4, 0, { service: 'consultation', hold: true, move: false }).reason
  ).toBe('hold-cap');
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, FREE, 3, 0, { service: 'consultation', hold: true, move: false })
  ).toEqual({ ok: true });
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, FREE, 0, 4, { service: 'consultation', hold: true, move: false }).reason
  ).toBe('day-cap');
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, FREE, 0, 4, { service: 'first-call', hold: false, move: false }).reason
  ).toBe('day-cap');
  // A move replaces its event, so the creation caps do not apply to it.
  const moving = contact({ hasActive: true, moves: 0 });
  expect(
    admit(DEFAULT_BOOKING_CONFIG, NOW, moving, 4, 4, { service: 'consultation', hold: true, move: true })
  ).toEqual({ ok: true });
});

test('every refusal is a fixed message in both languages', () => {
  for (const reason of ['free-limit', 'expired-holds', 'hold-cap', 'day-cap', 'moves'] as const) {
    expect(typeof LIMIT_TEXT[reason].es).toBe('string');
    expect(typeof LIMIT_TEXT[reason].en).toBe('string');
    expect(LIMIT_TEXT[reason].es.length).toBeGreaterThan(0);
    expect(LIMIT_TEXT[reason].en.length).toBeGreaterThan(0);
    expect(LIMIT_TEXT[reason].es).not.toBe(LIMIT_TEXT[reason].en);
  }
  expect(SLOT_TAKEN.es).not.toBe(SLOT_TAKEN.en);
  expect(EXISTING.es).toContain('{slot}');
  expect(EXISTING.en).toContain('{slot}');
  expect(EXISTING.es).not.toBe(EXISTING.en);
});

test('contact keys are opaque and channel-scoped', () => {
  expect(contactKey('wa', '+573001112222')).toBe('wa:+573001112222');
  expect(contactKey('web', 'Ana@Example.COM ')).toBe('web:ana@example.com');
  expect(contactKey('wa', '+573001112222')).not.toBe(contactKey('web', '+573001112222'));
});
