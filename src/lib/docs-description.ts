/**
 * Meta-description composer for docs pages.
 *
 * Docs copy lives in the sibling repos' `docs/*.md` frontmatter, which this
 * repo does not own — and almost every frontmatter description is shorter
 * than the 140–160 characters Bing wants. So DocsLayout composes the meta
 * description here instead of passing the frontmatter through:
 *
 *   - a frontmatter description of 140–160 chars is used as is;
 *   - a longer one is cut at a word boundary to ≤ 160;
 *   - a shorter one is extended as `<description> <ExpName> documentation — <tagline>`
 *     and then cut at a word boundary to ≤ 160;
 *   - a page with no frontmatter description uses its title in place of the description.
 *
 * Docs are English-only, so callers always pass the en tagline.
 */
export interface DocsDescriptionInput {
  description?: string;
  title: string;
  expName: string;
  tagline: string;
}

const IN_RANGE_MIN = 140;
const MAX = 160;

/** Cut to `max` chars at the last space, with no trailing punctuation fragment. */
export function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(' ', max);
  const head = cut > 0 ? s.slice(0, cut) : s.slice(0, max);
  return head.replace(/[\s.,;:!?—–\-…'"')\]]+$/, '');
}

export function composeDocsDescription({ description, title, expName, tagline }: DocsDescriptionInput): string {
  const base = description?.trim() || title.trim();
  if (base.length >= IN_RANGE_MIN && base.length <= MAX) return base;
  if (base.length > MAX) return truncateAtWord(base, MAX);
  return truncateAtWord(`${base} ${expName} documentation — ${tagline}`, MAX);
}
