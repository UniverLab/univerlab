/**
 * Spec guard — every experiment's docs sit on the lab's circadian ground
 * (parchment by day, slate by night, `--bench-ground` + tile), never on the
 * experiment's surface canvas, while the doc's headings and links carry that
 * experiment's accent at >= 4.5:1 on the ground of the phase being read.
 *
 * The accent mix is parsed out of the layout, so raising the day percentage
 * (e.g. back to 70%) or re-attaching `bg={exp.bg}` fails here. Helpers mirror
 * gitkit-contrast.test.ts.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { byId, experiments } from '../lib/experiments';

const LAYOUT = readFileSync(resolve(__dirname, '..', 'layouts', 'DocsLayout.astro'), 'utf8');
const TOKENS = readFileSync(resolve(__dirname, '..', 'styles', 'bench-tokens.css'), 'utf8');

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

/** The doc accent rules, read back from the layout: [percentage, ink hex]. */
function accentMix(selector: string): { pct: number; ink: string } {
  const re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      String.raw`\s*\{[^}]*--doc-accent:\s*color-mix\(in srgb,\s*var\(--doc-essence\)\s*([\d.]+)%\s*,\s*(#[0-9a-f]{6})`,
    'i',
  );
  const m = re.exec(LAYOUT);
  if (!m) throw new Error(`missing --doc-accent rule for "${selector}"`);
  return { pct: Number(m[1]) / 100, ink: m[2] };
}

// The lab's ground, read from the theme spec rather than repeated: day is the
// first `--bench-ground` declaration, night the one inside [data-bench-theme].
const dayGround = /--bench-ground:\s*var\(--bench-c-([a-z-]+)\)/.exec(TOKENS);
const nightSlice = TOKENS.slice(TOKENS.indexOf("[data-bench-theme='night']"));
const nightGround = /--bench-ground:\s*var\(--bench-c-([a-z-]+)\)/.exec(nightSlice);
const GROUND = {
  day: dayGround ? hexOf(TOKENS, dayGround[1]) : undefined,
  night: nightGround ? hexOf(TOKENS, nightGround[1]) : undefined,
};

