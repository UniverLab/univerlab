/**
 * Covers the indexing recovery work of 2026-09-28: the sitemap, the `_md` link
 * rewrite, the redirect generator, and the check script that guards all three.
 *
 * The pure helpers are tested against fixtures so the suite needs no `dist/`;
 * the checked-in sources (`astro.config.mjs`, `public/_redirects`, the today
 * pages, the removed stubs) are asserted directly, which is what catches a
 * regression at PR time rather than after the next deploy.
 */
import { existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import docsMdLinks, { inferExperimentId, matchDocsBase, rewriteMdHref } from '../plugins/docs-md-links';
import {
  BEGIN,
  END,
  STATIC_RULES,
  docsMdRules,
  docsRenameRules,
  docsRoute,
  generatedBlock,
  readDocsRedirects,
  spliceGeneratedBlock,
} from '../../scripts/build-redirects';
import {
  checkDocsLinks,
  checkLlmsTxt,
  checkRedirects,
  checkSitemap,
  htmlFileForPath,
} from '../../scripts/check-seo';

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

const SITEMAP_INDEX = '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://univerlab.org/sitemap-0.xml</loc></sitemap></sitemapindex>';
const page = (extra = '') => `<!doctype html><html><head><title>T</title>${extra}</head><body></body></html>`;
const NOINDEX = '<meta name="robots" content="noindex, nofollow" />';

describe('rewriteMdHref — docs-relative markdown links become site routes', () => {
  it('rewrites a bare sibling .md link to the trailing-slash route', () => {
    expect(rewriteMdHref('builds.md', 'gitkit').href).toBe('/gitkit/docs/builds/');
  });

  it('keeps the anchor, separated by the route slash', () => {
    // The exact shape Google needs: /gitkit/docs/hooks/#hook-health
    expect(rewriteMdHref('hooks.md#hook-health', 'gitkit').href).toBe('/gitkit/docs/hooks/#hook-health');
  });

  it('rewrites ./ prefixed links', () => {
    expect(rewriteMdHref('./hooks.md', 'gitkit').href).toBe('/gitkit/docs/hooks/');
  });

  it('rewrites nested relative links', () => {
    expect(rewriteMdHref('./adr/0001-recipes.md', 'canopy').href).toBe('/canopy/docs/adr/0001-recipes/');
  });

  it('maps index.md to the collection root', () => {
    expect(rewriteMdHref('index.md', 'canopy').href).toBe('/canopy/docs/');
  });

  it('leaves absolute, external and in-page links alone', () => {
    for (const href of [
      '/gitkit/docs/builds/',
      'https://example.com/foo.md',
      'http://example.com/foo.md',
      '//example.com/foo.md',
      'mailto:a@b.c',
      'data:text/plain,foo.md',
      '#section',
      '',
    ]) {
      expect(rewriteMdHref(href, 'gitkit')).toEqual({ href, rewritten: false });
    }
  });

  it('leaves a relative link that is not markdown alone', () => {
    expect(rewriteMdHref('builds', 'gitkit')).toEqual({ href: 'builds', rewritten: false });
  });

  describe('links that escape the docs folder', () => {
    it('points the repository README at the experiment page, dropping the fragment', () => {
      // harness-canopy/docs/installation.md links ../README.md#requirements.
      // The repo README is not published, so /canopy/ is the closest true
      // target; the fragment names a heading that does not exist here.
      expect(rewriteMdHref('../README.md#requirements', 'canopy', '')).toEqual({ href: '/canopy/', rewritten: true });
    });

    it('reaches the README from a nested page only via enough `../`', () => {
      // From docs/adr/x.md, ../README.md is docs/README.md — not the repo root.
      expect(rewriteMdHref('../README.md', 'canopy', 'adr')).toEqual({ href: '../README.md', rewritten: false });
      expect(rewriteMdHref('../../README.md', 'canopy', 'adr')).toEqual({ href: '/canopy/', rewritten: true });
    });

    it('leaves other escaping links alone', () => {
      for (const href of ['../CONTRIBUTING.md', '../../LICENSE.md', '../../../etc/passwd.md']) {
        expect(rewriteMdHref(href, 'canopy', 'adr')).toEqual({ href, rewritten: false });
      }
    });

    it('treats a top-level document as docDir ""', () => {
      expect(rewriteMdHref('../README.md', 'canopy')).toEqual({ href: '/canopy/', rewritten: true });
    });
  });
});

describe('matchDocsBase', () => {
  it('resolves a sibling checkout to the site id, not the repo name', () => {
    // harness-canopy is the repository; canopy is the site id.
    expect(matchDocsBase('/srv/harness-canopy/docs/quickstart.md')).toEqual({ id: 'canopy', dir: '' });
  });

  it('reports the document directory within the collection', () => {
    expect(matchDocsBase('/srv/harness-canopy/docs/adr/0001-recipes.md')).toEqual({ id: 'canopy', dir: 'adr' });
  });

  it('does not match a longer directory that merely ends the same way', () => {
    expect(matchDocsBase('/srv/not-harness-canopy/docs/x.md')).toBeNull();
  });

  it('returns null for markdown outside a docs collection', () => {
    expect(matchDocsBase('/srv/univerlab/README.md')).toBeNull();
    expect(matchDocsBase('')).toBeNull();
  });
});

describe('inferExperimentId', () => {
  it('is the id half of matchDocsBase', () => {
    expect(inferExperimentId('/srv/gitkit/docs/builds.md')).toBe('gitkit');
    expect(inferExperimentId('/srv/univerlab/src/pages/index.md')).toBeNull();
  });
});

describe('docs-md-links plugin', () => {
  /** Drive the Sätteri visitor the way the compiler does, and read hrefs back. */
  const run = (hrefs: string[], fileURL: string) => {
    const nodes = hrefs.map((href) => ({ type: 'element', tagName: 'a', properties: { href } }));
    const ctx = {
      fileURL: new URL(fileURL),
      data: {},
      setProperty(node: any, key: string, value: unknown) {
        node.properties[key] = value;
      },
    };
    for (const visitor of [docsMdLinks.element].flat()) {
      if (!visitor) continue;
      for (const node of nodes) if (visitor.filter.includes(node.tagName)) visitor.visit(node as any, ctx as any);
    }
    return nodes.map((n) => n.properties.href);
  };

  it('rewrites anchors of a docs collection', () => {
    expect(run(['builds.md', 'hooks.md#hook-health'], 'file:///srv/gitkit/docs/quickstart.md'))
      .toEqual(['/gitkit/docs/builds/', '/gitkit/docs/hooks/#hook-health']);
  });

  it('passes everything through for markdown outside a docs collection', () => {
    // Fail-open: the landing's own prose may link markdown on purpose, and
    // scripts/check-seo.ts is what catches a survivor in dist/.
    expect(run(['foo.md', 'https://example.com/bar.md'], 'file:///srv/univerlab/README.md'))
      .toEqual(['foo.md', 'https://example.com/bar.md']);
  });

  it('rewrites an escaping README link from a top-level docs page', () => {
    // The real link: harness-canopy/docs/installation.md:59
    expect(run(['../README.md#if-no-platform-is-installed'], 'file:///srv/harness-canopy/docs/installation.md'))
      .toEqual(['/canopy/']);
  });

  it('ignores anchors whose href is not a string', () => {
    expect(run([undefined as unknown as string], 'file:///srv/gitkit/docs/quickstart.md')).toEqual([undefined]);
  });
});

describe('docs-redirects.json', () => {
  it('maps canopy loops and workflows to graphs', () => {
    expect(readDocsRedirects()).toEqual({ canopy: { loops: 'graphs', workflows: 'graphs' } });
  });

  it('renders one rule per renamed page', () => {
    expect(docsRenameRules({ canopy: { loops: 'graphs', workflows: 'graphs' } })).toEqual([
      '/canopy/docs/loops/ /canopy/docs/graphs/ 301',
      '/canopy/docs/workflows/ /canopy/docs/graphs/ 301',
    ]);
  });

  it('treats index as the collection root', () => {
    expect(docsRoute('gitkit', 'index')).toBe('/gitkit/docs/');
    expect(docsRoute('gitkit', 'builds')).toBe('/gitkit/docs/builds/');
  });
});

describe('build-redirects', () => {
  it('emits a .md rule per docs page of every collection', () => {
    const rules = docsMdRules({ gitkit: '../gitkit/docs' });
    expect(rules).toContain('/gitkit/docs/builds.md /gitkit/docs/builds/ 301');
    expect(rules).toContain('/gitkit/docs/index.md /gitkit/docs/ 301');
    expect(rules).toContain('/gitkit/docs/hooks.md /gitkit/docs/hooks/ 301');
  });

  it('skips a collection whose checkout is absent', () => {
    expect(docsMdRules({ missing: '../no-such-repo/docs' })).toEqual([]);
  });

  it('sorts the generated block so rebuilds are byte-identical', () => {
    const block = generatedBlock({ gitkit: '../gitkit/docs' });
    expect(block).toBe(generatedBlock({ gitkit: '../gitkit/docs' }));
    const lines = block.split('\n').slice(1, -1);
    expect(lines).toEqual([...lines].sort());
  });

  it('replaces only the generated block, leaving hand rules untouched', () => {
    const current = '/sitemap.xml /sitemap-index.xml 301\n/experiments /#experiments 301\n';
    const next = spliceGeneratedBlock(current, 'GEN');
    expect(next).toBe('/sitemap.xml /sitemap-index.xml 301\n/experiments /#experiments 301\n\nGEN\n');
  });

  it('rebuilds an existing generated block in place, without duplicating it', () => {
    const current = `/sitemap.xml /sitemap-index.xml 301\n\n${BEGIN}\n/stale\n${END}\n`;
    const once = spliceGeneratedBlock(current, `${BEGIN}\n/kept\n${END}`);
    expect(once).toBe(`/sitemap.xml /sitemap-index.xml 301\n\n${BEGIN}\n/kept\n${END}\n`);
    expect(spliceGeneratedBlock(once, `${BEGIN}\n/kept\n${END}`)).toBe(once);
  });

  it('replaces a block whose marker text was reworded, rather than appending beside it', () => {
    const current = '/sitemap.xml /sitemap-index.xml 301\n\n# BEGIN GENERATED (old wording)\n/stale\n# END GENERATED (old wording)\n';
    const once = spliceGeneratedBlock(current, `${BEGIN}\n/kept\n${END}`);
    expect(once).toBe(`/sitemap.xml /sitemap-index.xml 301\n\n${BEGIN}\n/kept\n${END}\n`);
  });
});

describe('checked-in public/_redirects', () => {
  const lines = read('public/_redirects').split('\n').map((l) => l.trim());
  const rules = lines.filter((l) => l && !l.startsWith('#'));

  it('keeps the sitemap rule', () => {
    expect(rules).toContain('/sitemap.xml /sitemap-index.xml 301');
  });

  it.each(STATIC_RULES)('contains the static rule %j', (rule) => {
    expect(rules).toContain(rule);
  });

  it('never puts a splat on the right of a rule', () => {
    // Pages rewrites `*` to `:splat`; a bare `*` target would not match.
    for (const rule of rules) expect(rule.split(/\s+/)[1]).not.toMatch(/\*/);
  });

  it('orders the specific retired routes above the es docs catch-all', () => {
    expect(rules.indexOf('/es/status /status/ 301')).toBeLessThan(rules.indexOf('/es/:id/docs/* /:id/docs/:splat 301'));
  });

  it('has the canopy loops rename after generation', () => {
    expect(rules).toContain('/canopy/docs/loops/ /canopy/docs/graphs/ 301');
    expect(rules).toContain('/canopy/docs/workflows/ /canopy/docs/graphs/ 301');
  });

  it('has a .md rule for a docs page Google already crawled', () => {
    expect(rules).toContain('/gitkit/docs/builds.md /gitkit/docs/builds/ 301');
  });
});

describe('astro.config.mjs', () => {
  const config = read('astro.config.mjs');

  it('still uses trailingSlash: ignore (pinned by canonical-urls.test.ts)', () => {
    expect(config).toContain("trailingSlash: 'ignore'");
  });

  it('registers the docs markdown-link plugin on the Sätteri processor', () => {
    // `markdown.rehypePlugins` is the legacy unified pipeline and no longer
    // resolves on Astro 7, where Sätteri is the default processor.
    expect(config).toContain('processor: satteri({ hastPlugins: [docsMdLinks] })');
    expect(config).not.toContain('rehypePlugins');
  });

  it('filters today out of the sitemap', () => {
    expect(config).toContain('SITEMAP_EXCLUDED');
    for (const p of ['/today', '/es/today']) expect(config).toContain(`'${p}'`);
  });
});

describe('noindex placement', () => {
  it.each(['src/pages/today.astro', 'src/pages/es/today.astro'])('%s sets noindex', (p) => {
    expect(read(p)).toMatch(/<BaseLayout[^>]*\bnoindex\b/);
  });

  it.each(['src/pages/archive.astro', 'src/pages/es/archive.astro'])('%s stays indexable', (p) => {
    expect(read(p)).not.toContain('noindex');
  });
});

describe('removed Astro.redirect stubs', () => {
  it.each([
    'src/pages/experiments/index.astro',
    'src/pages/es/experiments/index.astro',
    'src/pages/es/status.astro',
  ])('%s is gone, so no meta-refresh noindex page builds', (p) => {
    // A stub built HTML with <meta name="robots" content="noindex"> and still
    // entered the sitemap — that is the "Excluded by noindex" error. The
    // `_redirects` rules replace them.
    expect(existsSync(resolve(ROOT, p))).toBe(false);
  });

  it('no other page uses Astro.redirect', () => {
    for (const file of globSync('src/pages/**/*.astro', { cwd: ROOT })) {
      expect(read(file)).not.toContain('Astro.redirect');
    }
  });
});

describe('public/llms.txt', () => {
  it('links only canonical trailing-slash routes', () => {
    for (const m of read('public/llms.txt').matchAll(/https:\/\/univerlab\.org(\/[^)\s]*)?/g)) {
      const path = m[1] ?? '/';
      expect(path === '/' || path.endsWith('/') || /\/[^/]+\.[a-z0-9]+$/i.test(path)).toBe(true);
    }
  });
});

