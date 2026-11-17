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
    (el.tagName === 'ASIDE' && el.classList.contains('notice'))
  );
}

function lastLetter(col: Element): Element | null {
  const kids = Array.from(col.children);
  for (let i = kids.length - 1; i >= 0; i--) {
    // A rail story the balance moved in is a letter too: it trims, balances
    // and keeps its column alive exactly like an article.item does.
    if (isLetter(kids[i]) || kids[i].classList.contains('aside-item')) return kids[i];
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

/** The smallest a fitted photo may shrink to, in layout pixels: the lead
 *  clamp and the flooring-row shrink below both stop here, so a picture
 *  never collapses to a stamp while room remains elsewhere. */
const PHOTO_FLOOR_PX = 192;

/** The sheet's display scale. Below the desktop breakpoint the sheet is shown
 *  through a CSS transform, so a rect is a visual pixel and a style length is a
 *  layout pixel; the two only coincide at scale one. One when nothing is
 *  scaled, or when nothing is laid out to measure. */
function sheetScale(edition: Element): number {
  const paper = edition.closest('.paper') as HTMLElement | null;
  const layout = paper ? paper.offsetHeight : 0;
  if (!paper || !(layout > 0)) return 1;
  const visual = paper.getBoundingClientRect().height;
  return visual > 0 ? visual / layout : 1;
}

/** The sheet edge the columns must end above: the paper's own bottom, less
 *  the colophon line when the edition prints one and the edition grid's own
 *  row gap, so fitting never clips the colophon or hides it behind the
 *  sheet's edge. */
function sheetLimit(edition: Element): number {
  const paper = edition.closest('.paper') || edition;
  const bottom = rectBottom(paper);
  if (bottom <= 0) return 0;
  const colophon = edition.querySelector('.colophon-note');
  const reserve = colophon ? colophon.getBoundingClientRect().height : 0;
  let gap = 0;
  try {
    const cs = globalThis.getComputedStyle?.(edition as Element);
    const raw = cs ? cs.rowGap || (cs as CSSStyleDeclaration).gap : '';
    const parsed = Number.parseFloat(raw || '');
    if (Number.isFinite(parsed) && parsed > 0) gap = parsed;
  } catch {
    gap = 0;
  }
  // The colophon keeps its own line of air: reserve its height, one body
  // line and the grid's row gap, so the foot never clips it past the sheet.
  // Rects are visual pixels while a style length is a layout one: on a
  // transform-scaled sheet the line and the gap scale with the display.
  const line = bodyLinePx(edition);
  const scale = sheetScale(edition);
  const total = (Number.isFinite(reserve) && reserve > 0 ? reserve : 0) + line * scale + gap * scale;
  return bottom - (total > 0 ? total : 0);
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
  // Rects are visual pixels while an offset height is a layout one: scale
  // both the body line and the moved letter with the sheet, or a scaled
  // sheet under-balances — the move reads bigger than it is and the guard
  // below stops early, leaving a wasted band beside letters still to print.
  const scale = sheetScale(cols[0]);
  const line = Math.max(...cols.map(bodyLinePx), 1) * scale;
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
    const h = ((item as HTMLElement).offsetHeight || 0) * scale;
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
    (k) => k.tagName === 'ASIDE' && k.classList.contains('notice'),
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
  const head = (node as Element).querySelector?.('.display-notice') as HTMLElement | null;
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

/** Every letter column on page one, in reading order: the lead's own
 *  columns first, then the band below everything, then the rail's own
 *  columns once the fill below has moved band sections under the rail. */
function letterCols(edition: Element): Element[] {
  return Array.from(edition.querySelectorAll('.lead-cols .col, .cols .col, .rail > .col'));
}

/** Fit page one to the sheet: the letters fill the space under the lead
 *  story in the lead's own columns, then the band below; whole letters, the
 *  rail and the Workbench display print whole or not at all, and the feet
 *  end within one line of each other. The house notice and the rail's extra
 *  items go before letters do. */
export function fitFrontPage(edition: Element): FrontFit {
  const out: FrontFit = { trimmedLetters: 0, movedLetters: 0, fillers: 0, plateColumn: -1 };
  const lead = edition.querySelector('.lead');
  const leadCols = edition.querySelector('.lead-cols');
  const railEl = edition.querySelector('.rail');
  const alsoEl = edition.querySelector('.rail .also');
  const labEl = edition.querySelector('.front .labmail');
  let duoEl = edition.querySelector('aside.notice--feature');

  // The sheet never stretches a block past its content now: the row's
  // foot is its content's own foot, so the read below is content, not
  // stretch. The stale rail height emptied the letter band; read live.
  const storyEl = edition.querySelector('.lead .story');

  // Whole column sections move under the lead story: half the band, rounded
  // up — all of it when the lead stands alone with no rail beside it. Whole
  // sections only, never split; emptied nodes leave the page.
  const band = edition.querySelector('.cols');
  if (band && leadCols) {
    const sections = Array.from(band.children).filter((k) => k.classList.contains('col'));
    if (sections.length) {
      const solo = !!lead?.classList.contains('solo');
      const count = solo ? sections.length : Math.ceil(sections.length / 2);
      for (const s of sections.slice(0, count)) leadCols.appendChild(s);
      if (!band.querySelector('.col')) band.remove();
      const all = letterCols(edition);
      const labels = headingLabels(all);
      let openKind: string | null = null;
      for (const col of all) {
        pruneOrphanHeadings(col);
        openKind = rehead(col, labels, openKind);
      }
    }
  }

  const limit = sheetLimit(edition);
  if (limit <= 0) return out;
  // One display scale for the whole fit: rects are visual pixels, style
  // lengths layout ones.
  const scale = sheetScale(edition);
  const leadImg = edition.querySelector('.photo--lead img');
  if (leadImg && storyEl) {
    // Below the desktop breakpoint the sheet is transform-scaled, so the
    // bound is measured against the rects around it and then converted, or a
    // phone would shrink the lead photo by the fitted scale twice over.
    const h = leadImg.getBoundingClientRect().height;
    const over = rectBottom(storyEl) - limit;
    const cap = Math.min(h, Math.floor(limit * 0.36), h - Math.max(0, over));
    const maxH = Math.max(PHOTO_FLOOR_PX, cap / scale);
    if (maxH < h / scale) (leadImg as HTMLElement).style.maxHeight = `${maxH}px`;
  }
  const line = (() => {
    const cols = letterCols(edition);
    const lines = cols.map(bodyLinePx);
    lines.push(bodyLinePx(edition));
    return Math.max(...lines, 1) * scale;
  })();

  // The foot is the content's own foot: the story's foot floors the row
  // when the letters are gone, and the rail never ends above it.
  const storyFloor = storyEl ? rectBottom(storyEl) : 0;
  const railFoot = (): number =>
    railEl ? Math.max(rectBottom(railEl), storyFloor) : storyFloor;
  const duoFoot = (): number => (duoEl ? rectBottom(duoEl as Element) : 0);
  // The lab story is never cut: its foot joins the trim loop below, so the
  // letters above it keep trimming until the lab itself ends in the sheet.
  const labFoot = (): number => (labEl ? rectBottom(labEl) : 0);
  // The lab is a row of its own under the lead and the rail, never under the
  // band. Only the letters that share that row move it: the lead's columns
  // and any column the balance moved into the rail. The band below the lab
  // ends at the sheet on its own and does not push the lab down.
  const labCols = (): Element[] =>
    Array.from(edition.querySelectorAll('.lead-cols .col, .rail > .col'));
  // Raise the lab into the sheet by trimming whole letters from the tallest
  // column above it, re-measuring after each removal: a side-by-side lead
  // column and a stacked rail both lose exactly the removed height from the
  // row, so the loop converges on the lab's foot. The lab itself is never
  // removed; when no letter above it is left the loop stops.
  const fitLab = (): number => {
    if (!labEl) return 0;
    let removed = 0;
    for (let guard = 0; guard < 500; guard++) {
      if (!labEl || labFoot() - limit <= 1) break;
      const cols = labCols().filter((c) => lastLetter(c));
      if (!cols.length) break;
      cols.sort((a, b) => rectBottom(b) - rectBottom(a));
      (lastLetter(cols[0]) as Element).remove();
      pruneOrphanHeadings(cols[0]);
      removed++;
    }
    return removed;
  };

  // The space under the rail fills with whole letters like the space under
  // the lead story: move the band's last column under the rail while the
  // rail still ends inside the sheet. One column past the sheet restores at
  // the band's end and stops; an emptied band leaves the page.
  if (railEl) {
    const bandEl = edition.querySelector('.cols');
    if (bandEl && bandEl.querySelector('.col')) {
      for (let guard = 0; guard < 50; guard++) {
        const last = Array.from(bandEl.children).filter((k) => k.classList.contains('col')).pop();
        if (!last) break;
        railEl.appendChild(last);
        if (rectBottom(railEl) - limit > 1) {
          bandEl.appendChild(last);
          break;
        }
        if (!bandEl.querySelector('.col')) {
          bandEl.remove();
          break;
        }
      }
    }
  }

  // The rail holds the queue's head beside the lead story; the lead's own
  // columns continue it. Balance the two feet within one body line by
  // moving whole letters either way: the rail's last letter prepends the
  // first front-row column (it outranks everything there), and the first
  // front-row column's first letter appends the rail (it continues the
  // queue). Headings are re-issued once, after the last move. The rail is
  // only ever balanced against the front row, never the band below it.
  // Rail children are the aside items plus any column letter the balance
  // moved in: both count for the balance and both yield to the trim, so a
  // relocated letter never hides from either.
  const railItems = (): Element[] =>
    alsoEl
      ? Array.from(alsoEl.children).filter((k) => k.classList.contains('aside-item') || isLetter(k))
      : [];
  const frontCols = (): Element[] =>
    Array.from(edition.querySelectorAll('.lead-cols .col'));
  const firstLetter = (col: Element): Element | null => {
    for (const k of Array.from(col.children)) if (isLetter(k)) return k;
    return null;
  };
  if (lead && alsoEl) {
    const labels = headingLabels(letterCols(edition));
    const feetOf = (cols: Element[]): number => Math.max(...cols.map(rectBottom));
    // A move counts only when the laid-out feet prove it narrows the gap:
    // otherwise it is undone, so an unmeasurable layout degrades to the
    // trim below instead of churning letters back and forth.
    const tryRailToCol = (): boolean => {
      const cols = frontCols();
      const items = railItems();
      if (!cols.length || !items.length) return false;
      const before = Math.abs(railFoot() - feetOf(cols));
      const node = items[items.length - 1];
      cols[0].insertBefore(node, cols[0].firstChild);
      const after = Math.abs(railFoot() - feetOf(frontCols()));
      if (after < before) return true;
      alsoEl.appendChild(node);
      return false;
    };
    const tryColToRail = (): boolean => {
      const cols = frontCols();
      if (!cols.length || !railItems().length) return false;
      const before = Math.abs(railFoot() - feetOf(cols));
      const target = cols.find((c) => firstLetter(c));
      if (!target) return false;
      const node = firstLetter(target) as Element;
      const next = node.nextSibling;
      alsoEl.appendChild(node);
      const after = Math.abs(railFoot() - feetOf(frontCols()));
      if (after < before) return true;
      target.insertBefore(node, next);
      return false;
    };
    let balanced = 0;
    for (let guard = 0; guard < 200; guard++) {
      const cols = frontCols();
      if (!cols.length || !railItems().length) break;
      const top = feetOf(cols);
      let moved = false;
      if (railFoot() > Math.max(top, storyFloor) + line) moved = tryRailToCol();
      else if (top > railFoot() + line) moved = tryColToRail();
      else break;
      if (!moved) break;
      balanced++;
    }
    out.movedLetters += balanced;
    if (balanced) {
      const all = letterCols(edition);
      let openKind: string | null = null;
      for (const col of all) {
        pruneOrphanHeadings(col);
        openKind = rehead(col, labels, openKind);
      }
    }
  }

  for (let guard = 0; guard < 50; guard++) {
    const cols = letterCols(edition);
    const bottoms = cols.map(rectBottom);
    if (railEl) bottoms.push(railFoot());
    if (duoEl) bottoms.push(duoFoot());
    if (labEl) bottoms.push(labFoot());
    if (!bottoms.length) break;
    if (Math.max(...bottoms) - limit <= line) break;
    if (duoEl) {
      // FR3: the house display goes before letters do.
      (duoEl as Element).remove();
      duoEl = null;
      continue;
    }
    // The rail's extras go before column letters do, but only while the
    // rail overhangs the columns: a balanced rail's letters outrank the
    // columns' feet, so the feet trim first instead. Only columns that
    // still hold letters have a foot worth comparing — an emptied column
    // bottoms out at its own top, and with no letters at all the rail
    // trims against the sheet limit, never the story's foot, or the page
    // ends in a band of blank paper.
    const frontFoot = Math.max(
      0,
      ...cols.filter((c) => lastLetter(c)).map(rectBottom),
    );
    const items = railItems();
    if (items.length > 1 && railFoot() - frontFoot > line) {
      items[items.length - 1].remove();
      continue;
    }
    // Trim every column to the sheet, the lab's own overhang included in
    // the check above. The lab itself is never removed: `fitLab` raises it
    // afterwards by trimming the letters that share its row.
    let removed = 0;
    for (const col of cols) removed += trimColumn(col, limit);
    out.trimmedLetters += removed;
    if (!removed) break;
  }

  const cols = letterCols(edition);
  // A page with no letter columns at all still flows below: the photo
  // shrink at the end must run for it too, so the trims below are scoped
  // to a page that has columns instead of returning early.
  if (cols.length) {
    for (const col of cols) out.trimmedLetters += trimColumn(col, limit);
    out.movedLetters += balanceColumns(cols);
    // A balance move can push a column's foot past the sheet again: trim
    // whole letters after balancing, so nothing ends past the sheet's edge.
    for (const col of cols) out.trimmedLetters += trimColumn(col, limit);
    // The lab story's foot was never a band column's foot: raise it into the
    // sheet by trimming the letters that share its row, never the lab itself.
    out.trimmedLetters += fitLab();
    // The last letter past the sheet's edge: a balance or a lab raise can
    // leave any column's foot (or the lab's own) over the limit, so loop the
    // final trim over every letter column plus the lab's foot until all end
    // above it. The lab itself is never removed; with no letters left to
    // yield, the loop stops.
    for (let guard = 0; guard < 50; guard++) {
      const feet = cols.map(rectBottom);
      if (labEl) feet.push(labFoot());
      if (!feet.length || Math.max(...feet) - limit <= 1) break;
      let removed = 0;
      for (const col of cols) removed += trimColumn(col, limit);
      removed += fitLab();
      if (!removed) break;
    }
  }
  // A trim may empty a column whole: it leaves the page, and a wrapper
  // left with no column goes with it, so the band never holds blank paper.
  const live = cols.filter((c) => (lastLetter(c) ? true : (c.remove(), false)));
  for (const wrap of Array.from(edition.querySelectorAll('.lead-cols, .cols'))) {
    if (!wrap.querySelector('.col')) wrap.remove();
  }
  // An emptied rail leaves the page like an emptied column does, so no
  // bordered box ends the row beside the lead story. A rail that never
  // carried items (no .also) is structural and stays, as does a rail still
  // holding a moved-in column of whole letters.
  if (railEl && alsoEl && !railItems().length && !railEl.querySelector('.col')) railEl.remove();
  const attached = live.filter((c) => c.isConnected);
  // Every filler the fit keeps, so a harmful one can come back out below.
  const placed: Element[] = [];
  // Fillers only crown a page that already fits: when the lab still sits
  // past the limit, every foot below is borrowed room — a plate or notice
  // would push the lab and the colophon further past the sheet instead of
  // filling real space.
  const labOver = labEl ? labFoot() - limit > 1 : false;
  if (!labOver) {
    // The free foot of each column, roomiest first.
    const order = attached
      .map((col, i) => ({ col, i, free: limit - rectBottom(col) }))
      .sort((a, b) => b.free - a.free);
    if (order.length && order[0].free > 1) {
      const plate = fillerHtml(edition, 'plate');
      if (plate) {
        const node = tryFiller(order[0].col, plate, limit, 'plate');
        if (node) {
          out.fillers++;
          out.plateColumn = order[0].i;
          placed.push(node);
        }
      }
      const install = fillerHtml(edition, 'install');
      const collab = fillerHtml(edition, 'collab');
      const duo = fillerHtml(edition, 'house-duo');
      const rest = order.filter((o) => o.i !== out.plateColumn && limit - rectBottom(o.col) > 1);
      let paired = false;
      if (install && collab && rest.length >= 2) {
        const a = tryFiller(rest[0].col, install, limit, 'house');
        const b = a ? tryFiller(rest[1].col, collab, limit, 'house') : null;
        if (a && b) {
          out.fillers += 2;
          paired = true;
          placed.push(a, b);
        } else {
          a?.remove();
          b?.remove();
        }
      }
      if (!paired && duo && rest.length >= 1) {
        // Re-measure: the split attempt above may have settled content.
        const roomy = rest
          .map((o) => ({ o, free: limit - rectBottom(o.col) }))
          .filter((r) => r.free > 1)
          .sort((a, b) => b.free - a.free);
        const d = roomy.length ? tryFiller(roomy[0].o.col, duo, limit, 'house') : null;
        if (d) {
          out.fillers++;
          placed.push(d);
        }
      }
    }
  }
  // A filler lands in the roomiest foot and can unbalance the row it joins:
  // balance once more over the surviving columns so the feet end together.
  // Balance never raises the tallest foot, so nothing fitted leaves the
  // sheet; headings are re-issued over the moved letters as before.
  out.movedLetters += balanceColumns(attached);
  // A filler grows its column, and through it the story, the row, the lab
  // and the colophon: when the lab ends past the limit afterwards, the
  // fillers only bought borrowed room, so they come back out and the
  // feet are balanced again over the surviving letters.
  if (labEl && placed.length && labFoot() - limit > 1) {
    for (const node of placed) node.remove();
    placed.length = 0;
    out.fillers = 0;
    out.plateColumn = -1;
    out.movedLetters += balanceColumns(attached);
  }
  return out;
}

/** The grid's last notice-like child: whole cards only — never the coupon rule
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

/** Trim a classifieds grid to the notices that fit whole, newest first from the
 *  foot: whole cards only, a one-line run with its fleuron as one unit. */
export function trimClassifieds(grid: Element, limit: number, slackPx = 1, sink?: Element | null): number {
  if (limit <= 0) return 0;
  let removed = 0;
  for (let guard = 0; guard < 1000; guard++) {
    if ((grid as HTMLElement).getBoundingClientRect().bottom - limit <= slackPx) break;
    if (!removeLastCard(grid, sink)) break;
    removed++;
  }
  return removed;
}

/** Take the grid's last notice-like child off: whole cards only, a one-line run
 *  with its fleuron as one unit. With a `sink` (the next page's grid) the
 *  card moves to the head of that grid instead of leaving the paper, so the
 *  classifieds flow on from page two to page three in order. False when
 *  only unremovable lines remain. */
function removeLastCard(grid: Element, sink?: Element | null): boolean {
  const last = lastRemovable(grid);
  if (!last) return false;
  const fleuron =
    last.classList.contains('notice-run') && last.previousElementSibling?.classList.contains('notice-fleuron')
      ? last.previousElementSibling
      : null;
  if (sink) {
    sink.insertBefore(last, sink.firstChild);
    if (fleuron) sink.insertBefore(fleuron, sink.firstChild);
    return true;
  }
  fleuron?.remove();
  last.remove();
  return true;
}

export interface ClassifiedsFit {
  trimmedAds: number;
  pointers: number;
  /** Ads moved from page two to the head of page three. */
  carriedAds?: number;
}

const TURN_CLASSES = ['turn-leave-next', 'turn-return-prev', 'turn-under'];
const LEAF_CLASSES = ['turn-leave-next', 'turn-return-prev'];

function isTurningLeaf(page: Element): boolean {
  return LEAF_CLASSES.some((c) => page.classList.contains(c));
}

/** True when another paper page of the same sheet is shown and stacked
 *  after this one. A page mid-turn overlaps the sheet instead of stacking,
 *  so it never counts. */
function siblingPageShown(page: Element): boolean {
  const parent = page.parentElement;
  if (!parent) return false;
  return Array.from(parent.children).some(
    (k) =>
      k !== page &&
      k.classList.contains('paper-page') &&
      !(k as HTMLElement).hidden &&
      !TURN_CLASSES.some((c) => k.classList.contains(c)),
  );
}

/** True when the grid holds printable notices — never only templates, the
 *  coupon note, or an earlier fill. An empty grid's page stays hidden, so it
 *  is never the page to fill. */
function hasAds(grid: Element): boolean {
  return Array.from(grid.children).some(
    (k) =>
      k.tagName === 'ARTICLE' ||
      (k.tagName === 'A' && k.classList.contains('coupon')) ||
      k.classList.contains('notice-run'),
  );
}

/** Fill the last classifieds page to the foot: with the notices run out, the
 *  remaining space takes the lab's own house notices and one engraved
 *  ornament from the page's templates — sized to the space left, whole only,
 *  so the page ends at the foot instead of a blank band. Returns how many
 *  fillers stayed on the page. */
export function fillClassifiedsFoot(grid: Element, scope: Element, limit: number): number {
  let added = 0;
  const line = bodyLinePx(scope);
  if (limit - rectBottom(scope) <= 3 * line) return 0;
  const doc = grid.ownerDocument;
  const place = (kind: string): Element | null => {
    const t = scope.querySelector(`template[data-fill="${kind}"]`) as HTMLTemplateElement | null;
    if (!t?.innerHTML) return null;
    const tmp = doc.createElement('div');
    tmp.innerHTML = t.innerHTML;
    const node = tmp.firstElementChild;
    if (!node) return null;
    grid.appendChild(node);
    if ((scope as HTMLElement).getBoundingClientRect().bottom - limit > 1) {
      node.remove();
      return null;
    }
    added++;
    return node as Element;
  };
  // The lab's own house notices first, whole or not at all.
  place('house-install');
  if (limit - rectBottom(scope) <= 3 * line) return added;
  place('house-collab');
  // Then engraved ornaments while room remains: each plate sized to the
  // fresh space left — full size, halved once — else the next kind.
  for (const kind of ['orn-tree', 'orn-gem', 'orn-press']) {
    const remaining = limit - rectBottom(scope);
    if (remaining <= 3 * line) break;
    const t = scope.querySelector(`template[data-fill="${kind}"]`) as HTMLTemplateElement | null;
    if (!t?.innerHTML) continue;
    const tmp = doc.createElement('div');
    tmp.innerHTML = t.innerHTML;
    const fig = tmp.firstElementChild;
    const img = fig?.querySelector('img');
    if (!fig || !img) continue;
    // The plate's own intrinsic size sets the ratio; the height it may take
    // is the space left, less the grid's own margins.
    const w = Number.parseFloat(img.getAttribute('width') || '');
    const h = Number.parseFloat(img.getAttribute('height') || '');
    const ratio = Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : 1;
    grid.appendChild(fig);
    const widthFor = (height: number): number => Math.max(1, Math.floor(height * ratio - 24));
    img.setAttribute('width', String(widthFor(remaining)));
    img.removeAttribute('height');
    if ((scope as HTMLElement).getBoundingClientRect().bottom - limit > 1) {
      // Halve once; keep only when the scope then ends above the limit.
      img.setAttribute('width', String(widthFor(remaining / 2)));
      if ((scope as HTMLElement).getBoundingClientRect().bottom - limit > 1) {
        fig.remove();
        continue;
      }
    }
    added++;
  }
  return added;
}

/** Fit pages two and three to the sheet: each classifieds grid keeps only
 *  the notices that fit whole, and a grid that lost notices points at the Logbook —
 *  reusing the page's own pointer line, added only when trimming happened.
 *  The last page fills to the foot with the lab's house notices and an
 *  engraved ornament once its notices run out. */
export function fitClassifieds(root: ParentNode): ClassifiedsFit {
  const out: ClassifiedsFit = { trimmedAds: 0, pointers: 0 };
  const grids = Array.from(
    (root as Element).querySelectorAll?.('#lab-body .classifieds, #lab2-body .classifieds') ?? [],
  );
  for (const grid of grids) {
    const page = (grid as Element).closest?.('.paper-page');
    if (page && (page as HTMLElement).hidden) continue;
    // A leaf mid-turn is drawn in perspective: its box says nothing about
    // the sheet. The page is fitted again once the turn lands.
    if (page && isTurningLeaf(page)) continue;
    // Before the tabs hide the other pages they all stack in one sheet and a
    // later page sits below the sheet's foot: measuring then would trim it
    // bare. The page turn fits it again once it is the only page shown.
    if (page && siblingPageShown(page)) continue;
    const paper = (grid as Element).closest?.('.paper') || grid;
    const limit = rectBottom(paper as Element);
    if (limit <= 0) continue;
    // Page two's overflow carries on to page three (when there is one);
    // only page three's overflow leaves the paper for the Logbook.
    const sink =
      (grid as Element).id === 'lab-log'
        ? ((root as Element).querySelector?.('#lab2-body .classifieds') as Element | null)
        : null;
    const removed = trimClassifieds(grid as Element, limit, 1, sink);
    const scope = grid.parentElement;
    if (sink) {
      out.carriedAds = (out.carriedAds ?? 0) + removed;
      // Page two is the last page only when page three holds no notices: then
      // its own foot takes the house notices and the ornament.
      if (scope && !hasAds(sink as Element) && hasAds(grid as Element)) {
        fillClassifiedsFoot(grid as Element, scope, limit);
      }
      continue;
    }
    out.trimmedAds += removed;
    if (removed > 0) {
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
            // The pointer itself takes room at the foot: re-measure the
            // whole scope with it in place and keep trimming whole cards
            // until page and pointer both end above the limit, so the
            // pointer never overlaps a notice and nothing is cut off.
            for (let guard = 0; guard < 1000; guard++) {
              if ((scope as HTMLElement).getBoundingClientRect().bottom - limit <= 1) break;
              node.remove();
              if (!removeLastCard(grid)) {
                out.pointers--;
                break;
              }
              out.trimmedAds++;
              scope.appendChild(node);
            }
          }
        }
      }
    }
    // The last readable grid fills to the foot once its notices run out; a grid
    // still carrying page two's overflow is never the last page.
    if (scope && hasAds(grid as Element)) {
      fillClassifiedsFoot(grid as Element, scope, limit);
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
    if (!page || (!(page as HTMLElement).hidden && !isTurningLeaf(page))) {
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
