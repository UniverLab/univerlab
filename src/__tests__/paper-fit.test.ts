/**
 * Fitting the newspaper to its sheet. The server prints each column's head
 * whole (no fold) and leaves out the rest; the client re-cuts the letters,
 * in reading order, into balanced columns that fit the laid-out sheet,
 * leaves out whole letters of the largest kinds when they cannot all fit,
 * and foots a roomy day's columns with the engraving and the house notices
 * — one per column. The markdown twin still lists every letter. Pages two
 * and three keep only the classifieds that fit, and a trimmed grid points at
 * the Logbook.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  balanceHeads,
  HEAD_LIMIT,
  fitClassifieds,
  fitFrontPage,
  fitPaper,
  planColumns,
  trimColumn,
} from '../lib/paper-fit';
import {
  estimate,
  splitColumns,
  todayEditionHtml,
  todayEditionMarkdown,
  todayLead,
  type ColEntry,
} from '../lib/today-edition';
import { labPageHtml, type Entry } from '../lib/lab-page';
import type { Fact } from '../lib/science-filter';

const DATE = new Date(2026, 9, 21, 12, 0, 0);

const letter = (kind: Fact['kind'], year: string, text?: string): Fact => ({
  year,
  text: text ?? `${kind} letter of ${year} happened here in town`,
  link: '',
  kind,
  page: `${kind} ${year}`,
});

const rect = (bottom: number, height = 0): DOMRect =>
  ({ x: 0, y: 0, width: 100, height, top: bottom - height, left: 0, bottom, right: 100, toJSON: () => {} }) as DOMRect;

function mockBottom(el: Element, bottom: number, height = 0): void {
  el.getBoundingClientRect = () => rect(bottom, height);
}

interface MockItem {
  kind: Fact['kind'];
  label: string;
}

/** A column whose bottom tracks its content like the laid-out page: every
 *  letter costs one row, every filler three, so removing or moving a node
 *  really moves the foot the fit measures. `scale` models a transform-scaled
 *  sheet: rows cost `rowPx` layout pixels (offsetHeight) but advance the
 *  visual foot by `rowPx * scale`, like a phone reader sees. */
function liveColumn(doc: Document, items: MockItem[], top: number, rowPx = 20, scale = 1): HTMLElement {
  const col = doc.createElement('section');
  col.className = 'col';
  let lastLabel = '';
  for (const item of items) {
    if (item.label !== lastLabel) {
      const h = doc.createElement('h3');
      h.textContent = item.label;
      col.appendChild(h);
      lastLabel = item.label;
    }
    const a = doc.createElement('article');
    a.className = 'item';
    a.setAttribute('data-kind', item.kind);
    Object.defineProperty(a, 'offsetHeight', { value: rowPx, configurable: true });
    col.appendChild(a);
  }
  col.getBoundingClientRect = () => {
    let bottom = top;
    for (const k of Array.from(col.children)) {
      if (k.tagName === 'ARTICLE') bottom += rowPx * scale;
      else if (k.tagName === 'FIGURE' || k.tagName === 'ASIDE') bottom += rowPx * 3 * scale;
      // A letter moved over from the rail keeps its own markup and its row.
      else if (k.tagName === 'DIV' && k.classList.contains('aside-item')) bottom += rowPx * scale;
    }
    return rect(bottom);
  };
  return col;
}

const ev = (label = 'Events'): MockItem => ({ kind: 'event', label });
const br = (label = 'Births'): MockItem => ({ kind: 'born', label });
const di = (label = 'Deaths'): MockItem => ({ kind: 'died', label });

