/**
 * Vendors the UniverLab skills registry into `public/` so the site can serve
 * the skills it advertises.
 *
 * Run by hand (`npm run sync:skills`) whenever the skills repo changes — never
 * during the build. Cloudflare Pages clones this repository alone, so the
 * source is simply not there at build time; and a build that reached out to
 * GitHub would publish digests for bytes that live on somebody else's server
 * and can change after the fact. Vendoring makes the artifact and its digest
 * the same deploy, and makes any drift show up as a reviewable diff.
 *
 * Whole directories are copied, not just SKILL.md: a skill's own references
 * are relative links, so `references/foo.md` next to it resolves for an HTTP
 * client exactly as it does on disk.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const SOURCE_REPO = 'https://github.com/UniverLab/skills';

/** Skill directory names, in registry order, from the source `skills.toml`. */
export function parseSkillNames(toml: string): string[] {
  const names: string[] = [];
  for (const line of toml.split('\n')) {
    const match = /^\s*\[skills\.([a-z0-9-]+)\]\s*$/.exec(line);
    if (match) names.push(match[1]);
  }
  return names;
}

function gitOutput(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function main(): void {
  const sourceDir = process.env.SKILLS_DIR
    ? resolve(process.env.SKILLS_DIR)
    : resolve(process.cwd(), '..', 'skills');

  if (!existsSync(resolve(sourceDir, 'skills.toml'))) {
    console.error(
      `sync-skills: no skills.toml under ${sourceDir}.\n` +
        'Point SKILLS_DIR at a checkout of ' + SOURCE_REPO + ' and run again.'
    );
    process.exit(1);
  }

  const names = parseSkillNames(readFileSync(resolve(sourceDir, 'skills.toml'), 'utf8'));
  if (names.length === 0) {
    console.error('sync-skills: skills.toml lists no skills; refusing to publish an empty index.');
    process.exit(1);
  }

  const targetDir = resolve(process.cwd(), 'public', '.well-known', 'agent-skills');
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });

  const copied: string[] = [];
  for (const name of names) {
    const from = resolve(sourceDir, name);
    if (!existsSync(resolve(from, 'SKILL.md'))) {
      console.warn(`sync-skills: ${name} has no SKILL.md; skipped.`);
      continue;
    }
    cpSync(from, resolve(targetDir, name), {
      recursive: true,
      filter: (src) => !src.includes('/.git'),
    });
    copied.push(name);
  }

  // Provenance is a build input, not something served: the index itself stays
  // strictly to the discovery schema. A dirty source tree still syncs — the
  // copy is self-contained — but the commit recorded here would be a lie, so
  // say so loudly rather than writing it down quietly.
  const commit = gitOutput(sourceDir, ['rev-parse', 'HEAD']);
  const dirty = gitOutput(sourceDir, ['status', '--porcelain']) !== '';
  if (dirty) {
    console.warn('sync-skills: source tree has uncommitted changes; recorded commit is approximate.');
  }

  const dataDir = resolve(process.cwd(), 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    resolve(dataDir, 'skills-source.json'),
    JSON.stringify({ repo: SOURCE_REPO, commit, dirty, skills: copied }, null, 2) + '\n',
    'utf8'
  );

  console.log(`sync-skills: vendored ${copied.length} skill(s) from ${commit.slice(0, 8)}.`);
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('sync-skills.ts') || process.argv[1].endsWith('sync-skills.js'));
if (isDirectRun) {
  main();
}
