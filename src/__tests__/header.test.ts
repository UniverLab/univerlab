import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { localizePath } from '../i18n';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { moonSVG } from '../lib/moon-svg';

const HEADER = resolve(__dirname, '..', 'components', 'Header.astro');
const src = readFileSync(HEADER, 'utf8');

describe('Header experiments link', () => {
  it('links the Experiments nav entry to the localized encyclopedia, before Manifesto', () => {
    // The nav entry is an ordinary link whose href localizes /experiments …
    const expIdx = src.indexOf("href: localizePath('/experiments', lang)");
    expect(expIdx).toBeGreaterThan(-1);
    // … and it stays first, before the Manifesto entry.
    const manifestoIdx = src.indexOf('t.nav.manifesto');
    expect(manifestoIdx).toBeGreaterThan(-1);
    expect(expIdx).toBeLessThan(manifestoIdx);
  });

  it('renders <a href="/experiments/"> in English and <a href="/es/experiments/"> in Spanish', () => {
    // The one nav entry builds its href from localizePath('/experiments', lang)
    // (asserted above), so the anchor the shared header renders per language is…
    expect(src).toContain("href: localizePath('/experiments', lang)");
    expect(`<a href="${localizePath('/experiments', 'en')}">`).toBe('<a href="/experiments/">');
    expect(`<a href="${localizePath('/experiments', 'es')}">`).toBe('<a href="/es/experiments/">');
    // … and it is never hardcoded to the English-only path (the Spanish page
    // would then link back into the English encyclopedia).
    expect(src).not.toMatch(/href=["']\/experiments/);
  });

  it('renders no dropdown in either language: no exp-panel, exp-wrap, exp-trigger, exp-caret, setExpOpen or liveExperiments', () => {
    for (const s of ['exp-panel', 'exp-wrap', 'exp-trigger', 'exp-caret', 'setExpOpen', 'liveExperiments']) {
      expect(src).not.toContain(s);
    }
  });

  it('lights the link on the encyclopedia, experiment pages and experiment docs, and marks it current', () => {
    // active on /experiments (isActive), any experiment page (onExperiment)
    // and any experiment docs page (isDocs) …
    expect(src).toContain('onExperiment || isDocs');
    // … with aria-current="page" when lit.
    expect(src).toContain("aria-current={navActive(item as any) ? 'page' : undefined}");
  });

  it('keeps the burger working: link close, Escape closes the menu, collapse at 1024px', () => {
    expect(src).toContain("siteNav.querySelectorAll('a').forEach");
    expect(src).toContain("if (e.key === 'Escape') setOpen(false)");
    expect(src).toContain('@media (max-width: 1024px)');
    expect(src).not.toMatch(/@media \(max-width: 900px\)/);
  });
});

describe('Header engraved sky body (sun by day, moon by night)', () => {
  it('names the sky in both languages with the exact spec strings', () => {
    expect(en.header.skySun).toBe("Today's sun: a science fact for today");
    expect(en.header.skyMoon).toBe("Tonight's moon: a science fact for today");
    expect(es.header.skySun).toBe('El sol de hoy: una efeméride de ciencia');
    expect(es.header.skyMoon).toBe('La luna de hoy: una efeméride de ciencia');
  });

  it('mounts the body in an empty .celestial span with the translated sky name', () => {
    // .celestial stays an empty mount — the bundled script injects sun/moon.
    expect(src).toMatch(/<span class="celestial" aria-hidden="true"><\/span>/);
    expect(src).toMatch(/aria-label=\{t\.header\.skySun\}/);
    expect(src).toMatch(/data-sky-sun=\{t\.header\.skySun\}/);
    expect(src).toMatch(/data-sky-moon=\{t\.header\.skyMoon\}/);
  });

  it('renders the sun image by day and the real-phase moon by night', () => {
    expect(src).toMatch(/import \{ moonSVG \} from '\.\.\/lib\/moon-svg'/);
    // Sun: the approved engraved file, 44px, decorative.
    expect(src).toMatch(/<img src="\/bench\/identidad\/sol\.svg" alt="" width="44" height="44">/);
    // Moon: same synodic computation the circadian script uses for --moon-offset.
    expect(src).toMatch(/Date\.UTC\(2000, 0, 6, 18, 14\)/);
    expect(src).toMatch(/29\.530588853/);
    expect(src).toMatch(/moonSVG\(synodicPhase\(\), 'hdr'\)/);
    // Watches the flip the circadian script already publishes.
    expect(src).toMatch(/readCelestial|renderCelestial/);
    expect(src).toMatch(/new MutationObserver\(/);
    expect(src).toMatch(/attributeFilter: \['data-celestial'\]/);
    // The accessible name follows the phase.
    expect(src).toMatch(/setAttribute\('aria-label', btn\.dataset\.skyMoon/);
    expect(src).toMatch(/setAttribute\('aria-label', btn\.dataset\.skySun/);
  });

  it('sizes body and hit area at 44px and drops the old 8px dot', () => {
    const btnBlock = src.match(/\.celestial-btn\s*\{([\s\S]*?)\n  \}/);
    expect(btnBlock).not.toBeNull();
    expect(btnBlock![1]).toMatch(/width:\s*44px/);
    expect(btnBlock![1]).toMatch(/height:\s*44px/);
    const bodyBlock = src.match(/\.celestial\s*\{([\s\S]*?)\n  \}/);
    expect(bodyBlock).not.toBeNull();
    expect(bodyBlock![1]).toMatch(/width:\s*44px/);
    expect(bodyBlock![1]).toMatch(/height:\s*44px/);
    expect(bodyBlock![1]).not.toMatch(/background:/);
    expect(bodyBlock![1]).not.toMatch(/box-shadow/);
    // No dot glow or ::before terminator anywhere left.
    expect(src).not.toMatch(/\.celestial::before/);
    expect(src).not.toMatch(/--celestial-color/);
    expect(src).not.toMatch(/--moon-geometry-offset/);
    // Hover scales the whole 44px button, fixed sepia/chalk drop shadows.
    expect(src).toMatch(/\.celestial-btn:hover\s*\{\s*\n?\s*transform: translate\(-50%, 50%\) scale\(1\.12\)/);
    expect(src).toMatch(/drop-shadow\(0 1px 1px rgb\(32 22 12 \/ \.18\)\)/);
    expect(src).toMatch(/drop-shadow\(0 0 6px #ecebe455\)/);
    // The img/svg are injected at runtime via innerHTML, so they never carry
    // the Astro scope attribute: the selectors that size them and cast their
    // shadows must be :global() descendants or they silently never match.
    expect(src).toMatch(/\.celestial :global\(img\)/);
    expect(src).toMatch(/\.celestial :global\(svg\)/);
    expect(src).toMatch(/html\[data-celestial='sun'\] \.celestial :global\(img\)/);
    expect(src).toMatch(/html\[data-celestial='moon'\] \.celestial :global\(svg\)/);
  });

  it('engraves the hour ruler along the rule and clamps the body off the mailbox', () => {
    expect(src).toMatch(/<span class="sky-ruler" aria-hidden="true"><svg preserveAspectRatio="none"><\/svg><\/span>/);
    const rulerBlock = src.match(/\.sky-ruler\s*\{([^}]*)\}/s);
    expect(rulerBlock).not.toBeNull();
    expect(rulerBlock![1]).toMatch(/left:\s*0/);
    expect(rulerBlock![1]).toMatch(/right:\s*76px/);
    expect(rulerBlock![1]).toMatch(/height:\s*16px/);
    // Ruler geometry: 1000-wide viewBox, base at y12, 48 quarter-hours.
    expect(src).toMatch(/viewBox', '0 0 ' \+ W \+ ' 16'/);
    expect(src).toMatch(/m <= 48/);
    expect(src).toMatch(/\(m \/ 48\) \* W/);
    expect(src).toMatch(/six \? 9 : hour \? 5 : 2\.5/);
    expect(src).toMatch(/vector-effect="non-scaling-stroke"/);
    // Track ends before the mailbox at the rule's right end.
    expect(src).toMatch(/left: clamp\(22px, var\(--sun-pos, 50%\), calc\(100% - 98px\)\)/);
  });

  it('keeps behaviour: position var, popup, drag-to-scrub, i18n import', () => {
    expect(src).toMatch(/--sun-pos/);
    expect(src).toMatch(/showPopup|otd-popup/);
    expect(src).toMatch(/addEventListener\('mousedown', onPointerDown\)/);
    expect(src).toMatch(/window\.scrubTime/);
    expect(src).toMatch(/window\.resetScrub/);
  });

  it('ported moon matches the phase the header will render', () => {
    // Smoke: the module the bundled script imports draws both quarters.
    const q1 = moonSVG(0.25, 'hdr');
    const q3 = moonSVG(0.75, 'hdr');
    expect(q1).toContain('A40 40 0 0 1');
    expect(q3).toContain('A40 40 0 0 0');
  });
});
