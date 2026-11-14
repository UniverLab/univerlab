/**
 * The classifieds trim, edge by edge: an unmeasured sheet trims nothing, a
 * one-line notice leaves with its fleuron, coupons go whole, the coupon rule
 * line never goes, and a grid that already points at the Logbook gets no
 * second pointer.
 */
import { fitClassifieds, fitPaper, trimClassifieds } from '../lib/paper-fit';

const rect = (bottom: number): DOMRect =>
  ({ x: 0, y: 0, width: 100, height: 0, top: bottom, left: 0, bottom, right: 100, toJSON: () => {} }) as DOMRect;

/** A grid whose foot sits `rowPx` lower for every child it still holds. */
function liveGrid(grid: HTMLElement, top = 0, rowPx = 50): void {
  grid.getBoundingClientRect = () => rect(top + grid.children.length * rowPx);
}

function setBottom(el: Element, bottom: number): void {
  (el as HTMLElement).getBoundingClientRect = () => rect(bottom);
}

describe('trimClassifieds', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('trims nothing when the sheet was never measured', () => {
    document.body.innerHTML = '<div class="classifieds"><article></article><article></article></div>';
    const grid = document.querySelector('.classifieds') as HTMLElement;
    liveGrid(grid);
    expect(trimClassifieds(grid, 0)).toBe(0);
    expect(trimClassifieds(grid, -10)).toBe(0);
    expect(grid.children).toHaveLength(2);
  });

  it('takes a one-line notice off together with its fleuron, and coupons whole', () => {
    document.body.innerHTML =
      '<div class="classifieds">' +
      '<article id="a"></article>' +
      '<a class="coupon" href="#"></a>' +
      '<span class="notice-fleuron"></span>' +
      '<p class="notice-run"></p>' +
      '</div>';
    const grid = document.querySelector('.classifieds') as HTMLElement;
    liveGrid(grid);
    // Four children reach 200. The notice and its fleuron leave as one
    // unit (100), then the coupon (50) fits the limit.
    const removed = trimClassifieds(grid, 50);
    expect(removed).toBe(2);
    expect(grid.querySelector('.notice-run')).toBeNull();
    expect(grid.querySelector('.notice-fleuron')).toBeNull();
    expect(grid.querySelector('.coupon')).toBeNull();
    expect(grid.querySelector('#a')).not.toBeNull();
  });

  it('stops when only unremovable lines are left', () => {
    document.body.innerHTML =
      '<div class="classifieds"><p class="coupon-note"></p><template data-fill="logbook-pointer"></template></div>';
    const grid = document.querySelector('.classifieds') as HTMLElement;
    liveGrid(grid);
    expect(trimClassifieds(grid, 10)).toBe(0);
    expect(grid.querySelector('.coupon-note')).not.toBeNull();
  });
});

describe('fitClassifieds', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const page = (id: string, inner: string, hidden = false): string =>
    `<section class="paper-page"${hidden ? ' hidden' : ''}><div id="${id}">${inner}</div></section>`;

  it('skips hidden pages and grids on an unmeasured sheet', () => {
    document.body.innerHTML =
      '<div class="paper">' +
      page('lab-body', '<div class="classifieds"><article></article><article></article></div>', true) +
      '</div>';
    const grid = document.querySelector('.classifieds') as HTMLElement;
    liveGrid(grid);
    setBottom(document.querySelector('.paper')!, 10);
    expect(fitClassifieds(document)).toEqual({ trimmedAds: 0, pointers: 0 });
    expect(grid.children).toHaveLength(2);

    (document.querySelector('.paper-page') as HTMLElement).hidden = false;
    setBottom(document.querySelector('.paper')!, 0);
    expect(fitClassifieds(document)).toEqual({ trimmedAds: 0, pointers: 0 });
    expect(grid.children).toHaveLength(2);
  });

  it('adds no second pointer when the page already points at the Logbook', () => {
    document.body.innerHTML =
      '<div class="paper">' +
      page(
        'lab2-body',
        '<div class="classifieds"><article></article><article></article><article></article></div>' +
          '<p class="lab-more">More in the Logbook</p>' +
          '<template data-fill="logbook-pointer"><p class="lab-more">x</p></template>',
      ) +
      '</div>';
    const grid = document.querySelector('.classifieds') as HTMLElement;
    liveGrid(grid);
    setBottom(document.querySelector('.paper')!, 60);
    const out = fitClassifieds(document);
    expect(out.trimmedAds).toBe(2);
    expect(out.pointers).toBe(0);
    expect(document.querySelectorAll('#lab2-body > .lab-more')).toHaveLength(1);
  });

  it('adds no pointer when the page has no pointer template, or an empty one', () => {
    for (const tpl of ['', '<template data-fill="logbook-pointer"></template>']) {
      document.body.innerHTML =
        '<div class="paper">' +
        page('lab-body', '<div class="classifieds"><article></article><article></article></div>' + tpl) +
        '</div>';
      const grid = document.querySelector('.classifieds') as HTMLElement;
      liveGrid(grid);
      setBottom(document.querySelector('.paper')!, 60);
      const out = fitClassifieds(document);
      expect(out.trimmedAds).toBe(1);
      expect(out.pointers).toBe(0);
    }
  });
});

describe('fitPaper', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fits a front page that sits outside the paged sheet', () => {
    document.body.innerHTML = '<div class="paper"><div id="edition"><div class="cols"></div></div></div>';
    expect(fitPaper(document)).toEqual({
      trimmedLetters: 0,
      movedLetters: 0,
      fillers: 0,
      trimmedAds: 0,
      pointers: 0,
    });
  });

  it('returns zeros for a root that cannot be queried', () => {
    expect(fitPaper({} as ParentNode)).toEqual({
      trimmedLetters: 0,
      movedLetters: 0,
      fillers: 0,
      trimmedAds: 0,
      pointers: 0,
    });
  });
});
