/**
 * Short footer labels for the two legal pages, one line per language.
 *
 * They live here rather than in `i18n/en.ts` / `i18n/es.ts` because both
 * dictionaries already sit at the repository's 1 200-line cap for files under
 * `src/` (en.ts 1216, es.ts 1203 at the commit this page was added on). The
 * spec allows long page copy in per-page content modules, so the legal copy
 * and its two labels share one home; the labels still ship in both languages,
 * side by side, the way the dictionaries keep them.
 */
import type { LegalLang } from './legal';

export const legalNav: Record<LegalLang, { privacy: string; terms: string }> = {
  en: { privacy: 'Privacy', terms: 'Terms' },
  es: { privacy: 'Privacidad', terms: 'Términos' },
};
