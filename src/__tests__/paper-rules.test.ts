/**
 * Page-one layout rules (`scripts/paper-rules.ts`): pure geometry, fake
 * rects. Each rule is pinned at its boundary, so a change to the gutter,
 * the slack or the centre tolerance breaks here first.
 */
import {
  judgeCase,
  type CaseInput,
  type Rect,
} from '../../scripts/paper-rules';

const box = (x: number, y: number, w: number, h: number): Rect => ({
  x, y, width: w, height: h,
});

const base = (): CaseInput => ({
  poolLetters: 5,
  printedLetters: 5,
  hasLead: true,
  hasLab: false,
  gutter: 16,
  sheet: box(0, 0, 1000, 1500),
  stories: [box(10, 100, 600, 300)],
  letters: [box(10, 420, 300, 60), box(330, 420, 300, 80)],
  logbookLink: box(10, 0, 200, 12),
  controlLabel: box(10, 1500, 100, 12),
  lab: null,
  colophon: box(10, 1450, 980, 40),
  colophonVisible: true,
  leadPhoto: null,
  textLines: [],
  columns: [{ box: box(10, 420, 300, 200), foot: 620 }],
  editionEmpty: false,
  pageHidden: false,
  fontsLoaded: true,
});

describe('paper-rules', () => {
  test('(a) a story ending 1px past the sheet passes, 2px fails', () => {
    const ok = base();
    ok.stories = [box(10, 100, 600, 1401)];
    expect(judgeCase(ok).filter((f) => f.rule === 'a')).toHaveLength(0);
    const bad = base();
    bad.letters = [box(10, 420, 300, 1082)];
    const found = judgeCase(bad).filter((f) => f.rule === 'a');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/past the sheet/);
  });

  test('(a) a lab story past the sheet fails too', () => {
    const input = base();
    input.hasLab = true;
    input.lab = box(10, 1400, 600, 200);
    const found = judgeCase(input).filter((f) => f.rule === 'a');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/lab story/);
  });

  test('(b) sleeps while every letter is printed, even with a tall band', () => {
    const input = base();
    input.poolLetters = 3;
    input.printedLetters = 3;
    input.columns = [{ box: box(10, 420, 300, 50), foot: 1400 }];
    expect(judgeCase(input).filter((f) => f.rule === 'b')).toHaveLength(0);
  });

  test('(b) a band of shortest+1px passes, shortest+2px fails, when letters remain', () => {
    const mk = (band: number): CaseInput => {
      const input = base();
      input.poolLetters = 9;
      input.printedLetters = 4;
      // Shortest printed letter is 60px tall.
      input.columns = [{ box: box(10, 420, 300, 200), foot: 620 + band }];
      return input;
    };
    expect(judgeCase(mk(61)).filter((f) => f.rule === 'b')).toHaveLength(0);
    const found = judgeCase(mk(62)).filter((f) => f.rule === 'b');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/blank band/);
  });

  test('(c) sleeps for a spanning photo; the block sits one gutter from the frame', () => {
    const mk = (gap: number, side: boolean): CaseInput => {
      const input = base();
      input.leadPhoto = {
        fig: box(410, 100, 200, 300),
        // The image sits inside the figure's mat.
        img: box(414, 104, 192, 250),
        side,
        containerLeft: 10,
        containerRight: 610,
      };
      input.textLines = [{ left: 10, right: 410 - gap, top: 150, bottom: 170 }];
      return input;
    };
    // Non-side (landscape span): no gap rule even with a wide blank.
    expect(judgeCase(mk(500, false)).filter((f) => f.rule === 'c')).toHaveLength(0);
    // One gutter is 16px; gutter+slack (17px) passes …
    expect(judgeCase(mk(16, true)).filter((f) => f.rule === 'c')).toHaveLength(0);
    expect(judgeCase(mk(17, true)).filter((f) => f.rule === 'c')).toHaveLength(0);
    // … a wider one fails with the measured numbers.
    const found = judgeCase(mk(18, true)).filter((f) => f.rule === 'c');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/18\.0px/);
    // A ragged last line ending far left is not the block's edge; the
    // furthest-right wrapped line is.
    const ragged = mk(16, true);
    ragged.textLines.push({ left: 10, right: 100, top: 150, bottom: 170 });
    expect(judgeCase(ragged).filter((f) => f.rule === 'c')).toHaveLength(0);
    // A short wrapped line beside a longer one is not a gap either.
    const uneven = mk(16, true);
    uneven.textLines.push({ left: 10, right: 410 - 25, top: 150, bottom: 170 });
    expect(judgeCase(uneven).filter((f) => f.rule === 'c')).toHaveLength(0);
    // No line reaching the float: only the frame's own blank can fail.
    const frameOk = mk(16, true);
    frameOk.textLines = [{ left: 10, right: 50, top: 150, bottom: 170 }];
    expect(judgeCase(frameOk).filter((f) => f.rule === 'c')).toHaveLength(0);
    const frameBlank = mk(16, true);
    frameBlank.textLines = [{ left: 10, right: 50, top: 150, bottom: 170 }];
    frameBlank.leadPhoto = {
      fig: box(410, 100, 200, 300),
      img: box(440, 104, 160, 250),
      side: true,
      containerLeft: 10,
      containerRight: 610,
    };
    const frameFound = judgeCase(frameBlank).filter((f) => f.rule === 'c');
    expect(frameFound).toHaveLength(1);
    expect(frameFound[0].detail).toMatch(/30\.0px/);
  });

  test('(d) sleeps without a lab story, fails when it leaves the sheet', () => {
    expect(judgeCase(base()).filter((f) => f.rule === 'd')).toHaveLength(0);
    const inSheet = base();
    inSheet.hasLab = true;
    inSheet.lab = box(10, 1300, 600, 150);
    expect(judgeCase(inSheet).filter((f) => f.rule === 'd')).toHaveLength(0);
    const out = base();
    out.hasLab = true;
    out.lab = box(10, 1400, 600, 150);
    const found = judgeCase(out).filter((f) => f.rule === 'd');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/y=1400\.0.*1550\.0px/);
    expect(found[0].detail).toMatch(/sheet \(y=0\.0.*1500\.0px\)/);
  });

  test('(e) a missing or hidden colophon fails; a visible one inside passes', () => {
    expect(judgeCase(base()).filter((f) => f.rule === 'e')).toHaveLength(0);
    const missing = base();
    missing.colophon = null;
    missing.colophonVisible = false;
    expect(judgeCase(missing).filter((f) => f.rule === 'e')).toHaveLength(1);
    const past = base();
    past.colophon = box(10, 1480, 980, 40);
    const found = judgeCase(past).filter((f) => f.rule === 'e');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/past the sheet/);
    expect(found[0].detail).toMatch(/19\.0px/);
  });

  test('(f) centred-with-margins fails; flush, spanning or 3px-off passes', () => {
    const mk = (figX: number, figW: number): CaseInput => {
      const input = base();
      input.leadPhoto = {
        fig: box(figX, 100, figW, 300),
        img: box(figX + 4, 104, figW - 8, 250),
        side: true,
        containerLeft: 10,
        containerRight: 810,
      };
      return input;
    };
    // Equal 100px margins on both sides: centred, fails.
    const centred = judgeCase(mk(110, 600)).filter((f) => f.rule === 'f');
    expect(centred).toHaveLength(1);
    expect(centred[0].detail).toMatch(/left 100\.0px, right 100\.0px/);
    // Margins within 2px still read as centred …
    expect(judgeCase(mk(110, 598)).filter((f) => f.rule === 'f')).toHaveLength(1);
    // … 3px apart does not …
    expect(judgeCase(mk(110, 597)).filter((f) => f.rule === 'f')).toHaveLength(0);
    // … nor does a photo flush to one side.
    expect(judgeCase(mk(594, 200)).filter((f) => f.rule === 'f')).toHaveLength(0);
    // A gutter-wide (16px) margin is not a blank band either.
    expect(judgeCase(mk(26, 768)).filter((f) => f.rule === 'f')).toHaveLength(0);
  });

  test('(g) sleeps when the link reads no larger than a control label', () => {
    // Same height, or within the 1px slack: no finding.
    expect(judgeCase(base()).filter((f) => f.rule === 'g')).toHaveLength(0);
    const slack = base();
    slack.logbookLink = box(10, 0, 200, 13);
    expect(judgeCase(slack).filter((f) => f.rule === 'g')).toHaveLength(0);
  });

  test('(g) fails when the link reads larger than a control label', () => {
    // The unscaled phone case: an 11.5px link against a scaled-down sheet
    // reads far larger than the paper's own labels.
    const input = base();
    input.logbookLink = box(10, 0, 200, 16);
    input.controlLabel = box(10, 1500, 100, 12);
    const found = judgeCase(input).filter((f) => f.rule === 'g');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/16\.0px/);
    expect(found[0].detail).toMatch(/taller than a control label/);
  });

  test('(g) fails when the link is missing or unlaid: the row must stay visible', () => {
    const missing = base();
    missing.logbookLink = null;
    const found = judgeCase(missing).filter((f) => f.rule === 'g');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/not laid out/);
    const flat = base();
    flat.logbookLink = box(10, 0, 0, 0);
    expect(judgeCase(flat).filter((f) => f.rule === 'g')).toHaveLength(1);
  });

  test('(g) sleeps when the comparator is missing or unlaid', () => {
    const flat = base();
    flat.controlLabel = box(10, 1500, 0, 0);
    expect(judgeCase(flat).filter((f) => f.rule === 'g')).toHaveLength(0);
    const missing = base();
    missing.controlLabel = null;
    expect(judgeCase(missing).filter((f) => f.rule === 'g')).toHaveLength(0);
  });

  test('harness: an unrendered edition or a hidden page reports only itself', () => {
    const empty = base();
    empty.editionEmpty = true;
    const found = judgeCase(empty);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('harness');
    const hidden = base();
    hidden.pageHidden = true;
    expect(judgeCase(hidden).map((f) => f.rule)).toEqual(['harness']);
  });

  test('harness: fallback-font metrics are not a reader\'s and report themselves', () => {
    const input = base();
    input.fontsLoaded = false;
    const found = judgeCase(input);
    expect(found.map((f) => f.rule)).toEqual(['harness']);
    expect(found[0].detail).toMatch(/web fonts/);
  });
});
