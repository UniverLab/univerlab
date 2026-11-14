// Fitting the newspaper to its sheet. Page one prints as many of the day's
// letters as fit whole in the columns and leaves out the rest (the markdown
// twin still lists every letter); fillers take only measured free space at a
// column's foot; pages two and three trim to the classifieds that fit, the
// rest continuing in the Logbook. The server cuts by the same `estimate`
// weights the columns are balanced by; the client then trims by laid-out
// pixels, before the sheet is shown (its space is reserved by the sheet's
// fixed height in any case, so fitting never shifts layout).
//
// This module imports nothing from the project: the server passes entry
// weights in, and the client works on the laid-out DOM. That keeps the single
// dependency direction (today-edition and lab-page import from here).

/** One estimate line: the balance target spread between column weights. */
export const FIT_LINE = 1;

/** Letters per column at most, the head the server renders (no fold). */
export const HEAD_LIMIT = 6;

/** A column of whole letters with its parallel estimate weights. */
export function balanceHeads<T>(
  cols: T[][],
  weights: number[][],
  line: number = FIT_LINE,
  headLimit: number = HEAD_LIMIT,
): number {
  if (!cols.length) return 0;
  let moves = 0;
  for (let guard = 0; guard < 1000; guard++) {
    const sums = weights.map((w) => w.reduce((a, b) => a + b, 0));
    let hi = 0;
    let lo = 0;
    for (let i = 1; i < sums.length; i++) {
      if (sums[i] > sums[hi]) hi = i;
      if (sums[i] < sums[lo]) lo = i;
    }
    const spread = sums[hi] - sums[lo];
    if (spread <= line || hi === lo) return moves;
    if (cols[hi].length === 0 || cols[lo].length >= headLimit) return moves;
    // Move the longest head's last whole letter onto the shortest head, but
    // only when it strictly narrows the spread — never when it overshoots.
    const w = weights[hi][weights[hi].length - 1];
    const nextHi = sums[hi] - w;
    const nextLo = sums[lo] + w;
    let nextMax = Math.max(nextHi, nextLo);
    let nextMin = Math.min(nextHi, nextLo);
    for (let i = 0; i < sums.length; i++) {
      if (i === hi || i === lo) continue;
      if (sums[i] > nextMax) nextMax = sums[i];
      if (sums[i] < nextMin) nextMin = sums[i];
    }
    if (nextMax - nextMin >= spread) return moves;
    cols[lo].push(cols[hi].pop() as T);
    weights[lo].push(weights[hi].pop() as number);
    moves++;
  }
  return moves;
}

/** Whole letters only: the lead, the rail and the Workbench display live
 *  outside `.cols` and are never passed here, so never trimmed or moved. */
function isLetter(el: Element): boolean {
  return el.tagName === 'ARTICLE' && el.classList.contains('item');
}

function isFiller(el: Element): boolean {
  return (
    (el.tagName === 'FIGURE' && el.classList.contains('paper-plate')) ||
    (el.tagName === 'ASIDE' && el.classList.contains('ad'))
  );
}

function lastLetter(col: Element): Element | null {
  const kids = Array.from(col.children);
  for (let i = kids.length - 1; i >= 0; i--) {
    if (isLetter(kids[i])) return kids[i];
  }
  return null;
}

/** Drop a heading with no letter under it: trailing, doubled, or orphaned by
 *  a trim or a move. Fillers end a heading's run the same way a column's end
 *  does, so a heading above a filler with no letters between goes too. */
function pruneOrphanHeadings(col: Element): void {
  const kids = Array.from(col.children);
  for (let i = kids.length - 1; i >= 0; i--) {
    if (kids[i].tagName !== 'H3') continue;
    let j = i + 1;
    while (j < kids.length && kids[j].tagName !== 'H3' && !isLetter(kids[j]) && !isFiller(kids[j])) j++;
    const next = kids[j];
    if (!next || next.tagName === 'H3' || isFiller(next)) kids[i].remove();
  }
}

function rectBottom(el: Element): number {
  return el.getBoundingClientRect().bottom;
}

function bodyLinePx(col: Element): number {
  const fs = Number.parseFloat(globalThis.getComputedStyle?.(col)?.fontSize || '');
  return Number.isFinite(fs) && fs > 0 ? fs * 1.5 : 24;
}

/** The sheet edge the columns must end above: the paper's own bottom, less
 *  the colophon line when the edition prints one, so fitting never clips it. */
