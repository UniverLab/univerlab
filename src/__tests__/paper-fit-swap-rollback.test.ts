/**
 * The page-one fitter's swap and rollback paths, and the small branches its
 * other tests never reach — run against a laid-out page in miniature, the
 * same harness as paper-fit-compose: every block reports the height a
 * reader's browser would give it, so each test pins an observable outcome
 * (which letters print, in which column, how wide the lead photo stands).
 */
import {
  balanceHeads,
  fillClassifiedsFoot,
  fitClassifieds,
  fitFrontPage,
  trimColumn,
} from '../lib/paper-fit';

interface Model {
  /** The paper's bottom edge (and its height: the sheet starts at 0). */
  paper: number;
  /** The paper's layout width; a change stands for a new layout. */
  paperWidth: number;
  /** The paper's layout height, when the sheet is drawn at another scale. */
  paperLayoutHeight?: number;
  /** The lead's width, and the grid tracks its stylesheet gives it. */
  leadWidth: number;
  leadTracks: string;
  /** The lead text's area, in square pixels: its height is this over its width. */
  leadText: number;
  /** The lead photo's height per pixel of width. */
  ratio: number;
  /** A continued heading wraps to two lines once laid out. */
  tallCont: boolean;
  /** The wide house notice's height. */
  wide: number;
}

const COLOPHON = 20;
const HEAD = 20;
const GAP = 14;
const FILLER = 60;
const DUO = 60;

let model: Model;

const rect = (bottom: number, height = 0): DOMRect =>
  ({ x: 0, y: bottom, width: 100, height, top: bottom - height, left: 0, bottom, right: 100, toJSON: () => {} }) as DOMRect;

const px = (v: string): number => Number.parseFloat(v) || 0;

/** The lead photo's width, as the fit sets it inline. */
const figWidth = (fig: HTMLElement): number => px(fig.style.width) || 272;

function leadParts(lead: HTMLElement): { fig: number; words: number; text: number; total: number } {
  const fig = lead.querySelector(':scope > .photo--lead') as HTMLElement | null;
  const across = lead.classList.contains('lead--across');
  if (!fig) {
    const text = model.leadText / model.leadWidth;
    return { fig: 0, words: 150 + text, text, total: 150 + text };
  }
  const w = figWidth(fig);
  const figH = w * model.ratio + 20;
  const text = model.leadText / (model.leadWidth - w - 24);
  // Beside the photo the headline wraps to three lines; across the lead it
  // takes two.
  const words = across ? text : 150 + text;
  const total = across ? 100 + Math.max(figH, text) : Math.max(figH, words);
  return { fig: figH, words, text, total };
}

/** A letter's picture grows its letter as the fit widens it. */
const PHOTO_EXTRA: Record<string, number> = { '': 0, '50%': 15, '62%': 30, '100%': 60, '76px': 10, '96px': 20, '38%': 30 };

function heightOf(el: Element): number {
  const h = el as HTMLElement;
  if (h.tagName === 'H3' && h.closest('.col') && !h.closest('aside')) {
    return model.tallCont && h.querySelector('.cont') ? HEAD * 2 : HEAD;
  }
  if (h.tagName === 'ARTICLE' && h.classList.contains('item')) {
    const fig = h.querySelector(':scope > .photo') as HTMLElement | null;
    return Number(h.getAttribute('data-h') || 0) + (fig ? PHOTO_EXTRA[fig.style.width] ?? 0 : 0);
  }
  if (h.classList.contains('notice--wide')) return model.wide;
  if ((h.tagName === 'FIGURE' && h.classList.contains('paper-plate')) || h.tagName === 'ASIDE') return FILLER;
  if (h.classList.contains('colophon-note')) return COLOPHON;
  if (h.tagName === 'ARTICLE' && h.classList.contains('lead')) return leadParts(h).total;
  return 0;
}

function bandTop(): number {
  const lead = document.querySelector('article.lead') as HTMLElement | null;
  const duo = document.querySelector('.front > aside.notice--feature');
  return 100 + (lead ? heightOf(lead) + 18 : 0) + (duo ? DUO + 18 : 0);
}

function colBottom(col: Element): number {
  const kids = Array.from(col.children);
  const sum = kids.reduce((n, k) => n + heightOf(k), 0);
  return bandTop() + sum + (kids.length ? GAP * (kids.length - 1) : 0);
}

