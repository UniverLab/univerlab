/**
 * Page one's composition rules, run against a laid-out page in miniature:
 * every block reports the height a reader's browser would give it, so the
 * fit's decisions (where the lead photo stands and how wide, which letters
 * yield, where the fillers go, what grows into spare room, when a page is
 * refitted) are pinned without a browser. `npm run check:paper` measures the
 * same rules on the real page.
 */
import { fitFrontPage } from '../lib/paper-fit';

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

const rect = (bottom: number, height: number): DOMRect =>
  ({ x: 0, y: bottom - height, width: 100, height, top: bottom - height, left: 0, bottom, right: 100, toJSON: () => {} }) as DOMRect;

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
  duo?: boolean;
  /** How many columns the server printed (it may print fewer on a short day). */
  serverCols?: number;
  fillers?: Partial<Record<'plate' | 'install' | 'collab' | 'house-duo', string>>;
}

const HEADS: Record<string, string> = { event: 'Events', born: 'Births', died: 'Deaths' };

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
  const n = opts.serverCols ?? 3;
  const cols: string[][] = Array.from({ length: n }, () => []);
  // The server's columns scramble the reading order: the fit re-cuts by data-i.
  letters.forEach((l, k) => cols[(k + 1) % n].push(itemHtml(l)));
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
    (opts.duo ? '<aside class="notice notice--feature"><h3 class="display-notice">Workbench</h3></aside>' : '') +
    (letters.length || opts.serverCols
      ? '<div class="cols" data-cont="continued">' +
        cols.map((c) => `<section class="col">${c.length ? `<h3>${HEADS.born}</h3>` : ''}${c.join('')}</section>`).join('') +
        '</div>'
      : '') +
    Object.entries(fillers)
      .map(([k, v]) => `<template data-filler="${k}">${v}</template>`)
      .join('') +
    '</div><p class="colophon-note">colophon</p></div></section></div>';
  return document.getElementById('edition') as HTMLElement;
}

const printed = (edition: Element): number[] =>
  Array.from(edition.querySelectorAll('.cols .col > article.item')).map((a) => Number(a.getAttribute('data-i')));
const colFeet = (edition: Element): number[] =>
  Array.from(edition.querySelectorAll('.cols .col')).map((c) => c.getBoundingClientRect().bottom);
const limitOf = (): number => model.paper - COLOPHON - 2;

