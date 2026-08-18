/**
 * Per-experiment OG card data — read directly from the source of truth.
 *
 * Accent colours and experiment names come from src/lib/experiments.ts;
 * taglines come from src/i18n/en.ts.  This file builds the BANNERS array
 * those two sources so the build script can import plain JS without a
 * TypeScript toolchain.  To add a ninth experiment: add its entry to
 * experiments.ts and en.ts, then re-run the generator — no edits here.
 *
 * Requires Node ≥ 24 with --experimental-strip-types (see build-og.mjs).
 */
import { experiments } from '../../src/lib/experiments.ts';
import { en } from '../../src/i18n/en.ts';

export const BANNERS = experiments.map((exp) => ({
  id: exp.id,
  name: exp.name,
  number: exp.number,
  accent: exp.essenceHex,
  tagline: en.experiments[exp.id].tagline,
}));
