import { citationTexts } from '../lib/citation';
import type { Citation } from '../lib/experiments';

const canopy: Citation = {
  doi: '10.5281/zenodo.23607434',
  title: 'canopy (harness-canopy)',
  authors: [
    { family: 'Martinez Bolivar', given: 'Jheison', orcid: '0009-0007-3668-102X' },
    { family: 'Solorzano', given: 'Lina' },
  ],
};

const release = { version: 'v3.1.1', publishedAt: '2026-10-24T00:00:00Z' };

describe('citationTexts', () => {
  it('builds the exact APA line and BibTeX entry with a release', () => {
    const { apa, bibtex } = citationTexts(canopy, release);
    expect(apa).toBe(
      'Martinez Bolivar, J., & Solorzano, L. (2026). canopy (harness-canopy) (Version v3.1.1) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.23607434',
    );
    expect(bibtex).toBe(
      '@software{canopy,\n' +
        '  author = {Martinez Bolivar, Jheison and Solorzano, Lina},\n' +
        '  title = {canopy (harness-canopy)},\n' +
        '  year = {2026},\n' +
        '  version = {v3.1.1},\n' +
        '  publisher = {Zenodo},\n' +
        '  doi = {10.5281/zenodo.23607434},\n' +
        '  url = {https://doi.org/10.5281/zenodo.23607434}\n' +
        '}',
    );
  });

  it('drops the Version part and uses the current year without a release', () => {
    const { apa, bibtex } = citationTexts(canopy, null, new Date('2030-05-01T00:00:00Z'));
    expect(apa).toBe(
      'Martinez Bolivar, J., & Solorzano, L. (2030). canopy (harness-canopy) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.23607434',
    );
    expect(bibtex).toContain('year = {2030},');
    expect(bibtex).not.toContain('version');
  });

  it('joins a single author without &', () => {
    const solo: Citation = {
      doi: '10.5281/zenodo.1',
      title: 'solo (repo)',
      authors: [{ family: 'Doe', given: 'Jane' }],
    };
    const { apa, bibtex } = citationTexts(solo, release);
    expect(apa.startsWith('Doe, J. (2026).')).toBe(true);
    expect(apa).not.toContain('&');
    expect(bibtex).toContain('author = {Doe, Jane},');
  });
});
