/**
 * Console Easter egg (redesign): opening the developer tools goes below the
 * page's surface. The `var art` template literal in BaseLayout.astro holds
 * lgbeard's "Scuba" helmet (asciiart.eu, cut down to the helmet, his LGB
 * initials kept) followed by two bilingual lines and the repository.
 *
 * The 18 lines are pinned here as well as read from
 * specs/redesign-reference/consola/buzo-lgb.txt: specs/ is gitignored, so the
 * file comparison only runs on a checkout that carries the reference — the
 * pinned copy is what makes the suite fail anywhere else when the art drifts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const ROOT = resolve(__dirname, '../..');
const REF = resolve(ROOT, 'specs/redesign-reference/consola/buzo-lgb.txt');
const LAYOUT = resolve(ROOT, 'src/layouts/BaseLayout.astro');

/** lgbeard's helmet, verbatim: 18 lines, trailing spaces included. */
const EXPECTED = [
  '                           o    .',
  '                      .      O',
  '                         o       .',
  '               _..--==--.._    o      (/)',
  '            .-`   ______   `-.        (/)',
  '           / _   .--==--.  .\' \\       (\\)',
  '          /    /.-=____=-.\\ .` \\      (/)',
  '         | \'. // ||    || \\\\    |     (\\)',
  '         |   ||==||====||==||   |     (/)',
  '         |   ||\' ||    ||  || ` |     (\\)',
  '         | `.\\\\==||====||==//   |     (/)',
  '          \\   \\`.||____||.\'/   /      (\\)',
  '           \\   `-.______.-\' . /      (/)',
  '           /\'-._          _.-\'\\      (\\)',
  '      _...-| .  `-......-\'  . |-..._ (/)',
  '  .-\'   \'.  \'.__.   ::  \' __.\'  .\' _.\'\\)',
  '.\'        \'.|`._\'\'------\'\'_.`|.\'_][\\).\' \'.',
  '                                       LGB'
];

const hasRef = existsSync(REF);

function layoutSource(): string {
  return readFileSync(LAYOUT, 'utf8');
}

/** The template literal body, unescaped back to the bytes it prints. */
function artLines(): string[] {
  const src = layoutSource();
  const start = src.indexOf('var art = `');
  expect(start).toBeGreaterThan(-1);
  const body = src.slice(start + 'var art = `'.length);
  // First unescaped backtick ends the template literal.
  const end = body.search(/(?<!\\)`/);
  expect(end).toBeGreaterThan(-1);
  return body.slice(0, end).replace(/\\([\s\S])/g, '$1').split('\n');
}

describe('console diving helmet', () => {
  it('prints the 18 reference lines, byte for byte', () => {
    expect(artLines()).toEqual(EXPECTED);
  });

  it('prints the two lines and the repository after the art', () => {
    // The composition is what the visitor reads in the console: a blank line
    // after the helmet, the page-language line, the invitation, the URL.
    expect(layoutSource()).toContain(
      "console.info(art + '\\n\\n' + S.belowSurface + '\\n' + S.pullRequest + '\\nhttps://github.com/UniverLab')",
    );
    expect(layoutSource()).toContain("id=\"console-strings\"");
  });

  it('carries both lines in both dictionaries', () => {
    const enC = en.console as unknown as Record<string, string>;
    const esC = es.console as unknown as Record<string, string>;
    expect(enC.belowSurface).toBe('You went below the surface.');
    expect(esC.belowSurface).toBe('Bajaste bajo la superficie.');
    expect(enC.pullRequest).toBe('The next great discovery is one pull request.');
    expect(esC.pullRequest).toBe('El próximo gran hallazgo es un pull request.');
  });
});

const describeRef = hasRef ? describe : describe.skip;

describeRef('console art against the reference file', () => {
  it('equals specs/redesign-reference/consola/buzo-lgb.txt line by line', () => {
    const ref = readFileSync(REF, 'utf8');
    const stripOne = (s: string) => (s.endsWith('\n') ? s.slice(0, -1) : s);
    expect(EXPECTED).toEqual(stripOne(ref).split('\n'));
  });
});
