/**
 * Tests for banners.ts - ASCII art banners for experiments
 */
import { banners } from '../lib/banners';

describe('banners.ts', () => {
  it('should export a banners object', () => {
    expect(banners).toBeDefined();
    expect(typeof banners).toBe('object');
  });

  it('should have banners for all experiments', () => {
    const expectedIds = ['canopy', 'texforge', 'gitkit', 'ghscaff', 'cadspec', 'demostage', 'quorum'];
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
});
