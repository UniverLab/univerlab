/** Build-time page inventory for `src/i18n/index.ts`.
 *
 *  Vite resolves this eagerly at compile time; the keys are the route source
 *  files (`/src/pages/...`). Tests run under ts-jest, where `import.meta.glob`
 *  does not exist — jest maps `./page-glob` to `page-glob.node.ts`, which
 *  produces the same keys from the filesystem.
 *
 *  Only the keys are read. The glob asks for each page's raw source, never
 *  the component: a component import makes Astro bundle every page's CSS into
 *  every page that touches i18n, which is all of them.
 */
export const pageGlob: Record<string, unknown> = import.meta.glob('/src/pages/**/*.astro', {
  query: '?raw',
  import: 'default',
});
