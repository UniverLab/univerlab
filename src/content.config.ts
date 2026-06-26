import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Documentation is the single source of truth inside each experiment's repo.
// Locally we glob the sibling repositories' docs/ folders; in production this
// base would point at the checked-out repos in the build. Docs are English-only.
const docSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  order: z.number().default(99),
});

const docsCollection = (base: string) =>
  defineCollection({ loader: glob({ pattern: '**/*.md', base }), schema: docSchema });

export const collections = {
  'docs-canopy': docsCollection('../harness-canopy/docs'),
  'docs-texforge': docsCollection('../texforge/docs'),
  'docs-gitkit': docsCollection('../gitkit/docs'),
  'docs-ghscaff': docsCollection('../ghscaff/docs'),
  // NOTE: collection key renamed to cadspec; path still points at the real repo
  // dir `cadforge` until the GitHub repo is renamed.
  'docs-cadspec': docsCollection('../cadspec/docs'),
  'docs-demostage': docsCollection('../demostage/docs'),
};
