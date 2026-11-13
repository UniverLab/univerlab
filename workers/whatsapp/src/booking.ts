import { runModel, type ModelConfig } from './brain';
import { DATA_LABEL, DATA_RULES } from './prompt';
import { SERVICE_LABEL } from './intake';
import type { Lang } from './lang';
import type { BookingConfig } from './schedule';

export type BookingService = 'first-call' | 'consultation';
export type BookingPhase = 'offered' | 'held' | 'booked';

export interface BookingState {
  service: BookingService;
  lang: Lang;
  /** UTC ISO slot starts currently offered (or the booked one). */
  offered: string[];
  phase: BookingPhase;
  eventId?: string;
  /** UTC ISO start of the booked/held event. */
  start?: string;
  /** Epoch ms when the hold was created (24-hour expiry counts from here). */
  createdAt: number;
  phone: string;
  name: string;
  brief: string[];
  /** The vision model's reading of the client's payment proof, if any. */
  proof?: PaymentProof;
}

/** What the vision model extracted from a payment receipt. The agent
 *  never confirms a payment by itself: this only briefs the operator. */
export interface PaymentProof {
  /** False when the model returned nothing usable. */
  readable: boolean;
  amount: number | null;
  currency: string;
  date: string;
  method: string;
  reference: string;
  payee: string;
  /** '' when the proof matches, else one of unreadable, no-amount,
   *  bad-currency, amount-mismatch, payee-mismatch. */
  flag: string;
}

export const OFFER: Record<Lang, string> = {
  es: 'Tengo estos espacios libres (hora Colombia):\n{slots}\nResponde con el número del que prefieras, o dime otro día si ninguno te sirve.',
  en: 'These are the closest free slots (Colombia time):\n{slots}\nReply with the number you prefer, or tell me another day if none works.',
};

export const PICKED: Record<Lang, string> = {
  es: 'Listo, te agendé {service}: {slot}. Te escribo por aquí si algo cambia.',
  en: 'Done, I booked your {service}: {slot}. I will write here if anything changes.',
};

export const HOLD_SENT: Record<Lang, string> = {
  es: 'Te aparté el espacio del {slot}. Para confirmarlo paga por {payments} y avísame por aquí con el comprobante: el espacio queda tuyo al verificar el pago. Si no se confirma en 24 horas, el apartado se libera.',
  en: 'I held the slot on {slot} for you. To confirm it pay via {payments} and send me the receipt here: the slot is yours once the payment is checked. If it is not confirmed within 24 hours, the hold is released.',
};

export const EXPIRED: Record<Lang, string> = {
  es: 'Tu apartado venció sin confirmarse y liberé el espacio. Si quieres, dime y buscamos otro.',
  en: 'Your hold expired unconfirmed and I released the slot. If you like, tell me and we will find another one.',
};

export const CONFIRMED: Record<Lang, string> = {
  es: 'Tu sesión del {slot} quedó confirmada. ¡Nos vemos entonces!',
  en: 'Your session on {slot} is confirmed. See you then!',
};

export const CANCELLED: Record<Lang, string> = {
  es: 'Listo, cancelé tu {service} del {slot}. Si habías pagado, una persona del laboratorio te escribe por aquí para darte un nuevo espacio o devolverte el dinero.',
  en: 'Done, I cancelled your {service} on {slot}. If you had paid, someone from the lab will write here to give you a new slot or refund you.',
};

/** A paid consultation starting in under 24 hours can be moved once, not refunded. */
export const MOVE_ONCE: Record<Lang, string> = {
  es: 'Esa sesión empieza en menos de 24 horas, así que ya no se puede reembolsar, pero la puedo mover una vez sin costo. ',
  en: 'That session starts in less than 24 hours, so it can no longer be refunded, but I can move it once at no cost. ',
};

export const CALENDAR_DOWN: Record<Lang, string> = {
  es: 'Perdona, la agenda no responde ahora mismo y no dejé nada agendado. Ya le pasé tu caso a una persona del laboratorio con tus notas y te escribe por aquí.',
  en: 'Sorry, the calendar is not responding right now and I booked nothing. I already passed your case to someone at the lab with your notes and they will write here.',
};

export function paymentText(cfg: BookingConfig, lang: Lang, phone = ''): string {
  return cfg.payments?.[lang] ?? (phone.replace(/\D/g, '').startsWith('57') ? 'Bre-B' : 'PayPal');
}

export function serviceLabel(lang: Lang, service: BookingService): string {
  return SERVICE_LABEL[lang][service] ?? service;
}

export function renderBooking(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const key of Object.keys(vars)) {
    out = out.split('{' + key + '}').join(vars[key]);
  }
  return out;
}

