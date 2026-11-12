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
 *  middleware asks it to write into #edition. */
class FakeHTMLRewriter {
  static last: FakeHTMLRewriter | null = null;
  selector = '';
  inner = '';
  constructor() {
    FakeHTMLRewriter.last = this;
  }
  on(selector: string, handler: { element: (el: { setInnerContent: (c: string) => void }) => void }) {
    this.selector = selector;
    handler.element({ setInnerContent: (c: string) => { this.inner = c; } });
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
    expect(FakeHTMLRewriter.last?.inner).toContain('class="dateline"');
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
    expect(FakeHTMLRewriter.last?.selector).toBe('#edition');
    const inner = FakeHTMLRewriter.last?.inner || '';
    // The edition itself: dateline, columns, and the same count the pool has.
    const facts = buildPool(FIX, 'en');
    expect(inner).toContain('class="dateline"');
    expect(inner.match(/class="item/g) ?? []).toHaveLength(
      facts.length - 1 - todayAside(facts, todayLead(facts, editionDate())).length,
    );
    expect(inner).toContain('<h3>Births</h3>');

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
    expect(calls.filter((c) => c.url.includes('announcements'))).toHaveLength(1);
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
    expect(FakeHTMLRewriter.last?.inner).toContain('2024');
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
