import { en, type Dict } from './en';
import { es } from './es';
import { pageGlob } from './page-glob';

export const languages = { en: 'EN', es: 'ES' } as const;
export type Lang = keyof typeof languages;

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
  // English is unprefixed: an /es-prefixed path is stripped, never kept.
  const stripped = pathname.replace(/^\/es(?=\/|$)/, '') || '/';
  return ensureSlash(stripped) + suffix;
}

/** Given the current URL and a target language, return the equivalent path. */
export function switchLangPath(url: URL, target: Lang): string {
  const stripped = url.pathname.replace(/^\/es(?=\/|$)/, '') || '/';
  return localizePath(stripped, target);
}

/** A route source file (`/src/pages/...`) as path segments: the `.astro`
 *  suffix is dropped and a trailing `index` segment folds into its parent,
 *  so `/src/pages/es/gitkit.astro` and `/src/pages/es/index.astro` become
 *  `['gitkit']` and `[]`. */
function routeSegs(key: string): string[] {
  const rel = key.replace(/^\/src\/pages\//, '').replace(/\.astro$/, '');
  const segs = rel.split('/');
  if (segs.length > 0 && segs[segs.length - 1] === 'index') segs.pop();
  return segs;
}

/** The built routes of one language tree, as segment patterns: `es` keeps
 *  only the files under `src/pages/es/` (minus that segment), `en` keeps
 *  everything else. */
function treeRoutes(target: Lang): string[][] {
  const out: string[][] = [];
  for (const key of Object.keys(pageGlob)) {
    const segs = routeSegs(key);
    if (target === 'es') {
      if (segs[0] !== 'es') continue;
      out.push(segs.slice(1));
    } else {
      if (segs[0] === 'es') continue;
      out.push(segs);
    }
  }
  return out;
}

/** A route pattern matches a concrete path when every segment agrees:
 *  `[x]` matches one segment, `[…x]` consumes the rest, anything else
 *  matches literally. A spread mid-pattern only constrains its prefix —
 *  in this tree spreads are always trailing (`[...slug]`). */
function matchRoute(pattern: string[], segs: string[]): boolean {
  const spread = pattern.findIndex((s) => s.startsWith('[...') && s.endsWith(']'));
  if (spread !== -1) {
    if (segs.length < spread) return false;
    for (let i = 0; i < spread; i++) {
      const p = pattern[i];
      if (p.startsWith('[') && p.endsWith(']')) continue;
      if (p !== segs[i]) return false;
    }
    return true;
  }
  if (pattern.length !== segs.length) return false;
  return pattern.every((p, i) => (p.startsWith('[') && p.endsWith(']')) || p === segs[i]);
}

/** Whether `path` exists as a page in the target language. Spanish lives
 *  under `src/pages/es/`, English everywhere else; dynamic routes (`[id]`)
 *  count as localized only when both trees carry them. `/status/` answers
 *  false for `es`, `/gitkit/` true, `/es/gitkit/` true for `en`. */
export function hasCounterpart(path: string, target: Lang): boolean {
  const clean = path.split('?')[0].split('#')[0];
  const stripped = clean.replace(/^\/es(?=\/|$)/, '') || '/';
  const segs = stripped.split('/').filter(Boolean);
  return treeRoutes(target).some((r) => matchRoute(r, segs));
}
