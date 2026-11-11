import { systemPrompt } from './prompt';
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
}

export const FALLBACK: Record<Lang, string> = {
  es: 'Gracias por escribir. Le paso tu mensaje a una persona del laboratorio y te responde pronto.',
  en: 'Thanks for writing. I am passing your message to someone at the lab, who will reply soon.',
};

export function parseAnswer(raw: string, lang: Lang): Answer {
  try {
    // Reasoning models may inline their thinking; braces inside it must not be parsed.
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) throw new Error('no-json');
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('bad-shape');
    const { reply, handoff } = parsed as { reply?: unknown; handoff?: unknown };
    if (typeof reply !== 'string' || reply.length === 0) throw new Error('bad-reply');
    if (typeof handoff !== 'boolean') throw new Error('bad-handoff');
    return { reply: reply.slice(0, 1000), handoff };
  } catch {
    return { reply: FALLBACK[lang], handoff: true };
  }
}

export async function answer(
  ai: { run(model: string, input: unknown): Promise<unknown> },
  history: Turn[],
  lang: Lang,
  cfg: ModelConfig = modelConfig({})
): Promise<Answer> {
  try {
    const res = (await ai.run(cfg.model, {
      response_format: { type: 'json_object' },
      max_tokens: 1200,
      ...cfg.options,
      messages: [
        { role: 'system', content: systemPrompt(lang) },
        ...history.map((t) => ({ role: t.role, content: t.text })),
      ],
    })) as {
      choices?: Array<{ message?: { content?: string } }>;
      response?: string;
    };
    const raw =
      typeof res.choices?.[0]?.message?.content === 'string'
        ? res.choices[0].message.content
        : typeof res.response === 'string'
          ? res.response
          : '';
    return parseAnswer(raw, lang);
  } catch {
    return { reply: FALLBACK[lang], handoff: true };
  }
}
