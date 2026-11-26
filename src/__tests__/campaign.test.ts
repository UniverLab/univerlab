/**
 * Cookieless campaign convention: validation, tagged URLs, tab-only
 * storage and beacon reporting. A test here must fail if the feature is
 * removed: every behavior asserts an observable the site depends on.
 */

import {
  buildCampaignUrl,
  loadUtm,
  reportEvent,
  saveUtm,
  parseUtm,
  trackCampaignNavigation,
  UTM_KEY,
} from '../lib/campaign';

function params(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  jest.restoreAllMocks();
});

describe('parseUtm', () => {
  it('keeps valid lowercase fields', () => {
    expect(
      parseUtm(params('utm_source=x&utm_medium=social&utm_campaign=launch&utm_content=a-1')),
    ).toEqual({
      utm_source: 'x',
      utm_medium: 'social',
      utm_campaign: 'launch',
      utm_content: 'a-1',
    });
  });

  it('lowercases and trims valid values', () => {
    expect(parseUtm(params('utm_source= X-News '))).toEqual({ utm_source: 'x-news' });
  });

  it('rejects uppercase leftovers, spaces, quotes and angle brackets', () => {
    expect(parseUtm(params('utm_source=AB CD'))).toEqual({});
    expect(parseUtm(params('utm_medium=a"><b'))).toEqual({});
    expect(parseUtm(params('utm_campaign=hello_world'))).toEqual({});
    expect(parseUtm(params('utm_content=a/b'))).toEqual({});
  });

  it('drops empty and oversized values', () => {
    expect(parseUtm(params('utm_source='))).toEqual({});
    expect(parseUtm(params(`utm_source=${'a'.repeat(65)}`))).toEqual({});
    expect(parseUtm(params(`utm_content=${'a'.repeat(129)}`))).toEqual({});
    expect(parseUtm(params(`utm_content=${'a'.repeat(128)}`))).toEqual({
      utm_content: 'a'.repeat(128),
    });
  });

  it('ignores non-utm parameters', () => {
    expect(parseUtm(params('gclid=abc&utm_source=x'))).toEqual({ utm_source: 'x' });
  });
});

describe('buildCampaignUrl', () => {
  it('builds a tagged site URL', () => {
    expect(buildCampaignUrl('/canopy', { utm_source: 'x', utm_medium: 'social' })).toBe(
      '/canopy?utm_source=x&utm_medium=social',
    );
  });

  it('throws on invalid UTM values and non-site paths', () => {
    expect(() => buildCampaignUrl('/canopy', { utm_source: 'a b' })).toThrow();
    expect(() => buildCampaignUrl('/canopy', { utm_source: 'x'.repeat(65) })).toThrow();
    expect(() => buildCampaignUrl('https://get.univerlab.org/x', { utm_source: 'x' })).toThrow();
  });
});

