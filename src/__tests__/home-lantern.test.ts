/**
 * Tests for the home redesign — the frontispiece, Plate I (the magic lantern),
 * the bench and the CRT transition to an experiment page.
 *
 * Astro components are not renderable in Jest, so these read the source files
 * as text (hero-scale.test.ts style) and parse the asset manifest that the
 * viewer rectangles and clip list must agree with.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { liveExperiments } from '../lib/experiments';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const SRC = resolve(__dirname, '..');
const HOME = readFileSync(resolve(SRC, 'views', 'Home.astro'), 'utf8');
const LAYOUT = readFileSync(resolve(SRC, 'layouts', 'BaseLayout.astro'), 'utf8');
const GLOBAL = readFileSync(resolve(SRC, 'styles', 'global.css'), 'utf8');
const LANTERN = readFileSync(resolve(SRC, 'scripts', 'lantern.ts'), 'utf8');
const CRT = readFileSync(resolve(SRC, 'scripts', 'crt.ts'), 'utf8');
const CRT_RESTORE = readFileSync(resolve(SRC, 'scripts', 'crt-restore.ts'), 'utf8');

interface ManifestAsset {
  kind: string;
  variant: string | null;
  width: number;
  height: number;
  viewer?: { x: number; y: number; w: number; h: number };
}
const manifest = JSON.parse(
  readFileSync(resolve(SRC, '..', 'public', 'bench', 'manifest.json'), 'utf8'),
) as { assets: ManifestAsset[] };

/** The 900 px frame's viewer rectangle for a phase, straight from the manifest. */
function manifestViewer(variant: 'day' | 'night'): string {
  const asset = manifest.assets.find(
    (a) => a.kind === 'live-frame' && a.variant === variant && a.width > 900,
  );
  if (!asset?.viewer) throw new Error(`No 900 px ${variant} live-frame with a viewer`);
  const { x, y, w, h } = asset.viewer;
  return `${x} ${y} ${w} ${h}`;
}

function homeViewer(phase: 'day' | 'night'): string {
  const match = HOME.match(new RegExp(`data-viewer-${phase}="([^"]+)"`));
  if (!match) throw new Error(`Home has no data-viewer-${phase}`);
  return match[1];
}

function fractions(value: string): number[] {
  return value.trim().split(/\s+/).map(Number);
}

describe('Home — the old card grid is gone', () => {
  it('drops the hero LabSystem figure and the background runner', () => {
    expect(HOME).not.toContain('LabSystem');
    expect(HOME).not.toContain('startBackground');
    expect(HOME).not.toContain('motifOf');
    expect(HOME).not.toContain('archivedExperiments');
  });

  it('drops the experiment card grid and its windows', () => {
    expect(HOME).not.toContain('card-bg-canvas');
    expect(HOME).not.toContain('data-flip-surface');
    expect(HOME).not.toMatch(/class="card"/);
    expect(HOME).not.toMatch(/class="grid"/);
  });
});

describe('Home — frontispiece', () => {
  it('opens with the engraved frontispiece and the lab name as the h1', () => {
    expect(HOME).toMatch(/<header class="frontis">[\s\S]*?<h1[^>]*>UniverLab<\/h1>/);
    expect(HOME).toMatch(/class="fr-rule"/);
    expect(HOME).toMatch(/class="fr-rule thin"/);
    expect(HOME).toContain('{t.home.frontis.sub}');
    expect(HOME).toContain('{t.home.hero.subtitle}');
  });

  it('inlines the engraved mark through ?raw so it takes currentColor', () => {
    expect(HOME).toMatch(/import logo from '\.\.\/\.\.\/public\/bench\/identidad\/logo-grabado\.svg\?raw'/);
    expect(HOME).toMatch(/class="fr-mark"[^>]*set:html=\{logo\}/);
  });

  it('engraves the imprint from the mission-time Sol', () => {
    expect(HOME).toContain("import { formatSolLabel } from '../lib/mission-time'");
    expect(HOME).toMatch(/formatSolLabel\(builtAt\.toISOString\(\)\)/);
    expect(HOME).toMatch(/id="imprint"/);
    expect(LANTERN).toMatch(/formatSolLabel\(now\.toISOString\(\)\)/);
  });

  it('labels the lantern as Plate I', () => {
    expect(HOME).toContain('{t.home.plate.lead}');
    expect(HOME).toContain('{t.home.plate.title}');
    expect(HOME).toMatch(/class="plate-label"/);
  });
});

