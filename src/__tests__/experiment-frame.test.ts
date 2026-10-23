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
  it('lazy-loads the lantern clip only when the hero is visible', () => {
    expect(layout).toContain('class="hero-machine"');
    expect(layout).toContain('preload="none"');
    expect(layout).toContain('src={`/bench/clips/${id}.mp4`}');
    expect(layout).toContain("v.preload = 'auto'");
    expect(layout).toContain("io.observe(hero)");
    expect(layout).toContain('new IntersectionObserver');
  });

  it('stays a poster under reduced motion and renders no clip for archived pages', () => {
    expect(layout).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(layout).toContain("exp.status !== 'archived'");
  });

  it('uses multiply over light surfaces and screen with inversion over dark ones', () => {
    expect(layout).toContain('mix-blend-mode: multiply');
    expect(layout).toContain('mix-blend-mode: screen');
    expect(layout).toContain('filter: invert(100%) hue-rotate(180deg)');
    // Quorum is the only surface whose day phase counts as light.
    expect(layout).toContain("html[data-surface='quorum'][data-bench-theme='day'] .hero-machine");
    expect(layout).not.toContain(":root[data-bench-theme='day'] .hero-machine");
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