describe('saveUtm / loadUtm', () => {
  it('round-trips through sessionStorage under the ul_utm key only', () => {
    saveUtm({ utm_source: 'x', utm_campaign: 'launch' });
    expect(window.sessionStorage.getItem(UTM_KEY)).toContain('x');
    expect(loadUtm()).toEqual({ utm_source: 'x', utm_campaign: 'launch' });
  });

  it('re-validates on save and on load', () => {
    saveUtm({ utm_source: 'a b' } as unknown as { utm_source: string });
    expect(loadUtm()).toEqual({});
    window.sessionStorage.setItem(UTM_KEY, '{"utm_source":"a b"}');
    expect(loadUtm()).toEqual({});
    window.sessionStorage.setItem(UTM_KEY, 'not-json');
    expect(loadUtm()).toEqual({});
  });

  it('clears on empty and never touches localStorage or cookies', () => {
    saveUtm({ utm_source: 'x' });
    saveUtm({});
    expect(loadUtm()).toEqual({});
    expect(window.sessionStorage.getItem(UTM_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});

describe('reportEvent', () => {
  it('beacons the tab UTM with the event without blocking', async () => {
    saveUtm({ utm_source: 'x', utm_medium: 'social' });
    const calls: Array<{ url: string; data: Blob }> = [];
    Object.defineProperty(window.navigator, 'sendBeacon', {
      value: jest.fn((url: string, data: Blob) => {
        calls.push({ url, data });
        return true;
      }),
      configurable: true,
    });
    reportEvent('copy_install', { tool: 'canopy' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/event');
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(calls[0].data);
    });
    const body = JSON.parse(text) as Record<string, string>;
    expect(body['event']).toBe('copy_install');
    expect(body['tool']).toBe('canopy');
    expect(body['utm_source']).toBe('x');
    expect(body['utm_medium']).toBe('social');
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('falls back to keepalive fetch when sendBeacon is absent', () => {
    saveUtm({ utm_source: 'x' });
    const fetchMock = jest.fn(() => Promise.resolve(new Response()));
    Object.defineProperty(window, 'fetch', { value: fetchMock, configurable: true });
    const nav = window.navigator as Navigator & { sendBeacon?: unknown };
    const original = nav.sendBeacon;
    delete (nav as unknown as Record<string, unknown>)['sendBeacon'];
    try {
      reportEvent('workbench_visit');
    } finally {
      if (original !== undefined) {
        Object.defineProperty(window.navigator, 'sendBeacon', {
          value: original,
          configurable: true,
        });
      }
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body['event']).toBe('workbench_visit');
    expect(body['utm_source']).toBe('x');
  });

  it('drops unknown events without sending anything', () => {
    const fetchMock = jest.fn(() => Promise.resolve(new Response()));
    Object.defineProperty(window, 'fetch', { value: fetchMock, configurable: true });
    reportEvent('nope' as never);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('trackCampaignNavigation', () => {
  function mockFetchOnly() {
    Object.defineProperty(window.navigator, 'sendBeacon', {
      value: undefined,
      configurable: true,
    });
    const fetchMock = jest.fn(() => Promise.resolve(new Response()));
    Object.defineProperty(window, 'fetch', { value: fetchMock, configurable: true });
    return fetchMock;
  }

  function go(path: string): void {
    window.history.replaceState({}, '', path);
  }

  function lastBody(fetchMock: jest.Mock): Record<string, string> {
    const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown as [
      string,
      RequestInit,
    ];
    return JSON.parse(init.body as string) as Record<string, string>;
  }

  it('does NOT emit page_view on a URL that carries utm_* (edge already wrote landing)', () => {
    const fetchMock = mockFetchOnly();
    saveUtm({ utm_source: 'x', utm_medium: 'social' });
    go('/texforge?utm_source=x&utm_medium=social');
    trackCampaignNavigation();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('does NOT emit page_view when sessionStorage has no UTM', () => {
    const fetchMock = mockFetchOnly();
    expect(loadUtm()).toEqual({});
    go('/texforge');
    trackCampaignNavigation();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emits page_view with the current pathname when storage has UTM and the URL is clean', () => {
    const fetchMock = mockFetchOnly();
    saveUtm({ utm_source: 'x', utm_campaign: 'launch' });
    go('/texforge');
    trackCampaignNavigation();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastBody(fetchMock);
    expect(body['event']).toBe('page_view');
    expect(body['path']).toBe('/texforge');
    expect(body['utm_source']).toBe('x');
    expect(body['utm_campaign']).toBe('launch');
    expect(body).not.toHaveProperty('tool');
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it.each([
    '/admin',
    '/es/admin',
    '/sign',
    '/es/sign',
    '/workbench',
    '/es/workbench',
    '/admin/users',
    '/es/workbench/sessions',
  ])('skips %s (private area or workbench, already counted)', (path) => {
    const fetchMock = mockFetchOnly();
    saveUtm({ utm_source: 'x' });
    go(path);
    trackCampaignNavigation();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still emits on public paths that merely share a prefix with a skip path', () => {
    const fetchMock = mockFetchOnly();
    saveUtm({ utm_source: 'x' });
    go('/administrator');
    trackCampaignNavigation();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastBody(fetchMock)['path']).toBe('/administrator');
  });

  it('saves utm_* from the landing URL first and never touches localStorage or cookies', () => {
    const fetchMock = mockFetchOnly();
    go('/?utm_source=x');
    // Landing URL itself: no page_view, but the UTM is kept for the tab.
    trackCampaignNavigation();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadUtm()).toEqual({ utm_source: 'x' });
    // Later navigation in the same tab now emits.
    go('/');
    trackCampaignNavigation();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastBody(fetchMock)['event']).toBe('page_view');
    expect(window.localStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});
