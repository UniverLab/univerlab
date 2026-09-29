import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { DOCS_BASES } from './data/docs-bases';

// Documentation is the single source of truth inside each experiment's repo.
// Locally we glob the sibling repositories' docs/ folders; in production this
// base would point at the checked-out repos in the build. Docs are English-only.
const docSchema = z.object({
  // title is optional on purpose: sibling docs/ checkouts track other repos'
  // default branches, and a frontmatter-less file (canopy adr/0001-recipes on
  // main, 2026-09-25) must not fail the landing build. Pages fall back to the
  // entry id. See [...slug].astro.
  title: z.string().optional(),
  description: z.string().optional(),
  order: z.number().default(99),
});

const docsCollection = (base: string) =>
  defineCollection({ loader: glob({ pattern: '**/*.md', base }), schema: docSchema });

// One collection per entry in DOCS_BASES, which is also what the link-rewrite
// plugin and the redirects generator read — see src/data/docs-bases.ts.
export const collections = Object.fromEntries(
  Object.entries(DOCS_BASES).map(([id, base]) => [`docs-${id}`, docsCollection(base)]),
);
