import { knowledge } from './knowledge';
import { DATA_RULES } from './prompt';
import type { Lang } from './lang';

const RULE_WINDOW = 30;

const URL_RE = /https?:\/\/[^\s)'"`\]]+/gi;

/** A money amount: a $ figure or a number next to a currency word, either order. */
const MONEY_RE =
  /(?:\$\s?\d[\d.,]*|\d[\d.,]*\s?(?:COP|USD|pesos?|d[oó]lares?|dollars?|€|EUR)|(?:COP|USD|pesos?|d[oó]lares?|dollars?|€|EUR)\s?\$?\s?\d[\d.,]*)/gi;

/** True when the reply is safe to send: at most 600 chars, every link on
 *  univerlab.org (plus any extra host, e.g. github.com for open-source
 *  answers), every money amount quoted from the knowledge text for
 *  this language and country, and none of the system rules quoted back. */
export function checkReply(reply: string, lang: Lang, phone = '', extraHosts: string[] = []): boolean {
  if (reply.length > 600) return false;
  const extra = new Set(extraHosts.map((h) => h.toLowerCase()));
  const urls = reply.match(URL_RE) ?? [];
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.toLowerCase();
      if (host !== 'univerlab.org' && !host.endsWith('.univerlab.org') && !extra.has(host)) return false;
    } catch {
      return false;
    }
  }
  for (let i = 0; i + RULE_WINDOW <= DATA_RULES.length; i++) {
    if (reply.includes(DATA_RULES.slice(i, i + RULE_WINDOW))) return false;
  }
  const amounts = reply.match(MONEY_RE) ?? [];
  if (amounts.length > 0) {
    const known = knowledge(lang, phone).toLowerCase();
    for (const m of amounts) {
      if (!known.includes(m.toLowerCase())) return false;
    }
  }
  return true;
}
