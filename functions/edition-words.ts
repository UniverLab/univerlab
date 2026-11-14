import { editionDateWords, type TodayLang } from '../src/lib/today-edition';

/** The masthead date words at the edge: fill both `span[data-words]` nodes
 *  (the masthead's and the control bar's) with the edition's full date line,
 *  so the row paints at its final height on the first frame. Plain text,
 *  never HTML. */
export function rewriteEditionWords(
  rewriter: { on(s: string, h: unknown): unknown },
  date: Date,
  lang: TodayLang,
): void {
  // Member-expression call: extracting `on` first would lose its receiver,
  // and a stub rewriter records nothing.
  rewriter.on('span[data-words]', {
    element(el: { setInnerContent(c: string, o: unknown): void }) {
      el.setInnerContent(editionDateWords(date, lang), { html: false });
    },
  });
}
