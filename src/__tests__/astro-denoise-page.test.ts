/**
 * Tests for the Astro Denoise page copy after the 2026-10-19 committee rework:
 * the approved title, the general and five specific objectives with their
 * states, the three public repositories, and the section order in the view.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { experiments as registry } from '../lib/experiments';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const view = readFileSync(join(__dirname, '../views/experiments/AstroDenoise.astro'), 'utf8');
const enEntry = en.experiments['astro-denoise'];
const esEntry = es.experiments['astro-denoise'];

describe('Astro Denoise page copy', () => {
  describe('title and description', () => {
    it('should use the approved English title and description', () => {
      // Given: the English dictionary entry for astro-denoise
      // When: we read title and description
      // Then: they match the approved SEO copy
      expect(enEntry.title).toBe('Astro Denoise — a noise-reduction benchmark on DC2 images');
      expect(enEntry.description).toBe('A reproducible benchmark of noise-reduction methods on simulated Vera Rubin Observatory DC2 images, scored by faint-source recovery, image quality and cost.');
    });

    it('should use the approved Spanish title and description', () => {
      // Given: the Spanish dictionary entry for astro-denoise
      // When: we read title and description
      // Then: they match the approved SEO copy
      expect(esEntry.title).toBe('Astro Denoise — benchmark de reducción de ruido en DC2');
      expect(esEntry.description).toBe('Benchmark reproducible de métodos de reducción de ruido en imágenes DC2 del Vera Rubin Observatory, por recuperación de fuentes débiles, calidad y coste.');
    });

    it('should keep the title and description inside the SEO length limits in both languages', () => {
      // Given: the title and description of both entries
      // When: we measure their lengths
      // Then: titles are 30-60 and descriptions 120-160 characters
      for (const entry of [enEntry, esEntry]) {
        expect(entry.title.length).toBeGreaterThanOrEqual(30);
        expect(entry.title.length).toBeLessThanOrEqual(60);
        expect(entry.description.length).toBeGreaterThanOrEqual(120);
        expect(entry.description.length).toBeLessThanOrEqual(160);
      }
    });

    it('should carry the thesis title as visible objectives copy in both languages', () => {
      // Given: the thesis title in each dictionary
      // When: we read it
      // Then: it is the approved long title
      expect(enEntry.objectives.thesisTitle).toBe('Benchmarking noise-reduction methods on simulated DC2 images of the Vera Rubin Observatory');
      expect(esEntry.objectives.thesisTitle).toBe('Benchmarking de métodos de reducción de ruido en imágenes simuladas DC2 del Vera Rubin Observatory');
    });

    it('should name the problem as noise reduction in both languages', () => {
      // Given: the thread problem label in both dictionaries
      // When: we read it
      // Then: noise is reduced, never removed
      expect(enEntry.thread.problem).toBe('noise reduction');
      expect(esEntry.thread.problem).toBe('reducción de ruido');
    });
  });

  describe('terminology', () => {
    it('should not keep the old denoising or removal wording in the Spanish entry', () => {
      // Given: every string of the Spanish entry
      // When: we search for the retired terms
      // Then: none remain
      const spanish = JSON.stringify(esEntry);
      expect(spanish).not.toMatch(/denoising/i);
      expect(spanish).not.toMatch(/eliminación de ruido/i);
    });

    it('should not keep the word denoising in the English entry', () => {
      // Given: every string of the English entry
      // When: we search for the word
      // Then: it is absent (proper names only)
      expect(JSON.stringify(enEntry)).not.toMatch(/denoising/i);
    });

    it('should drop the May proposal wording from the genesis', () => {
      // Given: the genesis body in both languages
      // When: we search for the retired May description
      // Then: the four-module status is gone
      expect(enEntry.genesis.body).not.toMatch(/four open modules/);
      expect(esEntry.genesis.body).not.toMatch(/cuatro módulos/);
    });
  });

  describe('objectives', () => {
    const states = {
      en: ['complete', 'in progress', 'in progress', 'in progress', 'pending'],
      es: ['completo', 'en curso', 'en curso', 'en curso', 'pendiente'],
    };

    it('should carry the general objective and five specific objectives in order, in English', () => {
      // Given: the English objectives block
      // When: we read it
      // Then: it has the approved general text and five items with their states
      expect(enEntry.objectives.kicker).toBe('Objectives');
      expect(enEntry.objectives.general).toBe('Develop a reproducible benchmarking platform that compares noise-reduction methods on simulated DC2 images of the Vera Rubin Observatory, evaluating for each method the recovery of faint sources, the resulting image quality and its computational cost.');
      expect(enEntry.objectives.items.map((o) => o.state)).toEqual(states.en);
    });

    it('should carry the general objective and five specific objectives in order, in Spanish', () => {
      // Given: the Spanish objectives block
      // When: we read it
      // Then: it has the approved general text and five items with their states
      expect(esEntry.objectives.kicker).toBe('Objetivos');
      expect(esEntry.objectives.general).toBe('Desarrollar una plataforma de benchmarking reproducible que compare métodos de reducción de ruido en imágenes simuladas DC2 del Vera Rubin Observatory, evaluando en cada método la recuperación de fuentes débiles, la calidad de imagen resultante y su coste computacional.');
      expect(esEntry.objectives.items.map((o) => o.state)).toEqual(states.es);
    });

    it('should keep the first objective as the only complete one, matching the view accent', () => {
      // Given: the objective states
      // When: we count the complete labels
      // Then: exactly the first one is complete
      expect(enEntry.objectives.items.filter((o) => o.state === 'complete')).toHaveLength(1);
      expect(enEntry.objectives.items[0].state).toBe('complete');
      expect(esEntry.objectives.items[0].state).toBe('completo');
    });

    it('should not state counts of regions, bands or tracts inside the objectives', () => {
      // Given: the objective texts
      // When: we search for numbers
      // Then: none appear, because dataset versions change them
      const texts = [...enEntry.objectives.items, ...esEntry.objectives.items].map((o) => o.text);
      for (const text of texts) {
        expect(text).not.toMatch(/(?<![A-Za-z])\d+ (regions|bands|tracts|regiones|bandas)/i);
      }
    });
  });

  describe('repositories', () => {
    const repos = [
      { name: 'UniverLab/astro-denoise', url: 'https://github.com/UniverLab/astro-denoise' },
      { name: 'UniverLab/astro-denoise-bm3d', url: 'https://github.com/UniverLab/astro-denoise-bm3d' },
      { name: 'UniverLab/astro-denoise-unet', url: 'https://github.com/UniverLab/astro-denoise-unet' },
    ];

    it('should list the three public repositories in both languages', () => {
      // Given: the repos block in each dictionary
      // When: we read names and urls
      // Then: they match the three repositories
      for (const entry of [enEntry, esEntry]) {
        expect(entry.repos.items.map((r) => ({ name: r.name, url: r.url }))).toEqual(repos);
      }
    });

    it('should describe each repository with the approved copy', () => {
      // Given: the repository descriptions
      // When: we read them in English and Spanish
      // Then: they match the approved wording
      expect(enEntry.repos.items.map((r) => r.description)).toEqual([
        'The bench: orchestrator, science metrics and the control condition.',
        'BM3D, the classical baseline.',
        'The U-Net, the deep-learning baseline.',
      ]);
      expect(esEntry.repos.items.map((r) => r.description)).toEqual([
        'El banco: orquestador, métricas científicas y la condición de control.',
        'BM3D, la referencia clásica.',
        'La U-Net, la referencia de aprendizaje profundo.',
      ]);
    });

    it('should point the registry github link at the bench repository', () => {
      // Given: the astro-denoise row of the experiment registry
      // When: we read its github field
      // Then: it points at the bench, not the org
      const exp = registry.find((e) => e.id === 'astro-denoise');
      expect(exp?.github).toBe('https://github.com/UniverLab/astro-denoise');
    });
  });

  describe('questions and FAQ', () => {
    it('should keep the first two open questions and replace the third', () => {
      // Given: the open questions in English
      // When: we read them
      // Then: the third is the reproducibility question
      expect(enEntry.questions.items[2]).toBe('Can the whole benchmark be repeated with the same scientific results on the same version of data and code?');
      expect(esEntry.questions.items[2]).toBe('¿Puede el benchmark completo repetirse con los mismos resultados científicos sobre la misma versión de datos y de código?');
    });

    it('should answer "What is astro-denoise?" with the three method conditions', () => {
      // Given: the FAQ answer in each language
      // When: we read it
      // Then: it names control, BM3D and U-Net
      const en0 = enEntry.faq[0][1];
      const es0 = esEntry.faq[0][1];
      expect(en0).toMatch(/noise-reduction methods/);
      expect(en0).toMatch(/control/);
      expect(en0).toMatch(/BM3D/);
      expect(en0).toMatch(/U-Net/);
      expect(es0).toMatch(/métodos de reducción de ruido/);
      expect(es0).toMatch(/control/);
      expect(es0).toMatch(/BM3D/);
      expect(es0).toMatch(/U-Net/);
    });
  });

  describe('view', () => {
    it('should place objectives, then repositories, then the open questions', () => {
      // Given: the view source
      // When: we find the section kickers
      // Then: they appear in that order
      const objectives = view.indexOf('e.objectives.kicker');
      const repos = view.indexOf('e.repos.kicker');
      const questions = view.indexOf('e.questions.kicker');
      expect(objectives).toBeGreaterThan(-1);
      expect(repos).toBeGreaterThan(objectives);
      expect(questions).toBeGreaterThan(repos);
    });

    it('should render the thesis title as the h2 of the objectives section', () => {
      // Given: the view source
      // When: we find the objectives section heading
      // Then: the thesis title is an h2 placed after the kicker
      expect(view).toMatch(/<h2>\{e\.objectives\.thesisTitle\}<\/h2>/);
      expect(view.indexOf('e.objectives.kicker')).toBeLessThan(view.indexOf('e.objectives.thesisTitle'));
    });

    it('should open repository links in a new tab without leaking the opener, untranslated', () => {
      // Given: the repository link markup
      // When: we read the anchor
      // Then: it carries the safe target, rel and translate attributes
      const anchor = view.match(/<a class="rname"[^>]*>/);
      expect(anchor).not.toBeNull();
      expect(anchor![0]).toContain('target="_blank"');
      expect(anchor![0]).toContain('rel="noopener noreferrer"');
      expect(anchor![0]).toContain('translate="no"');
    });

    it('should keep the proposal link unchanged', () => {
      // Given: the view source
      // When: we read the proposal url
      // Then: it is the stable proposal key
      expect(view).toContain("const proposalUrl = 'https://papers.univerlab.org/astro-denoise/proposal.pdf';");
    });
  });
});
