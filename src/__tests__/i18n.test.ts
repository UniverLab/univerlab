/**
 * Tests for i18n system
 * Using Given-When-Then (GWT) pattern for clear test documentation
 */
import { en } from '../i18n/en';
import { es } from '../i18n/es';

describe('i18n system', () => {
  describe('English dictionary', () => {
    it('should have all required top-level sections', () => {
      // Given: The English dictionary is loaded
      // When: We check for required sections
      // Then: All top-level sections should be present
      expect(en).toHaveProperty('meta');
      expect(en).toHaveProperty('nav');
      expect(en).toHaveProperty('footer');
      expect(en).toHaveProperty('common');
      expect(en).toHaveProperty('status');
      expect(en).toHaveProperty('home');
      expect(en).toHaveProperty('experimentsIndex');
      expect(en).toHaveProperty('experiments');
      expect(en).toHaveProperty('manifesto');
      expect(en).toHaveProperty('cosmos');
      expect(en).toHaveProperty('research');
      expect(en).toHaveProperty('people');
    });

    it('should have meta description', () => {
      // Given: The English dictionary meta section
      // When: We check the description
      // Then: It should be a non-empty string
      expect(en.meta.description).toBeTruthy();
      expect(typeof en.meta.description).toBe('string');
    });

    it('should have navigation items', () => {
      // Given: The English dictionary nav section
      // When: We check for required navigation items
      // Then: All navigation items should be present
      expect(en.nav).toHaveProperty('experiments');
      expect(en.nav).toHaveProperty('research');
      expect(en.nav).toHaveProperty('manifesto');
      expect(en.nav).toHaveProperty('people');
      expect(en.nav).toHaveProperty('github');
    });

    it('should have status labels', () => {
      // Given: The English dictionary status section
      // When: We check for required status labels
      // Then: All status labels should be present
      expect(en.status).toHaveProperty('active');
      expect(en.status).toHaveProperty('beta');
      expect(en.status).toHaveProperty('research');
    });
  });

  describe('Spanish dictionary', () => {
    it('should have all required top-level sections', () => {
      // Given: The Spanish dictionary is loaded
      // When: We check for required sections
      // Then: All top-level sections should be present
      expect(es).toHaveProperty('meta');
      expect(es).toHaveProperty('nav');
      expect(es).toHaveProperty('footer');
      expect(es).toHaveProperty('common');
      expect(es).toHaveProperty('status');
      expect(es).toHaveProperty('home');
      expect(es).toHaveProperty('experimentsIndex');
      expect(es).toHaveProperty('experiments');
      expect(es).toHaveProperty('manifesto');
      expect(es).toHaveProperty('cosmos');
      expect(es).toHaveProperty('research');
      expect(es).toHaveProperty('people');
    });
  });

  describe('Dictionary parity', () => {
    it('should have same top-level keys in both languages', () => {
      // Given: English and Spanish dictionaries
      // When: We compare their top-level keys
      const enKeys = Object.keys(en);
      const esKeys = Object.keys(es);
      
      // Then: Both should have identical top-level structure
      expect(enKeys.sort()).toEqual(esKeys.sort());
    });

    it('should have same experiment IDs in both languages', () => {
      // Given: Experiments sections in both dictionaries
      // When: We compare experiment IDs
      const enExpKeys = Object.keys(en.experiments);
      const esExpKeys = Object.keys(es.experiments);
      
      // Then: Both should have identical experiment IDs
      expect(enExpKeys.sort()).toEqual(esExpKeys.sort());
    });

    it('should have same structure for each experiment', () => {
      // Given: Experiment IDs from English dictionary
      const enExpKeys = Object.keys(en.experiments);
      
      // When: We compare each experiment's structure
      enExpKeys.forEach(expId => {
        const enExp = en.experiments[expId as keyof typeof en.experiments];
        const esExp = es.experiments[expId as keyof typeof es.experiments];
        
        // Then: Both experiments should exist
        expect(enExp).toBeDefined();
        expect(esExp).toBeDefined();
        
        // And: Both should be objects
        expect(typeof enExp).toBe('object');
        expect(typeof esExp).toBe('object');
        
        // And: Both should have same keys
        const enExpKeys = Object.keys(enExp);
        const esExpKeys = Object.keys(esExp);
        expect(enExpKeys.sort()).toEqual(esExpKeys.sort());
      });
    });
  });

  describe('Experiment data validation', () => {
    it('should have required fields for each experiment in both languages', () => {
      // Given: Experiment IDs from English dictionary
      const enExpKeys = Object.keys(en.experiments);
      
      // When: We check required fields for each experiment
      enExpKeys.forEach(expId => {
        const enExp = en.experiments[expId as keyof typeof en.experiments];
        const esExp = es.experiments[expId as keyof typeof es.experiments];
        
        // Then: Required fields should exist in both languages
        ['need', 'tagline', 'koan', 'lede', 'genesis'].forEach(field => {
          expect(enExp).toHaveProperty(field);
          expect(esExp).toHaveProperty(field);
          
          const enField = enExp[field as keyof typeof enExp];
          const esField = esExp[field as keyof typeof esExp];
          
          // And: String fields should be non-empty
          if (typeof enField === 'string' && typeof esField === 'string') {
            expect(enField.length).toBeGreaterThan(0);
            expect(esField.length).toBeGreaterThan(0);
          }
        });
        
        // And: Genesis should have required subfields
        expect(enExp.genesis).toHaveProperty('kicker');
        expect(enExp.genesis).toHaveProperty('title');
        expect(enExp.genesis).toHaveProperty('body');
        
        expect(esExp.genesis).toHaveProperty('kicker');
        expect(esExp.genesis).toHaveProperty('title');
        expect(esExp.genesis).toHaveProperty('body');
      });
    });
  });

  describe('Home section validation', () => {
    it('should have hero section with required fields', () => {
      // Given: Home sections in both dictionaries
      // When: We check hero section structure
      // Then: Required fields should be present in both languages
      expect(en.home.hero).toHaveProperty('title');
      expect(en.home.hero).toHaveProperty('lede');
      expect(en.home.hero).toHaveProperty('tagline');
      expect(en.home.hero).toHaveProperty('senses');
      
      expect(es.home.hero).toHaveProperty('title');
      expect(es.home.hero).toHaveProperty('lede');
      expect(es.home.hero).toHaveProperty('tagline');
      expect(es.home.hero).toHaveProperty('senses');
    });

    it('should have senses array with valid structure', () => {
      // Given: Hero senses arrays in both dictionaries
      // When: We validate the structure
      // Then: Both should be arrays with valid items
      expect(Array.isArray(en.home.hero.senses)).toBe(true);
      expect(Array.isArray(es.home.hero.senses)).toBe(true);
      
      en.home.hero.senses.forEach(sense => {
        expect(sense).toHaveProperty('suffix');
        expect(sense).toHaveProperty('glosses');
        expect(Array.isArray(sense.glosses)).toBe(true);
        expect(sense.glosses.length).toBeGreaterThan(0);
      });

      es.home.hero.senses.forEach(sense => {
        expect(sense).toHaveProperty('suffix');
        expect(sense).toHaveProperty('glosses');
        expect(Array.isArray(sense.glosses)).toBe(true);
        expect(sense.glosses.length).toBeGreaterThan(0);
      });
    });
  });
});