// Page-one layout rules for `npm run check:paper`: pure geometry over rects
// the browser gathers, so every rule is jest-testable without a browser.
// All lengths are CSS pixels; every comparison carries a 1px slack for
// sub-pixel rounding. The thresholds mirror the stylesheet contract:
// the 16px column gutter (`.cols`/`lead-cols` `gap: 0 16px`) and the 2px
// centre tolerance below which two margins read as equal.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The right edge of one wrapped text line beside the lead photo. */
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
  /** True for a portrait/square photo floated beside the lead's text. */
  side: boolean;
  /** Content-box edges of the lead's text block. */
  containerLeft: number;
  containerRight: number;
}

export interface CaseInput {
  /** Facts in the recorded pool (whole day, both kinds the page prints). */
  poolLetters: number;
  /** Letters actually printed (items + rail stories + the lead). */
  printedLetters: number;
  hasLead: boolean;
  hasLab: boolean;
  /** The edition's column gutter in px, in the same (possibly CSS-scaled)
   *  space as the rects below. 0 falls back to 16. */
  gutter: number;
  sheet: Rect;
  /** Lead stories (`.lead .story`), normally one. */
  stories: Rect[];
  /** Printed letters (`article.item` + rail `.aside-item`). */
  letters: Rect[];
  lab: Rect | null;
  colophon: Rect | null;
  colophonVisible: boolean;
  leadPhoto: LeadPhoto | null;
  /** Wrapped text line boxes of the lead's story (outside the figure). */
  textLines: LineBox[];
  columns: ColumnBand[];
  /** The client never filled the edition (fetch or render failure). */
  editionEmpty: boolean;
  /** Page one has no laid-out box (a tab or sheet failure). */
  pageHidden: boolean;
  /** The page's own typefaces loaded, so the measured metrics are a reader's. */
  fontsLoaded: boolean;
}

export type RuleId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'harness';

export interface Finding {
  rule: RuleId;
  detail: string;
}

export const GUTTER_FALLBACK = 16;
export const SLACK = 1;
/** Two side margins within this of each other read as centred. */
export const CENTRE_TOLERANCE = 2;

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
  const beside = input.textLines.filter((line) => {
    // Only lines that actually run beside the photo can gap against it.
    const overlap = Math.min(line.bottom, photo.fig.y + photo.fig.height) -
      Math.max(line.top, photo.fig.y);
    return overlap > 1;
  });
  // Wrapped lines reach the float (within two gutters of its edge); a ragged
  // last line ends far left and is not the block's edge. Among the lines that
  // reach, the furthest-right one is the text block's edge: a short wrapped
  // line beside a longer one is not a gap. With no reaching line the text
  // never runs beside the photo, so only the frame's own blank can fail.
  const reach = 2 * gutter + SLACK;
  const reaching = beside.filter((line) => photo.fig.x - line.right <= reach);
  let worst: number;
  if (reaching.length) {
    // The frame (photo + mat), not the image inside it: the stylesheet's
    // contract is the figure's one-gutter margin.
    const blockRight = Math.max(...reaching.map((line) => line.right));
    worst = photo.fig.x - blockRight;
  } else if (beside.length) {
    worst = photo.img.x - photo.fig.x;
  } else {
    return;
  }
  if (worst > gutter + SLACK) {
    out.push({
      rule: 'c',
      detail:
        `blank gap between the lead's text and its side photo is ` +
        `${worst.toFixed(1)}px, wider than one column gutter (${gutter.toFixed(1)}px)`,
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
  return out;
}
