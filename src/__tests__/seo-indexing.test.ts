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
  checkDocsPages,
  checkJsonLd,
  checkLlmsTxt,
  checkMetaDescriptions,
  checkRedirects,
  checkSitemap,
  checkTitles,
  decodeTitle,
  htmlFileForPath,
  jsonLdBlocks,
  jsonLdStats,
} from '../../scripts/check-seo';
import { composeDocsDescription, truncateAtWord } from '../lib/docs-description';
import { composeDocsTitle } from '../lib/docs-title';

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

  it('registers the docs markdown-link and last-updated plugins on the Sätteri processor', () => {
    // `markdown.rehypePlugins` is the legacy unified pipeline and no longer
    // resolves on Astro 7, where Sätteri is the default processor.
    expect(config).toContain('processor: satteri({ hastPlugins: [docsMdLinks, docsLastUpdated] })');
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

describe('checkMetaDescriptions', () => {
  const desc = (n: number, ch = 'x') => ch.repeat(n);
  const meta = (d: string) => `<meta name="description" content="${d}" />`;

  it('passes distinct descriptions inside 120–160', () => {
    const dist = distFixture({
      'index.html': page(meta(desc(140, 'a'))),
      'canopy/index.html': page(meta(desc(160, 'b'))),
    });
    try {
      expect(checkMetaDescriptions(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a too-short description with URL and length', () => {
    const dist = distFixture({ 'index.html': page(meta(desc(99, 'a'))) });
    try {
      expect(checkMetaDescriptions(dist)).toEqual(['/: description is 99 chars (want 120–160)']);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a too-long description with URL and length', () => {
    const dist = distFixture({ 'gitkit/docs/hooks/index.html': page(meta(desc(194, 'h'))) });
    try {
      expect(checkMetaDescriptions(dist)).toEqual([
        '/gitkit/docs/hooks/: description is 194 chars (want 120–160)',
      ]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a missing description tag', () => {
    const dist = distFixture({ 'index.html': page() });
    try {
      expect(checkMetaDescriptions(dist)).toEqual(['/: no meta description']);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('skips noindex pages', () => {
    const dist = distFixture({ 'today/index.html': page(NOINDEX + meta(desc(40, 't'))) });
    try {
      expect(checkMetaDescriptions(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags an exact duplicate across two indexable pages', () => {
    const shared = desc(150, 'd');
    const dist = distFixture({
      'index.html': page(meta(shared)),
      'es/index.html': page(meta(shared)),
    });
    try {
      expect(checkMetaDescriptions(dist)).toEqual(['/es/: description duplicates / (150 chars)']);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

describe('checkTitles', () => {
  const titled = (t: string) => `<!doctype html><html><head><title>${t}</title></head><body></body></html>`;
  const s = (n: number, ch = 'a') => ch.repeat(n);

  it('passes distinct titles inside 30–60', () => {
    const dist = distFixture({
      'index.html': titled('Open-source CLI tools for LaTeX, git, CAD — UniverLab'),
      'gitkit/index.html': titled('Git hooks are underused. GitKit puts them to work.'),
    });
    try {
      expect(checkTitles(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a too-short title with URL and length', () => {
    const dist = distFixture({ 'feed/index.html': titled(s(29)) });
    try {
      expect(checkTitles(dist)).toEqual(['/feed/: title is 29 chars (want 30–60)']);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a too-long title with URL and length', () => {
    const dist = distFixture({ 'index.html': titled(s(61, 'h')) });
    try {
      expect(checkTitles(dist)).toEqual(['/: title is 61 chars (want 30–60)']);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a page with no <title> element', () => {
    const dist = distFixture({
      'feed/index.html': '<!doctype html><html><head></head><body></body></html>',
    });
    try {
      expect(checkTitles(dist)).toEqual(['/feed/: no title']);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('skips noindex pages', () => {
    const dist = distFixture({ 'today/index.html': `<head>${NOINDEX}<title>${s(5, 't')}</title></head>` });
    try {
      expect(checkTitles(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags an exact duplicate across two indexable pages', () => {
    const shared = 'Mission Log RSS feed — UniverLab';
    expect(shared.length).toBe(32);
    const dist = distFixture({
      'feed/index.html': titled(shared),
      'es/feed/index.html': titled(shared),
    });
    try {
      expect(checkTitles(dist)).toEqual(['/es/feed/: title duplicates /feed/ (32 chars)']);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('measures the decoded title, so entities count as one character', () => {
    // Raw markup is 65 chars — it only passes because `&amp;` decodes to `&`.
    const raw = `${s(16)} &amp; ${s(16)} &amp; ${s(19, 'c')}`;
    expect(raw.length).toBe(65);
    expect(decodeTitle(raw).length).toBe(57);
    const dist = distFixture({ 'index.html': titled(raw) });
    try {
      expect(checkTitles(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('decodeTitle reverses every entity Astro escapes into a title', () => {
    expect(decodeTitle('A &amp; B &lt;tag&gt; &quot;q&quot; &#34;r&#34; &#39;s&#39; &apos;t&apos; &#x27;u&#x27;')).toBe(
      `A & B <tag> "q" "r" 's' 't' 'u'`,
    );
    expect(decodeTitle('literal &amp;lt; stays')).toBe('literal &lt; stays');
  });
});

describe('composeDocsTitle', () => {
  it('keeps the full form up to 60 characters', () => {
    const page = 'x'.repeat(34); // 34 + 26 = 60 with GitKit
    const out = composeDocsTitle(page, 'GitKit');
    expect(out).toBe(`${page} — GitKit docs | UniverLab`);
    expect(out.length).toBe(60);
  });

  it('drops ` | UniverLab` once the full form reaches 61', () => {
    const page = 'x'.repeat(35);
    const out = composeDocsTitle(page, 'GitKit');
    expect(out).toBe(`${page} — GitKit docs`);
    expect(out.length).toBe(49);
  });

  it('keeps `<page> — <exp> docs` up to 60 characters', () => {
    const page = 'x'.repeat(46); // 46 + 14 = 60 with GitKit
    const out = composeDocsTitle(page, 'GitKit');
    expect(out).toBe(`${page} — GitKit docs`);
    expect(out.length).toBe(60);
  });

  it('falls back to `<page> — <exp>` when even the docs form exceeds 60', () => {
    const page = 'x'.repeat(47);
    const out = composeDocsTitle(page, 'GitKit');
    expect(out).toBe(`${page} — GitKit`);
    expect(out.length).toBe(56);
  });

  it('holds the 30-character floor for the shortest real page', () => {
    const out = composeDocsTitle('Lock', 'GitKit');
    expect(out).toBe('Lock — GitKit docs | UniverLab');
    expect(out.length).toBe(30);
  });

  it('drops the suffix for the one real page that needs the third rung', () => {
    const out = composeDocsTitle('ADR: Recipes — Installable Graph and Node Designs', 'Canopy');
    expect(out).toBe('ADR: Recipes — Installable Graph and Node Designs — Canopy');
    expect(out.length).toBe(58);
  });
});

describe('composeDocsDescription', () => {
  const TAGLINE = 'Guided git repository setup — hooks, ignores, attributes, and config in one flow.';

  it('extends a short frontmatter description with the experiment suffix', () => {
    const out = composeDocsDescription({
      description: 'The wizard, the status overview, and clone-and-configure in one command.',
      title: 'Quick Start',
      expName: 'GitKit',
      tagline: TAGLINE,
    });
    expect(out.startsWith('The wizard, the status overview, and clone-and-configure in one command. GitKit documentation — ')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out).not.toMatch(/[.,;:!?—–\-…'"')\]]$/);
  });

  it('uses an in-range description as is, including the 140 and 160 boundaries', () => {
    const exactly140 = 'Demos as Code — record a terminal session, normalize it into a clean declarative score, and compile it to gif, mp4, or an opt-in SVG poster.';
    expect(exactly140.length).toBe(140);
    expect(composeDocsDescription({ description: exactly140, title: 'T', expName: 'E', tagline: TAGLINE })).toBe(exactly140);
    const exactly160 = `x${'y'.repeat(158)}z`;
    expect(exactly160.length).toBe(160);
    expect(composeDocsDescription({ description: exactly160, title: 'T', expName: 'E', tagline: TAGLINE })).toBe(exactly160);
    const mid = 'Self-contained MCP server and TUI for orchestrating AI agent sessions, background tasks, and file event triggers with scheduling built right in.';
    expect(composeDocsDescription({ description: mid, title: 'T', expName: 'E', tagline: TAGLINE })).toBe(mid);
  });

  it('cuts an over-long description at a word boundary', () => {
    const out = composeDocsDescription({
      description:
        'Built-in hooks (conventional commits, no-body messages, AI trailer rejection, secret detection, branch naming, invisible Unicode detection, user-defined message rules) and custom shell commands.',
      title: 'Hooks',
      expName: 'GitKit',
      tagline: TAGLINE,
    });
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out).not.toContain('GitKit documentation');
    expect(out).not.toMatch(/[.,;:!?—–\-…'"')\]]$/);
  });

  it('falls back to the title when the frontmatter description is missing', () => {
    const out = composeDocsDescription({
      title: 'ADR: Recipes — Installable Graph and Node Designs',
      expName: 'Canopy',
      tagline: 'The runtime layer for AI agents that need memory, scheduling, and each other.',
    });
    expect(out.startsWith('ADR: Recipes — Installable Graph and Node Designs Canopy documentation — ')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(160);
  });

  it('truncateAtWord never splits a word and strips trailing punctuation', () => {
    expect(truncateAtWord('alpha beta, gamma', 11)).toBe('alpha beta');
    expect(truncateAtWord('short', 160)).toBe('short');
  });
});

// ---------------------------------------------------- structured data (FR1–FR3)

const LD = (node: unknown) => `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
const ORG_ID = 'https://univerlab.org/#organization';
const FOUNDER_ID = 'https://univerlab.org/#founder';
const APP_ID = 'https://univerlab.org/ghscaff/#softwareapplication';
const DOC_CANONICAL = 'https://univerlab.org/ghscaff/docs/apply-mode/';
const DOC_DATE = '2026-08-12T08:08:07-05:00';
// Written with an entity in the meta tag and a bare `&` in the JSON, which is
// what the build does — the check has to see them as the same string.
const DOC_DESC = 'Idempotently bring an existing repository up to your conventions & keep it that way.';

/** The graph, written out by hand rather than produced by the builder under
 *  test, so a bug in `buildDocsJsonLd` cannot make this check agree with it. */
function docsGraph(over: { date?: string | null; article?: Record<string, unknown> } = {}): Record<string, unknown> {
  const article: Record<string, unknown> = {
    '@type': 'TechArticle',
    headline: 'Apply Mode',
    description: DOC_DESC,
    inLanguage: 'en',
    url: DOC_CANONICAL,
    author: { '@id': FOUNDER_ID },
    publisher: { '@id': ORG_ID },
    isPartOf: { '@id': APP_ID },
    ...over.article,
  };
  if (over.date) article.dateModified = over.date;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      article,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'UniverLab', item: 'https://univerlab.org/' },
          { '@type': 'ListItem', position: 2, name: 'ghScaff', item: 'https://univerlab.org/ghscaff/' },
          { '@type': 'ListItem', position: 3, name: 'Docs', item: 'https://univerlab.org/ghscaff/docs/' },
          { '@type': 'ListItem', position: 4, name: 'Apply Mode', item: DOC_CANONICAL },
        ],
      },
      { '@context': 'https://schema.org', '@type': 'Organization', '@id': ORG_ID, name: 'UniverLab' },
      {
        '@context': 'https://schema.org',
        '@type': 'Person',
        '@id': FOUNDER_ID,
        name: 'Jheison Martinez',
        jobTitle: 'Founder',
        worksFor: { '@type': 'Organization', '@id': ORG_ID, name: 'UniverLab', url: 'https://univerlab.org/' },
      },
      { '@context': 'https://schema.org', '@type': 'SoftwareApplication', '@id': APP_ID, name: 'ghScaff' },
    ],
  };
}

/** The `<head>` half of a docs page: canonical, meta description, og tags and
 *  (only with a date) the freshness meta and the visible line. */
function docsHead(o: { date?: string | null; ogType?: string; extra?: string } = {}): string {
  const { date = DOC_DATE } = o;
  return [
    `<link rel="canonical" href="${DOC_CANONICAL}" />`,
    `<meta name="description" content="${DOC_DESC.replace('&', '&amp;')}" />`,
    `<meta property="og:type" content="${o.ogType ?? 'article'}" />`,
    date ? `<meta property="article:modified_time" content="${date}" />` : '',
    date ? `<p class="doc-updated">Last updated <time datetime="${date}">TERRA 2026 · Sol 224 · 13:08 UTC</time></p>` : '',
    o.extra ?? '',
  ].join('');
}

/** The experiment landing page a docs `isPartOf` points at. */
function landingFixture(expId: string, name: string, prefix = ''): string {
  return page(
    LD({ '@context': 'https://schema.org', '@type': 'SoftwareApplication', '@id': `https://univerlab.org/${expId}/#softwareapplication`, name }) +
      LD({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'UniverLab', item: `https://univerlab.org/${prefix}` },
          { '@type': 'ListItem', position: 2, name, item: `https://univerlab.org/${prefix}${expId}/` },
        ],
      }),
  );
}

interface DocsFixture {
  date?: string | null;
  ogType?: string;
  graph?: Record<string, unknown>;
  /** Raw HTML replacing the single JSON-LD block (for the parse-failure test). */
  script?: string;
  /** Raw HTML appended to the head (for the two-blocks test). */
  extra?: string;
}

function docsFixture(o: DocsFixture = {}): Record<string, string> {
  const date = o.date === undefined ? DOC_DATE : o.date;
  const graph = o.graph ?? docsGraph({ date: date ?? null });
  const block = o.script ?? LD(graph);
  return {
    'ghscaff/docs/apply-mode/index.html':
      `<!doctype html><html><head><title>Apply Mode</title>${docsHead({ date, ogType: o.ogType })}` +
      `${block}${o.extra ?? ''}</head><body></body></html>`,
    'ghscaff/index.html': landingFixture('ghscaff', 'ghScaff'),
  };
}

/** Run a check over a fixture and always clean it up. */
function withDist(files: Record<string, string>, check: (dist: string) => string[]): string[] {
  const dist = distFixture(files);
  try {
    return check(dist);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}

describe('checkJsonLd', () => {
  it('passes a well-formed docs page and the landing page it points at', () => {
    expect(withDist(docsFixture(), checkJsonLd)).toEqual([]);
  });

  it('passes a docs page that honestly has no date', () => {
    expect(withDist(docsFixture({ date: null, graph: docsGraph({ date: null }) }), checkJsonLd)).toEqual([]);
  });

  it('parses every emitted block — this is what validator.schema.org gets', () => {
    const dist = distFixture(docsFixture());
    try {
      const html = readFileSync(resolve(dist, 'ghscaff/docs/apply-mode/index.html'), 'utf8');
      const blocks = jsonLdBlocks(html);
      expect(blocks).toHaveLength(1);
      expect(() => JSON.parse(blocks[0])).not.toThrow();
      // …and the whole page, every block, parses.
      const all = readFileSync(resolve(dist, 'ghscaff/index.html'), 'utf8');
      for (const raw of jsonLdBlocks(all)) expect(() => JSON.parse(raw)).not.toThrow();
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('fails on a block that is not valid JSON', () => {
    const failures = withDist(docsFixture({ script: '<script type="application/ld+json">{"@graph": [</script>' }), checkJsonLd);
    expect(failures.join('\n')).toMatch(/not valid JSON/);
  });

  it('fails when the page carries more than one JSON-LD block', () => {
    const failures = withDist(docsFixture({ extra: LD({ '@context': 'https://schema.org', '@type': 'WebSite' }) }), checkJsonLd);
    expect(failures.join('\n')).toMatch(/expected exactly one JSON-LD block, found 2/);
  });

  it('fails on an @id nothing on the page defines', () => {
    const graph = docsGraph({ date: DOC_DATE });
    ((graph['@graph'] as Record<string, unknown>[])[0] as Record<string, unknown>).author = { '@id': 'https://univerlab.org/#ghost' };
    const failures = withDist(docsFixture({ graph }), checkJsonLd);
    expect(failures.join('\n')).toMatch(/https:\/\/univerlab\.org\/#ghost has no definition in this page's graph/);
  });

  it('fails when the breadcrumb is missing', () => {
    const graph = docsGraph({ date: DOC_DATE });
    graph['@graph'] = (graph['@graph'] as Record<string, unknown>[]).filter((n) => n['@type'] !== 'BreadcrumbList');
    const failures = withDist(docsFixture({ graph }), checkJsonLd);
    expect(failures.join('\n')).toMatch(/expected one BreadcrumbList, found 0/);
  });

  it('fails when the breadcrumb does not name the place', () => {
    const graph = docsGraph({ date: DOC_DATE });
    const crumb = (graph['@graph'] as Record<string, unknown>[]).find((n) => n['@type'] === 'BreadcrumbList')!;
    const items = crumb.itemListElement as Record<string, unknown>[];
    items[1].name = 'GhScaff';
    items[3].item = 'https://univerlab.org/ghscaff/docs/apply-mode';
    const failures = withDist(docsFixture({ graph }), checkJsonLd);
    expect(failures.join('\n')).toMatch(/breadcrumb names are/);
    expect(failures.join('\n')).toMatch(/not a trailing-slash URL/);
  });

  it('fails when og:type is still website', () => {
    const failures = withDist(docsFixture({ ogType: 'website' }), checkJsonLd);
    expect(failures.join('\n')).toMatch(/og:type is "website", expected "article"/);
  });

  it('fails when article:modified_time disagrees with dateModified', () => {
    const failures = withDist(
      docsFixture({ date: DOC_DATE, graph: docsGraph({ date: '2026-01-01T00:00:00Z' }) }),
      checkJsonLd,
    );
    expect(failures.join('\n')).toMatch(/article:modified_time .* ≠ dateModified/);
  });

  it('fails when the page shows a date the graph does not claim', () => {
    const failures = withDist(docsFixture({ date: DOC_DATE, graph: docsGraph({ date: null }) }), checkJsonLd);
    expect(failures.join('\n')).toMatch(/but TechArticle carries no dateModified/);
  });

  it('fails when the graph claims a date the page does not show', () => {
    const failures = withDist(docsFixture({ date: null, graph: docsGraph({ date: DOC_DATE }) }), checkJsonLd);
    expect(failures.join('\n')).toMatch(/article:modified_time.*is missing/);
    expect(failures.join('\n')).toMatch(/shows no "Last updated" line/);
  });

  it('fails when the TechArticle fields are wrong', () => {
    const graph = docsGraph({ date: DOC_DATE });
    const article = (graph['@graph'] as Record<string, unknown>[])[0];
    article.url = 'https://univerlab.org/nope/';
    article.inLanguage = 'es';
    const failures = withDist(docsFixture({ graph }), checkJsonLd);
    expect(failures.join('\n')).toMatch(/TechArticle\.url .* is not the canonical/);
    expect(failures.join('\n')).toMatch(/TechArticle\.inLanguage is "es"/);
  });

  it('fails when the isPartOf target is not defined on the experiment page', () => {
    const graph = docsGraph({ date: DOC_DATE });
    ((graph['@graph'] as Record<string, unknown>[])[0] as Record<string, unknown>).isPartOf = {
      '@id': 'https://univerlab.org/nowhere/#softwareapplication',
    };
    const failures = withDist(docsFixture({ graph }), checkJsonLd);
    expect(failures.join('\n')).toMatch(/is not defined on \/ghscaff\//);
  });

  it('checks the experiment landing pages for their crumb', () => {
    const good = { 'ghscaff/index.html': landingFixture('ghscaff', 'ghScaff') };
    expect(withDist(good, checkJsonLd)).toEqual([]);

    const noCrumb = { 'ghscaff/index.html': page(LD({ '@context': 'https://schema.org', '@type': 'WebSite' })) };
    expect(withDist(noCrumb, checkJsonLd).join('\n')).toMatch(/\/ghscaff\/: expected one BreadcrumbList, found 0/);

    const noId = {
      'ghscaff/index.html': page(
        LD({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'ghScaff',
          description: 'x'.repeat(40),
        }),
      ),
    };
    expect(withDist(noId, checkJsonLd).join('\n')).toMatch(/SoftwareApplication has no @id/);
  });

  it('checks the Spanish landing page against its own /es/ crumb', () => {
    const files = { 'es/ghscaff/index.html': landingFixture('ghscaff', 'ghScaff', 'es/') };
    expect(withDist(files, checkJsonLd)).toEqual([]);
    const wrong = { 'es/ghscaff/index.html': landingFixture('ghscaff', 'ghScaff', '') };
    expect(withDist(wrong, checkJsonLd).join('\n')).toMatch(/breadcrumb items are/);
  });
});

describe('jsonLdStats', () => {
  it('counts docs pages with and without a date', () => {
    const dated = docsFixture();
    const undated = {
      'gitkit/docs/builds/index.html':
        `<!doctype html><html><head><title>T</title>${docsHead({ date: null })}${LD(docsGraph({ date: null }))}</head><body></body></html>`,
    };
    const dist = distFixture({ ...dated, ...undated, 'gitkit/index.html': landingFixture('gitkit', 'GitKit') });
    try {
      expect(jsonLdStats(dist)).toEqual({ docs: 2, withDate: 1, withoutDate: 1, blocks: 6, unparseable: 0 });
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('reports unparseable blocks instead of counting them as content', () => {
    const dist = distFixture(docsFixture({ script: '<script type="application/ld+json">nope</script>' }));
    try {
      expect(jsonLdStats(dist).unparseable).toBe(1);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

describe('checkDocsPages', () => {
  it('fails naming the path when a sibling checkout is missing', () => {
    const failures = withDist({}, (dist) => checkDocsPages(dist, { ghost: '../no-such-repo/docs' }));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('no-such-repo/docs');
    expect(failures[0]).toMatch(/DOCS_BASES\["ghost"\]/);
    expect(failures[0]).toMatch(/\.github\/workflows/);
  });

  it('fails when a source file has no built page', () => {
    const root = mkdtempSync(join(tmpdir(), 'docs-pages-'));
    try {
      mkdirSync(join(root, 'sibling', 'docs'), { recursive: true });
      writeFileSync(join(root, 'sibling', 'docs', 'quickstart.md'), '# Quick Start\n', 'utf-8');
      const dist = distFixture({});
      try {
        expect(checkDocsPages(dist, { ghost: 'sibling/docs' }, root)).toEqual([
          'docs: ghost source quickstart.md has no built page at /ghost/docs/quickstart/',
        ]);
      } finally {
        rmSync(dist, { recursive: true, force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes when every source file has a page, index.md included', () => {
    const root = mkdtempSync(join(tmpdir(), 'docs-pages-'));
    try {
      mkdirSync(join(root, 'sibling', 'docs', 'adr'), { recursive: true });
      writeFileSync(join(root, 'sibling', 'docs', 'index.md'), '# Home\n', 'utf-8');
      writeFileSync(join(root, 'sibling', 'docs', 'adr', '0001.md'), '# ADR\n', 'utf-8');
      const dist = distFixture({
        'ghost/docs/index.html': page(),
        'ghost/docs/adr/0001/index.html': page(),
      });
      try {
        expect(checkDocsPages(dist, { ghost: 'sibling/docs' }, root)).toEqual([]);
      } finally {
        rmSync(dist, { recursive: true, force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * FR3 lives half in the helper and half in the runner: without full history
 * the helper has nothing honest to read, so `dateModified` would be absent on
 * every page in production even though every assertion above still passes.
 */
describe('deploy-site.yml checkout depth', () => {
  const workflow = read('.github/workflows/deploy-site.yml');
  const checkouts = workflow
    .split(/\n(?=\s+- uses: actions\/checkout)/)
    .filter((s) => s.includes('actions/checkout@v4') && s.includes('repository:'));

  it('checks out every sibling repo with full history', () => {
    expect(checkouts.length).toBe(7); // 6 docs repos + canopy-registry
    for (const block of checkouts) {
      const repo = /repository:\s*(\S+)/.exec(block)?.[1];
      expect(block).toContain('fetch-depth: 0');
      expect(repo).toBeDefined();
    }
  });

  it('leaves the landing checkout itself alone (it is never a date source)', () => {
    const landing =
      /- name: Checkout landing\s+uses: actions\/checkout@v4\s+with:\s+path: univerlab/.exec(workflow)?.[0] ?? '';
    expect(landing).toContain('path: univerlab');
    expect(landing).not.toContain('fetch-depth');
  });

  it('points the demostage checkout at the path DOCS_BASES reads', () => {
    // `demo-stage` 302s to `demostage`, but the *path* is what breaks the
    // build: under `demo-stage` the collection resolves to nothing, and
    // getCollection warns and returns [] instead of failing.
    for (const file of ['.github/workflows/deploy-site.yml', '.github/workflows/ci.yml']) {
      const src = read(file);
      expect(src).toContain('repository: UniverLab/demostage');
      expect(src).toContain('path: demostage');
      expect(src).not.toContain('repository: UniverLab/demo-stage');
      expect(src).not.toContain('path: demo-stage');
    }
  });

  it('keeps CI shallow on purpose, so its 0-dated build stays honest', () => {
    const ci = read('.github/workflows/ci.yml');
    const siblingBlocks = ci
      .split(/\n(?=\s+- uses: actions\/checkout)/)
      .filter((s) => s.includes('repository:'));
    for (const block of siblingBlocks) expect(block).not.toContain('fetch-depth');
  });
});

/**
 * The rule that makes the dates real (the other half of the helper): the
 * clone must not be shallow, because `git log -1` on one reports the checkout
 * time as the file's last change.
 */
describe('src/lib/doc-last-modified.ts policy', () => {
  const helper = read('src/lib/doc-last-modified.ts');

  it('checks shallowness before it reads the log', () => {
    const shallowAt = helper.indexOf('is-shallow-repository');
    const logAt = helper.indexOf("'log'");
    expect(shallowAt).toBeGreaterThan(-1);
    expect(logAt).toBeGreaterThan(-1);
    expect(shallowAt).toBeLessThan(logAt);
  });

  it('returns null rather than a build timestamp', () => {
    expect(helper).not.toMatch(/toISOString/);
    expect(helper).not.toMatch(/Date\.now/);
  });
});
