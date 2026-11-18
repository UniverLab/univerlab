// Page-one layout rules for `npm run check:paper`, extended to the second
// content sheet: pure geometry over rects the browser gathers, so every rule
// is jest-testable without a browser.
// All lengths are CSS pixels; every comparison carries a 1px slack for
// sub-pixel rounding. The thresholds mirror the stylesheet contract:
// the column gutter (`.cols` and the lead's text columns share it) and the
// 2px centre tolerance below which two margins read as equal.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One wrapped text line of the lead's words. */
export interface LineBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** One printed column and the foot of the row it ends in. */
export interface ColumnBand {
  box: Rect;
  /** Bottom of the column's container row (its longest sibling's foot). */
  foot: number;
}

export interface LeadPhoto {
  fig: Rect;
  img: Rect;
  /** True when the photo stands beside the lead's words, not under them. */
  side: boolean;
  /** Content-box edges of the lead's text block. */
  containerLeft: number;
  containerRight: number;
}

/** One printed sheet's own geometry: page one's fields, or the second sheet's. */
export interface SheetCase {
  /** Printed letters (`article.item`). */
  letters: Rect[];
  columns: ColumnBand[];
  /** The sheet's front (everything under its folio line), and every mark in it. */
  front: Rect | null;
  ink: Rect[];
}

export interface CaseInput {
  /** Facts in the recorded pool (whole day, both kinds the page prints). */
  poolLetters: number;
  /** Letters actually printed (column items + the lead). */
  printedLetters: number;
  /** Every printed letter's place in the day's reading order (`data-i`), in
   *  print order on page one. Absent when the harness predates the sheet. */
  letterIds?: string[];
  /** The second content sheet's own geometry, when the fit printed it. */
  second?: {
    hidden: boolean;
    ids: string[];
  } & SheetCase | null;
  /** The dense edition must print its second sheet: without this presence
   *  demand every rule above early-returns on a missing sheet and the gate
   *  passes vacuously. The harness sets it for the recorded dense edition. */
  expectSecond?: boolean;
  hasLead: boolean;
  hasLab: boolean;
  /** The edition's column gutter in px, in the same (possibly CSS-scaled)
   *  space as the rects below. 0 falls back to 16. */
  gutter: number;
  sheet: Rect;
  /** Lead stories (`article.lead`), normally one. */
  stories: Rect[];
  /** Printed letters (`article.item`). */
  letters: Rect[];
  /** The logbook link outside the sheet, and one control label beside it. */
  logbookLink: Rect | null;
  controlLabel: Rect | null;
  lab: Rect | null;
  colophon: Rect | null;
  colophonVisible: boolean;
  leadPhoto: LeadPhoto | null;
  /** Wrapped text line boxes of the lead's words beside its photo. */
  textLines: LineBox[];
  columns: ColumnBand[];
  /** Page one's front (everything under the banner), and every printed
   *  mark in it: text lines, pictures, boxed stories and notices. */
  front: Rect | null;
  ink: Rect[];
  /** The client never filled the edition (fetch or render failure). */
  editionEmpty: boolean;
  /** Page one has no laid-out box (a tab or sheet failure). */
  pageHidden: boolean;
  /** The page's own typefaces loaded, so the measured metrics are a reader's. */
  fontsLoaded: boolean;
}

export type RuleId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'harness';

export interface Finding {
  rule: RuleId;
  detail: string;
}

export const GUTTER_FALLBACK = 16;
export const SLACK = 1;
/** Two side margins within this of each other read as centred. */
export const CENTRE_TOLERANCE = 2;
/** Page one's letter columns: the blank-area rule's strips are half as
 *  wide as one of them. */
export const FRONT_SLOTS = 3;
/** Without a lead photo to measure against, a blank stretch in a column
 *  fails past this share of the sheet's height; with one, past the photo's
 *  own height, never more than `BLANK_CAP_SHARE` of the sheet. */
export const BLANK_SHARE = 0.15;
export const BLANK_CAP_SHARE = 0.2;

const bottom = (r: Rect): number => r.y + r.height;

function ruleA(input: CaseInput, out: Finding[]): void {
  const foot = input.sheet.y + input.sheet.height + SLACK;
  const check = (r: Rect, what: string): void => {
    const over = bottom(r) - foot;
    if (over > 0) {
      out.push({
        rule: 'a',
        detail: `${what} ends ${over.toFixed(1)}px past the sheet's bottom edge`,
      });
    }
  };
  input.stories.forEach((r, i) => check(r, `story ${i}`));
  input.letters.forEach((r, i) => check(r, `letter ${i}`));
  if (input.lab) check(input.lab, 'lab story');
}

function blankBand(letters: Rect[], columns: ColumnBand[], out: Finding[], where: string): void {
  if (!letters.length) return;
  const shortest = Math.min(...letters.map((r) => r.height));
  for (let i = 0; i < columns.length; i++) {
    const band = columns[i].foot - bottom(columns[i].box);
    if (band > shortest + SLACK) {
      out.push({
        rule: 'b',
        detail:
          `${where}column ${i} ends with a ${band.toFixed(1)}px blank band, ` +
          `taller than the shortest printed letter (${shortest.toFixed(1)}px)`,
      });
    }
  }
}

