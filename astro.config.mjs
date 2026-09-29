// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import docsMdLinks from './src/plugins/docs-md-links.ts';

/**
 * Pages that must not be advertised to crawlers. Both spellings of each path:
 * `trailingSlash: 'ignore'` means the sitemap can carry either form, and the
 * sitemap's i18n block also lists the locale alternates.
 */
const SITEMAP_EXCLUDED = new Set([
  '/today',
  '/today/',
  '/es/today',
  '/es/today/',
]);

export default defineConfig({
  trailingSlash: 'ignore',
  site: 'https://univerlab.org',
  markdown: {
    shikiConfig: {
      // Fixed dark editor theme for code blocks: keeps high contrast on both
      // light and dark circadian pages and provides colourful syntax highlighting.
      theme: 'github-dark',
    },
    // Sätteri is Astro 7's default processor, but it has to be named here to
    // take a plugin. The docs collections render sibling repos' markdown
    // verbatim, so their relative `foo.md` links would 404 on the site.
    processor: satteri({ hastPlugins: [docsMdLinks] }),
  },
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
  // Prefetch internal links on hover for snappier navigation.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', es: 'es' },
      },
      // Only URLs that answer 200 as indexable HTML belong in the sitemap.
      // `/today/` and `/es/today/` render a heading plus a client-side fetch of
      // Wikipedia's feed — nothing indexable at build time, which is what Google
      // reported as a Soft 404 — so they are `noindex` in BaseLayout and are
      // dropped here too. A noindex URL in the sitemap is a reported
      // "Excluded by noindex" error, so the two must move together. Redirects
      // never build an HTML file, hence nothing else to exclude. Real
      // verification (every `<loc>` maps to a non-noindex file) lives in
      // scripts/check-seo.ts, which sees `dist/` where this filter cannot.
      filter: (page) => {
        const { pathname } = new URL(page);
        return !SITEMAP_EXCLUDED.has(pathname);
      },
    }),
  ],
});
