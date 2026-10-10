/**
 * Mission-date round-trip under two time zones (spec §6).
 *
 * @jest-environment node
 *
 * Node respects process.env.TZ at runtime (jsdom does not), so this file uses
 * the node environment and dynamically imports the module after setting TZ.
 */
describe('round-trip under TZ', () => {
  for (const tz of ['UTC', 'America/Bogota']) {
    describe(`TZ=${tz}`, () => {
      it('every day of 2026 at local noon round-trips', async () => {
        process.env.TZ = tz;
        const { solToDate, toMissionDate, parseMissionDate } = await import('../lib/mission-time');
        const max = (2026 % 4 === 0 && 2026 % 100 !== 0) || 2026 % 400 === 0 ? 366 : 365;
        for (let sol = 1; sol <= max; sol++) {
          const d = solToDate(2026, sol);
          const label = toMissionDate(d);
          const parsed = parseMissionDate(label);
          expect(parsed).not.toBeNull();
          expect(parsed!.date.getMonth()).toBe(d.getMonth());
          expect(parsed!.date.getDate()).toBe(d.getDate());
        }
      });

      it('datetime round-trips preserve calendar day', async () => {
        process.env.TZ = tz;
        const { toMissionDate, parseMissionDate } = await import('../lib/mission-time');
        for (const iso of ['2026-09-16T10:00:00Z', '2025-07-04T09:30:00Z']) {
          const label = toMissionDate(iso);
          const parsed = parseMissionDate(label);
          expect(parsed).not.toBeNull();
          const orig = new Date(iso);
          expect(parsed!.date.getMonth()).toBe(orig.getUTCMonth());
          expect(parsed!.date.getDate()).toBe(orig.getUTCDate());
        }
      });
    });
  }
});
