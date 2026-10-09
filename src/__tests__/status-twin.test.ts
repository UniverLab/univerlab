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
import {
  DONE_CAP,
  FEED_URL,
  renderStatusTwin,
  statusTwinRoute,
  type Entry,
  type RoadmapItem,
} from '../../functions/status-twin';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** The static twin an outage falls back to — the built 116-byte front matter. */
const STATIC_TWIN =
  '---\n' +
  'title: "Mission Log — live status of every UniverLab experiment"\n' +
  'source: "https://univerlab.org/status/"\n' +
  '---\n\n';

function item(over: Partial<RoadmapItem> & { id: string; title: string; state: string }): RoadmapItem {
  return { pos: 0, topic: 'general', ...over };
}

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

/** Every `##`/`###` heading in order — lane order is asserted on this. */
const headings = (md: string) => md.match(/^#{2,3} .*$/gm) ?? [];

/** The body after the front matter: first line is the live-data sentence. */
const bodyOf = (md: string) => md.split('---\n')[2].trim().split('\n');

/** How many `- ` bullets a section carries (up to the next `##`). */
const bulletCount = (md: string, heading: string): number => {
  const lines = md.split('\n');
  const start = lines.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  let count = 0;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break;
    if (lines[i].startsWith('- ')) count++;
  }
  return count;
};

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

describe('renderStatusTwin — roadmap lanes', () => {
  const roadmap = [
    item({ id: 'n1', title: 'Now one', state: 'now', pos: 1, blocked_reason: 'waiting on review' }),
    item({ id: 'x1', title: 'Archived one', state: 'now', pos: 0, archived_at: 1758000000000 }),
    item({ id: 'x2', title: 'Archived done', state: 'done', pos: 9, archived_at: 1758000000000, shipped_at: '2026-09-09T00:00:00Z' }),
    item({ id: 'x3', title: 'Archived idea', state: 'idea', pos: 9, archived_at: 1758000000000 }),
    item({ id: 'x4', title: 'Archived later', state: 'later', pos: 9, archived_at: 1758000000000 }),
    item({ id: 'x5', title: 'Archived next', state: 'next', pos: 9, archived_at: 1758000000000 }),
    item({ id: 'x6', title: 'Archived done 2', state: 'done', pos: 10, archived_at: 1758000000000 }),
    item({ id: 'nn', title: 'Next one', state: 'next', pos: 5 }),
    item({ id: 'l1', title: 'Later one', state: 'later', pos: 2 }),
    item({ id: 'i1', title: 'Idea one', state: 'idea', pos: 4 }),
    item({ id: 'd1', title: 'Shipped second', state: 'done', pos: 3, shipped_at: '2026-09-02T00:00:00Z' }),
    item({ id: 'd0', title: 'Shipped first', state: 'done', pos: 2, shipped_at: '2026-09-01T00:00:00Z' }),
  ];
  const md = renderStatusTwin({ lang: 'en', roadmap, entries: [] });

  it('groups the lanes in board order, now → done', () => {
    expect(headings(md)).toEqual([
      '## Roadmap',
      '### Now',
      '### Next',
      '### Later',
      '### Idea',
      '### Done',
      '## Mission Log',
    ]);
  });

  it('drops every archived item, in every lane', () => {
    for (const gone of [
      'Archived one',
      'Archived done',
      'Archived idea',
      'Archived later',
      'Archived next',
      'Archived done 2',
    ]) {
      expect(md).not.toContain(gone);
    }
    expect(md).toContain('Now one');
    expect(md).toContain('Next one');
    expect(md).toContain('Later one');
    expect(md).toContain('Idea one');
  });

  it('prints title, topic and the blocked reason on one line', () => {
    expect(md).toContain('- **Now one** · general — hold: waiting on review');
    expect(md).toContain('- **Later one** · general');
  });

  it('lists done newest-first by shipped_at', () => {
    const done = md.slice(md.indexOf('### Done'), md.indexOf('## Mission Log'));
    expect(done.indexOf('Shipped second')).toBeLessThan(done.indexOf('Shipped first'));
  });

  it('caps done at the 10 most recent shipments, dropping the oldest', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      item({
        id: `d${i}`,
        title: `Shipment ${i}`,
        state: 'done',
        pos: i,
        // One shipment per January day, so the newest is the last built.
        shipped_at: `2026-01-${String(1 + i).padStart(2, '0')}T00:00:00Z`,
        topic: i % 2 ? 'canopy' : 'gitkit',
      }),
    );
    const out = renderStatusTwin({ lang: 'en', roadmap: many, entries: [] });
    expect(DONE_CAP).toBe(10);
    expect(bulletCount(out, '### Done')).toBe(DONE_CAP);
    expect(out).toContain('**Shipment 11**');
    expect(out).toContain('**Shipment 2**');
    expect(out).not.toContain('**Shipment 1**');
    expect(out).not.toContain('**Shipment 0**');
  });

  it('sorts done by date, not by pos, and keeps an item with no date last', () => {
    const rows = [
      item({ id: 'a', title: 'Dated', state: 'done', pos: 0, shipped_at: '2026-05-01T00:00:00Z' }),
      item({ id: 'b', title: 'Undated', state: 'done', pos: 1, shipped_at: null }),
      item({ id: 'c', title: 'Newest', state: 'done', pos: 2, shipped_at: '2026-06-01T00:00:00Z' }),
    ];
    const out = renderStatusTwin({ lang: 'en', roadmap: rows, entries: [] });
    const lines = out.split('\n').filter((l) => l.startsWith('- **'));
    expect(lines.map((l) => l.slice(4, l.indexOf('**', 4)))).toEqual(['Newest', 'Dated', 'Undated']);
  });
});

