import { en, type Dict } from './en';
import { es } from './es';

export const languages = { en: 'EN', es: 'ES' } as const;
type Lang = keyof typeof languages;

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

/** Resolve an experiment's hero motif for rendering. Every motif is carried
 *  literally in src/lib/experiments.ts; `t` is kept so callers stay the same. */
export function motifOf(exp: { motif: string }, _t: Dict): string {
  return exp.motif;
}

/** Given the current URL and a target language, return the equivalent path. */
export function switchLangPath(url: URL, target: Lang): string {
  const stripped = url.pathname.replace(/^\/es(?=\/|$)/, '') || '/';
  return localizePath(stripped, target);
}
