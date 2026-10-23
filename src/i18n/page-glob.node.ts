/** Jest-only twin of `page-glob.ts`: same keys, read from the filesystem.
 *
 *  `import.meta.glob` does not exist under ts-jest, so `jest.config.cjs` maps
 *  `./page-glob` here. Keys are the `/src/pages/...` paths `hasCounterpart`
 *  parses; values are unused (Vite's build-time map holds module loaders).
 */
import { globSync } from 'node:fs';

export const pageGlob: Record<string, unknown> = Object.fromEntries(
  globSync('src/pages/**/*.astro', { cwd: process.cwd() }).map((f) => [`/${f}`, null]),
);
