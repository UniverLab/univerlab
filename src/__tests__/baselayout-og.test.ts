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

/**
 * og:type and the JSON-LD graph are the two props that let a page describe
 * itself as an article. They are asserted at source level (an Astro component
 * does not render under jest), which is the level the contract actually lives
 * at: what is declared, what is defaulted, and what the template emits.
 */
describe('BaseLayout ogType / article:modified_time / jsonLdGraph', () => {
  it('declares ogType as website|article, defaulting to website', () => {
    expect(src).toMatch(/ogType\?:\s*'website'\s*\|\s*'article'/);
    expect(src).toMatch(/ogType\s*=\s*'website'/);
  });

  it('emits og:type from the prop, not from a literal', () => {
    expect(src).toMatch(/<meta property="og:type" content=\{ogType\} \/>/);
    expect(src).not.toMatch(/<meta property="og:type" content="website" \/>/);
  });

  it('emits article:modified_time only when a date was passed', () => {
    expect(src).toMatch(/\{articleModifiedTime && <meta property="article:modified_time" content=\{articleModifiedTime\} \/>/);
  });

  it('declares the jsonLdGraph prop', () => {
    expect(src).toMatch(/jsonLdGraph\?:\s*Record<string, unknown>\[\]/);
    expect(src).toMatch(/jsonLdGraph,/);
  });

  it('lets the graph replace the standalone Organization script', () => {
    // Suppression is the whole point: emitting both defines Organization twice
    // and breaks "exactly one JSON-LD block on a docs page".
    expect(src).toMatch(/jsonLdGraph \?/);
    expect(src).toMatch(/'@graph': jsonLdGraph/);
    expect(src).toMatch(/serialize\(orgJsonLd\)/);
  });

  it('serializes every JSON-LD block through the same escape', () => {
    expect(src).toMatch(/replace\(\/</);
    expect(src).not.toMatch(/set:html=\{JSON\.stringify\(/);
  });
});
