/**
 * Shared shape for the privacy and terms pages (one page per kind per
 * language). The body copy lives in `legal-en.ts` / `legal-es.ts`; this
 * module owns the types, the single date constant both pages print, and the
 * lookup the `Legal` view renders.
 *
 * Paragraphs are small HTML strings (`<a>`, `<strong>`, `<code>` only) so
 * both languages can carry the same links. The `{email}` token in a
 * paragraph, item or link is replaced at render time with `contactEmail`
 * from `lib/site-about` — the address is never retyped into the copy.
 */
export type LegalKind = 'privacy' | 'terms';
export type LegalLang = 'en' | 'es';

export interface LegalLink {
  label: string;
  href: string;
}

export interface LegalSection {
  /** Kebab-case, identical in both languages and in order. */
  id: string;
  title: string;
  /** HTML paragraphs, rendered with `set:html`. */
  paras: string[];
  items?: string[];
  links?: LegalLink[];
}

export interface LegalDoc {
  /** `<title>`: 30–90 chars, distinct per page (check-seo). */
  title: string;
  /** Meta description: 120–160 chars, distinct per page (check-seo). */
  description: string;
  kicker: string;
  heading: string;
  intro: string;
  updatedLabel: string;
  effectiveLabel: string;
  /** The Spanish-prevails sentence, rendered on all four pages. */
  prevails: string;
  /** The CC0 template credit line the authors ask to keep. */
  credit: string;
  sections: LegalSection[];
}

/**
 * The date every legal page prints as "Last updated" and "Effective from".
 * The only YYYY-MM-DD literal the legal surface carries: the copy names no
 * other dates, so a policy change moves this one line.
 */
export const LEGAL_DATE = '2026-10-27';

import { privacyEn, termsEn } from './legal-en';
import { privacyEs, termsEs } from './legal-es';

const DOCS: Record<LegalKind, Record<LegalLang, LegalDoc>> = {
  privacy: { en: privacyEn, es: privacyEs },
  terms: { en: termsEn, es: termsEs },
};

/** The document the `Legal` view renders for a kind + language. */
export function legalDoc(kind: LegalKind, lang: LegalLang): LegalDoc {
  return DOCS[kind][lang];
}
