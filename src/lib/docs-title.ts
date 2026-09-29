/**
 * Title composer for docs pages (lseo-titles).
 *
 * Docs copy lives in the sibling repos' `docs/*.md` frontmatter, which this
 * repo does not own, and the bare frontmatter title ("Lock", "Hooks") is far
 * too short to carry a page on its own. DocsLayout composes the `<title>` here
 * instead, following the one cascade the spec allows:
 *
 *   - `<Page> — <Exp> docs | UniverLab`;
 *   - over 60 chars → drop ` | UniverLab`;
 *   - still over 60 → `<Page> — <Exp>`.
 *
 * Exact separators matter: " — " (space em dash space), " docs", " | UniverLab".
 * The shortest form in the current corpus, `Lock — GitKit docs | UniverLab`,
 * is exactly 30 characters — the floor check-seo enforces — so "tidying" the
 * spacing drops real pages below it. If the final form still exceeds 60 the
 * build fails in check-seo; that is the signal to renegotiate the frontmatter
 * title upstream, never a reason to truncate silently.
 *
 * Descriptions are composed separately in `docs-description.ts` and must not
 * be derived from this string.
 */
export function composeDocsTitle(page: string, expName: string): string {
  const full = `${page} — ${expName} docs | UniverLab`;
  if (full.length <= 60) return full;
  const mid = `${page} — ${expName} docs`;
  if (mid.length <= 60) return mid;
  return `${page} — ${expName}`;
}
