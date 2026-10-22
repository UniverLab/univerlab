/**
 * @jest-environment node
 */
import { onRequest } from '../../functions/_middleware';

const STATIC_PAGE = '<html><body><div id="roadmap-lanes"><p>old</p></div></body></html>';
const STATIC_TWIN = '---\ntitle: "Roadmap — what UniverLab is building now, next and later"\nsource: "https://univerlab.org/roadmap/"\n---\n';

class FakeEl {
  inner = '';
  setInnerContent(html: string, opts?: any) { this.inner = html; }
}
class FakeRewriter {
  handler: any;
  on(sel: string, h: any) { this.handler = h; return this; }
  transform(res: Response) {
    // apply handler to a fake element and rebuild body
    const el = new FakeEl();
    if (this.handler && this.handler.element) this.handler.element(el);
    const body = STATIC_PAGE.replace(/<div id="roadmap-lanes">[\s\S]*?<\/div>/, `<div id="roadmap-lanes">${el.inner}</div>`);
    return new Response(body, { status: res.status, headers: res.headers });
  }
}

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; (global as any).HTMLRewriter = undefined; });

function context(pathname: string, accept = 'text/html') {
  return {
    request: new Request(`https://univerlab.org${pathname}`, { headers: { Accept: accept } }),
    env: {
      ASSETS: {
        fetch: jest.fn(async (input: any) => {
          const path = new URL(String(input)).pathname;
          if (path === '/roadmap/index.md') return new Response(STATIC_TWIN, { status: 200 });
          return new Response(STATIC_PAGE, { status: 200 });
        }),
      },
    },
    next: jest.fn(async () => new Response(STATIC_PAGE, { status: 200, headers: { 'Content-Type': 'text/html' } })),
  };
}

describe('roadmap live lanes (html)', () => {
  it('replaces lanes when API ok', async () => {
    (global as any).HTMLRewriter = FakeRewriter;
    global.fetch = jest.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('/roadmap')) {
        return { ok: true, json: async () => ({ items: [{ id: 'r1', title: 'Ship', state: 'now', pos: 0, topic: 'general' }] }) } as any;
      }
      throw new Error('unexpected');
    }) as any;
    const ctx: any = context('/roadmap/');
    const res = await onRequest(ctx);
    const text = await res.text();
    expect(text).toContain('Ship');
    expect(text).toContain('rm-card');
  });

  it('returns static page when fetch rejects', async () => {
    (global as any).HTMLRewriter = FakeRewriter;
    global.fetch = jest.fn().mockRejectedValue(new Error('down')) as any;
    const ctx: any = context('/roadmap/');
    const res = await onRequest(ctx);
    const text = await res.text();
    expect(text).toBe(STATIC_PAGE);
  });
});

describe('roadmap live twin (markdown)', () => {
  it('renders markdown from API', async () => {
    global.fetch = jest.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('/roadmap')) {
        return { ok: true, json: async () => ({ items: [{ id: 'r1', title: 'Ship', state: 'now', pos: 0, topic: 'general' }] }) } as any;
      }
      throw new Error('unexpected');
    }) as any;
    const ctx: any = context('/roadmap/', 'text/markdown');
    const res = await onRequest(ctx);
    const text = await res.text();
    expect(text).toContain('Ship');
  });
});