function sheetLimit(edition: Element): number {
  const paper = edition.closest('.paper') || edition;
  const bottom = rectBottom(paper);
  if (bottom <= 0) return 0;
  const colophon = edition.querySelector('.colophon-note');
  const reserve = colophon ? colophon.getBoundingClientRect().height : 0;
  return bottom - (Number.isFinite(reserve) && reserve > 0 ? reserve : 0);
}

/** Trim whole letters off a column's foot until it ends above the limit. */
export function trimColumn(col: Element, limit: number, slackPx = 1): number {
  if (limit <= 0) return 0;
  let removed = 0;
  for (let guard = 0; guard < 500; guard++) {
    if (rectBottom(col) - limit <= slackPx) break;
    const last = lastLetter(col);
    if (!last) break;
    last.remove();
    removed++;
  }
  if (removed) pruneOrphanHeadings(col);
  return removed;
}

interface HeadLabel {
  label: string;
  cont: string;
}

/** The printed kind headings, read off the laid-out page before any move:
 *  each h3's words keyed by the data-kind of the letters under it, with the
 *  continuation mark it carries, so reheaded columns speak the page language. */
function headingLabels(cols: Element[]): Map<string, HeadLabel> {
  const labels = new Map<string, HeadLabel>();
  for (const col of cols) {
    const kids = Array.from(col.children);
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].tagName !== 'H3') continue;
      let kind = '';
      for (let j = i + 1; j < kids.length; j++) {
        if (kids[j].tagName === 'H3') break;
        const k = (kids[j] as HTMLElement).getAttribute?.('data-kind');
        if (k) {
          kind = k;
          break;
        }
      }
      if (!kind || labels.has(kind)) continue;
      const h3 = kids[i] as HTMLElement;
      const cont = h3.querySelector('.cont');
      const contText = cont ? cont.textContent || '' : '';
      const label = (h3.textContent || '').replace(contText, '').trim();
      labels.set(kind, { label, cont: contText });
    }
  }
  return labels;
}

/** Re-issue a column's kind headings over its current letters: one heading
 *  per kind run, marked continued when the kind runs on from `openKind`.
 *  Fillers stay pinned at the foot. Returns the column's last kind. */
function rehead(col: Element, labels: Map<string, HeadLabel>, openKind: string | null): string | null {
  const doc = col.ownerDocument;
  const kids = Array.from(col.children);
  const items = kids.filter((k) => isLetter(k));
  const fillers = kids.filter((k) => isFiller(k));
  for (const k of kids) if (k.tagName === 'H3') k.remove();
  let cur: string | null = null;
  let first = true;
  let lastKind: string | null = null;
  for (const item of items) {
    const kind = (item as HTMLElement).getAttribute?.('data-kind') || '';
    if (kind) {
      if (kind !== cur) {
        const known = labels.get(kind);
        const h3 = doc.createElement('h3');
        h3.textContent = known ? known.label : kind;
        if (first && openKind && kind === openKind && known?.cont) {
          h3.appendChild(doc.createTextNode(' '));
          const span = doc.createElement('span');
          span.className = 'cont';
          span.textContent = known.cont;
          h3.appendChild(span);
        }
        col.insertBefore(h3, item);
        cur = kind;
      }
      first = false;
      lastKind = kind;
    }
  }
  for (const f of fillers) col.appendChild(f);
  return lastKind;
}

/** Move whole letters from the tallest column's foot to the shortest
 *  column's foot until the columns end within one body line of each other.
 *  Headings are re-issued afterwards, never mid-move. */
export function balanceColumns(cols: Element[]): number {
  if (cols.length < 2) return 0;
  const limit = (() => {
    let top = 0;
    for (const col of cols) {
      const b = rectBottom(col);
      if (b > top) top = b;
    }
    return top;
  })();
  if (limit <= 0) return 0;
  const labels = headingLabels(cols);
  const line = Math.max(...cols.map(bodyLinePx), 1);
  let moves = 0;
  for (let guard = 0; guard < 500; guard++) {
    const bottoms = cols.map(rectBottom);
    let hi = 0;
    let lo = 0;
    for (let i = 1; i < bottoms.length; i++) {
      if (bottoms[i] > bottoms[hi]) hi = i;
      if (bottoms[i] < bottoms[lo]) lo = i;
    }
    if (hi === lo || bottoms[hi] - bottoms[lo] <= line) break;
    const item = lastLetter(cols[hi]);
    if (!item) break;
    const h = (item as HTMLElement).offsetHeight || 0;
    const nextHi = bottoms[hi] - h;
    const nextLo = bottoms[lo] + h;
    let nextMax = Math.max(nextHi, nextLo);
    let nextMin = Math.min(nextHi, nextLo);
    for (let i = 0; i < bottoms.length; i++) {
      if (i === hi || i === lo) continue;
      if (bottoms[i] > nextMax) nextMax = bottoms[i];
      if (bottoms[i] < nextMin) nextMin = bottoms[i];
    }
    if (nextMax - nextMin >= bottoms[hi] - bottoms[lo]) break;
    cols[lo].appendChild(item);
    moves++;
  }
  if (moves) {
    let openKind: string | null = null;
    for (const col of cols) {
      pruneOrphanHeadings(col);
      openKind = rehead(col, labels, openKind);
    }
  }
  return moves;
}