describe('balanceHeads', () => {
  it('moves whole letters until the heads end within one estimate line', () => {
    // Heads of 5/3/4: the light head takes the heavy head's last letter.
    const cols = [[{ w: 4 }, { w: 1 }], [{ w: 3 }], [{ w: 4 }]];
    const weights = cols.map((c) => c.map((e) => e.w));
    const moves = balanceHeads(cols, weights);
    expect(moves).toBe(1);
    const sums = weights.map((w) => w.reduce((a, b) => a + b, 0));
    expect(sums).toEqual([4, 4, 4]);
    expect(cols.flat()).toHaveLength(4);
  });

  it('leaves balanced heads alone and respects the head cap', () => {
    const cols = [[{ w: 5 }], [{ w: 5 }], [{ w: 5 }]];
    const weights = cols.map((c) => c.map((e) => e.w));
    expect(balanceHeads(cols, weights)).toBe(0);
    expect(weights).toEqual([[5], [5], [5]]);
    // A full shortest head takes no more letters.
    const one = (w: number): { w: number } => ({ w });
    const fullCols = [[one(20)], [one(1), one(1), one(1), one(1), one(1), one(1)], [one(1)]];
    const fullWeights = fullCols.map((c) => c.map((e) => e.w));
    expect(balanceHeads(fullCols, fullWeights)).toBe(0);
    expect(fullCols.map((c) => c.length)).toEqual([1, 6, 1]);
  });

  it('never moves when the move would overshoot the spread', () => {
    // 10/10/29: moving a 10 only widens the 19 gap, so nothing moves.
    const cols = [[{ w: 10 }], [{ w: 10 }], [{ w: 29 }]];
    const weights = cols.map((c) => c.map((e) => e.w));
    expect(balanceHeads(cols, weights)).toBe(0);
    expect(cols.map((c) => c.length)).toEqual([1, 1, 1]);
  });
});

