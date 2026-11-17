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
      // A letter moved over from the rail keeps its own markup and its row.
      else if (k.tagName === 'DIV' && k.classList.contains('aside-item')) bottom += rowPx;
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
    // The sheet reserves a body line above the limit now (the colophon's
    // own air): the paper sits 24px taller so the eight letters still run
    // the same 40px past the trimmed sheet.
    mockBottom(paperEl, 244);
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

  it('never trims the lab story while letters go', () => {
    document.body.innerHTML =
      '<div class="paper"><div class="paper-page" id="page-1"><div id="edition">' +
      '<article class="lead">lead</article><div class="rail">rail</div>' +
      '<article class="labmail">lab</article>' +
      '<aside class="notice notice--feature">duo</aside><div class="cols"></div>' +
      '</div></div></div>';
    const edition = document.getElementById('edition') as HTMLElement;
    const wrap = edition.querySelector('.cols') as HTMLElement;
    wrap.appendChild(liveColumn(document, [ev(), ev(), ev(), ev(), ev(), ev(), ev(), ev()], 100));
    wrap.appendChild(liveColumn(document, [br()], 100));
    const paperEl = document.querySelector('.paper') as HTMLElement;
    // Same sheet as the eight-letter trim above: the first column runs
    // past it, so whole letters go — but never the lab story. The
    // Workbench display goes before any letter does (fitFrontPage's
    // standing rule), so it is already gone here; the lab story,
    // the lead and the rail all survive.
    mockBottom(paperEl, 244);
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBeGreaterThan(0);
    expect(edition.querySelector('.labmail')).not.toBeNull();
    expect(edition.querySelector('.lead')).not.toBeNull();
    expect(edition.querySelector('.rail')).not.toBeNull();
    expect(edition.querySelector('.notice--feature')).toBeNull();
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

  it('drops the Workbench display and relocates an overhanging rail before any letter', () => {
    const edition = frontScaffold(
      [
        [ev(), ev()],
        [br(), br()],
      ],
      { railItems: 2, paperBottom: 1000 },
    );
    // The rail breathes with its items like the laid-out page: two tall
    // letters beside a short story.
    const rail = edition.querySelector('.rail') as HTMLElement;
    const also = edition.querySelector('.rail .also') as HTMLElement;
    const asideCount = () => also.querySelectorAll('.aside-item').length;
    rail.getBoundingClientRect = () => rect(800 + asideCount() * 100, asideCount() * 100);
    mockBottom(edition.querySelector('.lead .story') as HTMLElement, 400, 300);
    mockBottom(edition.querySelector('aside.notice--feature') as HTMLElement, 1100, 200);
    const out = fitFrontPage(edition);
    // The display ran 100px past the sheet and the rail 50px: the display
    // goes, the rail's letters relocate whole into the lead column instead
    // of dropping, and no column letter is trimmed.
    expect(edition.querySelector('aside.notice--feature')).toBeNull();
    expect(edition.querySelectorAll('.col article.item')).toHaveLength(4);
    expect(edition.querySelectorAll('.lead-cols .aside-item')).toHaveLength(2);
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
    // The colophon reserves 30px plus a body line: the sheet ends at 446,
    // so the 500px column loses whole letters and nothing is hidden behind
    // the sheet's edge.
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
    // really holds. Reading the rail live ends it at the story's foot,
    // inside the sheet: both items stay and no letter is trimmed.
    const rail = edition.querySelector('.rail') as HTMLElement;
    const also = edition.querySelector('.rail .also') as HTMLElement;
    const asideCount = () => also.querySelectorAll('.aside-item').length;
    // The rail breathes with its items and ends at the story's foot: a rail
    // that fits the balanced front row keeps every item.
    rail.getBoundingClientRect = () => rect(300 + asideCount() * 50, asideCount() * 50);
    also.getBoundingClientRect = () => rect(300 + asideCount() * 50, asideCount() * 50);
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

  it('keeps the colophon inside the sheet: the foot reserves its height and a body line', () => {
    // Paper 500, colophon 30: the sheet ends at 446, so each 500px column
    // loses three whole letters — the old 470 limit would only take two.
    const edition = frontScaffold(
      [[ev()], [br()]].map((items) => items.concat(Array.from({ length: 19 }, () => ev()))),
      {
        duo: false,
        paperBottom: 500,
        colophonHeight: 30,
      },
    );
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(6);
    expect(edition.querySelector('.colophon-note')).not.toBeNull();
    for (const col of Array.from(edition.querySelectorAll('.col'))) {
      expect(col.getBoundingClientRect().bottom).toBeLessThanOrEqual(447);
    }
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

  describe('the lead photo keeps its share of the sheet', () => {
    // The lead photo once spanned the whole sheet width with no height
    // bound, so a portrait lead pushed its own text and every letter of the
    // day past the sheet. The fitter shrinks only the photo, never the
    // text, and the letters print as on photo-free days.
    const photoScaffold = (
      cols: MockItem[][],
      opts: { solo: boolean; natural: number; railItems?: number; scale?: number },
    ): { edition: HTMLElement; img: HTMLImageElement; story: HTMLElement } => {
      const railCount = opts.railItems ?? 0;
      const rail = railCount
        ? `<div class="rail"><aside class="also">${'<div class="aside-item">extra</div>'.repeat(railCount)}</aside></div>`
        : '';
      document.body.innerHTML =
        '<div class="paper"><div class="paper-page" id="page-1"><div id="edition">' +
        `<article class="lead${opts.solo ? ' solo' : ''}"><div class="story">` +
        '<p class="kicker">Lead</p><h2>Headline</h2>' +
        '<figure class="photo photo--lead"><div class="print"><img alt="lead photo"></div></figure>' +
        '<p>Body text of the lead story.</p><a href="https://example.com">Read more</a>' +
        '</div><div class="lead-cols"></div></article>' +
        rail +
        '<div class="cols"></div>' +
        '<template data-filler="plate"><figure class="photo paper-plate"><div class="print"></div></figure></template>' +
        '<template data-filler="install"><aside class="notice notice--small"><h3 class="display-notice">Install</h3></aside></template>' +
        '<template data-filler="collab"><aside class="notice notice--small"><h3 class="display-notice">Write</h3></aside></template>' +
        '<template data-filler="house-duo"><aside class="notice notice--small"><h3 class="display-notice">Both</h3></aside></template>' +
        '<p class="colophon-note">colophon</p>' +
        '</div></div></div>';
      const edition = document.getElementById('edition') as HTMLElement;
      const band = edition.querySelector('.cols') as HTMLElement;
      // The lead's own columns begin BELOW the story on the laid-out page,
      // so a photo that grows pushes them further down the sheet.
      const storyTop = 100;
      const textH = 300;
      const rowPx = 60;
      const columns = cols.map((items) => liveColumn(document, items, 0, rowPx));
      for (const col of columns) band.appendChild(col);
      const img = edition.querySelector('.photo--lead img') as HTMLImageElement;
      const story = edition.querySelector('.lead .story') as HTMLElement;
      // Paper 1000, colophon 30: the sheet ends at 946 (one 24px body line
      // of reserve, as in the colophon test above). The photo's laid-out
      // height follows its clamp, and the story's foot follows the photo;
      // the columns below shift down with it, like the laid-out page.
      const NATURAL = opts.natural;
      const scale = opts.scale ?? 1;
      // A transform-scaled sheet reports scaled rects while a style length
      // stays a layout pixel: model both spaces, so a clamp that mixes them
      // cannot pass unnoticed.
      const visual = (bottom: number, height = 0): DOMRect => rect(bottom * scale, height * scale);
      const photoH = (): number => {
        const cap = Number.parseFloat(img.style.maxHeight || '');
        return Math.min(NATURAL, Number.isFinite(cap) && cap > 0 ? cap : NATURAL);
      };
      const storyFoot = (): number => storyTop + textH + photoH();
      img.getBoundingClientRect = () => visual(storyFoot(), photoH());
      story.getBoundingClientRect = () => visual(storyFoot(), textH + photoH());
      for (const col of columns) {
        const live = col.getBoundingClientRect.bind(col);
        // live() measures the column's own rows from zero; place that stack
        // under the story's foot.
        col.getBoundingClientRect = () => {
          const rows = live().bottom;
          return visual(storyFoot() + rows, rows);
        };
      }
      const paper = document.querySelector('.paper') as HTMLElement;
      paper.getBoundingClientRect = () => visual(1000, 1000);
      // jsdom lays nothing out, so offsetHeight is always 0: give the sheet
      // its layout height, or the display scale cannot be read at all.
      Object.defineProperty(paper, 'offsetHeight', { value: 1000, configurable: true });
      edition.querySelector('.colophon-note')!.getBoundingClientRect = () => visual(1000, 30);
      return { edition, img, story };
    };

    // The sheet edge the scaffold above fits against.
    const LIMIT = 1000 - 30 - 24;

    const expectSheetKept = (
      edition: HTMLElement,
      img: HTMLImageElement,
      story: HTMLElement,
    ): void => {
      // The photo is shrunk, never the text: capped at about a third of
      // the sheet, keeping its proportions via max-height alone. The bound
      // is written in layout pixels, so it never exceeds the cap.
      expect(img.style.maxHeight).not.toBe('');
      expect(Number.parseFloat(img.style.maxHeight)).toBeLessThanOrEqual(Math.floor(LIMIT * 0.36));
      expect(story.querySelector('p')).not.toBeNull();
      expect(story.querySelector('a')).not.toBeNull();
      // The lead's text and its link end inside the sheet, not clipped below.
      expect(story.getBoundingClientRect().bottom).toBeLessThanOrEqual(LIMIT + 24);
      // The day's letters print: at least one letter survives in the lead's
      // own columns, and every surviving column ends inside the sheet.
      expect(
        edition.querySelectorAll('.lead-cols .col article.item, .cols .col article.item').length,
      ).toBeGreaterThanOrEqual(1);
      for (const col of Array.from(edition.querySelectorAll('.col'))) {
        expect(col.getBoundingClientRect().bottom).toBeLessThanOrEqual(LIMIT + 24);
      }
      expect(edition.querySelector('.colophon-note')).not.toBeNull();
    };

    it('prints the text and letters under a solo portrait lead', () => {
      // A 1357px portrait with no rail beside it: uncapped, the story runs
      // past the sheet and the letters under it are pushed off.
      const letters = [
        [ev(), ev(), ev(), ev()],
        [br(), br(), br(), br()],
        [di(), di(), di(), di()],
      ];
      const { edition, img, story } = photoScaffold(letters, { solo: true, natural: 1357 });
      fitFrontPage(edition);
      expectSheetKept(edition, img, story);
      expect(edition.querySelectorAll('.lead-cols .col article.item').length).toBeGreaterThanOrEqual(1);
    });

    it('prints the text and letters beside a square lead photo with a rail', () => {
      const letters = [
        [ev(), ev(), ev(), ev()],
        [br(), br(), br(), br()],
        [di(), di(), di(), di()],
      ];
      const { edition, img, story } = photoScaffold(letters, {
        solo: false,
        natural: 600,
        railItems: 2,
      });
      fitFrontPage(edition);
      expectSheetKept(edition, img, story);
    });

    it('writes the clamp in layout pixels on a transform-scaled sheet', () => {
      // Below the desktop breakpoint the sheet is shown through a CSS
      // transform: a rect is a visual pixel, a style length a layout one.
      // Reading the rect and writing it back unconverted shrinks the photo
      // to a stamp on every phone.
      const letters = [[ev(), ev(), ev(), ev()]];
      const scale = 0.36;
      const { edition, img, story } = photoScaffold(letters, {
        solo: true,
        natural: 1357,
        scale,
      });
      fitFrontPage(edition);
      // The visual sheet edge: paper 1000, less the colophon's 30 and the
      // 24px body line, all as seen through the scale — the line reserve
      // scales with the display, like the fitter's own limit.
      const visualEdge = (1000 - 30 - 24) * scale;
      const visualCap = Math.floor(visualEdge * 0.36);
      const written = Number.parseFloat(img.style.maxHeight);
      expect(Number.isFinite(written)).toBe(true);
      // The style length is the visual bound divided by the display scale:
      // 117 visible pixels at 0.36 is 325 layout pixels, not 117. Writing
      // the rect back unconverted would pin the photo at a fifth of its
      // share.
      expect(written).toBeGreaterThan(visualCap);
      // What the reader sees is still the third-of-the-sheet bound.
      expect(written * scale).toBeGreaterThanOrEqual(visualCap - 1);
      expect(written * scale).toBeLessThanOrEqual(visualCap + 1);
      expect(story.getBoundingClientRect().bottom).toBeLessThanOrEqual(visualEdge + 24);
    });
  });

  describe('the space under the rail fills with whole letters', () => {
    // A photo lead with a rail and enough letters: the band's leftover
    // column moves under the rail instead of leaving a blank band beside and
    // below it. The rail's rect breathes with its descendants, like the
    // laid-out page, so the fill proves itself against a live foot.
    it('moves the band column under the rail while the rail ends inside the sheet', () => {
      const edition = frontScaffold(
        [
          [ev(), ev()],
          [br(), br()],
        ],
        { railItems: 2, paperBottom: 1000, colophonHeight: 30 },
      );
      // Paper 1000, colophon 30: the sheet ends at 946.
      const rail = edition.querySelector('.rail') as HTMLElement;
      const also = edition.querySelector('.rail .also') as HTMLElement;
      also.getBoundingClientRect = () =>
        rect(200 + also.querySelectorAll('.aside-item').length * 40);
      rail.getBoundingClientRect = () => {
        let bottom = also.getBoundingClientRect().bottom;
        for (const c of Array.from(rail.querySelectorAll(':scope > .col'))) {
          bottom = Math.max(bottom, (c as Element).getBoundingClientRect().bottom);
        }
        return rect(bottom);
      };
      const out = fitFrontPage(edition);
      // One band column stood under the lead story, the other moved under
      // the rail: no .cols band is left holding blank paper.
      expect(edition.querySelectorAll('.lead-cols .col')).toHaveLength(1);
      expect(edition.querySelectorAll('.rail > .col')).toHaveLength(1);
      expect(edition.querySelector('.cols')).toBeNull();
      // A rail that still holds a moved-in column stays, even with no
      // aside items left in it.
      expect(edition.querySelector('.rail')).not.toBeNull();
      // Every surviving letter column ends inside the sheet whole.
      for (const col of Array.from(edition.querySelectorAll('.col'))) {
        expect(col.getBoundingClientRect().bottom).toBeLessThanOrEqual(947);
      }
      expect(edition.querySelector('.colophon-note')).not.toBeNull();
      expect(out.trimmedLetters).toBe(0);
    });

    // A refit after the sheet shrinks obeys the same rules as the first
    // fit: whole letters only, nothing past the sheet's bottom edge, the
    // colophon visible.
    it('refits inside a shrunken sheet: whole letters only, colophon kept', () => {
      const edition = frontScaffold(
        [
          [ev(), ev(), ev(), ev()],
          [br(), br(), br(), br()],
        ],
        { duo: false },
      );
      // No filler templates: this refit is about whole letters, not feet.
      for (const t of Array.from(edition.querySelectorAll('template[data-filler]'))) t.remove();
      const first = fitFrontPage(edition);
      expect(first.trimmedLetters).toBe(0);
      // The viewport resize shrinks the sheet: paper 200, no colophon
      // reserve mocked, so the new limit is 176.
      const paper = edition.closest('.paper') as HTMLElement;
      mockBottom(paper, 200);
      const out = fitFrontPage(edition);
      expect(out.trimmedLetters).toBe(2);
      for (const col of Array.from(edition.querySelectorAll('.col'))) {
        expect(col.getBoundingClientRect().bottom).toBeLessThanOrEqual(177);
      }
      expect(edition.querySelector('.colophon-note')).not.toBeNull();
    });

    // A transform-scaled sheet measures rects in visual pixels and style
    // lengths in layout ones: the body line scales with the display, so a
    // column ending between the unscaled and the scaled limits keeps its
    // letter instead of losing it to a limit in the wrong units.
    it('keeps a letter ending between the unscaled and scaled limits', () => {
      const items = Array.from({ length: 44 }, () => ev());
      const edition = frontScaffold([items], { duo: false, paperBottom: 1000 });
      const paper = edition.closest('.paper') as HTMLElement;
      paper.getBoundingClientRect = () => rect(1000, 1000);
      Object.defineProperty(paper, 'offsetHeight', { value: 2000, configurable: true });
      // Scale one half: the unscaled limit would be 976, the scaled one is
      // 988, and the single 44-letter column ends at 980.
      const out = fitFrontPage(edition);
      expect(out.trimmedLetters).toBe(0);
      expect(edition.querySelectorAll('.col article.item')).toHaveLength(44);
      for (const col of Array.from(edition.querySelectorAll('.col'))) {
        expect(col.getBoundingClientRect().bottom).toBeLessThanOrEqual(989);
      }
      expect(edition.querySelector('.colophon-note')).not.toBeNull();
    });
  });
});

describe('the rail and the lead columns end together', () => {
  // Like frontScaffold, but the lead's column starts below the story (as on
  // the laid-out page) and the rail breathes with its children, so balance
  // moves prove themselves against live feet.
  const railScaffold = (opts: {
    railCount: number;
    colItems: MockItem[];
    colTop: number;
    storyBottom: number;
    paperBottom?: number;
  }): { edition: HTMLElement; also: HTMLElement } => {
    document.body.innerHTML =
      '<div class="paper"><div class="paper-page" id="page-1"><div id="edition">' +
      '<article class="lead"><div class="story"></div><div class="lead-cols"></div></article>' +
      `<div class="rail"><aside class="also">${'<div class="aside-item">extra</div>'.repeat(opts.railCount)}</aside></div>` +
      '<div class="cols"></div>' +
      // No filler templates: the feet below assert the balanced letters,
      // before any footing would move them again.
      '<p class="colophon-note">colophon</p>' +
      '</div></div></div>';
    const edition = document.getElementById('edition') as HTMLElement;
    const leadCols = edition.querySelector('.lead-cols') as HTMLElement;
    leadCols.appendChild(liveColumn(document, opts.colItems, opts.colTop));
    const rail = edition.querySelector('.rail') as HTMLElement;
    const also = edition.querySelector('.rail .also') as HTMLElement;
    rail.getBoundingClientRect = () => rect(100 + 20 * also.childElementCount, 20 * also.childElementCount);
    mockBottom(edition.querySelector('.lead .story') as HTMLElement, opts.storyBottom, opts.storyBottom - 100);
    mockBottom(document.querySelector('.paper') as HTMLElement, opts.paperBottom ?? 2000);
    return { edition, also };
  };
  const footOf = (el: Element | null): number => (el ? el.getBoundingClientRect().bottom : 0);

  it('moves an overhanging rail into the lead column until the feet meet', () => {
    // A short story, a tall rail, a short column: two rail letters open the
    // column and every foot ends within one body line (24px in jsdom).
    const { edition, also } = railScaffold({
      railCount: 6,
      colItems: [ev()],
      colTop: 100,
      storyBottom: 120,
    });
    const out = fitFrontPage(edition);
    expect(out.movedLetters).toBeGreaterThan(0);
    expect(out.trimmedLetters).toBe(0);
    expect(also.querySelectorAll('.aside-item')).toHaveLength(4);
    const cols = Array.from(edition.querySelectorAll('.lead-cols .col'));
    expect(cols).toHaveLength(1);
    // The rail's foot is its content's foot floored by the story: the row
    // it shares with the lead column ends within one body line.
    const railFoot = Math.max(
      footOf(edition.querySelector('.rail')),
      footOf(edition.querySelector('.lead .story')),
    );
    expect(Math.abs(railFoot - footOf(cols[0]))).toBeLessThanOrEqual(24);
  });

  it('moves an overhanging column into the rail until the feet meet', () => {
    // A tall lead column beside a short rail: the column's head letters
    // close the rail, whole, until both feet end within one body line.
    const { edition, also } = railScaffold({
      railCount: 2,
      colItems: [ev(), ev(), ev(), ev(), ev(), ev(), ev(), ev()],
      colTop: 400,
      storyBottom: 400,
    });
    const out = fitFrontPage(edition);
    expect(out.movedLetters).toBeGreaterThan(0);
    expect(out.trimmedLetters).toBe(0);
    expect(also.querySelectorAll('.aside-item')).toHaveLength(2);
    const cols = Array.from(edition.querySelectorAll('.lead-cols .col'));
    expect(cols).toHaveLength(1);
    const railFoot = Math.max(
      footOf(edition.querySelector('.rail')),
      footOf(edition.querySelector('.lead .story')),
    );
    expect(Math.abs(railFoot - footOf(cols[0]))).toBeLessThanOrEqual(24);
  });

  it('trims an overhanging rail to the sheet limit, never the story foot', () => {
    // No column holds a letter: an emptied column bottoms out at its own
    // top, so it is no foot to compare against. The rail gives extras until
    // it ends above the sheet (paper 300 less the colophon's 24px reserve
    // line = 276, plus one body line of slack = 300), not down to the lead
    // story's foot at 120 — that would leave the whole lower page blank.
    const { edition, also } = railScaffold({
      railCount: 20,
      colItems: [],
      colTop: 140,
      storyBottom: 120,
      paperBottom: 300,
    });
    // No column letters anywhere: the balance has nothing to move into, so
    // only the trim decides — against the sheet limit, not the story foot.
    edition.querySelector('.lead-cols .col')?.remove();
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    // The rail's foot starts 100px down and each row is 20px: ten rows end
    // at 300 — the sheet limit (276) plus one body line of slack. Ten of
    // the twenty stay; trimming to the story foot at 120 would keep three.
    expect(also.querySelectorAll('.aside-item')).toHaveLength(10);
    expect(footOf(edition.querySelector('.rail'))).toBe(300);
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