describe('renderStatusTwin — Spanish', () => {
  const md = renderStatusTwin({
    lang: 'es',
    roadmap: [
      item({ id: 'a', title: 'En curso', state: 'now', pos: 0, blocked_reason: 'en revisión' }),
      item({ id: 'b', title: 'Entregado', state: 'done', pos: 1, shipped_at: '2026-09-01T00:00:00Z' }),
    ],
    entries: [entry({ id: 'e1', title: 'Lanzamiento', topic: 'texforge', link: 'https://example.com/x' })],
  });

  it('takes the lane headings and the hold label from es.roadmap', () => {
    expect(headings(md)).toEqual(['## Roadmap', '### Ahora', '### Hecho', '## Mission Log']);
    expect(md).toContain('— en espera: en revisión');
  });

  it('keeps the entry content exactly as the API returned it', () => {
    expect(md).toContain(
      '- **2026-10-06** · launch · texforge — **Lanzamiento**: First paragraph. [link](https://example.com/x)',
    );
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
      roadmap: [],
      entries: [entry({ id: 'e2', title: 'No link here', link: null, type: 'note', topic: null })],
    });
    expect(md.split('\n')).toContain(
      '- **2026-10-06** · note · general — **No link here**: First paragraph.',
    );
    expect(md).not.toContain('[link](');
  });

  it('takes only the first paragraph of the body', () => {
    const md = renderStatusTwin({ lang: 'en', roadmap: [], entries: [entry({ id: 'e3', title: 'T' })] });
    expect(md).toContain('First paragraph.');
    expect(md).not.toContain('Second paragraph');
  });

  it('flattens a body whose first paragraph spans lines', () => {
    const md = renderStatusTwin({
      lang: 'en',
      roadmap: [],
      entries: [entry({ id: 'e4', title: 'T', body: 'one\n  two\n\nrest' })],
    });
    expect(md).toContain(': one two');
    expect(md).not.toContain('rest');
  });

  it('starts the body with the live-data sentence and the feed URL', () => {
    const sentence = bodyOf(renderStatusTwin({ lang: 'en', roadmap: [], entries: [] }))[0];
    expect(sentence).toMatch(/^This page is rendered live /);
    expect(sentence).toContain(FEED_URL);
    expect(sentence.endsWith('.')).toBe(true);
  });

  it('keeps the twin front-matter shape', () => {
    const md = renderStatusTwin({ lang: 'en', roadmap: [], entries: [] });
    expect(md).toMatch(/^---\ntitle: "[^"]+"\nsource: "https:\/\/univerlab\.org\/status\/"\n---\n/);
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

/** The two public payloads, dispatched the way the middleware calls them. */
function apiMock(): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://announcements.univerlab.org/roadmap?limit=100') {
      return {
        ok: true,
        json: async () => ({
          items: [
            item({ id: 'r1', title: 'Ship the live twin', state: 'now', pos: 0 }),
            item({
              id: 'r2',
              title: 'Shipped the feed',
              state: 'done',
              pos: 1,
              shipped_at: '2026-10-01T00:00:00Z',
            }),
          ],
        }),
      } as Response;
    }
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
    expect(body).toContain('## Roadmap');
    expect(body).toContain('### Now');
    expect(body).toContain('Ship the live twin');
    expect(body).toContain('## Mission Log');
    expect(body).toContain('The live twin ships');
    expect(body).toContain(FEED_URL);
    expect(asMock(ctx.env.ASSETS.fetch)).not.toHaveBeenCalled();
    expect(asMock(ctx.next)).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks the API read-only, edge-cached for 300 s, behind a signal', async () => {
    const fetchMock = apiMock();
    global.fetch = fetchMock as unknown as typeof fetch;
    await onRequest(context('/status/'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    expect(body).toContain('### Ahora');
    expect(body).toContain('## Mission Log');
    expect(body).toContain('The live twin ships');
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
    expect(await res.text()).toBe(STATIC_TWIN);
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

  it('writes the live lines as prose, so the docs-line count cannot drift', () => {
    const live = head.slice(head.indexOf('## Live'));
    expect(live).toMatch(/^- Mission Log and roadmap: https:\/\/univerlab\.org\/status\/index\.md /m);
    expect(live).toMatch(/^- Atom feed: https:\/\/announcements\.univerlab\.org\/feed\.atom /m);
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
