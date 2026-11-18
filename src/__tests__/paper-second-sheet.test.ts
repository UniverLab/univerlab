/**
 * The second content sheet: page one's overflow prints after page one when it
 * fills the sheet, in reading order, in balanced full-width columns with
 * photos — never on a near-empty sheet, never twice, and never past one
 * sheet. Run against a laid-out page in miniature: every block reports the
 * height a reader's browser would give it, so each test pins an observable
 * outcome (shown or hidden, which letters print, in which column).
 */
import {
  SECOND_SHEET_FILL,
  composeSecondSheet,
} from '../lib/paper-second-sheet';
import { fitFrontPage } from '../lib/paper-fit';

let paperBottom = 2000;
/** The continued band opens under the folio line. */
const BAND_TOP = 300;
const HEAD = 20;
const GAP = 14;

/** A letter's picture grows its letter as the fit widens it. */
const PHOTO_EXTRA: Record<string, number> = {
  '': 0,
  '50%': 15,
  '62%': 30,
  '100%': 60,
  '76px': 10,
  '96px': 20,
  '38%': 30,
};

const rect = (bottom: number, height = 0): DOMRect =>
  ({ x: 0, y: bottom, width: 100, height, top: bottom - height, left: 0, bottom, right: 100, toJSON: () => {} }) as DOMRect;

function heightOf(el: Element): number {
  const h = el as HTMLElement;
  if (h.tagName === 'H3' && h.closest('.col')) return HEAD;
  if (h.tagName === 'ARTICLE' && h.classList.contains('item')) {
    const fig = h.querySelector(':scope > .photo') as HTMLElement | null;
    return Number(h.getAttribute('data-h') || 0) + (fig ? (PHOTO_EXTRA[fig.style.width] ?? 0) : 0);
  }
  return 0;
}

function colBottom(col: Element): number {
  const kids = Array.from(col.children);
  const sum = kids.reduce((n, k) => n + heightOf(k), 0);
  return BAND_TOP + sum + (kids.length ? GAP * (kids.length - 1) : 0);
}

const saved: Array<[object, string, PropertyDescriptor | undefined]> = [];
function patch(target: object, key: string, desc: PropertyDescriptor): void {
  saved.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
  Object.defineProperty(target, key, { configurable: true, ...desc });
}

