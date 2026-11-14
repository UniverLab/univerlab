/**
 * The newspaper at the edge: a failing feed fetch serves the static page.
 *
 * @jest-environment node
 *
 * Node rather than jsdom because the middleware is exercised end to end and
 * needs `Request` / `Response`, which jsdom does not ship.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { onRequest } from '../../functions/_middleware';
import { editionDate, todayAside, todayLead } from '../lib/today-edition';
import { buildPool } from '../lib/science-filter';

const FIX = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/onthisday-1021.json'), 'utf8'),
);

const STATIC_PAGE =
  '<html><body><div class="paper"><div id="edition"></div>' +
  '<div id="today-loading">skeletons</div></div></body></html>';

/** workerd's HTMLRewriter is not in Node: this stub records what the
 *  middleware asks it to write into #edition and #lab-body. */
class FakeHTMLRewriter {
  static last: FakeHTMLRewriter | null = null;
  selector = '';
  inner = '';
  writes: Record<string, string> = {};
  constructor() {
    FakeHTMLRewriter.last = this;
  }
  on(selector: string, handler: { element: (el: { setInnerContent: (c: string) => void }) => void }) {
    this.selector = selector;
    handler.element({ setInnerContent: (c: string) => { this.inner = c; this.writes[selector] = c; } });
    return this;
  }
  transform(res: Response) {
    return res;
  }
}

interface Ctx {
  request: Request;
  env: { ASSETS: { fetch: (input: string | Request) => Promise<Response> } };
  next: () => Promise<Response>;
}

function context(pathname: string, accept: string): Ctx {
  return {
    request: new Request(`https://univerlab.org${pathname}`, { headers: { Accept: accept } }),
    env: {
      ASSETS: {
        fetch: jest.fn(async () => new Response('not found', { status: 404 })),
      },
    },
    next: jest.fn(async () => new Response(STATIC_PAGE, { status: 200 })),
  };
}

const asMock = (fn: unknown) => fn as jest.Mock;
const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  delete (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter;
  FakeHTMLRewriter.last = null;
});

