import type { Lang } from './lang';

/** Why a booking write was refused. `slot-taken` re-offers; the rest hand off. */
export type LimitReason =
  | 'existing'
  | 'free-limit'
  | 'expired-holds'
  | 'hold-cap'
  | 'day-cap'
  | 'moves'
  | 'slot-taken';

/** The deploy knobs `admit` reads; BookingConfig satisfies this shape. */
export interface LimitConfig {
  freeCallDays: number;
  expiredHoldDays: number;
  expiredHoldsMax: number;
  movesMax: number;
  openHoldsMax: number;
  bookingsPerDay: number;
}

export interface ContactState {
  /** An upcoming booking or hold is still active. */
  hasActive: boolean;
  /** Epoch ms of the last free first call, or null when never. */
  lastFreeCallMs: number | null;
  /** Epoch ms of each expired unpaid hold. */
  expiredHoldsMs: number[];
  /** Moves already used by the active booking. */
  moves: number;
}

export interface AdmitRequest {
  service: string;
  /** True for an unpaid consultation hold; false for a direct booking. */
  hold: boolean;
  /** True when moving the active booking instead of creating one. */
  move: boolean;
}

export type AdmitResult = { ok: true } | { ok: false; reason: LimitReason };

const DAY_MS = 86400000;

/**
 * Decide a booking write in code, never via the text model. Order matters:
 * the contact's own state first, then the global caps. A move replaces its
 * event, so it skips the caps that count new creations.
 */
export function admit(
  cfg: LimitConfig,
  now: number,
  contact: ContactState,
  openHolds: number,
  createdToday: number,
  request: AdmitRequest
): AdmitResult {
  if (!request.move && contact.hasActive) {
    return { ok: false, reason: 'existing' };
  }
  if (request.move && contact.moves >= cfg.movesMax) {
    return { ok: false, reason: 'moves' };
  }
  if (
    request.service === 'first-call' &&
    contact.lastFreeCallMs !== null &&
    now - contact.lastFreeCallMs < cfg.freeCallDays * DAY_MS
  ) {
    return { ok: false, reason: 'free-limit' };
  }
  if (request.hold && !request.move) {
    const recent = contact.expiredHoldsMs.filter((t) => now - t < cfg.expiredHoldDays * DAY_MS);
    if (recent.length >= cfg.expiredHoldsMax) {
      return { ok: false, reason: 'expired-holds' };
    }
    if (openHolds >= cfg.openHoldsMax) {
      return { ok: false, reason: 'hold-cap' };
    }
  }
  if (!request.move && createdToday >= cfg.bookingsPerDay) {
    return { ok: false, reason: 'day-cap' };
  }
  return { ok: true };
}

/** Fixed client wording per refusal, Spanish and English; no model call. */
export const LIMIT_TEXT: Record<Exclude<LimitReason, 'existing' | 'slot-taken'>, Record<Lang, string>> = {
  'free-limit': {
    es: 'Ya tuviste tu primera llamada gratuita en los últimos 90 días, así que no puedo agendarte otra gratis. Le pasé tu caso a una persona del laboratorio con tus notas y te escribe por aquí.',
    en: 'You already had your free first call in the last 90 days, so I cannot book another free one. I passed your case to someone at the lab with your notes and they will write to you here.',
  },
  'expired-holds': {
    es: 'Tus dos últimos apartados vencieron sin confirmarse, así que no puedo apartarte otro espacio. Le pasé tu caso a una persona del laboratorio con tus notas y te escribe por aquí.',
    en: 'Your last two holds expired unconfirmed, so I cannot hold another slot for you. I passed your case to someone at the lab with your notes and they will write to you here.',
  },
  'hold-cap': {
    es: 'Ahora mismo no quedan espacios para apartar. Una persona del laboratorio te va a asignar un horario y te escribe por aquí.',
    en: 'There are no hold slots left right now. Someone from the lab will arrange a time for you and will write to you here.',
  },
  'day-cap': {
    es: 'Por hoy ya se agendaron todos los cupos nuevos. Una persona del laboratorio te va a asignar un horario y te escribe por aquí.',
    en: 'All new booking slots for today are already taken. Someone from the lab will arrange a time for you and will write to you here.',
  },
  moves: {
    es: 'Ese espacio ya se movió dos veces, así que no puedo moverlo de nuevo. Le pasé tu caso a una persona del laboratorio con tus notas y te escribe por aquí.',
    en: 'That slot has already been moved twice, so I cannot move it again. I passed your case to someone at the lab with your notes and they will write to you here.',
  },
};

/** Fixed wording when the chosen slot was taken by another client. */
export const SLOT_TAKEN: Record<Lang, string> = {
  es: 'Ese espacio se acaba de ocupar. Estos son los que quedan libres:',
  en: 'That slot was just taken. These are the ones still free:',
};

/** Fixed wording pointing at the contact's existing booking; {slot} renders it. */
export const EXISTING: Record<Lang, string> = {
  es: 'Ya tienes un espacio reservado: {slot}. Si quieres moverlo o cancelarlo, dímelo por aquí.',
  en: 'You already have a reserved slot: {slot}. If you want to move or cancel it, tell me here.',
};

/**
 * Opaque contact key shared by every channel: WhatsApp uses the phone
 * digits, a second channel can use an email address as the contact id.
 */
export function contactKey(channel: string, id: string): string {
  const c = channel.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '') || 'x';
  return c + ':' + id.trim().toLowerCase();
}