describe('the server prints heads only, dropped letters stay in the twin', () => {
  // Twelve births and no events: no lead — all twelve share a single
  // per-kind column, so three fall past the head of nine.
  const births: Fact[] = Array.from({ length: 12 }, (_, i) =>
    letter('born', String(1800 + i), `notable person ${i} was born in town`),
  );

  it('prints no fold and leaves the dropped letters out of the page', () => {
    const html = todayEditionHtml({ facts: births, lab: [] }, 'en', DATE);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('class="more"');
    const items = html.match(/<article class="item/g) ?? [];
    expect(items.length).toBeLessThan(births.length);
    expect(items.length).toBe(HEAD_LIMIT);
    for (const m of html.matchAll(/<section class="col">([\s\S]*?)<\/section>/g)) {
      expect((m[1].match(/<article class="item/g) ?? []).length).toBeLessThanOrEqual(HEAD_LIMIT);
    }
  });

  it('lists every letter in the markdown twin', () => {
    const md = todayEditionMarkdown({ facts: births, lab: [] }, 'en', DATE);
    for (let i = 0; i < 12; i++) expect(md).toContain(`- **${1800 + i}**`);
    expect(md.match(/^- \*\*/gm)?.length).toBe(12);
  });

  it('balances the printed heads within a few estimate lines', () => {
    const lead = todayLead(births, DATE);
    const entries: ColEntry[] = (['event', 'born', 'died'] as const).flatMap((kind) =>
      births
        .filter((f) => f.kind === kind && f !== lead)
        .sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10))
        .map((fact) => ({ kind, fact })),
    );
    const cols = splitColumns(entries);
    const heads = cols.map((c) => c.slice(0, HEAD_LIMIT));
    const weights = heads.map((h) => h.map((e) => estimate(e.fact)));
    balanceHeads(heads, weights);
    const sums = weights.map((w) => w.reduce((a, b) => a + b, 0));
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(4);
  });
});

describe('trimColumn', () => {
  it('removes whole letters from the foot until the column ends above the sheet', () => {
    document.body.innerHTML = '';
    const col = liveColumn(document, [ev(), ev(), ev(), ev(), ev()], 100);
    // Five rows of 20 from top 100: bottom 200; the sheet ends at 160.
    expect(trimColumn(col, 160)).toBe(2);
    expect(col.querySelectorAll('article.item')).toHaveLength(3);
    expect(col.getBoundingClientRect().bottom).toBeLessThanOrEqual(161);
  });

  it('prunes the heading orphaned by the trim and stops at zero', () => {
    document.body.innerHTML = '';
    const col = liveColumn(document, [ev()], 100);
    // One row: bottom 120 against a sheet ending at 100 — the letter and
    // its heading both go, and the trim stops on the empty column.
    expect(trimColumn(col, 100)).toBe(1);
    expect(col.querySelectorAll('article.item')).toHaveLength(0);
    expect(col.querySelectorAll('h3')).toHaveLength(0);
    expect(trimColumn(col, 100)).toBe(0);
  });
});

describe('planColumns', () => {
  const kinds = (s: string): string[] => s.split('');

  it('cuts the letters in reading order into the most even columns', () => {
    const heights = [100, 100, 60, 60, 60, 60, 60, 60, 60];
    const ks = kinds('eebbbbddd');
    const plan = planColumns({ heights, kinds: ks, columns: 3, head: 20, gap: 10 });
    expect(plan).not.toBeNull();
    // Contiguous: each column starts after the one before it.
    expect(plan!.starts[0]).toBe(0);
    expect([...plan!.starts].sort((a, b) => a - b)).toEqual(plan!.starts);
    // The tallest column is as short as any cut allows: brute force agrees.
    const colH = (from: number, to: number): number => {
      let total = 0;
      let blocks = 0;
      for (let i = from; i < to; i++) {
        if (i === from || ks[i] !== ks[i - 1]) {
          total += 20;
          blocks++;
        }
        total += heights[i];
        blocks++;
      }
      return total + 10 * (blocks - 1);
    };
    let best = Infinity;
    for (let i = 1; i < 8; i++) {
      for (let j = i + 1; j < 9; j++) {
        best = Math.min(best, Math.max(colH(0, i), colH(i, j), colH(j, 9)));
      }
    }
    expect(plan!.max).toBe(best);
  });

  it('counts a heading at every column top and every kind change', () => {
    const plan = planColumns({ heights: [10, 10], kinds: kinds('eb'), columns: 1, head: 5, gap: 1 });
    // Two headings, two letters, three gaps between the four blocks.
    expect(plan!.heights).toEqual([5 + 10 + 5 + 10 + 3]);
  });

  it('gives each filler a column foot of its own, the shortest first', () => {
    const plan = planColumns({
      heights: [100, 100, 40],
      kinds: kinds('eee'),
      columns: 3,
      head: 0,
      gap: 0,
      fillers: [60],
    });
    expect(plan!.fillerCols).toEqual([2]);
    expect(planColumns({ heights: [1], kinds: ['e'], columns: 3, head: 0, gap: 0, fillers: [1, 1] })).toBeNull();
  });

  it('prefers, among the cuts that fit the room, the one whose columns end closest', () => {
    const input = {
      heights: [50, 50, 50, 50, 50, 50],
      kinds: kinds('eeeeee'),
      columns: 2,
      head: 0,
      gap: 0,
    };
    const plan = planColumns({ ...input, room: 200 });
    expect(plan!.heights).toEqual([150, 150]);
    expect(planColumns({ heights: [], kinds: [], columns: 3, head: 0, gap: 0 })).toBeNull();
  });
});

describe('fitFrontPage', () => {
  // A laid-out page in miniature: the paper ends at `paperBottom`, the
  // colophon is 20px, the band of columns starts at 100 (160 with the
  // Workbench display above it), a heading is 20px, a letter its data-h,
  // a filler 60px, and blocks in a column sit 14px apart.
  const original = HTMLElement.prototype.getBoundingClientRect;
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = original;
  });

  const heightOf = (el: Element): number => {
    if (el.tagName === 'H3' && el.closest('.col') && !el.closest('aside')) return 20;
    if (el.tagName === 'ARTICLE' && el.classList.contains('item')) return Number(el.getAttribute('data-h') || 0);
    if ((el.tagName === 'FIGURE' && el.classList.contains('paper-plate')) || el.tagName === 'ASIDE') return 60;
    if (el.classList.contains('colophon-note')) return 20;
    return 0;
  };

  const install = (paperBottom: () => number): void => {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      const el = this as HTMLElement;
      if (el.classList.contains('paper')) return rect(paperBottom(), paperBottom());
      const duo = document.querySelector('.front > aside.notice--feature');
      const bandTop = 100 + (duo ? 60 : 0);
      const colBottom = (col: Element): number => {
        const kids = Array.from(col.children);
        const sum = kids.reduce((n, k) => n + heightOf(k), 0);
        return bandTop + sum + (kids.length ? 14 * (kids.length - 1) : 0);
      };
      if (el.classList.contains('cols')) {
        const feet = Array.from(el.children).map(colBottom);
        return rect(Math.max(bandTop, ...feet), Math.max(0, ...feet) - bandTop);
      }
      if (el.classList.contains('col')) return rect(colBottom(el), colBottom(el) - bandTop);
      if (el.classList.contains('notice--wide')) {
        const band = document.querySelector('.cols');
        const foot = band ? band.getBoundingClientRect().bottom : bandTop;
        return rect(foot + 18 + 60, 60);
      }
      const h = heightOf(el);
      return rect(h, h);
    };
  };

  const page = (letters: Array<[Fact['kind'], number, number]>, duo = false): HTMLElement => {
    // The server's columns scramble the reading order on purpose: the fit
    // re-cuts by each letter's data-i.
    const items = letters.map(
      ([kind, i, h]) => `<article class="item" data-kind="${kind}" data-i="${i}" data-h="${h}"></article>`,
    );
    const thirds = [items.filter((_, k) => k % 3 === 2), items.filter((_, k) => k % 3 === 0), items.filter((_, k) => k % 3 === 1)];
    document.body.innerHTML =
      '<div class="paper"><section class="paper-page" id="page-1"><div id="edition"><div class="front">' +
      (duo ? '<aside class="notice notice--feature"><h3 class="display-notice">Workbench</h3></aside>' : '') +
      '<div class="cols" data-cont="continued">' +
      thirds.map((t) => `<section class="col"><h3>Head</h3>${t.join('')}</section>`).join('') +
      '</div>' +
      '<template data-filler="plate"><figure class="photo paper-plate"><div class="print"></div></figure></template>' +
      '<template data-filler="install"><aside class="notice notice--small"><h3 class="display-notice">Install</h3></aside></template>' +
      '<template data-filler="collab"><aside class="notice notice--small"><h3 class="display-notice">Write</h3></aside></template>' +
      '<template data-filler="house-duo"><aside class="notice notice--small"><h3 class="display-notice">Both</h3></aside></template>' +
      '</div><p class="colophon-note">colophon</p></div></section></div>';
    return document.getElementById('edition') as HTMLElement;
  };

  const day: Array<[Fact['kind'], number, number]> = [
    ['event', 0, 100],
    ['event', 1, 100],
    ['born', 2, 60],
    ['born', 3, 60],
    ['born', 4, 60],
    ['born', 5, 60],
    ['died', 6, 60],
    ['died', 7, 60],
    ['died', 8, 60],
  ];
  const orderOf = (edition: Element): number[] =>
    Array.from(edition.querySelectorAll('.cols .col > article.item')).map((a) => Number(a.getAttribute('data-i')));

  it('flows every letter through the columns in reading order, re-headed', () => {
    install(() => 420 + 22);
    const edition = page(day);
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    expect(orderOf(edition)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const cols = Array.from(edition.querySelectorAll('.cols .col'));
    expect(cols).toHaveLength(3);
    // Every column opens on a kind heading; a kind carried over a break is
    // marked continued.
    let prevKind = '';
    for (const col of cols) {
      expect(col.firstElementChild?.tagName).toBe('H3');
      const items = Array.from(col.querySelectorAll(':scope > article.item'));
      const carried = items[0].getAttribute('data-kind') === prevKind;
      expect(col.firstElementChild?.querySelector('.cont')?.textContent).toBe(carried ? 'continued' : undefined);
      prevKind = items[items.length - 1].getAttribute('data-kind') || '';
    }
    // Nothing ends past the sheet.
    for (const col of cols) expect(col.getBoundingClientRect().bottom).toBeLessThanOrEqual(421);
  });

  it('lets the Workbench display go first, then letters of the largest kinds, and no filler where one went', () => {
    install(() => 330 + 22);
    const edition = page(day, true);
    const out = fitFrontPage(edition);
    expect(edition.querySelector('aside.notice--feature')).toBeNull();
    expect(out.trimmedLetters).toBeGreaterThan(0);
    // Every kind keeps a letter, and the order still reads.
    const kinds = new Set(Array.from(edition.querySelectorAll('.cols article.item')).map((a) => a.getAttribute('data-kind')));
    expect(kinds).toEqual(new Set(['event', 'born', 'died']));
    const order = orderOf(edition);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(edition.querySelector('.cols .paper-plate, .cols aside.notice')).toBeNull();
    for (const col of Array.from(edition.querySelectorAll('.cols .col'))) {
      expect(col.getBoundingClientRect().bottom).toBeLessThanOrEqual(331);
    }
  });

  it('keeps the Workbench display and foots spare room with fillers on a roomy day', () => {
    install(() => 1000 + 22);
    const edition = page(day, true);
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    expect(edition.querySelector('aside.notice--feature')).not.toBeNull();
    // The plate and the two notices, each in a column of its own.
    const feet = Array.from(edition.querySelectorAll('.cols .col')).map(
      (c) => c.querySelectorAll(':scope > .paper-plate, :scope > aside.notice').length,
    );
    expect(feet.every((n) => n <= 1)).toBe(true);
    expect(out.fillers).toBeGreaterThanOrEqual(3);
  });

  it('refits from the edition\'s own letters when the layout changes, and leaves a fitted page alone', () => {
    let bottom = 330 + 22;
    install(() => bottom);
    const edition = page(day);
    const paper = document.querySelector('.paper') as HTMLElement;
    Object.defineProperty(paper, 'offsetWidth', { value: 1, configurable: true });
    const first = fitFrontPage(edition);
    expect(first.trimmedLetters).toBeGreaterThan(0);
    const fitted = edition.innerHTML;
    // Same layout: nothing moves.
    expect(fitFrontPage(edition).trimmedLetters).toBe(0);
    expect(edition.innerHTML).toBe(fitted);
    // A taller sheet (new metrics): every letter comes back.
    bottom = 1000 + 22;
    Object.defineProperty(paper, 'offsetWidth', { value: 2, configurable: true });
    const again = fitFrontPage(edition);
    expect(again.trimmedLetters).toBe(0);
    expect(orderOf(edition)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('pages two and three hold only the classifieds that fit', () => {
  const rows = (n: number): Entry[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      date: `2026-09-${String(20 - (i % 10)).padStart(2, '0')}T10:00:00.000Z`,
      title: `Notice ${i}`,
      body: 'Body.',
      type: 'note',
      topic: 'canopy',
      link: null,
    })) as Entry[];

  it('trims whole cards from the foot and points the trimmed grid at the Logbook', () => {
    document.body.innerHTML =
      '<div class="paper"><div class="paper-page" id="lab"><div id="lab-body">' +
      labPageHtml(rows(20), 'en') +
      '</div></div></div>';
    const grid = document.querySelector('#lab-log') as HTMLElement;
    const scope = document.querySelector('#lab-body') as HTMLElement;
    const before = grid.children.length;
    expect(before).toBeGreaterThan(4);
    // The grid runs well past the paper: whole cards fall off the foot.
    // Templates never lay out, so the foot counts only rendered children.
    const foot = (): number =>
      100 +
      Array.from(grid.children).filter((k) => k.tagName !== 'TEMPLATE').length * 50;
    const paperEl = document.querySelector('.paper') as HTMLElement;
    mockBottom(paperEl, 300);
    grid.getBoundingClientRect = () => rect(foot());
    scope.getBoundingClientRect = () =>
      rect(grid.getBoundingClientRect().bottom + (scope.querySelector('.lab-more') ? 40 : 0));
    const out = fitClassifieds(document);
    expect(out.trimmedAds).toBeGreaterThan(0);
    expect(grid.getBoundingClientRect().bottom).toBeLessThanOrEqual(301);
    // Only the Logbook pointer is added, and only because ads were dropped.
    expect(document.querySelectorAll('#lab-body .lab-more')).toHaveLength(1);
    expect(out.pointers).toBe(1);
    // The coupon rule line is never trimmed away.
    expect(document.querySelector('#lab-body .coupon-note')).not.toBeNull();
    // The trimmed page ends at the foot: nothing left to fill.
    expect(scope.getBoundingClientRect().bottom).toBeLessThanOrEqual(301);
    expect(grid.querySelector('aside.notice')).toBeNull();
  });

  it('fills a fitting grid to the foot: no cards lost, no pointer, house notices stay', () => {
    document.body.innerHTML =
      '<div class="paper"><div class="paper-page" id="lab"><div id="lab-body">' +
      labPageHtml(rows(1), 'en') +
      '</div></div></div>';
    const grid = document.querySelector('#lab-log') as HTMLElement;
    const scope = document.querySelector('#lab-body') as HTMLElement;
    const before = grid.children.length;
    const paperEl = document.querySelector('.paper') as HTMLElement;
    mockBottom(paperEl, 5000);
    grid.getBoundingClientRect = () =>
      rect(
        100 +
          Array.from(grid.children).filter((k) => k.tagName !== 'TEMPLATE').length * 50,
      );
    scope.getBoundingClientRect = () => rect(grid.getBoundingClientRect().bottom + 20);
    const out = fitClassifieds(document);
    expect(out.trimmedAds).toBe(0);
    expect(out.pointers).toBe(0);
    // The last page fills to the foot with the lab's own notices and plate.
    expect(grid.querySelectorAll('aside.notice').length).toBeGreaterThan(0);
    expect(grid.querySelector('figure.classifieds-plate')).not.toBeNull();
    expect(grid.querySelectorAll('#lab-body .lab-more')).toHaveLength(0);
    expect(scope.getBoundingClientRect().bottom).toBeLessThanOrEqual(5000);
    expect(grid.children.length).toBeGreaterThan(before);
  });
});

describe('fitPaper', () => {
  it('skips hidden pages and bails on an unrendered edition', () => {
    document.body.innerHTML =
      '<div class="paper">' +
      '<section id="page-1" class="paper-page" hidden><div id="edition"></div></section>' +
      '<section id="lab" class="paper-page" hidden><div id="lab-body"></div></section>' +
      '</div>';
    expect(fitPaper(document)).toEqual({
      trimmedLetters: 0,
      movedLetters: 0,
      fillers: 0,
      trimmedAds: 0,
      pointers: 0,
    });
  });

  it('reserves every page before fitting: the skeleton paints at final height', () => {
    const src = readFileSync(resolve(__dirname, '..', 'components', 'TodaysPaper.astro'), 'utf8');
    // The loading skeleton holds the edition's place until the fill lands,
    // and the sheet itself is a fixed box — so fitting never shifts layout.
    expect(src).toContain('id="today-loading"');
    expect(src).toContain('class="skeleton-line"');
    expect(src).toContain('height: var(--paper-sheet-h)');
  });
});