const saved: Array<[object, string, PropertyDescriptor | undefined]> = [];
function patch(target: object, key: string, desc: PropertyDescriptor): void {
  saved.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
  Object.defineProperty(target, key, { configurable: true, ...desc });
}

beforeEach(() => {
  model = {
    paper: 1000,
    paperWidth: 1000,
    leadWidth: 1000,
    leadTracks: 'minmax(0, 1fr) auto',
    leadText: 100000,
    ratio: 1.3,
    tallCont: false,
    wide: 1000,
  };
  patch(HTMLElement.prototype, 'getBoundingClientRect', {
    value(this: HTMLElement): DOMRect {
      if (this.classList.contains('paper')) return rect(model.paper, model.paper);
      if (this.classList.contains('cols')) {
        const feet = Array.from(this.children).map(colBottom);
        const top = bandTop();
        return rect(Math.max(top, ...feet), Math.max(top, ...feet) - top);
      }
      if (this.classList.contains('col')) return rect(colBottom(this), colBottom(this) - bandTop());
      if (this.classList.contains('notice--wide')) {
        const band = document.querySelector('.cols');
        const foot = band ? band.getBoundingClientRect().bottom : bandTop();
        return rect(foot + 18 + model.wide, model.wide);
      }
      if (this.classList.contains('notice--feature')) return rect(100 + DUO, DUO);
      const h = heightOf(this);
      return rect(h, h);
    },
  });
  patch(HTMLElement.prototype, 'offsetHeight', {
    get(this: HTMLElement): number {
      if (this.classList.contains('paper')) return model.paperLayoutHeight ?? model.paper;
      const lead = this.closest('article.lead') as HTMLElement | null;
      if (lead) {
        const parts = leadParts(lead);
        if (this === lead) return parts.total;
        if (this.classList.contains('photo--lead')) return parts.fig;
        if (this.classList.contains('lead-main')) return parts.words;
        if (this.classList.contains('lead-text')) return parts.text;
      }
      return heightOf(this);
    },
  });
  patch(HTMLElement.prototype, 'offsetWidth', {
    get(this: HTMLElement): number {
      return this.classList.contains('paper') ? model.paperWidth : 0;
    },
  });
  patch(HTMLElement.prototype, 'clientWidth', {
    get(this: HTMLElement): number {
      return this.classList.contains('lead') ? model.leadWidth : 0;
    },
  });
});

afterEach(() => {
  while (saved.length) {
    const [target, key, desc] = saved.pop()!;
    if (desc) Object.defineProperty(target, key, desc);
    else delete (target as Record<string, unknown>)[key];
  }
  document.body.innerHTML = '';
});

type Letter = [kind: 'event' | 'born' | 'died', order: number, height: number, photo?: 'event' | 'stamp'];

interface PageOpts {
  lead?: 'portrait' | 'landscape' | 'text' | null;
  /** Filler templates by kind; a kind passed as '' never fills. */
  fillers?: Partial<Record<'plate' | 'install' | 'collab' | 'house-duo', string>>;
}

function itemHtml([kind, i, h, photo]: Letter): string {
  const cls = photo ? `item has-photo item--${photo}` : 'item';
  const fig = photo ? `<figure class="photo photo--${photo}"><div class="print"><img alt=""></div></figure>` : '';
  return `<article class="${cls}" data-kind="${kind}" data-i="${i}" data-h="${h}">${fig}</article>`;
}

