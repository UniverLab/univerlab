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
    const selectors = [...css.matchAll(/(?:^|\})\s*([^{}@]+?)\s*\{/gm)]
      .map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter((s) => s && !/^(to|from|<style)/.test(s) && !/^\d/.test(s));
    expect(selectors.length).toBeGreaterThan(30);
    for (const group of selectors) {
      for (const sel of group.split(',').map((s) => s.trim())) {
        expect(sel === '.paper' || sel.startsWith('.paper ') || nightOk(sel) || jsOk(sel)).toBe(true);
      }
    }
  });

  it('never turns dark: the night paper is a light grey, not slate', () => {
    expect(css).toContain('--p-ground: #e3e5e2');
    expect(css).toContain('--p-ink: #16191c');
    expect(css).not.toContain('var(--bench-c-slate)');
  });

  it('lays the front out as spans beside a rail sized to the rows it must fill', () => {
    // The lab mail box and the lead take three of the four columns; the rail
    // is told by the renderer how many rows to run beside, so a day without a
    // lead does not leave an empty band before the columns.
    expect(css).toMatch(/\.paper \.front \.labmail \{[^}]*grid-column:\s*1 \/ span 3/);
    expect(css).toMatch(/\.paper \.front \.rail \{[^}]*grid-row:\s*1 \/ span var\(--rail-rows/);
    expect(css).toMatch(/\.paper \.front \.cols \{[^}]*grid-column:\s*1 \/ -1/);
  });

  it('sets page 2 as dense ruled columns, not row-aligned grid cells', () => {
    expect(css).toMatch(/\.paper #lab-log \{[^}]*column-count:\s*3/);
    expect(css).toContain('column-rule: 1px solid var(--p-rule)');
    expect(css).toMatch(/\.paper \.log-entry \{[^}]*break-inside:\s*avoid/);
  });

  it('keeps the item photo at its own size: the frame never stretches with the entry', () => {
    // A long event body must not pull a tall grey mat below the photo: the
    // figure sits at the start of its grid area, so the halftone frame wraps
    // only the image — the same fixed portrait births and deaths print.
    expect(css).toMatch(/\.paper \.item\.has-photo \.photo \{[^}]*align-self:\s*start/);
  });
});
