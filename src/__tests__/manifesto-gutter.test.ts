/**
 * The manifesto's rail gutter must live on the manifesto only.
 *
 * Regression: `src/views/Manifesto.astro` used to reserve its rail gutter
 * with `:global(main#main) { padding-inline-start: 20rem }` inside a
 * min-width:1200px query. That rule landed in `Manifesto.*.css`, and every
 * page links every CSS chunk: `src/i18n/page-glob.ts` globs every
 * `src/pages` route module, and `hasCounterpart()` (called by BaseLayout and
 * Header on every page) makes each page's module graph reach every page —
 * and therefore every view's stylesheet. So `/`,
 * `/experiments/` and `/canopy/` were all pushed 20rem right at 1200px+.
 * The gutter now lives on the manifesto's own scoped `.manifesto` wrapper,
 * which Astro hashes — it can never match another page even though the
 * chunks are still linked everywhere.
 *
 * Contract, read over the built HTML/CSS in dist/ (CI builds before it
 * tests, so dist/ is present):
 * - no stylesheet linked from `/`, `/experiments/` or `/canopy/` gives
 *   `main#main` a non-zero `padding-inline-start`;
 * - the stylesheets linked from `/manifesto/` DO reserve the 20rem gutter
 *   on `.manifesto` under min-width:1200px.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const DIST = join(ROOT, 'dist');

function linkedCss(pageFile: string): string[] {
  const htmlPath = join(DIST, pageFile);
  if (!existsSync(htmlPath)) {
    throw new Error(
      `${pageFile} not found in dist/ — run \`npm run build\` before \`npm test\`.`,
    );
  }
  const html = readFileSync(htmlPath, 'utf8');
  const hrefs = [...html.matchAll(/<link[^>]+href="(\/_astro\/[^"]+\.css)"/g)].map(
    (m) => m[1],
  );
  return [...new Set(hrefs)].map((href) => {
    const file = join(DIST, href.slice(1));
    if (!existsSync(file)) throw new Error(`linked stylesheet missing: ${href}`);
    return readFileSync(file, 'utf8');
  });
}

function astroCssFiles(): string[] {
  const dir = join(DIST, '_astro');
  if (!existsSync(dir)) {
    throw new Error(`dist/_astro not found — run \`npm run build\` before \`npm test\`.`);
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(join(dir, f), 'utf8'));
}

// A `main#main` rule with a non-zero start padding — the leak signature.
// Scoped Astro selectors (`.manifesto[data-astro-…]`) never match this.
const LEAK = /main#main[^{}]*\{[^}]*padding-inline-start:\s*(?!0(?:[;\s}]))[^;}]+/;
// The gutter as scoped by Manifesto.astro: `.manifesto` (hashed by Astro,
// so it matches `.manifesto.xxx` too) reserving 20rem under min-width:1200px.
// The minifier (Lightning CSS) may rewrite the query to `(width>=1200px)`,
// so either spelling counts.
const GUTTER = /@media[^{]*1200px[^{]*\{[\s\S]{0,800}?\.manifesto[^{]*\{[^}]*padding-inline-start:\s*20rem/;

describe('manifesto rail gutter stays on the manifesto', () => {
  it.each([['/', 'index.html'], ['/experiments/', 'experiments/index.html'], ['/canopy/', 'canopy/index.html']])(
    'gives main#main no start padding on %s',
    (_label, pageFile) => {
      for (const css of linkedCss(pageFile)) {
        expect(css).not.toMatch(LEAK);
      }
    },
  );

  it('gives main#main no start padding in any built stylesheet', () => {
    for (const css of astroCssFiles()) {
      expect(css).not.toMatch(LEAK);
    }
  });

  it('keeps the 20rem gutter on .manifesto at 1200px and above', () => {
    const css = linkedCss('manifesto/index.html');
    expect(css.some((c) => GUTTER.test(c))).toBe(true);
  });
});
