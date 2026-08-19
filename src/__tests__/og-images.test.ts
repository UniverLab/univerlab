/**
 * Tests for OG images — every experiment has a generated card on disk.
 *
 * This is the safety net that catches a new experiment added to
 * experiments.ts without re-running scripts/og/build-og.mjs.
 */
import { experiments } from '../lib/experiments';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const OG_DIR = resolve(__dirname, '..', '..', 'public', 'og');

describe('OG images', () => {
  describe('per-experiment cards', () => {
    experiments.forEach((exp) => {
      it(`should have public/og/${exp.id}.png on disk`, () => {
        const path = resolve(OG_DIR, `${exp.id}.png`);
        expect(existsSync(path)).toBe(true);
      });

      it(`public/og/${exp.id}.png should be a non-empty PNG file`, () => {
        const path = resolve(OG_DIR, `${exp.id}.png`);
        if (!existsSync(path)) return; // caught above
        const stat = statSync(path);
        expect(stat.size).toBeGreaterThan(0);
      });
    });
  });

  it('should have a site-wide default og.png', () => {
    const path = resolve(OG_DIR, '..', 'og.png');
    expect(existsSync(path)).toBe(true);
  });
});
