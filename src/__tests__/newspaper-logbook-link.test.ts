/**
 * The logbook link beside the paper's controls: one discreet row above the
 * sheet, outside .paper and the sheet viewport at every width, hidden in
 * print, with no invisible folio link left inside the paper.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const src = readFileSync(resolve(__dirname, '..', 'components', 'TodaysPaper.astro'), 'utf8');
const css = src.slice(src.indexOf('<style is:global>'), src.indexOf('</style>'));
const cssBody = css.slice(css.indexOf('>') + 1);

// Balanced-brace @media ranges: prelude plus the block's span in css.
function mediaRanges(text: string): { prelude: string; start: number; end: number }[] {
  const out: { prelude: string; start: number; end: number }[] = [];
  const re = /@media\s+([^{]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') depth -= 1;
      i += 1;
    }
    out.push({ prelude: m[1], start: m.index, end: i });
  }
  return out;
}

function logbookHits(text: string): number[] {
  const hits: number[] = [];
  let idx = text.indexOf('.paper-logbook');
  while (idx !== -1) {
    hits.push(idx);
    idx = text.indexOf('.paper-logbook', idx + 1);
  }
  return hits;
}

describe('the logbook link above the sheet', () => {
  it('sits outside .paper and the sheet viewport, before both', () => {
    const at = src.indexOf('class="paper-logbook"');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(src.indexOf('data-paper-viewport'));
    expect(at).toBeLessThan(src.indexOf('<div class="paper">'));
  });

  it('points at the logbook in the visitor language with the vintage label', () => {
    expect(src).toContain(`href={localizePath('/logbook', lang)}`);
    expect(src).toContain('{t.today.logbookLink}');
    expect(en.today.logbookLink).toBe('Lab logbook →');
    expect(es.today.logbookLink).toBe('Bitácora del laboratorio →');
  });

  it('renders as a visible row: flex with no zero-box hiding', () => {
    const base = css.match(/\.paper-logbook \{([^}]*)\}/);
    expect(base).not.toBeNull();
    expect(base![1]).toContain('display: flex');
    expect(base![1]).not.toMatch(/display:\s*none|visibility:\s*hidden|height:\s*0|clip/);
    // The computed box is a laid-out row with a shown link.
    document.body.innerHTML =
      `<style>${cssBody}</style><p class="paper-logbook"><a href="/logbook">Lab logbook →</a></p>`;
    const row = document.querySelector('.paper-logbook') as HTMLElement;
    expect(getComputedStyle(row).display).toBe('flex');
    const link = row.querySelector('a') as HTMLElement;
    expect(getComputedStyle(link).display).not.toBe('none');
  });

  it('scales with the sheet through paper-sheet.ts, never through a width query', () => {
    const hits = logbookHits(css);
    expect(hits.length).toBeGreaterThan(0);
    const ranges = mediaRanges(css);
    let printHits = 0;
    for (const hit of hits) {
      const enclosing = ranges.filter((r) => hit > r.start && hit < r.end);
      for (const r of enclosing) {
        expect(r.prelude).not.toMatch(/min-width|max-width/);
        expect(r.prelude).toContain('print');
      }
      if (enclosing.length > 0) {
        printHits += 1;
        expect(css.slice(hit, css.indexOf('}', hit) + 1)).toContain('display: none');
      }
    }
    // Exactly the print rule hides the row; the stylesheet never sizes it
    // by width — the sheet script scales it by the fitted factor instead.
    expect(printHits).toBe(1);
    const sheet = readFileSync(resolve(__dirname, '..', 'lib', 'paper-sheet.ts'), 'utf8');
    expect(sheet).toContain('.paper-logbook');
    expect(sheet).toMatch(/11\.5 \* scale/);
    // …and restores the stylesheet size on desktop, so the row reads the
    // same 11.5px there as before.
    expect(sheet).toMatch(/fontSize = ''/);
  });
});
