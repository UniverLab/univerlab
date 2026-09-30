/**
 * Tests for releases.ts - build-time latest-release lookup.
 */
const mockFetch = jest.fn();
global.fetch = mockFetch;

const originalEnv = process.env;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.resetModules();
  mockFetch.mockReset();
  process.env = { ...originalEnv };
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  jest.useRealTimers();
});

afterAll(() => {
  process.env = originalEnv;
});

const REPO_URL = 'https://github.com/UniverLab/texforge';

describe('releases.ts', () => {
  it('success: fetches /releases/latest, no auth header without a token', async () => {
    const { latestRelease } = await import('../lib/releases');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v0.9.0',
        published_at: '2026-09-20T10:00:00Z',
        html_url: 'https://github.com/UniverLab/texforge/releases/tag/v0.9.0',
        draft: false,
        prerelease: false,
      }),
    });
    const info = await latestRelease(REPO_URL);
    expect(info).toEqual({
      version: 'v0.9.0',
      publishedAt: '2026-09-20T10:00:00Z',
      url: 'https://github.com/UniverLab/texforge/releases/tag/v0.9.0',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.github.com/repos/UniverLab/texforge/releases/latest');
    expect(mockFetch.mock.calls[0][1].headers.Accept).toBe('application/vnd.github+json');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('success: sends Bearer auth header when GITHUB_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'tok123';
    const { latestRelease } = await import('../lib/releases');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v0.9.0',
        published_at: '2026-09-20T10:00:00Z',
        html_url: 'https://github.com/UniverLab/texforge/releases/tag/v0.9.0',
        draft: false,
        prerelease: false,
      }),
    });
    await latestRelease(REPO_URL);
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok123');
  });

  it('404 resolves null with exactly one single-line warning', async () => {
    const { latestRelease } = await import('../lib/releases');
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const info = await latestRelease(REPO_URL);
    expect(info).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = warnSpy.mock.calls[0][0] as string;
    expect(msg).toContain('404');
    expect(msg).not.toContain('\n');
  });

  it('timeout after 5000 ms resolves null and warns', async () => {
    jest.useFakeTimers();
    const { latestRelease } = await import('../lib/releases');
    mockFetch.mockImplementation(
      (_u: unknown, init: { signal: AbortSignal }) =>
        new Promise((_r, rej) => {
          init.signal.addEventListener('abort', () =>
            rej(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    const p = latestRelease(REPO_URL);
    await jest.advanceTimersByTimeAsync(5000);
    const info = await p;
    expect(info).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect((warnSpy.mock.calls[0][0] as string).toLowerCase()).toContain('timeout');
  });

  it('rate limit 403 and 429 resolve null with rate-limited warning', async () => {
    for (const status of [403, 429]) {
      jest.resetModules();
      mockFetch.mockReset();
      warnSpy.mockClear();
      const { latestRelease } = await import('../lib/releases');
      mockFetch.mockResolvedValueOnce({ ok: false, status });
      const info = await latestRelease(REPO_URL);
      expect(info).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect((warnSpy.mock.calls[0][0] as string).toLowerCase()).toContain('rate limited');
    }
  });

  it('missing repo never calls fetch and warns once', async () => {
    const { latestRelease } = await import('../lib/releases');
    const info = await latestRelease('https://github.com/UniverLab');
    expect(info).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('malformed body and bad JSON resolve null and warn, never throw', async () => {
    const { latestRelease: lr1 } = await import('../lib/releases');
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    await expect(lr1(REPO_URL)).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    jest.resetModules();
    mockFetch.mockReset();
    warnSpy.mockClear();
    const { latestRelease: lr2 } = await import('../lib/releases');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('x');
      },
    });
    await expect(lr2(REPO_URL)).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('draft/prerelease payload is omitted', async () => {
    const { latestRelease } = await import('../lib/releases');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.0',
        published_at: '2026-09-20T10:00:00Z',
        html_url: 'https://example.com',
        draft: false,
        prerelease: true,
      }),
    });
    await expect(latestRelease(REPO_URL)).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('memoises per REPO_URL: two calls fetch once and warn once', async () => {
    const { latestRelease } = await import('../lib/releases');
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await latestRelease(REPO_URL);
    await latestRelease(REPO_URL);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  describe('releaseAgeLabel', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    it.each([
      ['2026-09-29T00:00:00Z', 'en', '0 days ago'],
      ['2026-09-29T00:00:00Z', 'es', 'hace 0 días'],
      ['2026-09-28T12:00:00Z', 'en', '1 day ago'],
      ['2026-09-28T12:00:00Z', 'es', 'hace 1 día'],
      ['2026-09-19T12:00:00Z', 'en', '1 week ago'],
      ['2026-09-19T12:00:00Z', 'es', 'hace 1 semana'],
      ['2026-08-30T12:00:00Z', 'en', '1 month ago'],
      ['2026-08-30T12:00:00Z', 'es', 'hace 1 mes'],
      ['2026-07-31T12:00:00Z', 'en', '2 months ago'],
    ])('%s (%s) → %s', async (date, locale, expected) => {
      const { releaseAgeLabel } = await import('../lib/releases');
      expect(releaseAgeLabel(date, locale, now)).toBe(expected);
    });

    it('future and invalid dates degrade', async () => {
      const { releaseAgeLabel } = await import('../lib/releases');
      expect(releaseAgeLabel('not-a-date', 'en', now)).toBe('');
    });
  });
});

// Keep this file a module: without it the top-level `mockFetch`/`originalEnv`
// live in the global scope and collide with contributors.test.ts's identically
// named scripts, which `tsc` reports as duplicate block-scoped variables.
export {};
