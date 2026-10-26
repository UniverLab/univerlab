/** Build-time page inventory for `src/i18n/index.ts`.
 *
 *  Vite resolves this eagerly at compile time; the keys are the route source
 *  files (`/src/pages/...`). Tests run under ts-jest, where `import.meta.glob`
 *  does not exist — jest maps `./page-glob` to `page-glob.node.ts`, which
 *  produces the same keys from the filesystem.
 */
export const pageGlob: Record<string, unknown> = import.meta.glob('/src/pages/**/*.astro');
