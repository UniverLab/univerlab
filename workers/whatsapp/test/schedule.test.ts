/** @jest-environment node */
import {
  bookingConfig,
  bogotaDateKey,
  bogotaParts,
  bogotaToUtcMs,
  colombiaHolidays,
  DEFAULT_BOOKING_CONFIG,
  formatSlot,
  freeSlots,
  type BookingConfig,
} from '../src/schedule';

const CFG: BookingConfig = {
  ...DEFAULT_BOOKING_CONFIG,
  windows: DEFAULT_BOOKING_CONFIG.windows.map((w) => [...w] as [number, number]),
};

/** Monday 2026-11-09 12:00 Bogota = 17:00 UTC. */
const MON_12 = Date.UTC(2026, 10, 9, 17, 0);
/** Friday 2026-11-13 16:00 Bogota = 21:00 UTC. */
const FRI_16 = Date.UTC(2026, 10, 13, 21, 0);

test('defaults match the spec fallback', () => {
  expect(bookingConfig({})).toEqual({
    windows: [
      [7, 8],
      [15, 19],
    ],
    marginMin: 15,
    maxPerDay: 3,
    noticeHours: 12,
    horizonDays: 14,
  });
});

test('parses a full BOOKING_CONFIG and trims payment copy', () => {
  const cfg = bookingConfig({
    BOOKING_CONFIG: JSON.stringify({
      windows: [[8, 12]],
      marginMin: 30,
      maxPerDay: 2,
      noticeHours: 24,
      horizonDays: 7,
      payments: { es: '  Bre-B  ', en: 'PayPal' },
    }),
  });
  expect(cfg.windows).toEqual([[8, 12]]);
  expect(cfg.marginMin).toBe(30);
  expect(cfg.maxPerDay).toBe(2);
  expect(cfg.noticeHours).toBe(24);
  expect(cfg.horizonDays).toBe(7);
  expect(cfg.payments).toEqual({ es: 'Bre-B', en: 'PayPal' });
});

test('malformed or invalid BOOKING_CONFIG falls back field by field', () => {
  expect(bookingConfig({ BOOKING_CONFIG: '{nope' })).toEqual(bookingConfig({}));
  const cfg = bookingConfig({
    BOOKING_CONFIG: JSON.stringify({ windows: [[9, 9]], marginMin: -5, noticeHours: 'soon' }),
  });
  expect(cfg.windows).toEqual(DEFAULT_BOOKING_CONFIG.windows);
  expect(cfg.marginMin).toBe(15);
  expect(cfg.noticeHours).toBe(12);
});

test('fixed holidays are present', () => {
  const h = colombiaHolidays(2026);
  for (const key of ['2026-01-01', '2026-05-01', '2026-07-20', '2026-08-07', '2026-12-08', '2026-12-25']) {
    expect(h.has(key)).toBe(true);
  }
});

test('Emiliani holidays move to Monday', () => {
  const h = colombiaHolidays(2026);
  // Reyes (Tue Jan 6) and Cartagena (Wed Nov 11) shift to the next Monday.
  expect(h.has('2026-01-06')).toBe(false);
  expect(h.has('2026-01-12')).toBe(true);
  expect(h.has('2026-11-11')).toBe(false);
  expect(h.has('2026-11-16')).toBe(true);
});

test('Easter-based holidays follow the 2026 calendar', () => {
  const h = colombiaHolidays(2026);
  expect(h.has('2026-04-02')).toBe(true); // Holy Thursday
  expect(h.has('2026-04-03')).toBe(true); // Good Friday
  expect(h.has('2026-05-18')).toBe(true); // Ascension Monday
  expect(h.has('2026-06-08')).toBe(true); // Corpus Monday
  expect(h.has('2026-06-15')).toBe(true); // Sagrado Corazón Monday
});

test('Bogota helpers never depend on the runtime zone', () => {
  expect(bogotaToUtcMs(2026, 11, 17, 15, 0)).toBe(Date.UTC(2026, 10, 17, 20, 0));
  const p = bogotaParts(Date.UTC(2026, 10, 17, 20, 0));
  expect(p).toMatchObject({ year: 2026, month: 11, day: 17, hour: 15, minute: 0, weekday: 2 });
  expect(bogotaDateKey(Date.UTC(2026, 10, 18, 2, 30))).toBe('2026-11-17');
});

