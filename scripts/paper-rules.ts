// Page-one layout rules for `npm run check:paper`: pure geometry over rects
// the browser gathers, so every rule is jest-testable without a browser.
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

export interface CaseInput {
  /** Facts in the recorded pool (whole day, both kinds the page prints). */
  poolLetters: number;
  /** Letters actually printed (column items + the lead). */
  printedLetters: number;
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

export type RuleId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'harness';

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

function ruleB(input: CaseInput, out: Finding[]): void {
  // Gated: with every letter printed, columns may end wherever they end.
  if (input.poolLetters <= input.printedLetters) return;
  if (!input.letters.length) return;
  const shortest = Math.min(...input.letters.map((r) => r.height));
  for (let i = 0; i < input.columns.length; i++) {
    const band = input.columns[i].foot - bottom(input.columns[i].box);
    if (band > shortest + SLACK) {
      out.push({
        rule: 'b',
        detail:
          `column ${i} ends with a ${band.toFixed(1)}px blank band, ` +
          `taller than the shortest printed letter (${shortest.toFixed(1)}px)`,
      });
    }
  }
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

function ruleH(input: CaseInput, out: Finding[]): void {
  // Dead paper: the tallest stretch with nothing printed across a vertical
  // strip of the front, from its top to the colophon (or the sheet's foot).
  // Strips are half a column wide and slide across the front, so a hole of
  // any width from a quarter column up is seen wherever it sits: a strip is
  // blank where nothing printed reaches its middle half, so a gutter (a
  // quarter of a strip) never reads as blank while a hole a column's
  // quarter wide always does. One finding: the worst strip.
  const front = input.front;
  if (!front || front.width <= 0) return;
  const top = front.y;
  const bottomEdge = input.colophon && input.colophonVisible
    ? input.colophon.y
    : input.sheet.y + input.sheet.height;
  if (bottomEdge - top <= 0) return;
  const photoH = input.leadPhoto ? input.leadPhoto.fig.height : 0;
  const limit = photoH > 0
    ? Math.min(photoH, BLANK_CAP_SHARE * input.sheet.height)
    : BLANK_SHARE * input.sheet.height;
  const stripW = front.width / (2 * FRONT_SLOTS);
  const step = stripW / 4;
  let worst = 0;
  let worstAt = top;
  let worstX = front.x;
  for (let left = front.x; left + stripW <= front.x + front.width + SLACK; left += step) {
    const right = left + stripW;
    const spans = input.ink
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
        `${worst.toFixed(1)}px of blank paper at x=${worstX.toFixed(1)}, y=${worstAt.toFixed(1)}, ` +
        `taller than ${photoH > 0 ? 'the lead photo' : "the page's share"} (${limit.toFixed(1)}px)`,
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
  return out;
}