function fillerHtml(edition: Element, kind: string): string | null {
  const t = edition.querySelector(`template[data-filler="${kind}"]`);
  return t ? (t as HTMLTemplateElement).innerHTML : null;
}

function hasPlate(col: Element): boolean {
  return Array.from(col.children).some(
    (k) => k.tagName === 'FIGURE' && k.classList.contains('paper-plate'),
  );
}

function hasHouse(col: Element): boolean {
  return Array.from(col.children).some(
    (k) => k.tagName === 'ASIDE' && k.classList.contains('ad'),
  );
}

/** A display headline broken one word per line: no space on the sheet is
 *  wide enough for it. Wrapped text never overflows horizontally, so the
 *  scroll width cannot see it — the laid-out line boxes are counted instead,
 *  one rect per row. A headline that never laid out (no rects, as in an
 *  unrendered tree) is kept: nothing provably broken is dropped. */
function headlineStarved(head: HTMLElement): boolean {
  const words = (head.textContent || '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  let rects: ArrayLike<DOMRect> | null = null;
  try {
    const range = head.ownerDocument.createRange();
    range.selectNodeContents(head);
    rects = range.getClientRects();
  } catch {
    return false;
  }
  if (!rects || rects.length === 0) return false;
  const rows = new Set<number>();
  for (const r of Array.from(rects)) rows.add(Math.round(r.top));
  return rows.size >= words.length;
}

/** Only when the filler fits whole: append it, measure, and take it back
 *  out when the column runs past the sheet, its display headline overflows
 *  its width, or the headline breaks one word per line. The engraving and
 *  a house notice never share a column's foot. */
function tryFiller(col: Element, html: string, limit: number, kind: 'plate' | 'house'): Element | null {
  if (kind === 'plate' && hasHouse(col)) return null;
  if (kind === 'house' && hasPlate(col)) return null;
  const doc = col.ownerDocument;
  const tmp = doc.createElement('div');
  tmp.innerHTML = html;
  const node = tmp.firstElementChild;
  if (!node) return null;
  col.appendChild(node);
  const over = (col as HTMLElement).getBoundingClientRect().bottom - limit > 1;
  const head = (node as Element).querySelector?.('.ad-display') as HTMLElement | null;
  const broken = head
    ? head.scrollWidth - head.clientWidth > 1 || headlineStarved(head)
    : false;
  if (over || broken) {
    node.remove();
    return null;
  }
  return node as Element;
}

export interface FrontFit {
  trimmedLetters: number;
  movedLetters: number;
  fillers: number;
  plateColumn: number;
}

/** Fit page one's columns to the sheet: trim whole letters, balance the
 *  feet within one line, then foot the roomiest feet with the engraving and
 *  the house notices — never both in one column, only what fits whole. */
export function fitFrontPage(edition: Element): FrontFit {
  const out: FrontFit = { trimmedLetters: 0, movedLetters: 0, fillers: 0, plateColumn: -1 };
  const cols = Array.from(edition.querySelectorAll('.cols .col'));
  if (!cols.length) return out;
  const limit = sheetLimit(edition);
  if (limit <= 0) return out;
  for (const col of cols) out.trimmedLetters += trimColumn(col, limit);
  out.movedLetters = balanceColumns(cols);
  // The free foot of each column, roomiest first.
  const order = cols
    .map((col, i) => ({ col, i, free: limit - rectBottom(col) }))
    .sort((a, b) => b.free - a.free);
  if (!order.length || order[0].free <= 1) return out;
  const plate = fillerHtml(edition, 'plate');
  if (plate) {
    const node = tryFiller(order[0].col, plate, limit, 'plate');
    if (node) {
      out.fillers++;
      out.plateColumn = order[0].i;
    }
  }
  const install = fillerHtml(edition, 'install');
  const collab = fillerHtml(edition, 'collab');
  const duo = fillerHtml(edition, 'house-duo');
  const rest = order.filter((o) => o.i !== out.plateColumn && limit - rectBottom(o.col) > 1);
  if (install && collab && rest.length >= 2) {
    const a = tryFiller(rest[0].col, install, limit, 'house');
    const b = a ? tryFiller(rest[1].col, collab, limit, 'house') : null;
    if (a && b) {
      out.fillers += 2;
      return out;
    }
    a?.remove();
    b?.remove();
  }
  if (duo && rest.length >= 1) {
    // Re-measure: the split attempt above may have settled content.
    const roomy = rest
      .map((o) => ({ o, free: limit - rectBottom(o.col) }))
      .filter((r) => r.free > 1)
      .sort((a, b) => b.free - a.free);
    if (roomy.length && tryFiller(roomy[0].o.col, duo, limit, 'house')) out.fillers++;
  }
  return out;
}

/** The grid's last ad-like child: whole cards only — never the coupon rule
 *  line, never the pointer template. */
function lastRemovable(grid: Element): Element | null {
  const kids = Array.from(grid.children);
  for (let i = kids.length - 1; i >= 0; i--) {
    const k = kids[i];
    if (k.tagName === 'ARTICLE') return k;
    if (k.tagName === 'A' && k.classList.contains('coupon')) return k;
    if (k.classList.contains('notice-run')) return k;
  }
  return null;
}

/** Trim a classifieds grid to the ads that fit whole, newest first from the
 *  foot: whole cards only, a one-line run with its fleuron as one unit. */
export function trimClassifieds(grid: Element, limit: number, slackPx = 1): number {
  if (limit <= 0) return 0;
  let removed = 0;
  for (let guard = 0; guard < 1000; guard++) {
    if ((grid as HTMLElement).getBoundingClientRect().bottom - limit <= slackPx) break;
    const last = lastRemovable(grid);
    if (!last) break;
    if (last.classList.contains('notice-run') && last.previousElementSibling?.classList.contains('notice-fleuron')) {
      last.previousElementSibling.remove();
    }
    last.remove();
    removed++;
  }
  return removed;
}

export interface ClassifiedsFit {
  trimmedAds: number;
  pointers: number;
}

/** Fit pages two and three to the sheet: each classifieds grid keeps only
 *  the ads that fit whole, and a grid that lost ads points at the Logbook —
 *  reusing the page's own pointer line, added only when trimming happened. */
export function fitClassifieds(root: ParentNode): ClassifiedsFit {
  const out: ClassifiedsFit = { trimmedAds: 0, pointers: 0 };
  const grids = Array.from(
    (root as Element).querySelectorAll?.('#lab-body .classifieds, #lab2-body .classifieds') ?? [],
  );
  for (const grid of grids) {
    const page = (grid as Element).closest?.('.paper-page');
    if (page && (page as HTMLElement).hidden) continue;
    const paper = (grid as Element).closest?.('.paper') || grid;
    const limit = rectBottom(paper as Element);
    if (limit <= 0) continue;
    const removed = trimClassifieds(grid as Element, limit);
    out.trimmedAds += removed;
    if (removed > 0) {
      const scope = grid.parentElement;
      const hasPointer = scope
        ? Array.from(scope.children).some((k) => k.classList.contains('lab-more'))
        : true;
      if (scope && !hasPointer) {
        const t = scope.querySelector('template[data-fill="logbook-pointer"]') as HTMLTemplateElement | null;
        if (t?.innerHTML) {
          const tmp = scope.ownerDocument.createElement('div');
          tmp.innerHTML = t.innerHTML;
          const node = tmp.firstElementChild;
          if (node) {
            scope.appendChild(node);
            out.pointers++;
          }
        }
      }
    }
  }
  return out;
}

export interface PaperFit {
  trimmedLetters: number;
  movedLetters: number;
  fillers: number;
  trimmedAds: number;
  pointers: number;
}

/** Fit every visible paper page to the sheet. Hidden pages are skipped —
 *  with nothing laid out there is nothing to measure — so call again after
 *  a page turn. Safe to call when the edition never rendered: zeros. */
export function fitPaper(root: ParentNode): PaperFit {
  const out: PaperFit = { trimmedLetters: 0, movedLetters: 0, fillers: 0, trimmedAds: 0, pointers: 0 };
  const edition = (root as Element).querySelector?.('#edition');
  if (edition) {
    const page = (edition as Element).closest?.('#page-1');
    if (!page || !(page as HTMLElement).hidden) {
      const front = fitFrontPage(edition as Element);
      out.trimmedLetters = front.trimmedLetters;
      out.movedLetters = front.movedLetters;
      out.fillers = front.fillers;
    }
  }
  const cls = fitClassifieds(root);
  out.trimmedAds = cls.trimmedAds;
  out.pointers = cls.pointers;
  return out;
}
