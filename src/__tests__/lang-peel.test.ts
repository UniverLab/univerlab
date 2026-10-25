/**
 * Spec guard — the language switch is the page's turned corner and the lab has
 * one emphasis colour, the garnet of its wax seal.
 *
 * Colours and cues are parsed out of the sources, so reverting to the old gold
 * triangle, giving the emphasis a low-contrast value, or dropping the 550 ms
 * page turn fails here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { languages } from '../i18n';

const read = (...parts: string[]) => readFileSync(resolve(__dirname, '..', ...parts), 'utf8');
const TOKENS = read('styles', 'bench-tokens.css');
const HEADER = read('components', 'Header.astro');
const FOOTER = read('components', 'Footer.astro');
const GLOBAL = read('styles', 'global.css');
const LAYOUT = read('layouts', 'BaseLayout.astro');

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

/** The circadian palette pair (ground, accent) for one of the four slots. */
function circadian(n: 'DG' | 'DW' | 'NB' | 'NS') {
  const m = LAYOUT.match(new RegExp(n + "=\\{'--bg':'(#[0-9a-f]{6})'[^}]*?'--accent':'(#[0-9a-f]{6})'"));
  expect(m).not.toBeNull();
  return { ground: m![1], accent: m![2] };
}

/** Declarations of the first `{ … }` block that starts at `at`. */
function blockAt(at: number): string {
  const open = TOKENS.indexOf('{', at);
  const close = TOKENS.indexOf('}', open);
  return TOKENS.slice(open + 1, close);
}

function blockOf(needle: string, from = 0): string {
  const at = TOKENS.indexOf(needle, from);
  if (at < 0) throw new Error(`bench-tokens.css has no block for ${needle}`);
  return blockAt(at);
}

const DAY = blockOf(':root {');
const NIGHT = blockOf("[data-bench-theme='night'] {");
const NO_JS_MEDIA = (() => {
  const at = TOKENS.indexOf('@media (prefers-color-scheme: dark)');
  expect(at).toBeGreaterThan(-1);
  const m = TOKENS.slice(at).match(/:root:not\(\[data-bench-theme='day'\]\)\s*\{([\s\S]*?)\n\s*\}/);
  expect(m).not.toBeNull();
  return m![1];
})();

