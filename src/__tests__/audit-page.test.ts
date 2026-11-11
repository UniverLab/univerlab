/**
 * The audit page at the edge: R2 document in, rendered page out.
 *
 * @jest-environment node
 *
 * Node rather than jsdom: the middleware is exercised end to end and needs
 * `Request` / `Response`, which jsdom does not ship.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { onRequest } from '../../functions/_middleware';
import { KNOWN_BLOCK_TYPES, LAYOUT_TYPES } from '../lib/audit/types';
import { auditPageHtml } from '../lib/audit/render';
import { renderBlock } from '../lib/audit/blocks';

const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'audit-contract');
const SLUG = 'fixture-audit';

type Doc = Record<string, unknown>;

function fixtureDoc(): Doc {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'audit.json'), 'utf8')) as Doc;
}

/** In-memory AUDITS bucket: `<slug>/audit.json` plus the fixture asset files. */
function makeAudits(doc: Doc) {
  const files = new Map<string, Uint8Array>();
  files.set(`${SLUG}/audit.json`, Buffer.from(JSON.stringify(doc)));
  for (const entry of readFixtureAssets()) {
    files.set(`${SLUG}/${entry.path}`, entry.bytes);
  }
  return {
    async get(key: string, opts?: { range?: { offset?: number; length?: number } }) {
      const bytes = files.get(key);
      if (!bytes) return null;
      let body = bytes;
      if (opts?.range) {
        const { offset = 0, length = bytes.length } = opts.range;
        body = bytes.slice(offset, offset + length);
      }
      return {
        body,
        size: bytes.length,
        etag: '"fixture"',
        httpMetadata: {},
        text: async () => Buffer.from(bytes).toString('utf8'),
      };
    },
  };
}

function readFixtureAssets(): { path: string; bytes: Uint8Array }[] {
  const doc = fixtureDoc();
  const assets = (doc['assets'] ?? []) as { path: string }[];
  return assets.map((a) => ({
    path: a.path,
    bytes: new Uint8Array(readFileSync(join(FIXTURE_DIR, a.path))),
  }));
}

const SHELL =
  '<html lang="en"><head><title>Audit — UniverLab</title>' +
  '<meta name="description" content="A UniverLab audit."></head>' +
  '<body><div id="audit"></div></body></html>';

/** workerd's HTMLRewriter is not in Node: this stub applies what the
 *  middleware asks it to write, so the test sees the filled shell. */
