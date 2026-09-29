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
