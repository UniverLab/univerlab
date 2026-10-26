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
  it('names the sky action in both languages with the exact spec strings', () => {
    expect(en.header.skyToNight).toBe('Switch to the night theme');
    expect(en.header.skyToDay).toBe('Switch to the day theme');
    expect(es.header.skyToNight).toBe('Cambiar al tema de noche');
    expect(es.header.skyToDay).toBe('Cambiar al tema de día');
    // The old keys, which named the letter of the day, are gone from both.
    expect((en.header as Record<string, unknown>).skySun).toBeUndefined();
    expect((en.header as Record<string, unknown>).skyMoon).toBeUndefined();
    expect((es.header as Record<string, unknown>).skySun).toBeUndefined();
    expect((es.header as Record<string, unknown>).skyMoon).toBeUndefined();
  });

  it('mounts the body in an empty .celestial span and names the action the click will do', () => {
    // .celestial stays an empty mount — the bundled script injects sun/moon.
    expect(src).toMatch(/<span class="celestial" aria-hidden="true"><\/span>/);
    expect(src).toMatch(/aria-label=\{t\.header\.skyToNight\}/);
    expect(src).toMatch(/title=\{t\.header\.skyToNight\}/);
    expect(src).toMatch(/data-sky-to-night=\{t\.header\.skyToNight\}/);
    expect(src).toMatch(/data-sky-to-day=\{t\.header\.skyToDay\}/);
  });

  it('renders the sun image by day and the real-phase moon by night', () => {
    expect(src).toMatch(/import \{ moonSVG \} from '\.\.\/lib\/moon-svg'/);
    // Sun: the approved engraved file, 34px, decorative.
    expect(src).toMatch(/<img src="\/bench\/identidad\/sol\.svg" alt="" width="34" height="34">/);
    // The plain-day shadow stays the default…
    expect(src).toMatch(/html\[data-celestial='sun'\] \.celestial :global\(img\)/);
    // …and the circadian script's data-sunlow flag reddens the icon at dawn/dusk.
    expect(src).toMatch(/html\[data-celestial='sun'\]\[data-sunlow\] \.celestial :global\(img\)/);
    const sunlowRule = src.match(
      /html\[data-celestial='sun'\]\[data-sunlow\] \.celestial :global\(img\) \{([\s\S]*?)\n  \}/,
    );
    expect(sunlowRule).not.toBeNull();
    expect(sunlowRule![1]).toMatch(/sepia\(1\) saturate\(3\.4\)/);
    expect(sunlowRule![1]).toMatch(/hue-rotate\(-24deg\)/);
    expect(sunlowRule![1]).toMatch(/rgb\(191 52 23 \/ 0\.35\)/);
    // Moon: same synodic computation the circadian script uses for --moon-offset.
    expect(src).toMatch(/Date\.UTC\(2000, 0, 6, 18, 14\)/);
    expect(src).toMatch(/29\.530588853/);
    expect(src).toMatch(/moonSVG\(synodicPhase\(\), 'hdr', 31\)/);
    // Watches the flip the circadian script already publishes.
    expect(src).toMatch(/readCelestial|renderCelestial/);
    expect(src).toMatch(/new MutationObserver\(/);
    expect(src).toMatch(/attributeFilter: \['data-celestial'\]/);
    // The accessible name (and tooltip) follows the body and names the
    // action the click will do: sun showing → switch to night, moon → day.
    expect(src).toMatch(/setAttribute\('aria-label', btn\.dataset\.skyToNight/);
    expect(src).toMatch(/setAttribute\('title', btn\.dataset\.skyToNight/);
    expect(src).toMatch(/setAttribute\('aria-label', btn\.dataset\.skyToDay/);
    expect(src).toMatch(/setAttribute\('title', btn\.dataset\.skyToDay/);
  });

  it('keeps a 44px hit area and shrinks the body to 34px, dropping the old 8px dot', () => {
    const btnBlock = src.match(/\.celestial-btn\s*\{([\s\S]*?)\n  \}/);
    expect(btnBlock).not.toBeNull();
    expect(btnBlock![1]).toMatch(/width:\s*44px/);
    expect(btnBlock![1]).toMatch(/height:\s*44px/);
    const bodyBlock = src.match(/\.celestial\s*\{([\s\S]*?)\n  \}/);
    expect(bodyBlock).not.toBeNull();
    expect(bodyBlock![1]).toMatch(/width:\s*34px/);
    expect(bodyBlock![1]).toMatch(/height:\s*34px/);
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

  it('engraves the hour ruler as the only header line and clamps the body off the mailbox', () => {
    expect(src).toMatch(/<span class="sky-ruler" aria-hidden="true"><svg preserveAspectRatio="none"><\/svg><\/span>/);
    const rulerBlock = src.match(/\.sky-ruler\s*\{([^}]*)\}/s);
    expect(rulerBlock).not.toBeNull();
    expect(rulerBlock![1]).toMatch(/left:\s*0/);
    // The ruler spans the whole header foot — where the removed hr.rule stood,
    // the mailbox at its right end — so it is the only line.
    expect(rulerBlock![1]).toMatch(/right:\s*0/);
    expect(rulerBlock![1]).toMatch(/height:\s*16px/);
    // Ruler geometry: 1000-wide viewBox, base at y12, 48 quarter-hours.
    expect(src).toMatch(/viewBox', '0 0 ' \+ W \+ ' 16'/);
    expect(src).toMatch(/y1="12"/);
    expect(src).toMatch(/m <= 48/);
    expect(src).toMatch(/\(m \/ 48\) \* W/);
    expect(src).toMatch(/six \? 9 : hour \? 5 : 2\.5/);
    expect(src).toMatch(/vector-effect="non-scaling-stroke"/);
    // Track ends before the mailbox at the ruler's right end (body 34px).
    expect(src).toMatch(/left: clamp\(22px, var\(--sun-pos, 50%\), calc\(100% - 71px\)\)/);
    // The body is centred on the ruler's baseline (y12 of a 16px ruler at
    // bottom 0 → 4px above the foot), no longer on the removed hr.
    expect(src).toMatch(/bottom: 4px;/);
  });

  it('switches the theme on a click (palette key + applyTheme) and keeps drag-to-scrub', () => {
    expect(src).toMatch(/--sun-pos/);
    // No letter hook left in the header: letters live in the mailbox only.
    expect(src).not.toMatch(/univerlabOpenMail|function openMail/);
    expect(src).not.toMatch(/showPopup|otd-popup/);
    // The click reads the clock (window.calc after dropping the key)…
    expect(src).toMatch(/function toggleTheme\(\)/);
    expect(src).toMatch(/if \(window\.calc\) window\.calc\(\)/);
    // …drops the key first, so the circadian-equal case leaves no key…
    expect(src).toMatch(/window\.univerlabTheme\.clear\(\)/);
    // …writes the palette's key and applies the theme with the palette's
    // own function (both call sites go through toggleTheme)…
    expect(src).toMatch(/window\.univerlabTheme\.set\(target\)/);
    expect(src).toMatch(/window\.applyTheme\('circadian'\)/);
    expect(src).toMatch(/window\.applyTheme\(target\)/);
    // …and a page with no circadian script (no window.applyTheme, e.g.
    // /texforge) still applies the click through window.calc, which
    // BaseLayout exposes on every page (see bench-ground.test).
    expect(src).toMatch(/else if \(window\.calc\) window\.calc\(\)/);
    expect(src).toMatch(/hideTip\(\);\s*\n\s*toggleTheme\(\);/);
    expect(src).toMatch(/if \(!e\.detail\) toggleTheme\(\)/);
    // Drag-to-scrub survives, still gated to circadian mode.
    expect(src).toMatch(/!window\.univerlabTheme\.read\(\) && !!window\.scrubTime/);
    // One pointer stream: a touch + mouse pair let the emulated mouseup
    // toggle a second time and undo every mobile tap after the first.
    expect(src).toMatch(/addEventListener\('pointerdown', onPointerDown\)/);
    expect(src).not.toMatch(/'(touchstart|touchend|mousedown|mouseup)'/);
    expect(src).toMatch(/touch-action: none;/);
    expect(src).toMatch(/window\.scrubTime/);
    expect(src).toMatch(/window\.resetScrub/);
  });

  it('renders the mailbox at the ruler end and draws no second line at the header foot', () => {
    // The science pool warm-up moved to the mailbox's script (mail.ts); the
    // header no longer imports ../lib/science-filter at all.
    expect(src).not.toContain('science-filter');
    expect(src).not.toMatch(/readOtdCache|fetchPool/);
    expect(src).toMatch(/import Mailbox from '\.\/Mailbox\.astro'/);
    expect(src).toMatch(/<Mailbox \/>/);
    // No <hr class="rule"> in the header markup — the regleta is the only
    // line; the bar's own padding keeps the total height the hr carried.
    expect(src).not.toContain('<hr');
    expect(src).toMatch(/padding-bottom:\s*calc\(1\.1rem \+ 1px\)/);
    expect(src).not.toMatch(/padding-block:/);
    // No science keyword list is left in the header itself.
    expect(src).not.toContain('SCIENCE_EN = [');
  });

  it('ported moon matches the phase the header will render', () => {
    // Smoke: the module the bundled script imports draws both quarters.
    const q1 = moonSVG(0.25, 'hdr');
    const q3 = moonSVG(0.75, 'hdr');
    expect(q1).toContain('A40 40 0 0 1');
    expect(q3).toContain('A40 40 0 0 0');
  });
});

describe('celestial button is circadian-only', () => {
  const BASE = readFileSync(resolve(__dirname, '..', 'layouts', 'BaseLayout.astro'), 'utf8');

  it('declares a circadian prop defaulting to true and gates the button on it', () => {
    expect(src).toMatch(/interface Props \{[^}]*circadian\?: boolean/);
    expect(src).toMatch(/const \{ circadian = true \} = Astro\.props;/);
    // The gate wraps ONLY the button: ruler, guard, then the mailbox outside it.
    expect(src).toMatch(/\{circadian && \(\s*<button class="celestial-btn"/);
    const rulerIdx = src.indexOf('<span class="sky-ruler"');
    const guardIdx = src.indexOf('{circadian && (');
    const mailboxIdx = src.indexOf('<Mailbox />');
    expect(rulerIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(rulerIdx);
    expect(mailboxIdx).toBeGreaterThan(guardIdx);
  });

  it('still draws the hour ruler when the button is not rendered', () => {
    // Without the button the guard used to return before drawRuler(), leaving
    // the header rule blank on every non-circadian page.
    expect(src).toMatch(/if \(!btn \|\| !mount\) \{ drawRuler\(\); return; \}/);
  });

  it('hides by not rendering — never with display:none on the button', () => {
    expect(src).not.toMatch(/\.celestial-btn[^}]*display:\s*none/);
  });

  it('forwards BaseLayout’s own circadian value to the header', () => {
    expect(BASE).toMatch(/<Header circadian=\{circadian\} \/>/);
  });

  it('keeps the disc on quorum: ExperimentLayout forwards the registry flag', () => {
    // The whole chain that decides per experiment: ExperimentLayout passes
    // exp.circadian down (BaseLayout defaults it to false, so losing this line
    // would silently strip the disc from /quorum too), and the registry marks
    // quorum circadian. No registry change is part of this spec — just pinned.
    const EXP = readFileSync(resolve(__dirname, '..', 'layouts', 'ExperimentLayout.astro'), 'utf8');
    expect(EXP).toMatch(/circadian=\{exp\.circadian\}/);
    const registry = readFileSync(resolve(__dirname, '..', 'lib', 'experiments.ts'), 'utf8');
    const quorumLine = registry.match(/\{ id: 'quorum'[^}]*\}/);
    expect(quorumLine).not.toBeNull();
    expect(quorumLine![0]).toMatch(/circadian: true/);
  });
});
