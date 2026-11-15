/**
 * Snapshots every published docs file's last-commit date before Astro starts.
 *
 * The build reads each docs date twice — once when the content collection
 * syncs (the visible "Last updated" line, via `src/plugins/docs-last-updated.ts`)
 * and once when the page renders (`dateModified`, via `src/layouts/DocsLayout.astro`)
 * — and those two moments run minutes apart. A sibling repo that commits in
 * between used to give the two renderings two different `git log` answers, and
 * `scripts/check-seo.ts` fails the build when the visible date disagrees with
 * `dateModified`. This script queries git once, up front, and writes the whole
 * table to `.astro/docs-last-modified.json`; `src/lib/doc-last-modified.ts`
 * reads that file instead of shelling out, so both renderings agree no matter
 * what the sibling repos do mid-build.
 *
 * Wired as `prebuild` (before `astro build` starts its content sync, which is
 * the first reader). The snapshot is gitignored build output, like `.astro`
 * itself — never a source of truth, only a per-build memo of one.
 *
 * Runs on plain Node (24+) via native type-stripping. Run on demand:
 * `node scripts/snapshot-docs-dates.ts`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, globSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { DOCS_BASES, isDocsExcluded } from '../src/data/docs-bases.ts';

const ROOT = process.cwd();
const OUT = resolve(ROOT, '.astro/docs-last-modified.json');

/** `git` in `repoRoot`, or `null` when git has nothing to say. */
function git(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** Absolute path -> `%cI` date or `null`, for every published docs file. */
export function snapshotDocsDates(root = ROOT): Record<string, string | null> {
  const table: Record<string, string | null> = {};
  for (const base of Object.values(DOCS_BASES)) {
    const docsRoot = resolve(root, base);
    if (!existsSync(docsRoot)) continue; // sibling not checked out — its pages cannot build either
    const repoRoot = resolve(root, base, '..');
    const shallow = git(repoRoot, ['rev-parse', '--is-shallow-repository']);
    // Same fail-open rules as `src/lib/doc-last-modified.ts`: a shallow clone
    // or an unreadable repo reports no date, never the checkout time.
    const noDate = shallow === 'true' || shallow === null;
    for (const file of globSync('**/*.md', { cwd: docsRoot })) {
      if (isDocsExcluded(file)) continue; // design records never build
      const abs = resolve(docsRoot, file);
      if (noDate) {
        table[abs] = null;
        continue;
      }
      const iso = git(repoRoot, ['log', '-1', '--format=%cI', '--', relative(repoRoot, abs)]);
      table[abs] = iso || null; // empty log = the file has no history yet
    }
  }
  return table;
}

function main(): void {
  const table = snapshotDocsDates();
  const files = Object.keys(table).sort();
  const dated = files.filter((f) => table[f] !== null).length;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(Object.fromEntries(files.map((f) => [f, table[f]])), null, 2)}\n`, 'utf-8');
  console.log(`snapshot-docs-dates: ${dated}/${files.length} published docs file(s) dated → .astro/docs-last-modified.json.`);
}

const isDirectRun = process.argv[1] && /(?:^|[/\\])snapshot-docs-dates\.(?:ts|js)$/.test(process.argv[1]);
if (isDirectRun) main();
