import { en } from '../../../src/i18n/en.ts';
import { es } from '../../../src/i18n/es.ts';
import { runModel, type ModelConfig } from './brain';
import { isGuardOver } from './guard';
import { DATA_LABEL, DATA_RULES } from './prompt';
import type { Lang } from './lang';

/** Every reason a new topic can be classified into. Code decides what happens. */
export type Reason =
  | 'question'
  | 'first-call'
  | 'consultation'
  | 'flow'
  | 'audit'
  | 'my-booking'
  | 'payment'
  | 'support'
  | 'audit-fixes'
  | 'publish'
  | 'refund'
  | 'invoice'
  | 'complaint'
  | 'data-rights'
  | 'human'
  | 'open-source'
  | 'collab'
  | 'vendor'
  | 'off-topic'
  | 'audit-delivery';

export const REASONS: Reason[] = [
  'question',
  'first-call',
  'consultation',
  'flow',
  'audit',
  'my-booking',
  'payment',
  'support',
  'audit-fixes',
  'publish',
  'refund',
  'invoice',
  'complaint',
  'data-rights',
  'human',
  'open-source',
  'collab',
  'vendor',
  'off-topic',
  'audit-delivery',
];

/** Reasons that open a fixed-question capture and end in an operator note. */
export type CaptureReason =
  | 'support'
  | 'audit-fixes'
  | 'publish'
  | 'refund'
  | 'invoice'
  | 'complaint'
  | 'data-rights'
  | 'human'
  | 'collab'
  | 'audit-delivery';

export const CAPTURE_REASONS: CaptureReason[] = [
  'support',
  'audit-fixes',
  'publish',
  'refund',
  'invoice',
  'complaint',
  'data-rights',
  'human',
  'collab',
  'audit-delivery',
];

export function isCaptureReason(r: string): r is CaptureReason {
  return (CAPTURE_REASONS as string[]).includes(r);
}

export type Priority = 'high' | 'normal' | 'low';

export function priorityOf(reason: Reason | CaptureReason): Priority {
  if (reason === 'support' || reason === 'audit-fixes' || reason === 'complaint') return 'high';
  if (reason === 'collab') return 'low';
  return 'normal';
}

/** Operator-note tag per reason; null means the reason never writes a note. */
export const REASON_TAG: Record<Reason, string | null> = {
  question: null,
  'first-call': null,
  consultation: null,
  flow: 'FLUJO',
  audit: 'AUDITORÍA',
  'my-booking': null,
  payment: null,
  support: 'SOPORTE',
  'audit-fixes': 'VERIFICACIÓN',
  publish: 'PUBLICACIÓN',
  refund: 'REEMBOLSO',
  invoice: 'FACTURA',
  complaint: 'RECLAMO',
  'data-rights': 'DATOS',
  human: 'PERSONA',
  'open-source': null,
  collab: 'COLABORACIÓN',
  vendor: null,
  'off-topic': null,
  'audit-delivery': 'ENTREGA',
};

/** Where conversation.ts sends a classified new topic. */
export type Route =
  | 'question'
  | 'booking-first-call'
  | 'booking-consultation'
  | 'intake-flow'
  | 'intake-audit'
  | 'my-booking'
  | 'payment'
  | 'open-source'
  | 'vendor'
  | 'off-topic'
  | 'capture';

export function routeOf(reason: Reason): Route {
  switch (reason) {
    case 'question':
      return 'question';
    case 'first-call':
      return 'booking-first-call';
    case 'consultation':
      return 'booking-consultation';
    case 'flow':
      return 'intake-flow';
    case 'audit':
      return 'intake-audit';
    case 'my-booking':
      return 'my-booking';
    case 'payment':
      return 'payment';
    case 'open-source':
      return 'open-source';
    case 'vendor':
      return 'vendor';
    case 'off-topic':
      return 'off-topic';
    case 'audit-delivery':
      return 'capture';
    default:
      return 'capture';
  }
}

/** Fixed capture questions per reason (at most two), from the site copy. */
export function ask(reason: CaptureReason, lang: Lang): string[] {
  const d = lang === 'es' ? es : en;
  return (d.wa.ask[reason] as string[]).slice(0, 2);
}

/** What the client is told next for a capture reason: who replies, here. */
export function closing(reason: CaptureReason, lang: Lang): string {
  const d = lang === 'es' ? es : en;
  return d.wa.closing[reason] as string;
}

export type FixedKey =
  | 'complaintAck'
  | 'vendor'
  | 'offTopic'
  | 'noBooking'
  | 'howToPay'
  | 'openSourceFallback';

/** One fixed client sentence that is not a capture question or closing. */
export function fixed(key: FixedKey, lang: Lang): string {
  const d = lang === 'es' ? es : en;
  return (d.wa.fixed as Record<FixedKey, string>)[key];
}

