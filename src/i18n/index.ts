import { en, type Dict } from './en';
import { es } from './es';

export type { Dict, ExperimentId } from './en';

export const languages = { en: 'EN', es: 'ES' } as const;
export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';

const dict: Record<Lang, Dict> = { en, es };

/** Resolve the active language from a URL pathname. Spanish lives under /es. */
export function getLang(url: URL): Lang {
  const seg = url.pathname.split('/').filter(Boolean)[0];
  return seg === 'es' ? 'es' : 'en';
}

/** Return the full copy dictionary for a language. */
export function useTranslations(lang: Lang): Dict {
  return dict[lang];
}

/** Prefix an app-absolute path ("/experiments") for the given language.
 *  English is unprefixed; Spanish gets a /es prefix.
 *  Every returned path ends with "/" (root stays "/").
 *  Idempotent: passing a Spanish-prefixed path with lang='es' won't double-prefix. */
export function localizePath(path: string, lang: Lang): string {
  // Separate the pathname from query/hash so the slash goes before them.
  const qIdx = path.indexOf('?');
  const hIdx = path.indexOf('#');
  const sep = qIdx !== -1 ? qIdx : hIdx !== -1 ? hIdx : path.length;
  const pathname = path.slice(0, sep);
  const suffix = path.slice(sep);

  const ensureSlash = (p: string) => (p.endsWith('/') ? p : `${p}/`);

  if (lang === 'es') {
    const stripped = pathname.replace(/^\/es(?=\/|$)/, '') || '/';
    const slashed = ensureSlash(stripped);
    const prefix = slashed === '/' ? '/es/' : `/es${slashed}`;
    return prefix + suffix;
  }
  return ensureSlash(pathname) + suffix;
}

/** Given the current URL and a target language, return the equivalent path. */
export function switchLangPath(url: URL, target: Lang): string {
  const stripped = url.pathname.replace(/^\/es(?=\/|$)/, '') || '/';
  return localizePath(stripped, target);
}
