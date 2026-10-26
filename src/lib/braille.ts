/**
 * Spanish grade‑1 braille, one cell per letter — the footer's easter egg.
 *
 * The mapping is the exact table the 2026‑10‑21 user decision specifies:
 * every lowercase letter of the Spanish alphabet (including ñ and the
 * accented vowels), plus the blank cell for spaces. It is deliberately
 * letter represented cell-for-cell — no contractions, no numeric prefix —
 * so the sentence round‑trips through a plain reverse map and any missing
 * cell is a test failure, not a silent glitch.
 */
const BRAILLE_ALPHABET: Record<string, string> = {
  ' ': '\u2800', // blank cell — the only "punctuation" the sentence needs
  a: '\u2801',
  b: '\u2803',
  c: '\u2809',
  d: '\u2819',
  e: '\u2811',
  f: '\u280b',
  g: '\u281b',
  h: '\u2813',
  i: '\u280a',
  j: '\u281a',
  k: '\u2805',
  l: '\u2807',
  m: '\u280d',
  n: '\u281d',
  ñ: '\u283b',
  o: '\u2815',
  p: '\u280f',
  q: '\u281f',
  r: '\u2817',
  s: '\u280e',
  t: '\u281e',
  u: '\u2825',
  v: '\u2827',
  w: '\u283a',
  x: '\u282d',
  y: '\u283d',
  z: '\u2835',
  á: '\u2837',
  é: '\u282e',
  í: '\u280c',
  ó: '\u282c',
  ú: '\u283e',
};

/** The line the footer spells in braille, unchanged in both languages. */
export const BRAILLE_SENTENCE = 'el universo se lee de muchas formas';

/** Lookup from cell back to letter — the decoder's reverse map. */
const BRAILLE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(BRAILLE_ALPHABET).map(([letter, cell]) => [cell, letter]),
);

/** Encode text letter-for-letter; an unmapped character is a hard error so a
 *  copy edit that outgrows the table fails tests instead of publishing dots
 *  that mean nothing. */
export function toBraille(text: string): string {
  let out = '';
  for (const raw of text.toLowerCase()) {
    const cell = BRAILLE_ALPHABET[raw];
    if (cell === undefined) throw new Error(`no braille cell for ${JSON.stringify(raw)}`);
    out += cell;
  }
  return out;
}

/** Decode cells back to letters — the reverse trip the test walks. */
export function fromBraille(cells: string): string {
  let out = '';
  for (const cell of cells) {
    const letter = BRAILLE_REVERSE[cell];
    if (letter === undefined) throw new Error(`no letter for braille cell U+${cell.codePointAt(0)?.toString(16)}`);
    out += letter;
  }
  return out;
}
