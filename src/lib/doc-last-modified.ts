/**
 * The last time a docs source file actually changed, read from git.
 *
 * The freshness date on a docs page is not a build timestamp: a build that ran
 * one minute ago says nothing about when the document was written, and a
 * `dateModified` of "now" on every page is exactly the lie that makes
 * `dateModified` worthless to search and generative engines. The only honest
 * source is the file's own history in its own repository, so the date comes
 * from `git log -1 --format=%cI -- <file>` run in the sibling checkout the
 * page was rendered from.
 *
 * Two guards keep that honest:
 *
 *  - **Shallow check first.** A shallow clone's newest commit is its checkout
 *    time, so `git log -1` on one would report "the page was refreshed today"
 *    forever. `rev-parse --is-shallow-repository` runs *before* the log; when
 *    it answers `true` the date is omitted rather than guessed.
 *  - **Fail open to "no date".** A missing checkout, a file with no history, a
 *    broken git, a path outside `DOCS_BASES` — all return `null`, and a page
 *    with no date simply renders no date (FR4) and emits no `dateModified`
 *    (FR3). Never the build time, never a zero date.
 *
 * `git log -- <path>` needs a repo-relative path and must run with
 * `-C <repoRoot>`: passing `../harness-canopy/docs/x.md` matches nothing, which
 * is the silent version of the same bug — so `docsFileFor` resolves the repo
 * root and the in-repo path once, and everything downstream uses that pair.
 */
import { execFileSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';
import { DOCS_BASES } from '../data/docs-bases';

/** Build cwd is the project root (npm scripts and jest both run from there). */
const ROOT = process.cwd();

/** How a `git` invocation is run. Injectable so the branches are testable
 *  without a repository; the default is what the build uses. */
export type GitExec = (cmd: string, args: string[]) => string;

const runGit: GitExec = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * Which sibling repository a document belongs to, and where it sits inside it.
 *
 * Returns `null` for anything that is not one of the experiment docs folders —
 * "not ours" is a real answer, not an error, because the markdown pipeline also
 * compiles this repository's own files.
 */
export function docsFileFor(absPath: string): { repoRoot: string; repoRel: string } | null {
  if (!absPath) return null;
  const target = resolve(ROOT, absPath);
  for (const base of Object.values(DOCS_BASES)) {
    const docsRoot = resolve(ROOT, base);
    const within = relative(docsRoot, target);
    // `within` is '' when the path *is* the docs folder, and starts with '..'
    // when it escapes it — neither is a file of that collection.
    if (!within || within.startsWith('..') || isAbsolute(within)) continue;
    const repoRoot = resolve(ROOT, base, '..');
    return { repoRoot, repoRel: relative(repoRoot, target) };
  }
  return null;
}

/** Per-absolute-path memo: the plugin (rendering the markdown) and the layout
 *  (building the JSON-LD) ask the same question twice per document, and their
 *  two answers must not disagree. Only the real `git` path is memoized — an
 *  injected `exec` in a test always runs. */
const cache = new Map<string, string | null>();

function lastModified(absPath: string, exec: GitExec): string | null {
  const where = docsFileFor(absPath);
  if (!where) return null;
  const { repoRoot, repoRel } = where;

  let shallow: string;
  try {
    shallow = exec('git', ['-C', repoRoot, 'rev-parse', '--is-shallow-repository']).trim();
  } catch {
    return null; // no git, no repo, unreadable — no date, never a fake one
  }
  if (shallow === 'true') return null;

  try {
    const iso = exec('git', ['-C', repoRoot, 'log', '-1', '--format=%cI', '--', repoRel]).trim();
    return iso || null; // empty log = the file has no history yet
  } catch {
    return null;
  }
}

/**
 * The commit date of a docs source file as `git log --format=%cI` reports it
 * (`2026-09-19T01:10:27-05:00`), or `null` when there is no trustworthy date.
 */
export function docLastModified(absPath: string, exec?: GitExec): string | null {
  const key = resolve(ROOT, absPath);
  if (exec) return lastModified(key, exec);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = lastModified(key, runGit);
  cache.set(key, value);
  return value;
}
