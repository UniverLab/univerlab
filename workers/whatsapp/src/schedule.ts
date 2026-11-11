import type { Lang } from './lang';

/** Bookable windows as [startHour, endHour) pairs in America/Bogota wall time. */
export interface BookingConfig {
  windows: Array<[number, number]>;
  marginMin: number;
  maxPerDay: number;
  noticeHours: number;
  horizonDays: number;
  /** Full per-language payment sentence used in the hold message. */
  payments?: { es: string; en: string };
  /** Expected recipient of the payment, matched against the receipt. */
  payee?: string;
}

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  windows: [
    [7, 8],
    [15, 19],
  ],
  marginMin: 15,
  maxPerDay: 3,
  noticeHours: 12,
  horizonDays: 14,
};

function validWindows(value: unknown): Array<[number, number]> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: Array<[number, number]> = [];
  for (const w of value) {
    if (!Array.isArray(w) || w.length !== 2) return null;
    const [s, e] = w as Array<unknown>;
    if (typeof s !== 'number' || typeof e !== 'number') return null;
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
    if (s < 0 || e > 24 || s >= e) return null;
    if (s % 0.25 !== 0 || e % 0.25 !== 0) return null;
    out.push([s, e]);
  }
  return out;
}

function validPositive(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Parse the BOOKING_CONFIG deploy variable; any missing or invalid field falls back. */
export function bookingConfig(env: { BOOKING_CONFIG?: string }): BookingConfig {
  const base: BookingConfig = {
    ...DEFAULT_BOOKING_CONFIG,
    windows: DEFAULT_BOOKING_CONFIG.windows.map((w) => [...w] as [number, number]),
  };
  const raw = env.BOOKING_CONFIG?.trim();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as {
      windows?: unknown;
      marginMin?: unknown;
      maxPerDay?: unknown;
      noticeHours?: unknown;
      horizonDays?: unknown;
      payments?: unknown;
      payee?: unknown;
    };
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return base;
    const windows = validWindows(parsed.windows);
    if (windows) base.windows = windows;
    const marginMin = validPositive(parsed.marginMin);
    if (marginMin !== null) base.marginMin = marginMin;
    const maxPerDay = validPositive(parsed.maxPerDay);
    if (maxPerDay !== null) base.maxPerDay = Math.floor(maxPerDay);
    const noticeHours = validPositive(parsed.noticeHours);
    if (noticeHours !== null) base.noticeHours = noticeHours;
    const horizonDays = validPositive(parsed.horizonDays);
    if (horizonDays !== null) base.horizonDays = Math.floor(horizonDays);
    const payments = parsed.payments as { es?: unknown; en?: unknown } | null | undefined;
    if (
      payments &&
      typeof payments === 'object' &&
      typeof payments.es === 'string' &&
      payments.es.trim() &&
      typeof payments.en === 'string' &&
      payments.en.trim()
    ) {
      base.payments = { es: payments.es.trim(), en: payments.en.trim() };
    }
    if (typeof parsed.payee === 'string' && parsed.payee.trim()) {
      base.payee = parsed.payee.trim();
    }
    return base;
  } catch {
    return base;
  }
}

const DAY_MS = 86400000;

/** Easter Sunday via the Anonymous Gregorian algorithm. Month is 1-based. */
function easterSunday(year: number): { y: number; m: number; d: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { y: year, m: month, d: day };
}