test('slots are written in Colombia time and say so', () => {
  const iso = new Date(Date.UTC(2026, 10, 17, 20, 0)).toISOString();
  expect(formatSlot(iso, 'es')).toBe('martes 17 de noviembre, 15:00 (hora Colombia)');
  expect(formatSlot(iso, 'en')).toBe('Tuesday, November 17, 15:00 (Colombia time)');
  expect(formatSlot('not-a-date', 'es')).toBe('');
});

test('notice pushes the first slot to the next morning', () => {
  const slots = freeSlots(CFG, [], [], 15, MON_12);
  expect(slots[0]).toBe(new Date(Date.UTC(2026, 10, 10, 12, 0)).toISOString());
});

test('weekends and holidays are never offered', () => {
  const slots = freeSlots(CFG, [], [], 15, FRI_16);
  expect(slots.length).toBeGreaterThan(0);
  // Friday 16:00 + 12h notice lands on Saturday: the first slot is Tuesday,
  // because Monday Nov 16 is the shifted Cartagena holiday.
  expect(slots[0]).toBe(new Date(Date.UTC(2026, 10, 17, 12, 0)).toISOString());
  for (const s of slots) {
    const p = bogotaParts(Date.parse(s));
    expect(p.weekday).toBeGreaterThanOrEqual(1);
    expect(p.weekday).toBeLessThanOrEqual(5);
    expect(colombiaHolidays(p.year).has(bogotaDateKey(Date.parse(s)))).toBe(false);
  }
});

test('margin blocks the slots around a busy block', () => {
  const busy = [
    { start: new Date(Date.UTC(2026, 10, 10, 12, 0)).toISOString(), end: new Date(Date.UTC(2026, 10, 10, 13, 0)).toISOString() },
    { start: new Date(Date.UTC(2026, 10, 10, 20, 0)).toISOString(), end: new Date(Date.UTC(2026, 10, 10, 21, 0)).toISOString() },
  ];
  const slots = freeSlots(CFG, busy, [], 60, MON_12);
  // Morning window fully covered; evening opens at 16:15 Bogota (margin past 16:00).
  expect(slots[0]).toBe(new Date(Date.UTC(2026, 10, 10, 21, 15)).toISOString());
});

test('workbench events block like primary busy time', () => {
  const wb = [
    { start: new Date(Date.UTC(2026, 10, 10, 12, 0)).toISOString(), end: new Date(Date.UTC(2026, 10, 10, 13, 0)).toISOString() },
  ];
  const viaBusy = freeSlots(CFG, wb, [], 15, MON_12);
  const viaEvents = freeSlots(CFG, [], wb, 15, MON_12);
  expect(viaEvents).toEqual(viaBusy);
  // The 15-minute margin around the 07:00-08:00 block rules out the whole
  // morning window, so the day opens at 15:00 Bogota.
  expect(viaEvents[0]).toBe(new Date(Date.UTC(2026, 10, 10, 20, 0)).toISOString());
});

test('at most maxPerDay slots per day within the horizon', () => {
  const slots = freeSlots(CFG, [], [], 15, MON_12);
  const latest = MON_12 + 14 * 86400000;
  const perDay = new Map<string, number>();
  for (const s of slots) {
    const ms = Date.parse(s);
    expect(ms).toBeGreaterThanOrEqual(MON_12 + 12 * 3600000);
    expect(ms).toBeLessThanOrEqual(latest);
    const key = bogotaDateKey(ms);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  for (const count of perDay.values()) expect(count).toBeLessThanOrEqual(3);
  expect(perDay.get('2026-11-10')).toBe(3);
  expect(perDay.get('2026-11-16') ?? 0).toBe(0);
  expect(perDay.get('2026-11-23')).toBe(2);
});

test('a 60-minute service never overflows its window', () => {
  const slots = freeSlots(CFG, [], [], 60, MON_12);
  for (const s of slots) {
    const p = bogotaParts(Date.parse(s));
    const startMin = p.hour * 60 + p.minute;
    const inWindow = CFG.windows.some(([ws, we]) => startMin >= ws * 60 && startMin + 60 <= we * 60);
    expect(inWindow).toBe(true);
  }
});
