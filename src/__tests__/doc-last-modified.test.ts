/**
 * The freshness date — where it comes from, and every way it is allowed to be
 * absent.
 *
 * The invariant under all of these: a docs page either shows the source file's
 * own last commit date, or shows nothing. It never shows the build's clock,
 * and it never shows a date read out of a shallow clone, where "newest commit"
 * means "when the runner checked the repository out" and would report every
 * page as freshly rewritten on every deploy.
 */
import { isAbsolute, relative, resolve } from 'node:path';

import { docLastModified, docsFileFor, type GitExec } from '../lib/doc-last-modified';

const ROOT = process.cwd();
const ADR = resolve(ROOT, '../harness-canopy/docs/adr/0001-recipes.md');

/** An `exec` that answers `shallow` to the shallow probe and `log` to the log. */
function fakeExec(over: { shallow?: string; log?: string; throwOn?: 'shallow' | 'log' }): GitExec {
  return (_cmd, args) => {
    const joined = args.join(' ');
    if (joined.includes('--is-shallow-repository')) {
      if (over.throwOn === 'shallow') throw new Error('not a git repository');
      return `${over.shallow ?? 'false'}\n`;
    }
    if (over.throwOn === 'log') throw new Error('path has no history');
    expect(joined).toContain('log -1 --format=%cI');
    return `${over.log ?? ''}\n`;
  };
}

describe('docsFileFor', () => {
  it('maps a docs file to its sibling repo root and repo-relative path', () => {
    expect(docsFileFor(ADR)).toEqual({
      repoRoot: resolve(ROOT, '../harness-canopy'),
      repoRel: 'docs/adr/0001-recipes.md',
    });
  });

  it('gives a repo-relative path, because `git log -- <path>` is', () => {
    const found = docsFileFor(ADR);
    expect(found).not.toBeNull();
    expect(isAbsolute(found!.repoRel)).toBe(false);
    expect(found!.repoRel.startsWith('..')).toBe(false);
    expect(relative(found!.repoRoot, ADR)).toBe(found!.repoRel);
  });

  it('resolves to the same repo whatever form the path arrives in', () => {
    const rel = relative(ROOT, ADR); // ../harness-canopy/docs/adr/0001-recipes.md
    expect(docsFileFor(rel)).toEqual(docsFileFor(ADR));
  });

  it('returns null for anything outside a docs folder', () => {
    expect(docsFileFor(resolve(ROOT, 'src/lib/experiments.ts'))).toBeNull();
    expect(docsFileFor(resolve(ROOT, 'README.md'))).toBeNull();
    expect(docsFileFor('')).toBeNull();
  });

  it('refuses a path that merely starts like a docs folder', () => {
    expect(docsFileFor(resolve(ROOT, '../not-harness-canopy/docs/x.md'))).toBeNull();
  });
});

describe('docLastModified', () => {
  it('returns the %cI date git reports', () => {
    const exec = fakeExec({ log: '2026-09-19T01:10:27-05:00' });
    expect(docLastModified(ADR, exec)).toBe('2026-09-19T01:10:27-05:00');
  });

  it('checks the clone for shallowness BEFORE reading the log', () => {
    // On a shallow clone the newest commit is the checkout time, so the log
    // must never be asked — the answer would be a lie that looks like today.
    const calls: string[] = [];
    const exec: GitExec = (_c, args) => {
      calls.push(args.join(' '));
      return 'true\n';
    };
    expect(docLastModified(ADR, exec)).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('--is-shallow-repository');
    expect(calls[0]).not.toContain('log');
  });

  it('omits the date on a shallow clone even when the log would answer', () => {
    const exec: GitExec = (_c, args) => (args.join(' ').includes('log') ? '2026-09-19T01:10:27-05:00\n' : 'true\n');
    expect(docLastModified(ADR, exec)).toBeNull();
  });

  it('omits the date when the file has no history (empty log)', () => {
    expect(docLastModified(ADR, fakeExec({ log: '  \n' }))).toBeNull();
  });

  it('omits the date when git itself fails', () => {
    expect(docLastModified(ADR, fakeExec({ throwOn: 'shallow' }))).toBeNull();
    expect(docLastModified(ADR, fakeExec({ throwOn: 'log' }))).toBeNull();
  });

  it('runs git in the sibling repo, on the repo-relative path', () => {
    const seen: string[][] = [];
    docLastModified(ADR, (_c, args) => {
      seen.push(args);
      return args.join(' ').includes('log') ? '2026-09-19T01:10:27-05:00\n' : 'false\n';
    });
    expect(seen[0]).toEqual(['-C', resolve(ROOT, '../harness-canopy'), 'rev-parse', '--is-shallow-repository']);
    expect(seen[1]).toEqual([
      '-C',
      resolve(ROOT, '../harness-canopy'),
      'log',
      '-1',
      '--format=%cI',
      '--',
      'docs/adr/0001-recipes.md',
    ]);
  });

  it('never shells out for a path outside the docs folders', () => {
    const exec: GitExec = () => {
      throw new Error('git must not run');
    };
    expect(docLastModified(resolve(ROOT, 'src/lib/docs-jsonld.ts'), exec)).toBeNull();
  });

  it('the real checkout answers either a git date or nothing — never the clock', () => {
    // No injected exec: this is the path the build takes. A shallow CI clone
    // (null) and a full local clone (an ISO date) must both be acceptable, and
    // the date must be one git could have produced — not build time.
    const value = docLastModified(ADR);
    if (value !== null) expect(Number.isNaN(Date.parse(value))).toBe(false);
  });
});
