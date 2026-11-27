/**
 * The control-room analytics endpoint and panel: owner-only aggregates over
 * `univerlab_funnel` and `univerlab_installs`, an explicit unconfigured
 * state instead of zeros, window allowlisting, edge caching, and a panel
 * that renders the notice — never zero-filled rows.
 */

import {
  buildFunnelQuery,
  buildInstallsQuery,
  coarseClientClass,
  handleAdminAnalytics,
  parseAnalyticsWindow,
  type AnalyticsDeps,
  type AnalyticsEnv,
} from '../lib/admin/analytics';
import {
  renderAnalytics,
  setInstallsFilter,
  statusFor,
  type AdminAnalyticsStrings,
} from '../lib/admin/panel-client';

const OWNER = 'owner@univerlab.org';

// The jsdom sandbox ships no Request or Response, and the analytics handler
// only needs headers, a JSON body and a status — the same stand-ins as the
// admin panel-actions suite, plus `url` and `clone` for the cache key.
class StubHeaders {
  private readonly map: Map<string, string>;
  constructor(init?: Record<string, string>) {
    this.map = new Map(Object.entries(init ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  }
  get(name: string): string | null {
    return this.map.get(name.toLowerCase()) ?? null;
  }
}

class StubRequest {
  readonly headers: StubHeaders;
  readonly url: string;
  private readonly bodyText: string;
  constructor(url: string, init?: { headers?: Record<string, string>; method?: string; body?: string }) {
    void init?.method;
    this.url = String(url);
    this.headers = new StubHeaders(init?.headers);
    this.bodyText = init?.body ?? '';
  }
  async json(): Promise<unknown> {
    return JSON.parse(this.bodyText) as unknown;
  }
  async text(): Promise<string> {
    return this.bodyText;
  }
}

class StubResponse {
  readonly status: number;
  readonly ok: boolean;
  private readonly payload: string;
  constructor(body: string | null, init?: { status?: number }) {
    this.payload = body ?? '';
    this.status = init?.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
  }
  async json(): Promise<unknown> {
    return JSON.parse(this.payload) as unknown;
  }
  async text(): Promise<string> {
    return this.payload;
  }
  clone(): StubResponse {
    return new StubResponse(this.payload, { status: this.status });
  }
}

(globalThis as Record<string, unknown>)['Request'] = StubRequest;
(globalThis as Record<string, unknown>)['Response'] = StubResponse;

const verify = async (token: string): Promise<string | null> => {
  if (token === 'owner-jwt') return OWNER;
  if (token === 'stranger-jwt') return 'stranger@example.com';
  return null;
};

const deps: AnalyticsDeps = { verify };

function envOf(extra: Partial<AnalyticsEnv> = {}): AnalyticsEnv {
  return { SIGN_OWNER_EMAILS: OWNER, ...extra };
}

function get(url: string, token: string | null): Request {
  const headers: Record<string, string> = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  return new Request(`https://univerlab.org${url}`, { headers });
}

function creds(): Partial<AnalyticsEnv> {
  return { CF_ACCOUNT_ID: 'acct123', CF_ANALYTICS_TOKEN: 'tok123' };
}

function sqlFetch(dataByMarker: Record<string, unknown[]>, seen: string[]) {
  return (async (_input: unknown, init?: { body?: unknown }) => {
    const body = String(init?.body ?? '');
    seen.push(body);
    const marker = body.includes('univerlab_funnel') ? 'funnel' : 'installs';
    return new Response(JSON.stringify({ data: dataByMarker[marker] ?? [] }), { status: 200 });
  }) as unknown as typeof fetch;
}

function cacheStub() {
  const store = new Map<string, Response>();
  let puts = 0;
  return {
    puts: () => puts,
    cache: {
      async match(request: Request): Promise<Response | undefined> {
        return store.get(request.url);
      },
      async put(request: Request, response: Response): Promise<void> {
        puts += 1;
        store.set(request.url, response);
      },
    },
  };
}

describe('admin analytics auth', () => {
  it('answers 401 without a token and 403 to a non-owner', async () => {
    const noToken = await handleAdminAnalytics(get('/api/admin-analytics', null), envOf(creds()), deps);
    expect(noToken.status).toBe(401);
    const stranger = await handleAdminAnalytics(
      get('/api/admin-analytics', 'stranger-jwt'),
      envOf(creds()),
      deps,
    );
    expect(stranger.status).toBe(403);
  });
});

describe('admin analytics unconfigured', () => {
  it('answers an explicit unconfigured state without touching the SQL API', async () => {
    let called = 0;
    const counting = (async () => {
      called += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const res = await handleAdminAnalytics(get('/api/admin-analytics', 'owner-jwt'), envOf(), {
      ...deps,
      fetchImpl: counting,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['ok']).toBe(false);
    expect(body['state']).toBe('unconfigured');
    expect(called).toBe(0);
  });
});

describe('admin analytics queries', () => {
  it('build read-only aggregates with SUM, INTERVAL and GROUP BY', () => {
    for (const days of [7, 30, 90] as const) {
      const funnel = buildFunnelQuery(days);
      expect(funnel).toContain('SUM(_sample_interval)');
      expect(funnel).toContain(`INTERVAL '${days}' DAY`);
      expect(funnel).toContain('GROUP BY');
      expect(funnel).toContain('univerlab_funnel');
      expect(funnel).not.toMatch(/INSERT|UPDATE|DELETE/i);
      const installs = buildInstallsQuery(days);
      expect(installs).toContain('SUM(_sample_interval)');
      expect(installs).toContain(`INTERVAL '${days}' DAY`);
      expect(installs).toContain('GROUP BY');
      expect(installs).toContain('univerlab_installs');
    }
  });

  it('falls back to the 30-day window for a bad window value', async () => {
    const seen: string[] = [];
    const res = await handleAdminAnalytics(get('/api/admin-analytics?window=banana', 'owner-jwt'), envOf(creds()), {
      ...deps,
      fetchImpl: sqlFetch({ funnel: [], installs: [] }, seen),
    });
    expect(res.status).toBe(200);
    expect(parseAnalyticsWindow('banana')).toBe(30);
    expect(seen.length).toBe(2);
    for (const body of seen) expect(body).toContain("INTERVAL '30' DAY");
  });

  it('returns funnel and installs rows without zero-filling', async () => {
    const funnel = [{ event: 'landing', utm_source: 'gh', utm_medium: 'readme', utm_campaign: 'launch', count: 12 }];
    const installs = [
      { tool: 'canopy', client_class: 'curl', outcome: 'redirect', count: 5 },
      { tool: 'canopy', client_class: 'browser', outcome: 'redirect', count: 2 },
    ];
    const res = await handleAdminAnalytics(get('/api/admin-analytics?window=7', 'owner-jwt'), envOf(creds()), {
      ...deps,
      fetchImpl: sqlFetch({ funnel, installs }, []),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(body['window']).toBe(7);
    expect(body['funnel']).toEqual([
      {
        event: 'landing',
        tool: '',
        path: '',
        utm_source: 'gh',
        utm_medium: 'readme',
        utm_campaign: 'launch',
        count: 12,
      },
    ]);
    expect(body['installs']).toEqual([
      { tool: 'canopy', clientClass: 'curl', outcome: 'redirect', count: 5 },
      { tool: 'canopy', clientClass: 'browser', outcome: 'redirect', count: 2 },
    ]);
  });

  it('serves a cache hit without calling the SQL API', async () => {
    const { cache, puts } = cacheStub();
    const cached = new Response(JSON.stringify({ ok: true, window: 30, funnel: [], installs: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
    await cache.put(new Request('https://admin-analytics.local/api/admin-analytics?window=30'), cached);
    const before = puts();
    let called = 0;
    const counting = (async () => {
      called += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const res = await handleAdminAnalytics(get('/api/admin-analytics?window=30', 'owner-jwt'), envOf(creds()), {
      ...deps,
      fetchImpl: counting,
      cache,
    });
    expect(res.status).toBe(200);
    expect(called).toBe(0);
    expect(puts()).toBe(before);
  });

  it('caches a live answer for later refreshes', async () => {
    const { cache, puts } = cacheStub();
    const res = await handleAdminAnalytics(get('/api/admin-analytics?window=90', 'owner-jwt'), envOf(creds()), {
      ...deps,
      fetchImpl: sqlFetch({ funnel: [], installs: [] }, []),
      cache,
    });
    expect(res.status).toBe(200);
    expect(puts()).toBe(1);
  });

  it('answers 502 unavailable when the SQL API fails', async () => {
    const failing = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const res = await handleAdminAnalytics(get('/api/admin-analytics?window=30', 'owner-jwt'), envOf(creds()), {
      ...deps,
      fetchImpl: failing,
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['ok']).toBe(false);
    expect(body['error']).toBe('unavailable');
  });
});

describe('coarse client class', () => {
  it('groups installer CLIs apart from browsers', () => {
    expect(coarseClientClass('curl')).toBe('installer');
    expect(coarseClientClass('wget')).toBe('installer');
    expect(coarseClientClass('powershell')).toBe('installer');
    expect(coarseClientClass('browser')).toBe('browser');
    expect(coarseClientClass('other')).toBe('other');
    expect(coarseClientClass('')).toBe('other');
  });
});

function analyticsStrings(): AdminAnalyticsStrings & { loadError: string } {
  return {
    loadError: 'load error',
    analyticsUnconfigured: 'not configured',
    analyticsEmpty: 'empty window',
    analyticsSummary: '{funnel} funnel · {installs} installs',
    analyticsFunnelTitle: 'Funnel',
    analyticsInstallsTitle: 'Installs',
    thEvent: 'Event',
    thSource: 'Source',
    thMedium: 'Medium',
    thCampaign: 'Campaign',
    thTool: 'Tool',
    thClient: 'Client',
    thCount: 'Count',
    thPage: 'Page',
    thStatus: 'Status',
    analyticsFilterReal: 'Real tools',
    analyticsFilterProbes: '404 / probes',
    analyticsFilterAll: 'All',
    analyticsClientInstaller: 'installer',
    analyticsClientBrowser: 'browser',
    analyticsClientOther: 'other',
  };
}

function mountAnalytics(): void {
  document.body.innerHTML =
    '<section id="admin-analytics">' +
    '<p id="admin-analytics-notice" hidden></p>' +
    '<table id="admin-analytics-funnel-table" hidden><tbody id="admin-analytics-funnel"></tbody></table>' +
    '<p><button type="button" data-installs-filter="real" aria-current="true">Real tools</button>' +
    '<button type="button" data-installs-filter="probes">404 / probes</button>' +
    '<button type="button" data-installs-filter="all">All</button></p>' +
    '<table id="admin-analytics-installs-table" hidden><tbody id="admin-analytics-installs"></tbody></table>' +
    '</section><p id="admin-analytics-counts"></p>';
}

describe('admin analytics panel', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('renders the unconfigured notice instead of zeros', async () => {
    setInstallsFilter('real');
    mountAnalytics();
    global.fetch = (async () =>
      new Response(JSON.stringify({ ok: false, state: 'unconfigured', window: 30 }), { status: 200 })) as unknown as typeof fetch;
    await renderAnalytics(analyticsStrings(), 30);
    const notice = document.getElementById('admin-analytics-notice') as HTMLElement;
    expect(notice.textContent).toBe('not configured');
    expect(notice.hidden).toBe(false);
    expect(document.getElementById('admin-analytics-funnel')?.textContent).toBe('');
    expect(document.getElementById('admin-analytics-installs')?.textContent).toBe('');
    expect(document.getElementById('admin-analytics-counts')?.textContent ?? '').not.toContain('0');
  });

  it('groups installer CLIs under the installer label', async () => {
    setInstallsFilter('real');
    mountAnalytics();
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          window: 30,
          funnel: [{ event: 'landing', utm_source: 'gh', utm_medium: '', utm_campaign: '', count: 4 }],
          installs: [
            { tool: 'canopy', clientClass: 'curl', outcome: 'redirect', count: 5 },
            { tool: 'canopy', clientClass: 'powershell', outcome: 'redirect', count: 3 },
            { tool: 'canopy', clientClass: 'browser', outcome: 'redirect', count: 2 },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    await renderAnalytics(analyticsStrings(), 30);
    const installs = document.getElementById('admin-analytics-installs')?.textContent ?? '';
    expect(installs).toContain('canopy');
    expect(installs).toContain('installer');
    expect(installs).toContain('8');
    expect(installs).toContain('browser');
    expect(document.getElementById('admin-analytics-counts')?.textContent).toBe('4 funnel · 10 installs');

    // Switching to an empty window clears the stale glance count.
    global.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, window: 7, funnel: [], installs: [] }), { status: 200 })) as unknown as typeof fetch;
    await renderAnalytics(analyticsStrings(), 7);
    expect(document.getElementById('admin-analytics-counts')?.textContent).toBe('');
    expect((document.getElementById('admin-analytics-notice') as HTMLElement).textContent).toBe('empty window');
  });
});

describe('admin analytics outcome filtering', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mixedPayload() {
    return {
      ok: true,
      window: 30,
      funnel: [
        { event: 'landing', tool: 'canopy', path: '/es/canopy', utm_source: 'gh', utm_medium: '', utm_campaign: '', count: 4 },
        { event: 'view', utm_source: '', utm_medium: '', utm_campaign: '', count: 1 },
      ],
      installs: [
        { tool: 'canopy', clientClass: 'curl', outcome: 'redirect', count: 5 },
        { tool: '', clientClass: '', outcome: 'unknown-tool', count: 7 },
        { tool: '', clientClass: '', outcome: 'no-windows', count: 2 },
        { tool: '(root)', clientClass: 'browser', outcome: 'root', count: 3 },
        { tool: 'weird', clientClass: 'curl', outcome: 'teapot', count: 1 },
      ],
    };
  }

  function mockPayload(payload: unknown): void {
    global.fetch = (async () =>
      new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
  }

  it('selects tool, path and outcome blobs in the read-only aggregates', () => {
    for (const days of [7, 30, 90] as const) {
      const funnel = buildFunnelQuery(days);
      expect(funnel).toContain('blob2 AS tool');
      expect(funnel).toContain('blob3 AS path');
      expect(funnel).toContain('univerlab_funnel');
      const installs = buildInstallsQuery(days);
      expect(installs).toContain('blob6 AS outcome');
      expect(installs).toContain('univerlab_installs');
    }
  });

  it('maps recorded outcomes to HTTP status labels', () => {
    expect(statusFor('redirect')).toBe('302');
    expect(statusFor('root')).toBe('302');
    expect(statusFor('unknown-tool')).toBe('404');
    expect(statusFor('no-windows')).toBe('404');
    expect(statusFor('teapot')).toBe('teapot');
  });

  it('renders the Page column and defaults to real tool redirects', async () => {
    setInstallsFilter('real');
    mountAnalytics();
    mockPayload(mixedPayload());
    await renderAnalytics(analyticsStrings(), 30);
    const funnelText = document.getElementById('admin-analytics-funnel')?.textContent ?? '';
    expect(funnelText).toContain('/es/canopy (canopy)');
    const installsText = document.getElementById('admin-analytics-installs')?.textContent ?? '';
    expect(installsText).toContain('canopy');
    expect(installsText).toContain('302 · redirect');
    expect(installsText).not.toContain('unknown-tool');
    expect(installsText).not.toContain('no-windows');
    expect(installsText).not.toContain('(root)');
    expect(installsText).not.toContain('teapot');
    expect(document.getElementById('admin-analytics-counts')?.textContent).toBe('5 funnel · 5 installs');
  });

  it('switches between real, 404/probe and all filters', async () => {
    setInstallsFilter('real');
    mountAnalytics();
    mockPayload(mixedPayload());
    await renderAnalytics(analyticsStrings(), 30);
    const realBtn = document.querySelector('[data-installs-filter="real"]') as HTMLButtonElement;
    const probesBtn = document.querySelector('[data-installs-filter="probes"]') as HTMLButtonElement;
    const allBtn = document.querySelector('[data-installs-filter="all"]') as HTMLButtonElement;
    expect(realBtn.getAttribute('aria-current')).toBe('true');

    probesBtn.click();
    let text = document.getElementById('admin-analytics-installs')?.textContent ?? '';
    expect(text).toContain('404 · unknown-tool');
    expect(text).toContain('404 · no-windows');
    expect(text).not.toContain('302 · redirect');
    expect(text).not.toContain('302 · root');
    expect(probesBtn.getAttribute('aria-current')).toBe('true');
    expect(realBtn.getAttribute('aria-current')).toBeNull();

    allBtn.click();
    text = document.getElementById('admin-analytics-installs')?.textContent ?? '';
    expect(text).toContain('302 · redirect');
    expect(text).toContain('404 · unknown-tool');
    expect(text).toContain('404 · no-windows');
    expect(text).toContain('302 · root');
    expect(text).toContain('teapot');
    expect(allBtn.getAttribute('aria-current')).toBe('true');

    // The glance keeps counting real redirects only, whatever the filter.
    expect(document.getElementById('admin-analytics-counts')?.textContent).toBe('5 funnel · 5 installs');
  });

  it('labels every analytics cell for the mobile stacked cards', async () => {
    setInstallsFilter('all');
    mountAnalytics();
    mockPayload(mixedPayload());
    await renderAnalytics(analyticsStrings(), 30);
    const cells = document.querySelectorAll('#admin-analytics-funnel td, #admin-analytics-installs td');
    expect(cells.length).toBeGreaterThan(0);
    const labels = new Set<string>();
    cells.forEach((td) => {
      const label = (td as HTMLElement).dataset['label'] ?? (td as HTMLElement).getAttribute('data-label');
      expect(label).toBeTruthy();
      if (label) labels.add(label);
    });
    for (const expected of ['Event', 'Page', 'Source', 'Medium', 'Campaign', 'Count', 'Tool', 'Client', 'Status']) {
      expect(labels.has(expected)).toBe(true);
    }
  });
});
