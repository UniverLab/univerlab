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
export const HEAD_LIMIT = 9;

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

/** Whole letters only: the lead, the lab story and the Workbench display
 *  live outside `.cols` and are never passed here, so never trimmed or moved. */
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
  // The colophon closes the page inside the paper's own margin: reserve its
  // height, the grid's row gap and the paper's bottom padding (and two
  // pixels for rounding), so the foot never pushes it past the sheet.
  // Rects are visual pixels while a style length is a layout one: on a
  // transform-scaled sheet the gap and the padding scale with the display.
  const pad = Number.parseFloat(globalThis.getComputedStyle?.(paper as Element)?.paddingBottom || '') || 0;
  const scale = sheetScale(edition);
  const total = (Number.isFinite(reserve) && reserve > 0 ? reserve : 0) + (pad + 2) * scale + gap * scale;
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

function fillerHtml(edition: Element, kind: string): string | null {
  const t = edition.querySelector(`template[data-filler="${kind}"]`);
  return t ? (t as HTMLTemplateElement).innerHTML : null;
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

export interface FrontFit {
  trimmedLetters: number;
  movedLetters: number;
  fillers: number;
  plateColumn: number;
}

/** Letter columns side by side under the lead: the sheet's three. */
export const FRONT_COLUMNS = 3;

/** The column flow to plan: the letters in reading order, their kinds (a
 *  kind change prints a heading, and every column opens with one), and the
 *  fillers that may stand at a column's foot. Any one length unit. */
export interface PlanInput {
  heights: number[];
  kinds: string[];
  columns: number;
  /** One kind heading's height. */
  head: number;
  /** The gap between two blocks inside a column. */
  gap: number;
  /** Filler heights; each filler takes the foot of a column of its own. */
  fillers?: number[];
  /** The height the columns have room for: plans that fit it are preferred,
   *  and among them the one whose columns end closest together. */
  room?: number;
}

/** Where the letter run is cut and which column foot carries each filler. */
export interface ColumnPlan {
  /** The index of the letter each column starts at. */
  starts: number[];
  /** The column of each filler, in the order the fillers were given. */
  fillerCols: number[];
  heights: number[];
  max: number;
}

function columnHeight(input: PlanInput, from: number, to: number, fillers: number[]): number {
  let total = 0;
  let blocks = 0;
  for (let i = from; i < to; i++) {
    if (i === from || input.kinds[i] !== input.kinds[i - 1]) {
      total += input.head;
      blocks++;
    }
    total += input.heights[i];
    blocks++;
  }
  for (const f of fillers) {
    total += f;
    blocks++;
  }
  return blocks ? total + input.gap * (blocks - 1) : 0;
}

/** Every way to give each filler a column of its own. */
function fillerAssignments(fillers: number, columns: number): number[][] {
  const out: number[][] = [];
  const pick = (acc: number[]): void => {
    if (acc.length === fillers) {
      out.push([...acc]);
      return;
    }
    for (let c = 0; c < columns; c++) {
      if (!acc.includes(c)) pick([...acc, c]);
    }
  };
  pick([]);
  return out;
}

/** Cut the letters, kept in reading order, into balanced columns. With a
 *  `room`, the cuts (and fillers' columns) that fit it come first and,
 *  among them, the smallest spread between the tallest and the shortest
 *  column wins, so the columns end together. Otherwise (or when none fits)
 *  the cut whose tallest column is shortest wins, ties going to the
 *  smallest spread. Every column holds at least one letter. Null with no
 *  letters, or with more fillers than columns. */
export function planColumns(input: PlanInput): ColumnPlan | null {
  const n = input.heights.length;
  const fillers = input.fillers ?? [];
  if (!n) return null;
  const columns = Math.max(1, Math.min(input.columns, n));
  if (fillers.length > columns) return null;
  const assignments = fillerAssignments(fillers.length, columns);
  let best: ColumnPlan | null = null;
  let bestSpread = Infinity;
  const starts = [0];
  const consider = (): void => {
    for (const fillerCols of assignments) {
      const heights = starts.map((from, c) =>
        columnHeight(
          input,
          from,
          c + 1 < starts.length ? starts[c + 1] : n,
          fillers.filter((_, k) => fillerCols[k] === c),
        ),
      );
      const max = Math.max(...heights);
      const spread = max - Math.min(...heights);
      const room = input.room ?? -Infinity;
      const fits = max <= room + 0.5;
      const bestFits = !!best && best.max <= room + 0.5;
      const better = !best
        ? true
        : fits !== bestFits
          ? fits
          : fits
            ? spread < bestSpread - 0.5 || (spread <= bestSpread + 0.5 && max < best.max)
            : max < best.max - 0.5 || (max <= best.max + 0.5 && spread < bestSpread);
      if (better) {
        best = { starts: [...starts], fillerCols: [...fillerCols], heights, max };
        bestSpread = spread;
      }
    }
  };
  const cut = (c: number): void => {
    if (c === columns) {
      consider();
      return;
    }
    for (let s = starts[c - 1] + 1; s <= n - (columns - c); s++) {
      starts[c] = s;
      cut(c + 1);
    }
    starts.length = c;
  };
  cut(1);
  return best;
}

/** The lead photo stands beside the lead's words: give it the width, and
 *  the headline its place (beside the photo, or across the lead above the
 *  text and the photo), at which the photo, caption included, and the words
 *  beside it end closest together — the photo sized to the text, never a
 *  frame beside blank paper. Among the settings where both sides end within
 *  a line or so of each other, the shortest lead wins, so the lead never
 *  takes more of the page than its words need; with none that close, the
 *  closest pair wins. With a `budget` (the lead's height plus the page's
 *  spare room), the tallest such lead within it wins instead: a page whose
 *  letters all fit gives its spare room to the lead photo, not to blank
 *  paper. Layout pixels throughout, so the sheet's display scale never
 *  enters. Only when the photo stands beside the words (a two-track lead).
 *  Returns the lead's height, or 0 when nothing was sized. */
function sizeLeadPhoto(edition: Element, budget = 0): number {
  const lead = edition.querySelector('.lead') as HTMLElement | null;
  const fig = lead?.querySelector(':scope > .photo--lead') as HTMLElement | null;
  const main = lead?.querySelector(':scope > .lead-main') as HTMLElement | null;
  const text = main?.querySelector('.lead-text') as HTMLElement | null;
  if (!lead || !fig || !main || !text) return 0;
  const view = lead.ownerDocument.defaultView;
  const tracks = (view?.getComputedStyle(lead).gridTemplateColumns || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tracks.length < 2) return 0;
  const total = lead.clientWidth;
  if (!(total > 0)) return 0;
  const upright =
    fig.classList.contains('photo--lead--portrait') ||
    fig.classList.contains('photo--lead--square');
  const lo = Math.round(total * (upright ? 0.2 : 0.3));
  const hi = Math.round(total * (upright ? 0.4 : 0.6));
  const para = text.querySelector('p');
  const line = (para ? Number.parseFloat(view?.getComputedStyle(para).lineHeight || '') || 29 : 29) * 1.25;
  const tries: { across: boolean; w: number; d: number; tall: number }[] = [];
  for (const across of [false, true]) {
    lead.classList.toggle('lead--across', across);
    const words = across ? text : main;
    for (let w = lo; w <= hi; w += 8) {
      fig.style.width = `${w}px`;
      tries.push({ across, w, d: Math.abs(fig.offsetHeight - words.offsetHeight), tall: lead.offsetHeight });
    }
  }
  if (!tries.length) return 0;
  const close = tries.filter((c) => c.d <= line);
  const roomy = close.filter((c) => c.tall <= budget);
  const pick = roomy.length
    ? roomy.reduce((a, b) => (b.tall > a.tall ? b : a))
    : close.length
      ? close.reduce((a, b) => (b.tall < a.tall ? b : a))
      : tries.reduce((a, b) => (b.d < a.d ? b : a));
  lead.classList.toggle('lead--across', pick.across);
  fig.style.width = `${pick.w}px`;
  return lead.offsetHeight;
}

/** One filler built from its template, measured at a column's width with its
 *  margins, and taken back out. Null when the template is missing or its
 *  display headline cannot set in a column (overflowing, or one word per
 *  line). */
function measureFiller(
  edition: Element,
  col: Element,
  kind: string,
  scale: number,
): { el: Element; h: number; kind: string } | null {
  const html = fillerHtml(edition, kind);
  if (!html) return null;
  const tmp = col.ownerDocument.createElement('div');
  tmp.innerHTML = html;
  const node = tmp.firstElementChild;
  if (!node) return null;
  col.appendChild(node);
  const head = node.querySelector('.display-notice') as HTMLElement | null;
  const broken = head ? head.scrollWidth - head.clientWidth > 1 || headlineStarved(head) : false;
  const cs = globalThis.getComputedStyle?.(node);
  const margins = cs ? (Number.parseFloat(cs.marginTop) || 0) + (Number.parseFloat(cs.marginBottom) || 0) : 0;
  const h = node.getBoundingClientRect().height + margins * scale;
  node.remove();
  return broken || !(h > 0) ? null : { el: node, h, kind };
}

function rowGapOf(el: Element): number {
  const raw = globalThis.getComputedStyle?.(el)?.rowGap || '';
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 14;
}

/** The letters that may yield when the columns cannot hold every letter:
 *  any letter of the day's largest kinds (within one letter of the
 *  largest), so no kind is emptied while another still prints more. */
function yieldable(seq: number[], kinds: string[]): number[] {
  const count = new Map<string, number>();
  for (const i of seq) count.set(kinds[i], (count.get(kinds[i]) || 0) + 1);
  const most = Math.max(...count.values());
  const out: number[] = [];
  seq.forEach((i, j) => {
    if ((count.get(kinds[i]) || 0) >= most - 1) out.push(j);
  });
  return out;
}

/** Compose page one in the sheet: size the lead photo to its text, then
 *  flow the letters, in reading order, through the columns under the lead,
 *  balanced so the columns end together. When they cannot all fit, the
 *  Workbench display goes first, then whole letters of the largest kinds.
 *  On a day whose letters all fit, the plate and the house notices take
 *  column feet, each only when the balanced page still fits; the letters'
 *  pictures then grow into what room is left. */
function composeFront(edition: Element, out: FrontFit, budget = 0): { lead: number; spare: number } {
  const done = { lead: 0, spare: 0 };
  const limit = sheetLimit(edition);
  if (limit <= 0) return done;
  done.lead = sizeLeadPhoto(edition, budget);
  const scale = sheetScale(edition);
  const duo = edition.querySelector('aside.notice--feature');
  const band = edition.querySelector('.cols');
  if (!band) {
    if (duo && rectBottom(duo) - limit > 1) duo.remove();
    return done;
  }
  let sections = Array.from(band.children).filter((k) => k.classList.contains('col'));
  const labels = headingLabels(sections);
  const cont = band.getAttribute('data-cont') || '';
  for (const label of labels.values()) if (!label.cont) label.cont = cont;
  // Reading order, not the server's columns: its balance may have moved a
  // letter to another column's foot.
  const orderOf = (el: Element, at: number): number => {
    const raw = Number.parseInt(el.getAttribute('data-i') || '', 10);
    return Number.isFinite(raw) ? raw : at;
  };
  const letters = sections
    .flatMap((c) => Array.from(c.children).filter(isLetter))
    .map((el, at) => ({ el, at: orderOf(el, at) }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.el);
  const origin = new Map<Element, number>();
  sections.forEach((c, i) => {
    for (const k of Array.from(c.children)) if (isLetter(k)) origin.set(k, i);
  });
  if (!letters.length) {
    band.remove();
    return done;
  }
  const doc = band.ownerDocument;
  const columns = Math.min(FRONT_COLUMNS, letters.length);
  // Columns of one width before measuring: the server may have printed
  // fewer (a short day prints one per kind), and a letter's height depends
  // on its column's width.
  while (sections.length < columns) {
    const col = doc.createElement('section');
    col.className = 'col';
    band.appendChild(col);
    sections.push(col);
  }
  for (const extra of sections.slice(columns)) extra.remove();
  sections = sections.slice(0, columns);
  const sample = sections[0].querySelector('h3')?.cloneNode(true) as Element | undefined;
  for (const col of sections) while (col.firstChild) col.removeChild(col.firstChild);
  letters.forEach((l, i) => sections[Math.floor((i * columns) / letters.length)].appendChild(l));
  let head = 0;
  if (sample) {
    sections[0].insertBefore(sample, sections[0].firstChild);
    head = sample.getBoundingClientRect().height;
    sample.remove();
  }
  const gap = rowGapOf(sections[0]) * scale;
  const heights = letters.map((l) => l.getBoundingClientRect().height);
  const kinds = letters.map((l) => l.getAttribute('data-kind') || '');
  const room = (): number => limit - band.getBoundingClientRect().top;
  const planFor = (seq: number[], fillers: number[]): ColumnPlan | null =>
    planColumns({
      heights: seq.map((i) => heights[i]),
      kinds: seq.map((i) => kinds[i]),
      columns,
      head,
      gap,
      fillers,
      room: room() + 1,
    });

  let seq = letters.map((_, i) => i);
  let plan = planFor(seq, []);
  // The Workbench display steps aside first; it comes back below if the
  // letters leave it room after all.
  let duoSpot: { parent: Element; next: Node | null; h: number } | null = null;
  if (plan && plan.max - room() > 1 && duo && duo.parentElement) {
    const before = band.getBoundingClientRect().top;
    duoSpot = { parent: duo.parentElement, next: duo.nextSibling, h: 0 };
    duo.remove();
    duoSpot.h = before - band.getBoundingClientRect().top;
  }
  // Whole letters yield, one at a time: the one whose loss leaves the best
  // page — one that fits, with the columns ending closest together; while
  // none fits, the one that shortens the tallest column most (ties going to
  // the later letter).
  const dropped: number[] = [];
  const score = (p: ColumnPlan | null): number => {
    if (!p) return Infinity;
    const spread = p.max - Math.min(...p.heights);
    return p.max - room() <= 1 ? spread : 1e6 + p.max;
  };
  while (plan && plan.max - room() > 1) {
    let bestJ = -1;
    let bestScore = Infinity;
    let bestPlan: ColumnPlan | null = null;
    for (const j of yieldable(seq, kinds)) {
      const p = planFor(seq.filter((_, k) => k !== j), []);
      const sc = score(p);
      if (bestJ < 0 || sc <= bestScore) {
        bestJ = j;
        bestScore = sc;
        bestPlan = p;
      }
    }
    dropped.push(seq[bestJ]);
    seq = seq.filter((_, k) => k !== bestJ);
    plan = bestPlan;
  }
  // A dropped letter shorter than the one that forced the cut may still
  // fit in the room the cut freed: offer each back, in reading order.
  for (const i of [...dropped].sort((a, b) => a - b)) {
    const trial = [...seq, i].sort((a, b) => a - b);
    const p = planFor(trial, []);
    if (p && p.max - room() <= 1) {
      seq = trial;
      plan = p;
    } else {
      out.trimmedLetters++;
    }
  }
  // Then trade within a kind (so every kind keeps its share): a dropped
  // letter takes a printed one's place whenever the page still fits and
  // its columns end closer together.
  const spreadOf = (p: ColumnPlan): number => p.max - Math.min(...p.heights);
  const outside = (): number[] => letters.map((_, i) => i).filter((i) => !seq.includes(i));
  for (let round = 0; plan && round < 12; round++) {
    let swap: { seq: number[]; plan: ColumnPlan } | null = null;
    for (const d of outside()) {
      for (const p of seq) {
        if (kinds[d] !== kinds[p]) continue;
        const trial = [...seq.filter((i) => i !== p), d].sort((a, b) => a - b);
        const tp = planFor(trial, []);
        if (!tp || tp.max - room() > 1) continue;
        const target = swap ? spreadOf(swap.plan) : spreadOf(plan);
        if (spreadOf(tp) < target - 1) swap = { seq: trial, plan: tp };
      }
    }
    if (!swap) break;
    seq = swap.seq;
    plan = swap.plan;
  }
  if (plan && duo && duoSpot && !out.trimmedLetters && plan.max - (room() - duoSpot.h) <= 1) {
    duoSpot.parent.insertBefore(duo, duoSpot.next);
    plan = planFor(seq, []);
  }
  // The fillers take only a day's spare room, once every letter fits: a
  // column the cut left short grows its pictures instead (below), so no
  // notice ever stands where a letter was left out.
  const fillers: { el: Element; h: number; kind: string }[] = [];
  if (plan && !out.trimmedLetters) {
    for (const kind of ['plate', 'install', 'collab']) {
      const m = measureFiller(edition, sections[0], kind, scale);
      if (!m) continue;
      const trial = planFor(seq, [...fillers.map((f) => f.h), m.h]);
      if (trial && trial.max - room() <= 1) {
        fillers.push(m);
        plan = trial;
      }
    }
  }
  for (const col of sections) while (col.firstChild) col.removeChild(col.firstChild);
  if (!plan) {
    band.remove();
    return done;
  }
  if (!out.trimmedLetters && scale > 0) done.spare = Math.max(0, (room() - plan.max) / scale);
  const used = plan.starts.length;
  plan.starts.forEach((from, c) => {
    const to = c + 1 < plan!.starts.length ? plan!.starts[c + 1] : seq.length;
    for (let j = from; j < to; j++) {
      const el = letters[seq[j]];
      sections[c].appendChild(el);
      if (origin.get(el) !== c) out.movedLetters++;
    }
  });
  fillers.forEach((f, k) => {
    sections[plan!.fillerCols[k]].appendChild(f.el);
    out.fillers++;
    if (f.kind === 'plate') out.plateColumn = plan!.fillerCols[k];
  });
  for (const extra of sections.slice(used)) extra.remove();
  sections = sections.slice(0, used);
  let openKind: string | null = null;
  for (const col of sections) openKind = rehead(col, labels, openKind);
  // The plan works on measured heights; the laid-out page has the last
  // word. A column still past the sheet gives up its filler, then letters.
  for (const col of sections) {
    for (let guard = 0; guard < 50 && rectBottom(col) - limit > 1; guard++) {
      const filler = Array.from(col.children).find(isFiller);
      if (filler) {
        filler.remove();
        out.fillers--;
        continue;
      }
      out.trimmedLetters += trimColumn(col, limit);
      break;
    }
    if (!lastLetter(col)) col.remove();
  }
  const live = sections.filter((c) => c.isConnected);
  // With letters left out the columns end together at the tallest foot;
  // with every letter printed the pictures may take the page's spare room.
  if (live.length) growPhotos(live, out.trimmedLetters ? Math.max(...live.map(rectBottom)) : limit);
  // A short day leaves room under every column: the house notices close
  // the front across its width when they fit there whole.
  const wide = !out.trimmedLetters ? fillerHtml(edition, 'house-duo') : null;
  if (wide && band.parentElement) {
    const tmp = doc.createElement('div');
    tmp.innerHTML = wide;
    const node = tmp.firstElementChild;
    if (node) {
      node.classList.add('notice--wide');
      band.parentElement.insertBefore(node, band.nextSibling);
      if (rectBottom(node) - limit > 1) node.remove();
      else out.fillers++;
    }
  }
  if (!band.querySelector('.col')) band.remove();
  return done;
}

/** The widths a letter's picture may grow through, smallest first: an
 *  event's from its own share of the column to the column's width (set
 *  over the words, no longer beside them, since nothing reads beside a
 *  full-width picture), a portrait stamp's up to an event's share. */
const PHOTO_STEPS: Record<string, string[]> = {
  event: ['50%', '62%', 'full'],
  stamp: ['76px', '96px', '38%'],
};

function setPhotoStep(fig: HTMLElement, step: string): void {
  const full = step === 'full';
  fig.style.width = full ? '100%' : step;
  fig.style.float = full ? 'none' : '';
  fig.style.marginRight = full ? '0' : '';
}

/** A column ending short of the given foot grows its letters' pictures,
 *  each through its widths while the column still ends at or above the
 *  foot: the pictures take the room whole letters cannot, so the columns
 *  end together without a filler. */
function growPhotos(cols: Element[], foot: number): void {
  for (const col of cols) {
    if (foot - rectBottom(col) <= 1) continue;
    // Round by round, every picture one step up, so a column's pictures
    // grow together instead of the first taking all the room.
    const growing = Array.from(col.children)
      .filter((k) => isLetter(k) && k.classList.contains('has-photo'))
      .map((item) => ({
        fig: item.querySelector(':scope > .photo') as HTMLElement | null,
        steps: PHOTO_STEPS[item.classList.contains('item--event') ? 'event' : 'stamp'],
      }))
      .filter((g): g is { fig: HTMLElement; steps: string[] } => !!g.fig);
    const done = new Set<number>();
    for (let step = 0; done.size < growing.length; step++) {
      growing.forEach((g, k) => {
        if (done.has(k)) return;
        if (step >= g.steps.length) {
          done.add(k);
          return;
        }
        setPhotoStep(g.fig, g.steps[step]);
        if (rectBottom(col) - foot > 1) {
          if (step > 0) setPhotoStep(g.fig, g.steps[step - 1]);
          else {
            g.fig.style.width = '';
            g.fig.style.float = '';
            g.fig.style.marginRight = '';
          }
          done.add(k);
        }
      });
    }
  }
}

/** The edition's own HTML before any fit, and the HTML and layout the last
 *  fit left: a fit for a new layout (the faces landed, the sheet resized)
 *  starts again from every letter instead of from a page already trimmed
 *  for other metrics; a fit for the same layout leaves the page alone. */
const pristine = new WeakMap<Element, string>();
const fitted = new WeakMap<Element, { html: string; key: string }>();

function layoutKey(edition: Element): string {
  const paper = edition.closest('.paper') as HTMLElement | null;
  let faces = 0;
  try {
    const fonts = (edition.ownerDocument as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.forEach((f) => {
      if (f.status === 'loaded') faces++;
    });
  } catch {
    faces = 0;
  }
  return `${paper ? paper.offsetWidth : 0}x${paper ? paper.offsetHeight : 0}|${faces}`;
}

/** Fit page one to the sheet (see `composeFront`). Safe to call again: the
 *  same layout keeps its fitted page, a new one refits from the edition's
 *  own HTML, and a re-rendered edition becomes the new starting point. */
export function fitFrontPage(edition: Element): FrontFit {
  const out: FrontFit = { trimmedLetters: 0, movedLetters: 0, fillers: 0, plateColumn: -1 };
  const last = fitted.get(edition);
  if (last && last.html === edition.innerHTML) {
    if (last.key === layoutKey(edition)) return out;
    const original = pristine.get(edition);
    if (original !== undefined) edition.innerHTML = original;
  } else {
    pristine.set(edition, edition.innerHTML);
  }
  const first = composeFront(edition, out);
  // Every letter printed and room to spare: compose again with the spare
  // room offered to the lead photo. Kept only when it prints as much.
  if (first.lead > 0 && first.spare > 2 * bodyLinePx(edition)) {
    const fit1 = { ...out };
    const html1 = edition.innerHTML;
    edition.innerHTML = pristine.get(edition) ?? html1;
    const again: FrontFit = { trimmedLetters: 0, movedLetters: 0, fillers: 0, plateColumn: -1 };
    composeFront(edition, again, first.lead + first.spare);
    if (again.trimmedLetters > fit1.trimmedLetters) {
      edition.innerHTML = html1;
      Object.assign(out, fit1);
    } else {
      Object.assign(out, again);
    }
  }
  fitted.set(edition, { html: edition.innerHTML, key: layoutKey(edition) });
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
