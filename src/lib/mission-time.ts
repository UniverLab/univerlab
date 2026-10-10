/** Shared Mission-Log time helpers.
 *  The Sol day-of-year algorithm intentionally matches the status page's
 *  historic `formatDate`: UTC clock for HH:MM, but day-of-year from a
 *  local-midnight epoch (`new Date(y, 0, 0)`). Do not "fix" to pure UTC —
 *  log timestamps and roadmap Sol numbers must never drift apart.
 */
export function solDayOfYear(iso: string): number {
  const d = new Date(iso);
  const y = d.getFullYear();
  const start = new Date(y, 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

export function formatSolLabel(iso: string): string {
  return 'Sol ' + solDayOfYear(iso);
}

/** Full TERRA label used by the Mission Log and the roadmap DONE meta. */
export function formatMissionDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const sol = solDayOfYear(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return 'TERRA ' + y + ' \u00b7 Sol ' + sol + ' \u00b7 ' + hh + ':' + mm + ' UTC';
}

/** Sol of an experiment's registry startDate (local-midnight parse, same as the genesis line). The plate's "Sol n since startDate". */
export function startSolLabel(startDate: string): string {
  return formatSolLabel(startDate + 'T00:00:00');
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** The calendar day the existing algorithm labels as that Sol: local midnight,
 *  Sol 1 = 1 January. Throws for a Sol outside the year's length. */
export function solToDate(year: number, sol: number): Date {
  const maxSol = isLeapYear(year) ? 366 : 365;
  if (sol < 1 || sol > maxSol) {
    throw new RangeError(`Sol ${sol} is out of range for ${year} (1–${maxSol})`);
  }
  return new Date(year, 0, sol);
}

/** Parse a mission date (TERRA/Sol) string, or null when it is not one.
 *  Accepts, case-insensitively and with any of · / - / spaces as separators:
 *  `TERRA 2026 · Sol 282 · 14:00 UTC`, `Terra 2026 Sol 282`,
 *  `Sol 282` (current year), `sol282`. */
export function parseMissionDate(
  input: string,
): { year: number; sol: number; utcTime?: string; date: Date } | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Compact form first: sol282 (current year, no separator).
  const compact = /^sol(\d{1,3})$/i.exec(trimmed);
  if (compact) {
    const sol = parseInt(compact[1], 10);
    const year = new Date().getFullYear();
    if (sol < 1 || sol > (isLeapYear(year) ? 366 : 365)) return null;
    return { year, sol, date: solToDate(year, sol) };
  }

  // Normalize separators: ·, -, and / become spaces, then collapse whitespace.
  const norm = trimmed.replace(/·/g, ' ').replace(/-/g, ' ').replace(/\//g, ' ').replace(/\s+/g, ' ').trim();

  // Full form: TERRA 2026 Sol 282 [14:00 UTC].
  const full = /^TERRA\s+(\d{4})\s+SOL\s+(\d{1,3})(?:\s+(\d{1,2}):(\d{2})\s+UTC)?$/i.exec(norm);
  if (full) {
    const year = parseInt(full[1], 10);
    const sol = parseInt(full[2], 10);
    if (sol < 1 || sol > (isLeapYear(year) ? 366 : 365)) return null;
    const utcTime = full[3] ? `${pad2(parseInt(full[3], 10))}:${full[4]}` : undefined;
    return { year, sol, utcTime, date: solToDate(year, sol) };
  }

  // Short form: Sol 282 (current year).
  const short = /^SOL\s+(\d{1,3})$/i.exec(norm);
  if (short) {
    const sol = parseInt(short[1], 10);
    const year = new Date().getFullYear();
    if (sol < 1 || sol > (isLeapYear(year) ? 366 : 365)) return null;
    return { year, sol, date: solToDate(year, sol) };
  }

  return null;
}

/** ISO date/datetime or Date → the mission label the site would print.
 *  A date-only input omits the time segment. */
export function toMissionDate(input: string | Date): string {
  if (input instanceof Date) return formatMissionDate(input.toISOString());
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return startSolLabel(trimmed);
  return formatMissionDate(trimmed);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Format a Date as a human calendar date in the page language, in the
 *  reader's own time zone. Adds a time and "(your time)" when known. */
function formatCalendar(date: Date, lang: 'en' | 'es', withTime: boolean): string {
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'full' };
  if (withTime) opts.timeStyle = 'short';
  const fmt = new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', opts);
  const cal = fmt.format(date);
  return withTime ? cal + (lang === 'es' ? ' (tu hora)' : ' (your time)') : cal;
}

/** Detect the direction and return both forms. */
export function translateMissionDate(
  input: string,
  lang: 'en' | 'es' = 'en',
):
  | { direction: 'to-calendar' | 'to-mission'; mission: string; iso: string; calendar: string }
  | { error: string } {
  // Direction 1: mission date → calendar.
  const parsed = parseMissionDate(input);
  if (parsed) {
    const { year, sol, utcTime, date } = parsed;
    const mission = utcTime
      ? `TERRA ${year} \u00b7 Sol ${sol} \u00b7 ${utcTime} UTC`
      : `TERRA ${year} \u00b7 Sol ${sol}`;
    const iso = utcTime ? `${isoDate(date)}T${utcTime}Z` : isoDate(date);
    const displayDate = utcTime
      ? new Date(Date.UTC(year, date.getMonth(), date.getDate(), ...utcTime.split(':').map(Number)))
      : date;
    const calendar = formatCalendar(displayDate, lang, !!utcTime);
    return { direction: 'to-calendar', mission, iso, calendar };
  }

  // Direction 2: ISO date/datetime → mission.
  if (typeof input !== 'string') {
    return { error: lang === 'es' ? 'Entrada no válida.' : 'Invalid input.' };
  }
  const trimmed = input.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const date = new Date(parseInt(dateOnly[1], 10), parseInt(dateOnly[2], 10) - 1, parseInt(dateOnly[3], 10));
    if (isNaN(date.getTime())) return { error: lang === 'es' ? 'Fecha no válida.' : 'Invalid date.' };
    return {
      direction: 'to-mission',
      mission: toMissionDate(trimmed),
      iso: trimmed,
      calendar: formatCalendar(date, lang, false),
    };
  }
  const dt = new Date(trimmed);
  if (!isNaN(dt.getTime())) {
    const iso = `${isoDate(dt)}T${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}Z`;
    return {
      direction: 'to-mission',
      mission: toMissionDate(trimmed),
      iso,
      calendar: formatCalendar(dt, lang, true),
    };
  }

  return {
    error:
      lang === 'es'
        ? 'No es una fecha de misión (TERRA/Sol) ni una fecha ISO.'
        : 'Not a mission date (TERRA/Sol) or ISO date.',
  };
}