function page(letters: Letter[], opts: PageOpts = {}): HTMLElement {
  const lead = opts.lead === undefined ? null : opts.lead;
  const leadHtml = !lead
    ? ''
    : `<article class="lead${lead === 'text' ? ' lead--text' : ''}" style="grid-template-columns: ${model.leadTracks}">` +
      `<div class="lead-main"><p class="kicker">Letter of the day</p><h2>Headline</h2>` +
      `<div class="lead-text"><p class="dropcap">Body</p></div></div>` +
      (lead === 'text'
        ? ''
        : `<figure class="photo photo--lead${lead === 'portrait' ? ' photo--lead--portrait' : ''}"><div class="print"><img alt=""></div></figure>`) +
      `</article>`;
  const cols: string[][] = Array.from({ length: 3 }, () => []);
  // The server's columns scramble the reading order: the fit re-cuts by data-i.
  letters.forEach((l, k) => cols[(k + 1) % 3].push(itemHtml(l)));
  const fillers = {
    plate: '<figure class="photo paper-plate"><div class="print"></div></figure>',
    install: '<aside class="notice notice--small"><h3 class="display-notice">Install</h3></aside>',
    collab: '<aside class="notice notice--small"><h3 class="display-notice">Write</h3></aside>',
    'house-duo': '<aside class="notice notice--small"><h3 class="display-notice">Both</h3></aside>',
    ...(opts.fillers ?? {}),
  };
  document.body.innerHTML =
    '<div class="paper"><section class="paper-page" id="page-1"><div id="edition"><div class="front">' +
    leadHtml +
    '<div class="cols" data-cont="continued">' +
    cols.map((c) => `<section class="col">${c.length ? '<h3>Births</h3>' : ''}${c.join('')}</section>`).join('') +
    '</div>' +
    Object.entries(fillers)
      .map(([k, v]) => `<template data-filler="${k}">${v}</template>`)
      .join('') +
    '</div><p class="colophon-note">colophon</p></div></section></div>';
  return document.getElementById('edition') as HTMLElement;
}

/** Instance-level foot mock: shadows the patched prototype. */
const setBottom = (el: Element, bottom: () => DOMRect): void => {
  Object.defineProperty(el, 'getBoundingClientRect', { value: bottom, configurable: true });
};

const printed = (edition: Element): number[] =>
  Array.from(edition.querySelectorAll('.cols .col > article.item')).map((a) => Number(a.getAttribute('data-i')));
const colLetters = (edition: Element): number[][] =>
  Array.from(edition.querySelectorAll('.cols .col')).map((c) =>
    Array.from(c.querySelectorAll(':scope > article.item')).map((a) => Number(a.getAttribute('data-i'))),
  );
const colFeet = (edition: Element): number[] =>
  Array.from(edition.querySelectorAll('.cols .col')).map((c) => c.getBoundingClientRect().bottom);
const limitOf = (): number => model.paper - COLOPHON - 2;
const none = { plate: '', install: '', collab: '', 'house-duo': '' };

describe('the swap trades a dropped letter for a printed one of the same kind', () => {
  it('takes back a dropped 60 into a printed 40’s place so the columns end together', () => {
    // Six births: a tall 100 and five short letters. The cut that fits the
    // room drops the 100 and a 60; neither fits back in — but the columns
    // end closer together with the 60 standing where a 40 stood, so the
    // dropped 60 takes the printed 40's place. Births keep every printed
    // letter; the page still ends in the sheet.
    const letters: Letter[] = [
      ['born', 0, 100],
      ['born', 1, 40],
      ['born', 2, 40],
      ['born', 3, 40],
      ['born', 4, 60],
      ['born', 5, 60],
    ];
    // The room fits the re-cut four but not all six.
    model.paper = 128 + 100 + COLOPHON + 2;
    const edition = page(letters, { fillers: none });
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(2);
    // The dropped 60 prints; the printed 40 does not — same kind either way.
    expect(printed(edition)).toEqual([2, 3, 4, 5]);
    expect(colLetters(edition)).toEqual([[2, 3], [4], [5]]);
    expect(out.movedLetters).toBe(3);
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
  });
});