function keyOf(y: number, m: number, d: number): string {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/** Shift a date to the next Monday under the Emiliani rule (same day when already Monday). */
function emilianiNextMonday(y: number, m: number, d: number): string {
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const shift = (8 - weekday) % 7;
  const moved = new Date(Date.UTC(y, m - 1, d) + shift * DAY_MS);
  return keyOf(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/**
 * Colombian public holidays as Bogota calendar keys (YYYY-MM-DD):
 * fixed days, Emiliani Mondays, Holy Thursday/Friday, and Ascension,
 * Corpus Christi and Sagrado Corazón moved to the next Monday.
 */
export function colombiaHolidays(year: number): Set<string> {
  const out = new Set<string>();
  for (const [m, d] of [
    [1, 1],
    [5, 1],
    [7, 20],
    [8, 7],
    [12, 8],
    [12, 25],
  ] as Array<[number, number]>) {
    out.add(keyOf(year, m, d));
  }
  for (const [m, d] of [
    [1, 6],
    [3, 19],
    [6, 29],
    [8, 15],
    [10, 12],
    [11, 1],
    [11, 11],
  ] as Array<[number, number]>) {
    out.add(emilianiNextMonday(year, m, d));
  }
  const easter = easterSunday(year);
  const easterMs = Date.UTC(easter.y, easter.m - 1, easter.d);
  for (const offset of [-3, -2]) {
    const t = new Date(easterMs + offset * DAY_MS);
    out.add(keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()));
  }
  for (const offset of [39, 60, 68]) {
    const t = new Date(easterMs + offset * DAY_MS);
    out.add(
      emilianiNextMonday(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
    );
  }
  return out;
}

export interface BogotaParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday, 6 = Saturday. */
  weekday: number;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PARTS_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

/** Read a timestamp as an America/Bogota wall time; never touches the runtime zone. */
export function bogotaParts(ms: number): BogotaParts {
  const parts = PARTS_FORMAT.formatToParts(new Date(ms));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: WEEKDAY_SHORT.indexOf(get('weekday')),
  };
}

/**
 * Convert an America/Bogota wall time to epoch milliseconds.
 * Colombia stays at UTC-5 all year (no daylight saving).
 */
export function bogotaToUtcMs(y: number, mo: number, d: number, h: number, mi: number): number {
  return Date.UTC(y, mo - 1, d, h, mi) + 5 * 3600 * 1000;
}

/** Bogota calendar key (YYYY-MM-DD) of a timestamp. */
export function bogotaDateKey(ms: number): string {
  const p = bogotaParts(ms);
  return keyOf(p.year, p.month, p.day);
}

export interface BusyBlock {
  start: string;
  end: string;
}

function parseBlock(b: BusyBlock): [number, number] | null {
  const s = Date.parse(b.start);
  const e = Date.parse(b.end);
  if (Number.isNaN(s) || Number.isNaN(e) || s >= e) return null;
  return [s, e];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

/**
 * Free slot start times (UTC ISO) for a service of `minutes` length.
 * Candidates step every 15 minutes inside the configured windows, skip
 * weekends and Colombian holidays, require `noticeHours` of notice, stay
 * within `horizonDays`, keep `marginMin` from every busy block and every
 * already accepted same-day slot, and cap each day at `maxPerDay`.
 * `busy` is the primary calendar free/busy; `wbEvents` the Workbench
 * events (plain bookings and `[Por confirmar]` holds alike) over the same range.
 */
export function freeSlots(
  cfg: BookingConfig,
  busy: BusyBlock[],
  wbEvents: BusyBlock[],
  minutes: number,
  nowMs: number
): string[] {
  const blocks = [...busy, ...wbEvents].map(parseBlock).filter((b): b is [number, number] => b !== null);
  const marginMs = cfg.marginMin * 60000;
  const earliest = nowMs + cfg.noticeHours * 3600000;
  const latest = nowMs + cfg.horizonDays * DAY_MS;
  const accepted: number[] = [];
  const perDay = new Map<string, number>();
  const start = bogotaParts(nowMs);
  const startDay = Date.UTC(start.year, start.month - 1, start.day);
  const holidays = new Map<number, Set<string>>();

  const isHoliday = (y: number, key: string): boolean => {
    let set = holidays.get(y);
    if (!set) {
      set = colombiaHolidays(y);
      holidays.set(y, set);
    }
    return set.has(key);
  };

  for (let day = 0; day <= cfg.horizonDays; day++) {
    const base = new Date(startDay + day * DAY_MS);
    const y = base.getUTCFullYear();
    const mo = base.getUTCMonth() + 1;
    const d = base.getUTCDate();
    const weekday = base.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const key = keyOf(y, mo, d);
    if (isHoliday(y, key)) continue;
    dayLoop: for (const [ws, we] of cfg.windows) {
      for (let t = Math.round(ws * 60); t + minutes <= Math.round(we * 60); t += 15) {
        if ((perDay.get(key) ?? 0) >= cfg.maxPerDay) break dayLoop;
        const s = bogotaToUtcMs(y, mo, d, Math.floor(t / 60), t % 60);
        const e = s + minutes * 60000;
        if (s < earliest || s > latest) continue;
        if (blocks.some(([bs, be]) => overlaps(s - marginMs, e + marginMs, bs, be))) continue;
        if (accepted.some((a) => overlaps(s - marginMs, e + marginMs, a - marginMs, a + minutes * 60000))) continue;
        accepted.push(s);
        perDay.set(key, (perDay.get(key) ?? 0) + 1);
      }
    }
  }
  return accepted.map((ms) => new Date(ms).toISOString());
}

const WEEKDAYS: Record<Lang, string[]> = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

const MONTHS: Record<Lang, string[]> = {
  es: [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

/** Human-readable slot in Colombia time; returns '' for an unparseable input. */
export function formatSlot(iso: string, lang: Lang): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const p = bogotaParts(ms);
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  if (lang === 'es') {
    return (
      WEEKDAYS.es[p.weekday] + ' ' + p.day + ' de ' + MONTHS.es[p.month - 1] +
      ', ' + hh + ':' + mm + ' (hora Colombia)'
    );
  }
  return (
    WEEKDAYS.en[p.weekday] + ', ' + MONTHS.en[p.month - 1] + ' ' + p.day +
    ', ' + hh + ':' + mm + ' (Colombia time)'
  );
}
