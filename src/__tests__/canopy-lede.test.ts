import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

describe('canopy lede', () => {
  it('the lede says what Canopy is for in both languages', () => {
    expect(en.experiments.canopy.lede.startsWith('AI coding agents write code nobody is watching.')).toBe(true);
    expect(en.experiments.canopy.lede).not.toContain('daemon');
    expect(es.experiments.canopy.lede.startsWith('Los agentes de IA escriben código')).toBe(true);
    expect(es.experiments.canopy.lede).not.toContain('daemon');
  });

  it('how it is built moved to its own key', () => {
    expect(en.experiments.canopy.how).toContain('graph engine');
    expect(en.experiments.canopy.how).toContain('<strong>');
    expect(es.experiments.canopy.how).toContain('motor de grafos');
    expect(es.experiments.canopy.how).toContain('<strong>');
  });

  it('the page prints how after the hero', () => {
    const text = readFileSync(resolve(process.cwd(), 'src/views/experiments/Canopy.astro'), 'utf8');
    const slot = text.indexOf('slot="before-genesis"');
    const how = text.indexOf('set:html={e.how}');
    const kicker = text.indexOf('class="mono-kicker"');
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(how).toBeGreaterThan(slot);
    expect(kicker).toBeGreaterThan(how);
  });
});
