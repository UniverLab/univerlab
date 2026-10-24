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
import { editionDate } from '../lib/today-edition';
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

describe('middleware — /today/ HTML', () => {
  it('serves the static page untouched when the feed fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('otd down')) as unknown as typeof fetch;
    const ctx = context('/today/', 'text/html');

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
    const ctx = context('/es/today/', 'text/html');

    const res = await onRequest(ctx);

    expect(await res.text()).toBe(STATIC_PAGE);
    expect(asMock(ctx.next)).toHaveBeenCalled();
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

    const res = await onRequest(context('/today/', 'text/html'));

    expect(res.status).toBe(200);
    expect(FakeHTMLRewriter.last?.selector).toBe('#edition');
    const inner = FakeHTMLRewriter.last?.inner || '';
    // The edition itself: dateline, columns, and the same count the pool has.
    const facts = buildPool(FIX, 'en');
    expect(inner).toContain('class="dateline"');
    expect(inner.match(/class="item/g) ?? []).toHaveLength(facts.length - 1);
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
