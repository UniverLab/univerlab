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
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { KNOWN_BLOCK_TYPES, LAYOUT_TYPES } from '../lib/audit/types';
import { auditPageHtml } from '../lib/audit/render';
import { annexEntryHtml, findingEntryHtml, renderBlock } from '../lib/audit/blocks';
import { areaLabel } from '../lib/audit/areas';

const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'audit-contract');
const SLUG = 'fixture-audit';

type Doc = Record<string, unknown>;

function fixtureDoc(): Doc {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'audit.json'), 'utf8')) as Doc;
}

/** In-memory AUDITS bucket: `<slug>/audit.json` plus the fixture asset files. */
/** In-memory AUDITS bucket in the edition layout: `<system>/<edition>/`
 * plus the fixture asset files, with a prefix-aware `list`. The fixture
 * slug doubles as its own system and edition, so `/audits/<SLUG>/` keeps
 * serving it as the latest edition. */
function makeAudits(doc: Doc) {
  const files = new Map<string, Uint8Array>();
  files.set(`${SLUG}/${SLUG}/audit.json`, Buffer.from(JSON.stringify(doc)));
  for (const entry of readFixtureAssets()) {
    files.set(`${SLUG}/${SLUG}/${entry.path}`, entry.bytes);
  }
  return {
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      return { objects: [...files.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
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
    // References stay inside their sentence: one <p>, never a column of
    // blocks. The tempered span never crosses a closing </p>, so a fragment
    // split anywhere mid-sentence fails the match.
    expect(body).toMatch(/<p>This fixture cites <a class="audit-ref" href="#audit-finding-F-01">/);
    expect(body).toMatch(/<p>This fixture cites(?:(?!<\/p>)[\s\S])*to prove inline references resolve\.<\/p>/);
    expect(body).toMatch(/<p>Read the <span class="audit-term"/);
    expect(body).toMatch(/<p>Read the(?:(?!<\/p>)[\s\S])*summary first\.<\/p>/);
    expect(body).toContain('Fixture definition: one client journey');
    expect(body).toContain(`href="/audits/${SLUG}/${SLUG}/assets/figure.svg"`);
    expect(body).toContain(`href="/audits/${SLUG}/${SLUG}/assets/report.pdf"`);
    expect(body).toContain('href="#audit-sec-overview"');
    expect(body).toContain('id="audit-sec-overview"');
    expect(body).toContain('id="audit-finding-F-01"');
    expect(body).toContain('id="audit-source-owasp"');
    expect(body).toContain('class="audit-back"');
    expect(body).toContain('href="https://github.com/univerlab/fixture-repo"');
    expect(body).toContain('Open the repository');
    expect(body).toContain('Access is by invitation');
    expect(body).toContain('Fixture Client (not a real client)');
    expect(body).toContain('Contract Test Team');
    expect(body).toContain('2026-01-09');
    expect(body).toContain('id="audit-data"');
  });

  it('lists annexes between findings and sources, referenced like evidence', async () => {
    const doc = fixtureDoc();
    for (const s of (doc['sections'] as Doc[])) {
      s['blocks'] = ((s['blocks'] as Doc[]) ?? []).filter((b) => b['type'] !== 'sources');
    }
    doc['annexes'] = [{
      id: 'sandbox',
      title: 'Repro sandbox',
      description: 'Runs the finding end to end.',
      instructions: 'Run `sh repro.sh`.',
      assets: ['chart-data'],
    }];
    const findings = doc['findings'] as Doc[];
    (findings[0]['evidence'] as unknown[]).push({ type: 'annex', id: 'sandbox' });
    const overview = ((doc['sections'] as Doc[])[0]['blocks'] as Doc[])[1];
    overview['markdown'] = `${overview['markdown']} See {{annex:sandbox}}.`;
    const ctx = context(`/audits/${SLUG}/`, { audits: makeAudits(doc) });
    const res = await onRequest(ctx);
    const body = await res.text();

    expect(res.status).toBe(200);
    const fi = body.indexOf('audit-auto-findings');
    const ai = body.indexOf('audit-auto-annexes');
    const si = body.indexOf('audit-auto-sources');
    expect(fi).toBeGreaterThanOrEqual(0);
    expect(ai).toBeGreaterThan(0);
    expect(si).toBeGreaterThan(0);
    expect(fi).toBeLessThan(ai);
    expect(ai).toBeLessThan(si);
    expect(body).toContain('id="audit-annex-sandbox"');
    expect(body).toContain('Repro sandbox');
    expect(body).toContain('Runs the finding end to end.');
    expect(body).toContain('Usage');
    expect(body).toContain(`href="/audits/${SLUG}/${SLUG}/assets/chart-data.json"`);
    expect(body).toContain('class="audit-annex-file-name">chart-data.json<');
    const chart = (doc['assets'] as Doc[]).find((a) => a['id'] === 'chart-data')!;
    expect(body).toContain(chart['sha256'] as string);
    expect(body).toContain('class="audit-annex-size"');
    expect(body).toContain('Copy');
    expect(body).toContain('href="#audit-annex-sandbox"');
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

  it('lists the repository on the public page only when it is marked public', () => {
    const unflagged = fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
    delete unflagged.deliverables.repositoryPublic;
    const priv = auditPageHtml(unflagged, SLUG);
    expect(priv).toContain('href="https://github.com/univerlab/fixture-repo"');
    expect(priv).toContain('Open the repository');
    const pub = auditPageHtml(unflagged, SLUG, { published: { previous: null, next: [] } });
    expect(pub).not.toContain('Open the repository');
    expect(pub).not.toContain('https://github.com/univerlab/fixture-repo');
    const flagged = fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
    const pubFlagged = auditPageHtml(flagged, SLUG, { published: { previous: null, next: [] } });
    expect(pubFlagged).toContain('href="https://github.com/univerlab/fixture-repo"');
    expect(pubFlagged).toContain('Open the repository');
  });

  it('renders the deliverables unchanged when the audit names no repository', () => {
    const doc = fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
    delete doc.deliverables.repository;
    delete doc.deliverables.repositoryPublic;

    const priv = auditPageHtml(doc, SLUG);
    expect(priv).toContain(`href="/audits/${SLUG}/assets/report.pdf"`);
    expect(priv).not.toContain('Open the repository');
    const pub = auditPageHtml(doc, SLUG, { published: { previous: null, next: [] } });
    expect(pub).toContain('Download the report (PDF)');
    expect(pub).not.toContain('Open the repository');
  });

  it('lists the audit signed documents with their state and downloads', () => {
    const doc = fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
    const id = 'a'.repeat(32);
    const html = auditPageHtml(doc, SLUG, {
      signedDocs: [
        { id, title: 'NDA Acme', state: 'signed', signedHash: 'e'.repeat(64) },
        { id: 'b'.repeat(32), title: 'Service order 7', state: 'ready', signedHash: null },
        { id: 'c'.repeat(32), title: 'Old NDA', state: 'revoked', signedHash: null },
      ],
    });
    expect(html).toContain('Signed documents');
    expect(html).toContain('NDA Acme');
    expect(html).toContain('Service order 7');
    expect(html).toContain(`/api/sign-file?id=${id}&amp;signed=1`);
    expect(html).not.toContain(`/api/sign-file?id=${'b'.repeat(32)}&amp;signed=1`);
    expect(html).not.toContain(`/api/sign-file?id=${'c'.repeat(32)}&amp;signed=1`);
    // States are localized labels, never the raw link-state codes.
    expect(html).toContain('— pending');
    expect(html).toContain('— revoked');
    expect(html).not.toContain('— ready');
    const bare = auditPageHtml(doc, SLUG);
    expect(bare).not.toContain('audit-signed-docs');
  });

  it('localizes the signed document states with the audit language', () => {
    const doc = fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
    const esDoc = { ...doc, meta: { ...doc.meta, language: 'es' as const } };
    const html = auditPageHtml(esDoc, SLUG, {
      signedDocs: [{ id: 'a'.repeat(32), title: 'NDA Acme', state: 'signed', signedHash: 'e'.repeat(64) }],
    });
    expect(html).toContain('Documentos firmados');
    expect(html).toContain('— firmado');
    expect(html).not.toContain('— signed');
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

describe('audit report viewer', () => {
  it('embeds the signing viewer and a named download when a report exists', () => {
    const doc = fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
    const priv = auditPageHtml(doc, SLUG);
    expect(priv).toContain('class="audit-report-viewer"');
    expect(priv).toContain('class="sign-reader"');
    expect(priv).toContain(`data-src="/audits/${SLUG}/assets/report.pdf"`);
    expect(priv).toContain('download="fixture-audit-1.0-en.pdf"');
    expect(priv).toContain('Read the report here');
    expect(priv).toContain('data-page-of=');
  });

  it('loads the report through the public route on the published page', () => {
    const doc = fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
    const pub = auditPageHtml(doc, SLUG, {
      assetBase: '/workbench/audits',
      published: { previous: null, next: [] },
    });
    expect(pub).toContain(`data-src="/workbench/audits/${SLUG}/assets/report.pdf"`);
    expect(pub).toContain('download="fixture-audit-1.0-en.pdf"');
  });

  it('names the download after system, edition and language', () => {
    const doc = fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
    const html = auditPageHtml(doc, 'acme/2026-01', { system: 'acme' });
    expect(html).toContain('download="acme-2026-01-en.pdf"');
    const esDoc = { ...doc, meta: { ...doc.meta, language: 'es' as const } };
    const esHtml = auditPageHtml(esDoc, 'acme/2026-01', { system: 'acme' });
    expect(esHtml).toContain('download="acme-2026-01-es.pdf"');
    expect(esHtml).toContain('Leer el informe aquí');
    expect(esHtml).not.toContain('Read the report here');
  });

  it('emits nothing report-related when there is no report deliverable', () => {
    const doc = fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
    delete doc.deliverables.report;
    const html = auditPageHtml(doc, SLUG);
    expect(html).not.toContain('audit-report-viewer');
    expect(html).not.toContain('sign-reader');
    expect(html).not.toContain('audit-report-download');
  });

  it('loads the signing reader lazily from the audit client', () => {
    const client = readFileSync(resolve(__dirname, '..', 'lib', 'audit', 'client.ts'), 'utf8');
    expect(client).toMatch(/import\(['"]\.\.\/sign\/reader['"]\)/);
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

  it('loads the chart and diagram libraries only on audits that use them', () => {
    const client = readFileSync(resolve(__dirname, '..', 'lib', 'audit', 'client.ts'), 'utf8');
    expect(client).toMatch(/import\(['"]vega-embed['"]\)/);
    expect(client).toMatch(/import\(['"]mermaid['"]\)/);
    // Code blocks render as plain-text spans, so no syntax library ships.
    expect(client).not.toMatch(/highlight\.js/);
    expect(client).not.toMatch(/^import .* from ['"](vega-embed|mermaid)['"]/m);
  });
});

describe('audit deliverable page', () => {
  function pageDoc(): Parameters<typeof auditPageHtml>[0] {
    return fixtureDoc() as unknown as Parameters<typeof auditPageHtml>[0];
  }

  it('covers system, client, edition, auditors and classification with the lab mark', () => {
    const html = auditPageHtml(pageDoc(), SLUG);
    expect(html).toContain('class="audit-cover-mark"');
    expect(html).toContain('<svg');
    expect(html).toContain('UniverLab');
    expect(html).toContain('<code>fixture-audit</code>');
    expect(html).toContain('Fixture Client (not a real client)');
    expect(html).toContain('2026-01-09 · 1.0 · delivered');
    expect(html).toContain('Contract Test Team');
    expect(html).toContain('Classification');
    expect(html).toContain('Published');

    const priv = { ...pageDoc(), visibility: 'private' } as Parameters<typeof auditPageHtml>[0];
    expect(auditPageHtml(priv, SLUG)).toContain('Confidential');
  });

  it('summarizes the severities before the table of contents', () => {
    const html = auditPageHtml(pageDoc(), SLUG);
    const summaryAt = html.indexOf('audit-summary');
    const tocAt = html.indexOf('audit-toc');
    expect(summaryAt).toBeGreaterThanOrEqual(0);
    expect(summaryAt).toBeLessThan(tocAt);
    expect(html).toContain('Executive summary');
    // One critical, one high, one informational finding in the fixture.
    expect(html).toContain('data-severity="critical" style="--audit-bar:33%"');
    expect(html).toContain('data-severity="high" style="--audit-bar:33%"');
    expect(html).toContain('data-severity="info" style="--audit-bar:33%"');
    expect(html).toContain('1 open · 1 fixed · Highest open severity: critical');
  });

  it('renders every finding as a shut card that opens to the full finding', () => {
    const html = auditPageHtml(pageDoc(), SLUG);
    expect(html).toContain('<details>');
    expect(html).toContain('<summary class="audit-finding-row">');
    expect(html).not.toMatch(/<details open/);
    expect(html).toContain('class="audit-finding-id">F-01<');
    expect(html).toContain('class="audit-finding-impact">A placeholder finding proving the critical path renders.<');
    expect(html).toContain('class="audit-finding-body"');
  });

  it('caps code transcripts behind an expand control', () => {
    const html = auditPageHtml(pageDoc(), SLUG);
    expect(html).toContain('class="audit-code-expand" hidden aria-expanded="false">Expand<');
  });

  it('covers the same ground in Spanish', () => {
    const doc = pageDoc();
    const esDoc = { ...doc, meta: { ...doc.meta, language: 'es' as const } };
    const html = auditPageHtml(esDoc, SLUG);
    expect(html).toContain('Resumen ejecutivo');
    expect(html).toContain('Sistema');
    expect(html).toContain('Publicado');
  });
});

describe('audit real-edition rendering', () => {
  type PageDoc = Parameters<typeof auditPageHtml>[0];

  /** The fixture with prose the old renderer leaked: backticks and
   *  `{{finding:…}}` markers in every prose-carrying field. */
  function richDoc(lang: 'en' | 'es'): PageDoc {
    const doc = fixtureDoc() as unknown as PageDoc;
    doc.meta.language = lang;
    const f = doc.findings[0];
    f.title = '`zz-token` replay bypasses `zz-check()`';
    f.summary = 'A `zz-token` minted for {{finding:F-02}} never expires.';
    f.recommendation = 'Rotate the `zz-secret` after {{finding:F-02}} ships.';
    for (const s of doc.sections) {
      for (const b of s.blocks as { type?: string; steps?: { title?: string; description?: string }[]; rows?: unknown[][]; columns?: unknown[] }[]) {
        if (b.type === 'timeline' && b.steps) {
          b.steps[0].title = 'Ship `zz-v2` of the {{finding:F-02}} flow';
          b.steps[0].description = 'Closes {{finding:F-01}} with a `zz-token` rotation.';
        }
        if (b.type === 'table' && b.rows) {
          b.rows = [['`zz-k1` and {{finding:F-01}}', 1]];
          b.columns = ['`zz-col`', 'Count'];
        }
      }
    }
    return doc;
  }

  it.each(['en', 'es'] as const)('resolves refs and inline code everywhere (%s)', (lang) => {
    const html = auditPageHtml(richDoc(lang), SLUG);

    expect(html).not.toContain('{{finding:');
    expect(html).not.toContain('`zz-token`');
    expect(html).not.toContain('`zz-k1`');
    expect(html).toContain('<code>zz-token</code>');
    expect(html).toContain('<code>zz-check()</code>');
    expect(html).toContain('<code>zz-secret</code>');
    // Finding title in its card and in the findings table.
    expect(html).toContain('<code>zz-token</code> replay bypasses');
    // Timeline title and description resolve refs and code.
    expect(html).toMatch(/audit-timeline[\s\S]*href="#audit-finding-F-02"/);
    expect(html).toMatch(/audit-timeline[\s\S]*<code>zz-v2<\/code>/);
    expect(html).toMatch(/audit-timeline[\s\S]*<code>zz-token<\/code>/);
    // Table header and cell.
    expect(html).toContain('<code>zz-col</code>');
    expect(html).toContain('<code>zz-k1</code>');
  });

  it.each(['en', 'es'] as const)('resolves a reference inside a finding title in the findings table (%s)', (lang) => {
    const doc = richDoc(lang);
    doc.findings[0].title = '`zz-token` blocks {{finding:F-02}} replay';
    const t = (lang === 'es' ? es.audit : en.audit) as Parameters<typeof renderBlock>[1]['t'];
    const ctx = { slug: SLUG, doc: doc as Parameters<typeof renderBlock>[1]['doc'], t, sec: 0, i: 0 };
    const html = renderBlock({ type: 'findingsTable' }, ctx);

    expect(html).not.toContain('{{finding:');
    expect(html).toContain('<code>zz-token</code>');
    expect(html).toContain('href="#audit-finding-F-02"');
  });

  it('renders interface text in the edition language', () => {
    const editions = [{ id: 'e1', date: '2026-01-09', version: '1.0', status: 'draft', url: '/audits/x/', current: true }];
    const enHtml = auditPageHtml(richDoc('en'), SLUG, { editions });
    expect(enHtml).toContain('<th>Area</th>');
    expect(enHtml).not.toContain('<th>·</th>');
    expect(enHtml).toContain('>Authentication<');
    expect(enHtml).toContain('2026-01-09 · 1.0 · draft');

    const esHtml = auditPageHtml(richDoc('es'), SLUG, { editions });
    expect(esHtml).toContain('<th>Área</th>');
    expect(esHtml).not.toContain('<th>·</th>');
    expect(esHtml).toContain('>Autenticación<');
    expect(esHtml).toContain('2026-01-09 · 1.0 · borrador');
    expect(esHtml).not.toContain('>draft<');
    // Unknown ids show the raw id, never a half translation.
    expect(esHtml).toContain('>flows<');
    expect(esHtml).not.toContain('>Flows<');
    expect(enHtml).toContain('>flows<');
    expect(enHtml).not.toContain('>Flows<');
    for (const lang of ['es', 'en'] as const) {
      expect(areaLabel('data-flows', lang)).toBe('data-flows');
      expect(areaLabel('', lang)).toBe('');
    }
    // Every category a published audit uses has words in both languages.
    for (const [id, word] of [
      ['authorisation', 'Autorización'],
      ['transport', 'Transporte'],
      ['resource-limits', 'Límites de recursos'],
      ['usage', 'Uso'],
      ['graph-execution', 'Ejecución de graphs'],
      ['recovery', 'Recuperación'],
      ['privacy', 'Privacidad'],
    ] as const) {
      expect(areaLabel(id, 'es')).toBe(word);
      expect(areaLabel(id, 'en')).not.toBe(id);
    }
  });

  it.each(['en', 'es'] as const)('prints the finding summary once per card (%s)', (lang) => {
    const html = auditPageHtml(richDoc(lang), SLUG);
    const start = html.indexOf('id="audit-finding-F-01"');
    expect(start).toBeGreaterThanOrEqual(0);
    const card = html.slice(start, html.indexOf('</article>', start));
    expect(card.split('never expires.').length - 1).toBe(1);
  });

  it.each([
    ['en', 'Enlarge', 'Close'],
    ['es', 'Ampliar', 'Cerrar'],
  ] as const)('wraps SVG figures in a plate with a zoom button (%s)', (lang, zoom, close) => {
    const doc = richDoc(lang);
    const t = (lang === 'es' ? es.audit : en.audit) as Parameters<typeof renderBlock>[1]['t'];
    const ctx = { slug: SLUG, doc: doc as Parameters<typeof renderBlock>[1]['doc'], t, sec: 0, i: 0 };
    const html = renderBlock({ type: 'figure', asset: 'figure-svg', caption: 'C' }, ctx);

    expect(html).toContain('audit-figure--svg');
    expect(html).toContain('audit-figure-plate');
    expect(html).toContain(`class="audit-figure-zoom" data-close="${close}">${zoom}<`);
    expect(html).toContain('<img');
    expect(html).not.toContain('<svg');
  });

  it.each(['en', 'es'] as const)('renders code and refs in media captions and asset titles (%s)', (lang) => {
    const doc = richDoc(lang);
    const asset = doc.assets.find((a) => a.id === 'report-pdf')!;
    asset.title = '`zz-report` for {{finding:F-01}}';
    const t = (lang === 'es' ? es.audit : en.audit) as Parameters<typeof renderBlock>[1]['t'];
    const ctx = { slug: SLUG, doc: doc as Parameters<typeof renderBlock>[1]['doc'], t, sec: 0, i: 0 };
    const caption = 'A `zz-cap` for {{finding:F-01}} while {{spec_name}} stays';
    const fig = renderBlock({ type: 'figure', asset: 'figure-svg', caption }, ctx);
    expect(fig).toContain('<code>zz-cap</code>');
    expect(fig).toContain('href="#audit-finding-F-01"');
    expect(fig).toContain('{{spec_name}}');
    const chartHtml = renderBlock({ type: 'chart', spec: { mark: 'bar' }, caption }, ctx);
    expect(chartHtml).toContain('<code>zz-cap</code>');
    expect(chartHtml).toContain('href="#audit-finding-F-01"');
    expect(chartHtml).toContain('{{spec_name}}');
    const bareChart = renderBlock({ type: 'chart', caption }, ctx);
    expect(bareChart).toContain('<code>zz-cap</code>');
    expect(bareChart).toContain('href="#audit-finding-F-01"');
    // The bare chart's data link carries its asset title, so code resolves there too.
    const dataAsset = doc.assets.find((a) => a.id === 'chart-data')!;
    dataAsset.title = '`zz-data` for {{finding:F-01}}';
    const fedBare = renderBlock({ type: 'chart', dataAsset: 'chart-data', caption: 'C' }, ctx);
    expect(fedBare).toContain('<code>zz-data</code>');
    expect(fedBare).toContain('href="#audit-finding-F-01"');
    // A non-image figure falls back to a link with its asset title.
    const fallbackFig = renderBlock({ type: 'figure', asset: 'report-pdf', caption: 'C' }, ctx);
    expect(fallbackFig).toContain('<code>zz-report</code>');
    expect(fallbackFig).toContain('href="#audit-finding-F-01"');
    const diagram = renderBlock({ type: 'diagram', mermaid: 'flowchart LR\n  A-->B', caption }, ctx);
    expect(diagram).toContain('<code>zz-cap</code>');
    expect(diagram).toContain('href="#audit-finding-F-01"');
    expect(diagram).toContain('{{spec_name}}');
    const card = renderBlock({ type: 'assetCard', asset: 'report-pdf' }, ctx);
    expect(card).toContain('<code>zz-report</code>');
    expect(card).toContain('href="#audit-finding-F-01"');
    // The asset card description carries the same inline treatment: it is
    // the last backticked fragment the real audit shows (F-02 transcript).
    const cardDesc = renderBlock(
      { type: 'assetCard', asset: 'report-pdf', description: 'See `zz-desc` for {{finding:F-01}}' },
      ctx,
    );
    expect(cardDesc).toContain('<code>zz-desc</code>');
    expect(cardDesc).toContain('href="#audit-finding-F-01"');
    expect(cardDesc).not.toContain('`zz-desc`');
    const annex = annexEntryHtml(ctx, { id: 'a1', title: '`zz-annex` index', description: 'd', assets: ['report-pdf'] });
    expect(annex).toContain('<code>zz-annex</code>');
    expect(annex).toContain('<code>zz-report</code>');
    expect(annex).toContain('href="#audit-finding-F-01"');
    const f = doc.findings[0];
    f.evidence = [{ type: 'asset' as const, id: 'report-pdf' }];
    const entry = findingEntryHtml(ctx, f);
    expect(entry).toContain('<code>zz-report</code>');
  });

  it.each([
    ['en', 'Chart data is available in the downloadable bundle.'],
    ['es', 'Los datos del gráfico están en el paquete descargable.'],
  ] as const)('renders a chart without a spec as caption plus data link (%s)', (lang, fallback) => {
    const html = auditPageHtml(richDoc(lang), SLUG);

    // The data-fed chart keeps its caption and links its data…
    expect(html).toContain('Fixture chart fed by a data asset.');
    expect(html).toContain(`href="/audits/${SLUG}/assets/chart-data.json"`);
    // …while only the drawable chart keeps a mount and a spec.
    expect(html.match(/data-spec=/g)).toHaveLength(1);
    expect(html.match(/audit-chart-mount/g)).toHaveLength(1);

    // No spec and no data: caption plus the fallback line, never a mount.
    const doc = richDoc(lang);
    const t = (lang === 'es' ? es.audit : en.audit) as Parameters<typeof renderBlock>[1]['t'];
    const ctx = { slug: SLUG, doc: doc as Parameters<typeof renderBlock>[1]['doc'], t, sec: 0, i: 0 };
    const bare = renderBlock({ type: 'chart', caption: 'C' }, ctx);
    expect(bare).toContain('<figcaption>C</figcaption>');
    expect(bare).toContain(fallback);
    expect(bare).not.toContain('data-spec');
    expect(bare).not.toContain('audit-chart-mount');
  });
});
