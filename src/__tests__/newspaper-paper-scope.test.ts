/**
 * TodaysPaper's styles are global (the edition is injected at the edge and by
 * script, where scoped styles never reach), and every chunk's CSS is linked on
 * every page. So each rule must hang off `.paper`: a bare `.lead` once turned
 * the manifesto's opening paragraph into a two-column grid with a rule under it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '..', 'components', 'TodaysPaper.astro'), 'utf8');
const css = src.slice(src.indexOf('<style is:global>'), src.indexOf('</style>'));

describe("today's paper styles stay on the paper", () => {
  it('scopes every selector under .paper', () => {
    // The paper stays light in both phases: its night palette hangs off the
    // same .paper, switched by the circadian theme attribute the page sets.
    const nightOk = (sel: string): boolean =>
      sel === `[data-bench-theme='night'] .paper` ||
      sel === `:root:not([data-bench-theme='day']) .paper`;
    // The JS-gated paper: hidden pages and folded rows only exist after the
    // client script runs, so these rules hang the .js flag off .paper itself.
    const jsOk = (sel: string): boolean => sel.startsWith('.paper.js ');
    // The sheet viewport wraps the paper on narrow screens: its hooks hang
    // off .paper- (viewport, sheet, fit button), never off a bare name.
    const sheetOk = (sel: string): boolean => sel.startsWith('.paper-');
    const selectors = [...css.matchAll(/(?:^|\})\s*([^{}@]+?)\s*\{/gm)]
      .map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter((s) => s && !/^(to|from|<style)/.test(s) && !/^\d/.test(s));
    expect(selectors.length).toBeGreaterThan(30);
    for (const group of selectors) {
      for (const sel of group.split(',').map((s) => s.trim())) {
        expect(sel === '.paper' || sel.startsWith('.paper ') || nightOk(sel) || jsOk(sel) || sheetOk(sel)).toBe(true);
      }
    }
  });

  it('never turns dark: the night paper is a light grey, not slate', () => {
    expect(css).toContain('--p-ground: #e3e5e2');
    expect(css).toContain('--p-ink: #16191c');
    expect(css).not.toContain('var(--bench-c-slate)');
  });

  it('lays the front out as three columns with the lead spanning two', () => {
    // The lead takes two of the three columns with the rail beside it; the
    // lab mail, the feature ad and the columns span them all, and the house
    // notices foot the short columns instead of a row below them. No rail
    // is ever sized by the renderer, so no band is left empty.
    expect(css).toMatch(/\.paper \.front \{[^}]*grid-template-columns:\s*repeat\(3/);
    expect(css).toMatch(/\.paper \.front \.lead \{[^}]*grid-column:\s*1 \/ span 2/);
    expect(css).toMatch(/\.paper \.front \.rail \{[^}]*grid-column:\s*3/);
    expect(css).toContain('grid-column: 1 / -1;');
    expect(css).not.toContain('rail-rows');
    // The columns are as many as the day prints — one, two or three — never
    // a fixed three-track grid that would leave blank paper beside a short
    // band.
    expect(css).toMatch(
      /\.paper \.cols \{[^}]*grid-template-columns:\s*none[^}]*grid-auto-flow:\s*column[^}]*grid-auto-columns:\s*minmax\(0, 1fr\)/,
    );
  });

  it('fills the lead and the rail instead of leaving blank paper', () => {
    // The story is a full-height flex column and the lead engraving grows
    // into the slack; the rail matches the lead's height the same way.
    expect(css).toMatch(/\.paper \.lead \.story \{[^}]*display:\s*flex[^}]*height:\s*100%/);
    expect(css).toMatch(/\.paper \.photo--lead \{[^}]*min-height:\s*14rem/);
    expect(css).toMatch(/\.paper \.photo--lead img,[^}]*object-fit:\s*cover/);
    expect(css).toMatch(/\.paper \.rail \{[^}]*height:\s*100%/);
    expect(css).toContain('.paper .photo--medium');
  });

  it('sets bodies upright with hyphenation, never long italic blocks', () => {
    expect(css).toMatch(/\.paper \.item \.body \{[^}]*font-style:\s*normal/);
    expect(css).toMatch(/\.paper \.item \.body \{[^}]*hyphens:\s*auto/);
    expect(css).not.toMatch(/\.paper \.item \.body \{[^}]*italic/);
  });

  it('sizes pictures by weight: lead spanning, stamps small', () => {
    expect(css).toMatch(/\.paper \.item\.has-photo \{[^}]*grid-template-columns:\s*38%/);
    expect(css).toMatch(
      /\.paper \.item\.has-photo\.item--stamp \{[^}]*grid-template-columns:\s*56px/,
    );
  });

  it('sets the ads as period display ads, the feature across three', () => {
    expect(css).toMatch(/\.paper \.ad \{[^}]*border:\s*3px double/);
    expect(css).toContain('clamp(26px, 3.4vw, 40px)');
    expect(css).toMatch(/\.paper \.ad--feature \{[^}]*grid-template-columns:\s*1\.2fr 1\.5fr 1fr/);
    expect(css).toMatch(/\.paper \.ad \.ad-close \{[^}]*border-top:\s*3px double/);
  });

  it('prints without horizontal scroll: blocks, kept-together ads', () => {
    expect(css).toMatch(/@media print \{[^}]*\.paper \.front,\s*\.paper \.cols \{[^}]*display:\s*block/);
    expect(css).toMatch(/\.paper \.ad \{[^}]*break-inside:\s*avoid/);
  });

  it('sets pages 2 and 3 as one composed grid: display full, boxed half, small third', () => {
    expect(css).toMatch(/\.paper \.classifieds \{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.paper \.ad-display \{[^}]*grid-column:\s*1 \/ -1/);
    expect(css).toMatch(/\.paper \.ad-boxed,[^}]*grid-column:\s*span 3/);
    expect(css).toMatch(/\.paper \.ad-small \{[^}]*grid-column:\s*span 2/);
    expect(css).toContain('column-rule: 1px solid var(--p-rule)');
    expect(css).toMatch(/\.paper \.notice-run \.notice \{[^}]*break-inside:\s*avoid/);
  });

  it('keeps the display engraving inside its ad, never stretched by the entry', () => {
    expect(css).toMatch(/\.paper \.ad-display \{[^}]*grid-template-columns:[^}]*minmax\(0, 2fr\) minmax\(0, 3fr\)/);
    expect(css).toMatch(/\.paper \.ad-art \{[^}]*margin:\s*0/);
  });

  it('prints the classifieds ornaments like the paper halftones, under .paper', () => {
    // The engraved head, cuts, fleurons and hands read on the sheet in both
    // themes: sepia, multiplied in, never dark.
    expect(css).toContain('.paper .lab-head-ornament');
    expect(css).toMatch(/\.paper \.ad-cut img[^}]*width:\s*100%/);
    expect(css).toMatch(/\.paper \.notice-fleuron[^}]*grid-column:\s*1 \/ -1/);
    expect(css).toMatch(/\.paper \.manicule \{[^}]*width:\s*1\.7rem/);
    expect(css).toContain('grayscale(1) sepia(.22) contrast(1.12)');
    expect(css).toContain('mix-blend-mode: multiply');
  });

  it('lets the section head wrap instead of pushing a narrow sheet sideways', () => {
    // The ornament is capped at 16rem and the words sit beside it; on a phone
    // the pair does not fit on one line, so the row must wrap. Without this
    // the head is 33px wider than a 320px sheet and the paper scrolls.
    expect(css).toMatch(/\.paper \.lab-head \{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.paper \.lab-head \.lab-heading \{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.paper \.lab-head-ornament \{[^}]*flex:\s*0 1 auto/);
  });

  it('keeps the item photo at its own size: the frame never stretches with the entry', () => {
    // A long event body must not pull a tall grey mat below the photo: the
    // figure sits at the start of its grid area, so the halftone frame wraps
    // only the image — the same fixed portrait births and deaths print.
    expect(css).toMatch(/\.paper \.item\.has-photo \.photo \{[^}]*align-self:\s*start/);
  });
});
