import type { Turn } from './brain';
import { DATA_LABEL, DATA_RULES } from './prompt';

/** A recap never passes 800 characters, including the quoted last message. */
export const RECAP_MAX = 800;

/** Rules only: every client-written turn travels in the DATA user message. */
export function recapPrompt(): string {
  return (
    'You are summarizing one WhatsApp client conversation for the lab operator, in Spanish.\n' +
    DATA_RULES +
    '\n' +
    'Summarize ONLY what the turns below say, in Spanish, at most 600 characters: what the client wants, where the conversation stands, and what is still missing. Never invent facts, goals or context the client did not mention.\n' +
    'Output exactly one JSON object and nothing else: {"recap": "<the summary>"}\n' +
    'The DATA message carries the conversation turns.'
  );
}

/** The turns as one DATA user message, oldest first. */
export function recapData(turns: Turn[]): string {
  return DATA_LABEL + '\n' + turns.map((t) => (t.role === 'user' ? 'cliente: ' : 'agente: ') + t.text).join('\n');
}

/** The stripped summary: reasoning removed, clamped, never empty input. */
export function cleanRecap(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/[\0-\x1F\x7F-\x9F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse the model's answer into the operator recap: the summary clamped so
 * the whole text, ending with the last client message quoted verbatim,
 * never passes 800 characters. Nothing from it ever reaches the client.
 */
export function parseRecap(raw: string, last: string): string {
  let summary = cleanRecap(raw);
  try {
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const recap = (parsed as Record<string, unknown>)['recap'];
        if (typeof recap === 'string' && recap.trim()) summary = cleanRecap(recap);
      }
    }
  } catch {
    /* the stripped raw text below still runs */
  }
  const head = 'Último mensaje del cliente: «';
  const frameLen = 1 + head.length + 1;
  const clippedLast = last.trim().slice(0, Math.max(0, RECAP_MAX - frameLen));
  const quote = '\n' + head + clippedLast + '»';
  const room = Math.max(0, RECAP_MAX - quote.length);
  return summary.slice(0, room) + quote;
}
