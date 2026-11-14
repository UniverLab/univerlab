import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const paper = readFileSync(resolve(__dirname, '../components/TodaysPaper.astro'), 'utf8');
const todayEn = readFileSync(resolve(__dirname, '../pages/newspaper.astro'), 'utf8');
const todayEs = readFileSync(resolve(__dirname, '../pages/es/newspaper.astro'), 'utf8');

describe('today pick form', () => {
  it('the masthead carries the date controls: steps, words and a hidden native input', () => {
    for (const s of [
      'class="edition-pick"',
      'data-prev',
      'data-next',
      'data-words',
      'type="date"',
      'name="d"',
      't.today.pick.prev',
      't.today.pick.next',
      't.today.pick.label',
      't.today.pick.go',
      'class="edition-label"',
      'data-today',
      'data-past',
    ]) {
      expect(paper).toContain(s);
    }
  });

  it('the native input stays keyboard-reachable under its words label', () => {
    expect(paper).toContain('<label class="words">');
    expect(paper).toContain('.words:focus-within');
  });

  it('the steps and the print control are icon buttons with names and tooltips', () => {
    for (const s of [
      'chevronLeft',
      'chevronRight',
      'printer',
      'iconSvg(chevronLeft, { size: 15 })',
      'iconSvg(chevronRight, { size: 15 })',
      'iconSvg(printer, { size: 15 })',
      'aria-label={t.today.pick.prev}',
      'title={t.today.pick.prev}',
      'aria-label={t.today.pick.next}',
      'title={t.today.pick.next}',
      'aria-label={t.today.pick.go}',
      'title={t.today.pick.go}',
    ]) {
      expect(paper).toContain(s);
    }
    // No control prints its word anymore: the date stays the clear centre.
    expect(paper).not.toContain('>{t.today.pick.prev}<');
    expect(paper).not.toContain('>{t.today.pick.go}<');
  });

  it('tapping the words opens the native picker (touch)', () => {
    expect(paper).toContain('label.words');
    expect(paper).toContain('showPicker');
  });

  it('prints the date controls twice: the masthead pair and the bar pair', () => {
    expect(paper.match(/<a[^>]*data-prev[^>]*>/g)).toHaveLength(2);
    expect(paper.match(/<a[^>]*data-next[^>]*>/g)).toHaveLength(2);
    expect(paper.match(/type="date"/g)).toHaveLength(2);
    expect(paper.match(/type="submit"/g)).toHaveLength(1);
  });

  it('the words span reserves its height before the script fills it', () => {
    // The masthead keeps the full words; the strip reads a compact short date.
    expect(paper).toContain('<span data-words>&nbsp;</span>');
    expect(paper.match(/<span data-words>&nbsp;<\/span>/g)).toHaveLength(1);
    expect(paper).toContain('<span data-words-short>&nbsp;</span>');
    expect(paper.match(/<span data-words-short>&nbsp;<\/span>/g)).toHaveLength(1);
  });

  it('choosing a date loads that edition, in the compact strip wording', () => {
    // Either picker's change navigates at once; the max attribute and the
    // guard together keep future dates unreachable.
    expect(paper).toContain("window.location.search = '?d=' + value");
    expect(paper).toContain('data-words-short');
    expect(paper).toContain("weekday: 'short'");
  });

  it('both pages use the picked day in the fallback', () => {
    for (const page of [todayEn, todayEs]) {
      expect(page).toContain('editionDateFor(window.location.search)');
      expect(page).not.toContain('editionDate()');
    }
  });
});
