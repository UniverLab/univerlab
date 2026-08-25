/**
 * Tests for the Agent Skills Discovery index (RFC v0.2.0).
 *
 * Two things are worth holding here, and neither is the JSON shape for its
 * own sake. First, **the digest has to match the bytes actually served** — an
 * index whose digests do not validate is worse than no index, because a
 * client that checks them concludes the artifact was tampered with. Second,
 * **every description has to survive front-matter parsing**: every skill in
 * this registry writes its description as a YAML folded block, and a naive
 * `key: value` reader returns an empty string for all ten of them without
 * failing anything.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildIndex, digestOf, readFrontMatter } from '../../scripts/build-skills-index';

const SKILLS_DIR = resolve(__dirname, '..', '..', 'public', '.well-known', 'agent-skills');
const HEADERS = resolve(__dirname, '..', '..', 'public', '_headers');

describe('front matter reader', () => {
  it('reads a plain scalar', () => {
    expect(readFrontMatter('---\nname: texforge\n---\nbody').name).toBe('texforge');
  });

  it('reads a folded block scalar as one line', () => {
    const source = '---\nname: demo\ndescription: >\n  first line\n  second line\n---\n';
    expect(readFrontMatter(source).description).toBe('first line second line');
  });

  it('reads a literal block scalar as one line', () => {
    const source = '---\ndescription: |\n  first line\n  second line\n---\n';
    expect(readFrontMatter(source).description).toBe('first line second line');
  });

  it('stops a block scalar at the next key', () => {
    const source = '---\ndescription: >\n  folded text\nlicense: MIT\n---\n';
    const front = readFrontMatter(source);
    expect(front.description).toBe('folded text');
    expect(front.license).toBe('MIT');
  });

  it('returns nothing when there is no front matter', () => {
    expect(readFrontMatter('# just a heading\n')).toEqual({});
  });
});

describe('digest', () => {
  it('is a lowercase hex sha256 with the scheme prefix', () => {
    const digest = digestOf('hello');
    expect(digest).toBe(`sha256:${createHash('sha256').update('hello').digest('hex')}`);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

const vendored = existsSync(SKILLS_DIR);
const describeVendored = vendored ? describe : describe.skip;

describeVendored('index built from the vendored skills', () => {
  const index = vendored ? buildIndex(SKILLS_DIR) : { $schema: '', skills: [] };

  it('declares the discovery schema', () => {
    expect(index.$schema).toBe('https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  });

  it('indexes every vendored skill', () => {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(resolve(SKILLS_DIR, entry.name, 'SKILL.md')));
    expect(index.skills).toHaveLength(dirs.length);
    expect(index.skills.length).toBeGreaterThan(0);
  });

  it('carries exactly the schema fields on every entry', () => {
    for (const skill of index.skills) {
      expect(Object.keys(skill).sort()).toEqual(
        ['description', 'digest', 'name', 'type', 'url'].sort()
      );
    }
  });

  it('gives every skill a name, a type and a non-empty description', () => {
    for (const skill of index.skills) {
      expect(skill.name).toMatch(/^[a-z0-9-]+$/);
      expect(skill.type).toBe('skill-md');
      // The regression that this whole file exists for: a folded description
      // silently reduced to ''.
      expect(skill.description.length).toBeGreaterThan(0);
    }
  });

  it('points every url at an absolute path that resolves to a vendored file', () => {
    for (const skill of index.skills) {
      expect(skill.url).toMatch(
        /^https:\/\/univerlab\.org\/\.well-known\/agent-skills\/[a-z0-9-]+\/SKILL\.md$/
      );
      const relative = skill.url.replace('https://univerlab.org/.well-known/agent-skills/', '');
      expect(existsSync(resolve(SKILLS_DIR, relative))).toBe(true);
    }
  });

  it('digests the bytes it actually serves', () => {
    for (const skill of index.skills) {
      const relative = skill.url.replace('https://univerlab.org/.well-known/agent-skills/', '');
      expect(skill.digest).toBe(digestOf(readFileSync(resolve(SKILLS_DIR, relative))));
    }
  });
});

describe('_headers for the discovery paths', () => {
  const src = readFileSync(HEADERS, 'utf8');

  it('serves the index as JSON, cross-origin', () => {
    expect(src).toMatch(
      /^\/\.well-known\/agent-skills\/index\.json\n(?:.*\n)*?\s+Content-Type: application\/json/m
    );
    expect(src).toMatch(
      /^\/\.well-known\/agent-skills\/index\.json\n(?:.*\n)*?\s+Access-Control-Allow-Origin: \*/m
    );
  });

  it('serves the skills themselves as markdown, cross-origin', () => {
    expect(src).toMatch(
      /^\/\.well-known\/agent-skills\/\*\n(?:.*\n)*?\s+Content-Type: text\/markdown/m
    );
    expect(src).toMatch(
      /^\/\.well-known\/agent-skills\/\*\n(?:.*\n)*?\s+Access-Control-Allow-Origin: \*/m
    );
  });
});
