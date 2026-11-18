import type { BookingConfig } from './schedule';
import type { Lang } from './lang';

/** Service labels in both languages. Mirror of the WhatsApp intake map:
 *  the calendar summary carries the client's language and the digest
 *  folds every label back to the Spanish one, so both sides must agree.
 */
export const SERVICE_LABEL: Record<Lang, Record<string, string>> = {
  es: {
    'first-call': 'Primera llamada',
    consultation: 'Consultoría',
    'audit-flow': 'Auditoría/flujo',
    delivery: 'Entrega de auditoría',
    other: 'Otro',
  },
  en: {
    'first-call': 'First call',
    consultation: 'Consultation',
    'audit-flow': 'Audit/flow',
    delivery: 'Delivery session',
    other: 'Other',
  },
};

/** A delivery runs the consultation length: every other service is 15 minutes.
 *  Mirror of the WhatsApp booking helper: the owner quotes and reserves
 *  with the same lengths, so the two sides never disagree on durations.
 */
export function minutesFor(service: string): number {
  return service === 'consultation' || service === 'delivery' ? 60 : 15;
}

/** Full per-language payment sentence for the hold message. Mirror of the
 *  WhatsApp booking helper: the owner answers it, so a deploy-variable
 *  change reaches the agent without redeploying it.
 */
export function paymentsText(cfg: BookingConfig, lang: Lang, phone = ''): string {
  return cfg.payments?.[lang] ?? (phone.replace(/\D/g, '').startsWith('57') ? 'Bre-B' : 'PayPal');
}

/**
 * A conversation's short name from a client name or a web booking email:
 * lowercase, without accents, spaces as hyphens, at most 16 characters.
 * Mirror of the WhatsApp registry helper: the web-note name the booking
 * worker reports must read exactly like the one the agent would register.
 */
export function nameBase(raw: string): string {
  const emailLocal = raw.includes('@') ? raw.split('@')[0] : raw;
  const base = emailLocal
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-')
    .slice(0, 16)
    .replace(/^-+|-+$/g, '');
  return base || 'cliente';
}
