/**
 * Published audits at `/workbench/audits/<slug>/`: the public page outside
 * Cloudflare Access, the client badge and its snippet, the live markdown
 * twin, and the sitemap/llms.txt injection from the R2 listing.
 *
 * @jest-environment node
 *
 * Node rather than jsdom: the middleware is exercised end to end and needs
 * `Request` / `Response`, which jsdom does not ship.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { listPublicAudits, onRequest, publicAuditHistory } from '../../functions/_middleware';
import { auditBadge, badgeExpired, badgeSnippet, badgeText, badgeValidUntil } from '../lib/audit/badge';
import { auditMarkdown, PUBLIC_AUDIT_BASE } from '../lib/audit/markdown';
import { auditPageHtml } from '../lib/audit/render';
import type { AuditDocument } from '../lib/audit/types';
import { validateAuditDocument } from '../lib/audit/validate-document';
import { loadAuditSchema } from '../lib/audit/schema';

const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'audit-contract');

type Doc = Record<string, unknown>;

function fixtureDoc(): Doc {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'audit.json'), 'utf8')) as Doc;
}

function asAuditDocument(doc: Doc): AuditDocument {
  return doc as unknown as AuditDocument;
}

function recentIssued(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function publicDoc(lang: 'es' | 'en', badge?: Record<string, unknown>): Doc {
  const doc = fixtureDoc();
  (doc['meta'] as Doc)['language'] = lang;
  if (badge) doc['badge'] = badge;
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
        etag: '"public-fixture"',
        httpMetadata: {},
        text: async () => Buffer.from(bytes).toString('utf8'),
      };
    },
    async list() {
      return { objects: [...files.keys()].map((key) => ({ key })) };
    },
  };
}

describe('audit badge', () => {
  it('reads «Auditado por UniverLab · <mes año> · <alcance>» in the document language', () => {
    const es = asAuditDocument(publicDoc('es', { issued: '2026-06-15', scope: 'Tienda en línea' }));
    expect(badgeText(es)).toBe('Auditado por UniverLab · junio 2026 · Tienda en línea');
    const en = asAuditDocument(publicDoc('en', { issued: '2026-06-15', scope: 'Online store' }));
    expect(badgeText(en)).toBe('Audited by UniverLab · June 2026 · Online store');
  });

  it('defaults validity to 12 months after issue', () => {
    expect(badgeValidUntil({ issued: '2025-03-10', scope: 'X' })).toBe('2026-03-10');
    expect(badgeValidUntil({ issued: '2025-03-10', validUntil: '2025-09-10', scope: 'X' })).toBe('2025-09-10');
  });

  it('adds the over-12-months note past validity, with no other state change', () => {
    const now = new Date('2026-11-11T00:00:00Z');
    const fresh = asAuditDocument(publicDoc('es', { issued: recentIssued(), scope: 'Tienda' }));
    expect(badgeExpired(fresh.badge!, now)).toBe(false);
    expect(badgeText(fresh, now)).not.toContain('hace más de 12 meses');
    const old = asAuditDocument(publicDoc('es', { issued: '2020-01-15', scope: 'Tienda' }));
    expect(badgeExpired(old.badge!, now)).toBe(true);
    expect(badgeText(old, now)).toBe(
      'Auditado por UniverLab · enero 2020 · Tienda · hace más de 12 meses',
    );
    const oldEn = asAuditDocument(publicDoc('en', { issued: '2020-01-15', scope: 'Store' }));
    expect(badgeText(oldEn, now)).toContain('over 12 months ago');
  });

  it('serves a dark 640×32 SVG, escaped, never certified/secure/guaranteed', () => {
    const doc = asAuditDocument(publicDoc('es', { issued: '2026-06-15', scope: 'Tienda <b>&' }));
    const svg = auditBadge(doc, 'tienda', 'https://univerlab.org');
    expect(svg).toContain('width="640"');
    expect(svg).toContain('height="32"');
    expect(svg).toContain('Tienda &lt;b&gt;&amp;');
    expect(svg).not.toContain('<b>');
    expect(svg).not.toMatch(/certif|secure|guarantee/i);
  });

  it('hands the client an ordinary link named only «Auditado por UniverLab»', () => {
    const doc = asAuditDocument(publicDoc('es', { issued: '2026-06-15', scope: 'Alcance único' }));
    const snippet = badgeSnippet(doc, 'tienda', 'https://univerlab.org');
    expect(snippet).toContain('<a href="https://univerlab.org/workbench/audits/tienda/"');
    expect(snippet).toContain('aria-label="Auditado por UniverLab"');
    expect(snippet).toContain('<img src="https://univerlab.org/workbench/audits/tienda/badge.svg" alt="">');
    expect(snippet).not.toContain('Alcance único');
  });
});

describe('audit markdown twin', () => {
  it('carries the canonical source, meta, badge and findings with public asset URLs', () => {
    const doc = asAuditDocument(publicDoc('es', { issued: '2026-06-15', scope: 'Tienda' }));
    const md = auditMarkdown(doc, 'tienda');
    expect(md).toContain('source: "https://univerlab.org/workbench/audits/tienda/"');
    expect(md).toContain('# Contract fixture audit');
    expect(md).toContain('Insignia: auditado por UniverLab en 2026-06-15');
    expect(md).toContain('## Hallazgos');
    expect(md).toContain('/workbench/audits/tienda/assets/');
    expect(md).not.toContain('(/audits/tienda/assets/');
    expect(md).not.toContain('"/audits/tienda/assets/');
  });

  it('never exposes the allowlist', () => {
    const doc = publicDoc('es', { issued: '2026-06-15', scope: 'Tienda' });
    doc['access'] = { emails: ['reader@example.com'] };
    const md = auditMarkdown(asAuditDocument(doc), 'tienda');
    expect(md).not.toContain('reader@example.com');
    expect(md).not.toContain('access');
  });

  it('renders the twin in the document language', () => {
    const en = asAuditDocument(publicDoc('en', { issued: '2026-06-15', scope: 'Online store' }));
    const md = auditMarkdown(en, 'shop');
    expect(md).toContain('## Findings');
    expect(md).toContain('## Sources');
    expect(md).toContain('Severity:');
    expect(md).toContain('Badge: audited by UniverLab on 2026-06-15, scope: Online store.');
    expect(md).toContain('Client:');
    expect(md).not.toContain('## Hallazgos');
    expect(md).not.toContain('## Fuentes');
    expect(md).not.toContain('Severidad:');
    expect(md).not.toContain('Insignia:');
    expect(md).not.toContain('Cliente:');
  });
});

describe('audit badge contract', () => {
  it('the schema carries an optional badge with issue, validity, scope and previous', () => {
    const schema = loadAuditSchema() as Record<string, unknown>;
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['badge']['$ref']).toBe('#/$defs/badge');
    expect(props['badge']['description']).toBeTruthy();
    expect((schema['required'] as string[])).not.toContain('badge');
    const defs = schema['$defs'] as Record<string, Record<string, unknown>>;
    expect(defs['badge']['required']).toEqual(['issued', 'scope']);
    for (const prop of Object.values(defs['badge']['properties'] as Record<string, Record<string, unknown>>)) {
      expect(prop['description']).toBeTruthy();
    }
  });

  it('old documents without a badge still validate', () => {
    const { errors } = validateAuditDocument(fixtureDoc());
    expect(errors.filter((e) => e.path.startsWith('$.badge'))).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('rejects a validity that ends before the issue and a bad previous slug', () => {
    const early = publicDoc('es', { issued: '2026-06-15', validUntil: '2026-01-01', scope: 'X' });
    const { errors: e1 } = validateAuditDocument(early);
    expect(e1.map((e) => e.path)).toContain('$.badge.validUntil');

    const slug = publicDoc('es', { issued: '2026-06-15', scope: 'X', previous: 'not a slug!' });
    const { errors: e2 } = validateAuditDocument(slug);
    expect(e2.map((e) => e.path)).toContain('$.badge.previous');

    const ok = publicDoc('es', { issued: '2026-06-15', scope: 'X', previous: 'first-audit' });
    expect(validateAuditDocument(ok).errors).toEqual([]);
  });
});

describe('middleware — published audit page', () => {
  // Mirrors the built /audit-shell/: noindex (the gate requires it), the
  // Atom feed alternate and no markdown link — the rewrite lifts noindex and
  // must leave the feed link alone.
  const SHELL =
    '<html lang="en"><head><title>Published audit — UniverLab</title>' +
    '<meta name="description" content="A published UniverLab audit.">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<link rel="canonical" href="https://univerlab.org/audit-shell/">' +
    '<meta property="og:title" content="Published audit — UniverLab">' +
    '<meta property="og:description" content="A published UniverLab audit.">' +
    '<meta property="og:url" content="https://univerlab.org/audit-shell/">' +
    '<meta property="og:locale" content="en_US">' +
    '<meta name="twitter:title" content="Published audit — UniverLab">' +
    '<link rel="alternate" type="application/atom+xml" title="UniverLab Logbook" href="https://announcements.univerlab.org/feed.atom">' +
    '</head><body><div id="audit"></div></body></html>';
  const SITEMAP_XML =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    '<url><loc>https://univerlab.org/</loc></url>' +
    '</urlset>';
  const LLMS = '# UniverLab\n\n- [Home](https://univerlab.org/): lab.\n';

  function docs(): Record<string, Doc> {
    const priv = fixtureDoc();
    priv['visibility'] = 'private';
    priv['access'] = { emails: ['reader@example.com'] };
    const plain = fixtureDoc();
    return {
      'pub-audit': publicDoc('es', { issued: recentIssued(), scope: 'Tienda en línea' }),
      'pub-reaudit': publicDoc('es', {
        issued: recentIssued(),
        scope: 'Tienda en línea',
        previous: 'pub-audit',
      }),
      'priv-audit': priv,
      'plain-public': plain,
    };
  }

  interface Ctx {
    request: Request;
    env: {
      ASSETS: { fetch: (input: string | Request) => Promise<Response> };
      AUDITS: ReturnType<typeof makeBucket>;
    };
    next: () => Promise<Response>;
  }

  function context(pathname: string, opts?: { accept?: string; method?: string }): Ctx {
    return {
      request: new Request(`https://univerlab.org${pathname}`, {
        method: opts?.method ?? 'GET',
        headers: { Accept: opts?.accept ?? 'text/html' },
      }),
      env: {
        ASSETS: {
          fetch: jest.fn(async (input: string | Request) => {
            const url = String(input);
            if (url.endsWith('/audit-shell/')) return new Response(SHELL, { status: 200 });
            if (url.endsWith('/sitemap-0.xml')) {
              return new Response(SITEMAP_XML, { headers: { 'Content-Type': 'application/xml' } });
            }
            if (url.endsWith('/llms.txt')) {
              return new Response(LLMS, { headers: { 'Content-Type': 'text/plain' } });
            }
            return new Response('not found', { status: 404 });
          }),
        },
        AUDITS: makeBucket(docs()),
      },
      next: jest.fn(async () => new Response('site 404', { status: 404 })),
    };
  }

  beforeEach(() => {
    delete (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter;
  });

  it('renders 200 with canonical, dates, history, badge and snippet — indexable and cached', async () => {
    const ctx = context('/workbench/audits/pub-audit/');
    const res = await onRequest(ctx);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(res.headers.get('X-Robots-Tag')).toBeNull();
    expect(body).toContain('<html lang="es">');
    expect(body).toContain('https://univerlab.org/workbench/audits/pub-audit/');
    expect(body).toContain('class="audit-published"');
    expect(body).toContain('Fecha de la auditoría');
    expect(body).toContain('Vigencia');
    expect(body).toContain(`href="${PUBLIC_AUDIT_BASE}/pub-reaudit/"`);
    expect(body).toContain('class="audit-badge-copy"');
    expect(body).toContain('badge.svg');
    expect(body).toContain('/workbench/audits/pub-audit/assets/report.pdf');
    expect(body).not.toContain('"/audits/pub-audit/assets/');
    expect(body).not.toContain('reader@example.com');
    // The shell is noindex; the published page is indexed and keeps the
    // feed's alternate link pointing at the feed, not at index.md.
    expect(body).toContain('content="index, follow"');
    expect(body).not.toContain('noindex');
    expect(body).toContain('href="https://announcements.univerlab.org/feed.atom"');
    expect(body).toContain('content="es_ES"');
    expect(body).toContain('Contract fixture audit (not a real audit) — UniverLab');
  });

  it('links the previous audit from the re-audit', async () => {
    const ctx = context('/workbench/audits/pub-reaudit/');
    const body = await (await onRequest(ctx)).text();
    expect(body).toContain(`href="${PUBLIC_AUDIT_BASE}/pub-audit/"`);
    expect(body).toContain('Auditoría anterior');
  });

  it('answers 404 for a private slug, a missing slug and an invalid document', async () => {
    const priv = context('/workbench/audits/priv-audit/');
    expect((await onRequest(priv)).status).toBe(404);
    expect(priv.next).toHaveBeenCalled();

    const missing = context('/workbench/audits/no-such-audit/');
    expect((await onRequest(missing)).status).toBe(404);
  });

  it('serves badge.svg for public audits with a badge, 404 otherwise', async () => {
    const ok = context('/workbench/audits/pub-audit/badge.svg');
    const res = await onRequest(ok);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(await res.text()).toContain('Auditado por UniverLab');

    expect((await onRequest(context('/workbench/audits/priv-audit/badge.svg'))).status).toBe(404);
    expect((await onRequest(context('/workbench/audits/plain-public/badge.svg'))).status).toBe(404);
  });

  it('serves the markdown twin at index.md and for a markdown Accept, never with emails', async () => {
    const twin = context('/workbench/audits/pub-audit/index.md');
    const res = await onRequest(twin);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/markdown');
    const md = await res.text();
    expect(md).toContain('source: "https://univerlab.org/workbench/audits/pub-audit/"');
    expect(md).not.toContain('reader@example.com');

    const negotiated = context('/workbench/audits/pub-audit/', { accept: 'text/markdown' });
    expect((await onRequest(negotiated)).status).toBe(200);
    expect((await (await onRequest(negotiated)).text())).toContain('source: "https://univerlab.org/workbench/audits/pub-audit/"');

    const privTwin = context('/workbench/audits/priv-audit/index.md');
    expect((await onRequest(privTwin)).status).toBe(404);
  });

  it('answers 404 for the shell asked directly', async () => {
    expect((await onRequest(context('/audit-shell/'))).status).toBe(404);
    expect((await onRequest(context('/audit-shell'))).status).toBe(404);
  });

  it('injects public audits into the sitemap and llms.txt, never private ones', async () => {
    const sitemap = await onRequest(context('/sitemap-0.xml'));
    const xml = await sitemap.text();
    expect(xml).toContain('<loc>https://univerlab.org/workbench/audits/pub-audit/</loc>');
    expect(xml).toContain('<loc>https://univerlab.org/workbench/audits/pub-reaudit/</loc>');
    expect(xml).not.toContain('priv-audit');

    const llms = await onRequest(context('/llms.txt'));
    const txt = await llms.text();
    expect(txt).toContain('(https://univerlab.org/workbench/audits/pub-audit/)');
    expect(txt).toContain('https://univerlab.org/workbench/audits/pub-audit/index.md');
    expect(txt).not.toContain('priv-audit');
  });

  it('lists only public documents from the bucket', async () => {
    const all = await listPublicAudits({ AUDITS: makeBucket(docs()) });
    expect(all.map((e) => e.slug).sort()).toEqual(['plain-public', 'pub-audit', 'pub-reaudit']);
  });

  it('links history only between public audits', () => {
    const ghost = asAuditDocument(publicDoc('es', { issued: recentIssued(), scope: 'X', previous: 'priv-audit' }));
    const all = [
      { slug: 'pub-audit', doc: asAuditDocument(publicDoc('es', { issued: recentIssued(), scope: 'X' })) },
      { slug: 'ghost', doc: ghost },
    ];
    expect(publicAuditHistory('ghost', ghost, all)).toEqual({ previous: null, next: [] });
    expect(publicAuditHistory('pub-audit', all[0].doc, all)).toEqual({ previous: null, next: [] });
  });
});

describe('published audit renderer', () => {
  function badged(lang: 'es' | 'en'): AuditDocument {
    return asAuditDocument(publicDoc(lang, { issued: '2026-06-15', scope: 'Tienda' }));
  }

  it('shows dates, history, badge and snippet only when published', () => {
    const withPub = auditPageHtml(badged('es'), 'tienda', {
      assetBase: PUBLIC_AUDIT_BASE,
      published: { previous: 'primera', next: ['tercera'] },
    });
    expect(withPub).toContain('class="audit-published"');
    expect(withPub).toContain('2026-06-15');
    expect(withPub).toContain('2027-06-15');
    expect(withPub).toContain(`${PUBLIC_AUDIT_BASE}/primera/`);
    expect(withPub).toContain(`${PUBLIC_AUDIT_BASE}/tercera/`);
    expect(withPub).toContain('Insignia para tu sitio');
    expect(withPub).toContain('Copiar el HTML');

    const plain = auditPageHtml(badged('es'), 'tienda');
    expect(plain).not.toContain('audit-published');
    expect(plain).toContain('/audits/tienda/assets/report.pdf');
  });

  it('marks an expired badge on the page', () => {
    const old = asAuditDocument(publicDoc('es', { issued: '2020-01-15', scope: 'Tienda' }));
    const html = auditPageHtml(old, 'vieja', {
      assetBase: PUBLIC_AUDIT_BASE,
      published: { previous: null, next: [] },
    });
    expect(html).toContain('hace más de 12 meses');
  });
});

describe('published audit dictionaries, view and terms', () => {
  it('both languages carry the same offers with founding spots the operator updates', async () => {
    const { en } = await import('../i18n/en');
    const { es } = await import('../i18n/es');
    expect(Object.keys(en.workbench.audits.offers).sort()).toEqual(Object.keys(es.workbench.audits.offers).sort());
    for (const offers of [en.workbench.audits.offers, es.workbench.audits.offers]) {
      expect(offers.founding.spots).toBe(5);
      expect(offers.rules).toHaveLength(4);
      for (const t of [offers.founding.title, offers.public.title, offers.reaudit.title]) {
        expect(t.length).toBeGreaterThan(0);
      }
    }
    expect(es.workbench.audits.offers.founding.title).toContain('fundadoras');
    expect(en.workbench.audits.offers.reaudit.title).toContain('Re-audit');
  });

  it('the audits view renders the offers and hides the founding one at zero spots', () => {
    const view = readFileSync(resolve(__dirname, '..', 'views', 'WorkbenchAudits.astro'), 'utf8');
    expect(view).toContain('a.offers.founding.spots > 0');
    expect(view).toContain('a.offers.public.title');
    expect(view).toContain('a.offers.reaudit.title');
    for (const rule of ['a.offers.rules', 'a.offers.kicker']) expect(view).toContain(rule);
  });

  it('the terms carry the published-audits section in both languages, in the same order', async () => {
    const { privacyEn, termsEn } = await import('../data/legal-en');
    const { privacyEs, termsEs } = await import('../data/legal-es');
    const enIds = termsEn.sections.map((s) => s.id);
    const esIds = termsEs.sections.map((s) => s.id);
    expect(enIds).toEqual(esIds);
    expect(enIds).toContain('published-audits');
    const enSection = termsEn.sections.find((s) => s.id === 'published-audits')!;
    const esSection = termsEs.sections.find((s) => s.id === 'published-audits')!;
    expect(enSection.paras).toHaveLength(3);
    expect(esSection.paras).toHaveLength(3);
    for (const para of [...enSection.paras, ...esSection.paras]) {
      expect(para).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
    expect(privacyEn.sections.flatMap((s) => s.paras).join(' ')).toContain('public address');
    expect(privacyEs.sections.flatMap((s) => s.paras).join(' ')).toContain('dirección pública');
  });
});



