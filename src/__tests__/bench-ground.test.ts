/**
 * Tests for the redesign foundation: the two grounds (parchment by day, slate by
 * night), the three lab typefaces, and the data-bench-theme attribute.
 *
 * Astro components aren't renderable in Jest, so these check the source-level
 * contract, the same way baselayout-og.test.ts does.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '..');
const LAYOUT = readFileSync(resolve(SRC, 'layouts', 'BaseLayout.astro'), 'utf8');
const GLOBAL = readFileSync(resolve(SRC, 'styles', 'global.css'), 'utf8');
const SURFACES = readFileSync(resolve(SRC, 'styles', 'surfaces.css'), 'utf8');

/** The circadian IIFE is the one inline script that defines DG/DW/NB/NS. */
const circadianStart = LAYOUT.indexOf('var DG=');
const circadianEnd = LAYOUT.indexOf('</script>', circadianStart);
const CIRCADIAN = LAYOUT.slice(circadianStart, circadianEnd);

/** Returns the source of one function declaration or assignment inside the IIFE. */
function fnBody(marker: string): string {
  const start = CIRCADIAN.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return CIRCADIAN.slice(start, start + 2500);
}

describe('bench tokens on every page', () => {
  it('imports bench-tokens.css from BaseLayout', () => {
    expect(LAYOUT).toMatch(/import '\.\.\/styles\/bench-tokens\.css';/);
  });
});

describe('Google Fonts request', () => {
  it('requests exactly the three lab families with display=swap', () => {
    expect(LAYOUT).toContain("'Old+Standard+TT:ital,wght@0,400;0,700;1,400'");
    expect(LAYOUT).toContain("'EB+Garamond:ital,wght@0,400;0,500;1,400'");
    expect(LAYOUT).toContain("'Sometype+Mono:wght@400;500'");
    expect(LAYOUT).toContain("'&display=swap'");
  });

  it('no longer requests IBM Plex Mono, Inter or Space Grotesk anywhere in src', () => {
    const files = [LAYOUT, GLOBAL, SURFACES, readFileSync(resolve(SRC, 'components', 'Footer.astro'), 'utf8'), readFileSync(resolve(SRC, 'pages', 'status.astro'), 'utf8')];
    for (const file of files) {
      expect(file).not.toMatch(/IBM\+Plex|IBM Plex Mono|Space\+Grotesk|Space Grotesk/);
      expect(file).not.toMatch(/family=Inter|'Inter'/);
    }
  });

  it('keeps the webfont link non-render-blocking', () => {
    expect(LAYOUT).toMatch(/rel="stylesheet" href=\{fontHref\} media="print" onload="this\.media='all'"/);
  });
});

