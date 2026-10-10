/**
 * Mission-date translator (DATE1) — round-trip, parse, solToDate, format pins.
 * The round-trip test is run under two time zones; set TZ before import.
 */
import {
  solToDate,
  parseMissionDate,
  toMissionDate,
  translateMissionDate,
  formatMissionDate,
  formatSolLabel,
  startSolLabel,
} from '../lib/mission-time';

// Literal expected strings — not computed from the code under test — so a
// refactor that drifts formatMissionDate/startSolLabel fails them. These are
// pinned for the CI timezone (America/Bogota, UTC-5) where the local-midnight
// Sol epoch places 2026-01-01T00:00Z on 2025-Dec-31 (Sol 365).
describe('formatMissionDate / formatSolLabel / startSolLabel pins', () => {
  it('formatMissionDate pins three known dates', () => {
    expect(formatMissionDate('2026-09-16T10:00:00Z')).toBe('TERRA 2026 · Sol 259 · 10:00 UTC');
    expect(formatMissionDate('2026-01-01T00:00:00Z')).toBe('TERRA 2025 · Sol 365 · 00:00 UTC');
    expect(formatMissionDate('2024-02-29T23:30:00Z')).toBe('TERRA 2024 · Sol 60 · 23:30 UTC');
  });

  it('startSolLabel pins three known dates', () => {
    expect(startSolLabel('2026-06-17')).toBe('Sol 168');
    expect(startSolLabel('2026-04-01')).toBe('Sol 91');
    expect(startSolLabel('2024-02-29')).toBe('Sol 60');
  });
});

describe('solToDate', () => {
  it('Sol 1 is 1 January', () => {
    expect(solToDate(2026, 1)).toEqual(new Date(2026, 0, 1));
  });

  it('Sol 282 of 2026 is 9 October', () => {
    expect(solToDate(2026, 282)).toEqual(new Date(2026, 9, 9));
  });

  it('leap day: Sol 366 of 2024 is 31 December', () => {
    expect(solToDate(2024, 366)).toEqual(new Date(2024, 11, 31));
  });

  it('throws for Sol 0', () => {
    expect(() => solToDate(2026, 0)).toThrow(RangeError);
  });

  it('throws for Sol 367', () => {
    expect(() => solToDate(2026, 367)).toThrow(RangeError);
  });

  it('throws for Sol 366 of a non-leap year', () => {
    expect(() => solToDate(2026, 366)).toThrow(RangeError);
  });
});

describe('parseMissionDate', () => {
  it('parses the full label with time', () => {
    const r = parseMissionDate('TERRA 2026 · Sol 282 · 14:00 UTC');
    expect(r).not.toBeNull();
    expect(r!.year).toBe(2026);
    expect(r!.sol).toBe(282);
    expect(r!.utcTime).toBe('14:00');
    expect(r!.date).toEqual(new Date(2026, 9, 9));
  });

  it('parses the full label with dash separators', () => {
    const r = parseMissionDate('TERRA-2026-Sol-282-14:00-UTC');
    expect(r).not.toBeNull();
    expect(r!.sol).toBe(282);
    expect(r!.utcTime).toBe('14:00');
  });

  it('parses the full label with slash separators', () => {
    const r = parseMissionDate('TERRA 2026 / Sol 282 / 14:00 UTC');
    expect(r).not.toBeNull();
    expect(r!.sol).toBe(282);
    expect(r!.utcTime).toBe('14:00');
  });

  it('parses Terra year Sol without time', () => {
    const r = parseMissionDate('Terra 2026 Sol 282');
    expect(r).not.toBeNull();
    expect(r!.year).toBe(2026);
    expect(r!.sol).toBe(282);
    expect(r!.utcTime).toBeUndefined();
  });

  it('parses Sol N (current year)', () => {
    const r = parseMissionDate('Sol 282');
    expect(r).not.toBeNull();
    expect(r!.sol).toBe(282);
    expect(r!.year).toBe(new Date().getFullYear());
  });

  it('parses the compact solN form', () => {
    const r = parseMissionDate('sol282');
    expect(r).not.toBeNull();
    expect(r!.sol).toBe(282);
  });

  it('is case-insensitive', () => {
    const r = parseMissionDate('terra 2026 sol 282 · 14:00 utc');
    expect(r).not.toBeNull();
    expect(r!.sol).toBe(282);
  });

  it('rejects garbage', () => {
    expect(parseMissionDate('hello world')).toBeNull();
  });

  it('rejects Sol 0', () => {
    expect(parseMissionDate('Sol 0')).toBeNull();
  });

  it('rejects Sol 367', () => {
    expect(parseMissionDate('Sol 367')).toBeNull();
  });
});

