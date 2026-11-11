import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const paper = readFileSync(resolve(__dirname, '../components/TodaysPaper.astro'), 'utf8');
const today = readFileSync(resolve(__dirname, '../pages/today.astro'), 'utf8');
const todayEs = readFileSync(resolve(__dirname, '../pages/es/today.astro'), 'utf8');

describe('the masthead is the only h1 of the page', () => {
  it('names the masthead as the page h1', () => {
    expect(paper).toContain('<h1 class="masthead-name">');
  });

  it('neither today page carries its own h1', () => {
    expect(today).not.toContain('<h1');
    expect(todayEs).not.toContain('<h1');
  });

  it('neither today page opens with its own band: the masthead carries the postcard', () => {
    expect(today).not.toContain('page-open');
    expect(todayEs).not.toContain('page-open');
    expect(today).not.toContain('Postcard');
    expect(todayEs).not.toContain('Postcard');
    expect(paper).toContain('<Postcard page="today"');
  });
});
