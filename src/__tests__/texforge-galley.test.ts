/**
 * Tests for the TeXForge hero galley-proof figure — the original editorial
 * figure that replaced the network-mark SVG.
 *
 * Astro components aren't directly renderable in Jest, so we verify
 * the source-level contract by reading the source files as text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEXFORGE = resolve(__dirname, '..', 'views', 'experiments', 'Texforge.astro');
const GALLEY = resolve(__dirname, '..', 'components', 'GalleyProof.astro');
const SURFACES = resolve(__dirname, '..', 'styles', 'surfaces.css');

const texforgeSrc = readFileSync(TEXFORGE, 'utf8');
const galleySrc = readFileSync(GALLEY, 'utf8');
const surfacesSrc = readFileSync(SURFACES, 'utf8');

describe('GalleyProof hero figure', () => {
  it('should render GalleyProof in the hero-visual slot', () => {
    expect(texforgeSrc).toMatch(/<GalleyProof\s+slot="hero-visual"/);
  });

  it('should be an inline SVG with viewBox 420x340 and aria-hidden', () => {
    expect(galleySrc).toMatch(/<svg[^>]*viewBox="0 0 420 340"/);
    expect(galleySrc).toMatch(/aria-hidden="true"/);
  });

  it('should carry the page furniture as real text', () => {
    expect(galleySrc).toContain('∫₀¹ f(x) dx = Σₙ aₙ');
    expect(galleySrc).toContain('(1)');
    expect(galleySrc).toMatch(/Fig\. 1/);
    expect(galleySrc).toContain('UNIVERLAB · EXP-002');
    expect(galleySrc).toContain('Abstract');
    expect(galleySrc).toContain('¶');
    expect(galleySrc).toContain('¹');
  });

  it('should have three margin marks: caret, deletion loop, pilcrow', () => {
    expect(galleySrc).toContain('gp-caret');
    expect(galleySrc).toContain('gp-loop');
    expect(galleySrc).toContain('gp-pil');
  });

  it('should keep the hero-visual footprint so the hero layout does not shift', () => {
    expect(galleySrc).toMatch(/width:\s*min\(100%,\s*24rem\)/);
    expect(surfacesSrc).toMatch(
      /\[data-surface='paper'\]\s*\.galley-proof\s*\{\s*width:\s*min\(100%,\s*18rem\)/,
    );
  });

  it('should run an autonomous CSS loop with no JS', () => {
    expect(galleySrc).toMatch(/@keyframes/);
    expect(galleySrc).toMatch(/15s/);
    expect(galleySrc).toMatch(/infinite/);
    expect(galleySrc).not.toMatch(/<script>/);
    expect(galleySrc).not.toMatch(/addEventListener/);
    expect(galleySrc).not.toMatch(/IntersectionObserver/);
  });

  it('should set body text lines as hairline strokes, never lorem text', () => {
    expect(galleySrc).not.toMatch(/lorem/i);
    expect(galleySrc).toMatch(/\.gp-text[^{]*\{[^}]*stroke-width:\s*0\.8/);
  });

  it('should show a static clean page with faint checks under reduced motion', () => {
    expect(galleySrc).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(galleySrc).toMatch(/prefers-reduced-motion[\s\S]*?animation:\s*none/);
    // The base values ARE the static frame (global.css zeroes animations): the
    // page is clean, so marks/leaders/highlights start invisible and only the
    // three resolved ✓ sit in the margin.
    expect(galleySrc).toMatch(/\.gp-ok-1[^{]*\{[^}]*opacity:\s*0\.35/);
    expect(galleySrc).toMatch(/\.gp-hl-1[^{]*\{[^}]*opacity:\s*0[^.]/);
    expect(galleySrc).toMatch(/\.gp-caret[^{]*\{[^}]*opacity:\s*0/);
    expect(galleySrc).toMatch(/\.gp-loop[^{]*\{[^}]*opacity:\s*0/);
    expect(galleySrc).toMatch(/\.gp-pil\b[^{]*\{[^}]*opacity:\s*0/);
    expect(galleySrc).toMatch(/\.gp-lead-1[^{]*\{[^}]*opacity:\s*0/);
  });

  it('should hide the decorative figure from assistive tech', () => {
    expect(galleySrc).toMatch(/<div class="galley-proof"[^>]*aria-hidden="true"/);
  });
});

describe('Network mark removal', () => {
  it('should contain no element of the old network mark', () => {
    expect(texforgeSrc).not.toMatch(/network-mark|network-lines|network-nodes|tf-node-breathe|tf-dash-drift|#e2e67d/);
    expect(surfacesSrc).not.toMatch(/\.network-mark/);
    expect(galleySrc).not.toMatch(/e2e67d/);
  });

  it('should keep the ASCII motif, drop cap, pull quote, plate and colophon', () => {
    expect(texforgeSrc).toContain('ascii-motif');
    expect(texforgeSrc).toContain('::first-letter');
    expect(texforgeSrc).toContain('pull');
    expect(texforgeSrc).toContain('plate-fig');
    expect(texforgeSrc).toContain('colophon');
  });
});
