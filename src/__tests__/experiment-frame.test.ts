/**
 * Experiment frame (lab strip, caption block, terminal bench, floating machine)
 * and DemoStage's removals — source guards plus i18n keys. No network.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const LAYOUT = resolve(__dirname, '../layouts/ExperimentLayout.astro');
const DEMO_STAGE = resolve(__dirname, '../views/experiments/DemoStage.astro');

const layout = readFileSync(LAYOUT, 'utf8');
const demoStage = readFileSync(DEMO_STAGE, 'utf8');

describe('experiment frame: lab strip', () => {
  it('is the first child of .exp, before the hero', () => {
    const exp = layout.indexOf('<div class="exp"');
    const strip = layout.indexOf('<p class="lab-strip">');
    const hero = layout.indexOf('<section class="wrap hero"');
    expect(exp).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(exp);
    // Nothing but the .exp opening tag sits between the wrapper and the strip.
    expect(layout.slice(exp, strip)).toMatch(/^<div class="exp"[^\n]*>\s*$/);
    expect(strip).toBeLessThan(hero);
  });

  it('links to the localized home and shows the experiment number', () => {
    expect(layout).toMatch(/<a href=\{localizePath\('\/', lang\)\}>\{t\.labStrip\.lab\}<\/a>/);
    expect(layout).toMatch(/<span>\{exp\.number\}<\/span>/);
  });
});

describe('experiment frame: caption block', () => {
  it('drops the built-with paragraph and its styles', () => {
    expect(layout).not.toContain('built-with');
  });

  it('keeps LabPlate inside the hero, after the koan', () => {
    const hero = layout.indexOf('<section class="wrap hero"');
    const koan = layout.indexOf('<p class="koan">');
    const plate = layout.indexOf('<LabPlate');
    expect(plate).toBeGreaterThan(koan);
    expect(koan).toBeGreaterThan(hero);
  });
});

describe('experiment frame: terminal bench', () => {
  it('renders exactly one Banner, inside the install panel', () => {
    expect(layout.match(/<Banner\b/g) ?? []).toHaveLength(1);
    const install = layout.indexOf("class={id === 'quorum' ? 'install term' : 'install'}");
    const banner = layout.indexOf('<Banner');
    const close = layout.indexOf('</div>', banner);
    expect(install).toBeGreaterThan(-1);
    expect(banner).toBeGreaterThan(install);
    expect(banner).toBeLessThan(close);
  });

  it('gives the astro-denoise panel its research state and no banner', () => {
    expect(layout).toContain("t.experiments['astro-denoise'].bench");
  });

  it('shows Quorum a table link instead of an install command', () => {
    expect(layout).toContain('{t.experiments.quorum.bench}');
    expect(layout).toContain('href="https://quorum.univerlab.org"');
  });
});

describe('experiment frame: floating machine', () => {
  it('renders the engraved plate through the Machine component', () => {
    expect(layout).toContain('<Machine');
    expect(layout).toContain('machineInk(exp)');
    expect(layout).toContain('class="hero-machine"');
    expect(layout).toContain('height="240px"');
  });

  it('renders no plate for archived pages', () => {
    expect(layout).toContain("exp.status !== 'archived'");
  });

  it('drops the clip, its recolouring and its play-on-visible script', () => {
    expect(layout).not.toContain('<video');
    expect(layout).not.toContain('/bench/clips/${id}.mp4');
    expect(layout).not.toContain('mix-blend-mode');
    expect(layout).not.toContain('invert(100%)');
    expect(layout).not.toContain('new IntersectionObserver');
    expect(layout).not.toContain('io.observe(hero)');
    expect(layout).not.toContain('v.preload');
  });

  it('sits beside the hero, not inside it, with room kept at the frame foot', () => {
    // The hero carries a view-transition-name, making it an isolated group:
    // the plate stays a sibling so it never blends against a transparent hero.
    const frame = layout.indexOf('hero-frame');
    const section = layout.indexOf('<section class="wrap hero"');
    const sectionEnd = layout.indexOf('</section>', section);
    const machine = layout.indexOf('<Machine');
    expect(frame).toBeGreaterThan(-1);
    expect(section).toBeGreaterThan(frame);
    expect(machine).toBeGreaterThan(sectionEnd);
    expect(layout).toContain('.hero-frame { position: relative; }');
    expect(layout).toContain('has-machine');
    expect(layout).toContain('padding-bottom: calc(240px + 2.5rem)');
  });

  it('floats the plate lower-right on wide screens, static on phones', () => {
    expect(layout).toContain(':global(.hero-machine)');
    expect(layout).toContain('right: var(--page-gutter)');
    expect(layout).toContain('bottom: 1.5rem');
    const phone = layout.slice(layout.indexOf('@media (max-width: 39.999rem)'));
    expect(phone).toContain('position: static');
    expect(phone).toContain('margin-bottom: 1.5rem');
  });
});

describe('DemoStage removals', () => {
  it('drops the fake player, the spectrum bars and the demo-player CTA', () => {
    expect(demoStage).not.toContain('demo-player');
    expect(demoStage).not.toContain('spectrum');
    expect(demoStage).not.toContain('slot="cta"');
    expect(demoStage).not.toContain('scrubber');
  });

  it('keeps the real demo figure and the SVG figure', () => {
    expect(demoStage).toContain('<DemoFigure');
    expect(demoStage).toContain('/demos/demostage.svg');
  });
});

describe('i18n keys exist in both languages', () => {
  it('has the lab strip and bench strings', () => {
    expect(en.labStrip.lab).toBe('UniverLab · open laboratory');
    expect(es.labStrip.lab).toBe('UniverLab · laboratorio abierto');
    expect(en.experiments.quorum.bench).toBe('open the table → quorum.univerlab.org');
    expect(es.experiments.quorum.bench).toBe('abre la mesa → quorum.univerlab.org');
    expect(en.experiments['astro-denoise'].bench).toBe('status: research · thesis in progress');
    expect(es.experiments['astro-denoise'].bench).toBe('estado: investigación · tesis en curso');
  });
});
