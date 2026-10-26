/**
 * hasCounterpart down the tree routes: the catch-all branch of matchRoute
 * (mid-prefix spread), its length guard and its mismatch exit, beside the
 * ordinary static and parameter routes.
 */
import { hasCounterpart } from '../i18n';

describe('hasCounterpart over the built page tree', () => {
  it('static routes', () => {
    expect(hasCounterpart('/experiments/', 'es')).toBe(true);
    expect(hasCounterpart('/status/', 'es')).toBe(false);
    expect(hasCounterpart('/roadmap/', 'es')).toBe(false);
  });
  it('parameter routes match one segment', () => {
    expect(hasCounterpart('/gitkit/', 'es')).toBe(true);
    expect(hasCounterpart('/nonsense/', 'es')).toBe(false);
    expect(hasCounterpart('/gitkit/deep/', 'es')).toBe(false);
  });
  it('the docs catch-all consumes the rest and guards its prefix', () => {
    expect(hasCounterpart('/gitkit/docs/quickstart/', 'en')).toBe(true);
    expect(hasCounterpart('/gitkit/wiki/quickstart/', 'en')).toBe(false);
    expect(hasCounterpart('/gitkit/', 'en')).toBe(true);
  });
  it('query and hash are stripped before matching', () => {
    expect(hasCounterpart('/experiments/?topic=canopy#all', 'es')).toBe(true);
    expect(hasCounterpart('/es/experiments/?x=1', 'en')).toBe(true);
  });
});
