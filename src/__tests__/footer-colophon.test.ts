/**
 * Tests for the footer colophon: the frieze with the logo seal, the centred
 * book colophon, and the braille easter egg.
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

describe('Footer — the frieze with the logo seal', () => {
  it('wraps the picture in the .frieze band as its first child', () => {
    expect(src).toMatch(/<footer>\s*<!--[^>]*-->\s*<div class="frieze">/);
    const friezeAt = markup.indexOf('class="frieze"');
    const pictureAt = markup.indexOf('class="colophon-band"');
    expect(friezeAt).toBeGreaterThan(-1);
    expect(pictureAt).toBeGreaterThan(friezeAt);
    expect(markup).toMatch(/<div class="frieze">\s*<picture class="colophon-band" aria-hidden="true">/);
  });

  it('loads the lab frieze in the exact AVIF/WebP ladder from /bench/colophon', () => {
    expect(markup).toContain('srcset="/bench/colophon/frieze-960.avif 960w, /bench/colophon/frieze-1920.avif 1920w" sizes="100vw"');
    expect(markup).toContain('src="/bench/colophon/frieze-1920.webp" srcset="/bench/colophon/frieze-960.webp 960w, /bench/colophon/frieze-1920.webp 1920w" sizes="100vw"');
    expect(markup).toContain('width="1920" height="608" alt=""');
    expect(markup).toContain('loading="lazy" decoding="async"');
  });

  it('the assets really exist on disk', () => {
    for (const f of ['frieze-960.avif', 'frieze-1920.avif', 'frieze-960.webp', 'frieze-1920.webp']) {
      expect(existsSync(resolve(__dirname, '..', '..', 'public', 'bench', 'colophon', f))).toBe(true);
    }
  });

  it('seals the band with the real Mark at 24px, linking the site repository', () => {
    expect(markup).toContain('class="seal"');
    expect(markup).toContain('href="https://github.com/UniverLab/univerlab"');
    expect(markup).toContain('aria-label="UniverLab website repository"');
    expect(markup).toContain('<Mark size={24} />');
    const friezeAt = markup.indexOf('class="frieze"');
    const sealAt = markup.indexOf('class="seal"');
    const colophonAt = markup.indexOf('wrap colophon');
    expect(sealAt).toBeGreaterThan(friezeAt);
    expect(sealAt).toBeLessThan(colophonAt);
  });

  it('rides the seal on the frieze lower edge: 48px round seal, top 100%', () => {
    expect(src).toMatch(/\.seal\s*\{[^}]*width:\s*48px/s);
    expect(src).toMatch(/\.seal\s*\{[^}]*height:\s*48px/s);
    expect(src).toMatch(/\.seal\s*\{[^}]*top:\s*100%/s);
    expect(src).toMatch(/\.seal\s*\{[^}]*border-radius:\s*50%/s);
  });

  it('sinks the band into the ink through a mask, covering at 50% 45%', () => {
    expect(src).toMatch(/\.colophon-band\s*\{[^}]*mask-image:\s*linear-gradient/s);
    expect(src).toContain('-webkit-mask-image: linear-gradient(#000 35%, transparent 96%)');
    expect(src).toContain('mask-image: linear-gradient(#000 35%, transparent 96%)');
    expect(src).toMatch(/\.colophon-band img\s*\{[^}]*object-fit:\s*cover/s);
    expect(src).toMatch(/\.colophon-band img\s*\{[^}]*object-position:\s*50% 45%/s);
  });
});

describe('Footer — the centred colophon order', () => {
  it('reads frieze, quote, nav, cta, word, braille, small, branch, panel — in that order', () => {
    const order = [
      'class="frieze"',
      'class="quote"',
      'class="foot-nav"',
      'class="cta"',
      'class="word-rule"',
      'class="braille"',
      'class="icon-row"',
      'class="small"',
      'class="branch mono"',
      'id="cosmic-commit"',
    ];
    const at = order.map((s) => markup.indexOf(s));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('hides the quote on the manifesto, as today', () => {
    expect(src).toMatch(/const isManifesto = Astro\.url\.pathname\.endsWith\('\/manifesto'\)/);
    expect(markup).toContain('{!isManifesto && <p class="quote">{t.footer.quote}</p>}');
  });

  it('invites to the workbench with the dictionary CTA', () => {
    expect(markup).toContain("{t.footer.cta}");
    expect(src).toContain("localizePath('/workbench', lang)");
    expect(markup).toMatch(/<a class="cta" href=\{localizePath\('\/workbench', lang\)\}>/);
  });

  it('rules the UNIVERLAB word across the colophon', () => {
    expect(markup).toContain('<p class="word-rule">');
    expect(markup).toContain('<span class="word" translate="no">UNIVERLAB</span>');
    expect(src).toMatch(/\.word-rule::before,\s*\.word-rule::after/);
  });

  it('stacks the groups in one column, then opens two columns at 40rem', () => {
    expect(src).toMatch(/\.foot-nav\s*\{[^}]*display:\s*grid/s);
    const at = src.indexOf('.foot-nav {');
    expect(src.slice(at, src.indexOf('}', at))).not.toMatch(/grid-template-columns/);
    expect(src).toMatch(/@media \(min-width:\s*40rem\)[^{]*\{[^}]*\.foot-nav\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*auto\)/s);
  });
});

describe('Footer — the wax seal and the easter eggs are gone from the old lines', () => {
  it('carries no wax seal, sello-lacre, tag, lab-built or credits row', () => {
    expect(markup).not.toContain('sello-lacre');
    expect(markup).not.toContain('class="tag"');
    expect(markup).not.toContain('lab-built');
    expect(markup).not.toContain('colophon-credits');
    expect(markup).not.toContain('mark-link');
  });
});

describe('Footer — forged line inside the small block', () => {
  it('renders the forged line only when an expId prop is passed', () => {
    expect(src).toMatch(/interface Props\s*\{[^}]*expId\?:\s*ExperimentId/s);
    expect(src).toMatch(/forged && \(|forged \?/);
    expect(src).toContain('t.footer.forged');
    expect(src).toContain('{forged && (');
  });

  it('nests the forged sentence in .small with the experiment registry name', () => {
    expect(src).toMatch(/const forged = expId \? byId\(expId\) : null/);
    const smallAt = markup.indexOf('class="small"');
    const forgedAt = markup.indexOf('class="forged"');
    expect(smallAt).toBeGreaterThan(-1);
    expect(forgedAt).toBeGreaterThan(smallAt);
    expect(markup).toMatch(/class="forged-name"/);
    expect(src).toMatch(/\.forged-name\s*\{\s*font-family:\s*var\(--font-mono\)/);
  });

  it('splits the bottom information into centred lines inside the small block', () => {
    expect(markup).not.toContain('{t.footer.privacy}');
    expect(markup).not.toContain('class="privacy"');
    // A <div> of separate <p> lines, not one wrapping paragraph.
    expect(markup).toMatch(/<div class="small">/);
    expect(markup).toMatch(/<p><span class="operator">/);
    expect(markup).toMatch(/<p><span class="built">/);
    expect(markup).toContain('class="built"');
    expect(markup).toContain('t.footer.built.label');
    const smallAt = markup.indexOf('class="small"');
    const operatorAt = markup.indexOf('<p><span class="operator">');
    const builtAt = markup.indexOf('<p><span class="built">');
    const branchAt = markup.indexOf('class="branch mono"');
    expect(operatorAt).toBeGreaterThan(smallAt);
    expect(builtAt).toBeGreaterThan(operatorAt);
    expect(branchAt).toBeGreaterThan(builtAt);
    // The operator line is the one carrying the legal links.
    expect(markup.slice(operatorAt, builtAt)).toContain('legalLinks.map');
    expect(markup.slice(builtAt)).toContain('t.footer.built.gitkit');
  });
});

describe('Footer — the braille easter egg', () => {
  it('sits under the UNIVERLAB word as role=img with the sentence as its label', () => {
    const wordAt = markup.indexOf('>UNIVERLAB</span>');
    const brailleAt = markup.indexOf('class="braille"');
    const smallAt = markup.indexOf('class="small"');
    expect(wordAt).toBeGreaterThan(-1);
    expect(brailleAt).toBeGreaterThan(wordAt);
    expect(brailleAt).toBeLessThan(smallAt);
    expect(markup).toMatch(/class="braille" role="img" aria-label=\{BRAILLE_SENTENCE\}/);
  });

  it('hides the glyph text from assistive tech (role=img already speaks the sentence)', () => {
    expect(markup).toMatch(/<span class="braille"[^>]*>\s*<span aria-hidden="true">\{brailleCells\}<\/span>/);
  });

  it('encrypts the sentence at build time through the lib, not a pasted literal', () => {
    expect(src).toContain("import { BRAILLE_SENTENCE, toBraille } from '../lib/braille'");
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
    expect(src).toMatch(/\.small p\s*\{[^}]*margin-block:\s*0/s);
  });

  it('nav targets stay tappable at 32px', () => {
    expect(src).toMatch(/\.foot-nav a\s*\{[^}]*min-height:\s*32px/s);
  });

  it('the CTA reads in the accent', () => {
    expect(src).toMatch(/\.cta\s*\{[^}]*color:\s*var\(--accent,\s*#c9a227\)/s);
  });
});

describe('Layouts — expId plumbing', () => {
  it('BaseLayout declares the optional prop and forwards it to Footer', () => {
    expect(BASE).toMatch(/import type \{ ExperimentId \} from '..\/lib\/experiments'/);
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

describe('Footer — two grouped link headings', () => {
  it('the footer groups its links under two headings', () => {
    expect(src).toContain('t.footer.groups.work');
    expect(src).toContain('t.footer.groups.lab');
    expect(src).not.toContain('t.footer.groups.open');
    expect(src).toContain('class="foot-group"');
    expect(src).toContain('class="foot-head"');
    expect(src).not.toContain('const footNav');
  });

  it('the footer keeps its links', () => {
    for (const href of ['/experiments', '/archive', '/roadmap/', '/manifesto', '/contributors', '/workbench', '/newspaper', '/api', '/privacy', '/terms', 'https://github.com/UniverLab', 'https://github.com/sponsors/JheisonMB', 'https://x.com/UniverLab', 'https://bsky.app/profile/univerlab.bsky.social']) {
      expect(src).toContain(href);
    }
    expect(src).not.toContain('/status/');
  });

  it('links the newspaper under the lab group in both languages', () => {
    expect(src).toContain("localizePath('/newspaper', lang)");
    expect(src).toContain('label: t.nav.observable');
    // Inside the lab group, not the experiments one.
    expect(src.indexOf("localizePath('/newspaper', lang)")).toBeGreaterThan(src.indexOf('t.footer.groups.lab'));
    expect(en.nav.observable).toBe('The Observable');
    expect(es.nav.observable).toBe('El Observable');
  });

  it('the footer links the lab on X and Bluesky', () => {
    expect(src).toContain('https://x.com/UniverLab');
    expect(src).toContain('https://bsky.app/profile/univerlab.bsky.social');
    expect(src.indexOf('https://x.com/UniverLab')).toBeGreaterThan(src.indexOf("https://github.com/UniverLab'"));
    expect(src.indexOf('https://bsky.app/profile/univerlab.bsky.social')).toBeGreaterThan(src.indexOf("https://github.com/UniverLab'"));
  });

  it('the social and API links read as icons in one centred row', () => {
    // GitHub, API and the sponsor heart come from the shared Lucide lib at
    // 20px; X and Bluesky use their official fill marks (Lucide lacks them).
    expect(src).toContain("import { iconSvg } from '../lib/icon-svg'");
    expect(src).toMatch(/import \{ codeXml, github, heart \} from '\.\.\/lib\/icons'/);
    expect(src).toMatch(/iconSvg\(github, \{ size: 20 \}\)/);
    expect(src).toMatch(/iconSvg\(codeXml, \{ size: 20 \}\)/);
    expect(src).toMatch(/iconSvg\(heart, \{ size: 20 \}\)/);
    expect(src).toContain('X_PATH');
    expect(src).toContain('BLUESKY_PATH');
    expect(src).toMatch(/\.icon-row\s*\{[^}]*justify-content:\s*center/s);
    // Every icon keeps its name for assistive tech and hover — no new i18n,
    // the existing dictionary labels are reused.
    expect(src).toMatch(/class="icon-link"[\s\S]*?aria-label=\{item\.label\}[\s\S]*?title=\{item\.label\}/);
    expect(src).toMatch(/aria-label=\{t\.nav\.sponsors\}[\s\S]*?title=\{t\.nav\.sponsors\}/);
    // The old text links and the hand-drawn heart are gone.
    expect(src).not.toMatch(/label: 'heart'/);
    expect(src).not.toContain('M20.84 4.61');
  });

  it('the colophon type runs smaller and the frieze less faded', () => {
    expect(src).toMatch(/\.foot-nav a \{[^}]*font-size:\s*0\.85rem/s);
    expect(src).toMatch(/\.quote \{[^}]*font-size:\s*clamp\(0\.95rem, 1\.4vw, 1\.1rem\)/);
    expect(src).toMatch(/\.foot-head \{[^}]*font-size:\s*0\.6rem/s);
    expect(src).toMatch(/\.small \{[^}]*font-size:\s*0\.62rem/s);
    expect(src).toMatch(/\.colophon-band \{[^}]*opacity:\s*0\.8/s);
    // …but every target keeps its tap reach.
    expect(src).toMatch(/\.foot-nav a\s*\{[^}]*min-height:\s*32px/s);
    expect(src).toMatch(/\.icon-link\s*\{[^}]*min-height:\s*32px/s);
  });

  it('both dictionaries name the two groups', () => {
    expect(Object.keys(en.footer.groups).sort()).toEqual(['lab', 'work']);
    expect(Object.keys(es.footer.groups).sort()).toEqual(['lab', 'work']);
  });
});

describe('i18n — footer.cta and footer.forged in both languages', () => {
  it('carries the exact spec strings', () => {
    expect(en.footer.cta).toBe('Workbench · free first call →');
    expect(es.footer.cta).toBe('Banco de trabajo · primera llamada gratis →');
    expect(en.footer.forged).toBe('Artifact conceived and forged at UniverLab');
    expect(es.footer.forged).toBe('Artefacto concebido y forjado en UniverLab');
  });

  it('keeps the footer dictionaries in parity (cta and forged exist in both, nothing else moved)', () => {
    expect(Object.keys(en.footer).sort()).toEqual(Object.keys(es.footer).sort());
    expect(Object.keys(en.footer.built).sort()).toEqual(Object.keys(es.footer.built).sort());
  });
});

describe('Footer — the wrap lines sit inside the centred column', () => {
  // A scoped `.margin: 0` is more specific than `.wrap { margin-inline: auto }`,
  // so a zeroed margin drifts the line to the viewport's left edge at wide
  // widths instead of lining up with the column above. Only the block axis may
  // be zeroed: the inline margins belong to `.wrap`.
  const GLOBAL_CSS = readFileSync(resolve(__dirname, '..', 'styles', 'global.css'), 'utf8');

  /** The declaration list of the first `selector {` rule in the component. */
  const rule = (selector: string) => {
    const at = src.indexOf(`${selector} {`);
    expect(at).toBeGreaterThan(-1);
    return src.slice(at, src.indexOf('}', at));
  };

  it('still has the global .wrap centring these lines must inherit', () => {
    expect(GLOBAL_CSS).toMatch(/\.wrap\s*\{[^}]*max-width:\s*72rem/);
    expect(GLOBAL_CSS).toMatch(/\.wrap\s*\{[^}]*margin-inline:\s*auto/);
  });

  it('.small, .word-rule and .forged zero the block axis only — never the shorthand', () => {
    for (const sel of ['.small', '.word-rule', '.forged']) {
      const decls = rule(sel);
      expect(decls).toMatch(/margin(-block)?:\s*0/);
      expect(decls).not.toMatch(/\bmargin:\s*0/);
    }
  });

  it('no .wrap block narrows its width', () => {
    for (const sel of ['.colophon', '.base']) {
      const at = src.indexOf(`${sel} {`);
      if (at > -1) expect(src.slice(at, src.indexOf('}', at))).not.toMatch(/max-width/);
    }
    expect(rule('.word-rule')).toMatch(/width:\s*min\(/);
  });

  it('.small stays centred', () => {
    expect(rule('.small')).toMatch(/text-align:\s*center/);
  });

  it('the other .wrap blocks carry no margin override of their own', () => {
    for (const sel of ['.colophon', '.base']) {
      expect(rule(sel)).not.toMatch(/\bmargin[a-z-]*\s*:/);
    }
  });
});

describe('Footer — the cosmic branch names the Orion Arm', () => {
  it('prints milky-way/orion in both languages and nothing still says main', () => {
    expect(en.cosmos.branch).toBe('branch: milky-way/orion');
    expect(es.cosmos.branch).toBe('branch: milky-way/orion');
    expect(markup).toContain('{t.cosmos.branch}');
    // The easter egg prints no branch of its own…
    expect(markup.slice(markup.indexOf('id="cosmic-commit"'))).not.toMatch(/milky-way/);
    // …and no string anywhere still calls it main.
    expect(src).not.toContain('milky-way/main');
    for (const d of [en, es]) {
      expect(d.cosmos.branch).not.toMatch(/\bmain\b/);
      expect(d.cosmos.branchTooltip).not.toMatch(/\bmain\b|principal/);
    }
    expect(en.cosmos.branchTooltip).toContain('Orion');
    expect(es.cosmos.branchTooltip).toContain('Orión');
  });
});