describe('the lead photo is sized to its words', () => {
  it('stands a portrait beside the headline when that ends both sides together', () => {
    model.leadText = 90000;
    const edition = page([], { lead: 'portrait' });
    fitFrontPage(edition);
    const lead = edition.querySelector('article.lead') as HTMLElement;
    const fig = lead.querySelector('.photo--lead') as HTMLElement;
    const parts = leadParts(lead);
    // An upright photo takes between a fifth and two fifths of the lead.
    expect(figWidth(fig)).toBeGreaterThanOrEqual(200);
    expect(figWidth(fig)).toBeLessThanOrEqual(400);
    // Both sides end within about a line of each other.
    expect(Math.abs(parts.fig - (lead.classList.contains('lead--across') ? parts.text : parts.words))).toBeLessThanOrEqual(29 * 1.25);
  });

  it('sets the headline across the lead when that makes the shorter lead', () => {
    // A wide photo and a long text: beside the photo the headline would
    // wrap tall, so across the lead the block ends shorter.
    model.ratio = 0.6;
    model.leadText = 160000;
    const edition = page([], { lead: 'landscape' });
    fitFrontPage(edition);
    const lead = edition.querySelector('article.lead') as HTMLElement;
    expect(lead.classList.contains('lead--across')).toBe(true);
    const fig = lead.querySelector('.photo--lead') as HTMLElement;
    // A landscape photo takes between three tenths and six tenths of the lead.
    expect(figWidth(fig)).toBeGreaterThanOrEqual(300);
    expect(figWidth(fig)).toBeLessThanOrEqual(600);
  });

  it('keeps the closest pair when no width ends both sides within a line', () => {
    // A tiny text beside any photo: the photo shrinks to its narrowest.
    model.leadText = 1000;
    const edition = page([], { lead: 'portrait' });
    fitFrontPage(edition);
    const fig = edition.querySelector('.photo--lead') as HTMLElement;
    expect(figWidth(fig)).toBe(200);
  });

  it('leaves a lead without a photo, or a stacked one, untouched', () => {
    const text = page([], { lead: 'text' });
    fitFrontPage(text);
    expect(text.querySelector('article.lead')!.classList.contains('lead--across')).toBe(false);
    model.leadTracks = 'minmax(0, 1fr)';
    const stacked = page([], { lead: 'portrait' });
    fitFrontPage(stacked);
    expect((stacked.querySelector('.photo--lead') as HTMLElement).style.width).toBe('');
    model.leadTracks = 'minmax(0, 1fr) auto';
    model.leadWidth = 0;
    const unlaid = page([], { lead: 'portrait' });
    fitFrontPage(unlaid);
    expect((unlaid.querySelector('.photo--lead') as HTMLElement).style.width).toBe('');
  });

  it('gives a page whose letters all fit its spare room to the lead photo', () => {
    // Three short letters under a portrait lead. Several photo widths end
    // both sides within a line; with no room to spare the fit takes the
    // narrowest (the shortest lead), with room it takes the widest.
    model.leadText = 90000;
    const letters: Letter[] = [['born', 0, 60], ['born', 1, 60], ['died', 2, 60]];
    const none = { plate: '', install: '', collab: '', 'house-duo': '' };
    model.paper = 544;
    const tight = page(letters, { lead: 'portrait', fillers: none });
    fitFrontPage(tight);
    const tightW = figWidth(tight.querySelector('.photo--lead') as HTMLElement);
    model.paper = 1400;
    const roomy = page(letters, { lead: 'portrait', fillers: none });
    const out = fitFrontPage(roomy);
    expect(out.trimmedLetters).toBe(0);
    expect(printed(roomy)).toEqual([0, 1, 2]);
    const roomyW = figWidth(roomy.querySelector('.photo--lead') as HTMLElement);
    expect(tightW).toBe(200);
    expect(roomyW).toBeGreaterThan(tightW);
    const parts = leadParts(roomy.querySelector('article.lead') as HTMLElement);
    expect(Math.abs(parts.fig - parts.words)).toBeLessThanOrEqual(29 * 1.25);
  });
});