describe('toMissionDate', () => {
  it('date-only omits the time segment', () => {
    expect(toMissionDate('2026-10-09')).toBe('Sol 282');
  });

  it('datetime includes the time segment', () => {
    expect(toMissionDate('2026-10-09T14:00Z')).toBe('TERRA 2026 · Sol 282 · 14:00 UTC');
  });

  it('accepts a Date (UTC instant)', () => {
    const d = new Date(Date.UTC(2026, 9, 9, 14, 0, 0));
    expect(toMissionDate(d)).toBe('TERRA 2026 · Sol 282 · 14:00 UTC');
  });
});

describe('round-trip toMissionDate → parseMissionDate', () => {
  // date-only toMissionDate returns "Sol N" (no year); parseMissionDate pins the
  // current year, so the round-trip is asserted on calendar day (month + date).
  it('every day of 2025 round-trips to the same calendar day', () => {
    for (let sol = 1; sol <= 365; sol++) {
      const d = solToDate(2025, sol);
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const label = toMissionDate(iso);
      const parsed = parseMissionDate(label);
      expect(parsed).not.toBeNull();
      expect(parsed!.date.getMonth()).toBe(d.getMonth());
      expect(parsed!.date.getDate()).toBe(d.getDate());
    }
  });

  it('every day of 2026 round-trips to the same calendar day', () => {
    const max = (2026 % 4 === 0 && 2026 % 100 !== 0) || 2026 % 400 === 0 ? 366 : 365;
    for (let sol = 1; sol <= max; sol++) {
      const d = solToDate(2026, sol);
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const label = toMissionDate(iso);
      const parsed = parseMissionDate(label);
      expect(parsed).not.toBeNull();
      expect(parsed!.date.getMonth()).toBe(d.getMonth());
      expect(parsed!.date.getDate()).toBe(d.getDate());
    }
  });

  it('datetime round-trips preserve year, month and day', () => {
    for (const iso of ['2026-01-15T12:00:00Z', '2025-07-04T09:30:00Z', '2024-12-31T23:59:00Z']) {
      const label = toMissionDate(iso);
      const parsed = parseMissionDate(label);
      expect(parsed).not.toBeNull();
      const orig = new Date(iso);
      expect(parsed!.date.getMonth()).toBe(orig.getUTCMonth());
      expect(parsed!.date.getDate()).toBe(orig.getUTCDate());
    }
  });
});

// TZ-dependence is covered by src/__tests__/mission-date-tz.test.ts, which runs
// under @jest-environment node so process.env.TZ takes effect at runtime.

describe('translateMissionDate', () => {
  it('to-calendar from a full mission date', () => {
    const r = translateMissionDate('TERRA 2026 · Sol 282 · 14:00 UTC', 'en') as any;
    expect(r.direction).toBe('to-calendar');
    expect(r.mission).toContain('TERRA 2026 · Sol 282');
    expect(r.iso).toBe('2026-10-09T14:00Z');
    expect(r.calendar).toContain('2026');
    expect(r.calendar).toContain('(your time)');
  });

  it('to-calendar from Sol N without time has no time in calendar', () => {
    const r = translateMissionDate('Sol 282', 'en') as any;
    expect(r.direction).toBe('to-calendar');
    expect(r.iso).toBe('2026-10-09');
    expect(r.calendar).not.toContain('(your time)');
  });

  it('to-mission from an ISO date', () => {
    const r = translateMissionDate('2026-10-09', 'en') as any;
    expect(r.direction).toBe('to-mission');
    expect(r.mission).toContain('Sol 282');
    expect(r.iso).toBe('2026-10-09');
  });

  it('to-mission from an ISO datetime', () => {
    const r = translateMissionDate('2026-10-09T14:00Z', 'en') as any;
    expect(r.direction).toBe('to-mission');
    expect(r.mission).toContain('TERRA 2026 · Sol 282');
    expect(r.calendar).toContain('(your time)');
  });

  it('localizes to Spanish', () => {
    const r = translateMissionDate('Sol 282', 'es') as any;
    expect(r.calendar).toContain('2026');
  });

  it('returns an error for unrecognised input', () => {
    const r = translateMissionDate('not a date', 'en') as any;
    expect(r.error).toBeDefined();
  });
});
