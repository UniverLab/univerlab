/**
 * The `DOCS_EXCLUDE` rule of 2026-09-29: `docs/` is published documentation
 * only, so a design record under `adr/`, `decisions/`, `design/` or `internal/`
 * must never build a page. One list (`src/data/docs-bases.ts`) is spread by the
 * content collections' glob, the link-rewrite plugin and the redirects
 * generator; this covers all three plus the check that sees `dist/`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { DOCS_EXCLUDE, isDocsExcluded } from '../data/docs-bases';
import { DOCS_EXCLUDED_REDIRECTS, docsMdRules, generatedBlock } from '../../scripts/build-redirects';
import { checkDocsExcluded, checkDocsLinks } from '../../scripts/check-seo';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** A throwaway `dist/`-shaped tree for the check-script tests. */
function distFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'seo-'));
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, content, 'utf-8');
  }
  return dir;
}

const page = (extra = '') => `<!doctype html><html><head><title>T</title>${extra}</head><body></body></html>`;

describe('DOCS_EXCLUDE — design records shared by the three consumers', () => {
  it('is the one literal list every consumer spreads', () => {
    expect([...DOCS_EXCLUDE]).toEqual(['adr/**', 'decisions/**', 'design/**', 'internal/**']);
    expect(read('src/content.config.ts')).toContain('...DOCS_EXCLUDE.map((p) => `!${p}`)');
  });

  it('matches excluded paths and nothing published', () => {
    for (const rel of [
      'adr/0001-recipes.md',
      'decisions/browser-events.md',
      'design/x.md',
      'internal/z.md',
      'adr/nested/deep.md',
      './ADR/0001.MD',
    ]) {
      expect(isDocsExcluded(rel)).toBe(true);
    }
    for (const rel of ['index.md', 'graphs.md', 'addressing.md', 'guide/adr-notes.md']) {
      expect(isDocsExcluded(rel)).toBe(false);
    }
  });

  it('skips excluded files in docsMdRules and emits the excluded redirects sorted', () => {
    const root = mkdtempSync(join(tmpdir(), 'docs-redirects-'));
    try {
      mkdirSync(join(root, 'sibling', 'docs', 'adr'), { recursive: true });
      writeFileSync(join(root, 'sibling', 'docs', 'index.md'), '# Home\n', 'utf-8');
      writeFileSync(join(root, 'sibling', 'docs', 'adr', '0001.md'), '# ADR\n', 'utf-8');
      expect(docsMdRules({ ghost: 'sibling/docs' }, root)).toEqual([
        '/ghost/docs/index.md /ghost/docs/ 301',
      ]);
      const block = generatedBlock({ ghost: 'sibling/docs' }, root);
      for (const rule of DOCS_EXCLUDED_REDIRECTS) {
        expect(block).toContain(rule);
      }
      const lines = block.split('\n').slice(1, -1);
      expect([...lines].sort()).toEqual(lines);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('flags a built page from an excluded path', () => {
    const dist = distFixture({ 'canopy/docs/adr/0001-recipes/index.html': page() });
    try {
      expect(checkDocsExcluded(dist)).toEqual([
        '/canopy/docs/adr/0001-recipes/: built from excluded path adr/0001-recipes/',
      ]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
    const clean = distFixture({ 'canopy/docs/graphs/index.html': page() });
    try {
      expect(checkDocsExcluded(clean)).toEqual([]);
    } finally {
      rmSync(clean, { recursive: true, force: true });
    }
  });

  it('tolerates the GitHub .md URLs the plugin itself produces', () => {
    // The plugin MUST rewrite a link into an excluded record to a GitHub URL,
    // and that URL legitimately ends in `.md` — checkDocsLinks only hunts
    // in-site markdown hrefs, or a correct build would fail its own check.
    const dist = distFixture({
      'canopy/docs/graphs/index.html': page(
        '<a href="https://github.com/UniverLab/harness-canopy/blob/main/docs/adr/0001-recipes.md">the record</a>',
      ),
    });
    try {
      expect(checkDocsLinks(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('curls every excluded URL through the built _redirects to the docs index', () => {
    const rules = read('public/_redirects')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.trim().split(/\s+/));
    const follow = (url: string): string => {
      const hit = rules.find(([from]) => from === url);
      return hit ? hit[1] : url;
    };
    for (const url of [
      '/canopy/docs/adr/0001-recipes/',
      '/canopy/docs/adr/0001-recipes.md',
      '/canopy/docs/adr/0001-recipes/index.md',
    ]) {
      expect(follow(url)).toBe('/canopy/docs/');
    }
    for (const url of [
      '/demostage/docs/decisions/browser-events/',
      '/demostage/docs/decisions/browser-events.md',
      '/demostage/docs/decisions/browser-events/index.md',
    ]) {
      expect(follow(url)).toBe('/demostage/docs/');
    }
  });
});
