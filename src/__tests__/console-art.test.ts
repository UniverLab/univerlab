/**
 * Console Easter egg (redesign): the `var art` template literal in
 * BaseLayout.astro must hold the diving helmet from
 * specs/redesign-reference/consola/buzo-lgb.txt byte for byte
 * (backslashes doubled, backticks prefixed — unescaped here before compare).
 *
 * specs/ is gitignored, so the suite skips when the reference is absent;
 * CI carries it, local checkouts without it stay green.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const REF = resolve(ROOT, 'specs/redesign-reference/consola/buzo-lgb.txt');
const LAYOUT = resolve(ROOT, 'src/layouts/BaseLayout.astro');

const hasRef = existsSync(REF);
const describeRef = hasRef ? describe : describe.skip;

describeRef('console diving helmet matches the reference file', () => {
  it('var art, unescaped, equals the 18 reference lines', () => {
    const src = readFileSync(LAYOUT, 'utf8');
    const start = src.indexOf('var art = `');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start + 'var art = `'.length);
    // First unescaped backtick ends the template literal.
    const end = body.search(/(?<!\\)`/);
    expect(end).toBeGreaterThan(-1);
    const unescaped = body.slice(0, end).replace(/\\([\s\S])/g, '$1');
    const stripOne = (s: string) => (s.endsWith('\n') ? s.slice(0, -1) : s);
    const ref = readFileSync(REF, 'utf8');
    expect(stripOne(unescaped).split('\n')).toEqual(stripOne(ref).split('\n'));
  });
});
