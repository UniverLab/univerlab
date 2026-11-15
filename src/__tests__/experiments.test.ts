/**
 * Tests for experiments.ts - the core experiment registry
 * Using Given-When-Then (GWT) pattern for clear test documentation
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { experiments, byId, Status, licenseUrl } from '../lib/experiments';

describe('experiments.ts', () => {
  describe('experiments array', () => {
    describe('experiment collection validation', () => {
      it('should have at least one experiment in the registry', () => {
        // Given: The experiments registry is loaded
        // When: We check the length of the experiments array
        // Then: It should contain at least one experiment
        expect(experiments.length).toBeGreaterThan(0);
      });

      it('should have unique experiment IDs across all experiments', () => {
        // Given: Multiple experiments in the registry
        // When: We extract all experiment IDs
        const ids = experiments.map(exp => exp.id);
        const uniqueIds = new Set(ids);
        
        // Then: All IDs should be unique
        expect(ids.length).toBe(uniqueIds.size);
      });

      it('should have unique experiment numbers across all experiments', () => {
        // Given: Multiple experiments in the registry
        // When: We extract all experiment numbers
        const numbers = experiments.map(exp => exp.number);
        const uniqueNumbers = new Set(numbers);
        
        // Then: All numbers should be unique
        expect(numbers.length).toBe(uniqueNumbers.size);
      });
    });

    describe('individual experiment structure validation', () => {
      experiments.forEach(exp => {
        it(`should have all required fields for experiment ${exp.id}`, () => {
          // Given: An experiment in the registry
          // When: We check its structure
          // Then: It should have all required fields
          expect(exp).toHaveProperty('id');
          expect(exp).toHaveProperty('name');
          expect(exp).toHaveProperty('number');
          expect(exp).toHaveProperty('status');
          expect(exp).toHaveProperty('essenceHex');
          expect(exp).toHaveProperty('github');
        });

        it(`should have valid status for experiment ${exp.id}`, () => {
          // Given: An experiment with a status field
          // When: We validate the status value
          // Then: It should be one of the allowed values
          expect(['active', 'beta', 'research', 'archived']).toContain(exp.status);
        });

        it(`should have valid essence color hex for experiment ${exp.id}`, () => {
          // Given: An experiment with an essenceHex field
          // When: We validate the color format
          // Then: It should be a valid hex color code
          expect(exp.essenceHex).toMatch(/^#([0-9A-Fa-f]{3}){1,2}$/);
        });

        it(`should have valid GitHub URL for experiment ${exp.id}`, () => {
          // Given: An experiment with a github field
          // When: We validate the URL format
          // Then: It should be a valid GitHub URL
          expect(exp.github).toMatch(/^https:\/\/github\.com\/UniverLab(\/[\w-]+)?$/);
        });
      });
    });
  });

  describe('byId function', () => {
    it('should return the correct experiment when given a valid ID', () => {
      // Given: A valid experiment ID from the registry
      const firstExp = experiments[0];
      
      // When: We call byId with that ID
      const foundExp = byId(firstExp.id);
      
      // Then: It should return the matching experiment
      expect(foundExp).toEqual(firstExp);
    });

    it('should throw an error when given an invalid experiment ID', () => {
      // Given: An invalid experiment ID
      const invalidId = 'invalid-id';
      
      // When: We call byId with the invalid ID
      // Then: It should throw an error with the expected message
      expect(() => byId(invalidId)).toThrow('Unknown experiment id: invalid-id');
    });

    it('should handle case-sensitive IDs correctly', () => {
      // Given: A valid experiment ID and its uppercase version
      const firstExp = experiments[0];
      const upperCaseId = firstExp.id.toUpperCase();
      
      // When: We call byId with the exact case
      // Then: It should work correctly
      expect(byId(firstExp.id)).toBeDefined();
      
      // When: We call byId with different case
      // Then: It should throw an error
      expect(() => byId(upperCaseId)).toThrow(`Unknown experiment id: ${upperCaseId}`);
    });
  });

  describe('install commands', () => {
    it('should have valid install commands for experiments that ship binaries', () => {
      // Given: Experiments that have install commands
      const experimentsWithInstall = experiments.filter(exp => exp.install);

      // When: We validate each install command
      experimentsWithInstall.forEach(exp => {
        // Then: Install should be defined and have unix command
        expect(exp.install).toBeDefined();
        if (exp.id === 'facetmedia') {
          // facetMedia ships on PyPI, not through the install worker.
          expect(exp.install!.unix).toBe('uv tool install facetmedia');
          expect(exp.install!.windows).toBeUndefined();
        } else {
          expect(exp.install!.unix).toContain('install.univerlab.org');

          // And: Windows command should also be valid if present
          if (exp.install!.windows) {
            expect(exp.install!.windows).toContain('install.univerlab.org');
          }
        }
      });
    });
  });

  describe('fondo opt-in', () => {
    it('demostage opts into the live fondo', () => {
      expect(byId('demostage').fondo).toBe(true);
    });
  });

  describe('license — SPDX pin per repo (2026-11-12, breaks on relicense)', () => {
    // Grounded in the live LICENSE files fetched 2026-11-12 (see the spec
    // reviewer's notes): Rust crates are dual MIT OR Apache-2.0, everything
    // else names its single license. A relicense must update this table and
    // the registry value together — the badge follows the one registry value.
    const EXPECTED_LICENSE: Record<string, 'MIT' | 'Apache-2.0' | 'MIT OR Apache-2.0'> = {
      canopy: 'MIT OR Apache-2.0',
      demostage: 'MIT OR Apache-2.0',
      texforge: 'MIT',
      gitkit: 'MIT',
      ghscaff: 'MIT',
      cadspec: 'MIT',
      quorum: 'Apache-2.0',
      'astro-denoise': 'Apache-2.0',
      facetmedia: 'Apache-2.0',
    };

    it('pins every experiment to the table above', () => {
      // Given: the nine experiments in the registry
      // When: we compare each license to the table
      // Then: every row matches, and no experiment is missing or extra
      expect(Object.keys(EXPECTED_LICENSE).sort()).toEqual(experiments.map((e) => e.id).sort());
      for (const exp of experiments) {
        expect(exp.license).toBe(EXPECTED_LICENSE[exp.id]);
      }
    });

    it('links the license file of each experiment repository', () => {
      // Given: the licenseUrl helper and the nine experiments
      // When: we build each license URL
      // Then: dual-licensed repos link LICENSE-MIT, the rest link LICENSE
      for (const exp of experiments) {
        const url = licenseUrl(exp);
        expect(url.startsWith(exp.github)).toBe(true);
        expect(url).toBe(
          exp.license === 'MIT OR Apache-2.0'
            ? `${exp.github}/blob/main/LICENSE-MIT`
            : `${exp.github}/blob/main/LICENSE`,
        );
      }
    });
  });

  describe('citation', () => {
    it('astro-denoise carries its Zenodo concept DOI', () => {
      // Given: the astro-denoise registry entry and its badge file
      const exp = byId('astro-denoise');
      const badgePath = join(__dirname, '../../public/badges/doi-zenodo.23989629.svg');

      // When: we read the citation and the badge file
      // Then: the DOI, badge path and badge contents match the concept DOI
      expect(exp.citation?.doi).toBe('10.5281/zenodo.23989629');
      expect(exp.citation?.badge).toBe('/badges/doi-zenodo.23989629.svg');
      const badge = readFileSync(badgePath, 'utf8');
      expect(badge).toContain('10.5281/zenodo.23989629');
      expect(badge).not.toContain('23607434');
    });
  });

});