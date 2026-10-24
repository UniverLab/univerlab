import type { Citation } from './experiments';
import type { ReleaseInfo } from './releases';

/** Build the copy-paste citation strings for an experiment's cite block.
 *  Pure: the year comes from the build-time `latestRelease` the plate already
 *  uses, falling back to `now` when there is no release. */
export function citationTexts(
  cit: Citation,
  release: Pick<ReleaseInfo, 'version' | 'publishedAt'> | null,
  now: Date = new Date(),
): { apa: string; bibtex: string } {
  const year = release ? new Date(release.publishedAt).getUTCFullYear() : now.getUTCFullYear();
  const names = cit.authors.map((a) => `${a.family}, ${initial(a.given)}`);
  const authorStr = names.length > 1 ? `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}` : names[0];
  const versionPart = release ? ` (Version ${release.version})` : '';
  const apa = `${authorStr} (${year}). ${cit.title}${versionPart} [Computer software]. Zenodo. https://doi.org/${cit.doi}`;

  const key = cit.title.split(' ')[0].toLowerCase();
  const bibAuthors = cit.authors.map((a) => `${a.family}, ${a.given}`).join(' and ');
  const versionLine = release ? `\n  version = {${release.version}},` : '';
  const bibtex =
    `@software{${key},\n` +
    `  author = {${bibAuthors}},\n` +
    `  title = {${cit.title}},\n` +
    `  year = {${year}},${versionLine}\n` +
    `  publisher = {Zenodo},\n` +
    `  doi = {${cit.doi}},\n` +
    `  url = {https://doi.org/${cit.doi}}\n` +
    `}`;
  return { apa, bibtex };
}

function initial(given: string): string {
  return `${given.trim().charAt(0)}.`;
}