/** `--bench-c-name: #hex` from bench-tokens.css. */
function hexOf(css: string, name: string): string | undefined {
  const m = css.match(new RegExp(`--bench-c-${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  return m ? m[1] : undefined;
}

const DOCS = experiments.filter((e) => e.hasDocs).map((e) => e.id);

const DAY = accentMix('.prose-doc');
const NIGHT = accentMix("html[data-bench-theme='night'] .prose-doc");

/** Labeled assertion: a contrast failure must name the experiment and phase. */
function atLeast45(label: string, value: number) {
  if (!(value >= 4.5)) {
    throw new Error(`${label}: ${value.toFixed(2)}:1 is below the 4.5:1 floor`);
  }
}

describe('Docs on the lab ground', () => {
  it("drops the experiment's background runner so the bench ground shows", () => {
    expect(LAYOUT).toContain('bg={false}');
    expect(LAYOUT).not.toMatch(/bg=\{exp\.bg\}/);
    expect(LAYOUT).not.toContain('mutedCanvas');
    // No surface prop either — `html:not([data-surface])` is what paints
    // --bench-ground + --bench-ground-tile on the body.
    expect(LAYOUT).not.toMatch(/surface=/);
    expect(GROUND.day).toBe('#f4f0ea');
    expect(GROUND.night).toBe('#222928');
  });

  it('keeps the page circadian and closes it with the forged line', () => {
    expect(LAYOUT).toMatch(/\n\s+circadian\n/);
    expect(LAYOUT).toContain('expId={id as ExperimentId}');
  });

  it('marks the header with the machine plate at 72px in both phases', () => {
    expect(LAYOUT).toMatch(/<Machine id=\{id\} ink="theme" height="72px" \/>/);
    // Machine's phone fallback would grow the mark to 150px without this.
    expect(LAYOUT).toMatch(/--machine-h-phone:\s*72px/);
    // And its `margin-inline:auto` would float the plate off the name: the
    // override lives in the unscoped block so it beats the component's rule.
    expect(LAYOUT).toMatch(/html \.doc-head \.machine \{\s*margin-inline: 0;\s*flex: none;\s*\}/);
    expect(LAYOUT).not.toContain(':deep(');
    expect(LAYOUT).toMatch(/class="doc-head"/);
    expect(LAYOUT).toContain('t.common.docsHome');
    expect(LAYOUT).toMatch(/--doc-essence:\s*\$\{exp\.essenceHex\}/);
    // The breadcrumb is a <nav> too. A bare `nav { flex-direction: column;
    // border-left }` — the sidebar's rule — matched it and stacked every
    // crumb on its own line behind a stray vertical rule, so the sidebar's
    // nav rules must stay scoped to `aside`.
    expect(LAYOUT).toMatch(/aside nav \{\s*display: flex;\s*flex-direction: column;/);
    expect(LAYOUT).not.toMatch(/\n\s{2}nav\s*\{/);
  });

  it('paints h2, h3 and links with --doc-accent, body text with --ink', () => {
    expect(LAYOUT).toMatch(
      /\.prose-doc h2,\s*\.prose-doc h3,\s*\.prose-doc a\s*\{\s*color: var\(--doc-accent\);\s*\}/,
    );
    expect(LAYOUT).not.toMatch(/\.prose-doc a\s*\{\s*color: var\(--accent\)/);
    expect(LAYOUT).toMatch(
      /\.prose-doc p,\s*\.prose-doc li\s*\{\s*color: var\(--ink\);\s*line-height: 1\.6;\s*max-width: 70ch;\s*\}/,
    );
    // The sidebar is chrome, not the doc body: it keeps the site accent.
    expect(LAYOUT).toMatch(/\.item\.active\s*\{\s*color: var\(--accent\)/);
  });

  it('sets both phase mixes against their own ink', () => {
    expect(DAY.pct).toBeGreaterThan(0);
    expect(DAY.ink).toBe('#1d1510');
    expect(NIGHT.ink).toBe('#ecebe4');
  });

  it('reads in the lab type at the long-text size and 70ch', () => {
    expect(LAYOUT).toMatch(/font-family: var\(--font-body\);\s*font-size: clamp\(/);
    expect(LAYOUT).toMatch(/line-height: 1\.6;\s*max-width: 70ch;/);
    expect(LAYOUT).toMatch(/\.prose-doc code\s*\{[^}]*font-family: var\(--font-mono\)/s);
    expect(LAYOUT).toMatch(/\.prose-doc code\s*\{[^}]*background: var\(--bg-raise\)/s);
  });
});

describe('Docs link contrast — every experiment, both phases', () => {
  it('has docs to check', () => {
    expect(DOCS.length).toBeGreaterThanOrEqual(5);
    expect(DOCS).toEqual(['canopy', 'texforge', 'gitkit', 'ghscaff', 'demostage']);
  });

  it('clears 4.5:1 on the day ground and on the night ground', () => {
    const measured: Record<string, number> = {};
    for (const id of DOCS) {
      const essence = byId(id).essenceHex;
      const dayHex = mixHex(essence, DAY.ink, DAY.pct);
      const nightHex = mixHex(essence, NIGHT.ink, NIGHT.pct);
      measured[`${id} day`] = Number(contrast(dayHex, GROUND.day!).toFixed(2));
      measured[`${id} night`] = Number(contrast(nightHex, GROUND.night!).toFixed(2));
      atLeast45(`${id} day (${dayHex} on ${GROUND.day})`, measured[`${id} day`]);
      atLeast45(`${id} night (${nightHex} on ${GROUND.night})`, measured[`${id} night`]);
    }
    // Kept in one place so a report can paste the numbers straight from here.
    expect(Object.keys(measured).length).toBe(DOCS.length * 2);
  });
});
