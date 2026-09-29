/**
 * `buildDocsJsonLd` — the graph a docs page emits.
 *
 * The graph is asserted node by node rather than snapshotted: what matters is
 * that the required fields are there, that the breadcrumb says where the page
 * is, that a missing date leaves no key behind, and that every `{"@id": …}`
 * pointer lands on a node defined in the same graph. The last one is the
 * property that makes the block self-contained — a reference to a node some
 * other page happens to carry is a reference to nothing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildDocsJsonLd, type DocsJsonLdInput } from '../lib/docs-jsonld';
import type { Experiment } from '../lib/experiments';
import {
  experimentAppId,
  experimentAppNode,
  founderId,
  founderPersonNode,
  orgId,
  organizationNode,
} from '../lib/structured-data';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const site = new URL('https://univerlab.org/');
const page = (over: Partial<DocsJsonLdInput> = {}): DocsJsonLdInput => ({
  site,
  canonical: 'https://univerlab.org/ghscaff/docs/apply-mode/',
  expId: 'ghscaff',
  expName: 'ghScaff',
  headline: 'Apply Mode',
  description: 'Idempotently bring an existing repository up to your conventions.',
  ...over,
});

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const graph = (i: DocsJsonLdInput) => buildDocsJsonLd(i)['@graph'];
const only = (nodes: Record<string, unknown>[], type: string) => {
  const found = nodes.filter((n) => n['@type'] === type);
  expect(found).toHaveLength(1);
  return found[0];
};

/** Every `@id` a node declares as itself (top level of the graph). */
function declared(nodes: Record<string, unknown>[]): Set<string> {
  return new Set(nodes.filter((n) => typeof n['@id'] === 'string').map((n) => n['@id'] as string));
}

/** Every `@id` mentioned anywhere — the union of declares and references. */
function mentioned(v: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(v)) {
    for (const x of v) mentioned(x, into);
  } else if (isRec(v)) {
    if (typeof v['@id'] === 'string') into.add(v['@id']);
    for (const [k, child] of Object.entries(v)) if (k !== '@id') mentioned(child, into);
  }
  return into;
}

