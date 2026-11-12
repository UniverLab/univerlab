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
    const selectors = [...css.matchAll(/(?:^|\})\s*([^{}@]+?)\s*\{/gm)]
      .map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter((s) => s && !/^(to|from|<style)/.test(s) && !/^\d/.test(s));
    expect(selectors.length).toBeGreaterThan(30);
    for (const group of selectors) {
      for (const sel of group.split(',').map((s) => s.trim())) {
        expect(sel === '.paper' || sel.startsWith('.paper ') || nightOk(sel)).toBe(true);
      }
    }
  });

  it('never turns dark: the night paper is a light grey, not slate', () => {
    expect(css).toContain('--p-ground: #e3e5e2');
    expect(css).toContain('--p-ink: #16191c');
    expect(css).not.toContain('var(--bench-c-slate)');
  });
});
