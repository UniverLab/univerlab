import { SERVICE_LABEL } from './intake';
import { formatSlot } from './schedule';
import type { Lang } from './lang';

/**
 * One operator note body: a Spanish event line, the service and the slot in
 * Colombia time, then the brief or form detail where one exists.
 */
export function noteBody(
  event: string,
  service: string,
  slotIso: string,
  lang: Lang,
  detail?: string
): string {
  const label = SERVICE_LABEL.es[service] ?? service;
  const slot = formatSlot(slotIso, 'es') || slotIso;
  return event + '\n' + label + ' · ' + slot + (detail ? '\n' + detail : '');
}

/**
 * The unconfirmed-hold reminder for the operator: who, which service and
 * slot, when the hold releases, and the two commands that answer it.
 */
export function holdReminderText(name: string, service: string, slotIso: string, deadlineIso: string): string {
  const label = SERVICE_LABEL.es[service] ?? service;
  const slot = formatSlot(slotIso, 'es') || slotIso;
  const deadline = formatSlot(deadlineIso, 'es') || deadlineIso;
  return (
    'Recordatorio: [' + name + '] sin confirmar — ' + label + ' · ' + slot + '. Se libera ' + deadline + '. /confirm ' + name + ' o /reject ' + name + '.'
  );
}
