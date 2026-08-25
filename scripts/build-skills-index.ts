/**
 * Emits `/.well-known/agent-skills/index.json` — the Agent Skills Discovery
 * index (RFC v0.2.0) — from the skills vendored under `public/`.
 *
 * Runs in `postbuild`, over `dist/`, for one reason: the digest and the bytes
 * it describes have to come out of the same build. Computing digests anywhere
 * else — a checked-in manifest, a fetch at request time — lets the two drift,
 * and an index whose digests do not validate is worse than no index, since a
 * client that checks them concludes the artifact was tampered with.
 *
 * Only the five fields the schema defines are written. Provenance lives in
 * `src/data/skills-source.json`, which is a build input and is not served.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
const SITE = 'https://univerlab.org';
const WELL_KNOWN = ['.well-known', 'agent-skills'];

export interface SkillEntry {
  name: string;
  type: 'skill-md';
  description: string;
  url: string;
  digest: string;
}

/**
 * Reads `name` and `description` out of a SKILL.md's YAML front matter.
 *
 * Hand-rolled because the site carries no YAML parser and this needs exactly
 * two scalars — but it must understand block scalars (`>` and `|`), since
 * every description in this registry is written as a folded block and a naive
 * `key: value` reader returns an empty string for all of them.
 */
export function readFrontMatter(source: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---/.exec(source);
  if (!match) return {};

  const out: Record<string, string> = {};
  const lines = match[1].split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const keyed = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (!keyed) continue;

    const [, key, inline] = keyed;
    if (inline !== '>' && inline !== '|' && inline !== '>-' && inline !== '|-') {
      out[key] = inline.replace(/^["']|["']$/g, '').trim();
      continue;
    }

    // Block scalar: every following line indented deeper than the key belongs
    // to it. Folded (`>`) joins with spaces, literal (`|`) keeps the breaks;
    // the index wants one line either way, so both are collapsed.
    const block: string[] = [];
    while (i + 1 < lines.length && (lines[i + 1].trim() === '' || /^\s+\S/.test(lines[i + 1]))) {
      block.push(lines[i + 1].trim());
      i += 1;
    }
    out[key] = block.join(' ').replace(/\s+/g, ' ').trim();
  }

  return out;
}

export function digestOf(bytes: Buffer | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function buildIndex(skillsDir: string, site = SITE): { $schema: string; skills: SkillEntry[] } {
  const names = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const skills: SkillEntry[] = [];
  for (const name of names) {
    const skillPath = resolve(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;

    const bytes = readFileSync(skillPath);
    const front = readFrontMatter(bytes.toString('utf8'));
    skills.push({
      name: front.name || name,
      type: 'skill-md',
      description: front.description || '',
      url: `${site}/.well-known/agent-skills/${name}/SKILL.md`,
      digest: digestOf(bytes),
    });
  }

  return { $schema: SCHEMA, skills };
}

function main(): void {
  const skillsDir = resolve(process.cwd(), 'dist', ...WELL_KNOWN);
  if (!existsSync(skillsDir)) {
    console.log('build-skills-index: no vendored skills in dist/, skipping.');
    return;
  }

  const index = buildIndex(skillsDir);
  if (index.skills.length === 0) {
    console.log('build-skills-index: no SKILL.md found, skipping.');
    return;
  }

  writeFileSync(resolve(skillsDir, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`build-skills-index: indexed ${index.skills.length} skill(s).`);
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('build-skills-index.ts') ||
    process.argv[1].endsWith('build-skills-index.js'));
if (isDirectRun) {
  main();
}