beforeEach(() => {
  paperBottom = 2000;
  patch(HTMLElement.prototype, 'getBoundingClientRect', {
    value(this: HTMLElement): DOMRect {
      if (this.classList.contains('paper')) return rect(paperBottom, paperBottom);
      if (this.classList.contains('cols')) {
        if (!this.closest('#page-1b')) return rect(0, 0);
        const feet = Array.from(this.children).map(colBottom);
        const bottom = Math.max(BAND_TOP, ...feet);
        return rect(bottom, bottom - BAND_TOP);
      }
      if (this.classList.contains('col')) {
        if (!this.closest('#page-1b')) return rect(0, 0);
        const bottom = colBottom(this);
        return rect(bottom, bottom - BAND_TOP);
      }
      const h = heightOf(this);
      return rect(h, h);
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

interface Seed {
  order: number;
  kind: string;
  height: number;
  photo?: 'event' | 'stamp';
}

function articleHtml(s: Seed): string {
  const cls = s.photo ? `item has-photo item--${s.photo}` : 'item';
  const fig = s.photo ? `<figure class="photo photo--${s.photo}"><div class="print"><img alt=""></div></figure>` : '';
  return `<article class="${cls}" data-kind="${s.kind}" data-i="${s.order}" data-h="${s.height}">${fig}</article>`;
}

function mount(page1Cols: string, seeds: Seed[]): void {
  document.body.innerHTML =
    '<div class="paper">' +
    '<section class="paper-page" id="page-1"><div id="edition"><div class="front">' +
    `<div class="cols" data-cont="continued">${page1Cols}</div>` +
    `<template data-overflow>${seeds.map(articleHtml).join('')}</template>` +
    '</div></div></section>' +
    '<section class="paper-page" id="page-1b" hidden>' +
    '<header class="folio"><span class="folio-page">Continued</span></header>' +
    '<div id="page-1b-body"></div>' +
    '</section>' +
    '</div>';
}

const bandIds = (): number[] =>
  Array.from(document.querySelectorAll('#page-1b-body .cols .col > article.item')).map((a) =>
    Number(a.getAttribute('data-i')),
  );

const templateIds = (): number[] =>
  Array.from(
    (document.querySelector('template[data-overflow]') as HTMLTemplateElement).content.children,
  ).map((a) => Number((a as Element).getAttribute('data-i')));

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

const page1ColsHtml = (): string =>
  '<section class="col"><h3>Births</h3>' +
  '<article class="item" data-kind="born" data-i="100" data-h="50"></article></section>' +
  '<section class="col"><h3>Deaths</h3>' +
  '<article class="item" data-kind="died" data-i="101" data-h="50"></article></section>' +
  '<section class="col"><h3>Events</h3>' +
  '<article class="item" data-kind="event" data-i="102" data-h="50"></article></section>';

describe('the threshold is the sheet’s own fill, not a letter count', () => {
  // Room = 2000 − 2 − 0 − 300 = 1698 (the mock reports no row gap on
  // the sheet section); half of it = 849. Nine letters a column at h=79
  // end at 9·79+20+9·14 = 857 (shown); at h=78 at 848 (hidden). One
  // pixel per letter decides the sheet.
  it('prints the sheet when the kept letters fill half of its room', () => {
    expect(SECOND_SHEET_FILL).toBe(0.5);
    mount(
      page1ColsHtml(),
      range(27).map((i) => ({ order: i, kind: 'born', height: 79 })),
    );
    const out = composeSecondSheet(document);
    expect(out).toEqual({ printed: 27, dropped: 0, shown: true });
    expect((document.getElementById('page-1b') as HTMLElement).hidden).toBe(false);
    expect(bandIds()).toEqual(range(27));
  });

  it('leaves the letters dropped when they would fill less, hiding the sheet', () => {
    mount(
      page1ColsHtml(),
      range(27).map((i) => ({ order: i, kind: 'born', height: 78 })),
    );
    const out = composeSecondSheet(document);
    expect(out).toEqual({ printed: 0, dropped: 27, shown: false });
    expect((document.getElementById('page-1b') as HTMLElement).hidden).toBe(true);
    expect(document.querySelector('#page-1b-body .cols')).toBeNull();
  });

  it('stays hidden without a template: page one keeps its drops as today', () => {
    document.body.innerHTML =
      '<div class="paper"><section class="paper-page" id="page-1b" hidden>' +
      '<div id="page-1b-body"></div></section></div>';
    expect(composeSecondSheet(document)).toEqual({ printed: 0, dropped: 0, shown: false });
    expect((document.getElementById('page-1b') as HTMLElement).hidden).toBe(true);
  });
});

describe('the continued sheet keeps page one’s craft', () => {
  // Events, then births, then deaths: the day's reading order. The lead event
  // carries a picture; the deaths print small, with pictures of their own.
  const seeds = (): Seed[] => [
    { order: 0, kind: 'event', height: 140, photo: 'event' },
    ...range(8).map((i) => ({ order: i + 1, kind: 'event', height: 140 })),
    ...range(9).map((i) => ({ order: 9 + i, kind: 'born', height: 140 })),
    ...range(9).map((i) => ({ order: 18 + i, kind: 'died', height: 70, photo: 'stamp' as const })),
  ];

  it('cuts whole letters in reading order into balanced headed columns', () => {
    mount(page1ColsHtml(), seeds());
    const out = composeSecondSheet(document);
    expect(out).toEqual({ printed: 27, dropped: 0, shown: true });
    // Contiguous cuts, every column holding at least one letter.
    const cols = Array.from(document.querySelectorAll('#page-1b-body .cols .col'));
    expect(cols.length).toBe(3);
    const runs = cols.map((c) =>
      Array.from(c.querySelectorAll(':scope > article.item')).map((a) => Number(a.getAttribute('data-i'))),
    );
    expect(runs.flat()).toEqual(range(27));
    for (const run of runs) expect(run.length).toBeGreaterThan(0);
    // One heading per kind run, labelled as page one labels it — never the
    // bare kind the fallback would print.
    const heads = Array.from(document.querySelectorAll('#page-1b-body .cols .col > h3'));
    expect(heads.length).toBeGreaterThanOrEqual(3);
    for (const h of heads) {
      expect(['Events', 'Births', 'Deaths'].some((label) => h.textContent?.startsWith(label))).toBe(true);
    }
    expect(heads[0].textContent).toContain('Events');
  });

  it('carries on page one’s run with the continued mark and grows short pictures', () => {
    // Nine letters with a picture on nearly every one, spread across the
    // columns the way the dense edition spreads its own: growth lands
    // evenly, so every picture reaches its widest and the balance pass has
    // nothing to step down. Page one's last letter is an event and the
    // overflow opens with events.
    const even: Seed[] = [
      { order: 0, kind: 'event', height: 300, photo: 'event' as const },
      ...[1, 2].map((order) => ({ order, kind: 'event' as const, height: 300, photo: 'stamp' as const })),
      ...[3, 4, 5].map((order) => ({ order, kind: 'born' as const, height: 300, photo: 'stamp' as const })),
      ...[6, 7, 8].map((order) => ({ order, kind: 'died' as const, height: 300, photo: 'stamp' as const })),
    ];
    mount(page1ColsHtml(), even);
    const out = composeSecondSheet(document);
    expect(out).toEqual({ printed: 9, dropped: 0, shown: true });
    expect(bandIds()).toEqual(range(9));
    const first = document.querySelector('#page-1b-body .cols .col > h3');
    expect(first?.querySelector('.cont')).not.toBeNull();
    expect(first?.querySelector('.cont')?.textContent).toBe('continued');
    // Every picture prints, and with every letter printed the pictures take
    // the sheet's spare room, each through its widths.
    const figs = Array.from(
      document.querySelectorAll('#page-1b-body .cols .col article.item .photo'),
    ) as HTMLElement[];
    expect(figs.length).toBe(9);
    for (const fig of figs) {
      const item = fig.closest('article');
      expect(fig.style.width).toBe(item?.classList.contains('item--event') ? '100%' : '38%');
    }
  });

  it('never prints a letter twice and loses none of its seeds', () => {
    mount(page1ColsHtml(), seeds());
    composeSecondSheet(document);
    const first = Array.from(document.querySelectorAll('#edition .cols .col > article.item')).map((a) =>
      a.getAttribute('data-i'),
    );
    const again = bandIds().map(String);
    expect(first.filter((id) => again.includes(id as string))).toEqual([]);
    // The template stays the intact seed: cloning, never consuming.
    expect(templateIds()).toEqual(range(27));
  });
});

describe('more overflow than one sheet holds', () => {
  it('prints the head in priority order and leaves the tail dropped', () => {
    mount(
      page1ColsHtml(),
      range(30).map((i) => ({ order: i, kind: 'born', height: 200 })),
    );
    const out = composeSecondSheet(document);
    expect(out.shown).toBe(true);
    expect(out.printed + out.dropped).toBe(30);
    expect(out.dropped).toBeGreaterThan(0);
    const printed = bandIds();
    expect(printed).toEqual(range(printed.length));
  });
});

describe('page one gathers its drops in the overflow template', () => {
  it('collects trimmed and scored-out letters in reading order, disjoint from the page', () => {
    paperBottom = 600;
    const cols = range(3)
      .map(
        (c) =>
          `<section class="col"><h3>Births</h3>` +
          range(4)
            .map((k) => articleHtml({ order: c * 4 + k, kind: 'born', height: 200 }))
            .join('') +
          `</section>`,
      )
      .join('');
    mount(
      cols,
      range(2).map((i) => ({ order: 12 + i, kind: 'born', height: 200 })),
    );
    const edition = document.getElementById('edition') as HTMLElement;
    fitFrontPage(edition);
    const printed = Array.from(edition.querySelectorAll('.cols .col > article.item'))
      .map((a) => Number(a.getAttribute('data-i')))
      .sort((a, b) => a - b);
    const gathered = templateIds();
    // Every letter of the day reads exactly once: on the page or gathered.
    expect([...printed, ...gathered].sort((a, b) => a - b)).toEqual(range(14));
    expect(printed.filter((id) => gathered.includes(id))).toEqual([]);
    expect(gathered.length).toBeGreaterThan(0);
    // Reading order, the same priority the page prints in.
    expect(gathered).toEqual([...gathered].sort((a, b) => a - b));
  });

  it('prints gathered drops on the sheet with no server overflow waiting', () => {
    // The dense day whose kinds all fit their heads: the server holds
    // nothing back, so the template ships empty and every seed below is a
    // letter page one trimmed. Before the always-emit fix the fit had no
    // sink and these letters left no record; now the sheet prints them.
    paperBottom = 600;
    const cols = range(3)
      .map(
        (c) =>
          `<section class="col"><h3>Births</h3>` +
          range(4)
            .map((k) => articleHtml({ order: c * 4 + k, kind: 'born', height: 200 }))
            .join('') +
          `</section>`,
      )
      .join('');
    mount(cols, []);
    const edition = document.getElementById('edition') as HTMLElement;
    const front = fitFrontPage(edition);
    expect(front.trimmedLetters).toBeGreaterThan(0);
    const gathered = templateIds();
    expect(gathered.length).toBeGreaterThan(0);
    const out = composeSecondSheet(document);
    expect(out.shown).toBe(true);
    expect(out.printed + out.dropped).toBe(gathered.length);
    // Priority order: the head of the queue prints, the tail stays dropped.
    expect(bandIds()).toEqual(gathered.slice(0, out.printed));
    const printed = Array.from(edition.querySelectorAll('.cols .col > article.item')).map((a) =>
      a.getAttribute('data-i'),
    );
    expect(bandIds().map(String).filter((id) => printed.includes(id))).toEqual([]);
    // Clones print — the template stays the intact seed.
    expect(templateIds()).toEqual(gathered);
  });
});
