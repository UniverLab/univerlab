/**
 * PAL1 guard — one essence color per experiment, declared once in
 * src/lib/experiments.ts and used by every surface.
 *
 * Fails when:
 *  1. a `--surface-essence:` declaration appears under src/styles
 *     (the tokens are emitted by EssenceTokens.astro, never by hand);
 *  2. a retired essence literal appears anywhere under src/ or scripts/;
 *  3. an experiment's `essenceTextHex` is below 4.5:1 against its own
 *     `--surface-bg` (parsed from global.css the way scripts/og/banners.mjs
 *     reads it — same regex, same merge);
 *  4. an experiment's `essenceHex` is below 4.5:1 against the home
 *     background `--bg` (#0a0b0e).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { experiments } from '../lib/experiments';

const ROOT = resolve(__dirname, '..', '..');
const GLOBAL_CSS = resolve(__dirname, '..', 'styles', 'global.css');

/** Walk a directory, yielding every file path (skipping node_modules). */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

/** Relative luminance of a #rrggbb colour (WCAG). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `--surface-*` tokens per `[data-surface='X']` group — the same regex and
 *  merge that scripts/og/banners.mjs#readSurfaces uses. */
function readSurfaces(): Record<string, Record<string, string>> {
  const css = readFileSync(GLOBAL_CSS, 'utf8');
  const surfaces: Record<string, Record<string, string>> = {};
  for (const [, name, block] of css.matchAll(/\[data-surface='([a-z-]+)'\][^{]*\{([^}]*)\}/g)) {
    const tokens = Object.fromEntries(
      [...block.matchAll(/--surface-([a-z-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]),
    );
    surfaces[name] = { ...surfaces[name], ...tokens };
  }
  return surfaces;
}

// Retired essence literals. Built from parts so this file itself never
// contains one contiguously (the retired-literal scan covers src/ too).
const RETIRED = [
  '6d28d9',
  '862fe7',
  '8b7cf6',
  '5d2a1a',
  '6a563e',
  'e8a4c8',
  'b87333',
  'ef8354',
  '5dd39e',
  'e0a458',
].map((h) => '#' + h);

describe('essence single source', () => {
  it('declares no --surface-essence in src/styles/**/*.css', () => {
    const offenders: string[] = [];
    for (const file of walk(resolve(ROOT, 'src', 'styles'))) {
      if (!file.endsWith('.css')) continue;
      if (readFileSync(file, 'utf8').includes('--surface-essence:')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps no retired essence literal under src/ or scripts/', () => {
    const offenders: string[] = [];
    for (const dir of [resolve(ROOT, 'src'), resolve(ROOT, 'scripts')]) {
      for (const file of walk(dir)) {
        const lower = readFileSync(file, 'utf8').toLowerCase();
        if (RETIRED.some((hex) => lower.includes(hex))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('holds every essenceTextHex at >= 4.5:1 against its own --surface-bg', () => {
    const surfaces = readSurfaces();
    for (const exp of experiments) {
      if (!exp.essenceTextHex) continue;
      const bg = surfaces[exp.surface ?? '']?.['bg'];
      expect(bg).toBeTruthy();
      expect(contrast(exp.essenceTextHex, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('holds every essenceHex at >= 4.5:1 against the home background', () => {
    for (const exp of experiments) {
      expect(contrast(exp.essenceHex, '#0a0b0e')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('emits one EssenceTokens rule per experiment surface', () => {
    // EssenceTokens.astro builds one bare-selector rule per experiment from
    // the registry (dynamic template, so assert the template + the data).
    const src = readFileSync(
      resolve(ROOT, 'src', 'components', 'EssenceTokens.astro'),
      'utf8',
    );
    expect(src).toMatch(/from '\.\.\/lib\/experiments'/);
    expect(src).toContain('[data-surface=');
    expect(src).toContain('[data-flip-surface=');
    expect(src).toContain('exp.surface');
    expect(src).toContain('exp.essenceHex');
    expect(src).toContain('exp.essenceTextHex');
    for (const exp of experiments) {
      expect(exp.surface).toBeTruthy();
      expect(exp.essenceHex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
