/**
 * PAL2 guard — the GitKit pastel page is restyled from Supahub voltage violet
 * to orchid. This test pins the orchid scale's contrast and hue contracts so
 * the orchid recolor never regresses to illegible tints or purple.
 *
 * It lives next to PAL1's essence-single-source guard (allowed by the spec as
 * "a page test next to it"). Helpers mirror essence-single-source.test.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { byId } from '../lib/experiments';

const GLOBAL_CSS = resolve(__dirname, '..', 'styles', 'global.css');
const SURFACES_CSS = resolve(__dirname, '..', 'styles', 'surfaces.css');
const VIEW_ASTRO = resolve(__dirname, '..', 'views', 'experiments', 'Gitkit.astro');

const exp = byId('gitkit');
const ESSENCE = exp.essenceHex;           // #e06fc0 — the fill (single-source)
const ESSENCE_TEXT = exp.essenceTextHex ?? exp.essenceHex; // #d12da2 — text ink

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

/** sRGB channel lerp, matching CSS `color-mix(in srgb, A p%, B)` (p = t). */
function mixHex(a: string, b: string, t: number): string {
  const [ra, ga, ba] = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const [rb, gb, bb] = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const hx = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + hx(ra * t + rb * (1 - t)) + hx(ga * t + gb * (1 - t)) + hx(ba * t + bb * (1 - t));
}

/** Hue in degrees [0, 360) from a #rrggbb string. */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  let h: number;
  switch (mx) {
    case r: h = ((g - b) / d) % 6; break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4; break;
  }
  return ((h * 60) + 360) % 360;
}

/** Body of one CSS rule, from its selector through the matching close brace. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return '';
  return css.slice(start, css.indexOf('}', start));
}

/** Extract a `--name: #hex` literal from a CSS string. */
function hexOf(css: string, name: string): string | undefined {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  return m ? m[1] : undefined;
}

const globalCss = readFileSync(GLOBAL_CSS, 'utf8');
const surfCss = readFileSync(SURFACES_CSS, 'utf8');
const view = readFileSync(VIEW_ASTRO, 'utf8');

const orchidText = ESSENCE_TEXT;                        // #d12da2
const orchidFill = ESSENCE;                              // #e06fc0
const orchidSoft = mixHex(ESSENCE, '#ffffff', 0.12);     // tracks color-mix 12%
const orchidDeep = hexOf(globalCss, 'orchid-deep');      // #c22594
const orchidLt = hexOf(globalCss, 'orchid-lt');          // #f3c8e1

const WHITE = '#ffffff';
const INK = '#111827';       // pastel surface-ink
const BG_RAISE = '#f1f5f9';  // pastel surface-bg-raise (raised plates)
const TERM_BG = '#17141f';   // terminal dark plate

describe('GitKit pastel orchid scale', () => {
  it('resolves every orchid token from the registry or a declared literal', () => {
    expect(orchidText).toBe(ESSENCE_TEXT);
    expect(orchidFill).toBe(ESSENCE);
    expect(orchidDeep).toBeDefined();
    expect(orchidLt).toBeDefined();
  });

  it('keeps every orchid literal in pink territory (hue >= 300°)', () => {
    const literals: Record<string, string> = {
      'orchid-text': orchidText,
      'orchid-fill': orchidFill,
      'orchid-soft': orchidSoft,
      'orchid-deep': orchidDeep!,
      'orchid-lt': orchidLt!,
    };
    for (const [name, hex] of Object.entries(literals)) {
      expect(hue(hex)).toBeGreaterThanOrEqual(300);
    }
  });

  // Every approved pair must clear WCAG AA normal-text (4.5:1). orchid-text on
  // #f1f5f9 is intentionally NOT here — that pair is 4.16:1 and is the exact
  // defect PAL2 fixes (orchid-text is white-canvas only).
  it('holds >= 4.5:1 on every approved text/background pair', () => {
    expect(contrast(orchidText, WHITE)).toBeGreaterThanOrEqual(4.5);      // 4.56 text on white
    expect(contrast(orchidDeep!, WHITE)).toBeGreaterThanOrEqual(4.5);     // 5.27 CTA hover fill + white
    expect(contrast(WHITE, orchidDeep!)).toBeGreaterThanOrEqual(4.5);    // (symmetric)
    expect(contrast(orchidDeep!, BG_RAISE)).toBeGreaterThanOrEqual(4.5);  // 4.81 install bar + hook card
    expect(contrast(INK, orchidSoft)).toBeGreaterThanOrEqual(4.5);         // CTA resting label over gradient mid
    expect(contrast(orchidLt!, TERM_BG)).toBeGreaterThanOrEqual(4.5);     // 12.25 terminal plate
  });

  // The two contrast defects PAL2 fixes: --orchid-text (4.16:1) on a --bg-raise
  // plate must never be reinstated as accent text.
  it('does not use --orchid-text on the raised install-bar or hook-card accents', () => {
    // E5 — install bar (.cmd → --bg-raise #f1f5f9): .os-tab, .cmd-line, .copy
    expect(ruleBody(surfCss, "html[data-surface='pastel'] .os-tab")).not.toMatch(/--orchid-text/);
    expect(ruleBody(surfCss, "html[data-surface='pastel'] .cmd-line[data-os='unix']")).not.toMatch(/--orchid-text/);
    expect(ruleBody(surfCss, "html[data-surface='pastel'] .copy:hover")).not.toMatch(/--orchid-text/);
    // E6 — hook card (.card → --bg-raise #f1f5f9): .ok checkmark + code
    expect(ruleBody(view, '.hooks .ok')).not.toMatch(/--orchid-text/);
    expect(ruleBody(view, '.hooks code')).not.toMatch(/--orchid-text/);
  });
});