/** Rules only: every client-written word travels in the user message. */
export function classifyPrompt(lang: Lang): string {
  const langName = lang === 'es' ? 'Spanish' : 'English';
  return (
    'You are routing one WhatsApp client message for UniverLab (an open lab that sells Workbench consulting) into exactly one reason.\n' +
    DATA_RULES +
    '\n' +
    'The client writes in ' +
    langName +
    '; your output is JSON only, never chat text.\n' +
    'Reasons: question (the knowledge text answers it) | first-call (wants the free 15-minute first call) | consultation (wants a paid consultation) | flow (wants an agentic flow built) | audit (wants an audit) | my-booking (asks about their own booking or hold) | payment (how to pay, or sends a receipt) | support (help with a flow the lab delivered) | audit-fixes (reports fixes for the verification of their audit) | publish (wants their audit made public) | refund (any refund) | invoice (wants an invoice) | complaint (unhappy with a service or how they were treated) | data-rights (knowing, correcting or stopping the use of their data) | human (wants a person, or anything not covered) | open-source (a question or bug about a lab open-source tool) | collab (partnership, press, a talk, research collaboration, sponsorship or a job) | vendor (selling something to the lab) | off-topic (anything unrelated to UniverLab) | audit-delivery (wants to book the delivery session of their audit).\n' +
    'Output exactly one JSON object and nothing else: {"reason": "<one of the 20 names>"}\n' +
    'The DATA message carries the client message.'
  );
}

export function parseReason(raw: string): Reason {
  try {
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) throw new Error('no-json');
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bad-shape');
    const reason = (parsed as { reason?: unknown }).reason;
    if (typeof reason === 'string' && (REASONS as string[]).includes(reason)) {
      return reason as Reason;
    }
    throw new Error('bad-reason');
  } catch {
    return 'human';
  }
}

/** Classify one new topic; anything outside the set, or no answer, is human. */
export async function classify(
  ai: { run(model: string, input: unknown): Promise<unknown> },
  cfg: ModelConfig,
  text: string,
  lang: Lang
): Promise<Reason> {
  try {
    const raw = await runModel(
      ai,
      cfg,
      [
        { role: 'system', content: classifyPrompt(lang) },
        { role: 'user', content: DATA_LABEL + text },
      ],
      300
    );
    return parseReason(raw);
  } catch (e) {
    if (isGuardOver(e)) throw e;
    return 'human';
  }
}

const DECLINE_ES = [
  'no',
  'no gracias',
  'nada',
  'ninguno',
  'ninguna',
  'no quiero',
  'prefiero no',
  'dejalo',
  'no importa',
  'olvidalo',
  'paso',
  'no por ahora',
];

const DECLINE_EN = [
  'no',
  'no thanks',
  'no thank you',
  'none',
  'nothing',
  'never mind',
  'skip',
  'pass',
  'nope',
  'not now',
];

/** A code-only read of "the person declines to answer": an exact match, or a
 *  short no-led refusal. A longer sentence starting with "no" usually carries
 *  content ("no puedo entrar al flujo desde ayer"), so it stays an answer:
 *  dropping it would lose what the operator note needs. */
export function isDecline(text: string, lang: Lang): boolean {
  const n = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .trim();
  const list = lang === 'es' ? DECLINE_ES : DECLINE_EN;
  if (list.includes(n)) return true;
  if (n.length > 20) return false;
  return n.startsWith('no ') || n.startsWith('no,');
}

/** A complaint this long already says what happened: no question, straight to handoff. */
export const COMPLAINT_SAYS_AT = 20;

export function complaintSays(text: string): boolean {
  return text.trim().length >= COMPLAINT_SAYS_AT;
}

export interface CaptureState {
  reason: CaptureReason;
  lang: Lang;
  phone: string;
  name: string;
  opening: string;
  answers: string[];
  asks: number;
  updatedAt: number;
}

/** A capture in progress survives the day and is abandoned after 24 hours of silence. */
export const CAPTURE_MS = 24 * 3600 * 1000;

export type CaptureStep = { action: 'ask'; question: string } | { action: 'handoff' };

/** At most two questions; whatever the person answers, or a decline, hands off. */
export function nextCaptureStep(
  reason: CaptureReason,
  lang: Lang,
  answers: string[],
  declined: boolean
): CaptureStep {
  if (declined) return { action: 'handoff' };
  const questions = ask(reason, lang);
  if (answers.length >= questions.length) return { action: 'handoff' };
  return { action: 'ask', question: questions[answers.length] };
}

/** Client answers travel to the operator as given: cleaned like the profile
 *  name (one line, no brackets or control characters), cut at 500 each. */
export function cleanAnswer(raw: string): string {
  return raw
    .replace(/[\0-\x1F\x7F-\x9F]/g, ' ')
    .replace(/[[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export interface ReasonNote {
  name: string;
  phone: string;
  lang: Lang;
  tag: string;
  priority: Priority;
  opening: string;
  answers: string[];
}

/** The operator note keeps who and adds the tag and priority. */
export function formatReasonNote(n: ReasonNote): string {
  const who = (n.name ? n.name + ' ' : '') + '+' + n.phone;
  const pri =
    n.lang === 'es'
      ? n.priority === 'high'
        ? 'prioridad alta'
        : n.priority === 'low'
          ? 'prioridad baja'
          : 'prioridad normal'
      : n.priority === 'high'
        ? 'high priority'
        : n.priority === 'low'
          ? 'low priority'
          : 'normal priority';
  const head =
    who +
    '\n' +
    (n.lang === 'es' ? 'Motivo: ' : 'Reason: ') +
    n.tag +
    ' · ' +
    pri;
  const bullets = [n.opening, ...n.answers]
    .map(cleanAnswer)
    .filter((b) => b.length > 0)
    .slice(0, 3)
    .map((b) => '- ' + b);
  return (head + '\n' + bullets.join('\n')).slice(0, 1600);
}
