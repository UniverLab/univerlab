/**
 * Tests for experiments.ts - the core experiment registry
 * Using Given-When-Then (GWT) pattern for clear test documentation
 */
import { experiments, byId, Status, BgTheme } from '../lib/experiments';

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
          expect(exp).toHaveProperty('bg');
        });

        it(`should have valid status for experiment ${exp.id}`, () => {
          // Given: An experiment with a status field
          // When: We validate the status value
          // Then: It should be one of the allowed values
          expect(['active', 'beta', 'research']).toContain(exp.status);
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
        expect(exp.install!.unix).toContain('get.univerlab.org');
        
        // And: Windows command should also be valid if present
        if (exp.install!.windows) {
          expect(exp.install!.windows).toContain('get.univerlab.org');
        }
      });
    });
  });

  describe('background themes', () => {
    const validThemes: BgTheme[] = [
      'cosmic', 'brain', 'primitives', 'starfield', 
      'forge', 'gitgraph', 'scaffold', 'industrial', 'bubbles', 'drift', 'spiral'
    ];

    it('should use valid background themes for all experiments', () => {
      // Given: All experiments in the registry
      // When: We check their background themes
      experiments.forEach(exp => {
        // Then: Each should use a valid theme
        expect(validThemes).toContain(exp.bg);
      });
    });
  });
});