function ruleB(input: CaseInput, out: Finding[]): void {
  // Gated: with every letter printed, columns may end wherever they end.
  // A shown second sheet always answers for its own columns: it prints only
  // when its letters fill it, so a trailing blank band is never legitimate.
  if (input.poolLetters <= input.printedLetters) return;
  blankBand(input.letters, input.columns, out, '');
  const second = input.second;
  if (second && !second.hidden) blankBand(second.letters, second.columns, out, 'second sheet ');
}

function ruleC(input: CaseInput, out: Finding[]): void {
  const photo = input.leadPhoto;
  if (!photo || !photo.side) return;
  const gutter = input.gutter > 0 ? input.gutter : GUTTER_FALLBACK;
  // Only lines that run beside the photo (sharing its height, left of its
  // frame) can gap against it; the furthest-right one is the text block's
  // edge, so a short last line beside a full one is not a gap. The frame
  // (photo + mat), not the image inside it, is the photo's edge.
  const beside = input.textLines.filter((line) => {
    const overlap = Math.min(line.bottom, photo.fig.y + photo.fig.height) -
      Math.max(line.top, photo.fig.y);
    return overlap > 1 && line.right <= photo.fig.x + SLACK;
  });
  if (!beside.length) return;
  const blockRight = Math.max(...beside.map((line) => line.right));
  const gap = photo.fig.x - blockRight;
  if (gap > gutter + SLACK) {
    out.push({
      rule: 'c',
      detail:
        `blank gap between the lead's text and its photo is ` +
        `${gap.toFixed(1)}px, wider than one column gutter (${gutter.toFixed(1)}px)`,
    });
  }
}

function ruleD(input: CaseInput, out: Finding[]): void {
  if (!input.hasLab || !input.lab) return;
  const top = input.sheet.y - SLACK;
  const foot = input.sheet.y + input.sheet.height + SLACK;
  const labTop = input.lab.y;
  const labBottom = bottom(input.lab);
  const sheetTop = input.sheet.y;
  const sheetBottom = input.sheet.y + input.sheet.height;
  if (labTop < top || labBottom > foot) {
    out.push({
      rule: 'd',
      detail:
        `lab story spans y=${labTop.toFixed(1)}–${labBottom.toFixed(1)}px, ` +
        `outside the sheet (y=${sheetTop.toFixed(1)}–${sheetBottom.toFixed(1)}px)`,
    });
  }
}

function ruleE(input: CaseInput, out: Finding[]): void {
  if (!input.colophon || !input.colophonVisible) {
    out.push({ rule: 'e', detail: 'colophon is not visible' });
    return;
  }
  const foot = input.sheet.y + input.sheet.height + SLACK;
  const over = bottom(input.colophon) - foot;
  if (over > 0) {
    out.push({
      rule: 'e',
      detail: `colophon ends ${over.toFixed(1)}px past the sheet`,
    });
  }
}

function ruleF(input: CaseInput, out: Finding[]): void {
  const photo = input.leadPhoto;
  if (!photo) return;
  const gutter = input.gutter > 0 ? input.gutter : GUTTER_FALLBACK;
  const leftM = photo.fig.x - photo.containerLeft;
  const rightM = photo.containerRight - (photo.fig.x + photo.fig.width);
  if (
    leftM > gutter && rightM > gutter &&
    Math.abs(leftM - rightM) <= CENTRE_TOLERANCE
  ) {
    out.push({
      rule: 'f',
      detail:
        `lead photo is centred with blank margins on both sides ` +
        `(left ${leftM.toFixed(1)}px, right ${rightM.toFixed(1)}px)`,
    });
  }
}

function ruleG(input: CaseInput, out: Finding[]): void {
  // The logbook link sits outside the transformed sheet, so its type never
  // shrinks with the sheet's: it must read no larger than the paper's own
  // control labels, still laid out and tappable. A missing link is a
  // finding — the row must stay visible. A missing comparator is not: only
  // a measured excess fails.
  const link = input.logbookLink;
  const control = input.controlLabel;
  if (!link || link.width <= 0 || link.height <= 0) {
    out.push({ rule: 'g', detail: 'logbook link is not laid out' });
    return;
  }
  if (!control || control.width <= 0 || control.height <= 0) return;
  const over = link.height - control.height;
  if (over > SLACK) {
    out.push({
      rule: 'g',
      detail:
        `logbook link reads ${link.height.toFixed(1)}px tall, ` +
        `${over.toFixed(1)}px taller than a control label (${control.height.toFixed(1)}px)`,
    });
  }
}