describe('Home — Plate I, the lantern', () => {
  it('ships the day and night frames as AVIF/WebP srcsets at 450 and 900', () => {
    for (const phase of ['day', 'night']) {
      for (const type of ['avif', 'webp']) {
        expect(HOME).toContain(`data-phase="${phase}"`);
        expect(HOME).toMatch(
          new RegExp(`/bench/live/lantern-${phase}-450\\.${type} 450w, /bench/live/lantern-${phase}-900\\.${type} 900w`),
        );
      }
    }
    expect(HOME).toContain('sizes="(min-width: 50rem) 760px, 100vw"');
    expect(HOME).toMatch(/width="1068"/);
    expect(HOME).toMatch(/height="900"/);
    expect(HOME).toContain('{t.home.lantern.alt}');
  });

  it('places the screen exactly on the manifest viewer rectangle', () => {
    expect(fractions(homeViewer('day'))).toEqual(fractions(manifestViewer('day')));
    expect(fractions(homeViewer('night'))).toEqual(fractions(manifestViewer('night')));
    expect(fractions(homeViewer('day'))).toEqual([0.135, 0.078, 0.8, 0.694]);
    expect(fractions(homeViewer('night'))).toEqual([0.16, 0.068, 0.69, 0.7]);
  });

  it('puts the lantern image above the screen and lets clicks through', () => {
    expect(HOME).toMatch(/\.lantern-pic \{[^}]*z-index:\s*2/);
    expect(HOME).toMatch(/\.lantern-pic img \{[^}]*pointer-events:\s*none/);
    expect(HOME).toMatch(/\.screen \{[^}]*z-index:\s*1/);
  });

  it('renders one video per live experiment, with the title slide first', () => {
    expect(HOME).toMatch(/class="slide title-slide is-on"/);
    expect(HOME).toMatch(/liveExperiments\.map\(\(exp\) => \{[\s\S]*?src=\{`\/bench\/clips\/\$\{exp\.id\}\.mp4`\}/);
    expect(HOME).toMatch(/liveExperiments\.map\(\(exp\) => \{[\s\S]*?poster=\{`\/bench\/clips\/\$\{exp\.id\}\.webp`\}/);
    expect((HOME.match(/<video/g) ?? []).length).toBe(1);
    expect(HOME).toContain('object-fit: contain');
    expect(HOME).toMatch(/preload="none"/);
    expect(HOME).toMatch(/muted\s+loop\s+playsinline/);
  });

  it('loads only the clip after the current slide', () => {
    expect(LANTERN).toMatch(/preload = i === current \|\| i === current \+ 1 \? 'auto' : 'none'/);
  });

  it('cycles every 7 s with a 240 ms flash cut', () => {
    expect(LANTERN).toMatch(/CYCLE_MS = 7000/);
    expect(LANTERN).toMatch(/FLASH_MS = 240/);
    expect(LANTERN).toContain("'#fffaf0'");
    expect(LANTERN).toMatch(/show\(\(current \+ 1\) % slides\.length\)/);
  });

  it('ports the old-cinema layer (grain, flicker, scratch, vignette)', () => {
    expect(LANTERN).toMatch(/data\.data\[i \+ 3\] = 22/);
    expect(LANTERN).toMatch(/0\.04 \+ 0\.04 \* Math\.sin\(t \* 23\) \* Math\.sin\(t \* 7\)/);
    expect(LANTERN).toMatch(/Math\.sin\(t \* 1\.3\) > 0\.3/);
    expect(LANTERN).toMatch(/Math\.sin\(t \* 0\.7\) \* 0\.5 \+ 0\.5/);
    expect(LANTERN).toContain("'rgba(0,0,0,.45)'");
    // Reduced motion keeps only the vignette: the grain/flicker/scratch/flash
    // block is guarded by `if (!reduce)`.
    expect(LANTERN).toMatch(/if \(!reduce\) \{/);
  });

  it('follows the circadian phase and inverts the clips at night', () => {
    expect(LANTERN).toMatch(/root\.dataset\.benchTheme === 'night'/);
    expect(LANTERN).toMatch(/MutationObserver\(applyPhase\)/);
    expect(LANTERN).toContain("'univerlab:themechange'");
    expect(HOME).toMatch(/filter: var\(--bench-clip-filter\)/);
    expect(readFileSync(resolve(SRC, 'styles', 'bench-tokens.css'), 'utf8')).toMatch(
      /--bench-clip-filter: invert\(1\) hue-rotate\(180deg\)/,
    );
  });

  it('holds a projected machine while pointed at, and stops on pause/hidden tab', () => {
    expect(LANTERN).toMatch(/plate\.addEventListener\('pointerenter', enter\)/);
    expect(LANTERN).toMatch(/plate\.addEventListener\('focus', enter\)/);
    expect(LANTERN).toMatch(/held < 0/);
    expect(LANTERN).toContain("document.addEventListener('visibilitychange'");
    expect(LANTERN).toMatch(/pauseBtn\.setAttribute\('aria-pressed'/);
  });

  it('shows the title slide only under reduced motion', () => {
    expect(LANTERN).toMatch(/prefers-reduced-motion: reduce/);
    expect(LANTERN).toMatch(/if \(reduce \|\| paused \|\| document\.hidden\) return/);
  });
});

describe('Home — the bench', () => {
  it('renders one button per live experiment with its day and night plates', () => {
    expect(HOME).toMatch(/liveExperiments\.map\(\(exp\) => \{[\s\S]*?data-exp=\{exp\.id\}/);
    expect(HOME).toMatch(/\/bench\/machines\/\$\{exp\.id\}-day-450\.avif/);
    expect(HOME).toMatch(/\/bench\/machines\/\$\{exp\.id\}-day-450\.webp/);
    expect(HOME).toMatch(/\/bench\/machines\/\$\{exp\.id\}-night-450\.avif/);
    expect(HOME).toMatch(/\/bench\/machines\/\$\{exp\.id\}-night-450\.webp/);
    expect(HOME).toMatch(/class="plate"/);
  });

  it('gives every plate the same height, 120 px from 48rem and 84 px below', () => {
    expect(HOME).toMatch(/\.plate picture \{[^}]*height:\s*120px/);
    expect(HOME).toMatch(/@media \(max-width: 47\.999rem\) \{ \.plate picture \{ height: 84px; \} \}/);
    expect(HOME).toMatch(/\.plate img \{[^}]*height:\s*100%/);
  });

  it('scrolls the row inside its own container on small screens', () => {
    expect(HOME).toMatch(/\.row-wrap \{[^}]*overflow-x:\s*auto/);
    expect(HOME).toMatch(/\.row \{[^}]*min-width:\s*max-content/);
  });

  it('keeps plates out of the LCP path without lazy-loading them', () => {
    expect(HOME).toMatch(/<img[\s\S]*?fetchpriority="low"/);
    expect(HOME).not.toContain('loading="lazy"');
  });

  it('marks only the projected machine current and names every button', () => {
    expect(HOME).toMatch(/\.plate\[aria-current='true'\] \{ opacity: 1; \}/);
    expect(HOME).toMatch(/\.plate \{[^}]*opacity: 0\.55/);
    expect(HOME).toMatch(/<button[\s\S]*?class="plate"[\s\S]*?<span>\{exp\.name\}<\/span>/);
    expect(HOME).toContain('{t.home.lantern.benchLabel}');
  });
});

describe('Home — CRT power-off', () => {
  it('navigates through the CRT keyframes and the handshake key', () => {
    expect(GLOBAL).toContain('@keyframes crt-off');
    expect(GLOBAL).toContain('@keyframes crt-on');
    expect(GLOBAL).toContain('@keyframes crt-dot-flash');
    expect(GLOBAL).toMatch(/\.crt-view\.off \{ animation: crt-off/);
    // The power-on must run on <body> itself: the destination pages have no
    // .crt-view wrapper, so a descendant selector would never fire there.
    expect(GLOBAL).toMatch(/body\.crt-on \{[^}]*animation: crt-on/);
    expect(GLOBAL).not.toMatch(/body\.crt-on \.crt-view/);
    expect(GLOBAL).toMatch(/\.crt-dot\.flash \{ animation: crt-dot-flash/);
    expect(GLOBAL).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  });

  it('sets sessionStorage on the home and reads it in BaseLayout', () => {
    expect(HOME).toContain('univerlab-crt');
    expect(LAYOUT).toMatch(/import \{ restoreCrtOn \} from '\.\.\/scripts\/crt-restore'/);
    expect(LAYOUT).toContain('restoreCrtOn()');
    expect(CRT_RESTORE).toContain("const CRT_KEY = 'univerlab-crt'");
    expect(CRT_RESTORE).toContain('sessionStorage.getItem(CRT_KEY)');
    expect(CRT_RESTORE).toContain('sessionStorage.removeItem(CRT_KEY)');
    expect(CRT_RESTORE).toContain("classList.add('crt-on')");
    // …and the class is cleared when <body>'s own power-on finishes, not only
    // when the home's wrapper (which destination pages lack) animates.
    expect(CRT_RESTORE).toMatch(/e\.target === body/);
    expect(CRT_RESTORE).toContain('window.setTimeout(clear, 1400)');
    expect(CRT).toContain("const CRT_KEY = 'univerlab-crt'");
    expect(CRT).toContain('sessionStorage.setItem(CRT_KEY');
  });

  it('collapses the view, flashes the dot and navigates; instant under reduced motion', () => {
    expect(HOME).toMatch(/class="crt-view" id="home-view"/);
    expect(HOME).toMatch(/class="crt-dot" id="crt-dot"/);
    expect(CRT).toMatch(/view\.classList\.add\('off'\)/);
    expect(CRT).toMatch(/dot\.classList\.add\('flash'\)/);
    expect(CRT).toMatch(/window\.location\.assign\(href\)/);
    expect(CRT).toMatch(/if \(reduce\) \{[\s\S]*?window\.location\.assign\(href\);[\s\S]*?return;/);
  });

  it('keeps Enter on a focused machine working through the native button', () => {
    expect(HOME).toMatch(/<button[\s\S]*?type="button"[\s\S]*?class="plate"/);
    expect(HOME).toMatch(/btn\.addEventListener\('click'/);
    expect(HOME).toContain('data-href={localizePath(`/${exp.id}`, lang)}');
  });
});

describe('Home — separators', () => {
  it('draws the horizon once, after the about section', () => {
    expect((HOME.match(/sep horizon/g) ?? []).length).toBe(1);
    expect(HOME.indexOf('class="wrap sep horizon"')).toBeGreaterThan(
      HOME.indexOf('class="wrap section two-col about"'),
    );
    expect(HOME).toContain('SCI · CLI · BIO');
    expect(HOME).toContain('id="horizon-mask"');
    expect(LANTERN).toMatch(/box\.width \+ 52/);
  });

  it('uses the asterism dinkus between the lower sections', () => {
    expect((HOME.match(/sep dinkus/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(HOME).toContain('<span>⁂</span>');
    expect(HOME).toMatch(/\.dinkus::before/);
  });

  it('does not repeat the hour ruler in the page', () => {
    expect(HOME).not.toContain('ruler');
  });
});

describe('Home — copy in both dictionaries', () => {
  it('adds every new key to en and es', () => {
    expect(en.home.frontis.sub).toBe('Open computational laboratory');
    expect(es.home.frontis.sub).toBe('Laboratorio computacional abierto');
    expect(en.home.plate.lead).toBe('Plate I');
    expect(es.home.plate.lead).toBe('Lámina I');
    expect(en.home.plate.title).toBeTruthy();
    expect(es.home.plate.title).toBeTruthy();
    expect(en.home.about.kicker).toBe('About the lab');
    expect(es.home.about.kicker).toBe('Acerca del laboratorio');
    expect(en.home.lantern.pause).toBe('Pause the lantern');
    expect(es.home.lantern.pause).toBe('Pausar la linterna');
    expect(en.home.lantern.resume).toBeTruthy();
    expect(es.home.lantern.resume).toBeTruthy();
    expect(en.home.lantern.benchLabel).toContain('point at a machine');
    expect(es.home.lantern.benchLabel).toContain('apunta a una máquina');
    expect(en.home.lantern.alt).toContain('magic lantern');
    expect(es.home.lantern.alt).toContain('linterna mágica');
    expect(en.home.lantern.alt).not.toBe(es.home.lantern.alt);
  });

  it('keeps the former h1 as the About the lab heading', () => {
    expect(HOME).toMatch(/class="wrap section two-col about"[\s\S]*?<h2>\{t\.home\.hero\.title\}<\/h2>/);
    expect(en.home.hero.title).toContain('Open source for the AI era');
  });
});
