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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

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

describe('prebuild snapshot', () => {
  // The build renders each docs page twice — once when the content collection
  // syncs (the visible "Last updated" line) and once when the page renders
  // (dateModified). A sibling repo that commits between those two moments used
  // to give the two renderings two different git dates and fail check-seo, so
  // `prebuild` snapshots every docs date to one file and both call sites read
  // that file instead of shelling out. UNIVERLAB_DOCS_DATES_SNAPSHOT points the
  // lookup at a fixture so these tests never touch the real snapshot.
  const SNAP_KEY = 'UNIVERLAB_DOCS_DATES_SNAPSHOT';
  const probe = resolve(ROOT, '../facetmedia/docs/__snapshot-probe.md');
  // A real sibling file no other test queries, so the module memo cannot leak
  // across tests: git would answer a date for it, the closed world answers
  // null.
  const realSibling = resolve(ROOT, '../facetmedia/docs/commands.md');

  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'docs-dates-'));
    process.env[SNAP_KEY] = join(dir, 'snapshot.json');
  });
  afterEach(() => {
    delete process.env[SNAP_KEY];
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers from the snapshot — git could never produce this date', () => {
    // `probe` exists in no checkout: git answers null for it, so a date here
    // proves the snapshot, not a subprocess, is the source.
    writeFileSync(process.env[SNAP_KEY]!, JSON.stringify({ [probe]: '2026-11-13T17:40:14-05:00' }));
    expect(docLastModified(probe)).toBe('2026-11-13T17:40:14-05:00');
  });

  it('treats a present snapshot as a closed world: absent key means no date', () => {
    // The snapshot names only `probe`, so `realSibling` is absent — and the
    // file on disk really does have history, so null here proves the lookup
    // never falls through to git while a snapshot is present.
    writeFileSync(process.env[SNAP_KEY]!, JSON.stringify({ [probe]: '2026-11-13T17:40:14-05:00' }));
    expect(docLastModified(realSibling)).toBeNull();
  });

  it('fails open to git when the snapshot is unparseable', () => {
    // Garbage bytes are the same as no snapshot: the lookup shells out. A
    // dedicated sibling file (no other test queries it, so the memo is cold)
    // with real history proves git ran by answering a date.
    writeFileSync(process.env[SNAP_KEY]!, 'not json{');
    const value = docLastModified(resolve(ROOT, '../facetmedia/docs/preview.md'));
    expect(value).not.toBeNull();
    expect(Number.isNaN(Date.parse(value!))).toBe(false);
  });
});
