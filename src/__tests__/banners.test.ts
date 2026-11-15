/**
 * Tests for banners.ts - ASCII art banners for experiments
 */
import { existsSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { banners } from '../lib/banners';

const BANNER = readFileSync(resolve(__dirname, '../components/Banner.astro'), 'utf8');
const BASELAYOUT = readFileSync(resolve(__dirname, '../layouts/BaseLayout.astro'), 'utf8');

describe('banners.ts', () => {
  it('should export a banners object', () => {
    expect(banners).toBeDefined();
    expect(typeof banners).toBe('object');
  });

  it('should have banners for all experiments', () => {
    const expectedIds = ['canopy', 'texforge', 'gitkit', 'ghscaff', 'demostage', 'quorum', 'facetmedia'];
    expectedIds.forEach(id => {
      expect(banners).toHaveProperty(id);
    });
  });

  it('should have non-empty string banners', () => {
    Object.entries(banners).forEach(([id, banner]) => {
      expect(typeof banner).toBe('string');
      expect(banner.length).toBeGreaterThan(0);
    });
  });

  it('should have banners containing block characters', () => {
    Object.entries(banners).forEach(([id, banner]) => {
      expect(banner).toMatch(/[█░]/);
    });
  });

  it('should use only the glyphs the subset ships', () => {
    // The woff2 subset below carries exactly space + the two blocks: a
    // banner using anything else would render tofu after the swap.
    const glyphs = new Set<string>();
    for (const banner of Object.values(banners)) {
      for (const ch of banner) glyphs.add(ch);
    }
    expect([...glyphs].sort().join('')).toBe('\n █░');
  });
});

describe('banner font: subset woff2, never blocking first paint', () => {
  it('serves the banner face as a tiny woff2 with swap display', () => {
    expect(BANNER).toContain("url('/fonts/DejaVuSansMono-banner.woff2') format('woff2')");
    expect(BANNER).not.toContain('DejaVuSansMono.ttf');
    expect(BANNER).toContain('font-display: swap');
    const file = resolve(__dirname, '../../public/fonts/DejaVuSansMono-banner.woff2');
    expect(existsSync(file)).toBe(true);
    // The full TrueType is 335 KB; the three-glyph subset must stay tiny.
    expect(statSync(file).size).toBeLessThan(10 * 1024);
  });

  it('preloads the subset — never the full font — on surface pages', () => {
    expect(BASELAYOUT).toContain('href="/fonts/DejaVuSansMono-banner.woff2"');
    expect(BASELAYOUT).toContain('type="font/woff2"');
    expect(BASELAYOUT).not.toContain('DejaVuSansMono.ttf');
  });
});
