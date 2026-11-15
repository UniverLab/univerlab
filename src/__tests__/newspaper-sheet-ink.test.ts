/**
 * The newspaper sheet is always light, in both themes: sepia by day, a
 * cooler grey under the moon. Its masthead date once inherited the site's
 * dark-mode text colour (chalk on grey, unreadable on the owner's phone),
 * because no rule on the sheet set a colour of its own.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '..', 'components', 'TodaysPaper.astro'), 'utf8');
const css = src.slice(src.indexOf('<style is:global>'), src.indexOf('</style>'));
const tokens = readFileSync(resolve(__dirname, '..', 'styles', 'bench-tokens.css'), 'utf8');
const layout = readFileSync(resolve(__dirname, '..', 'layouts', 'BaseLayout.astro'), 'utf8');

function paperRule(): string {
  const block = css.match(/(^|\n)\s*\.paper \{[^}]*\}/);
  expect(block).not.toBeNull();
  return block![0];
}

describe('the newspaper sheet inks itself', () => {
  it('the sheet paints its text in the paper ink', () => {
    const rule = paperRule();
    // The ink is the sheet's own palette, not the site theme.
    expect(rule).toMatch(/--p-ink:\s*var\(--bench-c-ink\)/);
    // Every descendant that sets no colour of its own inherits this ink.
    expect(rule).toMatch(/color:\s*var\(--p-ink\)/);
  });

  it('no text borrows the site ink', () => {
    expect(css).not.toMatch(/color:\s*var\(--(ink|ink-dim|ink-faint|bg|line|accent)\b/);
  });

  it('the sheet ink is the ink the light theme already used', () => {
    const sheetInk = tokens.match(/--bench-c-ink:\s*(#[0-9a-f]{3,8})/i);
    const dayInk = layout.match(/'--ink'\s*:\s*'(#[0-9a-f]{3,8})'/i);
    expect(sheetInk).not.toBeNull();
    expect(dayInk).not.toBeNull();
    expect(sheetInk![1].toLowerCase()).toBe(dayInk![1].toLowerCase());
  });
});
