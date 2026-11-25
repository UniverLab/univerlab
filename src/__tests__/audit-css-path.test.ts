/**
 * The audit stylesheet lives outside Cloudflare Access: everything under
 * /audits is gated, so a published audit page must load its styles (and any
 * other static file) from a path outside /audits — for the public shell and
 * the private one alike.
 *
 * @jest-environment node
 *
 * Node rather than jsdom: the middleware is exercised end to end and needs
 * `Request` / `Response`, which jsdom does not ship.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { onRequest } from '../../functions/_middleware';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const PUBLIC_SHELL = 'src/pages/audit-shell.astro';
const PRIVATE_SHELL = 'src/pages/audits/index.astro';

/**
 * The stylesheet href the published shell declares. The middleware serves
 * the built shell through untouched, so the public-page fixture below is
 * built from the real shell source: re-pointing the shell at /audits fails
 * the middleware assertion too, not just the source one.
 */
function shellStylesheet(): string {
  const m = read(PUBLIC_SHELL).match(/<link rel="stylesheet" href="([^"]+)" \/>/);
  if (!m) throw new Error('published shell declares no stylesheet');
  return m[1];
}

type Doc = Record<string, unknown>;

function publicDoc(): Doc {
  const doc = JSON.parse(read('src/__tests__/fixtures/audit-contract/audit.json')) as Doc;
  (doc['meta'] as Doc)['language'] = 'es';
  const d = new Date();
  d.setDate(d.getDate() - 30);
  doc['badge'] = { issued: d.toISOString().slice(0, 10), scope: 'Tienda en línea' };
  return doc;
}

/** In-memory AUDITS bucket with `list`, keyed by `<slug>/audit.json`. */
function makeBucket(docs: Record<string, Doc>) {
  const files = new Map<string, Uint8Array>();
  for (const [slug, doc] of Object.entries(docs)) {
    files.set(`${slug}/audit.json`, Buffer.from(JSON.stringify(doc)));
  }
  return {
    async get(key: string) {
      const bytes = files.get(key);
      if (!bytes) return null;
      return {
        body: bytes,
        size: bytes.length,
        etag: '"css-path-fixture"',
        httpMetadata: {},
        text: async () => Buffer.from(bytes).toString('utf8'),
      };
    },
    async list() {
      return { objects: [...files.keys()].map((key) => ({ key })) };
    },
  };
}

describe('audit stylesheet lives outside /audits', () => {
  it('both shells link the shared stylesheet outside /audits', () => {
    for (const f of [PUBLIC_SHELL, PRIVATE_SHELL]) {
      expect(`${f}\n${read(f)}`).toContain('<link rel="stylesheet" href="/audit/audit.css" />');
    }
  });

  it('neither shell references a static file under /audits', () => {
    for (const f of [PUBLIC_SHELL, PRIVATE_SHELL]) {
      expect(`${f}\n${read(f)}`).not.toMatch(/(href|src)="\/audits\//);
    }
  });

  it('the middleware public page keeps the shell stylesheet, still outside /audits', async () => {
    delete (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter;
    const shell =
      '<html lang="en"><head><title>Published audit — UniverLab</title>' +
      `<link rel="stylesheet" href="${shellStylesheet()}" />` +
      '</head><body><div id="audit"></div></body></html>';
    const ctx = {
      request: new Request('https://univerlab.org/workbench/audits/tienda/', {
        headers: { Accept: 'text/html' },
      }),
      env: {
        ASSETS: {
          fetch: jest.fn(async () => new Response(shell, { status: 200 })),
        },
        AUDITS: makeBucket({ 'tienda/pub-audit': publicDoc() }),
      },
      next: jest.fn(async () => new Response('site 404', { status: 404 })),
    };
    const res = await onRequest(ctx);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('<link rel="stylesheet" href="/audit/audit.css" />');
    expect(body).not.toMatch(/<link[^>]*href="\/audits\//);
  });
});
