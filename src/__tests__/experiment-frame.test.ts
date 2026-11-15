/**
 * Experiment frame (lab strip, caption block, terminal bench) and
 * DemoStage's removals — source guards plus i18n keys. No network.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const LAYOUT = resolve(__dirname, '../layouts/ExperimentLayout.astro');
const DEMO_STAGE = resolve(__dirname, '../views/experiments/DemoStage.astro');
const EXPERIMENTS = resolve(__dirname, '../lib/experiments.ts');

const layout = readFileSync(LAYOUT, 'utf8');
const demoStage = readFileSync(DEMO_STAGE, 'utf8');
const experiments = readFileSync(EXPERIMENTS, 'utf8');

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

  it('keeps LabPlate after the koan', () => {
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
    const install = layout.indexOf('<div class="install"');
    const banner = layout.indexOf('<Banner');
    expect(install).toBeGreaterThan(-1);
    expect(banner).toBeGreaterThan(install);
  });

  it('gates the panel on exp.install alone', () => {
    expect(layout).toContain('{exp.install && (');
    expect(layout).not.toContain('install term');
    expect(layout).not.toContain('bench-text');
    expect(layout).not.toContain("t.experiments['astro-denoise']");
  });

  it('renders no .install on /quorum/ or /astro-denoise/ — neither record ships an install', () => {
    // The gate alone would still render a panel if the data grew an install:
    // this is the data half of the contract (source guard, no build needed).
    const record = (id: string) => experiments.split('\n').find((l) => l.includes(`{ id: '${id}'`));
    for (const id of ['quorum', 'astro-denoise']) {
      const line = record(id);
      expect(line).toBeDefined();
      expect(line).not.toMatch(/\binstall\s*:/);
    }
    // … while the install pages keep theirs.
    for (const id of ['canopy', 'gitkit', 'ghscaff', 'demostage']) {
      expect(record(id)).toMatch(/\binstall\s*:/);
    }
  });

  it('shows Quorum a table link in the koan line instead of an install panel', () => {
    const koan = layout.indexOf('<p class="koan">');
    const gate = layout.indexOf('{exp.install && (');
    const href = layout.indexOf('href="https://quorum.univerlab.org"');
    expect(koan).toBeGreaterThan(-1);
    expect(href).toBeGreaterThan(koan);
    expect(href).toBeLessThan(gate);
    expect(layout.slice(koan, gate)).toContain('{t.experiments.quorum.bench}');
  });
});

describe('experiment frame: no floating machine', () => {
  it('has no floating-machine markup, classes or rules', () => {
    expect(layout).not.toContain('hero-machine');
    expect(layout).not.toContain('has-machine');
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
  });
});