/** Value of a custom property in a block, or null. */
function token(block: string, name: string): string | null {
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

const PALETTE = DAY; // the palette lives on the first :root block

/** `var(--bench-c-x)` -> the palette literal; anything else as written. */
function resolveColour(value: string | null): string {
  expect(value).toBeTruthy();
  const v = value!.trim();
  const m = v.match(/^var\(--([\w-]+)\)$/);
  if (!m) return v;
  const lit = token(PALETTE, m[1]);
  expect(lit).toBeTruthy();
  expect(lit).toMatch(/^#[0-9a-f]{6}$/i);
  return lit!;
}

describe('emphasis token: the wax-seal garnet', () => {
  it('adds the garnet to the palette', () => {
    expect(token(PALETTE, 'bench-c-garnet')).toBe('#87222c');
  });

  it('plays the emphasis role by day and in both night blocks', () => {
    expect(token(DAY, 'bench-emphasis')).toBe('var(--bench-c-garnet)');
    expect(token(NIGHT, 'bench-emphasis')).toBe('#e0a2a6');
    // The no-JS night set (prefers-color-scheme) must carry it too, or a page
    // without JS keeps the day garnet on the slate.
    expect(token(NO_JS_MEDIA, 'bench-emphasis')).toBe('#e0a2a6');
  });

  it('keeps the emphasis legible on its own ground (8:1 day, >= 4.5:1 night)', () => {
    const day = contrast(resolveColour(token(DAY, 'bench-emphasis')), resolveColour(token(DAY, 'bench-ground')));
    const night = contrast(resolveColour(token(NIGHT, 'bench-emphasis')), resolveColour(token(NIGHT, 'bench-ground')));
    const noJsNight = contrast(resolveColour(token(NO_JS_MEDIA, 'bench-emphasis')), resolveColour(token(NO_JS_MEDIA, 'bench-ground')));
    expect(day).toBeGreaterThanOrEqual(7.9);
    expect(night).toBeGreaterThanOrEqual(4.5);
    expect(noJsNight).toBe(night);
    // The header heart now tracks the circadian accent as its ground shifts, so
    // the accent itself has to stay legible on that ground in all four slots.
    for (const n of ['DG', 'DW'] as const) {
      expect(contrast(circadian(n).accent, circadian(n).ground)).toBeGreaterThanOrEqual(4.4);
    }
    for (const n of ['NB', 'NS'] as const) {
      expect(contrast(circadian(n).accent, circadian(n).ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('documents what the emphasis is for', () => {
    expect(TOKENS).toMatch(/emphasis[^]*wax seal/i);
  });
});

describe('sponsor heart follows the page accent', () => {
  const rule = HEADER.match(/\n\s*nav a\.sponsor \{([^}]*)\}/);
  const hover = HEADER.match(/\n\s*nav a\.sponsor:hover \{([^}]*)\}/);

  it('paints the heart with the page accent, garnet as the fallback', () => {
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--accent,\s*var\(--bench-emphasis\)\)/);
    expect(rule![1]).not.toMatch(/#c9a227/);
  });

  it('lifts the hover towards the ink', () => {
    expect(hover).not.toBeNull();
    expect(hover![1]).toMatch(
      /color:\s*color-mix\(in srgb,\s*var\(--accent,\s*var\(--bench-emphasis\)\) 75%,\s*var\(--bench-line\)\)/,
    );
    expect(hover![1]).not.toMatch(/#f0d060/);
  });

  it('keeps the heartbeat, its pause, the hidden label and its placement', () => {
    expect(rule![1]).toMatch(/animation:\s*heartbeat 2s ease-in-out infinite/);
    expect(rule![1]).toMatch(/display:\s*inline-flex/);
    expect(rule![1]).toMatch(/margin-right:\s*0\.5rem/);
    expect(hover![1]).toMatch(/animation-play-state:\s*paused/);
    expect(HEADER).toMatch(/nav a\.sponsor \.heart-text \{ display: none; \}/);
    expect(HEADER).toMatch(/@keyframes heartbeat \{/);
    // reduced motion: no heartbeat
    const reduced = HEADER.slice(HEADER.indexOf('@media (prefers-reduced-motion: reduce) {', HEADER.indexOf('@keyframes heartbeat')));
    expect(reduced).toMatch(/nav a\.sponsor \{ animation: none !important; \}/);
  });
});

describe('language corner markup', () => {
  const anchor = HEADER.match(/<a\s+class="peel"[\s\S]*?<\/a>/);

  it('is an anchor that keeps the element contract', () => {
    expect(anchor).not.toBeNull();
    const markup = anchor![0];
    expect(markup).toMatch(/id="lang-corner"/);
    expect(markup).toMatch(/href=\{toggleHref\}/);
    expect(markup).toMatch(/data-set-lang=\{other\}/);
    expect(markup).toMatch(/hreflang=\{other\}/);
  });

  it('holds the revealed page with its label and the folded flap', () => {
    const markup = anchor![0];
    expect(markup).toMatch(/<span class="under">[\s\S]*<\/span><span class="flap"><\/span>/);
    expect(markup).toMatch(/<span class="label"><span class="short">\{languages\[other\]\}<\/span><span class="long">\{t\.header\.langLabel\[other\]\}<\/span><\/span>/);
  });

  it('names the other language in its aria-label, localized', () => {
    expect(anchor![0]).toMatch(/aria-label=\{`\$\{t\.header\.switchTo\} \$\{t\.header\.langLabel\[other\]\}`\}/);
  });

  it('has dropped the old top-right triangle', () => {
    expect(HEADER).not.toMatch(/lang-corner-text/);
    expect(HEADER).not.toMatch(/border-width:\s*0 38px/);
    expect(HEADER).not.toMatch(/\.lang-corner\b/);
    expect(HEADER).not.toMatch(/border-width:\s*0 32px/);
  });

  it('shows the short code at rest and the full name when lifted', () => {
    expect(languages).toEqual({ en: 'EN', es: 'ES' });
    expect(HEADER).toMatch(/\.peel \.long \{ display: none; \}/);
    expect(HEADER).toMatch(
      /\.peel:hover \.short,\s*\.peel:focus-visible \.short,\s*\.peel\.turning \.short \{ display: none; \}/,
    );
    expect(HEADER).toMatch(
      /\.peel:hover \.long,\s*\.peel:focus-visible \.long,\s*\.peel\.turning \.long \{ display: inline; \}/,
    );
  });
});

describe('language corner styles', () => {
  const peel = HEADER.match(/\n\s*\.peel \{([^}]*)\}/);
  const lift = HEADER.match(/\.peel:hover,\s*\.peel:focus-visible \{([^}]*)\}/);
  const turning = HEADER.match(/\.peel\.turning \{([^}]*)\}/);
  const under = HEADER.match(/\.peel \.under \{([^}]*)\}/);
  const flap = HEADER.match(/\.peel \.flap \{([^}]*)\}/);
  const label = HEADER.match(/\.peel \.label \{([^}]*)\}/);

  it('sits at the bottom-right corner inside the safe-area insets', () => {
    expect(peel).not.toBeNull();
    const css = peel![1];
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/right:\s*0/);
    expect(css).toMatch(/bottom:\s*0/);
    expect(css).toMatch(/width:\s*var\(--s\)/);
    expect(css).toMatch(/height:\s*var\(--s\)/);
    expect(css).toMatch(/env\(safe-area-inset-right/);
    expect(css).toMatch(/env\(safe-area-inset-bottom/);
    expect(css).toMatch(/--s:\s*58px/);
    expect(css).toMatch(/transition:[^;]*0\.28s/);
  });

  it('lifts to 86px on hover and focus', () => {
    expect(lift).not.toBeNull();
    expect(lift![1]).toMatch(/--s:\s*86px/);
    expect(peel![1]).not.toMatch(/--s:\s*86px/);
  });

  it('turns the page across the screen in 0.55s', () => {
    expect(turning).not.toBeNull();
    expect(turning![1]).toMatch(/--s:\s*160vmax/);
    expect(turning![1]).toMatch(/transition-duration:\s*0\.55s/);
  });

  it('reveals the page underneath as a triangle in the next paper', () => {
    expect(under).not.toBeNull();
    expect(under![1]).toMatch(/clip-path:\s*polygon\(100% 0, 100% 100%, 0 100%\)/);
    expect(under![1]).toMatch(/background:\s*var\(--next-paper\)/);
    expect(under![1]).toMatch(/box-shadow:\s*inset/);
    expect(peel![1]).toContain('--next-paper: color-mix(in srgb, var(--bg) 82%, transparent);');
    expect(peel![1]).toContain('--flap-a: color-mix(in srgb, var(--bg-raise) 92%, var(--ink) 8%);');
    expect(peel![1]).toContain('--flap-b: var(--bg-raise);');
    expect(peel![1]).toContain('--flap-c: color-mix(in srgb, var(--line) 80%, var(--ink) 20%);');
    expect(label![1]).toMatch(/color:\s*var\(--bench-line\)/);
  });

  it("folds the corner as the paper's back, with a light streak", () => {
    expect(flap).not.toBeNull();
    expect(flap![1]).toMatch(/clip-path:\s*polygon\(0 0, 100% 0, 0 100%\)/);
    expect(flap![1]).toMatch(/linear-gradient\(135deg/);
    expect(flap![1]).toMatch(/var\(--flap-c\)/);
    expect(flap![1]).toMatch(/var\(--flap-a\)/);
    expect(flap![1]).toMatch(/var\(--flap-b\)/);
    expect(flap![1]).toMatch(/filter:\s*drop-shadow/);
    expect(HEADER).toMatch(/\.peel \.flap::after \{[\s\S]*?linear-gradient\(135deg, transparent 46%/);
  });

  it('prints the label in small caps Old Standard TT 13px', () => {
    expect(label).not.toBeNull();
    expect(label![1]).toMatch(/font-family:\s*var\(--font-serif\)/);
    expect(label![1]).toMatch(/font-variant:\s*small-caps/);
    expect(label![1]).toMatch(/font-size:\s*13px/);
  });

  it('takes its ground from the page, never the hour', () => {
    for (const hex of ['#e9e1d0', '#d6c8ad', '#f2eadb', '#c4b28d', '#2c3432', '#3a4441', '#4b5753', '#2e3634']) {
      expect(HEADER).not.toContain(hex);
    }
    expect(HEADER).not.toContain('data-bench-theme');
    expect(HEADER).not.toContain('prefers-color-scheme: dark');
  });

  it('stacks above content but below the dialogs', () => {
    const z = Number(peel![1].match(/z-index:\s*(\d+)/)![1]);
    const dialogZ = Math.max(...[...GLOBAL.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1])));
    expect(z).toBeGreaterThan(30); // nav flyout / panels
    expect(z).toBeLessThan(dialogZ); // palette, mail letter, paper slips
    // The footer is a later sibling: without a stacking context on the header the
    // fixed corner would be painted under the footer's ground.
    expect(HEADER).toMatch(/header \{ position: relative; z-index: 1; \}/);
  });

  it('does not move under prefers-reduced-motion', () => {
    const reduced = HEADER.slice(HEADER.indexOf('.peel:focus-visible { outline'));
    expect(reduced).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.peel \{ transition: none; \}/);
  });
});

describe('the page turn navigates to the other language', () => {
  const script = HEADER.match(
    /const reduceMotion = matchMedia[\s\S]*?delete a\.dataset\.turning;/,
  );

  it('persists the explicit choice first', () => {
    expect(script).not.toBeNull();
    expect(script![0]).toMatch(/localStorage\.setItem\('univerlab-lang'/);
  });

  it('turns the page, then navigates 550 ms later', () => {
    expect(script![0]).toMatch(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
    expect(script![0]).toMatch(/classList\.add\('turning'\)/);
    expect(script![0]).toMatch(/setTimeout\(\(\) => location\.assign\(a\.href\), 550\)/);
    // preventDefault only when the turn plays
    const guard = script![0].indexOf('if (reduceMotion) return;');
    const prevent = script![0].indexOf('event.preventDefault()');
    expect(guard).toBeGreaterThan(-1);
    expect(prevent).toBeGreaterThan(guard);
    // a second click/Enter must not restart the sweep
    expect(script![0]).toMatch(/a\.dataset\.turning/);
  });

  it('puts the corner back when the other language is left with Back', () => {
    // The browser restores this page from the bfcache with .turning still on:
    // without the reset the sheet covers the viewport and the link is locked.
    expect(script![0]).toMatch(/addEventListener\('pageshow'/);
    expect(script![0]).toMatch(/classList\.remove\('turning'\)/);
    expect(script![0]).toMatch(/delete a\.dataset\.turning/);
  });
});

describe('the corner clears the footer', () => {
  it('pads the footer at least 64px on narrow screens', () => {
    const media = FOOTER.slice(FOOTER.indexOf('@media (max-width: 40rem)'));
    const m = media.match(/footer \{ padding-bottom: ([\d.]+)rem; \}/);
    expect(m).not.toBeNull();
    expect(Number(m![1]) * 16).toBeGreaterThanOrEqual(64);
  });

  it('keeps the base line clear at every width', () => {
    const m = FOOTER.match(/\n\s*\.base \{ padding-bottom: ([\d.]+)rem; \}/);
    expect(m).not.toBeNull();
    expect(Number(m![1]) * 16).toBeGreaterThanOrEqual(64);
  });
});

describe('the language names are translated in both catalogs', () => {
  it('names the other language in English and Spanish', () => {
    expect(en.header.switchTo).toBe('Switch to');
    expect(es.header.switchTo).toBe('Cambiar a');
    expect(en.header.langLabel).toEqual({ en: 'English', es: 'Español' });
    expect(es.header.langLabel).toEqual({ en: 'English', es: 'Español' });
    expect(Object.keys(en.header.langLabel).sort()).toEqual(Object.keys(es.header.langLabel).sort());
  });

  it('has no English label left hard-coded in the header markup', () => {
    expect(HEADER).not.toMatch(/aria-label="Switch to/);
  });
});