describe('the letters flow in reading order and yield whole', () => {
  const day: Letter[] = [
    ['event', 0, 120],
    ['event', 1, 120],
    ['born', 2, 60],
    ['born', 3, 60],
    ['born', 4, 60],
    ['born', 5, 60],
    ['born', 6, 60],
    ['died', 7, 60],
    ['died', 8, 60],
    ['died', 9, 60],
  ];

  it('re-cuts the server\'s columns, opening a carried kind as continued', () => {
    model.paper = 600;
    const births: Letter[] = Array.from({ length: 9 }, (_, i) => ['born', i, 60]);
    const edition = page(births);
    fitFrontPage(edition);
    expect(printed(edition)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const heads = Array.from(edition.querySelectorAll('.cols .col > h3'));
    expect(heads).toHaveLength(3);
    expect(heads[0].querySelector('.cont')).toBeNull();
    expect(heads[1].querySelector('.cont')?.textContent).toBe('continued');
    expect(heads[2].querySelector('.cont')?.textContent).toBe('continued');
  });

  it('adds the columns a short day\'s server left out, all one width', () => {
    model.paper = 700;
    const edition = page(
      [['born', 0, 60], ['born', 1, 60], ['born', 2, 60], ['died', 3, 60]],
      { serverCols: 1 },
    );
    fitFrontPage(edition);
    expect(edition.querySelectorAll('.cols .col')).toHaveLength(3);
    expect(printed(edition)).toEqual([0, 1, 2, 3]);
  });

  it('drops the Workbench display before any letter', () => {
    // The letters fit only once the display steps aside: the sheet ends a
    // few pixels under the letters' own balanced foot.
    model.paper = 2000;
    const measure = page(day, { fillers: { plate: '', install: '', collab: '', 'house-duo': '' } });
    fitFrontPage(measure);
    model.paper = Math.max(...colFeet(measure)) + COLOPHON + 2 + 5;
    const edition = page(day, { duo: true });
    const out = fitFrontPage(edition);
    expect(edition.querySelector('aside.notice--feature')).toBeNull();
    expect(out.trimmedLetters).toBe(0);
    expect(printed(edition)).toHaveLength(day.length);
  });

  it('lets the largest kinds yield, never emptying a kind, and prints no filler where a letter went', () => {
    model.paper = 360;
    const edition = page(day, { duo: true });
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBeGreaterThan(0);
    const order = printed(edition);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const kinds = new Set(order.map((i) => day[i][0]));
    expect(kinds).toEqual(new Set(['event', 'born', 'died']));
    // Births were the largest kind: they yielded first.
    const born = order.filter((i) => day[i][0] === 'born').length;
    expect(born).toBeLessThan(5);
    expect(edition.querySelector('.cols .paper-plate, .cols aside.notice, .notice--wide')).toBeNull();
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
  });

  it('takes back a letter that fits again once a taller one yields', () => {
    // Births outnumber deaths, so a birth yields first; that is not enough
    // while the tall death stands. Once the deaths are as many, the tall
    // death yields too — and the birth that went first fits again.
    const letters: Letter[] = [
      ['born', 0, 40],
      ['born', 1, 40],
      ['born', 2, 40],
      ['born', 3, 40],
      ['died', 4, 200],
      ['died', 5, 40],
    ];
    const none = { plate: '', install: '', collab: '', 'house-duo': '' };
    model.paper = 2000;
    const measure = page(letters.filter((l) => l[1] !== 4), { fillers: none });
    fitFrontPage(measure);
    model.paper = Math.max(...colFeet(measure)) + COLOPHON + 2 + 5;
    const edition = page(letters, { fillers: none });
    const out = fitFrontPage(edition);
    expect(printed(edition)).toEqual([0, 1, 2, 3, 5]);
    expect(out.trimmedLetters).toBe(1);
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
  });

  it('trims a column the laid-out page runs past the sheet, even when the plan fit', () => {
    // A continued heading wraps once laid out: the plan's heights were short
    // of the page's, and the column gives up a letter to end in the sheet.
    model.tallCont = true;
    model.paper = 100 + 180 + COLOPHON + 2;
    const births: Letter[] = Array.from({ length: 6 }, (_, i) => ['born', i, 60]);
    const edition = page(births, { fillers: { plate: '', install: '', collab: '', 'house-duo': '' } });
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBeGreaterThan(0);
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
  });

  it('removes the band when no letter is left to print', () => {
    model.paper = 100 + 30 + COLOPHON + 2;
    const edition = page([['born', 0, 60]]);
    fitFrontPage(edition);
    expect(edition.querySelector('.cols')).toBeNull();
    const empty = page([], { serverCols: 2 });
    fitFrontPage(empty);
    expect(empty.querySelector('.cols')).toBeNull();
  });

  it('drops a Workbench display that runs past a page without letters', () => {
    model.paper = 100;
    const edition = page([], { duo: true });
    fitFrontPage(edition);
    expect(edition.querySelector('aside.notice--feature')).toBeNull();
    model.paper = 1000;
    const roomy = page([], { duo: true });
    fitFrontPage(roomy);
    expect(roomy.querySelector('aside.notice--feature')).not.toBeNull();
  });
});

describe('spare room on a day whose letters all fit', () => {
  const letters: Letter[] = [
    ['born', 0, 60],
    ['born', 1, 60],
    ['born', 2, 60],
    ['died', 3, 60],
    ['died', 4, 60],
    ['died', 5, 60],
  ];

  it('foots three columns with the plate and the two notices, one each', () => {
    model.paper = 100 + 400 + COLOPHON + 2;
    const edition = page(letters);
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    expect(out.fillers).toBe(3);
    expect(out.plateColumn).toBeGreaterThanOrEqual(0);
    for (const col of Array.from(edition.querySelectorAll('.cols .col'))) {
      expect(col.querySelectorAll(':scope > .paper-plate, :scope > aside.notice')).toHaveLength(1);
      // The filler stands at the column's foot, under its letters.
      expect(col.lastElementChild?.matches('.paper-plate, aside.notice')).toBe(true);
    }
  });

  it('closes the front with the house notices across its width when they fit whole', () => {
    model.paper = 100 + 400 + COLOPHON + 2;
    model.wide = 40;
    const edition = page(letters);
    fitFrontPage(edition);
    const wide = edition.querySelector('.front > aside.notice--wide');
    expect(wide).not.toBeNull();
    expect(wide!.previousElementSibling?.classList.contains('cols')).toBe(true);
    model.wide = 1000;
    const tight = page(letters);
    fitFrontPage(tight);
    expect(tight.querySelector('.notice--wide')).toBeNull();
  });

  it('skips a notice whose display headline breaks one word per line', () => {
    model.paper = 100 + 400 + COLOPHON + 2;
    const original = document.createRange.bind(document);
    patch(document, 'createRange', {
      value: () => {
        const range = original();
        let words = 0;
        range.selectNodeContents = (node: Node) => {
          words = (node.textContent || '').trim().split(/\s+/).length;
        };
        range.getClientRects = () =>
          Array.from({ length: words }, (_, i) => rect(10 + i * 20, 20)) as unknown as DOMRectList;
        return range;
      },
    });
    const edition = page(letters, {
      fillers: {
        install: '<aside class="notice notice--small"><h3 class="display-notice">The lab’s machines</h3></aside>',
      },
    });
    fitFrontPage(edition);
    const heads = Array.from(edition.querySelectorAll('.cols .display-notice')).map((h) => h.textContent);
    expect(heads).not.toContain('The lab’s machines');
    expect(heads).toContain('Write');
  });

  it('grows the letters\' pictures into the room left, a full-width event over its words', () => {
    model.paper = 100 + 420 + COLOPHON + 2;
    const pictured: Letter[] = [
      ['event', 0, 100, 'event'],
      ['born', 1, 60, 'stamp'],
      ['born', 2, 60, 'stamp'],
      ['died', 3, 60, 'stamp'],
    ];
    const edition = page(pictured, { fillers: { plate: '', install: '', collab: '', 'house-duo': '' } });
    fitFrontPage(edition);
    const eventFig = edition.querySelector('.item--event > .photo') as HTMLElement;
    expect(eventFig.style.width).toBe('100%');
    expect(eventFig.style.float).toBe('none');
    const stamps = Array.from(edition.querySelectorAll('.item--stamp > .photo')) as HTMLElement[];
    expect(stamps.some((f) => f.style.width !== '')).toBe(true);
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
  });

  it('stops a picture at the last step that still ends at the foot', () => {
    // One event: half the column fits under the sheet's limit, the next
    // step does not, so the picture settles at half.
    model.paper = 100 + HEAD + GAP + 100 + 20 + COLOPHON + 2;
    const edition = page([['event', 0, 100, 'event']], { fillers: { plate: '', install: '', collab: '', 'house-duo': '' } });
    fitFrontPage(edition);
    const fig = edition.querySelector('.item--event > .photo') as HTMLElement;
    expect(fig.style.width).toBe('50%');
    expect(fig.style.float).toBe('');
  });

  it('gives up a filler before a letter when the laid-out column runs past the sheet', () => {
    // The plan fits a filler under two letters per column; once laid out,
    // the continued headings wrap and a column overruns: its filler goes,
    // every letter stays.
    model.tallCont = true;
    model.paper = 100 + (HEAD + GAP + 60 + GAP + 60 + GAP + FILLER) + COLOPHON + 2;
    const births: Letter[] = Array.from({ length: 6 }, (_, i) => ['born', i, 60]);
    const edition = page(births, { fillers: { 'house-duo': '' } });
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    expect(printed(edition)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(out.fillers).toBeLessThan(3);
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
  });

  it('keeps a picture at its own size when even the first step would run past the foot', () => {
    // The stamp's column ends exactly at the sheet's limit.
    model.paper = 100 + HEAD + GAP + 155 + COLOPHON + 2;
    const pictured: Letter[] = [
      ['born', 0, 155, 'stamp'],
      ['born', 1, 150],
      ['died', 2, 150],
    ];
    const edition = page(pictured, { fillers: { plate: '', install: '', collab: '', 'house-duo': '' } });
    fitFrontPage(edition);
    const fig = edition.querySelector('.item--stamp > .photo') as HTMLElement;
    expect(fig.style.width).toBe('');
  });
});

describe('refitting', () => {
  const births: Letter[] = Array.from({ length: 9 }, (_, i) => ['born', i, 60]);

  it('leaves a fitted page alone for the same layout and refits all letters for a new one', () => {
    model.paper = 100 + 120 + COLOPHON + 2;
    const edition = page(births, { fillers: { plate: '', install: '', collab: '', 'house-duo': '' } });
    const first = fitFrontPage(edition);
    expect(first.trimmedLetters).toBeGreaterThan(0);
    const fitted = edition.innerHTML;
    expect(fitFrontPage(edition)).toEqual({ trimmedLetters: 0, movedLetters: 0, fillers: 0, plateColumn: -1 });
    expect(edition.innerHTML).toBe(fitted);
    // The faces land: the same page, new metrics, a taller sheet.
    const faces: Array<{ status: string }> = [{ status: 'loaded' }];
    patch(document, 'fonts', { value: { forEach: (fn: (f: { status: string }) => void) => faces.forEach(fn) } });
    model.paper = 1000;
    const again = fitFrontPage(edition);
    expect(again.trimmedLetters).toBe(0);
    expect(printed(edition)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('takes a re-rendered edition as its new starting point', () => {
    model.paper = 1000;
    const edition = page(births.slice(0, 3), { fillers: { plate: '', install: '', collab: '', 'house-duo': '' } });
    fitFrontPage(edition);
    const next = page(births, { fillers: { plate: '', install: '', collab: '', 'house-duo': '' } });
    edition.innerHTML = next.innerHTML;
    fitFrontPage(edition);
    expect(printed(edition)).toHaveLength(9);
  });

  it('fits on when the font list cannot be read', () => {
    model.paper = 1000;
    patch(document, 'fonts', {
      value: {
        forEach: () => {
          throw new Error('not ready');
        },
      },
    });
    const edition = page(births, { fillers: { plate: '', install: '', collab: '', 'house-duo': '' } });
    expect(fitFrontPage(edition).trimmedLetters).toBe(0);
    expect(printed(edition)).toHaveLength(9);
  });

  it('measures a scaled sheet in its own display pixels', () => {
    // A phone draws the sheet at half size: the same page fits the same.
    model.paper = 1000;
    model.paperLayoutHeight = 2000;
    const edition = page(births, { fillers: { plate: '', install: '', collab: '', 'house-duo': '' } });
    const out = fitFrontPage(edition);
    expect(out.trimmedLetters).toBe(0);
    for (const foot of colFeet(edition)) expect(foot).toBeLessThanOrEqual(limitOf() + 1);
  });
});
