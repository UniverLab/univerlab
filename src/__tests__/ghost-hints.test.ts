import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const LAYOUT = resolve(__dirname, '..', 'layouts', 'BaseLayout.astro');
const src = readFileSync(LAYOUT, 'utf8');

describe('ghost hints', () => {
  it('hints exist in both languages with the same keys', () => {
    expect(Object.keys(en.hints)).toEqual(['palette', 'themeMark', 'branch']);
    expect(Object.keys(es.hints)).toEqual(['palette', 'themeMark', 'branch']);
  });

  it('the palette hint keeps its kbd tag in both languages', () => {
    expect(en.hints.palette).toContain('<kbd>/</kbd>');
    expect(es.hints.palette).toContain('<kbd>/</kbd>');
  });

  it('the layout reads every hint from the dictionary', () => {
    expect(src).toContain('t.hints.palette');
    expect(src).toContain('t.hints.themeMark');
    expect(src).toContain('t.hints.branch');
    expect(src).not.toContain('celestial marker');
    expect(src).not.toContain('today-science');
  });
});
