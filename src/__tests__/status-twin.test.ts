/**
 * AGR1 — the live markdown twin of `/status/` and `/es/status/`.
 *
 * @jest-environment node
 *
 * Node rather than jsdom because the middleware is exercised end to end and
 * needs `Request` / `Response` / `AbortSignal`, which jsdom does not ship — the
 * same reason `roadmap-api.test.ts` opts out. No test here touches the network:
 * `global.fetch` is replaced per case, and `env.ASSETS.fetch` models the built
 * site (`/status/index.md` exists, `/es/status/index.md` does not).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { onRequest } from '../../functions/_middleware';
import { isoDate } from '../../src/lib/lab-feed';
import {
  FEED_URL,
  ROADMAP_TWIN_URL,
  renderStatusTwin,
  statusTwinRoute,
  type Entry,
} from '../../functions/status-twin';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/**
 * The static twin an API outage falls back to — what `scripts/build-md.ts`
 * writes into `dist/status/index.md`: the page's front matter over a real
 * logbook snapshot. Never the empty shell (FR3).
 */
const STATIC_TWIN =
  '---\n' +
  'title: "Logbook — live status of every UniverLab experiment"\n' +
  'source: "https://univerlab.org/status/"\n' +
  '---\n\n' +
  '## Logbook\n\n' +
  '- **2026 · Sol 280 · 01:09 UTC** (2026-10-06T01:09Z) · launch · general — **A built snapshot entry**: First paragraph.\n\n' +
  'Snapshot taken at build time (2026-10-26T12:00:00.000Z); the live version is served at this same address.\n';

/** The one line that points at the roadmap twin instead of a Roadmap section. */
const ROADMAP_POINTER = 'Roadmap: https://univerlab.org/roadmap/index.md';

function entry(over: Partial<Entry> & { id: string; title: string }): Entry {
  return {
    date: '2026-10-06T01:09:26.735Z',
    body: 'First paragraph.\n\nSecond paragraph that must not survive.',
    type: 'launch',
    topic: 'general',
    link: null,
    ...over,
  };
}

// The entry-line head depends on the local TZ (local-midnight Sol epoch).
function entryHead(date: string): string {
  const d = new Date(date);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const sol = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  return `**${d.getFullYear()} \u00b7 Sol ${sol} \u00b7 ${hh}:${mm} UTC** (${isoDate(date)}T${hh}:${mm}Z)`;
}

