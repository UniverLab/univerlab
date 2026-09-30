/**
 * The `@graph` a docs page emits: one `TechArticle`, one `BreadcrumbList`, and
 * every node either of them references — defined in the same block.
 *
 * A page that describes itself as an article without an author, a publisher or
 * a place in the site is only half a description: the engine reading it has to
 * guess who wrote it and which product it documents. References are the point,
 * so `author`, `publisher` and `isPartOf` are `{"@id": …}` pointers and the
 * Organization, founder and experiment-application nodes they point at are
 * members of *this* graph — not borrowed from another page that may or may not
 * have been crawled. That is also why `buildDocsJsonLd` is pure and takes
 * everything it needs: the whole thing can be asserted without a build.
 *
 * `dateModified` is omitted entirely when falsy. A `null` or an empty string
 * in JSON-LD is a claim that the date is known to be absent-from-epoch, which
 * is not what "we could not read the history" means.
 */
import { en } from '../i18n/en';
import { byId } from './experiments';
import { experimentAppId, experimentAppNode, founderId, founderPersonNode, orgId, organizationNode } from './structured-data';

export interface DocsJsonLdInput {
  /** `Astro.site` — every id and every URL is derived from it. */
  site: URL;
  /** The page's canonical URL, trailing slash, byte-identical to the
   *  `<link rel="canonical">` BaseLayout emits. */
  canonical: string;
  /** The experiment the docs belong to (registry id, e.g. `gitkit`). */
  expId: string;
  /** The experiment's display name, for the breadcrumb. */
  expName: string;
  /** The page's own title — the visible `<h1>`, not the composed SEO title. */
  headline: string;
  /** The page's meta description, verbatim. */
  description: string;
  /** The source file's last commit date, or null/undefined to omit. */
  dateModified?: string | null;
  /** True for `/<id>/docs/`, whose breadcrumb ends at Docs. */
  isDocsIndex?: boolean;
}

export interface DocsJsonLd {
  '@context': 'https://schema.org';
  '@graph': Record<string, unknown>[];
}

/** UniverLab › <Experiment> › Docs › <Page>; the index stops at Docs. */
function breadcrumb(
  site: URL,
  expId: string,
  expName: string,
  canonical: string,
  headline: string,
  isDocsIndex?: boolean,
): Record<string, unknown> {
  const items = [
    { '@type': 'ListItem', position: 1, name: 'UniverLab', item: site.href },
    { '@type': 'ListItem', position: 2, name: expName, item: new URL(`/${expId}/`, site).href },
    { '@type': 'ListItem', position: 3, name: 'Docs', item: new URL(`/${expId}/docs/`, site).href },
  ];
  if (!isDocsIndex) items.push({ '@type': 'ListItem', position: 4, name: headline, item: canonical });
  return { '@type': 'BreadcrumbList', itemListElement: items };
}

/**
 * Build the single `@graph` of a docs page.
 *
 * Graph order is stable — article, breadcrumb, then the definitions they point
 * at — so a rebuild of an unchanged page is byte-identical.
 */
export function buildDocsJsonLd(i: DocsJsonLdInput): DocsJsonLd {
  const { site } = i;
  const exp = byId(i.expId);
  const expUrl = new URL(`/${i.expId}/`, site).href;
  const tagline = en.experiments[i.expId as keyof typeof en.experiments]?.tagline ?? '';

  const article: Record<string, unknown> = {
    '@type': 'TechArticle',
    headline: i.headline,
    description: i.description,
    inLanguage: 'en',
    url: i.canonical,
    author: { '@id': founderId(site) },
    publisher: { '@id': orgId(site) },
    isPartOf: { '@id': experimentAppId(expUrl) },
  };
  if (i.dateModified) article.dateModified = i.dateModified;

  const graph: Record<string, unknown>[] = [
    article,
    breadcrumb(site, i.expId, i.expName, i.canonical, i.headline, i.isDocsIndex),
  ];

  // The definitions the two nodes above point at. Each is included only when it
  // exists, and `checkJsonLd` fails the build if a pointer has nothing to land
  // on — a docs experiment without an installer would be that bug.
  graph.push(organizationNode(site, en.meta.description));
  graph.push(founderPersonNode(site, { name: en.people.founder.name, role: en.people.founder.role }));
  const app = experimentAppNode({ site, exp, tagline, pageUrl: expUrl });
  if (app) graph.push(app);

  return { '@context': 'https://schema.org', '@graph': graph };
}
