/**
 * Per-experiment OG card data — read directly from the source of truth.
 *
 * Experiment names and numbers come from src/lib/experiments.ts; taglines
 * come from src/i18n/en.ts; status labels come from en.status. This file
 * builds the BANNERS array from those three sources so the build script can
 * import plain JS without a TypeScript toolchain. To add a tenth experiment:
 * add its entry to experiments.ts and en.ts, then re-run the generator —
 * no edits here.
 *
 * Requires Node ≥ 24 with --experimental-strip-types (see build-og.mjs).
 */
import { experiments } from '../../src/lib/experiments.ts';
import { en } from '../../src/i18n/en.ts';
import { getTagline } from '../../src/lib/github-sync.ts';

export const BANNERS = experiments.map((exp) => ({
  id: exp.id,
  name: exp.name,
  number: exp.number,
  tagline: getTagline(en, exp.id),
  status: exp.status,
  statusLabel: en.status[exp.status],
}));
