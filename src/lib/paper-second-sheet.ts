// The second content sheet: what page one cannot hold. The server renders
// the letters past page one's heads into an overflow template, and page one's
// own fit gathers the letters it trims there too; this module prints them, in
// reading order, into full-width balanced columns on the sheet after page one
// and before the classifieds. The sheet exists only when the overflow fills
// it: with less, those letters stay dropped as today, never on a near-empty
// sheet. Never more than one sheet: what one sheet cannot hold stays dropped,
// and no filler ever stands where a letter was dropped.

import {
  FRONT_COLUMNS,
  growPhotos,
  headingLabels,
  planColumns,
  rehead,
  shrinkPhotosForBalance,
  trimColumn,
} from './paper-fit';

/** The share of the sheet's own room the kept letters must fill for the
 *  second sheet to print: sheet-proportional, not a letter count. Calibrated
 *  against the recorded dense edition (2026-11-12 en), whose 18 overflow
 *  letters' best 3-column plan fills 59.5% of the sheet's room, while the
 *  thin 2026-09-24 es overflow fills 36.4%: one half prints the dense sheet
 *  and leaves the thin overflow dropped, as the sheet requires. */
export const SECOND_SHEET_FILL = 0.5;

export interface SecondSheetFit {
  printed: number;
  dropped: number;
  shown: boolean;
}

function isItem(el: Element): boolean {
  return el.tagName === 'ARTICLE' && el.classList.contains('item');
}

function orderOf(el: Element): number {
  const raw = Number.parseInt(el.getAttribute('data-i') || '', 10);
  return Number.isFinite(raw) ? raw : 0;
}

/** Visual pixels per layout pixel on the transform-scaled sheet. */
function scaleOf(section: Element): number {
  const paper = section.closest('.paper') as HTMLElement | null;
  const layout = paper ? paper.offsetHeight : 0;
  if (!paper || !(layout > 0)) return 1;
  const visual = paper.getBoundingClientRect().height;
  return visual > 0 ? visual / layout : 1;
}

function rowGapOf(el: Element): number {
  const raw = globalThis.getComputedStyle?.(el)?.rowGap || '';
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 14;
}

/** The sheet edge the continued columns must end above: the paper's own
 *  bottom, less its bottom padding (and two pixels for rounding) and the
 *  page's row gap. Page one reserves its colophon line too; this sheet, read
 *  between page one and the classifieds, has none. */
function sheetLimit(section: Element): number {
  const paper = section.closest('.paper') || section;
  const bottom = (paper as Element).getBoundingClientRect().bottom;
  if (!(bottom > 0)) return 0;
  let gap = 0;
  try {
    const cs = globalThis.getComputedStyle?.(section);
    const raw = cs ? cs.rowGap || (cs as CSSStyleDeclaration).gap : '';
    const parsed = Number.parseFloat(raw || '');
    if (Number.isFinite(parsed) && parsed > 0) gap = parsed;
  } catch {
    gap = 0;
  }
  const pad = Number.parseFloat(globalThis.getComputedStyle?.(paper as Element)?.paddingBottom || '') || 0;
  const scale = scaleOf(section);
  return bottom - (pad + 2) * scale - gap * scale;
}

/** Compose the second content sheet from the overflow template's letters, in
 *  reading order. Clones print — the template stays the intact seed, so a
 *  refit recomposes the same sheet and page one's fit cache never invalidates.
 *  Safe to call when the edition never rendered or the template is missing:
 *  the sheet hides. Idempotent for one layout. */
