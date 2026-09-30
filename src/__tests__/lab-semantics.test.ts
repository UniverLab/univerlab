/**
 * Tests for the lab's shared semantics: thread + built-with.
 * Relations verified 2026-09-29 — only add one with evidence of that kind
 * (see the `builtWith` evidence comment in src/lib/experiments.ts).
 */
import { experiments } from '../lib/experiments';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const ALLOWED = ['canopy', 'ghscaff', 'demostage', 'gitkit'] as const;

const EXPECTED: Record<string, string[]> = {
  canopy: ['canopy', 'ghscaff', 'demostage', 'gitkit'],
  texforge: ['canopy', 'ghscaff', 'demostage', 'gitkit'],
  gitkit: ['canopy', 'ghscaff', 'demostage', 'gitkit'],
  ghscaff: ['canopy', 'ghscaff', 'demostage', 'gitkit'],
  demostage: ['canopy', 'ghscaff', 'demostage', 'gitkit'],
  cadspec: ['ghscaff', 'gitkit'],
  quorum: ['ghscaff', 'gitkit'],
  'astro-denoise': [],
};

describe('lab semantics', () => {
  it('keeps builtWith inside the four evidenced tools and matches the spec exactly', () => {
    expect(experiments.map((e) => e.id).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const exp of experiments) {
      for (const tool of exp.builtWith) expect(ALLOWED).toContain(tool);
      expect(exp.builtWith).toEqual(EXPECTED[exp.id]);
      expect(exp.thread).toBe('@i18n');
    }
  });

  it('has problem/method/artifact for every thread in en and es', () => {
    for (const id of Object.keys(EXPECTED)) {
      const enThread = en.experiments[id as keyof typeof en.experiments].thread;
      const esThread = es.experiments[id as keyof typeof es.experiments].thread;
      for (const key of ['problem', 'method', 'artifact'] as const) {
        expect(enThread[key].length).toBeGreaterThan(0);
        expect(esThread[key].length).toBeGreaterThan(0);
      }
      expect(Object.keys(esThread).sort()).toEqual(Object.keys(enThread).sort());
    }
  });

  it('keeps builtWithSegments to exactly the four tools in both languages', () => {
    expect(Object.keys(en.builtWithSegments).sort()).toEqual([...ALLOWED].sort());
    expect(Object.keys(es.builtWithSegments).sort()).toEqual([...ALLOWED].sort());
  });

  it('keeps footer.built to label + the three site tools in both languages', () => {
    expect(Object.keys(en.footer.built).sort()).toEqual(['canopy', 'ghscaff', 'gitkit', 'label'].sort());
    expect(Object.keys(es.footer.built).sort()).toEqual(['canopy', 'ghscaff', 'gitkit', 'label'].sort());
  });
});
