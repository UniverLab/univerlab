// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://univerlab.dev',
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
});