export function composeSecondSheet(root: ParentNode): SecondSheetFit {
  const section = (root as Element).querySelector?.('#page-1b') as HTMLElement | null;
  const body = section?.querySelector(':scope > #page-1b-body') as HTMLElement | null;
  const edition = (root as Element).querySelector?.('#edition') as Element | null;
  const tpl = edition?.querySelector('template[data-overflow]') as HTMLTemplateElement | null;
  const seeds = tpl ? Array.from(tpl.content.children).filter(isItem) : [];
  const hide = (dropped: number, printed = 0): SecondSheetFit => {
    if (body) body.innerHTML = '';
    if (section) section.hidden = true;
    return { printed, dropped, shown: false };
  };
  if (!section || !body) return { printed: 0, dropped: seeds.length, shown: false };
  // Nothing laid out — an unlaid tree, a hidden paper: leave the sheet alone
  // for a measured pass, like the front fit leaves hidden pages alone.
  const paperBox = section.closest('.paper')?.getBoundingClientRect();
  if (!paperBox || !(paperBox.bottom > 0)) {
    const printed = body.querySelectorAll('.cols .col article.item').length;
    return { printed, dropped: Math.max(0, seeds.length - printed), shown: !section.hidden };
  }
  if (!seeds.length) return hide(0);
  // Measure the sheet alone: sibling pages stack in one sheet until the tabs
  // hide them, so the band's top reads true only with this sheet shown.
  const pages = Array.from((root as Element).querySelectorAll?.('.paper-page') ?? []) as HTMLElement[];
  const others = pages.filter((p) => p !== section);
  const wasHidden = others.map((p) => p.hidden);
  try {
    for (const p of others) p.hidden = true;
    section.hidden = false;
    body.innerHTML = '';
    const doc = body.ownerDocument;
    const band = doc.createElement('div');
    band.className = 'cols';
    body.appendChild(band);
    // Reading order is the priority order: the template holds the server's
    // overflow and page one's drops, sorted here by their place in the day.
    const clones = seeds
      .map((s) => s.cloneNode(true) as Element)
      .sort((a, b) => orderOf(a) - orderOf(b));
    const columns = Math.min(FRONT_COLUMNS, clones.length);
    const cols: Element[] = [];
    for (let c = 0; c < columns; c++) {
      const col = doc.createElement('section');
      col.className = 'col';
      band.appendChild(col);
      cols.push(col);
    }
    // Columns of one width before measuring, like page one: the sheet's own
    // grid gives every column the same width whatever it holds.
    clones.forEach((l, i) => cols[Math.floor((i * columns) / clones.length)].appendChild(l));
    // One heading's height at column width, from page one's own headings.
    let head = 0;
    const sample = edition?.querySelector('.cols .col h3')?.cloneNode(true) as Element | undefined;
    if (sample && cols[0]) {
      cols[0].insertBefore(sample, cols[0].firstChild);
      head = sample.getBoundingClientRect().height;
      sample.remove();
    }
    const scale = scaleOf(section);
    const gap = rowGapOf(cols[0]) * scale;
    const heights = clones.map((l) => l.getBoundingClientRect().height);
    const kinds = clones.map((l) => (l as HTMLElement).getAttribute?.('data-kind') || '');
    const room = (): number => sheetLimit(section) - band.getBoundingClientRect().top;
    const planFor = (n: number) =>
      planColumns({ heights: heights.slice(0, n), kinds: kinds.slice(0, n), columns, head, gap, room: room() + 1 });
    let n = clones.length;
    let plan = planFor(n);
    // Past one sheet's room the tail stays dropped: the last letters in
    // reading order yield first, and the rest never leaves this sheet.
    while (plan && plan.max - room() > 1 && n > 0) {
      n -= 1;
      plan = planFor(n);
    }
    if (!plan || n <= 0) return hide(clones.length);
    // The sheet prints only when the kept letters fill it: less is a
    // near-empty sheet, and those letters stay dropped as today.
    if (plan.max < SECOND_SHEET_FILL * room()) return hide(clones.length);
    for (const col of cols) while (col.firstChild) col.removeChild(col.firstChild);
    const kept = clones.slice(0, n);
    const used = plan.starts.length;
    plan.starts.forEach((from, c) => {
      const to = c + 1 < plan!.starts.length ? plan!.starts[c + 1] : kept.length;
      for (let j = from; j < to; j++) cols[c].appendChild(kept[j]);
    });
    for (const extra of cols.slice(used)) extra.remove();
    const live = cols.slice(0, used);
    // The continued sheet carries on page one's run: its first heading reads
    // continued when the kind runs on from page one's last letter, marked
    // with page one's own continuation words.
    const labels = edition ? headingLabels(Array.from(edition.querySelectorAll('.cols .col'))) : new Map();
    const cont = edition?.querySelector('.cols')?.getAttribute('data-cont') || '';
    for (const label of labels.values()) if (!label.cont) label.cont = cont;
    let openKind: string | null = null;
    for (const col of Array.from(edition?.querySelectorAll('.cols .col') ?? [])) {
      const items = Array.from(col.children).filter(isItem);
      const last = items[items.length - 1] as HTMLElement | undefined;
      if (last?.getAttribute) openKind = last.getAttribute('data-kind') || openKind;
    }
    for (const col of live) openKind = rehead(col, labels, openKind);
    // The laid-out page has the last word: a column still past the sheet
    // gives up whole letters, never part of one. The template's own seeds
    // stay intact — only these clones trim.
    const limit = sheetLimit(section);
    let trimmed = 0;
    for (const col of live) {
      trimmed += trimColumn(col, limit);
      if (!Array.from(col.children).some(isItem)) col.remove();
    }
    const shown = live.filter((c) => c.isConnected);
    if (!shown.length) return hide(clones.length);
    // With letters dropped the columns end together at the tallest foot;
    // with every letter printed the pictures take the sheet's spare room.
    growPhotos(shown, trimmed ? Math.max(...shown.map((c) => c.getBoundingClientRect().bottom)) : limit);
    // Growth lands unevenly — photo steps are coarse and text-only letters
    // cannot grow at all — so step the tallest columns' pictures back down
    // until the feet end together as the balance rule reads them.
    shrinkPhotosForBalance(shown);
    section.hidden = false;
    const printed = shown.reduce((k, c) => k + Array.from(c.children).filter(isItem).length, 0);
    return { printed, dropped: clones.length - printed, shown: true };
  } finally {
    for (let i = 0; i < others.length; i++) others[i].hidden = wasHidden[i];
  }
}
