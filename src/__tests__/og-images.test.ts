/**
 * Tests for OG images — every experiment has a generated card on disk.
 *
 * This is the safety net that catches a new experiment added to
 * experiments.ts without re-running scripts/og/build-og.mjs.
 */
import { experiments } from '../lib/experiments';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OG_DIR = resolve(__dirname, '..', '..', 'public', 'og');
const PNG_MAX_BYTES = 300 * 1024;

/** PNG dimensions from the IHDR chunk (magic 8 + length 4 + type 4). */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function expectCard(rel: string) {
  const path = rel === 'og.png' ? resolve(OG_DIR, '..', 'og.png') : resolve(OG_DIR, rel);
  const { width, height } = pngSize(path);
  expect(width).toBe(1200);
  expect(height).toBe(630);
  expect(statSync(path).size).toBeLessThan(PNG_MAX_BYTES);
}

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

  describe('vintage cards: 1200×630 and under 300 KB', () => {
    it('og.png is 1200×630 and under 300 KB', () => {
      expectCard('og.png');
    });

    experiments.forEach((exp) => {
      it(`public/og/${exp.id}.png is 1200×630 and under 300 KB`, () => {
        expectCard(`${exp.id}.png`);
      });
    });

    (['workbench.png', 'workbench-es.png', 'newspaper.png', 'newspaper-es.png'] as const).forEach(
      (file) => {
        it(`public/og/${file} is 1200×630 and under 300 KB`, () => {
          expectCard(file);
        });
      },
    );
  });

  describe('vintage generator shape: paper, texture, plates, serif faces', () => {
    const SCRIPTS = resolve(__dirname, '..', '..', 'scripts', 'og');

    it('build-og.mjs draws the vintage sheet, not the palette-per-experiment look', () => {
      const src = readFileSync(resolve(SCRIPTS, 'build-og.mjs'), 'utf8');
      for (const marker of [
        '#f4f0ea',
        'pergamino',
        'OldStandardTT-Bold',
        'EBGaramond-Regular',
        'machines/',
        `plate('workbench')`,
      ]) {
        expect(src).toContain(marker);
      }
      for (const leftover of ['paletteFor', 'SpaceGrotesk', 'DejaVu', 'motif']) {
        expect(src).not.toContain(leftover);
      }
    });

    it('banners.mjs feeds status labels, not palettes or motifs', () => {
      const src = readFileSync(resolve(SCRIPTS, 'banners.mjs'), 'utf8');
      expect(src).toContain('statusLabel');
      expect(src).not.toContain('paletteFor');
      expect(src).not.toContain('motif');
    });
  });

  describe('shared pages point at their own cards', () => {
    const SRC = resolve(__dirname, '..');

    it('Workbench view passes the locale card as ogImage', () => {
      const src = readFileSync(resolve(SRC, 'views', 'Workbench.astro'), 'utf8');
      expect(src).toContain(`ogImage={lang === 'es' ? '/og/workbench-es.png' : '/og/workbench.png'}`);
    });

    it('newspaper page passes /og/newspaper.png as ogImage', () => {
      const src = readFileSync(resolve(SRC, 'pages', 'newspaper.astro'), 'utf8');
      expect(src).toContain('ogImage="/og/newspaper.png"');
    });

    it('es newspaper page passes /og/newspaper-es.png as ogImage', () => {
      const src = readFileSync(resolve(SRC, 'pages', 'es', 'newspaper.astro'), 'utf8');
      expect(src).toContain('ogImage="/og/newspaper-es.png"');
    });
  });
});
