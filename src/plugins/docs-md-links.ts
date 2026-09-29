/**
 * Rewrites relative markdown links inside the tool repos' docs into real site
 * routes.
 *
 * The docs collections render the sibling repositories' `docs/` folders
 * untouched, so a link written for a GitHub reader — `[hooks](hooks.md#hook-health)`
 * — reaches the browser verbatim. From `/gitkit/docs/quickstart/` that resolves
 * to `/gitkit/docs/hooks.md`, which does not exist: 11 of the 21 404s Google
 * reported on 2026-09-28 were exactly these. The `.md` line in `_redirects`
 * (see `scripts/build-redirects.ts`) recovers the URLs already in Google's
 * index; this plugin stops the site from minting new ones.
 *
 * A Sätteri hast plugin (`markdown.processor` in astro.config.mjs), for the
 * same reason the earlier plan named rehype: the contract is about the final
 * `href` values, which is where a link has already lost its `.md` semantics
 * nowhere and gained nothing — a relative markdown path is still just a string.
 *
 * A document is identified by its path matched against `DOCS_BASES`, so the
 * landing's own prose (and any markdown that is not an experiment's docs) is
 * left alone. When no base matches, the link passes through unchanged
 * (fail-open) — `scripts/check-seo.ts` fails the build if a `.md` link ever
 * survives into `dist/`.
 *
 * Editing this file does not change a build on its own. Astro caches rendered
 * collections in `.astro/data-store.json`, and the cache key is the source
 * file's digest, so a change to the *plugin* leaves the previous HTML in place
 * — verified by pointing this rewrite at a different route and getting the old
 * href back. After editing, `rm -rf .astro node_modules/.astro`. This is why
 * `npm run build` can fail on a `.md` link that the source no longer has: trust
 * the check, clear the cache, and it should pass.
 */
import type { HastPluginDefinition } from 'satteri';
import { DOCS_BASES } from '../data/docs-bases';

/** Prefixes that make an href something other than a relative docs link. */
const EXTERNAL_PREFIX = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

type HrefRewrite = { href: string; rewritten: boolean };

/**
 * Resolve `target` against `docDir`, both relative to the docs base.
 * `escaped` is true when the walk climbed above the base — that is the
 * difference between `../README.md` from `docs/installation.md` (the repository
 * README) and the same link from `docs/adr/x.md` (still `docs/README.md`).
 */
function resolveRelative(docDir: string, target: string): { path: string; escaped: boolean } {
  const parts = docDir ? docDir.split('/').filter(Boolean) : [];
  let escaped = false;
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) escaped = true;
      else parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return { path: parts.join('/'), escaped };
}

/**
 * Rewrite one docs-relative href to its canonical site route.
 *
 * `foo.md` → `/<id>/docs/foo/`, `./sub/foo.md` → `/<id>/docs/sub/foo/`,
 * `index.md` → `/<id>/docs/`. The anchor is preserved and always separated
 * from the path by the route's own trailing slash: `hooks.md#hook-health`
 * → `/<id>/docs/hooks/#hook-health`, never `/<id>/docs/hooks#hook-health`.
 *
 * `docDir` is the linking document's directory within the collection (`''` for
 * a top-level page, `adr` for `adr/0001-recipes.md`). It is what makes a link
 * that escapes the docs folder resolvable rather than merely skippable: from
 * `canopy/docs/installation.md`, `../README.md` is the repository README, which
 * the site does not publish, so it points at the experiment page instead. The
 * fragment is dropped there — it names a heading of a file that is not
 * published, and a fragment with no target only pretends one exists. An
 * escaping link that does not land on the repository README is left untouched.
 *
 * Returns the input unchanged when there is nothing to rewrite.
 */
export function rewriteMdHref(href: string, id: string, docDir = ''): HrefRewrite {
  if (!href || EXTERNAL_PREFIX.test(href) || href.startsWith('/') || href.startsWith('#')) return { href, rewritten: false };
  if (!href.toLowerCase().split('#')[0].endsWith('.md')) return { href, rewritten: false };

  const hashAt = href.indexOf('#');
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const anchor = hashAt === -1 ? '' : href.slice(hashAt);

  if (path.startsWith('../')) {
    // Only the repository README is mapped: it is the one escaping target with
    // a true equivalent on this site, the experiment page. A `../` that stays
    // inside the docs folder, or escapes to anything else, is left alone.
    const { path: target, escaped } = resolveRelative(docDir, path);
    if (!escaped || target.toLowerCase() !== 'readme.md') return { href, rewritten: false };
    return { href: `/${id}/`, rewritten: true };
  }

  // `index.md` (and `sub/index.md`) address the parent page, not a page of
  // their own — `''` is the collection root.
  const slug = path
    .replace(/^\.\//, '')
    .replace(/\.md$/i, '')
    .replace(/\/+$/, '')
    .replace(/(^|\/)index$/i, '$1')
    .replace(/\/+$/, '');
  return { href: `/${id}/docs/${slug ? `${slug}/` : ''}${anchor}`, rewritten: true };
}

/**
 * Which experiment's docs a document belongs to, plus the document's directory
 * within that collection (`''` at the top level, `adr` for `adr/x.md`).
 *
 * The path is matched against `DOCS_BASES` rather than parsed for the id,
 * because the base is a sibling checkout whose directory names the *repository*
 * (`harness-canopy`), not the site id (`canopy`). A directory-name guess would
 * mint `/harness-canopy/docs/hooks/`, a 404 on a link that works today.
 * Matching a path-segment suffix means the answer does not depend on where the
 * repository is checked out. Returns null when nothing matches — "not ours".
 */
export function matchDocsBase(pathname: string): { id: string; dir: string } | null {
  if (!pathname) return null;
  for (const [id, base] of Object.entries(DOCS_BASES)) {
    // `../harness-canopy/docs` → `harness-canopy/docs`, matched on segment
    // boundaries: `/a/b/harness-canopy/docs/x.md` matches, while
    // `/a/not-harness-canopy/docs/x.md` must not, so the match may only start
    // at the beginning of the path or right after a separator.
    const suffix = `${base.replace(/^\.\.\//, '').replace(/\/+$/, '')}/`;
    const at = pathname.indexOf(suffix);
    if (at === -1 || (at > 0 && pathname[at - 1] !== '/')) continue;
    const within = pathname.slice(at + suffix.length).replace(/\.md$/i, '');
    return { id, dir: within.includes('/') ? within.slice(0, within.lastIndexOf('/')) : '' };
  }
  return null;
}

/** The site id of a document's collection, or null when it is not ours. */
export function inferExperimentId(pathname: string): string | null {
  return matchDocsBase(pathname)?.id ?? null;
}

// Typed against Sätteri rather than built with `defineHastPlugin`: that helper
// only checks the name and returns the object, and importing it for that would
// drag `satteri` — ESM-only, with a native binding — into every consumer of
// this module, including the CommonJS test run. The literal is annotated
// directly, so the visitor signature is still checked.
const docsMdLinks: HastPluginDefinition = {
  name: 'astro-docs-md-links',
  element: {
    filter: ['a'],
    visit(node, ctx) {
      const href = (node as { properties?: Record<string, unknown> }).properties?.href;
      if (typeof href !== 'string') return;
      const pathname = ctx.fileURL ? decodeURIComponent(ctx.fileURL.pathname) : '';
      const docs = matchDocsBase(pathname);
      if (!docs) return;
      const { href: next, rewritten } = rewriteMdHref(href, docs.id, docs.dir);
      if (rewritten) ctx.setProperty(node, 'href', next);
    },
  },
};

export default docsMdLinks;
