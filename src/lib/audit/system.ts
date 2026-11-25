// Audit system names starting with `_` are never addressable: staging
// uploads (`_staging/<id>/audit.json`), temp prefixes and anything else
// parked under an underscore name must never be listed or served by any
// public, reader or panel route, whatever the stored document declares.

/** True when the audited-system name is internal and must stay hidden. */
export function isHiddenAuditSystem(system: string): boolean {
  return system.startsWith('_');
}
