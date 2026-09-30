/**
 * Where each experiment's documentation lives, and the one place that says so.
 *
 * `src/content.config.ts` builds a `docs-<id>` collection per entry; the Sätteri
 * link plugin (`src/plugins/docs-md-links.ts`) matches a document's path
 * back to an `<id>`; `scripts/build-redirects.ts` globs the same folders to
 * emit a `.md` rule per page. Three consumers, one table — when they disagreed
 * the plugin would rewrite links to routes that do not exist, which is the same
 * class of 404 the rewrite exists to remove.
 *
 * Paths are relative to the project root, matching `glob({ base })` in
 * content.config.ts. The directory is the *repository* name, which is not
 * always the site id (`harness-canopy` → `canopy`) — hence the explicit map
 * rather than deriving one id from the other.
 */
export const DOCS_BASES: Readonly<Record<string, string>> = {
  canopy: '../harness-canopy/docs',
  texforge: '../texforge/docs',
  gitkit: '../gitkit/docs',
  ghscaff: '../ghscaff/docs',
  cadspec: '../cadspec/docs',
  demostage: '../demostage/docs',
};

/**
 * Repo-relative paths that are design records, not published documentation.
 * `docs/` is published documentation only (2026-09-29): these directories
 * never build to site routes. One literal list shared by the content
 * collections' glob, the link-rewrite plugin, and the redirects generator.
 */
export const DOCS_EXCLUDE = ['adr/**', 'decisions/**', 'design/**', 'internal/**'] as const;

/**
 * True when `rel` (repo-relative, posix, e.g. `adr/0001-recipes.md`) is
 * excluded. Accepts the path with or without a `.md` extension and matches
 * case-insensitively; `adr/**` covers bare `adr` plus everything under it.
 */
export function isDocsExcluded(rel: string): boolean {
  const p = rel.replace(/^\.\//, '').toLowerCase();
  return (DOCS_EXCLUDE as readonly string[]).some((pat) => {
    const dir = pat.replace(/\/\*\*$/, '');
    return p === dir || p.startsWith(`${dir}/`);
  });
}

/** Site id → `owner/repo`, derived from the DOCS_BASES dir name (the repo). */
export function docsRepo(id: string): string {
  const base = DOCS_BASES[id];
  const repo = base.replace(/^\.\.\//, '').split('/')[0];
  return `UniverLab/${repo}`;
}

/** Absolute GitHub URL to a file on the repo's default branch. */
export function docsGithubUrl(id: string, rel: string, anchor = ''): string {
  return `https://github.com/${docsRepo(id)}/blob/main/docs/${rel}${anchor}`;
}

/** Routes that used to build but must now 301 to the tool docs index. */
export const DOCS_EXCLUDED_REDIRECTS: readonly string[] = [
  '/canopy/docs/adr/0001-recipes/ /canopy/docs/ 301',
  '/canopy/docs/adr/0001-recipes/index.md /canopy/docs/ 301',
  '/demostage/docs/decisions/browser-events/ /demostage/docs/ 301',
  '/demostage/docs/decisions/browser-events/index.md /demostage/docs/ 301',
];
