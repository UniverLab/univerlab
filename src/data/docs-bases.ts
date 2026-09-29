/**
 * Where each experiment's documentation lives, and the one place that says so.
 *
 * `src/content.config.ts` builds a `docs-<id>` collection per entry; the Sätteri
 * link plugin (`src/plugins/rehype-docs-md-links.ts`) matches a document's path
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
