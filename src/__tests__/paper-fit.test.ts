/**
 * Fitting the newspaper to its sheet. The server prints each column's head
 * whole (no fold) and leaves out the rest; the client trims whole letters to
 * the laid-out sheet, balances the feet, and foots the roomiest feet with
 * the engraving and the house notices — only what fits whole, never both in
 * one column, never a wrapped headline. The markdown twin still lists every
 * letter. Pages two and three keep only the classifieds that fit, and a
 * trimmed grid points at the Logbook.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  balanceHeads,
  balanceColumns,
  fitClassifieds,
  fitFrontPage,
  fitPaper,
  trimColumn,
} from '../lib/paper-fit';
import {
  estimate,
  splitColumns,
  todayEditionHtml,
  todayEditionMarkdown,
  todayLead,
  todayAside,
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
 *  really moves the foot the fit measures. */
function liveColumn(doc: Document, items: MockItem[], top: number, rowPx = 20): HTMLElement {
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
      if (k.tagName === 'ARTICLE') bottom += rowPx;
      else if (k.tagName === 'FIGURE' || k.tagName === 'ASIDE') bottom += rowPx * 3;
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
  // Nine births and no events: no lead, no side column — all nine share a
  // single per-kind column, so three fall past the head of six.
  const births: Fact[] = Array.from({ length: 9 }, (_, i) =>
    letter('born', String(1800 + i), `notable person ${i} was born in town`),
  );

  it('prints no fold and leaves the dropped letters out of the page', () => {
    const html = todayEditionHtml({ facts: births, lab: [] }, 'en', DATE);
    expect(html).not.toContain('<details');
    expect(html).not.toContain('class="more"');
    const items = html.match(/<article class="item/g) ?? [];
    expect(items.length).toBeLessThan(births.length);
    expect(items.length).toBe(6);
    for (const m of html.matchAll(/<section class="col">([\s\S]*?)<\/section>/g)) {
      expect((m[1].match(/<article class="item/g) ?? []).length).toBeLessThanOrEqual(6);
    }
  });

  it('lists every letter in the markdown twin', () => {
    const md = todayEditionMarkdown({ facts: births, lab: [] }, 'en', DATE);
    for (let i = 0; i < 9; i++) expect(md).toContain(`- **${1800 + i}**`);
    expect(md.match(/^- \*\*/gm)?.length).toBe(9);
  });

  it('balances the printed heads within a few estimate lines', () => {
    const lead = todayLead(births, DATE);
    const aside = todayAside(births, lead);
    const entries: ColEntry[] = (['event', 'born', 'died'] as const).flatMap((kind) =>
      births
        .filter((f) => f.kind === kind && f !== lead && !aside.includes(f))
        .sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10))
        .map((fact) => ({ kind, fact })),
    );
    const cols = splitColumns(entries);
    const heads = cols.map((c) => c.slice(0, 6));
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

describe('balanceColumns', () => {
  it('moves whole letters until the feet end within one line', () => {
    document.body.innerHTML =
      '<div class="paper"><div class="paper-page" id="page-1"><div id="edition">' +
      '<div class="cols"><div id="a"></div><div id="b"></div></div>' +
      '</div></div></div>';
    const wrap = document.querySelector('.cols') as HTMLElement;
    const a = liveColumn(document, [ev(), ev(), ev(), ev(), ev()], 100);
    const b = liveColumn(document, [di()], 100);
    wrap.replaceChildren(a, b);
    // Feet at 200 and 120 against a 24px line: two letters cross over.
    const moves = balanceColumns([a, b]);
    expect(moves).toBe(2);
    // The moved letters keep their kind heading, re-issued at the new foot.
    expect(b.querySelectorAll('article.item')).toHaveLength(3);
    expect(b.textContent).toContain('Events');
    const bottoms = [a, b].map((c) => c.getBoundingClientRect().bottom);
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(24);
  });
});

describe('fitFrontPage', () => {
  const scaffold = (cols: MockItem[][]): HTMLElement => {
    document.body.innerHTML =
      '<div class="paper"><div class="paper-page" id="page-1"><div id="edition">' +
      '<div class="cols"></div>' +
      '<template data-filler="plate"><figure class="photo paper-plate"><div class="print"></div></figure></template>' +
      '<template data-filler="install"><aside class="notice notice--small"><h3 class="display-notice">Install</h3></aside></template>' +
      '<template data-filler="collab"><aside class="notice notice--small"><h3 class="display-notice">Write</h3></aside></template>' +
      '<template data-filler="house-duo"><aside class="notice notice--small"><h3 class="display-notice">Both</h3></aside></template>' +
      '<p class="colophon-note">colophon</p>' +
      '</div></div></div>';
    const edition = document.getElementById('edition') as HTMLElement;
    const wrap = edition.querySelector('.cols') as HTMLElement;
    for (const items of cols) wrap.appendChild(liveColumn(document, items, 100));
    const paper = document.querySelector('.paper') as HTMLElement;
    mockBottom(paper, 1000);
    return edition;
  };

  it('trims the letters past the sheet and never stacks the plate on a notice', () => {
    // Eight letters in the first column run 40px past the sheet: two whole
    // letters go, then the roomiest feet take the plate and both notices —
    // the plate in one foot, notices in the others.
    const edition = scaffold([
      [ev(), ev(), ev(), ev(), ev(), ev(), ev(), ev()],
      [br()],
      [di()],
    ]);
    const paperEl = document.querySelector('.paper') as HTMLElement;
    mockBottom(paperEl, 220);
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(2);
    const footed = Array.from(edition.querySelectorAll('.col'));
    for (const c of footed) {
      expect(c.querySelector('figure.paper-plate') && c.querySelector('aside.notice')).toBeFalsy();
    }
    expect(edition.querySelectorAll('.col figure.paper-plate')).toHaveLength(1);
    expect(edition.querySelectorAll('.col aside.notice')).toHaveLength(2);
    expect(out.fillers).toBe(3);
  });

  it('leaves out what does not fit whole', () => {
    const edition = scaffold([
      [ev(), ev()],
      [br(), br()],
    ]);
    // No free foot: the paper ends where the columns end.
    const paperEl = document.querySelector('.paper') as HTMLElement;
    mockBottom(paperEl, 140);
    const out = fitFrontPage(edition);
    expect(out.fillers).toBe(0);
    expect(edition.querySelectorAll('.col figure.paper-plate')).toHaveLength(0);
    expect(edition.querySelectorAll('.col aside.notice')).toHaveLength(0);
  });

  it('never prints a one-word-per-line headline', () => {
    // Roomy feet, but the install headline overflows its own width (the
    // column is narrower than its longest word): the notice is left out,
    // its slot falling back to the merged house notice.
    const swDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
    const cwDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
    Object.defineProperty(Element.prototype, 'scrollWidth', {
      configurable: true,
      get(this: Element): number {
        return this.textContent === 'Install' ? 200 : 0;
      },
    });
    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get(this: Element): number {
        return this.textContent === 'Install' ? 100 : 500;
      },
    });
    try {
      const edition = scaffold([[ev()], [br()], [di()]]);
      const out = fitFrontPage(edition);
      const notices = Array.from(edition.querySelectorAll('.col aside.notice .display-notice')).map((h) => h.textContent);
      expect(notices).not.toContain('Install');
      expect(notices).toContain('Both');
      expect(out.fillers).toBe(2);
    } finally {
      if (swDesc) Object.defineProperty(Element.prototype, 'scrollWidth', swDesc);
      else delete (Element.prototype as unknown as Record<string, unknown>).scrollWidth;
      if (cwDesc) Object.defineProperty(Element.prototype, 'clientWidth', cwDesc);
      else delete (Element.prototype as unknown as Record<string, unknown>).clientWidth;
    }
  });

  it('leaves out a notice whose multi-word headline breaks one word per line', () => {
    // Roomy feet and no horizontal overflow anywhere (jsdom reports zero
    // widths): the install headline still goes, because every one of its
    // words lays out on its own row — which the scroll width cannot see.
    // The merged house notice reads on one row, so it takes the slot.
    document.body.innerHTML =
      '<div class="paper"><div class="paper-page" id="page-1"><div id="edition">' +
      '<div class="cols"></div>' +
      '<template data-filler="plate"><figure class="photo paper-plate"><div class="print"></div></figure></template>' +
      '<template data-filler="install"><aside class="notice notice--small"><h3 class="display-notice">Machines for every desk</h3></aside></template>' +
      '<template data-filler="collab"><aside class="notice notice--small"><h3 class="display-notice">Write to the lab</h3></aside></template>' +
      '<template data-filler="house-duo"><aside class="notice notice--small"><h3 class="display-notice">Both notices together</h3></aside></template>' +
      '<p class="colophon-note">colophon</p>' +
      '</div></div></div>';
    const edition = document.getElementById('edition') as HTMLElement;
    const wrap = edition.querySelector('.cols') as HTMLElement;
    for (const items of [[ev()], [br()], [di()]]) wrap.appendChild(liveColumn(document, items, 100));
    const paperEl = document.querySelector('.paper') as HTMLElement;
    mockBottom(paperEl, 1000);
    // One laid-out row per word for the install headline only; every other
    // headline reads on a single row.
    const realCreateRange = document.createRange.bind(document);
    (document as unknown as { createRange: typeof document.createRange }).createRange = () => {
      const r = realCreateRange();
      (r as unknown as { getClientRects: () => Array<{ top: number }> }).getClientRects = () => {
        const words = r.toString().trim().split(/\s+/).filter(Boolean);
        if (r.toString().includes('Machines')) return words.map((_, i) => ({ top: i * 40 }));
        return [{ top: 0 }];
      };
      return r;
    };
    try {
      const out = fitFrontPage(edition);
      const notices = Array.from(edition.querySelectorAll('.col aside.notice .display-notice')).map((h) => h.textContent);
      expect(notices).not.toContain('Machines for every desk');
      expect(notices).toContain('Both notices together');
      expect(out.fillers).toBe(2);
    } finally {
      document.createRange = realCreateRange;
    }
  });

  it('keeps the lead, the rail and the Workbench display out of the trim', () => {
    document.body.innerHTML =
      '<div class="paper"><div class="paper-page" id="page-1"><div id="edition">' +
      '<article class="lead">lead</article><div class="rail">rail</div>' +
      '<aside class="notice notice--feature">duo</aside><div class="cols"></div>' +
      '</div></div></div>';
    const edition = document.getElementById('edition') as HTMLElement;
    const paperEl = document.querySelector('.paper') as HTMLElement;
    mockBottom(paperEl, 1000);
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    expect(edition.querySelector('.lead')).not.toBeNull();
    expect(edition.querySelector('.rail')).not.toBeNull();
    expect(edition.querySelector('.notice--feature')).not.toBeNull();
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

describe('front page fits its sheet, masthead included', () => {
  const frontScaffold = (
    cols: MockItem[][],
    opts?: { railItems?: number; duo?: boolean; solo?: boolean; paperBottom?: number; colophonHeight?: number },
  ): HTMLElement => {
    const railItems = opts?.railItems ?? 0;
    const rail = railItems
      ? `<div class="rail"><aside class="also">${'<div class="aside-item">extra</div>'.repeat(railItems)}</aside></div>`
      : '';
    const duo = opts?.duo === false ? '' : '<aside class="notice notice--feature">duo</aside>';
    document.body.innerHTML =
      '<div class="paper"><div class="paper-page" id="page-1"><div id="edition">' +
      `<article class="lead${opts?.solo ? ' solo' : ''}"><div class="story"></div><div class="lead-cols"></div></article>` +
      rail +
      duo +
      '<div class="cols"></div>' +
      '<template data-filler="plate"><figure class="photo paper-plate"><div class="print"></div></figure></template>' +
      '<template data-filler="install"><aside class="notice notice--small"><h3 class="display-notice">Install</h3></aside></template>' +
      '<template data-filler="collab"><aside class="notice notice--small"><h3 class="display-notice">Write</h3></aside></template>' +
      '<template data-filler="house-duo"><aside class="notice notice--small"><h3 class="display-notice">Both</h3></aside></template>' +
      '<p class="colophon-note">colophon</p>' +
      '</div></div></div>';
    const edition = document.getElementById('edition') as HTMLElement;
    const wrap = edition.querySelector('.cols') as HTMLElement;
    for (const items of cols) wrap.appendChild(liveColumn(document, items, 100));
    mockBottom(document.querySelector('.paper') as HTMLElement, opts?.paperBottom ?? 1000);
    if (opts?.colophonHeight) {
      mockBottom(edition.querySelector('.colophon-note') as HTMLElement, opts.colophonHeight, opts.colophonHeight);
    }
    return edition;
  };

  it('drops the Workbench display and the rail extras before any letter', () => {
    const edition = frontScaffold(
      [
        [ev(), ev()],
        [br(), br()],
      ],
      { railItems: 2, paperBottom: 1000 },
    );
    mockBottom(edition.querySelector('.rail') as HTMLElement, 1050, 950);
    mockBottom(edition.querySelector('.rail .also') as HTMLElement, 1030, 100);
    mockBottom(edition.querySelector('.lead .story') as HTMLElement, 400, 300);
    mockBottom(edition.querySelector('aside.notice--feature') as HTMLElement, 1100, 200);
    const out = fitFrontPage(edition);
    // The display ran 100px past the sheet and the rail 50px: the display
    // goes, then one rail extra, and the letters stay whole.
    expect(edition.querySelector('aside.notice--feature')).toBeNull();
    expect(edition.querySelectorAll('.rail .also .aside-item')).toHaveLength(1);
    expect(edition.querySelectorAll('.col article.item')).toHaveLength(4);
    expect(out.trimmedLetters).toBe(0);
    // One band column moved under the lead story; the band keeps the other.
    expect(edition.querySelectorAll('.lead-cols .col')).toHaveLength(1);
    expect(edition.querySelectorAll('.cols .col')).toHaveLength(1);
  });

  it('moves whole sections under the lead and balances every letter column', () => {
    const edition = frontScaffold(
      [Array.from({ length: 20 }, () => ev()), [br()], [di()]],
      { duo: false, paperBottom: 500, colophonHeight: 30 },
    );
    // The colophon reserves 30px: the sheet ends at 470, so the 500px column
    // loses two whole letters and nothing is hidden behind the sheet's edge.
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBeGreaterThanOrEqual(2);
    expect(edition.querySelector('.colophon-note')).not.toBeNull();
    for (const col of Array.from(edition.querySelectorAll('.col'))) {
      expect(col.getBoundingClientRect().bottom).toBeLessThanOrEqual(471);
    }
    // Three band columns: two under the story, one left in the band, every
    // column still headed by kind.
    expect(edition.querySelectorAll('.lead-cols .col')).toHaveLength(2);
    expect(edition.querySelectorAll('.cols .col')).toHaveLength(1);
    expect(out.movedLetters).toBeGreaterThan(0);
    for (const col of Array.from(edition.querySelectorAll('.col'))) {
      expect(col.querySelectorAll('h3').length).toBeGreaterThan(0);
    }
  });

  it('moves every section under a solo lead and empties the band', () => {
    const edition = frontScaffold([[ev()], [br()]], { duo: false, solo: true });
    fitFrontPage(edition);
    expect(edition.querySelectorAll('.lead-cols .col')).toHaveLength(2);
    expect(edition.querySelector('.cols')).toBeNull();
  });

  it('reads the rail foot live, so a rail that fits keeps every item', () => {
    const edition = frontScaffold(
      [
        [ev(), ev()],
        [br(), br()],
      ],
      { railItems: 2, paperBottom: 1200 },
    );
    // The rail's own box breathes with its items, which is what the row
    // really holds; the box inside it still reports the stale, taller size
    // a stretched inner block shows. Reading the rail live ends it at 1100,
    // inside the sheet: both items stay and no letter is trimmed. Believing
    // the stale height put the foot at 1300 and gutted the rail for nothing.
    const rail = edition.querySelector('.rail') as HTMLElement;
    const also = edition.querySelector('.rail .also') as HTMLElement;
    const asideCount = () => also.querySelectorAll('.aside-item').length;
    rail.getBoundingClientRect = () => rect(900 + asideCount() * 100, asideCount() * 100);
    also.getBoundingClientRect = () => rect(1300, 400);
    mockBottom(edition.querySelector('.lead .story') as HTMLElement, 400, 300);
    mockBottom(edition.querySelector('aside.notice--feature') as HTMLElement, 1300, 200);
    const out = fitFrontPage(edition);
    // The display ran past the sheet and goes; the rail never did, so
    // nothing else leaves the page.
    expect(edition.querySelector('aside.notice--feature')).toBeNull();
    expect(edition.querySelectorAll('.rail .also .aside-item')).toHaveLength(2);
    expect(edition.querySelectorAll('.col article.item')).toHaveLength(4);
    expect(out.trimmedLetters).toBe(0);
  });

  it('drops the section a trim emptied', () => {
    // A 100px sheet leaves each one-letter section no room: the trim takes
    // the only letter whole, so the emptied section leaves the page and
    // the band left with no section goes with it.
    const edition = frontScaffold([[ev()], [br()]], { duo: false, paperBottom: 100 });
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(2);
    expect(edition.querySelectorAll('.col')).toHaveLength(0);
    expect(edition.querySelector('.cols')).toBeNull();
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
