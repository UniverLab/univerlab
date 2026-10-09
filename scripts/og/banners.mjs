/**
 * Per-experiment OG card data — read directly from the source of truth.
 *
 * Experiment names, numbers, surfaces and accents come from
 * src/lib/experiments.ts; taglines come from src/i18n/en.ts; each card's
 * remaining palette (bg/ink/ink-dim/ink-faint) is the experiment's own
 * surface token group in src/styles/global.css (the colours its page paints
 * with). The accent is `essenceTextHex ?? essenceHex` from the registry —
 * each card is drawn on its page background, so text-safe ink is what reads.
 * This file builds the BANNERS array from those three sources so the build
 * script can import plain JS without a TypeScript toolchain. To add a ninth
 * experiment: add its entry to experiments.ts and en.ts and its surface
 * group to global.css, then re-run the generator — no edits here.
 *
 * Requires Node ≥ 24 with --experimental-strip-types (see build-og.mjs).
 */
import { readFileSync } from 'node:fs';
import { experiments } from '../../src/lib/experiments.ts';
import { en } from '../../src/i18n/en.ts';
import { getTagline } from '../../src/lib/github-sync.ts';

const GLOBAL_CSS = new URL('../../src/styles/global.css', import.meta.url);
const PALETTE_KEYS = ['bg', 'ink', 'ink-dim', 'ink-faint'];

/** `--surface-*` tokens of every `[data-surface='X']` group in global.css. */
function readSurfaces() {
  const css = readFileSync(GLOBAL_CSS, 'utf8');
  const surfaces = {};
  for (const [, name, block] of css.matchAll(/\[data-surface='([a-z-]+)'\][^{]*\{([^}]*)\}/g)) {
    const tokens = Object.fromEntries(
      [...block.matchAll(/--surface-([a-z-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
    // A surface also has page-only blocks further down; merge, never overwrite.
    surfaces[name] = { ...surfaces[name], ...tokens };
  }
  return surfaces;
}

/** The card palette for one surface; fails loudly when a token is missing. */
function paletteFor(surfaces, exp) {
  const tokens = surfaces[exp.surface];
  if (!tokens) throw new Error(`og: no [data-surface='${exp.surface}'] group in global.css for ${exp.id}`);
  const missing = PALETTE_KEYS.filter((k) => !tokens[k]);
  if (missing.length) throw new Error(`og: surface '${exp.surface}' (${exp.id}) lacks --surface-${missing.join(', --surface-')}`);
  return {
    accent: exp.essenceTextHex ?? exp.essenceHex,
    bg: tokens.bg,
    ink: tokens.ink,
    inkDim: tokens['ink-dim'],
    inkFaint: tokens['ink-faint'],
  };
}

const surfaces = readSurfaces();

export const BANNERS = experiments.map((exp) => ({
  id: exp.id,
  name: exp.name,
  number: exp.number,
  palette: paletteFor(surfaces, exp),
  tagline: getTagline(en, exp.id),
  status: exp.status,
  // '@i18n' marks a motif that lives in the locale files, not a literal glyph line.
  motif: exp.motif && exp.motif !== '@i18n' ? exp.motif : '',
}));
