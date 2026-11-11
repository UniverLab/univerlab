import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { citationTexts } from '../lib/citation';
import { byId, experiments, type Citation } from '../lib/experiments';

const REPO = resolve(__dirname, '..', '..');

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

  it('cites a deposited audit as a report, not software', () => {
    const audit: Citation = {
      doi: '10.5281/zenodo.100',
      title: 'Shop audit',
      authors: [{ family: 'Team', given: 'Contract Test' }],
    };
    const { apa, bibtex } = citationTexts(audit, { version: '1.0', publishedAt: '2026-06-15T00:00:00Z' }, new Date(), 'report');
    expect(apa).toBe(
      'Team, C. (2026). Shop audit (Version 1.0) [Report]. Zenodo. https://doi.org/10.5281/zenodo.100',
    );
    expect(bibtex).toContain('@techreport{shop,');
    expect(bibtex).toContain('institution = {Zenodo},');
    expect(bibtex).not.toContain('@software');
    expect(bibtex).not.toContain('publisher = {Zenodo},');
  });

  it('keeps the software default byte-identical without the kind', () => {
    const { apa, bibtex } = citationTexts(canopy, release);
    expect(apa).toContain('[Computer software]');
    expect(bibtex).toContain('@software{canopy,');
  });
});

describe('DOI badge', () => {
  it('canopy declares a self-hosted badge', () => {
    expect(byId('canopy').citation?.badge).toBe('/badges/doi-zenodo.23607434.svg');
    const badgePath = resolve(REPO, 'public/badges/doi-zenodo.23607434.svg');
    expect(existsSync(badgePath)).toBe(true);
    expect(readFileSync(badgePath, 'utf8')).toContain('10.5281/zenodo.23607434');
  });

  it('no badge is loaded from another origin', () => {
    for (const exp of experiments) {
      if (exp.citation?.badge) {
        expect(exp.citation.badge.startsWith('/badges/')).toBe(true);
      }
    }
  });

  it('the layout renders the badge only when declared', () => {
    const layout = readFileSync(resolve(REPO, 'src/layouts/ExperimentLayout.astro'), 'utf8');
    expect(layout).toContain('(exp.citation || release) &&');
    expect(layout).toContain('class="seal"');
    expect(layout).toContain('https://doi.org/${exp.citation.doi}');
    expect(layout).toContain('release.version');
    expect(layout).toContain('class="seal-key"');
    expect(layout).not.toContain('<img src={exp.citation.badge}');
  });
});
