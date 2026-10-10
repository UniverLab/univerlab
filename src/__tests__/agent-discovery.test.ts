/**
 * Tests for the three agent discovery documents of AGR3 — the OpenAPI
 * description of the announcements API, the RFC 9727 API catalog, the honest
 * `auth.md`, and the ARD / AI Catalog — plus the links that advertise them and
 * the /api/ pages that must not drift from the spec.
 *
 * The rule behind every case here is the spec's own: a discovery file must
 * describe something that really exists. So the OpenAPI document is checked
 * against the worker's actual GET handlers, every ai-catalog `url` is checked
 * against a file on disk, and `auth.md` is checked for the two words that
 * would imply an authority this site does not run. Astro does not render under
 * jest, so the layout and page contracts are asserted at source level — the
 * level baselayout-og.test.ts and feed-page.test.ts already use.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadApiDocument } from '../lib/api-docs';

const ROOT = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const readJson = (p: string): Record<string, any> => JSON.parse(read(p));

const OPENAPI_FILE = 'public/openapi/announcements.json';
const CATALOG_FILE = 'public/.well-known/api-catalog';
const AI_CATALOG_FILE = 'public/.well-known/ai-catalog.json';
const AUTH_FILE = 'public/auth.md';
const HEADERS_FILE = 'public/_headers';

/** Rules as Cloudflare Pages reads them: a path pattern, then indented headers. */
function parseRules(text: string): { pattern: string; headers: [string, string][] }[] {
  const rules: { pattern: string; headers: [string, string][] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (line === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    const [name, ...rest] = line.trim().split(':');
    if (rules.length > 0) rules[rules.length - 1].headers.push([name.toLowerCase(), rest.join(':').trim()]);
  }
  return rules;
}

/** Pages wildcards match across path separators. */
function matches(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
}

const headers = read(HEADERS_FILE);
const rules = parseRules(headers);
const headerFor = (path: string, name: string): string[] =>
  rules
    .filter((rule) => matches(rule.pattern, path))
    .flatMap((rule) => rule.headers.filter(([key]) => key === name).map(([, value]) => value));

// ------------------------------------------------------------- 1. OpenAPI

describe('OpenAPI document describes the public announcements API', () => {
  const doc = readJson(OPENAPI_FILE);

  it('is valid JSON with a 3.1 version', () => {
    expect(doc.openapi).toMatch(/^3\.1\.\d+$/);
  });

  it('points at the production origin', () => {
    expect(doc.servers?.[0]?.url).toBe('https://announcements.univerlab.org');
  });

  it('states in info.description that GET is anonymous and read-only', () => {
    expect(doc.info.description).toMatch(/anonymous/i);
    expect(doc.info.description).toMatch(/read-only/i);
  });

  it('carries the worker package.json version, its only honest source', () => {
    const pkg = readJson('workers/announcements/package.json');
    expect(pkg.version).toBeDefined();
    expect(doc.info.version).toBe(pkg.version);
  });

  it('documents only get operations', () => {
    for (const [path, item] of Object.entries(doc.paths as Record<string, Record<string, unknown>>)) {
      expect(Object.keys(item)).toEqual(['get']);
      expect((item.get as Record<string, unknown>).operationId).toBeTruthy();
      expect(path).toBeTruthy();
    }
  });

  it('has a GET handler in the worker source for every documented path', () => {
    const workerSource = read('workers/announcements/src/index.ts');
    const paths = Object.keys(doc.paths as Record<string, unknown>);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      // Derive the needle from the path template, accepting both spellings the
      // router uses: `url.pathname === '/feed.atom'` and
      // `url.pathname.startsWith('/roadmap/')`.
      const literal = p.replace(/\{[^}]+\}.*$/, ''); // '/roadmap/{id}' → '/roadmap/'
      const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`req\\.method === 'GET' && url\\.pathname(?: === |\\.startsWith\\()'${escaped}'`);
      expect(workerSource).toMatch(re);
    }
  });
});

// --------------------------------------------------------- 2. API catalog

describe('RFC 9727 API catalog', () => {
  const catalog = readJson(CATALOG_FILE);

  it('is a linkset with exactly one entry, anchored at the API root', () => {
    expect(Array.isArray(catalog.linkset)).toBe(true);
    expect(catalog.linkset).toHaveLength(1);
    expect(catalog.linkset[0].anchor).toBe('https://announcements.univerlab.org/');
  });

  it('advertises exactly the OpenAPI description and the human docs', () => {
    const entry = catalog.linkset[0];
    expect(entry['service-desc']).toEqual([
      expect.objectContaining({
        href: 'https://univerlab.org/openapi/announcements.json',
        type: 'application/openapi+json',
      }),
    ]);
    expect(entry['service-doc']).toEqual([
      expect.objectContaining({ href: 'https://univerlab.org/api/', type: 'text/html' }),
    ]);
    expect(entry['service-meta']).toBeUndefined();
    expect(entry['service-desc']).toHaveLength(1);
    expect(entry['service-doc']).toHaveLength(1);
  });

  it('carries no status relation, because no health endpoint exists', () => {
    expect(catalog.linkset[0].status).toBeUndefined();
    expect(Object.keys(catalog.linkset[0]).sort()).toEqual(['anchor', 'service-desc', 'service-doc']);
  });

  it('is served as application/linkset+json, cross-origin', () => {
    expect(headerFor('/.well-known/api-catalog', 'content-type')).toEqual(['application/linkset+json']);
    expect(headerFor('/.well-known/api-catalog', 'access-control-allow-origin')).toEqual(['*']);
  });
});

