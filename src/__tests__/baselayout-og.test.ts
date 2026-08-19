/**
 * Tests for BaseLayout ogImage prop — the fallback to /og.png.
 *
 * Astro components aren't directly renderable in Jest, so we verify
 * the source-level contract: the prop is declared, the fallback is
 * wired, and the meta tags use it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LAYOUT = resolve(__dirname, '..', 'layouts', 'BaseLayout.astro');
const src = readFileSync(LAYOUT, 'utf8');

describe('BaseLayout ogImage prop', () => {
  it('should declare ogImage as an optional prop', () => {
    expect(src).toMatch(/ogImage\?:\s*string/);
  });

  it('should destructure ogImage from Astro.props', () => {
    expect(src).toMatch(/ogImage:\s*ogImageProp/);
  });

  it('should fall back to /og.png when no ogImage prop is passed', () => {
    expect(src).toMatch(/ogImageProp\s*\?.*new URL\(ogImageProp,.*\)\.href\s*:\s*new URL\('\/og\.png'/);
  });

  it('should use the ogImage variable for og:image and twitter:image', () => {
    expect(src).toMatch(/og:image.*content=\{ogImage\}/);
    expect(src).toMatch(/twitter:image.*content=\{ogImage\}/);
  });

  it('should use the title for og:image:alt', () => {
    expect(src).toMatch(/og:image:alt.*content=\{title\}/);
  });
});
