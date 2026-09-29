/**
 * The site's schema.org vocabulary: the stable `@id`s everything points at,
 * and the node builders that define them.
 *
 * Before this module every node was an anonymous literal at its call site, so
 * nothing could reference anything: a docs page's `TechArticle` could not name
 * its author, its publisher or the experiment it belongs to, because none of
 * those nodes had an identity. The ids are minted here (and only here) from
 * `site`, never hardcoded, so a domain change cannot leave a graph of stale
 * strings — and so the page that *declares* a node and the page that
 * *references* it derive byte-identical values from the same function.
 *
 * Every builder is the literal that used to live at the call site plus the
 * `@id` that makes it referenceable; the rest of the fields are unchanged.
 */
import type { Experiment } from './experiments';

/** Canonical URLs are trailing-slash (`trailingSlash` in astro.config.mjs), so
 *  an id minted from a page URL is normalized before anything hashes against
 *  it. A no-slash form would be a second, never-matching identity. */
function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/** The site-wide Organization — one identity for every page that names it. */
export function orgId(site: URL): string {
  return new URL('/#organization', site).href;
}

/** The founder's Person node. Declared on `/contributors/`, defined inside
 *  every docs `@graph`, and referenced as `TechArticle.author`. */
export function founderId(site: URL): string {
  return new URL('/#founder', site).href;
}

/**
 * An experiment's application node, keyed by its *landing* page — never by
 * the referencing page. A doc at `/<id>/docs/<slug>/` and the experiment page
 * itself both resolve to `https://univerlab.org/<id>/#softwareapplication`,
 * which is what makes `isPartOf` a reference instead of a copy.
 */
export function experimentAppId(pageUrl: string): string {
  return `${withSlash(pageUrl)}#softwareapplication`;
}

/** The site-wide Organization node, exactly as BaseLayout has always emitted
 *  it, now addressable by `orgId`. `description` is the localized meta
 *  description (it describes the site, not the page). */
export function organizationNode(site: URL, description: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': orgId(site),
    name: 'UniverLab',
    url: site.href,
    logo: new URL('/favicon.svg', site).href,
    description,
    sameAs: ['https://github.com/UniverLab'],
  };
}

/** The founder's Person node (`/contributors/`). `worksFor` keeps the inline
 *  Organization fields it always had and carries the same `@id` the rest of
 *  the site uses, so the reference resolves whether or not the Organization
 *  node is in the same graph. */
export function founderPersonNode(site: URL, f: { name: string; role: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': founderId(site),
    name: f.name,
    jobTitle: f.role,
    url: new URL('/contributors/', site).href,
    sameAs: ['https://github.com/JheisonMB'],
    worksFor: {
      '@type': 'Organization',
      '@id': orgId(site),
      name: 'UniverLab',
      url: site.href,
    },
  };
}

/**
 * Rich result for an experiment: `SoftwareApplication` for a CLI tool,
 * `WebApplication` for a hosted app, nothing for a research experiment with
 * neither an installer nor a URL. `pageUrl` is the experiment's *landing*
 * page — callers pass the docs page's experiment root, not their own URL.
 */
export function experimentAppNode(o: {
  site: URL;
  exp: Experiment;
  tagline: string;
  pageUrl: string;
}): Record<string, unknown> | undefined {
  const { site, exp, tagline, pageUrl } = o;
  const author = { '@type': 'Organization', name: 'UniverLab', url: site.href };

  if (exp.install) {
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      '@id': experimentAppId(pageUrl),
      name: exp.name,
      description: tagline,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: exp.install.windows ? 'macOS, Linux, Windows' : 'macOS, Linux',
      url: pageUrl,
      downloadUrl: exp.github,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      author,
    };
  }
  if (exp.url) {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': experimentAppId(pageUrl),
      name: exp.name,
      description: tagline,
      applicationCategory: 'DeveloperApplication',
      url: exp.url,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      author,
    };
  }
  return undefined;
}
