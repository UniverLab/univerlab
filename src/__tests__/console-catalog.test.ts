/**
 * The console redesign (spec: "turn the command palette into a catalog card
 * and the notices into taped slips, and retire the flight log").
 *
 * Two halves:
 *  1. The retired pieces stay retired — the flight log, its footer bar and
 *     storage key, the two forced-hour palettes and the roadmap's old link
 *     key leave no trace under src (the needles below are composed at
 *     runtime precisely so this file itself cannot trip the grep).
 *  2. The new contracts hold — the catalog card's markup and tokens, the
 *     pointing hand on the selection, the taped slips (tips, hints, the 42
 *     answer), the three theme grounds, and the i18n strings both languages
 *     carry.
 *
 * Astro components aren't renderable in Jest, so these check the
 * source-level contract, the same way bench-ground.test.ts does.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const ROOT = resolve(__dirname, '../..');
const SRC = resolve(__dirname, '..');
const LAYOUT = readFileSync(resolve(SRC, 'layouts', 'BaseLayout.astro'), 'utf8');
const GLOBAL = readFileSync(resolve(SRC, 'styles', 'global.css'), 'utf8');
const TOKENS = readFileSync(resolve(SRC, 'styles', 'bench-tokens.css'), 'utf8');
const FOOTER = readFileSync(resolve(SRC, 'components', 'Footer.astro'), 'utf8');
const GHOST = readFileSync(resolve(SRC, 'components', 'GhostHint.astro'), 'utf8');
const STATUS = readFileSync(resolve(SRC, 'pages', 'status.astro'), 'utf8');

/** Every source file under src (excluding the tests themselves). */
function srcFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__') continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...srcFiles(p));
    else if (/\.(ts|astro|css)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = srcFiles(SRC);
const read = (p: string) => readFileSync(p, 'utf8');
const hitsOf = (needle: string) => files.filter((p) => read(p).includes(needle));

// The retired names, composed so this file never matches its own grep.
const RETIRED = [
  'mission' + 'Log',
  'flight' + 'Log',
  'flight' + '-bar',
  'golden' + '-hour',
  'blue' + '-hour',
  'mission' + 'LogLink',
];
const OLD_STORE = 'univerlab-' + 'flight-log';
const OLD_DAY = 'univerlab-day-' + 'palette';
const OLD_NIGHT = 'univerlab-night-' + 'palette';

describe('the retired console pieces leave no trace under src', () => {
  it.each(RETIRED)('%s appears in no source file', (needle) => {
    expect(hitsOf(needle)).toEqual([]);
  });

  it('clears the old flight-log storage exactly once, inside try/catch', () => {
    const hits = hitsOf(OLD_STORE);
    expect(hits.length).toBe(1);
    expect(hits[0]).toContain('BaseLayout.astro');
    const s = read(hits[0]);
    const cleanup = new RegExp(
      "try \\{\\s*localStorage\\.removeItem\\('" + OLD_DAY + "'\\);\\s*" +
      "localStorage\\.removeItem\\('" + OLD_NIGHT + "'\\);\\s*" +
      "localStorage\\.removeItem\\('" + OLD_STORE + "'\\);\\s*\\} catch \\(e\\) \\{\\}",
    );
    expect(s).toMatch(cleanup);
  });

  it('removes the two old palette keys the same one time', () => {
    expect(hitsOf(OLD_DAY).length).toBe(1);
    expect(hitsOf(OLD_NIGHT).length).toBe(1);
  });

  it('the footer privacy line forgets the log and comes from the dictionary', () => {
    expect(FOOTER).toContain('{t.footer.privacy}');
    expect(FOOTER).not.toMatch(/no external tracking/);
  });

  it('the roadmap links through the renamed status feed key', () => {
    const roadmap = read(resolve(SRC, 'pages', 'roadmap.astro'));
    expect(roadmap).toContain('rmStrings.statusFeedLink');
  });
});

describe('the catalog card', () => {
  it('builds the palette from the mockup hooks', () => {
    expect(LAYOUT).toContain("overlay.className = 'palette'");
    expect(LAYOUT).toContain('<span class="slash">/</span>');
    expect(LAYOUT).toContain('<span class="drawer"></span>');
    expect(LAYOUT).toContain('<ul class="cmd-list" role="listbox"></ul>');
    expect(LAYOUT).toContain('<div class="foot"><span class="keys"></span><span class="esc"></span></div>');
  });

  it('renders the pointing hand in the margin and underlines the selection in garnet', () => {
    expect(LAYOUT).toContain('<span class="cmd-hand">☞</span>');
    expect(GLOBAL).toMatch(/\.cmd-item\[aria-selected='true'\] \.cmd-hand\s*\{[^}]*visibility:\s*visible/);
    expect(GLOBAL).toMatch(/\.cmd-item\[aria-selected='true'\] \.cmd-cmd\s*\{[^}]*text-decoration:\s*underline 1\.5px var\(--bench-card-head\)/);
  });

  it('dresses the card from the bench card tokens: cream stock, rules, punched hole, z300', () => {
    expect(GLOBAL).toMatch(/#cmd-palette \{[^}]*color: var\(--bench-card-ink\)/s);
    expect(GLOBAL).toMatch(/#cmd-palette \{[^}]*var\(--bench-card-rule\)/s);
    expect(GLOBAL).toMatch(/#cmd-palette \{[^}]*mask: radial-gradient/s);
    expect(GLOBAL).toMatch(/#cmd-palette \{[^}]*z-index: 300/s);
    // The card slides up from the bottom and back down on close; the open
    // state keeps the card in place (fill: forwards) instead of snapping
    // back under the fold once the 0.3s slide ends.
    expect(GLOBAL).toMatch(/@keyframes palette-up\s*\{[\s\S]*?translateY\(115%\)/);
    expect(GLOBAL).toMatch(/@keyframes palette-down\s*\{[\s\S]*?translateY\(120%\)/);
    expect(GLOBAL).toMatch(/#cmd-palette\.open \{ display: block; animation: palette-up 0\.3s [^;]* forwards;/);
    expect(GLOBAL).toMatch(/#cmd-palette\.open \{ animation: none; transform: translateX\(-50%\) translateY\(0\); \}/);
  });

  it('gives the card tokens a day and a night value', () => {
    expect(TOKENS).toMatch(/:root \{[^}]*--bench-card: #fbf6ea/s);
    expect(TOKENS).toMatch(/\[data-bench-theme='night'\] \{[^}]*--bench-card: #e6decb/s);
    expect(TOKENS).toMatch(/--bench-tape: rgb\(236 226 196 \/ 0\.72\)/);
    expect(TOKENS).toMatch(/--bench-tape: rgb\(214 204 176 \/ 0\.7\)/);
  });

  it('keeps the mono input on the header line with a garnet caret', () => {
    expect(GLOBAL).toMatch(/#cmd-palette \.head input \{[^}]*caret-color: var\(--bench-card-head\)/s);
    expect(GLOBAL).toMatch(/#cmd-palette \.head \{[^}]*font-family: var\(--font-mono\)/s);
    expect(GLOBAL).toMatch(/\.cmd-item \.cmd-label \{[^}]*font-family: var\(--font-body\);\s*font-style: italic/s);
  });

  it('reads its strings from the inlined JSON, never from literals', () => {
    expect(LAYOUT).toContain('<script is:inline type="application/json" id="console-strings"');
    expect(LAYOUT).toMatch(/JSON\.parse\(document\.getElementById\('console-strings'\)\.textContent\)/);
  });

  it('offers exactly the three grounds, in order', () => {
    const m = LAYOUT.match(/function getThemeCmds[\s\S]*?\n {8}\}/);
    expect(m).not.toBeNull();
    const body = m![0];
    const cmds = body.match(/cmd: '\w+'/g) ?? [];
    expect(cmds).toEqual(["cmd: 'circadian'", "cmd: 'papyrus'", "cmd: 'slate'"]);
    // The stored day/night values keep working as Papyrus/Slate.
    expect(body).toContain("t === 'day' ? 'papyrus' : 'slate'");
  });

  it('forces only the base day and night grounds in applyTheme', () => {
    const apply = LAYOUT.slice(LAYOUT.indexOf('window.applyTheme=function(mode)'));
    expect(apply).toContain('ap(DG)');
    expect(apply).toContain('ap(NS)');
    expect(apply).toContain("document.documentElement.dataset.celestial='sun';document.documentElement.dataset.benchTheme='day';");
    expect(apply).toContain("document.documentElement.dataset.celestial='moon';document.documentElement.dataset.benchTheme='night';");
  });

  it('the scrub readout names the phases, not the retired palettes', () => {
    expect(LAYOUT).toContain("name:'Twilight'");
    expect(LAYOUT).toContain("name:'Day'");
    expect(LAYOUT).toContain("name:hour<12?'Dawn':'Dusk'");
    expect(LAYOUT).not.toContain("name:'Gold'");
    expect(LAYOUT).not.toContain("name:'Warm'");
    expect(LAYOUT).not.toContain("name:'Blue'");
    expect(LAYOUT).not.toContain("name:'Silver'");
  });
});

describe('the taped slips', () => {
  it('styles paper, tape and tilt from the mockup', () => {
    expect(GLOBAL).toMatch(/\.slip \{[^}]*#f3ead6/s);
    expect(GLOBAL).toMatch(/\.slip::before, \.slip::after \{[^}]*background: var\(--bench-tape\)/s);
    expect(GLOBAL).toMatch(/\.slip\.tip \{[^}]*rotate\(-1\.2deg\)/s);
    expect(GLOBAL).toMatch(/\.slip \{[^}]*z-index: 320/s);
  });

  it('the 42 egg arrives as a centred answer slip with the guide line', () => {
    expect(LAYOUT).toContain("slip('answer', '<b>42</b>' + S.answer + '<i>' + S.guide + '</i>', 6000)");
    expect(GLOBAL).toMatch(/\.slip\.answer b \{[^}]*font-family: var\(--font-serif\);\s*font-weight: 400;\s*font-size: 76px/s);
    expect(GLOBAL).toMatch(/\.slip\.answer i \{[^}]*font-family: var\(--font-mono\)/s);
    // The dark gold toast and its backdrop are gone with it.
    expect(LAYOUT).not.toContain('gl-toast');
    expect(GLOBAL).not.toContain('gl-toast');
    expect(STATUS).not.toContain('gl-toast');
  });

  it('the /tip command tapes up a tip slip, one at a time', () => {
    expect(LAYOUT).toContain("slip('tip', msg, 5000)");
    expect(LAYOUT).toContain("querySelectorAll('.slip.' + cls)");
  });

  it('ghost hints are slips too, with a small drop and a click to dismiss', () => {
    expect(GHOST).toContain('<div class="slip tip" id="ghost-hint"');
    expect(GHOST).toContain("classList.add('slip--visible')");
    expect(GHOST).toContain('translate: 0 14px');
    expect(GHOST).toContain("el.classList.remove('slip--visible')");
    expect(GHOST).not.toContain('ghost-hint--visible');
  });

  it('the status page announces new entries as a slip', () => {
    expect(STATUS).toContain("el.className = 'slip tip notice'");
    expect(STATUS).toContain("slipNotice('New entry: ' + title)");
  });
});

describe('i18n — the console dictionary in both languages', () => {
  it('en and es carry the same console keys, theme keys included', () => {
    expect(Object.keys(en.console).sort()).toEqual(Object.keys(es.console).sort());
    expect(Object.keys(en.console.theme).sort()).toEqual(Object.keys(es.console.theme).sort());
  });

  it('the three theme names are English in both languages', () => {
    expect(en.console.theme).toEqual({ circadian: 'Circadian', papyrus: 'Papyrus', slate: 'Slate' });
    expect(es.console.theme).toEqual({ circadian: 'Circadian', papyrus: 'Papyrus', slate: 'Slate' });
  });

  it('the card drawer keeps the fichero label in both languages', () => {
    expect(en.console.drawer).toBe('fichero · univerlab');
    expect(es.console.drawer).toBe('fichero · univerlab');
    expect(en.console.themeDrawer).toBe('ficha 2 · temas');
    expect(es.console.themeDrawer).toBe('ficha 2 · temas');
  });

  it('the foot line reads per FR1 in each language', () => {
    expect(en.console.keys).toBe('Tab completes · ↑↓ moves · Enter');
    expect(en.console.esc).toBe('Esc puts it back');
    expect(es.console.keys).toBe('Tab completa · ↑↓ recorre · Enter');
    expect(es.console.esc).toBe('Esc guarda');
  });

  it('the 42 answer and the guide line match the spec verbatim', () => {
    expect(en.console.answer).toBe('The Answer to the Ultimate Question of Life, the Universe, and Everything.');
    expect(es.console.answer).toBe('La Respuesta a la Pregunta Fundamental de la Vida, el Universo y Todo lo Demás.');
    expect(en.console.guide).toBe("The Hitchhiker's Guide to the Galaxy");
    expect(es.console.guide).toBe('Guía del autoestopista galáctico');
  });

  it('the footer privacy line matches the spec verbatim', () => {
    expect(en.footer.privacy).toBe("no external tracking. theme preferences stay in your browser's local storage.");
    expect(es.footer.privacy).toBe('sin rastreo externo. tus preferencias de tema se quedan en el almacenamiento local de tu navegador.');
  });

  it('the README names the three themes in the /theme help line', () => {
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
    expect(readme).toContain('/theme` → Circadian, Papyrus, Slate.');
  });
});
