/**
 * Archived experiments leave every live listing and appear on /archive.
 */
import { experiments, liveExperiments, archivedExperiments, isArchived } from '../lib/experiments';
import { en } from '../i18n/en';

describe('archived experiments', () => {
  it('excludes archived experiments from the live list', () => {
    const archived = experiments.filter(isArchived).map((e) => e.id);
    expect(archived).toEqual(['cadspec']);
    for (const e of liveExperiments) {
      expect(isArchived(e)).toBe(false);
    }
    expect(liveExperiments.map((e) => e.id)).not.toContain('cadspec');
    expect(liveExperiments.length).toBe(experiments.length - archivedExperiments.length);
  });

  it('keeps the archived experiment in the registry with its number, so it is never reused', () => {
    const cad = experiments.find((e) => e.id === 'cadspec');
    expect(cad?.number).toBe('EXP-005');
    expect(cad?.status).toBe('archived');
    expect(cad?.endDate).toBe('2026-10-13');
  });

  it('feeds /archive with EXP-005 and its built-and-archived copy', () => {
    expect(archivedExperiments.map((e) => e.number)).toEqual(['EXP-005']);
    const copy = en.secret.archive.cadspec;
    for (const key of ['built', 'learned', 'closed', 'instead'] as const) {
      expect(copy[key].length).toBeGreaterThan(20);
    }
    expect(en.secret.archive.heading).toBe('Built and archived');
    expect(en.secret.archive.neverHeading).toBe('Never built');
  });
});
