import { systemPrompt } from './prompt';
import type { Lang } from './lang';

export const MODEL = '@cf/zai-org/glm-4.7-flash';

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
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) throw new Error('no-json');
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
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
  lang: Lang
): Promise<Answer> {
  try {
    const res = (await ai.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt(lang) },
        ...history.map((t) => ({ role: t.role, content: t.text })),
      ],
      max_tokens: 500,
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
