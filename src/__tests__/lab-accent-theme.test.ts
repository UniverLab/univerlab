/**
 * Lab accent by theme: garnet #87222c by day, gold #e6c84a by night.
 *
 * Astro components aren't renderable in Jest, so these check the source-level
 * contract, the same way baselayout-og.test.ts does.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '..');
const GLOBAL = readFileSync(resolve(SRC, 'styles', 'global.css'), 'utf8');
const HEADER = readFileSync(resolve(SRC, 'components', 'Header.astro'), 'utf8');
const FOOTER = readFileSync(resolve(SRC, 'components', 'Footer.astro'), 'utf8');

/** Relative luminance of a #rrggbb colour (WCAG). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('lab accent token — garnet by day, gold by night', () => {
  it('defines the day accent as garnet in :root', () => {
    expect(GLOBAL).toMatch(/:root\s*\{[^}]*--accent:\s*#87222c;/s);
  });

  it('says on the token that it is garnet by day and gold by night', () => {
    expect(GLOBAL.toLowerCase()).toMatch(/garnet by day, gold by night/);
  });

  it('defines the lifted accent for the always-black footer', () => {
    expect(GLOBAL).toMatch(/--accent-lift:\s*#e0a2a6;/);
  });

  it('returns to gold under the night flag', () => {
    expect(GLOBAL).toMatch(
      /html\[data-bench-theme='night'\]\s*\{\s*--accent:\s*#e6c84a;\s*--accent-lift:\s*#e6c84a;/s,
    );
  });

  it('returns to gold for prefers-color-scheme: dark without an explicit day flag', () => {
    expect(GLOBAL).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
    const dark = GLOBAL.slice(GLOBAL.indexOf('@media (prefers-color-scheme: dark)'));
    expect(dark).toMatch(/html:not\(\[data-bench-theme='day'\]\)\s*\{\s*--accent:\s*#e6c84a;/s);
  });
});

describe('lab accent — no hard-coded gold remains in the chrome', () => {
  it.each([['Header', HEADER], ['Footer', FOOTER]])('%s carries no gold fallback or hard-code', (_name, src) => {
    expect(src).not.toMatch(/#c9a227/);
    expect(src).not.toMatch(/#f0d060/);
    expect(src).not.toMatch(/#e6c84a/);
    expect(src).not.toMatch(/230,\s*200,\s*74/);
  });

  it('Header sets no --ng-suffix: the wordmark suffix falls back to var(--accent)', () => {
    expect(HEADER).not.toMatch(/--ng-suffix:/);
  });

  it('Footer reads the sponsor, CTA and commit border from --accent-lift', () => {
    expect(FOOTER).toMatch(/\.icon-link\.sponsor\s*\{[^}]*color:\s*var\(--accent-lift\)/s);
    expect(FOOTER).toMatch(/\.cta\s*\{[^}]*color:\s*var\(--accent-lift\)/s);
    expect(FOOTER).toMatch(/border-left:\s*2px solid var\(--accent-lift\)/);
  });
});

describe('lab accent — search highlights follow the theme', () => {
  it('.find-hl mixes from var(--accent) instead of a fixed gold', () => {
    expect(GLOBAL).toMatch(
      /\.find-hl\s*\{\s*background:\s*color-mix\(in srgb,\s*var\(--accent\) 30%,\s*transparent\)/s,
    );
    expect(GLOBAL).toMatch(
      /\.find-hl\.find-active\s*\{\s*background:\s*color-mix\(in srgb,\s*var\(--accent\) 60%,\s*transparent\)/s,
    );
  });
});

describe('lab accent — WCAG floors', () => {
  it('holds garnet at >= 7.9:1 on the day parchment', () => {
    expect(contrast('#87222c', '#f4f0ea')).toBeGreaterThanOrEqual(7.9);
  });

  it('holds gold at >= 8:1 on the night slate', () => {
    expect(contrast('#e6c84a', '#222928')).toBeGreaterThanOrEqual(8);
  });

  it('holds the lifted garnet at >= 9:1 on the footer black', () => {
    expect(contrast('#e0a2a6', '#000000')).toBeGreaterThanOrEqual(9);
  });
});
