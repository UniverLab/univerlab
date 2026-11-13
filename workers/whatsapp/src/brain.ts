import { DATA_LABEL, systemPrompt } from './prompt';
import { checkReply } from './replycheck';
import type { Lang } from './lang';

/** Used when the deploy sets no TEXT_MODEL. The model is configuration: the
 *  production environment's WA_TEXT_MODEL / WA_TEXT_MODEL_OPTIONS variables
 *  reach the Worker as TEXT_MODEL / TEXT_MODEL_OPTIONS (see README). */
export const DEFAULT_MODEL = '@cf/zai-org/glm-4.7-flash';

export interface ModelConfig {
  model: string;
  /** Extra request fields for this model, e.g. {"reasoning_effort":"low"}. */
  options: Record<string, unknown>;
}

export function modelConfig(env: { TEXT_MODEL?: string; TEXT_MODEL_OPTIONS?: string }): ModelConfig {
  const model = env.TEXT_MODEL?.trim() || DEFAULT_MODEL;
  let options: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(env.TEXT_MODEL_OPTIONS?.trim() || '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      options = parsed as Record<string, unknown>;
    }
  } catch {
    // A malformed value falls back to no options rather than breaking replies.
  }
  return { model, options };
}

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface Answer {
  reply: string;
  handoff: boolean;
  booking: boolean;
  service: string;
}

export const FALLBACK: Record<Lang, string> = {
  es: 'Gracias por escribir. Le paso tu mensaje a una persona del laboratorio y te responde pronto.',
  en: 'Thanks for writing. I am passing your message to someone at the lab, who will reply soon.',
};

export interface ModelMessage {
  role: string;
  content: string;
}

function extractRaw(res: unknown): string {
  const r = res as {
    choices?: Array<{ message?: { content?: string } }>;
    response?: string;
  };
  if (typeof r?.choices?.[0]?.message?.content === 'string') {
    return r.choices[0].message.content;
  }
  if (typeof r?.response === 'string') return r.response;
  return '';
}

export async function runModel(
  ai: { run(model: string, input: unknown): Promise<unknown> },
  cfg: ModelConfig,
  messages: ModelMessage[],
  maxTokens: number
): Promise<string> {
  const res = await ai.run(cfg.model, {
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
    ...cfg.options,
    messages,
  });
  return extractRaw(res);
}

export function parseAnswer(raw: string, lang: Lang): Answer {
  const fallback: Answer = { reply: FALLBACK[lang], handoff: true, booking: false, service: '' };
  try {
    // Reasoning models may inline their thinking; braces inside it must not be parsed.
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) throw new Error('no-json');
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bad-shape');
    const { reply, handoff, booking, service } = parsed as {
      reply?: unknown;
      handoff?: unknown;
      booking?: unknown;
      service?: unknown;
    };
    if (typeof reply !== 'string' || reply.length === 0) throw new Error('bad-reply');
    if (typeof handoff !== 'boolean') throw new Error('bad-handoff');
    if (typeof booking !== 'boolean') throw new Error('bad-booking');
    if (typeof service !== 'string') throw new Error('bad-service');
    return { reply: reply.slice(0, 1000), handoff, booking, service: service.slice(0, 40) };
  } catch {
    return fallback;
  }
}

export async function answer(
  ai: { run(model: string, input: unknown): Promise<unknown> },
  history: Turn[],
  lang: Lang,
  cfg: ModelConfig = modelConfig({}),
  phone = '',
  extraHosts: string[] = []
): Promise<Answer> {
  try {
    const raw = await runModel(
      ai,
      cfg,
      [
        { role: 'system', content: systemPrompt(lang, phone) },
        // Client-written turns travel as marked DATA user content; the
        // model's own earlier turns stay untouched.
        ...history.map((t) => ({
          role: t.role,
          content: t.role === 'user' ? DATA_LABEL + t.text : t.text,
        })),
      ],
      1200
    );
    const parsed = parseAnswer(raw, lang);
    // A reply failing the output check is replaced by the fixed fallback
    // with a handoff, whatever the flags say. Otherwise a booking flag
    // wins (the prompt tells the model to set handoff true alongside it)
    // and the conversation answers with the intake template; any other
    // handoff never carries model-written text.
    if (!checkReply(parsed.reply, lang, phone, extraHosts)) {
      return { reply: FALLBACK[lang], handoff: true, booking: false, service: '' };
    }
    if (parsed.booking) return parsed;
    if (parsed.handoff) {
      return { reply: FALLBACK[lang], handoff: true, booking: false, service: '' };
    }
    return parsed;
  } catch {
    return { reply: FALLBACK[lang], handoff: true, booking: false, service: '' };
  }
}