function deadStretch(
  front: Rect,
  ink: Rect[],
  sheet: Rect,
  bottomEdge: number,
  photoH: number,
  out: Finding[],
  where: string,
): void {
  // Dead paper: the tallest stretch with nothing printed across a vertical
  // strip of the front, from its top to the colophon (or the sheet's foot).
  // Strips are half a column wide and slide across the front, so a hole of
  // any width from a quarter column up is seen wherever it sits: a strip is
  // blank where nothing printed reaches its middle half, so a gutter (a
  // quarter of a strip) never reads as blank while a hole a column's
  // quarter wide always does. One finding: the worst strip.
  if (front.width <= 0) return;
  const top = front.y;
  if (bottomEdge - top <= 0) return;
  const limit = photoH > 0
    ? Math.min(photoH, BLANK_CAP_SHARE * sheet.height)
    : BLANK_SHARE * sheet.height;
  const stripW = front.width / (2 * FRONT_SLOTS);
  const step = stripW / 4;
  let worst = 0;
  let worstAt = top;
  let worstX = front.x;
  for (let left = front.x; left + stripW <= front.x + front.width + SLACK; left += step) {
    const right = left + stripW;
    const spans = ink
      .filter((r) => Math.min(r.x + r.width, right - stripW / 4) - Math.max(r.x, left + stripW / 4) > SLACK)
      .map((r) => [Math.max(r.y, top), Math.min(r.y + r.height, bottomEdge)] as const)
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    let reach = top;
    const consider = (from: number, to: number): void => {
      if (to - from > worst) {
        worst = to - from;
        worstAt = from;
        worstX = left;
      }
    };
    for (const [a, b] of spans) {
      consider(reach, a);
      if (b > reach) reach = b;
    }
    consider(reach, bottomEdge);
  }
  if (worst > limit + SLACK) {
    out.push({
      rule: 'h',
      detail:
        `${where}${worst.toFixed(1)}px of blank paper at x=${worstX.toFixed(1)}, y=${worstAt.toFixed(1)}, ` +
        `taller than ${photoH > 0 ? 'the lead photo' : "the page's share"} (${limit.toFixed(1)}px)`,
    });
  }
}

function ruleH(input: CaseInput, out: Finding[]): void {
  const front = input.front;
  if (front) {
    const bottomEdge = input.colophon && input.colophonVisible
      ? input.colophon.y
      : input.sheet.y + input.sheet.height;
    deadStretch(front, input.ink, input.sheet, bottomEdge, input.leadPhoto ? input.leadPhoto.fig.height : 0, out, '');
  }
  // The second sheet answers for its own dead paper: the scan runs to its
  // own front's foot, where its print ends — the sheet below that is the
  // threshold's call (a near-empty sheet never prints), not this rule's.
  // No lead photo sets its allowance, so the sheet's own share applies.
  const second = input.second;
  if (second && !second.hidden && second.front) {
    deadStretch(
      second.front, second.ink, input.sheet, second.front.y + second.front.height, 0, out, 'second sheet ',
    );
  }
}

/** No letter printed twice, none lost, when the second sheet exists: every
 *  pooled letter prints on exactly one of the two content sheets. */
function ruleI(input: CaseInput, out: Finding[]): void {
  const second = input.second;
  if (!second || second.hidden) return;
  const first = input.letterIds;
  if (!first || !second.ids) return;
  const seen = new Set<string>();
  for (const id of [...first, ...second.ids]) {
    if (id === '') continue;
    if (seen.has(id)) {
      out.push({ rule: 'i', detail: `letter ${id} prints on both content sheets` });
    }
    seen.add(id);
  }
  const missing = input.poolLetters - (input.printedLetters + second.letters.length);
  if (missing > 0) {
    out.push({
      rule: 'i',
      detail: `${missing} of ${input.poolLetters} pooled letters print on neither content sheet`,
    });
  }
}

/** The dense edition's second sheet must exist: its overflow fills the
 *  sheet, so a hidden or missing sheet is not the threshold's call — it is
 *  the sheet never printing. Without this demand the rules above all
 *  early-return on a missing sheet and the gate passes on nothing. */
function ruleJ(input: CaseInput, out: Finding[]): void {
  if (!input.expectSecond) return;
  const second = input.second;
  if (!second || second.hidden || !second.letters.length) {
    out.push({
      rule: 'j',
      detail: 'the dense edition drops letters but its second content sheet never printed',
    });
  }
}

/** Judge one measured page: every broken rule yields one finding. */
export function judgeCase(input: CaseInput): Finding[] {
  if (input.editionEmpty || input.pageHidden) {
    return [
      {
        rule: 'harness',
        detail: input.editionEmpty
          ? 'the edition never rendered (no .front in #edition)'
          : 'page one has no laid-out box',
      },
    ];
  }
  if (!input.fontsLoaded) {
    return [
      {
        rule: 'harness',
        detail:
          'the page\'s web fonts never loaded (fallback metrics); run npm run record:paper',
      },
    ];
  }
  const out: Finding[] = [];
  ruleA(input, out);
  ruleB(input, out);
  ruleC(input, out);
  ruleD(input, out);
  ruleE(input, out);
  ruleF(input, out);
  ruleG(input, out);
  ruleH(input, out);
  ruleI(input, out);
  ruleJ(input, out);
  return out;
}
