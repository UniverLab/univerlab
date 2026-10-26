/**
 * The two agent-facing JSON endpoints, called as the build calls them:
 * /about-univerlab.json carries the build-time about text (falling back to
 * the canonical origin when the site config omits one), and the
 * /.well-known/mcp server card is the same body the function route serves.
 */
import * as about from '../pages/about-univerlab.json';
import * as card from '../pages/.well-known/mcp/server-card.json';
import { serverCardJson } from '../lib/mcp-server-card';
import { buildSiteAbout } from '../lib/site-about';

// jsdom ships no fetch globals; the endpoints construct a Response the way
// Astro's build does. Shim the minimum the handlers and assertions touch.
class MiniResponse {
  private body: string;
  headers: Map<string, string>;
  constructor(body: string, init?: { headers?: Record<string, string> }) {
    this.body = body;
    this.headers = new Map(Object.entries(init?.headers ?? {}));
  }
  async json() {
    return JSON.parse(this.body);
  }
}
if (typeof (globalThis as any).Response === 'undefined') {
  (globalThis as any).Response = MiniResponse;
}

const GET = (mod: any) => mod.GET as (ctx: any) => MiniResponse;

describe('/about-univerlab.json', () => {
  it('prerenders and answers with the about text', async () => {
    expect(about.prerender).toBe(true);
    const res = await GET(about)({ site: new URL('https://univerlab.org') });
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const body = await res.json();
    expect(typeof body.about).toBe('string');
    expect(body.about).toContain('UniverLab');
  });
  it('falls back to the canonical origin without a site', async () => {
    const res = await GET(about)({ site: undefined });
    const body = await res.json();
    expect(body.about.length).toBeGreaterThan(0);
  });
});

describe('/.well-known/mcp/server-card.json', () => {
  it('serves the same card the function route builds', async () => {
    expect(card.prerender).toBe(true);
    const res = await GET(card)({});
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.stringify(await res.json())).toBe(JSON.stringify(JSON.parse(serverCardJson())));
  });
});

describe('buildSiteAbout', () => {
  it('composes the about text from the shipped sources', () => {
    const text = buildSiteAbout(new URL('https://univerlab.org'));
    expect(text).toContain('UniverLab');
    for (const name of ['Canopy', 'TeXForge']) expect(text).toContain(name);
  });
});
