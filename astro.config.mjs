// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  trailingSlash: 'ignore',
  site: 'https://univerlab.org',
  markdown: {
    shikiConfig: {
      // Fixed dark editor theme for code blocks: keeps high contrast on both
      // light and dark circadian pages and provides colourful syntax highlighting.
      theme: 'github-dark',
    },
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
    }),
  ],
});