/** Every `##`/`###` heading in order. */
const headings = (md: string) => md.match(/^#{2,3} .*$/gm) ?? [];

/** The body after the front matter: first line is the live-data sentence. */
const bodyOf = (md: string) => md.split('---\n')[2].trim().split('\n');

// ------------------------------------------------------------------ routes

describe('statusTwinRoute', () => {
  it('maps the four spec paths to a language', () => {
    expect(statusTwinRoute('/status/')).toBe('en');
    expect(statusTwinRoute('/status/index.md')).toBe('en');
    expect(statusTwinRoute('/es/status/')).toBe('es');
    expect(statusTwinRoute('/es/status/index.md')).toBe('es');
  });

  it('accepts the same routes without their trailing slash', () => {
    expect(statusTwinRoute('/status')).toBe('en');
    expect(statusTwinRoute('/es/status')).toBe('es');
  });

  it('refuses every other path', () => {
    expect(statusTwinRoute('/')).toBeNull();
    expect(statusTwinRoute('/status/archive/')).toBeNull();
    expect(statusTwinRoute('/statuses/')).toBeNull();
    expect(statusTwinRoute('/es/statusx/')).toBeNull();
  });
});

// ---------------------------------------------------------------- renderer

describe('renderStatusTwin — logbook only', () => {
  const md = renderStatusTwin({
    lang: 'en',
    entries: [
      entry({ id: 'e1', title: 'Ships the logbook', link: 'https://example.com/x' }),
      entry({ id: 'e2', title: 'Second entry', date: '2026-10-05T10:00:00.000Z', type: 'note', topic: null }),
    ],
  });

  it('renders exactly one section — the Logbook, never a Roadmap', () => {
    expect(headings(md)).toEqual(['## Logbook']);
    expect(md).not.toContain('## Roadmap');
    expect(md).not.toContain('### ');
  });

  it('points at the roadmap twin instead of duplicating the board', () => {
    expect(md).toContain(ROADMAP_POINTER);
    // One pointer line, not a section: nothing but the pointer may name the URL.
    expect(md.split(ROADMAP_POINTER).length - 1).toBe(1);
  });

  it('renders each entry in the shared one-line format, API order kept', () => {
    expect(md.split('\n')).toContain(
      `- ${entryHead('2026-10-06T01:09:26.735Z')} · launch · general — **Ships the logbook**: First paragraph. [link](https://example.com/x)`,
    );
    expect(md).toContain('- **2026');
    expect(md.indexOf('Ships the logbook')).toBeLessThan(md.indexOf('Second entry'));
  });

  it('starts the body with the live-data sentence and the feed URL', () => {
    const sentence = bodyOf(md)[0];
    expect(sentence).toMatch(/^This page is rendered live /);
    expect(sentence).toContain(FEED_URL);
    expect(sentence.endsWith('.')).toBe(true);
  });

  it('keeps the twin front-matter shape', () => {
    expect(md).toMatch(/^---\ntitle: "[^"]+"\nsource: "https:\/\/univerlab\.org\/status\/"\n---\n/);
  });
});

describe('renderStatusTwin — Spanish', () => {
  const md = renderStatusTwin({
    lang: 'es',
    entries: [entry({ id: 'e1', title: 'Lanzamiento', topic: 'texforge', link: 'https://example.com/x' })],
  });

  it('takes the section heading from the Spanish label', () => {
    expect(headings(md)).toEqual(['## Cuaderno de bitácora']);
  });

  it('keeps the entry content exactly as the API returned it', () => {
    expect(md).toContain(
      `- ${entryHead('2026-10-06T01:09:26.735Z')} · launch · texforge — **Lanzamiento**: First paragraph. [link](https://example.com/x)`,
    );
  });

  it('points at the English roadmap twin — /es/roadmap/ only redirects', () => {
    // public/_redirects 301s /es/roadmap/ to /roadmap/; the pointer names the
    // URL that actually answers rather than the redirect on the way to it.
    expect(ROADMAP_TWIN_URL.es).toBe('https://univerlab.org/roadmap/index.md');
    expect(ROADMAP_TWIN_URL.en).toBe('https://univerlab.org/roadmap/index.md');
    expect(md).toContain(ROADMAP_POINTER);
  });

  it('says the data is live, in Spanish, and names the feed', () => {
    const sentence = bodyOf(md)[0];
    expect(sentence).toMatch(/^Esta página se genera en vivo /);
    expect(sentence).toContain(FEED_URL);
  });
});

describe('renderStatusTwin — mission log entries', () => {
  it('renders an entry without a link as plain text', () => {
    const md = renderStatusTwin({
      lang: 'en',
      entries: [entry({ id: 'e2', title: 'No link here', link: null, type: 'note', topic: null })],
    });
    expect(md.split('\n')).toContain(
      `- ${entryHead('2026-10-06T01:09:26.735Z')} · note · general — **No link here**: First paragraph.`,
    );
    expect(md).not.toContain('[link](');
  });

  it('takes only the first paragraph of the body', () => {
    const md = renderStatusTwin({ lang: 'en', entries: [entry({ id: 'e3', title: 'T' })] });
    expect(md).toContain('First paragraph.');
    expect(md).not.toContain('Second paragraph');
  });

  it('prints the log in the order the API served it, never re-sorted', () => {
    // Same date, so only an id-desc sort could move them — the twin mirrors the
    // endpoint, it does not second-guess it. A WebMCP tool sorts; this must not.
    const md = renderStatusTwin({
      lang: 'en',
      entries: [
        entry({ id: 'a', title: 'Served first' }),
        entry({ id: 'z', title: 'Served second' }),
      ],
    });
    const lines = md.split('\n').filter((l) => l.startsWith('- '));
    expect(lines.map((l) => l.slice(l.indexOf('— **') + 4, l.indexOf('**:')))).toEqual([
      'Served first',
      'Served second',
    ]);
  });

  it('flattens a body whose first paragraph spans lines', () => {
    const md = renderStatusTwin({
      lang: 'en',
      entries: [entry({ id: 'e4', title: 'T', body: 'one\n  two\n\nrest' })],
    });
    expect(md).toContain(': one two');
    expect(md).not.toContain('rest');
  });
});

// --------------------------------------------------------------- middleware

interface Ctx {
  request: Request;
  env: { ASSETS: { fetch: (input: string | Request) => Promise<Response> } };
  next: () => Promise<Response>;
}

/** `env.ASSETS` models dist/: the English twin is built, the Spanish one is not. */
const BUILT_TWINS: Record<string, string> = { '/status/index.md': STATIC_TWIN };

function context(pathname: string, accept = 'text/markdown'): Ctx {
  return {
    request: new Request(`https://univerlab.org${pathname}`, { headers: { Accept: accept } }),
    env: {
      ASSETS: {
        fetch: jest.fn(async (input: string | Request) => {
          const path = new URL(String(input)).pathname;
          const body = BUILT_TWINS[path];
          return body === undefined
            ? new Response('not found', { status: 404 })
            : new Response(body, { status: 200 });
        }),
      },
    },
    next: jest.fn(async () => new Response('next', { status: 200 })),
  };
}

/** The mock behind `ctx.env.ASSETS.fetch` / `ctx.next`, for call assertions. */
const asMock = (fn: unknown) => fn as jest.Mock;

const realFetch = global.fetch;

/** The logbook payload, dispatched the way the middleware calls it. The twin
 *  never asks for the roadmap — `/roadmap/index.md` is the board's own twin —
 *  so a roadmap fetch here is a bug and throws. */
function apiMock(): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://announcements.univerlab.org/?limit=20') {
      return {
        ok: true,
        json: async () => ({
          entries: [
            entry({
              id: 'e1',
              title: 'The live twin ships',
              link: 'https://github.com/UniverLab/univerlab',
            }),
          ],
        }),
      } as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

afterEach(() => {
  global.fetch = realFetch;
});

describe('middleware — live twin', () => {
  it('renders /status/ from the public API and never touches ASSETS', async () => {
    const fetchMock = apiMock();
    global.fetch = fetchMock as unknown as typeof fetch;
    const ctx = context('/status/');

    const res = await onRequest(ctx);

    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('Vary')).toBe('Accept');
    const body = await res.text();
    expect(body).toContain('## Logbook');
    expect(body).toContain(ROADMAP_POINTER);
    expect(body).toContain('The live twin ships');
    expect(body).not.toContain('## Roadmap');
    expect(body).toContain(FEED_URL);
    expect(asMock(ctx.env.ASSETS.fetch)).not.toHaveBeenCalled();
    expect(asMock(ctx.next)).not.toHaveBeenCalled();
    // One read, the logbook — the roadmap fetch is gone with the section.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks the API read-only, edge-cached for 300 s, behind a signal', async () => {
    const fetchMock = apiMock();
    global.fetch = fetchMock as unknown as typeof fetch;
    await onRequest(context('/status/'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as [string, RequestInit & { cf?: unknown }][];
    for (const [url, init] of calls) {
      expect(url).toMatch(/^https:\/\/announcements\.univerlab\.org\//);
      expect(init.cf).toEqual({ cacheTtl: 300, cacheEverything: true });
      expect(init.headers).toBeUndefined();
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('renders the Spanish route with Spanish headings', async () => {
    global.fetch = apiMock() as unknown as typeof fetch;
    const body = await (await onRequest(context('/es/status/'))).text();
    expect(body).toContain('## Cuaderno de bitácora');
    expect(body).not.toContain('## Logbook');
    expect(body).toContain('The live twin ships');
    expect(body).toContain(ROADMAP_POINTER);
  });

  it('serves the live twin to Accept: */* on /status/index.md', async () => {
    // An agent GETs the twin by its file path with the default Accept; the
    // path itself says "markdown", so the twin must render live.
    const fetchMock = apiMock();
    global.fetch = fetchMock as unknown as typeof fetch;
    const ctx = context('/status/index.md', '*/*');

    const res = await onRequest(ctx);

    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    const body = await res.text();
    expect(body).toContain('## Logbook');
    expect(body).toContain('The live twin ships');
    expect(body).toContain(ROADMAP_POINTER);
    expect(body).not.toContain('## Roadmap');
    expect(asMock(ctx.env.ASSETS.fetch)).not.toHaveBeenCalled();
    expect(asMock(ctx.next)).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves the Spanish live twin to Accept: */* on /es/status/index.md', async () => {
    const fetchMock = apiMock();
    global.fetch = fetchMock as unknown as typeof fetch;
    const ctx = context('/es/status/index.md', '*/*');

    const res = await onRequest(ctx);

    const body = await res.text();
    expect(body).toContain('## Cuaderno de bitácora');
    expect(body).not.toContain('## Logbook');
    expect(body).toContain('The live twin ships');
    expect(asMock(ctx.next)).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores HTML requests entirely', async () => {
    const fetchMock = apiMock();
    global.fetch = fetchMock as unknown as typeof fetch;
    const ctx = context('/status/', 'text/html');

    const res = await onRequest(ctx);

    expect(await res.text()).toBe('next');
    expect(asMock(ctx.next)).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('middleware — falls back to the static twin', () => {
  const expectStatic = async (ctx: Ctx) => {
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('Vary')).toBe('Accept');
    const body = await res.text();
    expect(body).toBe(STATIC_TWIN);
    // Non-empty: the fallback is a real logbook snapshot, never the bare
    // front matter (FR3/FR6).
    expect(body).toContain('## Logbook');
    expect(body).toContain('Snapshot taken at build time');
  };

  const apiDown = () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('api down')) as unknown as typeof fetch;
  };

  it('when the API fetch rejects', async () => {
    apiDown();
    const ctx = context('/status/');
    await expectStatic(ctx);
    expect(asMock(ctx.env.ASSETS.fetch)).toHaveBeenCalledWith(
      'https://univerlab.org/status/index.md',
    );
    expect(asMock(ctx.next)).not.toHaveBeenCalled();
  });

  it('when the API fetch rejects under Accept: */*, serves the built twin via next()', async () => {
    // `/status/index.md` with `*/*` is a path-says-markdown request: the live
    // render is attempted, and on failure next() serves the built snapshot
    // twin from dist (non-empty, per build-md).
    apiDown();
    const ctx = context('/status/index.md', '*/*');
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('next');
    expect(asMock(ctx.next)).toHaveBeenCalled();
    expect(asMock(ctx.env.ASSETS.fetch)).not.toHaveBeenCalled();
  });

  it('when the API returns non-OK', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503 } as Response) as unknown as typeof fetch;
    await expectStatic(context('/status/'));
  });

  it('when the API body does not parse', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async (): Promise<unknown> => {
          throw new Error('bad json');
        },
      } as Response) as unknown as typeof fetch;
    await expectStatic(context('/status/'));
  });

  it('serves the static twin at /status/index.md through next()', async () => {
    apiDown();
    const ctx = context('/status/index.md');
    const res = await onRequest(ctx);
    expect(await res.text()).toBe('next');
    expect(asMock(ctx.next)).toHaveBeenCalled();
  });

  it('keeps /es/status/ on its redirect when the API is down', async () => {
    apiDown();
    const ctx = context('/es/status/');
    const res = await onRequest(ctx);
    expect(await res.text()).toBe('next');
    expect(asMock(ctx.env.ASSETS.fetch)).toHaveBeenCalledWith(
      'https://univerlab.org/es/status/index.md',
    );
    expect(asMock(ctx.next)).toHaveBeenCalled();
  });
});

// ------------------------------------------- /roadmap/index.md with */*

describe('middleware — roadmap twin by path', () => {
  it('serves the live roadmap twin to Accept: */* on /roadmap/index.md', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://announcements.univerlab.org/roadmap?limit=100') {
        return {
          ok: true,
          json: async () => ({
            items: [{ id: 'r1', title: 'Ship the live twin', state: 'now', pos: 0, topic: 'general' }],
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
    const ctx = context('/roadmap/index.md', '*/*');

    const res = await onRequest(ctx);

    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    const body = await res.text();
    expect(body).toContain('### Now');
    expect(body).toContain('Ship the live twin');
    expect(body).not.toContain('Logbook');
    expect(asMock(ctx.env.ASSETS.fetch)).not.toHaveBeenCalled();
    expect(asMock(ctx.next)).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------- robots + llms.txt

describe('public/robots.txt', () => {
  const lines = read('public/robots.txt')
    .split('\n')
    .map((l) => l.trim());

  it('carries the Content-Signal line inside the User-agent: * group', () => {
    const star = lines.findIndex((l) => /^user-agent:\s*\*$/i.test(l));
    expect(star).toBeGreaterThanOrEqual(0);

    const nextGroup = lines.findIndex((l, i) => i > star && /^user-agent:/i.test(l));
    const end = nextGroup === -1 ? lines.length : nextGroup;

    const signal = lines.findIndex((l) => l.toLowerCase().startsWith('content-signal:'));
    expect(signal).toBeGreaterThan(star);
    expect(signal).toBeLessThan(end);
    expect(lines[signal]).toBe('Content-Signal: search=yes, ai-input=yes, ai-train=yes');
  });

  it('comments that the line restates the file’s existing stance', () => {
    const signal = lines.findIndex((l) => l.toLowerCase().startsWith('content-signal:'));
    expect(signal).toBeGreaterThan(0);
    const comment = [...lines.slice(0, signal)].reverse().find((l) => l !== '');
    expect(comment).toMatch(/^#/);
    expect(comment).toMatch(/read/i);
    expect(comment).toMatch(/training/i);
  });
});

describe('public/llms.txt', () => {
  const text = read('public/llms.txt');
  const head = text.split('# BEGIN GENERATED')[0];

  it('points at the live twin and the Atom feed from the hand-written head', () => {
    expect(head).toContain('## Live');
    expect(head).toContain('https://univerlab.org/status/index.md');
    expect(head).toContain('https://announcements.univerlab.org/feed.atom');
  });

  it('describes the logbook and the roadmap as their own live twins', () => {
    const live = head.slice(head.indexOf('## Live'));
    expect(live).toMatch(
      /^- Logbook: https:\/\/univerlab\.org\/status\/index\.md — the latest lab entries, rendered live from the announcements API on every request\.$/m,
    );
    expect(live).toMatch(
      /^- Roadmap: https:\/\/univerlab\.org\/roadmap\/index\.md — every roadmap item by lane \(now, next, later, ideas, recently shipped\), rendered live from the announcements API on every request\.$/m,
    );
    // The old "Logbook and roadmap" line, which described /status as both, is gone.
    expect(live).not.toContain('Logbook and roadmap');
  });

  it('writes the live lines as prose, so the docs-line count cannot drift', () => {
    const live = head.slice(head.indexOf('## Live'));
    expect(live).not.toMatch(/^- \[[^\]]*\]\(https:\/\/univerlab\.org\/[^)]*index\.md\): /m);
  });

  it('describes Canopy with the graph-engine tagline, not persistent memory', () => {
    const canopy = text.split('\n').find((l) => l.includes('univerlab.org/canopy/')) ?? '';
    expect(canopy).toContain('EXP-001');
    expect(canopy).toContain('a graph engine for AI coding agents');
    expect(canopy).toContain('every harness, one workflow');
    expect(canopy).not.toContain('persistent memory');
  });

  it('leaves the generated block alone', () => {
    expect(text).toContain('# BEGIN GENERATED by scripts/build-llms.ts — do not edit');
    expect(text.trimEnd().endsWith('# END GENERATED by scripts/build-llms.ts')).toBe(true);
  });
});