describe('global typefaces', () => {
  it('sets the three font tokens in :root', () => {
    expect(GLOBAL).toContain("--font-mono: 'Sometype Mono', ui-monospace, Menlo, monospace;");
    expect(GLOBAL).toContain("--font-body: 'EB Garamond', Garamond, Georgia, serif;");
    expect(GLOBAL).toContain("--font-serif: 'Old Standard TT', Georgia, serif;");
  });

  it('sets the body and serif tokens in the paper block too', () => {
    const paper = GLOBAL.slice(GLOBAL.indexOf("html[data-surface='paper'] {"));
    expect(paper.slice(0, 400)).toContain("--font-body: 'EB Garamond', Garamond, Georgia, serif;");
    expect(paper.slice(0, 400)).toContain("--font-serif: 'Old Standard TT', Georgia, serif;");
  });

  it('gives h1-h3 the serif token at weight 400', () => {
    expect(GLOBAL).toMatch(/h1, h2, h3 \{\s*font-family: var\(--font-serif\);\s*font-weight: 400;/);
  });

  it('sets long text at reading size, 1.6 line-height, 65ch, never italic', () => {
    expect(GLOBAL).toMatch(
      /\.prose, main p \{\s*font-size: clamp\(1\.06rem, 1rem \+ 0\.25vw, 1\.19rem\);\s*line-height: 1\.6;\s*max-width: 65ch;\s*font-style: normal;/,
    );
  });

  it('keeps inline IBM Plex strings out of the layout styles', () => {
    expect(LAYOUT).not.toContain('font-family:"IBM Plex Mono"');
    // The announcement toast and the 42 answer's inline-styled twin are both
    // gone: the answer arrives as an .slip.answer paper card, so no inline
    // mono token remains in the layout.
    expect(LAYOUT.match(/font-family:var\(--font-mono\)/g)?.length ?? 0).toBe(0);
  });

  it('lets surfaces keep their palette and use the shared typefaces', () => {
    expect(SURFACES).not.toMatch(/--font-(serif|body):\s+(?!var\(--font-mono\))/);
    expect(SURFACES).toMatch(/\.koan \{\s*font-family: var\(--font-body\)/);
  });
});

describe('default ground', () => {
  it('paints the parchment or slate tile on body only when no surface is set', () => {
    expect(GLOBAL).toMatch(
      /html:not\(\[data-surface\]\) body \{\s*background-color: var\(--bench-ground\);\s*background-image: var\(--bench-ground-tile\);\s*background-size: 341px;/,
    );
  });
});

describe('circadian palette endpoints', () => {
  it('DG is the day endpoint', () => {
    expect(CIRCADIAN).toContain(
      "var DG={'--bg':'#f4f0ea','--bg-raise':'#eee7dc','--ink':'#1d1510','--ink-dim':'#6b5a43','--ink-faint':'#8a7a63','--line':'#d9cfbf','--accent':'#8a6a2c','--canvas-color':'#6b5a43','--canvas-mute':'#b3a892'}",
    );
  });

  it('DW is the dawn and dusk endpoint', () => {
    expect(CIRCADIAN).toContain(
      "var DW={'--bg':'#f1e9dc','--bg-raise':'#e9dfcf','--ink':'#241a12','--ink-dim':'#6e5a40','--ink-faint':'#8f7b5e','--line':'#d6c8b2','--accent':'#9a5530','--canvas-color':'#9a5530','--canvas-mute':'#b3a089'}",
    );
  });

  it('NB is the night edge endpoint', () => {
    expect(CIRCADIAN).toContain(
      "NB={'--bg':'#1d2322','--bg-raise':'#171c1b','--ink':'#e4e3dc','--ink-dim':'#aeb3ab','--ink-faint':'#7b817b','--line':'#343c3a','--accent':'#d6955b','--canvas-color':'#aeb3ab','--canvas-mute':'#545e59'}",
    );
  });

  it('NS is the night endpoint', () => {
    expect(CIRCADIAN).toContain(
      "NS={'--bg':'#222928','--bg-raise':'#1a201f','--ink':'#ecebe4','--ink-dim':'#b9bdb5','--ink-faint':'#848a84','--line':'#3a4240','--accent':'#d9b878','--canvas-color':'#b9bdb5','--canvas-mute':'#5b6560'}",
    );
  });

  it('keeps the sunrise/sunset math and the scrub entry point', () => {
    expect(CIRCADIAN).toContain('window.scrubTime=function(hour)');
    expect(CIRCADIAN).toContain('window.resetScrub=function()');
    expect(CIRCADIAN).toContain('window.applyTheme=function(mode)');
    expect(CIRCADIAN).toContain('hf=6+2.5*s');
  });
});

describe('data-bench-theme follows the celestial body', () => {
  it('calc() sets benchTheme beside celestial', () => {
    const calc = fnBody('function calc()');
    expect(calc).toContain("r.dataset.celestial=day?'sun':'moon';r.dataset.benchTheme=day?'day':'night';");
  });

  it('scrubTime() sets benchTheme beside celestial', () => {
    const scrub = fnBody('window.scrubTime=function(hour)');
    expect(scrub).toContain("r.dataset.celestial=day?'sun':'moon';r.dataset.benchTheme=day?'day':'night';");
  });

  it('applyTheme() sets benchTheme for day and night overrides', () => {
    const apply = fnBody('window.applyTheme=function(mode)');
    expect(apply).toContain("document.documentElement.dataset.celestial='sun';document.documentElement.dataset.benchTheme='day';");
    expect(apply).toContain("document.documentElement.dataset.celestial='moon';document.documentElement.dataset.benchTheme='night';");
  });

  it('non-circadian pages set benchTheme once in the head, from the same day/night test', () => {
    expect(LAYOUT).toContain("root.dataset.benchTheme = isDay ? 'day' : 'night';");
    expect(LAYOUT.indexOf("root.dataset.benchTheme = isDay")).toBeLessThan(LAYOUT.indexOf('{circadian && ('));
  });
});