describe('the second pass keeps the first pass when it would drop more', () => {
  const births: Letter[] = [
    ['born', 0, 60],
    ['born', 1, 60],
    ['born', 2, 60],
    ['born', 3, 60],
    ['born', 4, 60],
    ['born', 5, 60],
  ];

  it('holds the narrow lead when growing it would push the wrapped headings past the sheet', () => {
    // Continued headings wrap to two lines once laid out, so the plan
    // under-reads the columns by a line per continued column: with some
    // fifty pixels of spare room the second pass offers it to the lead
    // photo, the wider lead pushes the columns past the sheet, and a
    // letter would have to go — so the first pass stands.
    model.tallCont = true;
    model.leadText = 160000;
    model.paper = 750;
    const edition = page(births, { lead: 'portrait', fillers: none });
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    expect(printed(edition)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(colLetters(edition)).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
    // The page ends some fifty pixels inside the sheet: room the second
    // pass would spend on the lead.
    const spare = limitOf() - Math.max(...colFeet(edition));
    expect(spare).toBeGreaterThan(48);
    // Yet the lead stands at its narrowest close width: the grown lead did
    // not survive. A slightly taller sheet grows it (see below).
    expect(figWidth(edition.querySelector('.photo--lead') as HTMLElement)).toBe(240);
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
    // The carried kinds still read continued under the wrapped headings.
    const heads = Array.from(edition.querySelectorAll('.cols .col > h3'));
    expect(heads).toHaveLength(3);
    expect(heads[1].querySelector('.cont')).not.toBeNull();
    expect(heads[2].querySelector('.cont')).not.toBeNull();
  });

  it('grows the lead once the sheet has room for the wider lead and its columns', () => {
    // The same day on a slightly taller sheet: the grown lead leaves the
    // letters fitting, so the second pass stands and the photo widens.
    model.tallCont = true;
    model.leadText = 160000;
    model.paper = 760;
    const edition = page(births, { lead: 'portrait', fillers: none });
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    expect(printed(edition)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(figWidth(edition.querySelector('.photo--lead') as HTMLElement)).toBe(312);
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
  });
});

describe('balanceHeads', () => {
  it('stops after a thousand moves without converging', () => {
    // One head of 2500 unit lines against an empty head: the spread narrows
    // every move but never closes within the guard, so the balancing gives
    // up at a thousand moves with every letter kept.
    const cols = [Array.from({ length: 2500 }, () => ({ w: 1 })), [] as { w: number }[]];
    const weights = cols.map((c) => c.map((e) => e.w));
    expect(balanceHeads(cols, weights, 1, 100000)).toBe(1000);
    expect(cols[0].length).toBe(1500);
    expect(cols[1].length).toBe(1000);
    expect(cols.flat()).toHaveLength(2500);
  });
});

describe('trimColumn', () => {
  it('leaves a letterless column alone: nothing to trim, nothing pruned', () => {
    // A column holding only a house notice runs past the sheet, but no
    // whole letter stands on its foot — so nothing is removed.
    document.body.innerHTML =
      '<div class="paper"><section class="paper-page" id="page-1"><div id="edition"><div class="front">' +
      '<div class="cols"><section class="col"><aside class="notice notice--small">house</aside></section></div>' +
      '</div></div></section></div>';
    const col = document.querySelector('.cols .col') as HTMLElement;
    setBottom(col, () => rect(200, 50));
    expect(trimColumn(col, 100)).toBe(0);
    expect(col.querySelector('aside.notice')).not.toBeNull();
  });
});

describe('the fit without style metrics', () => {
  it('fits the page when the grid’s row gap cannot be read', () => {
    // The sheet limit reserves the row gap; when reading it throws, the
    // limit falls back to no gap and the page still fits.
    const letters: Letter[] = [
      ['born', 0, 60],
      ['born', 1, 60],
      ['died', 2, 60],
    ];
    model.paper = 100 + 400 + COLOPHON + 2;
    let rowReads = 0;
    const real = globalThis.getComputedStyle;
    (globalThis as unknown as { getComputedStyle: unknown }).getComputedStyle = () => ({
      get rowGap() {
        rowReads++;
        if (rowReads === 1) throw new Error('no row metrics');
        return '';
      },
      gap: '',
      fontSize: '',
      lineHeight: '',
      paddingBottom: '',
      marginTop: '',
      marginBottom: '',
    });
    try {
      const edition = page(letters);
      const out = fitFrontPage(edition);
      expect(out.trimmedLetters).toBe(0);
      expect(printed(edition)).toEqual([0, 1, 2]);
      expect(out.fillers).toBe(3);
      for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
    } finally {
      globalThis.getComputedStyle = real;
    }
  });

  it('keeps a filler whose display headline cannot be measured', () => {
    // A filler is dropped only when its headline provably breaks one word
    // per line; when the range behind the measure throws, nothing is
    // proven and the filler stands.
    const letters: Letter[] = [
      ['born', 0, 60],
      ['born', 1, 60],
      ['died', 2, 60],
    ];
    model.paper = 100 + 400 + COLOPHON + 2;
    patch(document, 'createRange', {
      value: () => {
        throw new Error('no ranges');
      },
    });
    const edition = page(letters, {
      fillers: {
        install: '<aside class="notice notice--small"><h3 class="display-notice">Install the lab press</h3></aside>',
        collab: '<aside class="notice notice--small"><h3 class="display-notice">Write the lab chronicle</h3></aside>',
      },
    });
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    expect(out.fillers).toBe(3);
    const heads = Array.from(edition.querySelectorAll('.cols .display-notice')).map((h) => h.textContent);
    expect(heads).toContain('Install the lab press');
    expect(heads).toContain('Write the lab chronicle');
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
  });
});

describe('the pictures take only the room left', () => {
  it('leaves a picture at its own size when even the first step would run past the foot', () => {
    // The stamp's column ends five pixels inside the sheet: widening it to
    // its first step would add ten, so the picture keeps its own size and
    // the page ends in the sheet.
    const letters: Letter[] = [
      ['born', 0, 155, 'stamp'],
      ['born', 1, 150],
      ['died', 2, 150],
    ];
    model.paper = 100 + HEAD + GAP + 155 + COLOPHON + 2 + 5;
    const edition = page(letters, { fillers: none });
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    expect(printed(edition)).toEqual([0, 1, 2]);
    const fig = edition.querySelector('.item--stamp > .photo') as HTMLElement;
    expect(fig.style.width).toBe('');
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
  });
});

describe('the last classifieds page fills only what fits', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('takes no house notice when even one would run past the foot', () => {
    // A hundred pixels of room stand past the notices: more than three
    // lines, so the foot is tried — but the house notice itself would run
    // past, so nothing is added and nothing is left half-standing.
    document.body.innerHTML =
      '<div class="paper"><div class="paper-page"><div id="lab-body">' +
      '<div id="lab-log" class="classifieds"><article></article>' +
      '<template data-fill="house-install"><aside class="notice"><p>Install</p></aside></template>' +
      '</div></div></div>';
    const grid = document.querySelector('#lab-log') as HTMLElement;
    const scope = document.querySelector('#lab-body') as HTMLElement;
    const bottoms = [800, 1010, 800, 800, 800, 800];
    let i = 0;
    setBottom(scope, () => rect(bottoms[Math.min(i++, bottoms.length - 1)]));
    expect(fillClassifiedsFoot(grid, scope, 1000)).toBe(0);
    expect(grid.querySelector('aside.notice')).toBeNull();
  });

  it('sets no ornament the foot cannot hold, even halved', () => {
    // Two hundred pixels stand past the notices: the tree goes in at full
    // height, runs past, halves once and still runs past — so it leaves
    // and nothing is added.
    document.body.innerHTML =
      '<div class="paper"><div id="lab-body"><div id="lab-log" class="classifieds">' +
      '<article></article>' +
      '<template data-fill="orn-tree"><figure class="classifieds-plate">' +
      '<img src="/bench/classifieds/tree.webp" alt="" width="547" height="519" loading="lazy" decoding="async">' +
      '</figure></template>' +
      '</div></div></div>';
    const grid = document.querySelector('#lab-log') as HTMLElement;
    const scope = document.querySelector('#lab-body') as HTMLElement;
    const bottoms = [800, 800, 800, 1010, 1005];
    let i = 0;
    setBottom(scope, () => rect(bottoms[Math.min(i++, bottoms.length - 1)]));
    expect(fillClassifiedsFoot(grid, scope, 1000)).toBe(0);
    expect(grid.querySelector('figure.classifieds-plate')).toBeNull();
  });
});

describe('fitClassifieds', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('takes the pointer back when nothing else can leave to make room for it', () => {
    // One card on a short sheet: the card leaves, the Logbook pointer
    // lands, and it still runs past — but only the coupon rule line and the
    // template are left, so no card can leave for it and the pointer goes
    // back rather than overlap a notice.
    document.body.innerHTML =
      '<div class="paper">' +
      '<section class="paper-page"><div id="lab-body">' +
      '<div class="classifieds"><article></article>' +
      '<template data-fill="logbook-pointer"><p class="lab-more">More in the Logbook</p></template>' +
      '</div></div></section>' +
      '</div>';
    const grid = document.querySelector('.classifieds') as HTMLElement;
    const scope = document.querySelector('#lab-body') as HTMLElement;
    setBottom(grid, () => rect(grid.children.length * 50));
    setBottom(document.querySelector('.paper') as HTMLElement, () => rect(60));
    setBottom(scope, () =>
      rect(grid.getBoundingClientRect().bottom + (scope.querySelector('.lab-more') ? 1000 : 0)),
    );
    expect(fitClassifieds(document)).toEqual({ trimmedAds: 1, pointers: 0 });
    expect(scope.querySelector('.lab-more')).toBeNull();
    expect(grid.children).toHaveLength(1);
  });
});