class FakeHTMLRewriter {
  static last: FakeHTMLRewriter | null = null;
  handlers = new Map<string, { element: (el: Record<string, (a?: string, b?: unknown) => void>) => void }>();
  constructor() {
    FakeHTMLRewriter.last = this;
  }
  on(selector: string, handler: { element: (el: never) => void }) {
    this.handlers.set(selector, handler as never);
    return this;
  }
  transform(_res: Response) {
    let text = SHELL;
    const run = (sel: string, el: Record<string, (a?: string, b?: unknown) => void>) => {
      this.handlers.get(sel)?.element(el);
    };
    run('html', { setAttribute: (n?: string, v?: unknown) => {
      if (n === 'lang') text = text.replace('<html lang="en">', `<html lang="${v}">`);
    } });
    run('title', { setInnerContent: (c?: string) => {
      text = text.replace(/<title>[^<]*<\/title>/, `<title>${c}</title>`);
    } });
    run('meta[name="description"]', { setAttribute: (n?: string, v?: unknown) => {
      if (n === 'content') {
        text = text.replace(/(<meta name="description" content=")[^"]*(")/, `$1${v}$2`);
      }
    } });
    run('#audit', { setInnerContent: (c?: string) => {
      text = text.replace('<div id="audit"></div>', `<div id="audit">${c}</div>`);
    } });
    return new Response(text, { status: 200, headers: { 'Content-Type': 'text/html' } });
  }
}

interface Ctx {
  request: Request;
  env: {
    ASSETS: { fetch: (input: string | Request) => Promise<Response> };
    AUDITS?: ReturnType<typeof makeAudits>;
  };
  next: () => Promise<Response>;
}

function context(pathname: string, opts?: { accept?: string; audits?: Ctx['env']['AUDITS']; method?: string; range?: string }): Ctx {
  const headers: Record<string, string> = { Accept: opts?.accept ?? 'text/html' };
  if (opts?.range) headers['Range'] = opts.range;
  return {
    request: new Request(`https://univerlab.org${pathname}`, { method: opts?.method ?? 'GET', headers }),
    env: {
      ASSETS: {
        fetch: jest.fn(async (input: string | Request) => {
          const url = String(input);
          if (url.endsWith('/audits/')) return new Response(SHELL, { status: 200 });
          return new Response('not found', { status: 404 });
        }),
      },
      ...(opts?.audits === undefined ? { AUDITS: makeAudits(fixtureDoc()) } : opts.audits ? { AUDITS: opts.audits } : {}),
    },
    next: jest.fn(async () => new Response('site 404', { status: 404 })),
  };
}

async function pageBody(pathname = `/audits/${SLUG}/`): Promise<{ res: Response; body: string; ctx: Ctx }> {
  const ctx = context(pathname);
  const res = await onRequest(ctx);
  return { res, body: await res.text(), ctx };
}

beforeEach(() => {
  (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;
});

afterEach(() => {
  delete (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter;
  FakeHTMLRewriter.last = null;
});

describe('middleware — audit page', () => {
  it('renders 200 with every layout and every block type', async () => {
    const { res, body } = await pageBody();

    expect(res.status).toBe(200);
    for (const layout of LAYOUT_TYPES) {
      expect(body).toContain(`audit-layout--${layout}`);
    }
    for (const type of KNOWN_BLOCK_TYPES) {
      expect(body).toContain(`audit-block--${type}`);
    }
  });

  it('resolves references, shows deliverables, TOC and metadata', async () => {
    const { body } = await pageBody();

    expect(body).toContain('href="#audit-finding-F-01"');
    expect(body).toContain('href="#audit-source-owasp"');
    expect(body).toContain('class="audit-term"');
    expect(body).toContain('Fixture definition: one client journey');
    expect(body).toContain(`href="/audits/${SLUG}/assets/figure.svg"`);
    expect(body).toContain(`href="/audits/${SLUG}/assets/report.pdf"`);
    expect(body).toContain('href="#audit-sec-overview"');
    expect(body).toContain('id="audit-sec-overview"');
    expect(body).toContain('id="audit-finding-F-01"');
    expect(body).toContain('id="audit-source-owasp"');
    expect(body).toContain('class="audit-back"');
    expect(body).toContain('Fixture Client (not a real client)');
    expect(body).toContain('Contract Test Team');
    expect(body).toContain('2026-01-05');
    expect(body).toContain('id="audit-data"');
  });

  it('carries no-store, noindex and the audit title', async () => {
    const { res, body } = await pageBody();

    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(body).toContain('<title>Contract fixture audit (not a real audit) — UniverLab</title>');
  });

  it('exposes the interactive hooks the client wires up', async () => {
    const { body } = await pageBody();

    expect(body).toContain('data-spec=');
    expect(body).toContain('data-mermaid=');
    expect(body).toContain('data-lang="python"');
    expect(body).toContain('data-inline=');
    expect(body).toContain('data-src=');
    expect(body).toContain('data-highlight="1"');
    expect(body).toContain('data-autoplay');
    expect(body).toContain('class="audit-findingsTable" data-sev="critical,high" data-status="all"');
    expect(body).toContain('data-severity="critical"');
    expect(body).toContain('data-severity="info" data-status="accepted" hidden');
    expect(body).toContain('class="audit-step"');
    expect(body).toContain('id="audit-h-0-0"');
  });

  it('answers 404 for a private audit, as if it did not exist', async () => {
    const doc = fixtureDoc();
    doc['visibility'] = 'private';
    (doc['access'] as Record<string, unknown>) = { emails: ['reader@example.com'] };
    const ctx = context(`/audits/${SLUG}/`, { audits: makeAudits(doc) });

    const res = await onRequest(ctx);

    expect(res.status).toBe(404);
    expect(ctx.next).toHaveBeenCalled();
  });

  it('answers 404 for a missing audit, an invalid document and no binding', async () => {
    const missing = context('/audits/no-such-audit/', {
      audits: makeAudits(fixtureDoc()),
    });
    // The bucket holds only the fixture slug, so this key misses.
    expect((await onRequest(missing)).status).toBe(404);

    const broken = fixtureDoc();
    delete ((broken['meta'] ?? {}) as Doc)['title'];
    const invalid = context(`/audits/${SLUG}/`, { audits: makeAudits(broken) });
    expect((await onRequest(invalid)).status).toBe(404);

    const dangling = fixtureDoc();
    const prose = (((dangling['sections'] as Doc[])?.[0]?.['blocks'] as Doc[]) ?? [])[1];
    if (prose) prose['markdown'] = 'Cites {{finding:missing}}.';
    const crossRef = context(`/audits/${SLUG}/`, { audits: makeAudits(dangling) });
    expect((await onRequest(crossRef)).status).toBe(404);

    const unbound = context(`/audits/${SLUG}/`, { audits: undefined });
    delete (unbound.env as Record<string, unknown>)['AUDITS'];
    const res = await onRequest(unbound);
    expect(res.status).toBe(404);
    expect(unbound.next).toHaveBeenCalled();
  });

  it('never serves an audit markdown twin', async () => {
    const md = context(`/audits/${SLUG}/index.md`, { accept: 'text/markdown' });
    expect((await onRequest(md)).status).toBe(404);
    expect(md.next).toHaveBeenCalled();

    const negotiated = context(`/audits/${SLUG}/`, { accept: 'text/markdown' });
    expect((await onRequest(negotiated)).status).toBe(404);
  });
});

describe('middleware — audit assets', () => {
  it('streams a declared file with its content type', async () => {
    const ctx = context(`/audits/${SLUG}/assets/figure.svg`);
    const res = await onRequest(ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(await res.text()).toContain('<svg');
  });

  it('answers 206 to a video range request', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, 'assets', 'clip.mp4')));
    const ctx = context(`/audits/${SLUG}/assets/clip.mp4`, { range: 'bytes=0-3' });
    const res = await onRequest(ctx);

    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(res.headers.get('Content-Range')).toBe(`bytes 0-3/${bytes.length}`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes.slice(0, 4));
  });

  it('answers 404 for an undeclared file and for a private audit', async () => {
    const ctx = context(`/audits/${SLUG}/assets/unlisted.bin`);
    expect((await onRequest(ctx)).status).toBe(404);
    expect(ctx.next).toHaveBeenCalled();

    const doc = fixtureDoc();
    doc['visibility'] = 'private';
    (doc['access'] as Record<string, unknown>) = { emails: ['reader@example.com'] };
    const priv = context(`/audits/${SLUG}/assets/figure.svg`, { audits: makeAudits(doc) });
    expect((await onRequest(priv)).status).toBe(404);
  });
});

describe('audit renderer — safety', () => {
  const strings = {
    contents: 'Contents', deliverables: 'D', downloadPdf: 'PDF', downloadBundle: 'Bundle',
    meta: { client: 'C', auditors: 'A', period: 'P', version: 'V', status: 'S' },
    status: { draft: 'd', delivered: 'e', final: 'f' },
    filters: { all: 'All', severity: 'Sev', status: 'St' },
    severity: { critical: 'c', high: 'h', medium: 'm', low: 'l', info: 'i' },
    findingStatus: { open: 'o', fixed: 'f', accepted: 'a', 'wont-fix': 'w' },
    finding: { evidence: 'E', recommendation: 'R', effort: 'Ef', cost: 'Co', fixedIn: 'Fx' },
    effort: { small: 's', medium: 'm', large: 'l' },
    findings: 'Findings',
    sources: 'S', back: 'Back', showStep: 'Show {n}', chartFallback: 'F', codeCopy: 'C', codeCopied: 'Cc',
  } as never;

  it('escapes document strings and renders markdown without raw HTML', () => {
    const doc = fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
    doc.meta.title = '<script>alert(1)</script>';
    (doc.sections[0].blocks[1] as { markdown: string }).markdown =
      '<img src=x onerror=alert(1)> and [evil](javascript:alert(1)) and {{finding:missing}}';

    const html = auditPageHtml(doc, SLUG);

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).toContain('{{finding:missing}}');
  });

  it('skips unknown block types', () => {
    const doc = fixtureDoc() as unknown as Parameters<typeof renderBlock>[1]['doc'];
    expect(renderBlock({ type: 'teleport' }, { slug: SLUG, doc, t: strings, sec: 0, i: 0 })).toBe('');
  });

  it('loads the chart, diagram and code libraries only on audits that use them', () => {
    const client = readFileSync(resolve(__dirname, '..', 'lib', 'audit', 'client.ts'), 'utf8');
    expect(client).toMatch(/import\(['"]vega-embed['"]\)/);
    expect(client).toMatch(/import\(['"]mermaid['"]\)/);
    expect(client).toMatch(/import\(['"]highlight\.js['"]\)/);
    expect(client).not.toMatch(/^import .* from ['"](vega-embed|mermaid|highlight\.js)['"]/m);
  });
});
