/**
 * Unit tests for the GitHub description comparison logic.
 *
 * These are pure-function tests that run offline with no network calls.
 * They verify the comparison contract, URL parsing, and the shared tagline
 * helper that check-github.ts and apply-github-descriptions.ts depend on.
 */
import { parseGitHubUrl, compareDescriptions, getTagline } from '../lib/github-sync';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('parseGitHubUrl', () => {
  it('should extract owner and repo from a valid repository URL', () => {
    expect(parseGitHubUrl('https://github.com/UniverLab/texforge')).toEqual({
      owner: 'UniverLab',
      repo: 'texforge',
    });
  });

  it('should return null for an organisation root URL (no repo)', () => {
    expect(parseGitHubUrl('https://github.com/UniverLab')).toBeNull();
  });

  it('should return null for a URL with extra path segments', () => {
    expect(parseGitHubUrl('https://github.com/UniverLab/texforge/issues')).toBeNull();
  });

  it('should return null for a non-GitHub URL', () => {
    expect(parseGitHubUrl('https://gitlab.com/UniverLab/texforge')).toBeNull();
  });

  it('should return null for an empty string', () => {
    expect(parseGitHubUrl('')).toBeNull();
  });

  it('should handle trailing slashes', () => {
    expect(parseGitHubUrl('https://github.com/UniverLab/gitkit/')).toEqual({
      owner: 'UniverLab',
      repo: 'gitkit',
    });
  });
});

describe('compareDescriptions', () => {
  it('should return match when descriptions are identical', () => {
    expect(compareDescriptions('Hello', 'Hello')).toBe('match');
  });

  it('should return drift when descriptions differ', () => {
    expect(compareDescriptions('Local', 'Remote')).toBe('drift');
  });

  it('should return drift when remote is null', () => {
    expect(compareDescriptions('Hello', null)).toBe('drift');
  });

  it('should return drift when remote is undefined', () => {
    expect(compareDescriptions('Hello', undefined)).toBe('drift');
  });

  it('should return drift when remote is empty string', () => {
    expect(compareDescriptions('Hello', '')).toBe('drift');
  });

  it('should return drift on case difference', () => {
    expect(compareDescriptions('Hello World', 'hello world')).toBe('drift');
  });

  it('should return drift on trailing whitespace difference', () => {
    expect(compareDescriptions('Hello', 'Hello ')).toBe('drift');
  });
});

describe('getTagline', () => {
  const enDict = {
    experiments: {
      texforge: { tagline: 'A unified LaTeX workspace' },
      quorum: { tagline: 'A self-governing agent runtime' },
      empty: {} as { tagline?: string },
    },
  };

  it('should return the tagline for a known experiment', () => {
    expect(getTagline(enDict, 'texforge')).toBe('A unified LaTeX workspace');
  });

  it('should return undefined for an experiment with no tagline', () => {
    expect(getTagline(enDict, 'empty')).toBeUndefined();
  });

  it('should return undefined for a nonexistent experiment', () => {
    expect(getTagline(enDict, 'nope')).toBeUndefined();
  });
});

describe('check-github missing-token path', () => {
  const script = resolve(__dirname, '../../scripts/check-github.ts');

  it('should exit 0 and report skipped when no GITHUB_TOKEN is set', () => {
    const out = execSync(`node ${script}`, {
      env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '' },
      encoding: 'utf-8',
      timeout: 15_000,
    });
    expect(out).toContain('skipped');
    expect(out).toContain('no GITHUB_TOKEN');
  });
});
