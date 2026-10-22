/**
 * Tests for the footer colophon: the engraved frieze band, the wax seal on
 * the credits line, the per-experiment forged line, and the braille easter egg.
 *
 * Astro components aren't directly renderable in Jest, so the markup and
 * style contracts are verified at source level (the level the component's
 * output actually lives at — every route ships the same footer). The braille
 * module is tested functionally: encoder, reverse decoder and round-trip.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { toBraille, fromBraille, BRAILLE_SENTENCE } from '../lib/braille';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const FOOTER = resolve(__dirname, '..', 'components', 'Footer.astro');
const src = readFileSync(FOOTER, 'utf8');
const BASE = readFileSync(resolve(__dirname, '..', 'layouts', 'BaseLayout.astro'), 'utf8');
const EXP = readFileSync(resolve(__dirname, '..', 'layouts', 'ExperimentLayout.astro'), 'utf8');
const DOCS = readFileSync(resolve(__dirname, '..', 'layouts', 'DocsLayout.astro'), 'utf8');

// Everything between <footer> and its first </footer> — the rendered markup.
const markup = src.slice(src.indexOf('<footer>'), src.indexOf('</footer>'));

describe('braille — Spanish grade 1, one cell per letter', () => {
  it('round-trips the sentence through the reverse map exactly', () => {
    const cells = toBraille(BRAILLE_SENTENCE);
    expect(fromBraille(cells)).toBe(BRAILLE_SENTENCE);
    // Every output character must be a braille cell at all.
    expect([...cells]).toEqual(cells.split(''));
    expect([...cells].every((c) => c.codePointAt(0)! >= 0x2800 && c.codePointAt(0)! <= 0x28ff)).toBe(true);
  });

  it('uses the exact specified cells', () => {
    expect(toBraille('a')).toBe('⠁');
    expect(toBraille('b')).toBe('⠃');
    expect(toBraille('n')).toBe('⠝');
    expect(toBraille('ñ')).toBe('⠻');
    expect(toBraille('á')).toBe('⠷');
    expect(toBraille('z')).toBe('⠵');
    // Spaces are blank cells, not dropped.
    expect(toBraille('a b')).toBe('⠁⠀⠃');
  });

  it('fails loudly on a missing cell instead of publishing meaningless dots', () => {
    // A copy edit that outgrows the table is a test failure, not silence.
    expect(() => toBraille('el universo 42')).toThrow();
    expect(() => fromBraille('\u2fff')).toThrow();
  });

  it('keeps the sentence word structure (spaces survive as blank cells)', () => {
    const cells = toBraille(BRAILLE_SENTENCE);
    expect(fromBraille(cells).split(' ').length).toBe(BRAILLE_SENTENCE.split(' ').length);
  });
});

describe('Footer — the engraved frieze band', () => {
  it('opens the footer with an aria-hidden picture as its first child', () => {
    expect(src).toMatch(/<footer>\s*<!--[^>]*-->\s*<picture class="colophon-band" aria-hidden="true">/);
  });

  it('loads the lab frieze in the exact AVIF/WebP ladder from /bench/colophon', () => {
    expect(markup).toContain('srcset="/bench/colophon/frieze-960.avif 960w, /bench/colophon/frieze-1920.avif 1920w" sizes="100vw"');
    expect(markup).toContain('src="/bench/colophon/frieze-1920.webp" srcset="/bench/colophon/frieze-960.webp 960w, /bench/colophon/frieze-1920.webp 1920w" sizes="100vw"');
    expect(markup).toContain('width="1920" height="608" alt=""');
    expect(markup).toContain('loading="lazy" decoding="async"');
  });

  it('the assets really exist on disk', () => {
    for (const f of ['frieze-960.avif', 'frieze-1920.avif', 'frieze-960.webp', 'frieze-1920.webp', 'sello-lacre.svg']) {
      expect(existsSync(resolve(__dirname, '..', '..', 'public', 'bench', 'colophon', f))).toBe(true);
    }
  });

  it('styles the band like Quorum: absolute top, 16rem, sinking mask', () => {
    expect(src).toMatch(/\.colophon-band\s*\{[^}]*position:\s*absolute/);
    expect(src).toMatch(/\.colophon-band\s*\{[^}]*height:\s*16rem/);
    expect(src).toContain('mask-image: linear-gradient(180deg, #000 30%, transparent 90%)');
    expect(src).toContain('-webkit-mask-image: linear-gradient(180deg, #000 30%, transparent 90%)');
    expect(src).toMatch(/\.colophon-band img\s*\{[^}]*object-fit:\s*cover/);
    expect(src).toMatch(/\.colophon-band img\s*\{[^}]*object-position:\s*50% 45%/);
  });

  it('the footer is relative and starts below the band', () => {
    expect(src).toMatch(/footer\s*\{[^}]*position:\s*relative/);
    expect(src).toMatch(/\.inner\s*\{[^}]*padding-block:\s*12rem/);
    // Under 40rem the headroom shrinks to 9rem so mobile content starts lower
    // but still clears the band.
    expect(src).toMatch(/max-width:\s*40rem[^{]*\{[^}]*\.inner\s*\{[^}]*padding-top:\s*9rem/s);
  });
});

describe('Footer — everything it already held stays, in order', () => {
  it('keeps the flight bar right after the band', () => {
    const bandAt = markup.indexOf('colophon-band');
    const flightAt = markup.indexOf('flight-bar');
    const innerAt = markup.indexOf('wrap inner');
    expect(bandAt).toBeGreaterThan(-1);
    expect(flightAt).toBeGreaterThan(bandAt);
    expect(innerAt).toBeGreaterThan(flightAt);
  });

  it('keeps mark link, quote, footer nav, built-with, word + branch, privacy — in that order', () => {
    const order = [
      'class="mark-link"',
      'class="quote"',
      'class="foot-nav"',
      'class="wrap lab-built"',
      '>UNIVERLAB</span>',
      'class="branch mono"',
      'id="cosmic-commit"',
      'class="privacy"',
    ];
    const at = order.map((s) => markup.indexOf(s));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe('Footer — wax seal and the forged line', () => {
  it('prepends the garnet seal to the privacy line', () => {
    expect(markup).toContain('<img src="/bench/colophon/sello-lacre.svg" width="28" height="28" alt="" aria-hidden="true">');
  });

  it('styles the credits like Quorum: flex row, 0.6rem gap, 25% currentColor rule', () => {
    expect(src).toMatch(/\.colophon-credits\s*\{[^}]*display:\s*flex/);
    expect(src).toMatch(/\.colophon-credits\s*\{[^}]*gap:\s*0\.6rem/);
    expect(src).toMatch(/\.colophon-credits\s*\{[^}]*border-top:\s*1px solid color-mix\(in srgb, currentColor 25%, transparent\)/);
    expect(src).toMatch(/\.colophon-credits img\s*\{[^}]*flex:\s*none/);
  });

  it('renders the forged line only when an expId prop is passed, before the privacy line', () => {
    expect(src).toMatch(/interface Props\s*\{[^}]*expId\?:\s*ExperimentId/s);
    expect(src).toMatch(/forged && \(|forged \?/);
    expect(src).toContain('t.footer.forged');
    const forgedAt = markup.indexOf('class="wrap forged"');
    const privacyAt = markup.indexOf('class="wrap colophon-credits"');
    // The forged line is behind the privacy/credits block in the document,
    // and is conditional — a non-experiment page renders neither line nor prop plumbing.
    expect(forgedAt).toBeGreaterThan(-1);
    expect(forgedAt).toBeLessThan(privacyAt);
    expect(src).toContain('{forged && (');
  });

  it('uses the experiment registry for the name in the mono face', () => {
    expect(src).toMatch(/const forged = expId \? byId\(expId\) : null/);
    expect(src).toMatch(/class="forged-name"/);
    expect(src).toMatch(/\.forged-name\s*\{\s*font-family:\s*var\(--font-mono\)/);
    expect(src).toMatch(/\.forged\s*\{[^}]*font-family:\s*var\(--font-mono\)/s);
  });
});

describe('Footer — the braille easter egg', () => {
  it('sits under the UNIVERLAB word as role=img with the sentence as its label', () => {
    const wordAt = markup.indexOf('>UNIVERLAB</span>');
    const brailleAt = markup.indexOf('class="braille"');
    const metaAt = markup.indexOf('class="meta"');
    expect(wordAt).toBeGreaterThan(-1);
    expect(brailleAt).toBeGreaterThan(wordAt);
    expect(brailleAt).toBeLessThan(metaAt);
    expect(markup).toMatch(/class="braille" role="img" aria-label=\{BRAILLE_SENTENCE\}/);
  });

  it('hides the glyph text from assistive tech (role=img already speaks the sentence)', () => {
    expect(markup).toMatch(/<span class="braille"[^>]*>\s*<span aria-hidden="true">\{brailleCells\}<\/span>/);
  });

  it('encrypts the sentence at build time through the lib, not a pasted literal', () => {
    expect(src).toContain('import { BRAILLE_SENTENCE, toBraille } from \'../lib/braille\'');
    expect(src).toContain('const brailleCells = toBraille(BRAILLE_SENTENCE);');
    // No visible translation and no hover affordance: the sentence text must
    // not be hardcoded in the footer, and the braille class must not react.
    expect(src).not.toContain('el universo se lee');
  });

  it('styles it faint and quiet: 0.45 opacity, 15px, 2px tracking, braille-capable fallback stack', () => {
    expect(src).toMatch(/\.braille\s*\{[^}]*opacity:\s*0\.45/s);
    expect(src).toMatch(/\.braille\s*\{[^}]*font-size:\s*15px/s);
    expect(src).toMatch(/\.braille\s*\{[^}]*letter-spacing:\s*2px/s);
    expect(src).toContain('"DejaVu Sans Mono", "Segoe UI Symbol", "Noto Sans Symbols 2", monospace');
  });
});

describe('Footer — the lab faces', () => {
  it('nav links read in the serif face, labels and lines in the mono face', () => {
    expect(src).toMatch(/\.foot-nav a\s*\{[^}]*font-family:\s*var\(--font-serif\)/s);
    expect(src).toMatch(/\.word\s*\{[^}]*font-family:\s*var\(--font-mono\)/);
    expect(src).toMatch(/\.privacy\s*\{[^}]*font-family:\s*var\(--font-mono\)/);
  });

  it('nav targets stay tappable at 32px', () => {
    expect(src).toMatch(/\.foot-nav a\s*\{[^}]*min-height:\s*32px/s);
  });
});

describe('Layouts — expId plumbing', () => {
  it('BaseLayout declares the optional prop and forwards it to Footer', () => {
    expect(BASE).toMatch(/import type \{ BgTheme, ExperimentId \} from '..\/lib\/experiments'/);
    expect(BASE).toMatch(/expId\?:\s*ExperimentId/);
    expect(BASE).toMatch(/expId,$/m);
    expect(BASE).toContain('<Footer expId={expId} />');
  });

  it('ExperimentLayout passes its id down', () => {
    expect(EXP).toMatch(/expId=\{id\}/);
  });

  it('DocsLayout passes its id down (cast to the typed prop it is)', () => {
    expect(DOCS).toMatch(/import \{ byId, type ExperimentId \} from '..\/lib\/experiments'/);
    expect(DOCS).toMatch(/expId=\{id as ExperimentId\}/);
  });
});

describe('i18n — footer.forged in both languages', () => {
  it('carries the exact spec strings', () => {
    expect(en.footer.forged).toBe('Artifact conceived and forged at UniverLab');
    expect(es.footer.forged).toBe('Artefacto concebido y forjado en UniverLab');
  });

  it('keeps the footer dictionaries in parity (forged exists in both, nothing else moved)', () => {
    expect(Object.keys(en.footer).sort()).toEqual(Object.keys(es.footer).sort());
    expect(Object.keys(en.footer.built).sort()).toEqual(Object.keys(es.footer.built).sort());
  });
});
