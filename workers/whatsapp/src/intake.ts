import { modelConfig, runModel, type ModelConfig } from './brain';
import type { Lang } from './lang';

export interface IntakeState {
  lang: Lang;
  service: string;
  opening: string;
  answers: string[];
  asks: number;
}

export const INTAKE_ASK: Record<Lang, string> = {
  es: 'Para llegar preparados: ¿qué te gustaría lograr en la sesión? Cuéntame a qué te dedicas, qué usas hoy y qué ya intentaste.',
  en: 'So we arrive prepared: what would you like to achieve in the session? Tell me what you work on, what you use today and what you already tried.',
};

export const INTAKE_FOLLOWUP: Record<Lang, string> = {
  es: '¿Algo más que quieras cubrir? A qué te dedicas, qué usas hoy o algo que puedas compartir antes.',
  en: 'Anything else you want to cover? What you work on, what you use today, or anything you can share beforehand.',
};

export const CONFIRM_SLOT: Record<Lang, string> = {
  es: 'Listo, pasé tu resumen a una persona del laboratorio. Te confirmará el horario pronto.',
  en: 'Done, I passed your brief to someone at the lab. They will confirm the slot soon.',
};

export const SERVICE_LABEL: Record<Lang, Record<string, string>> = {
  es: {
    'first-call': 'Primera llamada',
    consultation: 'Consultoría',
    'audit-flow': 'Auditoría/flujo',
    other: 'Otro',
  },
  en: {
    'first-call': 'First call',
    consultation: 'Consultation',
    'audit-flow': 'Audit/flow',
    other: 'Other',
  },
};

const NO_DETAILS: Record<Lang, string> = {
  es: 'Sin más detalles compartidos',
  en: 'No further details shared',
};

export type Service = 'first-call' | 'consultation' | 'audit-flow' | 'other';

export function normalizeService(raw: string): Service {
  const s = raw.trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (s === 'first-call' || s === 'firstcall' || s === 'primera-llamada') return 'first-call';
  if (s === 'consultation' || s === 'consultoria' || s === 'consultoría') return 'consultation';
  if (s === 'audit-flow' || s === 'auditflow' || s === 'audit' || s === 'flow') return 'audit-flow';
  return 'other';
}

export type IntakeStatus = 'more' | 'ready' | 'declined' | 'handoff';

export interface IntakeResult {
  status: IntakeStatus;
  reply: string;
}

export function intakePrompt(state: IntakeState): string {
  const langName = state.lang === 'es' ? 'Spanish' : 'English';
  const known = [
    'Service: ' + state.service,
    'Opening booking message: ' + state.opening,
    ...state.answers.map((a, i) => 'Answer ' + (i + 1) + ': ' + a),
  ].join('\n');
  return (
    'You are classifying the latest client message in a short WhatsApp booking intake for UniverLab.\n' +
    'What is still missing: their goal for the session, their context (what they work on, what they use today, what they already tried), and anything they can share beforehand.\n' +
    'Reply in ' + langName + ' when you write a follow-up.\n' +
    'Statuses: "declined" when the client prefers not to answer; "handoff" when the message is about payment, a payment proof, cancelling, asks for a human, is upset, asks something unrelated to the booking, or is not text-like content; "ready" when you already know their goal plus some context (or there are at least two substantive answers); otherwise "more" with a reply asking ONLY what is still missing, one short question, at most 300 characters.\n' +
    'Output exactly one JSON object and nothing else: {"status": "more"|"ready"|"declined"|"handoff", "reply": "<follow-up or empty string>"}\n' +
    'Known so far:\n' + known
  );
}

export function parseIntake(raw: string): IntakeResult {
  try {
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) throw new Error('no-json');
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bad-shape');
    const { status, reply } = parsed as { status?: unknown; reply?: unknown };
    if (status !== 'more' && status !== 'ready' && status !== 'declined' && status !== 'handoff') {
      throw new Error('bad-status');
    }
    return { status, reply: typeof reply === 'string' ? reply.slice(0, 1000) : '' };
  } catch {
    return { status: 'handoff', reply: '' };
  }
}

export async function intake(
  ai: { run(model: string, input: unknown): Promise<unknown> },
  state: IntakeState,
  latest: string,
  cfg: ModelConfig = modelConfig({})
): Promise<IntakeResult> {
  try {
    const raw = await runModel(
      ai,
      cfg,
      [
        { role: 'system', content: intakePrompt(state) },
        { role: 'user', content: latest },
      ],
      800
    );
    return parseIntake(raw);
  } catch {
    return { status: 'handoff', reply: '' };
  }
}

export interface Brief {
  bullets: string[];
}

export function briefPrompt(state: IntakeState): string {
  const langName = state.lang === 'es' ? 'Spanish' : 'English';
  const said = ['Opening booking message: ' + state.opening,
    ...state.answers.map((a, i) => 'Answer ' + (i + 1) + ': ' + a)].join('\n');
  return (
    'You are writing a handoff brief for a UniverLab operator before a Workbench session (' + state.service + ').\n' +
    'Summarize ONLY what the client said below into 3 to 6 short bullets in ' + langName + ', each at most 200 characters. Never invent facts, goals, tools or context the client did not mention. Ignore messages where the client declines to answer.\n' +
    'Output exactly one JSON object and nothing else: {"bullets": ["...", "..."]}\n' +
    'What the client said:\n' + said
  );
}

export function parseBrief(raw: string): Brief {
  try {
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) throw new Error('no-json');
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bad-shape');
    const { bullets } = parsed as { bullets?: unknown };
    if (!Array.isArray(bullets)) throw new Error('bad-bullets');
    return {
      bullets: bullets
        .filter((b): b is string => typeof b === 'string')
        .map((b) => b.trim())
        .filter((b) => b.length > 0)
        .slice(0, 6)
        .map((b) => b.slice(0, 200)),
    };
  } catch {
    return { bullets: [] };
  }
}

export async function brief(
  ai: { run(model: string, input: unknown): Promise<unknown> },
  state: IntakeState,
  cfg: ModelConfig = modelConfig({})
): Promise<Brief> {
  const fallback: Brief = {
    bullets: state.answers
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
      .slice(-6)
      .map((a) => a.slice(0, 200)),
  };
  try {
    const raw = await runModel(
      ai,
      cfg,
      [{ role: 'system', content: briefPrompt(state) }],
      800
    );
    const parsed = parseBrief(raw);
    return parsed.bullets.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export interface BriefHeader {
  name: string;
  phone: string;
  lang: Lang;
  service: string;
  bullets: string[];
}

export function formatBrief(h: BriefHeader): string {
  const langLabel = h.lang === 'es' ? 'español' : 'English';
  const serviceLabel = SERVICE_LABEL[h.lang][normalizeService(h.service)] ?? h.service;
  const who = (h.name ? h.name + ' ' : '') + '+' + h.phone;
  const bullets = h.bullets
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .slice(0, 6)
    .map((b) => b.slice(0, 200));
  while (bullets.length < 3) bullets.push(NO_DETAILS[h.lang]);
  return (
    'UniverLab · ' + who + '\n' +
    (h.lang === 'es' ? 'Idioma: ' : 'Language: ') + langLabel + ' · ' +
    (h.lang === 'es' ? 'Servicio: ' : 'Service: ') + serviceLabel + '\n' +
    bullets.map((b) => '- ' + b).join('\n')
  ).slice(0, 1600);
}
