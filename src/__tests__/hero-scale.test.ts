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
  it('should have the new .hero h1 clamp with 4.6vw', () => {
    expect(homeSrc).toMatch(/\.hero h1\s*\{[^}]*font-size:\s*clamp\(2rem,\s*4\.6vw,\s*3\.2rem\)/);
  });

  it('should no longer contain the old 6.5vw clamp', () => {
    expect(homeSrc).not.toMatch(/6\.5vw/);
  });

  it('should have the new .hero padding-block clamp values', () => {
    expect(homeSrc).toMatch(/\.hero\s*\{[^}]*padding-block:\s*clamp\(2rem,\s*6vh,\s*4rem\)\s*clamp\(1\.75rem,\s*4vh,\s*2\.75rem\)/);
  });

  it('should have the new .hero gap of 1.2rem', () => {
    expect(homeSrc).toMatch(/\.hero\s*\{[^}]*gap:\s*1\.2rem/);
  });

  it('should contain a @media (max-height: 48rem) short-viewport guard', () => {
    expect(homeSrc).toMatch(/@media\s*\(max-height:\s*48rem\)/);
  });

  it('should have reduced padding-block inside the short-viewport guard', () => {
    expect(homeSrc).toMatch(/@media\s*\(max-height:\s*48rem\)[\s\S]*?\.hero\s*\{[\s\S]*?padding-block:\s*1\.75rem\s*1\.5rem/);
  });

  it('should have reduced h1 font-size inside the short-viewport guard', () => {
    expect(homeSrc).toMatch(/@media\s*\(max-height:\s*48rem\)[\s\S]*?\.hero\s+h1\s*\{[\s\S]*?font-size:\s*clamp\(1\.9rem,\s*4vw,\s*2\.6rem\)/);
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