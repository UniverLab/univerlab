// Shared helpers for the GitHub description sync scripts (check-github.ts and
// apply-github-descriptions.ts).  Lives in src/ so tests can import it.

/** Parse a GitHub URL into owner/repo, or null if it doesn't point at a repo. */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/** Pure comparison over the two strings. */
export function compareDescriptions(
  localTagline: string,
  remoteDescription: string | null | undefined,
): 'match' | 'drift' {
  if (remoteDescription == null || remoteDescription === '') return 'drift';
  return localTagline === remoteDescription ? 'match' : 'drift';
}

/** Read the English tagline for an experiment from the i18n dictionary. */
export function getTagline(
  enDict: { experiments: Record<string, { tagline?: string }> },
  experimentId: string,
): string | undefined {
  return enDict.experiments[experimentId]?.tagline;
}
