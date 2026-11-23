import { daysFromSlots, fetchSlots, monthBounds, shiftMonth } from '../lib/book-client';

const okJson = (body: unknown) =>
  (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;

describe('booking calendar helpers', () => {
  it('monthBounds ignores malformed keys and returns null with no valid day', () => {
    expect(monthBounds({})).toBeNull();
    expect(monthBounds({ 'not-a-day': { hasRoom: true } })).toBeNull();
    expect(monthBounds({ '2026-12-02': { hasRoom: true }, '2026-11-30': { hasRoom: false } })).toEqual({
      min: '2026-11',
      max: '2026-12',
    });
  });

  it('shiftMonth crosses year boundaries both ways', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('daysFromSlots keys valid starts by Bogota day and skips invalid ones', () => {
    // 04:30 UTC on the 25th is still the 24th in Bogota (UTC-5).
    expect(daysFromSlots(['2026-11-25T04:30:00.000Z', 'nonsense'])).toEqual({ '2026-11-24': { hasRoom: true } });
  });

  it('fetchSlots keeps a well-formed room map and drops malformed entries', async () => {
    const res = await fetchSlots(
      'https://b.example',
      okJson({
        ok: true,
        slots: ['2026-11-24T12:00:00.000Z', 7],
        days: { '2026-11-24': { hasRoom: true }, '2026-11-25': { hasRoom: 'yes' }, bad: { hasRoom: true }, '2026-11-26': null },
      }),
    );
    expect(res).toEqual({
      ok: true,
      slots: ['2026-11-24T12:00:00.000Z'],
      days: { '2026-11-24': { hasRoom: true }, '2026-11-25': { hasRoom: false } },
    });
  });

  it('fetchSlots falls back to no room map when days is absent or not an object', async () => {
    for (const days of [undefined, [], 'x']) {
      const res = await fetchSlots('https://b.example', okJson({ ok: true, slots: [], days }));
      expect(res).toEqual({ ok: true, slots: [] });
    }
  });

  it('fetchSlots reports unavailable on a bad payload or status, and network on a throw', async () => {
    expect(await fetchSlots('https://b.example', okJson({ ok: false }))).toEqual({ ok: false, reason: 'unavailable' });
    const notOk = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchSlots('https://b.example', notOk)).toEqual({ ok: false, reason: 'unavailable' });
    const boom = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    expect(await fetchSlots('https://b.example', boom)).toEqual({ ok: false, reason: 'network' });
  });
});
