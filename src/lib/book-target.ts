/** The free-first-call booking form lives as a section of the Workbench page,
 *  anchored per language. Every free-call link on the site lands on it. */

export const BOOK_ANCHOR = { en: '#first-call', es: '#primera-llamada' } as const;

export type BookLang = keyof typeof BOOK_ANCHOR;

/** Absolute path of the Workbench booking section in the given language. */
export const bookTarget = (lang: BookLang): string =>
  (lang === 'es' ? '/es/workbench/' : '/workbench/') + BOOK_ANCHOR[lang];
