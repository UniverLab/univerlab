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
  front: null,
  ink: [],
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

  test('(c) sleeps for a stacked photo; the words sit one gutter from the frame', () => {
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
    // A photo stacked above or below the words: no gap rule even with a
    // wide blank.
    expect(judgeCase(mk(500, false)).filter((f) => f.rule === 'c')).toHaveLength(0);
    // One gutter is 16px; gutter+slack (17px) passes …
    expect(judgeCase(mk(16, true)).filter((f) => f.rule === 'c')).toHaveLength(0);
    expect(judgeCase(mk(17, true)).filter((f) => f.rule === 'c')).toHaveLength(0);
    // … a wider one fails with the measured numbers.
    const found = judgeCase(mk(18, true)).filter((f) => f.rule === 'c');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/18\.0px/);
    // A ragged last line ending far left is not the block's edge; the
    // furthest-right line beside the photo is.
    const ragged = mk(16, true);
    ragged.textLines.push({ left: 10, right: 100, top: 180, bottom: 200 });
    expect(judgeCase(ragged).filter((f) => f.rule === 'c')).toHaveLength(0);
    // Lines above or below the photo never gap against it.
    const above = mk(16, true);
    above.textLines.push({ left: 10, right: 60, top: 40, bottom: 60 });
    expect(judgeCase(above).filter((f) => f.rule === 'c')).toHaveLength(0);
  });

  test('(c) fails on the measured 2026-11-17 lead: text capped far short of its photo', () => {
    // Desktop 1366px: the lead's text stopped near x=600 under the site's
    // 65ch measure while the photo stood at x=875, ~270px of blank paper
    // between them.
    const input = base();
    input.leadPhoto = {
      fig: box(875, 730, 145, 215),
      img: box(879, 734, 137, 190),
      side: true,
      containerLeft: 130,
      containerRight: 1020,
    };
    input.textLines = [730, 759, 788, 817, 846, 875].map((top) => ({
      left: 130, right: 600, top, bottom: top + 22,
    }));
    const found = judgeCase(input).filter((f) => f.rule === 'c');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/275\.0px/);
  });

  test('(h) sleeps without a measured front; passes a page printed to its foot', () => {
    expect(judgeCase(base()).filter((f) => f.rule === 'h')).toHaveLength(0);
    const full = base();
    full.front = box(10, 100, 980, 1340);
    // Three ruled columns of lines from top to colophon, 32px gutters.
    for (const x of [10, 342, 674]) {
      for (let y = 100; y < 1440; y += 24) full.ink.push(box(x, y, 316, 20));
    }
    expect(judgeCase(full).filter((f) => f.rule === 'h')).toHaveLength(0);
  });

  test('(h) fails on the measured 2026-11-17 hole: a photo column empty under its caption', () => {
    // Three letter columns ran left of x=760 while the lead photo stood in a
    // fourth slot on the right, with nothing printed under it for ~1100px.
    const input = base();
    input.front = box(10, 100, 980, 1340);
    for (const x of [10, 260, 510]) {
      for (let y = 100; y < 1440; y += 24) input.ink.push(box(x, y, 230, 20));
    }
    input.ink.push(box(760, 100, 230, 230));
    input.leadPhoto = {
      fig: box(760, 100, 230, 230),
      img: box(764, 104, 222, 200),
      side: true,
      containerLeft: 10,
      containerRight: 990,
    };
    const found = judgeCase(input).filter((f) => f.rule === 'h');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/taller than the lead photo \(230\.0px\)/);
  });

  test('(h) without a photo, a blank past 15% of the sheet fails; under it passes', () => {
    const mk = (blank: number): CaseInput => {
      const input = base();
      input.front = box(10, 100, 980, 1340);
      for (const x of [10, 342, 674]) {
        // The first column ends `blank` px above the colophon (y=1450).
        const end = x === 10 ? 1450 - blank : 1450;
        for (let y = 100; y + 20 <= end; y += 20) input.ink.push(box(x, y, 316, 20));
      }
      return input;
    };
    // 15% of the 1500px sheet is 225px.
    expect(judgeCase(mk(210)).filter((f) => f.rule === 'h')).toHaveLength(0);
    const found = judgeCase(mk(240)).filter((f) => f.rule === 'h');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toMatch(/page's share \(225\.0px\)/);
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