// ------------------------------------------------------------- 3. auth.md

describe('auth.md says there is nothing to obtain', () => {
  const body = read(AUTH_FILE);

  it('exists and its first heading contains auth.md', () => {
    expect(existsSync(resolve(ROOT, AUTH_FILE))).toBe(true);
    expect(body.match(/^# (.+)$/m)?.[1]).toContain('auth.md');
  });

  it('never offers OAuth or a registration endpoint', () => {
    expect(body).not.toContain('OAuth');
    expect(body).not.toContain('register_uri');
  });

  it('names the contact address already published on /contributors/', () => {
    expect(body).toContain('jheison.mb@univerlab.org');
  });

  it('is served as markdown, so a browser reads it instead of downloading it', () => {
    expect(headerFor('/auth.md', 'content-type')).toEqual(['text/markdown; charset=utf-8']);
  });
});

// ------------------------------------------------------------ 4. ai-catalog

describe('ARD / AI Catalog', () => {
  const catalog = readJson(AI_CATALOG_FILE);
  const entries = catalog.entries as Record<string, any>[];

  it('declares the data-model version and the host identity', () => {
    expect(catalog.specVersion).toBe('1.0');
    expect(catalog.host).toEqual({ displayName: 'UniverLab', identifier: 'did:web:univerlab.org' });
  });

  it('gives every entry exactly one of url or data', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const hasUrl = Object.prototype.hasOwnProperty.call(entry, 'url');
      const hasData = Object.prototype.hasOwnProperty.call(entry, 'data');
      expect(Number(hasUrl) + Number(hasData)).toBe(1);
    }
  });

  it('ids every entry under the univerlab.org ARD namespace', () => {
    for (const entry of entries) {
      expect(entry.identifier).toMatch(/^urn:air:univerlab\.org:/);
    }
  });

  it('gives every entry a display name, a media type and 2–5 representative queries', () => {
    for (const entry of entries) {
      expect(typeof entry.displayName).toBe('string');
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(typeof entry.type).toBe('string');
      expect(entry.type).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
      expect(Array.isArray(entry.representativeQueries)).toBe(true);
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(entry.representativeQueries.length).toBeLessThanOrEqual(5);
    }
  });

  it('points every local url at a file that exists in public/ or in the built dist/', () => {
    for (const entry of entries) {
      const url: string = entry.url ?? '';
      expect(url).toMatch(/^https:\/\/univerlab\.org\//);
      const rel = url.replace('https://univerlab.org/', '');
      const candidates = [resolve(ROOT, 'public', rel), resolve(ROOT, 'dist', rel)];
      expect(candidates.some((file) => existsSync(file))).toBe(true);
    }
  });

  it('is served as application/json, cross-origin', () => {
    expect(headerFor('/.well-known/ai-catalog.json', 'content-type')).toEqual(['application/json']);
    expect(headerFor('/.well-known/ai-catalog.json', 'access-control-allow-origin')).toEqual(['*']);
  });

  /**
   * The T7 property the skills rules already learned: Pages applies every
   * matching rule and concatenates values, so two rules claiming one path's
   * Content-Type produce an unparseable value next to nosniff.
   */
  it('never lets two rules claim the Content-Type of a discovery path', () => {
    for (const path of ['/.well-known/api-catalog', '/.well-known/ai-catalog.json', '/auth.md']) {
      expect(headerFor(path, 'content-type').length).toBeLessThanOrEqual(1);
    }
  });
});

// ------------------------------------------------------- 5. discovery links

describe('the three ways the catalog is advertised', () => {
  const layout = read('src/layouts/BaseLayout.astro');

  it('renders a rel="ai-catalog" link in BaseLayout, so every page head carries it', () => {
    expect(layout).toMatch(/<link\s+rel="ai-catalog"\s+href=\{new URL\('\/\.well-known\/ai-catalog\.json', site\)\.href\}\s*\/>/);
  });

  it('names the Agentmap in robots.txt', () => {
    expect(read('public/robots.txt')).toMatch(
      /^Agentmap: https:\/\/univerlab\.org\/\.well-known\/ai-catalog\.json$/m
    );
  });

  it('mentions the catalog in the hand-written head of llms.txt', () => {
    const head = read('public/llms.txt').split('# BEGIN GENERATED')[0];
    expect(head).toContain('https://univerlab.org/.well-known/ai-catalog.json');
  });
});

// ----------------------------------------------- 6. page and spec cannot drift

describe('the /api/ pages are generated from the OpenAPI document', () => {
  const raw = readJson(OPENAPI_FILE);
  const documented = Object.keys(raw.paths as Record<string, unknown>);
  const loaded = loadApiDocument();

  it('loads one operation per documented path, in the same order', () => {
    expect(loaded.operations.map((op) => op.path)).toEqual(documented);
    expect(loaded.operations.every((op) => op.method === 'get')).toBe(true);
  });

  it('renders every operation from the loaded document, in both locales', () => {
    for (const page of ['src/pages/api.astro', 'src/pages/es/api.astro']) {
      const src = read(page);
      expect(src).toContain("loadApiDocument");
      expect(src).toMatch(/doc\.operations\.map/);
      // The path is rendered as <code>{op.path}</code>, so the page shows exactly
      // the paths the loader read — no hand-typed duplicate can drift.
      expect(src).toMatch(/<code>\{op\.path\}<\/code>/);
    }
  });
});