/** Numbered offer lines followed by the OFFER template. */
export function offerText(lang: Lang, slots: string[]): string {
  const lines = slots.map((s, i) => i + 1 + ') ' + s).join('\n');
  return renderBooking(OFFER[lang], { slots: lines });
}

export type BookingAction = 'pick' | 'cancel' | 'move' | 'day' | 'other';

export interface DecideInput {
  lang: Lang;
  service: BookingService;
  phase: BookingPhase;
  /** Human-readable offered slots (Colombia time), 1-based for the client. */
  offered: string[];
  /** Today as a Bogota YYYY-MM-DD date, to resolve "tomorrow", "Monday", ... */
  today: string;
  /** Booking horizon in days; a resolved date must stay inside it. */
  horizonDays?: number;
  eventStart?: string;
}

export interface DecideResult {
  action: BookingAction;
  /** 1-based slot number from the offered list; -1 when none applies. */
  slot: number;
  /** Requested day as Bogota YYYY-MM-DD; '' when none applies. */
  date: string;
}

const DECIDE_FALLBACK: DecideResult = { action: 'other', slot: -1, date: '' };

function decidePrompt(input: DecideInput): string {
  const langName = input.lang === 'es' ? 'Spanish' : 'English';
  const numbered = input.offered.map((s, i) => (i + 1) + ') ' + s).join('\n') || '(none)';
  const existing =
    input.phase === 'offered'
      ? 'No slot booked yet.'
      : 'Booked slot: ' + (input.eventStart ?? '(unknown)') + ' (' + input.phase + ').';
  return (
    'You are routing the latest client message inside an active Workbench booking chat (UniverLab, WhatsApp).\n' +
    'The client writes in ' + langName + '; your output is JSON only, never chat text.\n' +
    'Today is ' + input.today + ' in America/Bogota. Service: ' + input.service + '. ' + existing + '\n' +
    'Offered slots (Colombia time), numbered:\n' + numbered + '\n' +
    'Classify the latest message:\n' +
    '- "pick" when the client chooses one of the numbered offered slots (a number, "the first one", "that one", "sí/yes" to a single offer). Name its 1-based number in "slot".\n' +
    '- "cancel" when the client wants to cancel the booking.\n' +
    '- "move" when the client wants to change an already booked or held slot to another time.\n' +
    '- "day" when the client asks for another day (a date, "tomorrow", "next Monday"...). Resolve it against today and put the Bogota YYYY-MM-DD date in "date"; when no day can be resolved use "date": "" and we re-offer nearby slots.\n' +
    '- "other" for anything else (questions, payment proofs, chatting).\n' +
    'Output exactly one JSON object and nothing else: {"action": "pick"|"cancel"|"move"|"day"|"other", "slot": <1-based number or -1>, "date": "<YYYY-MM-DD or empty string>"}\n' +
    DATA_RULES +
    '\n' +
    'The DATA message carries the latest client message.'
  );
}

const DAY_MS = 86400000;

/** Bogota YYYY-MM-DD key `days` after `key`; '' when either is unparseable. */
function addDays(key: string, days: number): string {
  const ms = Date.parse(key + 'T00:00:00Z');
  if (!Number.isFinite(ms)) return '';
  const t = new Date(ms + days * DAY_MS);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
}

export function parseDecide(
  raw: string,
  offeredCount?: number,
  today?: string,
  horizonDays?: number
): DecideResult {
  try {
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) throw new Error('no-json');
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bad-shape');
    const { action, slot, date } = parsed as {
      action?: unknown;
      slot?: unknown;
      date?: unknown;
    };
    if (action !== 'pick' && action !== 'cancel' && action !== 'move' && action !== 'day' && action !== 'other') {
      throw new Error('bad-action');
    }
    let slotNum = typeof slot === 'number' && Number.isFinite(slot) ? Math.floor(slot) : -1;
    // A pick outside the offered list is no pick.
    if (offeredCount !== undefined && !(slotNum >= 1 && slotNum <= offeredCount)) slotNum = -1;
    let day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
    // A resolved day must be today or later and inside the booking horizon.
    if (today !== undefined && day !== '') {
      const latest = addDays(today, horizonDays ?? 14);
      if (!(day >= today && (latest === '' || day <= latest))) day = '';
    }
    return { action, slot: slotNum, date: day };
  } catch {
    return { ...DECIDE_FALLBACK };
  }
}

export async function decide(
  ai: { run(model: string, input: unknown): Promise<unknown> },
  cfg: ModelConfig,
  input: DecideInput,
  latest: string
): Promise<DecideResult> {
  try {
    const raw = await runModel(
      ai,
      cfg,
      [
        { role: 'system', content: decidePrompt(input) },
        { role: 'user', content: DATA_LABEL + latest },
      ],
      400
    );
    return parseDecide(raw, input.offered.length, input.today, input.horizonDays);
  } catch {
    return { ...DECIDE_FALLBACK };
  }
}