describe('buildDocsJsonLd', () => {
  it('is a schema.org @graph', () => {
    const out = buildDocsJsonLd(page());
    expect(out['@context']).toBe('https://schema.org');
    expect(Array.isArray(out['@graph'])).toBe(true);
  });

  it('carries the TechArticle fields the spec requires', () => {
    const article = only(graph(page({ dateModified: '2026-08-12T08:08:07-05:00' })), 'TechArticle');
    expect(article).toMatchObject({
      '@type': 'TechArticle',
      headline: 'Apply Mode',
      description: 'Idempotently bring an existing repository up to your conventions.',
      inLanguage: 'en',
      url: 'https://univerlab.org/ghscaff/docs/apply-mode/',
      dateModified: '2026-08-12T08:08:07-05:00',
    });
    expect(article.author).toEqual({ '@id': 'https://univerlab.org/#founder' });
    expect(article.publisher).toEqual({ '@id': 'https://univerlab.org/#organization' });
    expect(article.isPartOf).toEqual({ '@id': 'https://univerlab.org/ghscaff/#softwareapplication' });
  });

  it('mints the app id from the experiment root, with a trailing slash', () => {
    // Both callers hand it the experiment's landing URL — the docs layout
    // because `isPartOf` names the product, ExperimentLayout because it is
    // the page itself — so the reference and the definition are the same
    // string even though the referencing page sits two levels deeper.
    expect(experimentAppId('https://univerlab.org/ghscaff')).toBe('https://univerlab.org/ghscaff/#softwareapplication');
    expect(experimentAppId('https://univerlab.org/ghscaff/')).toBe('https://univerlab.org/ghscaff/#softwareapplication');
    const article = only(graph(page()), 'TechArticle');
    expect((article.isPartOf as Rec)['@id']).toBe(experimentAppId('https://univerlab.org/ghscaff/'));
  });

  it.each([[null], [undefined], ['']])('omits dateModified entirely when it is %p', (value) => {
    const article = only(graph(page({ dateModified: value as string | null | undefined })), 'TechArticle');
    expect('dateModified' in article).toBe(false);
  });

  it('builds the breadcrumb UniverLab › <Experiment> › Docs › <Page>', () => {
    const crumb = only(graph(page()), 'BreadcrumbList');
    const items = crumb.itemListElement as Rec[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(items.map((i) => i.name)).toEqual(['UniverLab', 'ghScaff', 'Docs', 'Apply Mode']);
    expect(items.map((i) => i.item)).toEqual([
      'https://univerlab.org/',
      'https://univerlab.org/ghscaff/',
      'https://univerlab.org/ghscaff/docs/',
      'https://univerlab.org/ghscaff/docs/apply-mode/',
    ]);
  });

  it('stops the docs index breadcrumb at Docs', () => {
    const crumb = only(graph(page({ canonical: 'https://univerlab.org/ghscaff/docs/', isDocsIndex: true })), 'BreadcrumbList');
    const items = crumb.itemListElement as Rec[];
    expect(items.map((i) => i.name)).toEqual(['UniverLab', 'ghScaff', 'Docs']);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[2].item).toBe('https://univerlab.org/ghscaff/docs/');
  });

  it('always gives every breadcrumb item a trailing slash', () => {
    for (const input of [page(), page({ isDocsIndex: true, canonical: 'https://univerlab.org/ghscaff/docs/' })]) {
      const crumb = only(graph(input), 'BreadcrumbList');
      for (const item of crumb.itemListElement as Rec[]) expect(String(item.item)).toMatch(/\/$/);
    }
  });

  it('defines every @id it references, inside the same graph', () => {
    const nodes = graph(page({ dateModified: '2026-08-12T08:08:07-05:00' }));
    const defined = declared(nodes);
    for (const id of mentioned(nodes)) expect(defined).toContain(id);
  });

  it('defines the Organization and founder nodes the article points at', () => {
    const defined = declared(graph(page()));
    expect(defined).toContain(orgId(site));
    expect(defined).toContain(founderId(site));
    expect(defined).toContain(experimentAppId('https://univerlab.org/ghscaff/'));
  });

  it('keeps worksFor pointing at an Organization defined in the graph', () => {
    const person = only(graph(page()), 'Person');
    expect((person.worksFor as Rec)['@id']).toBe(orgId(site));
    expect(declared(graph(page()))).toContain(orgId(site));
  });

  it('leaves no reference dangling even with no date', () => {
    const nodes = graph(page({ dateModified: null }));
    const defined = declared(nodes);
    for (const id of mentioned(nodes)) expect(defined).toContain(id);
  });
});

/**
 * The shared ids and node builders. Each builder is the literal that used to
 * sit at its call site, plus the `@id` — so these assertions are mostly "the
 * old fields are still there", which is the regression that would actually
 * hurt (a rich result that silently loses `offers` or `downloadUrl`).
 */
