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

  it('lays the front out as one stack: the lead across, the columns under it', () => {
    // No side rail: the lead runs across the front and every other block
    // (lab mail, feature notice, columns) stacks under it, so nothing beside
    // the lead can end short of it and leave a hole.
    expect(css).toMatch(/\.paper \.front \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(css).not.toContain('.rail');
    expect(css).not.toContain('rail-rows');
    expect(css).not.toContain('lead-cols');
    // The columns are as many as the day prints — one, two or three — never
    // a fixed three-track grid that would leave blank paper beside a short
    // band.
    expect(css).toMatch(
      /\.paper \.cols \{[^}]*grid-template-columns:\s*none[^}]*grid-auto-flow:\s*column[^}]*grid-auto-columns:\s*minmax\(0, 1fr\)/,
    );
  });

  it('sets the lead photo beside the lead\'s words, sized by the fit', () => {
    // Two tracks on a wide sheet: the words take the rest, the photo its
    // own width, one gutter apart; the mat hugs the picture.
    expect(css).toMatch(/\.paper \.lead:not\(\.lead--text\) \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
    expect(css).toMatch(/\.paper \.lead \{[^}]*gap:\s*12px 24px/);
    expect(css).toMatch(/\.paper \.photo--lead img \{[^}]*width:\s*100%[^}]*height:\s*auto/);
    // The text sets in the page's own columns, ruled like the letters.
    expect(css).toMatch(/\.paper \.lead-text \{[^}]*column-width:\s*17rem[^}]*column-gap:\s*32px[^}]*column-rule:\s*1px solid/);
    // The site's reading measure never caps a paragraph inside the sheet.
    expect(css).toMatch(/\.paper \.front p \{[^}]*max-width:\s*none/);
    // No float, no centred span: the old side-photo rules are gone.
    expect(css).not.toMatch(/photo--lead--portrait[^{]*\{[^}]*float:\s*right/);
  });

  it('puts the headline across the lead when the fit asks for it', () => {
    expect(css).toMatch(/\.paper \.lead\.lead--across \.lead-main \{[^}]*display:\s*contents/);
    expect(css).toMatch(/\.paper \.lead\.lead--across \.kicker, \.paper \.lead\.lead--across h2 \{[^}]*grid-column:\s*1 \/ -1/);
    expect(css).toMatch(/\.paper \.lead\.lead--across \.photo--lead \{[^}]*grid-column:\s*2[^}]*grid-row:\s*3/);
  });

  it('keeps the two-track lead on the scaled sheet, outside any media query', () => {
    // Phones draw the same scaled sheet as desktop, so the sheet carries
    // its own copy of the lead's two tracks outside the 48rem query.
    const at = css.indexOf('.paper-viewport.sheet .paper .lead:not(.lead--text) {');
    expect(at).toBeGreaterThan(0);
    let depth = 0;
    for (const ch of css.slice(0, at)) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    expect(depth).toBe(0);
  });

  it('never spreads free space into bands', () => {
    // Free space belongs to content, not to the gaps between the masthead
    // blocks: the edition and the front pack their blocks at the start,
    // columns sit at their own height, and the classifieds bodies wrap
    // their ads instead of stretching past them.
    expect(css).toMatch(/\.paper #edition \{[^}]*align-content:\s*start/);
    expect(css).toMatch(/\.paper \.front \{[^}]*align-content:\s*start/);
    expect(css).toMatch(/\.paper \.col \{[^}]*align-self:\s*start/);
    expect(css).toMatch(/\.paper #lab-body, \.paper #lab2-body \{[^}]*flex:\s*0 0 auto/);
    expect(css).not.toContain('fit-natural');
  });

  it('sets bodies upright with hyphenation, never long italic blocks', () => {
    expect(css).toMatch(/\.paper \.item \.body \{[^}]*font-style:\s*normal/);
    expect(css).toMatch(/\.paper \.item \.body \{[^}]*hyphens:\s*auto/);
    expect(css).not.toMatch(/\.paper \.item \.body \{[^}]*italic/);
  });

  it('sizes pictures by weight: events a share of the column, stamps small', () => {
    expect(css).toMatch(/\.paper \.item\.has-photo \.photo \{[^}]*float:\s*left[^}]*width:\s*38%/);
    expect(css).toMatch(/\.paper \.item\.has-photo\.item--stamp \.photo \{[^}]*width:\s*56px/);
  });

  it('sets the ads as period display notices, the feature across three', () => {
    expect(css).toMatch(/\.paper aside\.notice \{[^}]*border:\s*3px double/);
    expect(css).toContain('clamp(26px, 3.4vw, 40px)');
    expect(css).toMatch(/\.paper \.notice--feature, \.paper \.front > aside\.notice--wide \{[^}]*grid-template-columns:\s*1\.2fr 1\.5fr 1fr/);
    expect(css).toMatch(/\.paper aside\.notice \.notice-close \{[^}]*border-top:\s*3px double/);
  });

  it('prints without horizontal scroll: blocks, kept-together ads', () => {
    expect(css).toMatch(/@media print \{[^}]*\.paper \.front,\s*\.paper \.cols \{[^}]*display:\s*block/);
    expect(css).toMatch(/\.paper aside\.notice \{[^}]*break-inside:\s*avoid/);
  });

  it('sets pages 2 and 3 as five ruled columns that fill top to bottom, the lead across them', () => {
    expect(css).toMatch(/\.paper \.classifieds \{[^}]*display: block;[^}]*column-count: 5/);
    expect(css).toContain('column-rule: 1px solid var(--p-rule)');
    expect(css).toMatch(/\.paper \.classifieds > \* \{[^}]*break-inside: avoid/);
    expect(css).toMatch(/\.paper \.classifieds > \.lead-story \{[^}]*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 3fr\)/);
    // Each notice ends on a rule; the framed treatments carry their own frames.
    expect(css).toMatch(/\.paper \.classifieds > \.log-entry:not\(\.lead-story\) \{[^}]*border-bottom: 1px solid var\(--p-ink\)/);
    expect(css).toMatch(/\.paper \.classifieds > \.log-entry\.type-v3 \{[^}]*border: 4px double/);
    expect(css).toMatch(/\.paper \.notice-run \.notice \{[^}]*break-inside:\s*avoid/);
  });

  it('keeps the display engraving inside its notice, never stretched by the entry', () => {
    expect(css).toMatch(/\.paper \.display-notice \{[^}]*grid-template-columns:[^}]*minmax\(0, 2fr\) minmax\(0, 3fr\)/);
    expect(css).toMatch(/\.paper \.notice-art \{[^}]*margin:\s*0/);
  });

  it('prints the classifieds ornaments like the paper halftones, under .paper', () => {
    // The engraved head, cuts, fleurons and hands read on the sheet in both
    // themes: sepia, multiplied in, never dark.
    expect(css).toContain('.paper .lab-head-ornament');
    expect(css).toMatch(/\.paper \.notice-cut\.cut-sm img[^}]*width:\s*1\.8rem/);
    expect(css).toMatch(/\.paper \.notice-cut\.cut-md img[^}]*width:\s*2\.6rem/);
    expect(css).toMatch(/\.paper \.notice-cut\.cut-lg img[^}]*width:\s*100%/);
    expect(css).toMatch(/\.paper \.classifieds \.notice-fleuron \{/);
    expect(css).toMatch(/\.paper \.manicule \{[^}]*width:\s*1\.7rem/);
    expect(css).toContain('grayscale(1) sepia(.22) contrast(1.12)');
    expect(css).toContain('mix-blend-mode: multiply');
  });

  it('lets the section head wrap instead of pushing a narrow sheet sideways', () => {
    // The words ride centred inside the head cartouche; on a phone the head
    // must still wrap instead of pushing the sheet sideways. Without this
    // the head is 33px wider than a 320px sheet and the paper scrolls.
    expect(css).toMatch(/\.paper \.lab-head \{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.paper \.lab-head \.lab-heading \{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.paper \.lab-head-ornament \{[^}]*flex:\s*0 1 auto/);
  });

  it('sets the cartouche words on the ornament inner panel, not the middle of the plate', () => {
    // head.webp is 1200x451 and its glass opening runs from y≈168 to y≈308:
    // centring on the whole image leaves the word riding high in the frame.
    // The band must be absolute over the plate, and no later rule may reset
    // the heading to static, which would centre it on the whole image again.
    expect(css).toMatch(
      /\.paper \.head-cartouche \.lab-heading \{[^}]*position:\s*absolute[^}]*top:\s*37\.5%[^}]*bottom:\s*32%/,
    );
    expect(css).not.toMatch(/\.lab-head \.head-cartouche > \.lab-heading \{[^}]*position:\s*static/);
  });

  it('keeps the item photo at its own size: the text runs on under it', () => {
    // A long event body must not leave blank paper under a small photo:
    // the photo floats in the letter's flow, so the words wrap beside it
    // and on under it, and the frame wraps only the image.
    expect(css).toMatch(/\.paper \.item \{[^}]*display:\s*flow-root/);
    expect(css).toMatch(/\.paper \.item\.has-photo \.photo \{[^}]*float:\s*left/);
    // A picture that fails to load keeps the box the page was fitted with.
    expect(css).toMatch(/\.paper \.photo img \{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
  });
});