describe('check-seo', () => {
  it('htmlFileForPath resolves a page route to its built file', () => {
    const dist = distFixture({ 'index.html': page(), 'gitkit/docs/index.html': page() });
    expect(htmlFileForPath('/', dist)).toBe(resolve(dist, 'index.html'));
    expect(htmlFileForPath('/gitkit/docs/', dist)).toBe(resolve(dist, 'gitkit/docs/index.html'));
    expect(htmlFileForPath('/nope/', dist)).toBeNull();
  });

  it('passes a clean tree', () => {
    const dist = distFixture({
      'sitemap-index.xml': SITEMAP_INDEX,
      'sitemap-0.xml': '<urlset><url><loc>https://univerlab.org/</loc></url><url><loc>https://univerlab.org/gitkit/docs/</loc></url></urlset>',
      'index.html': page(),
      'gitkit/docs/index.html': page(),
      '_redirects': ['/sitemap.xml /sitemap-index.xml 301', ...STATIC_RULES].join('\n'),
      'llms.txt': '- [Home](https://univerlab.org/)\n',
    });
    try {
      expect(checkSitemap(dist)).toEqual([]);
      expect(checkDocsLinks(dist)).toEqual([]);
      expect(checkLlmsTxt(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a sitemap URL that is noindex (the "Excluded by noindex" report)', () => {
    const dist = distFixture({
      'sitemap-index.xml': SITEMAP_INDEX,
      'sitemap-0.xml': '<urlset><url><loc>https://univerlab.org/today/</loc></url></urlset>',
      'today/index.html': page(NOINDEX),
    });
    try {
      expect(checkSitemap(dist)).toEqual([
        'sitemap: https://univerlab.org/today/ is noindex — drop it from the sitemap filter instead',
      ]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a sitemap URL with no built HTML file', () => {
    const dist = distFixture({
      'sitemap-index.xml': SITEMAP_INDEX,
      'sitemap-0.xml': '<urlset><url><loc>https://univerlab.org/gone/</loc></url></urlset>',
    });
    try {
      expect(checkSitemap(dist)).toEqual(['sitemap: https://univerlab.org/gone/ has no built HTML file']);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('reports an empty sitemap rather than passing vacuously', () => {
    const dist = distFixture({ 'sitemap-index.xml': SITEMAP_INDEX });
    try {
      expect(checkSitemap(dist)[0]).toMatch(/no <loc> found/);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('accepts the checked-in _redirects', () => {
    expect(checkRedirects(resolve(ROOT, 'public'))).toEqual([]);
  });

  it('flags a dropped static rule and a missing docs rename', () => {
    const dist = distFixture({ '_redirects': '/sitemap.xml /sitemap-index.xml 301\n' });
    try {
      const failures = checkRedirects(dist);
      expect(failures).toContain('_redirects: missing static rule "/es/status /status/ 301"');
      expect(failures).toContain('_redirects: missing docs rename rule "/canopy/docs/loops/ /canopy/docs/graphs/ 301"');
      expect(failures).toContain('_redirects: /gitkit/docs/builds.md is crawled as a URL but has no rule');
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a .md href surviving into a built docs page', () => {
    const dist = distFixture({
      'gitkit/docs/quickstart/index.html': page('<a href="hooks.md#hook-health">hooks</a>'),
    });
    try {
      expect(checkDocsLinks(dist)).toEqual([
        'gitkit/docs/quickstart/index.html: links to markdown URL "hooks.md#hook-health"',
      ]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a non-canonical llms.txt URL', () => {
    const dist = distFixture({ 'llms.txt': '- [GitKit](https://univerlab.org/gitkit)\n' });
    try {
      expect(checkLlmsTxt(dist)).toEqual([
        'llms.txt: "https://univerlab.org/gitkit" is not the canonical trailing-slash form',
      ]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('allows the root, a directory and a file URL in llms.txt', () => {
    const dist = distFixture({
      'llms.txt': ['https://univerlab.org/', 'https://univerlab.org/canopy/', 'https://univerlab.org/feed.xml'].join('\n'),
    });
    try {
      expect(checkLlmsTxt(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
