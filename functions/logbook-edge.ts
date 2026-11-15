// The Logbook at the edge: the same live record the client fallback fills,
// rendered with the same renderer (src/lib/lab-page.ts). Kept out of
// functions/_middleware.ts so neither file passes its line budget.

import { loadEntries } from '../src/lib/lab-feed';
import { logbookMarkdown, logbookPageHtml } from '../src/lib/lab-page';

export type LogbookLang = 'en' | 'es';

/** The Logbook routes, with or without trailing slash or index.md. */
export function logbookRoute(pathname: string): LogbookLang | null {
  const p = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  if (p === '/logbook' || p === '/logbook/index.md') return 'en';
  if (p === '/es/logbook' || p === '/es/logbook/index.md') return 'es';
  return null;
}

/** The full record, newest first. The founding count is not read here: the
 *  Logbook carries no coupons, so one round trip is enough. */
export async function liveLogbook(
  lang: LogbookLang,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  init?: RequestInit,
): Promise<{ bodyHtml: string; twin: string }> {
  const entries = await loadEntries({ fetchImpl, init, signal }).catch(() => null);
  const list = entries ?? [];
  return {
    bodyHtml: logbookPageHtml(list, lang, { unavailable: entries === null }),
    twin: logbookMarkdown(list, lang),
  };
}

/** Set one selector's content through workerd's HTMLRewriter, or return the
 *  static response untouched when there is no rewriter (tests, fallback). */
export function rewriteSelector(staticRes: Response, selector: string, html: string): Response {
  const RW = (globalThis as unknown as { HTMLRewriter?: unknown }).HTMLRewriter;
  if (typeof RW === 'function') {
    const rewriter = new (RW as new () => {
      on(s: string, h: unknown): unknown;
      transform(r: Response): Response;
    })();
    // Member-expression call: extracting `on` first would lose its receiver,
    // and a stub rewriter records nothing.
    (rewriter.on as (s: string, h: unknown) => void)(selector, {
      element(el: { setInnerContent(c: string, o: unknown): void }) {
        el.setInnerContent(html, { html: true });
      },
    });
    return rewriter.transform(staticRes);
  }
  return staticRes;
}