describe('structured-data', () => {
  const exp = (over: Partial<Experiment> = {}): Experiment => ({
    id: 'gitkit',
    name: 'GitKit',
    number: 'EXP-003',
    status: 'active',
    essenceHex: '#e8a4c8',
    github: 'https://github.com/UniverLab/gitkit',
    bg: 'bubbles',
    motif: 'x',
    ...over,
  });

  it('mints every id from the site it is given', () => {
    expect(orgId(site)).toBe('https://univerlab.org/#organization');
    expect(founderId(site)).toBe('https://univerlab.org/#founder');
    const other = new URL('https://example.com/');
    expect(orgId(other)).toBe('https://example.com/#organization');
  });

  it('keeps the Organization fields BaseLayout has always emitted', () => {
    expect(organizationNode(site, 'A description')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://univerlab.org/#organization',
      name: 'UniverLab',
      url: 'https://univerlab.org/',
      logo: 'https://univerlab.org/favicon.svg',
      description: 'A description',
      sameAs: ['https://github.com/UniverLab'],
    });
  });

  it('keeps the founder Person fields /contributors/ has always emitted', () => {
    const node = founderPersonNode(site, { name: 'Jheison Martinez', role: 'Founder' });
    expect(node).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': 'https://univerlab.org/#founder',
      name: 'Jheison Martinez',
      jobTitle: 'Founder',
      url: 'https://univerlab.org/contributors/',
      sameAs: ['https://github.com/JheisonMB'],
      worksFor: { '@type': 'Organization', '@id': 'https://univerlab.org/#organization', name: 'UniverLab', url: 'https://univerlab.org/' },
    });
  });

  it('builds a SoftwareApplication with the install fields, keyed by the landing page', () => {
    const node = experimentAppNode({
      site,
      exp: exp({ install: { unix: 'curl x | sh', windows: 'irm y | iex' } }),
      tagline: 'Guided git repository setup.',
      pageUrl: 'https://univerlab.org/gitkit/',
    })!;
    expect(node).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      '@id': 'https://univerlab.org/gitkit/#softwareapplication',
      name: 'GitKit',
      description: 'Guided git repository setup.',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'macOS, Linux, Windows',
      url: 'https://univerlab.org/gitkit/',
      downloadUrl: 'https://github.com/UniverLab/gitkit',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      author: { '@type': 'Organization', name: 'UniverLab', url: 'https://univerlab.org/' },
    });
  });

  it('drops Windows from the operating system when there is no PowerShell script', () => {
    const node = experimentAppNode({
      site,
      exp: exp({ install: { unix: 'curl x | sh' } }),
      tagline: 't',
      pageUrl: 'https://univerlab.org/gitkit/',
    })!;
    expect(node.operatingSystem).toBe('macOS, Linux');
  });

  it('builds a WebApplication for a hosted app with no installer', () => {
    const node = experimentAppNode({
      site,
      exp: exp({ url: 'https://quorum.univerlab.org' }),
      tagline: 'Serverless planning poker.',
      pageUrl: 'https://univerlab.org/quorum/',
    })!;
    expect(node).toMatchObject({
      '@type': 'WebApplication',
      '@id': 'https://univerlab.org/quorum/#softwareapplication',
      url: 'https://quorum.univerlab.org',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    });
    expect(node).not.toHaveProperty('downloadUrl');
  });

  it('gives a research experiment neither an app node nor an id to point at', () => {
    expect(experimentAppNode({ site, exp: exp(), tagline: 't', pageUrl: 'https://univerlab.org/astro-denoise/' })).toBeUndefined();
  });
});

/**
 * Source-level wiring: the layout has to hand the graph (not the whole
 * `{"@context","@graph"}` wrapper) to BaseLayout, or the page would emit a
 * `@graph` whose only entry is another `@graph`.
 */
describe('DocsLayout structured-data wiring', () => {
  const src = read('layouts/DocsLayout.astro');

  it('passes the graph nodes to BaseLayout', () => {
    expect(src).toContain(`jsonLdGraph={docsJsonLd['@graph']}`);
  });

  it('asks for og:type=article and the modified time', () => {
    expect(src).toMatch(/ogType="article"/);
    expect(src).toMatch(/articleModifiedTime=\{lastModified \?\? undefined\}/);
  });

  it('derives the date from the source file, not from the clock', () => {
    expect(src).toMatch(/docLastModified\(sourceFile\)/);
    expect(src).not.toMatch(/new Date\(\)\.toISOString\(\)/);
  });

  it('passes the source file down from the route', () => {
    const route = read('pages/[id]/docs/[...slug].astro');
    expect(route).toContain('sourceFile');
    expect(route).toContain('DOCS_BASES[id]');
  });
});
