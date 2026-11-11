import { runModel, type ModelConfig } from './brain';
import type { Lang } from './lang';

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .trim();
}

export function deletionRequest(text: string): Lang | null {
  const n = normalize(text);
  if (n === 'borrar mis datos') return 'es';
  if (n === 'delete my data') return 'en';
  return null;
}

export function retentionDeadline(ms: number): number {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + 6);
  return d.getTime();
}

export function alarmAt(sec: number, now: number = Date.now()): number {
  return retentionDeadline(sec > 0 ? sec * 1000 : now);
}

export const ERASED: Record<Lang, string> = {
  es: 'Listo: borré tus mensajes, el estado de tu conversación y las notas guardadas. Lo que ya enviaste sigue en tu propio WhatsApp.',
  en: 'Done: I deleted your messages, your conversation state and the stored notes. What you already sent stays in your own WhatsApp.',
};

export const PENDING_ERASE: Record<Lang, string> = {
  es: 'Voy a borrar tus mensajes, el estado de la conversación, las notas y cualquier cita agendada. Responde SÍ para confirmar.',
  en: 'I am going to delete your messages, the conversation state, the notes and any booked appointment. Reply YES to confirm.',
};

export const NOT_DELETED: Record<Lang, string> = {
  es: 'No borré nada. Si quieres que borre tus datos, dímelo.',
  en: 'I deleted nothing. If you want me to delete your data, tell me.',
};

/** A fuzzy deletion request waits this long for the one-word confirmation. */
export const CONFIRM_MS = 30 * 60 * 1000;

export function isConfirmation(text: string): boolean {
  const n = normalize(text);
  return n === 'si' || n === 'yes' || n === 'y';
}

function fuzzyDeletionPrompt(lang: Lang): string {
  const langName = lang === 'es' ? 'Spanish' : 'English';
  return (
    'You decide whether one WhatsApp client message asks us to delete, erase or forget their data or conversation (UniverLab).\n' +
    'The client writes in ' +
    langName +
    '; your output is JSON only, never chat text.\n' +
    'Answer {"delete": true} only when the client asks to delete, erase, wipe or forget their data, messages, notes or conversation, in any wording, Spanish or English.\n' +
    'Answer {"delete": false} for anything else, including questions about stored data ("¿qué datos guardan?", "how do you use my data?") and past-tense mentions of something already deleted ("borré el mensaje anterior").\n' +
    'Output exactly one JSON object and nothing else: {"delete": true|false}\n' +
    'Message:\n'
  );
}

export function parseFuzzy(raw: string): boolean {
  try {
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) throw new Error('no-json');
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bad-shape');
    return (parsed as { delete?: unknown }).delete === true;
  } catch {
    return false;
  }
}

export async function fuzzyDeletionRequest(
  ai: { run(model: string, input: unknown): Promise<unknown> },
  cfg: ModelConfig,
  lang: Lang,
  text: string
): Promise<boolean> {
  try {
    const raw = await runModel(
      ai,
      cfg,
      [
        { role: 'system', content: fuzzyDeletionPrompt(lang) },
        { role: 'user', content: text },
      ],
      300
    );
    return parseFuzzy(raw);
  } catch {
    return false;
  }
}

export function operatorErased(phone: string): string {
  return (
    'UniverLab · +' +
    phone +
    ' borró sus datos: se eliminaron sus mensajes, el estado y las notas. Por favor elimina también su chat de este WhatsApp.'
  );
}
