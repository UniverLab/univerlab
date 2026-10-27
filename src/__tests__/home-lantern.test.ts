/**
 * Tests for the home redesign — the frontispiece, Plate I (the magic lantern),
 * the bench and the tuning transition to an experiment page.
 *
 * Astro components are not renderable in Jest, so these read the source files
 * as text (hero-scale.test.ts style) and parse the asset manifest that the
 * viewer rectangles and clip list must agree with.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { liveExperiments } from '../lib/experiments';
import { shouldScreenNavigate, SCREEN_DRAG_PX } from '../lib/lantern-navigate';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const SRC = resolve(__dirname, '..');
const HOME = readFileSync(resolve(SRC, 'views', 'Home.astro'), 'utf8');
const LAYOUT = readFileSync(resolve(SRC, 'layouts', 'BaseLayout.astro'), 'utf8');
const GLOBAL = readFileSync(resolve(SRC, 'styles', 'global.css'), 'utf8');
const LANTERN = readFileSync(resolve(SRC, 'scripts', 'lantern.ts'), 'utf8');
const TUNE = readFileSync(resolve(SRC, 'scripts', 'tune.ts'), 'utf8');
const FONDOS_INDEX = readFileSync(resolve(SRC, 'scripts', 'fondos', 'index.ts'), 'utf8');
const LIVE_BG = readFileSync(resolve(SRC, 'components', 'LiveBackground.astro'), 'utf8');

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
    expect(HOME).toContain("(['day', 'night'] as const).flatMap");
    expect(HOME).toContain("(['avif', 'webp'] as const).map");
    expect(HOME).toContain(
      'srcset: `/bench/live/lantern-${phase}-450.${type}${v} 450w, /bench/live/lantern-${phase}-900.${type}${v} 900w`',
    );
    // The day engraving was redrawn (its posts had faded mid-height): its URL is versioned.
    expect(HOME).toContain("const lanternVersion = { day: '?v=3', night: '' } as const;");
    expect(HOME).toContain(
      'const lanternDaySrc = `/bench/live/lantern-day-900.webp${lanternVersion.day}`;',
    );
    expect(HOME).toContain('data-phase={src.phase}');
    expect(HOME).toContain('sizes="(min-width: 50rem) 760px, 100vw"');
    expect(HOME).toMatch(/width="1178"/);
    expect(HOME).toMatch(/height="900"/);
    expect(HOME).toContain('{t.home.lantern.alt}');
  });

  it('draws the engraving again over the screen, so the cloth shows whole behind the frame', () => {
    expect(HOME.match(/\{lanternSources\.map/g)).toHaveLength(2);
    expect(HOME).toMatch(/<picture class="lantern-front" aria-hidden="true">/);
    expect(HOME).toMatch(/\.lantern-front \{[^}]*z-index: 4;[^}]*pointer-events: none;/);
    expect(HOME).not.toMatch(/\.screen\[data-phase=[^\]]*\] \{\s*clip-path/);
    // Day and night share one 1178x900 canvas, so the frame never resizes on a theme flip.
    expect(HOME.match(/width="1178"/g)).toHaveLength(2);
    expect(LANTERN).not.toMatch(/img\.width = /);
  });

  it('places the screen exactly on the manifest viewer rectangle', () => {
    expect(fractions(homeViewer('day'))).toEqual(fractions(manifestViewer('day')));
    expect(fractions(homeViewer('night'))).toEqual(fractions(manifestViewer('night')));
    expect(fractions(homeViewer('day'))).toEqual([0.155, 0.078, 0.707, 0.694]);
    expect(fractions(homeViewer('night'))).toEqual([0.163, 0.068, 0.678, 0.7]);
  });

  it('keeps the image behind the screen, but hands it the clicks as the projector', () => {
    // The screen paints above the picture (z 3 > 2), so click-to-open stays on
    // the screen; the picture takes every click outside the viewer rect.
    expect(HOME).toMatch(/\.lantern-pic \{[^}]*z-index:\s*2/);
    expect(HOME).toMatch(/\.lantern-pic \{[^}]*cursor:\s*pointer/);
    expect(HOME).toMatch(/\.screen \{[^}]*z-index:\s*3/);
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
    expect(LANTERN).toMatch(
      /!reduce && \(i === current \|\| i === current \+ 1\) \? 'auto' : 'none'/,
    );
  });

  it('loads no clip at all under reduced motion (the poster is the slide)', () => {
    expect(LANTERN).toMatch(/if \(reduce \|\| paused \|\| document\.hidden\) return/);
    expect(LANTERN).toMatch(/!reduce && \(i === current/);
  });

  it('centres the title slide as a group and the caption along the bottom', () => {
    // .slide no longer lays out its children in rows, so the title slide's
    // mark, name and motto stay together in the middle of the screen.
    expect(HOME).toMatch(/\.slide \{[^}]*position:\s*absolute;[^}]*opacity:\s*0/);
    expect(HOME).not.toMatch(/\.slide \{[^}]*grid-template-rows/);
    expect(HOME).toMatch(/\.title-slide \{[^}]*align-content:\s*center/);
    // The caption is an overlay (mockup), not a row: `main p { max-width: 65ch }`
    // must not narrow it or push it off the screen.
    expect(HOME).toMatch(/\.caption \{[^}]*position:\s*absolute/);
    expect(HOME).toMatch(/\.caption \{[^}]*max-width:\s*none/);
    expect(HOME).toMatch(/\.caption \{[^}]*z-index:\s*4/);
    expect(HOME).toMatch(/\.slide video \{[^}]*object-fit:\s*contain/);
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
    // The projector itself is the pause control: id/role/tabindex/aria live on
    // the <picture>, and the standalone bench-foot button is gone.
    expect(HOME).toMatch(
      /<picture\s+class="lantern-pic"\s+id="lantern-pause"\s+role="button"\s+tabindex="0"\s+aria-pressed="false"/,
    );
    expect(HOME).toMatch(/aria-label=\{t\.home\.lantern\.pause\}/);
    expect(HOME).toMatch(/data-pause-label=\{t\.home\.lantern\.pause\}/);
    expect(HOME).toMatch(/data-resume-label=\{t\.home\.lantern\.resume\}/);
    expect(HOME).not.toMatch(/class="lantern-pause"/);
    expect(HOME).not.toMatch(/\.lantern-pause \{/);
    // Keyboard: Enter/Space toggle, and the paused plate follows aria-pressed.
    expect(LANTERN).toMatch(/pauseBtn\.addEventListener\('keydown'/);
    expect(LANTERN).toMatch(/key === 'Enter' \|\| \(ev as KeyboardEvent\)\.key === ' '/);
    expect(LANTERN).toMatch(/getElementById\('lantern-paused'\)/);
    // hidden is the force argument: it must come OFF while paused, so the
    // flag is negated (the inverse silently keeps the plate invisible).
    expect(LANTERN).toMatch(/toggleAttribute\('hidden', !paused\)/);
    expect(LANTERN).not.toMatch(/toggleAttribute\('hidden', paused\)/);
  });

  it('resumes the clip after a bfcache restore', () => {
    expect(LANTERN).toContain("document.addEventListener('visibilitychange', resume");
    expect(LANTERN).toMatch(/window\.addEventListener\('pageshow', resume\)/);
    expect(LANTERN).toMatch(/const resume = \(\): void => \{[\s\S]*?lastTurn = performance\.now\(\);[\s\S]*?playCurrent\(\);/);
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

describe('Home — tuning into an experiment', () => {
  it('zooms the source into the hero through a shared exp-<id> name', () => {
    expect(TUNE).toContain("source.style.setProperty('view-transition-name', `exp-${exp}`)");
    expect(TUNE).toContain("source.style.setProperty('view-transition-class', 'exp-zoom')");
    expect(TUNE).toMatch(/if \(window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\) \{\s*window\.location\.assign\(href\);\s*return;/);
    expect(GLOBAL).toMatch(/::view-transition-group\(\.exp-zoom\) \{\s*animation-duration: 420ms/);
    expect(GLOBAL).toContain('@keyframes tune-in');
    expect(GLOBAL).not.toContain('crt-');
    expect(GLOBAL).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  });

  it('navigates at once, with no static on the screen', () => {
    expect(TUNE).not.toContain('is-tuning');
    expect(TUNE).not.toContain('setTimeout');
    expect(LANTERN).not.toMatch(/snow|is-tuning/i);
  });

  it('clears the shared name on Back restore', () => {
    expect(HOME).toContain("addEventListener('pageshow', untune)");
    expect(TUNE).toContain("removeProperty('view-transition-name')");
    expect(LAYOUT).not.toContain('crt-restore');
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

describe('Home — Plate I world mode', () => {
  it('shares one lazy fondo map between the experiment pages and the lantern', () => {
    for (const id of ['texforge', 'canopy', 'gitkit', 'ghscaff', 'demostage', 'astro-denoise', 'quorum']) {
      expect(FONDOS_INDEX).toContain(id);
      expect(FONDOS_INDEX).toMatch(
        new RegExp(`['"]?${id.replace(/-/g, '-')}['"]?:\\s*\\(\\)\\s*=>\\s*import\\(`),
      );
    }
    // Both entry points use the shared map — neither inlines its own copy …
    expect(LIVE_BG).toContain('fondoLoaders');
    expect(LIVE_BG).toContain("from '../scripts/fondos/index'");
    expect(LANTERN).toContain('fondoLoaders');
    expect(LANTERN).toContain("from './fondos/index'");
    expect(LIVE_BG).not.toMatch(/=>\s*import\(['"]\.\.\/scripts\/fondos\//);
    // … and the lantern never embeds a world eagerly: no static fondo import,
    // no iframe — the module downloads only on the first hover over the screen.
    expect(LANTERN).not.toMatch(/import\(['"]\.\/fondos\//);
    expect(LANTERN).not.toContain('<iframe');
    expect(HOME).not.toContain('<iframe');
    expect(LANTERN).toMatch(/base:\s*`\/bench\/fondos\/\$\{id\}\/`/);
  });

  it('opens the screen with a world host, a typed block and a catcher', () => {
    expect(HOME).toMatch(/class="world-host" id="world-host"[^>]*aria-hidden="true"/);
    expect(HOME).toMatch(/<div class="typed" id="typed" aria-hidden="true">/);
    expect(HOME).toMatch(/data-typed="k".*data-typed="cmd".*data-typed="line"/s);
    expect(HOME).toMatch(/class="catch" id="catch"[^>]*aria-hidden="true"/);
    // The typed block is aria-hidden: each slide's caption keeps the
    // accessible text.
    expect(HOME).toMatch(/<p class="caption"><b>\{exp\.name\}<\/b>/);
    // Every experiment slide carries what the typing needs: tagline, bench
    // fallback and the localized world hint.
    expect(HOME).toContain('data-tagline={e.tagline}');
    expect(HOME).toContain('data-bench={bench}');
    expect(HOME).toMatch(/data-world-hint=\{t\.home\.lantern\.worldHint\[exp\.id\]\}/);
    // Each slide names the surface its world paints on: the modules draw over
    // their page's ground, so the host must carry it, not the lantern's paper.
    expect(HOME).toContain('data-surface={exp.surface}');
    expect(HOME).toMatch(/\.world-host \{[^}]*background:\s*var\(--surface-bg, var\(--bench-c-parchment\)\)/);
    // The ground shows the moment world mode opens — even before the module
    // paints (a dark world would otherwise flash parchment under its chalk
    // text on the first hover) — and never outside world mode.
    expect(HOME).toMatch(/\.screen:not\(\.is-world\) \.world-host \{[^}]*display:\s*none/);
    expect(LANTERN).toMatch(/worldHost\.dataset\.surface = surface/);
  });

  it('shrinks the clip to the lower right with the world blend modes', () => {
    expect(HOME).toMatch(/\.screen\.is-world \.slide\.is-on \{[^}]*transform:\s*translate\(27%, 20%\) scale\(\.48\)/);
    expect(HOME).toMatch(/mask-image:\s*radial-gradient\(ellipse 46% 46% at 50% 50%, #000 70%, transparent 100%\)/);
    expect(HOME).toMatch(/\.screen\.is-world\.on-light \.slide\.is-on \{[^}]*mix-blend-mode:\s*multiply/);
    expect(HOME).toMatch(/\.screen\.is-world\.on-dark \.slide\.is-on \{[^}]*filter:\s*invert\(1\) hue-rotate\(180deg\)[^}]*mix-blend-mode:\s*screen/);
    expect(HOME).toMatch(/transition:[^;]*transform 0?\.6s/);
    // The caption rides inside the shrinking slide; hide it visually so it
    // does not print over the machine, but keep it in the tree (opacity, not
    // visibility/display) because it holds the accessible text.
    expect(HOME).toMatch(/\.screen\.is-world \.slide\.is-on \.caption \{[^}]*opacity:\s*0/);
    // Stacking: the world host under the clip, the film over it, the typed
    // block above the film, the catcher on top.
    expect(HOME).toMatch(/\.world-host \{[^}]*z-index:\s*1/);
    expect(HOME).toMatch(/\.slide \{[^}]*z-index:\s*2/);
    expect(HOME).toMatch(/\.film \{[^}]*z-index:\s*3/);
    expect(HOME).toMatch(/\.typed \{[^}]*z-index:\s*4/);
    expect(HOME).toMatch(/\.catch \{[^}]*z-index:\s*5[^}]*cursor:\s*crosshair/);
  });

  it('types the freed corner in Sometype Mono with world ink', () => {
    expect(HOME).toMatch(/\.typed \{[^}]*font-family:\s*var\(--font-mono\)/);
    expect(HOME).toMatch(/\.typed \{[^}]*left:\s*4%[^}]*top:\s*6%[^}]*max-width:\s*74%/);
    // Phone-sized screens are narrow and short: the clamps shrink the three
    // lines so the command and tagline stay inside the screen.
    expect(HOME).toMatch(/\.typed \.k \{[^}]*font-size:\s*clamp\(9px, 1\.1vw, 11px\)/);
    expect(HOME).toMatch(/\.typed \.cmd \{[^}]*font-size:\s*clamp\(9px, 1\.3vw, 14px\)/);
    expect(HOME).toMatch(/\.typed \.line \{[^}]*font-size:\s*clamp\(12px, 1\.9vw, 16px\)/);
    expect(HOME).toMatch(/\.screen\.on-light \.typed \{[^}]*color:\s*#2a2118[^}]*radial-gradient/);
    expect(HOME).toMatch(/\.screen\.on-dark \.typed \{[^}]*color:\s*#ece4d4[^}]*radial-gradient/);
  });

  it('mounts on hover, types at 28 ms, and returns touch worlds after 12 s', () => {
    expect(LANTERN).toContain("catcher?.addEventListener('pointerenter'");
    expect(LANTERN).toContain("catcher?.addEventListener('pointerleave'");
    expect(LANTERN).toContain("catcher?.addEventListener('pointerdown'");
    expect(LANTERN).toMatch(/pointerType === 'mouse'/);
    expect(LANTERN).toMatch(/TYPE_MS = 28/);
    expect(LANTERN).toMatch(/WORLD_TOUCH_MS = 12000/);
    expect(LANTERN).toMatch(/now - lastTouch > WORLD_TOUCH_MS/);
    // The tap that opened the world leaves the catcher hovered on touch
    // screens, so the 12 s return must not wait for the hover to end.
    expect(LANTERN).not.toMatch(/WORLD_TOUCH_MS[^;]*matches\(':hover'\)/);
    // While a world is open the lantern does not cycle …
    expect(LANTERN).toMatch(/!inWorld && !document\.hidden/);
    // … leaving the screen destroys the world and clears the typing …
    expect(LANTERN).toContain('world.destroy()');
    expect(LANTERN).toMatch(/worldHost\.innerHTML = ''/);
    // A scroll can leave the cursor parked over the screen with no fresh
    // entry: the first move inside still opens the world.
    expect(LANTERN).toMatch(/catcher\?\.addEventListener\('pointermove'[\s\S]*?if \(!inWorld/);
    // … and the bench swaps worlds instead of stacking them.
    expect(LANTERN).toMatch(/mountWorld\(id\);\s*typeOut\(id\)/);
    // A module that finishes downloading after a leave/re-enter must not
    // mount a second world over the live one.
    expect(LANTERN).toContain('token !== worldToken');
    // A mouse taking over from a tap cancels the 12 s touch return, so the
    // world cannot close under a cursor still parked on the screen.
    expect(LANTERN).toMatch(/pointerenter'[\s\S]{0,300}lastTouch = 0/);
    expect(LANTERN).toMatch(/pointermove'[\s\S]{0,300}lastTouch = 0/);
    // Quorum follows the phase; every other world keeps its site colours,
    // and a live Quorum follows the phase without remounting.
    expect(LANTERN).toMatch(/id === 'quorum' \? root\.dataset\.benchTheme === 'night' : false/);
    expect(LANTERN).toMatch(/worldId === 'quorum'[\s\S]*?world\.setNight/);
    expect(LANTERN).toContain('LIGHT_WORLDS');
  });

  it('adds one world hint per experiment to both dictionaries', () => {
    for (const id of ['texforge', 'canopy', 'gitkit', 'ghscaff', 'demostage', 'astro-denoise', 'quorum'] as const) {
      expect(en.home.lantern.worldHint[id]).toBeTruthy();
      expect(es.home.lantern.worldHint[id]).toBeTruthy();
      expect(en.home.lantern.worldHint[id]).not.toBe(es.home.lantern.worldHint[id]);
    }
    expect(en.home.lantern.worldHint.texforge).toContain('ink roller');
    expect(es.home.lantern.worldHint.texforge).toContain('rodillo');
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
    expect(en.home.lantern.paused).toBe('Paused');
    expect(es.home.lantern.paused).toBe('En pausa');
    expect(en.home.lantern.paused).not.toBe(es.home.lantern.paused);
    expect(en.home.lantern.benchLabel).toContain('point at a machine');
    expect(es.home.lantern.benchLabel).toContain('apunta a una máquina');
    expect(en.home.lantern.alt).toContain('magic lantern');
    expect(es.home.lantern.alt).toContain('linterna mágica');
    expect(en.home.lantern.alt).not.toBe(es.home.lantern.alt);
  });

  it('shows a paused plate under the projector, hidden until paused', () => {
    // Hidden by default, absolutely positioned so the bench row never shifts.
    expect(HOME).toMatch(/<p class="lantern-paused" id="lantern-paused" hidden>/);
    expect(HOME).toContain('{t.home.lantern.paused}');
    expect(HOME).toMatch(/\.lantern-paused \{[^}]*position:\s*absolute/);
    expect(HOME).toMatch(/\.lantern-paused \{[^}]*z-index:\s*4/);
    // It sits inside the engraving's clean bottom strip: a large bottom offset
    // would put the word on the tripod base, whose pedestal post crosses it at
    // phone width; negative offsets would drift it onto the bench row.
    expect(HOME).toMatch(/\.lantern-paused \{[^}]*bottom:\s*0\.15rem/);
    expect(HOME).not.toMatch(/\.lantern-paused \{[^}]*bottom:\s*-/);
    expect(en.home.lantern.paused).toBe('Paused');
    expect(es.home.lantern.paused).toBe('En pausa');
  });

  it('keeps the former h1 as the About the lab heading', () => {
    expect(HOME).toMatch(/class="wrap section two-col about"[\s\S]*?<h2>\{t\.home\.hero\.title\}<\/h2>/);
    expect(en.home.hero.title).toContain('Open source for the AI era');
  });
});

describe('Home — clicking the screen opens the projected experiment', () => {
  const gesture = {
    currentExp: 'canopy',
    dx: 0,
    dy: 0,
    pointerType: 'mouse',
    worldOpen: true,
  };

  it('refuses the title slide: there is no experiment to open', () => {
    expect(shouldScreenNavigate({ ...gesture, currentExp: '' })).toBe(false);
  });

  it('draws the drag line at 6 px: 7 px never navigates, 6 px still does', () => {
    expect(SCREEN_DRAG_PX).toBe(6);
    expect(shouldScreenNavigate({ ...gesture, dx: 7 })).toBe(false);
    expect(shouldScreenNavigate({ ...gesture, dy: 7 })).toBe(false);
    // The threshold is on the travelled distance, not on each axis.
    expect(shouldScreenNavigate({ ...gesture, dx: 5, dy: 5 })).toBe(false);
    expect(shouldScreenNavigate({ ...gesture, dx: 6 })).toBe(true);
    expect(shouldScreenNavigate({ ...gesture, dy: -6 })).toBe(true);
  });

  it('keeps the touch first tap opening the world, and navigates the second', () => {
    expect(shouldScreenNavigate({ ...gesture, pointerType: 'touch', worldOpen: false })).toBe(
      false,
    );
    expect(shouldScreenNavigate({ ...gesture, pointerType: 'touch', worldOpen: true })).toBe(true);
    // A touch drag never navigates, open world or not.
    expect(
      shouldScreenNavigate({ ...gesture, pointerType: 'touch', worldOpen: true, dx: 7 }),
    ).toBe(false);
    // A mouse click navigates regardless of the world (hover opened it).
    expect(shouldScreenNavigate({ ...gesture, pointerType: 'mouse', worldOpen: false })).toBe(true);
  });

  it('publishes the projection on #screen and keeps the title slide empty', () => {
    expect(LANTERN).toMatch(
      /screen\.dataset\.currentExp = slides\[current\]\?\.dataset\.exp \?\? ''/,
    );
    // Shown on the first cut and initialised once before the first show().
    expect((LANTERN.match(/screen\.dataset\.currentExp = /g) ?? []).length).toBe(2);
    expect(HOME).toMatch(/dataset\.currentExp/);
  });

  it('wires the catcher click through the helper and the tuning', () => {
    expect(HOME).toContain('shouldScreenNavigate');
    expect(HOME).toMatch(/catcher\?\.addEventListener\('click'/);
    expect(HOME).toMatch(/dx: upX - downX/);
    expect(HOME).toMatch(/dy: upY - downY/);
    expect(HOME).toMatch(/pointerType: pointerKind/);
    expect(HOME).toMatch(/worldOpen: worldOpenAtDown/);
    expect(HOME).toMatch(/tuneNavigate\(href, currentExp, screen\)/);
    // The href is the localized path the matching plate already carries.
    expect(HOME).toMatch(/\.plate\[data-exp="\$\{currentExp\}"\]/);
    // The world state must be read before startLantern()'s own pointerdown
    // opens the world, or the first touch tap would navigate instead.
    const down = HOME.indexOf("catcher?.addEventListener('pointerdown'");
    const start = HOME.indexOf('startLantern()');
    expect(down).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(down);
    // The four existing lantern handlers stay put, in lantern.ts.
    expect(LANTERN).toContain("catcher?.addEventListener('pointerenter'");
    expect(LANTERN).toContain("catcher?.addEventListener('pointermove'");
    expect(LANTERN).toContain("catcher?.addEventListener('pointerleave'");
    expect(LANTERN).toContain("catcher?.addEventListener('pointerdown'");
  });

  it('affords the click: pointer cursor while projected, crosshair on the title', () => {
    expect(HOME).toMatch(/\.catch \{[^}]*cursor:\s*crosshair/);
    expect(HOME).toMatch(
      /\.screen\[data-current-exp\]:not\(\[data-current-exp=''\]\) \.catch \{[^}]*cursor:\s*pointer/,
    );
  });

  it('stays aria-hidden and out of the tab order (plates are the keyboard path)', () => {
    expect(HOME).toMatch(/id="screen"[\s\S]{0,400}?aria-hidden="true"/);
    expect(HOME).toMatch(/class="catch" id="catch"[^>]*aria-hidden="true"/);
    expect(HOME).not.toMatch(/id="screen"[^>]*tabindex/i);
    expect(HOME).not.toMatch(/id="catch"[^>]*tabindex/i);
  });

  it('appends the open hint to the world hint while a world is open', () => {
    expect(HOME).toContain('data-open-hint={t.home.lantern.open}');
    expect(LANTERN).toMatch(
      /\(slide\?\.dataset\.worldHint \?\? hintText\) \+\s*\(hint\.dataset\.openHint/,
    );
    // Leaving the world restores the plain bench label.
    expect(LANTERN).toMatch(/if \(hint\) hint\.textContent = hintText;/);
    expect(en.home.lantern.open).toContain('click the screen to open it');
    expect(es.home.lantern.open).toContain('haz clic en la pantalla para abrirlo');
    expect(en.home.lantern.open).not.toBe(es.home.lantern.open);
  });
});
