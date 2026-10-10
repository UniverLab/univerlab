/**
 * Mission-date round-trip under two time zones (spec §6).
 *
 * @jest-environment node
 *
 * The naive approach — `process.env.TZ = 'UTC'` inside a jest test — does not
 * work: a jest worker's V8 isolate caches its time zone at start-up, so the
 * assignment never reaches `Date` and the "TZ=UTC" half silently runs with the
 * machine's zone. (That trap is real: it is how this file first shipped.) So
 * each zone gets a fresh `node` child, started with TZ in its environment
 * before it imports the module — the spec's "process.env.TZ set before
 * import", in the only form that is honest. Node ≥ 23.6 strips the module's
 * types natively, so the child imports the real `mission-time.ts`, not a copy.
 *
 * CI pins Node 24 (`.github/workflows/ci.yml`), which is why native type
 * stripping can be relied on here.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const MODULE_PATH = resolve(__dirname, '../lib/mission-time.ts');

/** What one child run prints as a single JSON line on stdout. */
interface ChildResult {
  /** The documented local-midnight epoch quirk, per zone — proves the child
   *  really runs under the requested TZ, not the worker's. */
  quirk: string;
  /** Round-trip days verified per year (365 / 366). */
  days: Record<string, number>;
}

/** The verification script a child runs: both years, every day, at local noon. */
const CHILD_SCRIPT = `
const { solToDate, toMissionDate, parseMissionDate, formatMissionDate } = await import(process.argv[1]);
const daysInYear = (y) => Math.round((Date.UTC(y + 1, 0, 0) - Date.UTC(y, 0, 0)) / 86400000);
const days = {};
for (const year of [2025, 2026]) {
  let checked = 0;
  for (let sol = 1; sol <= daysInYear(year); sol++) {
    const midnight = solToDate(year, sol);
    const noon = new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate(), 12, 0, 0);
    const label = toMissionDate(noon);
    const parsed = parseMissionDate(label);
    if (!parsed) throw new Error(year + ' Sol ' + sol + ': unparsed ' + JSON.stringify(label));
    if (parsed.date.getFullYear() !== noon.getFullYear() ||
        parsed.date.getMonth() !== noon.getMonth() ||
        parsed.date.getDate() !== noon.getDate()) {
      throw new Error(year + ' Sol ' + sol + ': ' + label + ' → ' + parsed.date.toISOString());
    }
    checked++;
  }
  days[year] = checked;
}
// Datetimes too: the label's instant must survive the round trip.
for (const iso of ['2026-09-16T10:00:00Z', '2025-07-04T09:30:00Z']) {
  const parsed = parseMissionDate(toMissionDate(iso));
  const orig = new Date(iso);
  if (!parsed || parsed.date.getMonth() !== orig.getUTCMonth() || parsed.date.getDate() !== orig.getUTCDate()) {
    throw new Error('datetime round-trip failed for ' + iso);
  }
}
process.stdout.write(JSON.stringify({ quirk: formatMissionDate('2026-01-01T00:00:00Z'), days }) + '\\n');
`;

describe('round-trip under TZ', () => {
  for (const tz of ['UTC', 'America/Bogota']) {
    it(`every day of 2025 and 2026 at local noon round-trips (TZ=${tz})`, () => {
      const stdout = execFileSync(process.execPath, ['-e', CHILD_SCRIPT, MODULE_PATH], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf-8',
        timeout: 60000,
      });
      const result = JSON.parse(stdout.trim()) as ChildResult;

      // The zone really applied: the year-boundary instant 2026-01-01T00:00Z
      // is Sol 365 of 2025 in Bogotá (UTC-5) but Sol 1 of 2026 in UTC — the
      // documented local-midnight epoch quirk, pinned per zone.
      expect(result.quirk).toBe(
        tz === 'UTC' ? 'TERRA 2026 · Sol 1 · 00:00 UTC' : 'TERRA 2025 · Sol 365 · 00:00 UTC',
      );

      // Both years, every day (2026 is not a leap year — no Sol 366).
      expect(result.days).toEqual({ '2025': 365, '2026': 365 });
    });
  }
});
