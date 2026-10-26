/**
 * Tests for hero scale reductions — ensures the hero no longer fills
 * the entire viewport on 1366x768 laptops.
 *
 * Astro components aren't directly renderable in Jest, so we verify
 * the source-level contract by reading the .astro files as text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOME = resolve(__dirname, '..', 'views', 'Home.astro');
const EXP_LAYOUT = resolve(__dirname, '..', 'layouts', 'ExperimentLayout.astro');

const homeSrc = readFileSync(HOME, 'utf8');
const expLayoutSrc = readFileSync(EXP_LAYOUT, 'utf8');

describe('Hero scale — home page', () => {
  it('sets the frontispiece h1 at the plate scale', () => {
    expect(homeSrc).toMatch(/\.frontis h1\s*\{[^}]*font-size:\s*clamp\(44px,\s*9vw,\s*84px\)/);
  });

  it('should no longer contain the old 6.5vw clamp', () => {
    expect(homeSrc).not.toMatch(/6\.5vw/);
  });

  it('drops the old hero and its short-viewport guard', () => {
    expect(homeSrc).not.toContain('LabSystem');
    expect(homeSrc).not.toMatch(/\.hero\s*\{/);
    expect(homeSrc).not.toContain('hero-col');
  });
});

describe('Hero scale — experiment pages', () => {
  it('should have the new experiment hero padding-block of 2.5rem 1.5rem', () => {
    expect(expLayoutSrc).toMatch(/\.hero\s*\{[^}]*padding-block:\s*2\.5rem\s*1\.5rem/);
  });

  it('should no longer contain the old experiment hero padding-block of 3.5rem 2rem', () => {
    expect(expLayoutSrc).not.toMatch(/padding-block:\s*3\.5rem\s*2rem/);
  });

  it('should have the new observatory koan clamp with 3.6vw', () => {
    expect(expLayoutSrc).toMatch(/font-size:\s*clamp\(1\.5rem,\s*3\.6vw,\s*2\.4rem\)/);
  });

  it('should no longer contain the old observatory koan clamp of 1.8rem, 5vw, 3rem', () => {
    expect(expLayoutSrc).not.toMatch(/clamp\(1\.8rem,\s*5vw,\s*3rem\)/);
  });
});