describe('middleware — /newspaper/ HTML', () => {
  it('serves the static page untouched when the feed fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('otd down')) as unknown as typeof fetch;
    const ctx = context('/newspaper/', 'text/html');

    const res = await onRequest(ctx);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe(STATIC_PAGE);
    expect(body).not.toContain('class="item');
    expect(asMock(ctx.next)).toHaveBeenCalled();
  });

  it('serves the static page untouched when the feed is non-OK', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503 } as Response) as unknown as typeof fetch;
    const ctx = context('/es/newspaper/', 'text/html');

    const res = await onRequest(ctx);

    expect(await res.text()).toBe(STATIC_PAGE);
    expect(asMock(ctx.next)).toHaveBeenCalled();
  });

  it('reads the lab and the encyclopedia at the same time', async () => {
    // The two reads share one 3 s deadline: if the lab read only started after
    // the encyclopedia answered, a slow Wikipedia would spend the whole budget.
    let labRead = false;
    global.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('wikipedia.org')) {
        await new Promise((r) => setTimeout(r, 50));
        if (!labRead) throw new Error('the lab read waited for the encyclopedia');
        return new Response(JSON.stringify(FIX), { status: 200 });
      }
      labRead = true;
      return new Response(JSON.stringify({ entries: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;

    await onRequest(context('/newspaper/', 'text/html'));

    expect(labRead).toBe(true);
    expect(FakeHTMLRewriter.last?.writes['#edition']).toContain('class="dateline"');
  });

  it('fills #edition with the day’s edition, dated and UA-tagged', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('wikipedia.org')) {
        return new Response(JSON.stringify(FIX), { status: 200 });
      }
      return new Response(JSON.stringify({ entries: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;

    const res = await onRequest(context('/newspaper/', 'text/html'));

    expect(res.status).toBe(200);
    expect(FakeHTMLRewriter.last?.selector).toBe('#lab2-body');
    expect(FakeHTMLRewriter.last?.writes['#lab-body']).toContain('lab-heading');
    const inner = FakeHTMLRewriter.last?.writes['#edition'] || '';
    // The edition itself: dateline, columns, and the same count the pool has.
    const facts = buildPool(FIX, 'en');
    expect(inner).toContain('class="dateline"');
    expect(inner.match(/class="item/g) ?? []).toHaveLength(
      facts.length - 1 - todayAside(facts, todayLead(facts, editionDate())).length,
    );
    expect(inner).toContain('<h3>Births</h3>');
    // Page 2 reads from the same fetch: the logbook heading is set too.
    expect(FakeHTMLRewriter.last?.writes['#lab-body']).toContain('lab-heading');

    // One read per source, the Wikipedia one carrying the project's UA and an
    // hour of edge cache, the date coming from the edition day (UTC−5).
    const wp = calls.find((c) => c.url.includes('wikipedia.org'))!;
    const d = editionDate();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    expect(wp.url).toBe(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`);
    const headers = wp.init?.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('UniverLab/1.0 (https://univerlab.org)');
    expect((wp.init as { cf?: { cacheTtl: number } }).cf?.cacheTtl).toBe(3600);
    // Two reads from the announcements API: the logbook mirror and the
    // live founding count for page 2's coupons.
    const apiCalls = calls.filter((c) => c.url.includes('announcements'));
    expect(apiCalls.map((c) => c.url).sort()).toEqual([
      'https://announcements.univerlab.org/?limit=100',
      'https://announcements.univerlab.org/founding-spots',
    ]);
  });
});

describe('middleware — page 2 when the lab feed cannot be read', () => {
  const stubFetchLabDown = jest.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('wikipedia.org')) {
      return new Response(JSON.stringify(FIX), { status: 200 });
    }
    throw new Error('announcements down');
  }) as unknown as typeof fetch;

  it('fills #lab-body with the one unavailable line, never empty filter rows', async () => {
    global.fetch = stubFetchLabDown;
    (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;

    const res = await onRequest(context('/newspaper/', 'text/html'));

    expect(res.status).toBe(200);
    const lab = FakeHTMLRewriter.last?.writes['#lab-body'] || '';
    expect(lab).toContain('lab-empty');
    expect(lab).toContain('The lab mail did not arrive');
    expect(lab).not.toContain('lab-filter');
    expect(lab).not.toContain('lab-log');
    // Page 1 still prints the day's letters from the encyclopedia read.
    expect(FakeHTMLRewriter.last?.writes['#edition']).toContain('class="dateline"');
  });

  it('the markdown twin carries the unavailable line', async () => {
    global.fetch = stubFetchLabDown;

    const res = await onRequest(context('/newspaper/index.md', 'text/markdown'));

    expect(res.status).toBe(200);
    const md = await res.text();
    expect(md).toContain('## Lab news');
    expect(md).toContain('The lab mail did not arrive');
  });
});

describe('middleware — the classifieds third page', () => {
  const stubFetchLab = (entries: unknown[]) =>
    jest.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('wikipedia.org')) {
        return new Response(JSON.stringify(FIX), { status: 200 });
      }
      if (url.includes('founding-spots')) {
        return new Response(JSON.stringify({ left: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ entries }), { status: 200 });
    }) as unknown as typeof fetch;

  const twenty = Array.from({ length: 20 }, (_, i) => ({
    id: `m${i}`,
    date: `2026-09-${String(28 - i).padStart(2, '0')}T10:00:00.000Z`,
    title: `Item ${i}`,
    body: 'Body.',
    type: i < 2 ? 'launch' : 'note',
    topic: 'canopy',
    link: null,
  }));

  it('fills #lab2-body with the second classifieds page', async () => {
    global.fetch = stubFetchLab(twenty);
    (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;

    const res = await onRequest(context('/newspaper/', 'text/html'));

    expect(res.status).toBe(200);
    const page2 = FakeHTMLRewriter.last?.writes['#lab2-body'] || '';
    expect(page2).toContain('id="lab-log2"');
    expect(page2).toContain('Lab news · continued');
    expect(FakeHTMLRewriter.last?.writes['#lab-body']).toContain('id="lab-log"');
  });

  it('leaves #lab2-body empty when everything fits one page', async () => {
    global.fetch = stubFetchLab(twenty.slice(0, 3));
    (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;

    await onRequest(context('/es/newspaper/', 'text/html'));

    expect(FakeHTMLRewriter.last?.writes['#lab2-body']).toBe('');
    expect(FakeHTMLRewriter.last?.writes['#lab-body']).toContain('id="lab-log"');
  });
});

describe('middleware — the Logbook page', () => {
  const two = [
    {
      id: 'l1', date: '2026-10-06T01:09:26.735Z', title: 'Newest', body: 'First.',
      type: 'launch', topic: 'canopy', link: null,
    },
    {
      id: 'l2', date: '2026-10-05T10:00:00.000Z', title: 'Second', body: 'Second body.',
      type: 'note', topic: 'texforge', link: 'https://example.com/o',
    },
  ];
  const stubFetchLogbook = jest.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('announcements.univerlab.org/?limit=')) {
      return new Response(JSON.stringify({ entries: two }), { status: 200 });
    }
    return new Response(JSON.stringify({ left: null }), { status: 200 });
  }) as unknown as typeof fetch;

  it('fills #logbook-body with the complete record in full', async () => {
    global.fetch = stubFetchLogbook;
    (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;

    const res = await onRequest(context('/logbook/', 'text/html'));

    expect(res.status).toBe(200);
    const body = FakeHTMLRewriter.last?.writes['#logbook-body'] || '';
    expect(body).toContain('<h2 class="lab-heading">Logbook</h2>');
    expect(body).toContain('id="logbook-list"');
    // Newest first, every entry in full with its meta line.
    expect(body.indexOf('>Newest<')).toBeLessThan(body.indexOf('>Second<'));
    expect(body.match(/<p class="entry-meta">.*?<\/p>/g)).toHaveLength(2);
  });

  it('fills the Spanish Logbook under its own heading', async () => {
    global.fetch = stubFetchLogbook;
    (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;

    await onRequest(context('/es/logbook/', 'text/html'));

    expect(FakeHTMLRewriter.last?.writes['#logbook-body']).toContain(
      '<h2 class="lab-heading">Cuaderno de bitácora</h2>',
    );
  });

  it('says the Logbook did not arrive instead of empty filter rows', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('announcements down');
    }) as unknown as typeof fetch;
    (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;

    const res = await onRequest(context('/logbook/', 'text/html'));

    expect(res.status).toBe(200);
    const body = FakeHTMLRewriter.last?.writes['#logbook-body'] || '';
    expect(body).toContain('lab-empty');
    expect(body).toContain('The Logbook did not arrive');
    expect(body).not.toContain('lab-filter');
  });

  it('serves the Logbook markdown twin under its own heading', async () => {
    global.fetch = stubFetchLogbook;

    const res = await onRequest(context('/logbook/index.md', 'text/markdown'));

    expect(res.status).toBe(200);
    const md = await res.text();
    expect(md.split('\n')[0]).toBe('## Logbook');
    expect(md).toContain('**Newest**');
  });
});

describe('middleware — legacy /today/ addresses redirect permanently', () => {
  it.each([['/today', '/newspaper/'], ['/today/', '/newspaper/'], ['/es/today', '/es/newspaper/'], ['/es/today/', '/es/newspaper/']])(
    '%s 301s to %s',
    async (from, to) => {
      const ctx = context(from, 'text/html');

      const res = await onRequest(ctx);

      expect(res.status).toBe(301);
      expect(res.headers.get('Location')).toBe(`https://univerlab.org${to}`);
      expect(asMock(ctx.next)).not.toHaveBeenCalled();
    },
  );

  it('keeps the edition parameter across the redirect', async () => {
    const res = await onRequest(context('/today/?d=2024-07-20', 'text/html'));

    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://univerlab.org/newspaper/?d=2024-07-20');
  });
});

describe('middleware — retired /status/ addresses redirect permanently', () => {
  it.each([
    ['/status', 'https://univerlab.org/newspaper/#lab'],
    ['/status/', 'https://univerlab.org/newspaper/#lab'],
    ['/es/status', 'https://univerlab.org/es/newspaper/#lab'],
    ['/es/status/', 'https://univerlab.org/es/newspaper/#lab'],
    ['/status/index.md', 'https://univerlab.org/newspaper/index.md'],
    ['/es/status/index.md', 'https://univerlab.org/es/newspaper/index.md'],
  ])('%s 301s to %s', async (from, to) => {
    const ctx = context(from, 'text/html');

    const res = await onRequest(ctx);

    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe(to);
    expect(asMock(ctx.next)).not.toHaveBeenCalled();
  });

  it('keeps the query string across the redirect', async () => {
    const res = await onRequest(context('/status/?topic=canopy', 'text/html'));

    expect(res.status).toBe(301);
    // The query string stays a query: it must precede the #lab fragment or
    // the deep-link filters (?topic=, ?roadmap=) would land inside the hash.
    expect(res.headers.get('Location')).toBe('https://univerlab.org/newspaper/?topic=canopy#lab');
  });

  it('the markdown twin carries both pages', async () => {
    global.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('wikipedia.org')) {
        return new Response(JSON.stringify(FIX), { status: 200 });
      }
      return new Response(JSON.stringify({ entries: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const res = await onRequest(context('/newspaper/index.md', 'text/markdown'));

    expect(res.status).toBe(200);
    const md = await res.text();
    expect(md).toContain('# The Observable');
    expect(md).toContain('## Lab news');
  });
});

describe('middleware — /newspaper/ picked day (?d=)', () => {
  const stubFetch = (calls: string[]) =>
    jest.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('wikipedia.org')) {
        return new Response(JSON.stringify(FIX), { status: 200 });
      }
      return new Response(JSON.stringify({ entries: [] }), { status: 200 });
    }) as unknown as typeof fetch;

  it('the edge prints the picked day', async () => {
    const calls: string[] = [];
    global.fetch = stubFetch(calls);
    (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;

    const res = await onRequest(context('/newspaper/?d=2024-07-20', 'text/html'));

    expect(res.status).toBe(200);
    const wp = calls.find((u) => u.includes('wikipedia.org'))!;
    expect(wp.endsWith('/onthisday/all/07/20')).toBe(true);
    expect(FakeHTMLRewriter.last?.writes['#edition']).toContain('2024');
  });

  it('the markdown twin honours the picked day', async () => {
    const calls: string[] = [];
    global.fetch = stubFetch(calls);

    const res = await onRequest(context('/newspaper/index.md?d=2024-07-20', 'text/markdown'));

    expect(res.status).toBe(200);
    const wp = calls.find((u) => u.includes('wikipedia.org'))!;
    expect(wp.endsWith('/onthisday/all/07/20')).toBe(true);
    expect(await res.text()).toContain('2024');
  });
});
