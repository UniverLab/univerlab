// The founding-places count on /workbench and /workbench/audits, filled at
// request time: the page is static, so the edge rewrites the empty
// #founding-left slot with the live number from the announcements API.
// Anything unreadable clears the slot — the offer then shows with no
// number, never a wrong one — and a zero count marks the founding offer
// as taken. Never throws: every failure answers the static page untouched.

import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { fetchFoundingLeft, formatFoundingLeft } from '../src/lib/founding-spots';

export type FoundingLang = 'en' | 'es';

const dict = (lang: FoundingLang): typeof en => (lang === 'es' ? es : en);

/** The workbench pages carrying the founding offer, in either language,
 *  with or without a trailing slash. Slugs below them never match. */
export function foundingRoute(pathname: string): FoundingLang | null {
  const m = /^\/(es\/)?workbench(\/audits)?\/?$/.exec(pathname);
  if (!m) return null;
  return m[1] ? 'es' : 'en';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface Rewriter {
  on(selector: string, handler: unknown): void;
  transform(res: Response): Response;
}

/** Fill or clear the founding slot of a workbench HTML page. `left` is the
 *  live count, or null when it could not be read. On the audits page the
 *  slot carries the "{n} of {total}" line; on the workbench card it carries
 *  the "{card} · {left}" line naming the card. A zero count clears the slot
 *  and marks the founding body as taken; null only clears the slot. */
export function fillFoundingHtml(html: string, lang: FoundingLang, left: number | null): string {
  const d = dict(lang).workbench.audits.offers.founding;
  const isAudits = html.includes('data-founding-body');
  let slot = '';
  if (left !== null && left > 0) {
    const line = formatFoundingLeft(d.left, left);
    slot = isAudits ? line : d.card.replace('{card}', dict(lang).workbench.audits.cardLink).replace('{left}', line);
  }
  let out = html.replace(
    /(<span[^>]*id="founding-left"[^>]*>)[\s\S]*?(<\/span>)/,
    (_m, open: string, close: string) => `${open}${esc(slot)}${close}`,
  );
  if (left === 0 && isAudits) {
    out = out.replace(
      /(<span[^>]*data-founding-body[^>]*>)[\s\S]*?(<\/span>)/,
      (_m, open: string, close: string) => `${open}${esc(d.taken)}${close}`,
    );
  }
  return out;
}

/** `next()` the page, then fill or clear its founding slot with the live
 *  count. Answers the static response untouched on any failure. */
export async function rewriteFoundingSpots(
  res: Response,
  lang: FoundingLang,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  let left: number | null = null;
  try {
    left = await fetchFoundingLeft(fetchImpl);
  } catch {
    left = null;
  }
  let html: string;
  try {
    html = await res.text();
  } catch {
    return res;
  }
  // The body is rewritten, so the asset's length no longer applies.
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  const d = dict(lang).workbench.audits.offers.founding;
  const isAudits = html.includes('data-founding-body');
  const RW = (globalThis as unknown as { HTMLRewriter?: unknown }).HTMLRewriter;
  if (typeof RW === 'function') {
    try {
      const rewriter = new (RW as new () => Rewriter)();
      // Member-expression calls: extracting `on` first would lose its
      // receiver, and a stub rewriter records nothing.
      let slot = '';
      if (left !== null && left > 0) {
        const line = formatFoundingLeft(d.left, left);
        slot =
          isAudits
            ? line
            : d.card.replace('{card}', dict(lang).workbench.audits.cardLink).replace('{left}', line);
      }
      const slotText = slot;
      rewriter.on('#founding-left', {
        element(el: { setInnerContent(c: string, o: unknown): void }) {
          el.setInnerContent(slotText, { html: false });
        },
      });
      if (left === 0 && isAudits) {
        const taken = d.taken;
        rewriter.on('[data-founding-body]', {
          element(el: { setInnerContent(c: string, o: unknown): void }) {
            el.setInnerContent(taken, { html: false });
          },
        });
      }
      return rewriter.transform(new Response(html, { status: res.status, headers }));
    } catch {
      return res;
    }
  }
  try {
    const out = fillFoundingHtml(html, lang, left);
    return new Response(out, { status: res.status, headers });
  } catch {
    return res;
  }
}
