/**
 * lstatus-scroll-quiet — source guard for the wide-split scroller styling:
 * quiet token-only scrollbars, hidden scrollbar buttons, bottom fade mask,
 * and nothing at all outside the >=78rem media block.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../pages/status.astro'), 'utf8');

/** The wide-split block only; whitespace-normalised so reindentation cannot break assertions. */
function wideBlock(): string {
  const from = src.indexOf('@media (min-width: 78rem)');
  const to = src.indexOf('@media (max-width: 640px)');
  if (from === -1 || to === -1 || to <= from) throw new Error('cannot isolate the wide media block');
  return src.slice(from, to).replace(/\s+/g, ' ');
}

/** Everything outside the wide block: FR4 — no scrollbar or mask styling anywhere else. */
function outsideWideBlock(): string {
  const from = src.indexOf('@media (min-width: 78rem)');
  const to = src.indexOf('@media (max-width: 640px)');
  if (from === -1 || to === -1) throw new Error('cannot isolate the wide media block');
  return src.slice(0, from) + src.slice(to);
}

describe('status.astro quiet scrollbars (>=78rem only)', () => {
  const wide = wideBlock();

  it('keeps the scroll behaviour rule intact (FR1)', () => {
    expect(wide).toContain('max-height: calc(100dvh - 26rem);');
    expect(wide).toContain('min-height: 24rem;');
    expect(wide).toContain('overflow-y: auto;');
    expect(wide).toContain('overscroll-behavior: contain;');
  });

  it('themes both scrollers with page tokens only (FR2)', () => {
    expect(wide).toContain(
      '.board-roadmap #roadmap, .board-log .log-scroller { scrollbar-width: thin; ' +
        'scrollbar-color: color-mix(in srgb, var(--ink-faint) 45%, transparent) transparent;',
    );
    // no literal colours in the new declarations: token + color-mix only.
    // The selector pair appears twice in the block (behaviour rule first,
    // styling rule second) — slice from the second occurrence.
    const sel = '.board-roadmap #roadmap, .board-log .log-scroller {';
    const first = wide.indexOf(sel);
    const second = wide.indexOf(sel, first + sel.length);
    expect(second).toBeGreaterThan(first);
    const shared = wide.slice(second);
    const block = shared.slice(0, shared.indexOf('}') + 1);
    expect(block).toContain('var(--ink-faint)');
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?!.*transparent)/);
  });

  it('carries the webkit family: 6px, transparent track, token thumb, hover, no buttons (FR2)', () => {
    expect(wide).toContain(
      '.board-roadmap #roadmap::-webkit-scrollbar, .board-log .log-scroller::-webkit-scrollbar { width: 6px; }',
    );
    expect(wide).toContain(
      '.board-roadmap #roadmap::-webkit-scrollbar-track, .board-log .log-scroller::-webkit-scrollbar-track { background: transparent; }',
    );
    expect(wide).toContain(
      '.board-roadmap #roadmap::-webkit-scrollbar-thumb, .board-log .log-scroller::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--ink-faint) 45%, transparent); border-radius: 999px; }',
    );
    expect(wide).toContain(
      '.board-roadmap #roadmap::-webkit-scrollbar-thumb:hover, .board-log .log-scroller::-webkit-scrollbar-thumb:hover { background: var(--ink-faint); }',
    );
    expect(wide).toContain(
      '.board-roadmap #roadmap::-webkit-scrollbar-button, .board-log .log-scroller::-webkit-scrollbar-button { display: none; }',
    );
  });

  it('gives both scrollers the 1.2rem bottom fade mask (FR3)', () => {
    expect(wide).toContain(
      'mask-image: linear-gradient(to bottom, #000 calc(100% - 1.2rem), transparent);',
    );
    expect(wide).toContain('scrollbar-width: thin;');
    expect(wide.split('mask-image:').length - 1).toBe(1);
    expect(wide.split('scrollbar-width:').length - 1).toBe(1);
  });

  it('changes nothing outside the wide block — page body scrollbar untouched (FR4)', () => {
    const outside = outsideWideBlock();
    expect(outside).not.toContain('scrollbar-width');
    expect(outside).not.toContain('scrollbar-color');
    expect(outside).not.toContain('mask-image');
    expect(outside).not.toContain('::-webkit-scrollbar');
  });
});
