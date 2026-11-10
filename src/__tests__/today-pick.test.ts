import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const paper = readFileSync(resolve(__dirname, '../components/TodaysPaper.astro'), 'utf8');
const todayEn = readFileSync(resolve(__dirname, '../pages/today.astro'), 'utf8');
const todayEs = readFileSync(resolve(__dirname, '../pages/es/today.astro'), 'utf8');

describe('today pick form', () => {
  it('the masthead carries the date form', () => {
    for (const s of [
      'class="edition-pick"',
      'type="date"',
      'name="d"',
      't.today.pick.label',
      't.today.pick.go',
    ]) {
      expect(paper).toContain(s);
    }
  });

  it('both pages use the picked day in the fallback', () => {
    for (const page of [todayEn, todayEs]) {
      expect(page).toContain('editionDateFor(window.location.search)');
      expect(page).not.toContain('editionDate()');
    }
  });
});
