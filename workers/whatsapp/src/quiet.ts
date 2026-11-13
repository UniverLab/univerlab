import { en } from '../../../src/i18n/en.ts';
import { es } from '../../../src/i18n/es.ts';
import { bogotaParts, bogotaToUtcMs, colombiaHolidays } from './schedule';
import { formatNote } from './registry';
import type { GuardConfig } from './guard';
import type { Lang } from './lang';

const DAY_MS = 86400000;

/** Bogota wall-clock hour of a timestamp. */
function bogotaHour(nowMs: number): number {
  return bogotaParts(nowMs).hour;
}

/**
 * Whether the operator is out for the night: the Bogota hour is inside
 * [quietStart, 24) + [0, quietEnd). Defaults (19, 7) wrap midnight.
 */
export function isQuietHour(nowMs: number, cfg: Pick<GuardConfig, 'quietStart' | 'quietEnd'>): boolean {
  const hour = bogotaHour(nowMs);
  if (cfg.quietStart <= cfg.quietEnd) return hour >= cfg.quietStart && hour < cfg.quietEnd;
  return hour >= cfg.quietStart || hour < cfg.quietEnd;
}

/**
 * Next quiet-end instant (07:00 Bogota by default) strictly after now.
 * Quiet hours end every day; business days only shape the client notice.
 */
export function nextQuietEnd(nowMs: number, cfg: Pick<GuardConfig, 'quietEnd'>): number {
  const p = bogotaParts(nowMs);
  const today = bogotaToUtcMs(p.year, p.month, p.day, cfg.quietEnd, 0);
  if (today > nowMs) return today;
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day) + DAY_MS);
  return bogotaToUtcMs(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), cfg.quietEnd, 0);
}

function bogotaKey(y: number, mo: number, d: number): string {
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/**
 * 07:00 Bogota on the next business day: a weekday that is not a Colombian
 * holiday, per the same calendar the booking windows use. From before 07:00
 * on a business day that is today; otherwise the next one after it.
 */
export function nextBusinessMorning(nowMs: number): number {
  const holidays = new Map<number, Set<string>>();
  const isHoliday = (y: number, key: string): boolean => {
    let set = holidays.get(y);
    if (!set) {
      set = colombiaHolidays(y);
      holidays.set(y, set);
    }
    return set.has(key);
  };
  const start = bogotaParts(nowMs);
  const startDay = Date.UTC(start.year, start.month - 1, start.day);
  for (let day = 0; day <= 10; day++) {
    const base = new Date(startDay + day * DAY_MS);
    const y = base.getUTCFullYear();
    const mo = base.getUTCMonth() + 1;
    const d = base.getUTCDate();
    const weekday = base.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (isHoliday(y, bogotaKey(y, mo, d))) continue;
    const cand = bogotaToUtcMs(y, mo, d, 7, 0);
    if (cand > nowMs) return cand;
  }
  const far = new Date(startDay + 10 * DAY_MS);
  return bogotaToUtcMs(far.getUTCFullYear(), far.getUTCMonth() + 1, far.getUTCDate(), 7, 0);
}

/** What a client asking for a person hears while the operator is away. */
export function awayNotice(lang: Lang, dateStr: string): string {
  const dict = lang === 'en' ? en : es;
  return dict.wa.quiet.awayNotice.replace('{date}', dateStr);
}

export interface HeldNote {
  name: string;
  text: string;
  tag: string;
  priority: 'high' | 'normal' | 'low';
}

/**
 * One summary of held notes: oldest first, grouped by conversation in
 * first-seen order, then the names with a high-priority note still
 * needing an operator action.
 */
export function formatHeldSummary(notes: HeldNote[], lang: Lang = 'es'): string {
  const dict = lang === 'en' ? en : es;
  const lines = [dict.wa.quiet.heldHeader];
  const seen: string[] = [];
  const byName = new Map<string, HeldNote[]>();
  for (const n of notes) {
    const group = byName.get(n.name);
    if (group) {
      group.push(n);
    } else {
      byName.set(n.name, [n]);
      seen.push(n.name);
    }
  }
  for (const name of seen) {
    const group = byName.get(name);
    if (!group) continue;
    for (const n of group) {
      lines.push(formatNote(n.name, n.text, n.tag, n.priority));
    }
  }
  const pending = seen.filter((name) => (byName.get(name) ?? []).some((n) => n.priority === 'high'));
  if (pending.length > 0) {
    lines.push(dict.wa.quiet.pendingLine + ' ' + pending.join(', '));
  }
  return lines.join('\n');
}
