/**
 * Tests for contributors.ts - GitHub contributors fetch
 */
// Mock global fetch before importing the module
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  mockFetch.mockReset();
  process.env = { ...originalEnv };
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
});

afterAll(() => {
  process.env = originalEnv;
});

describe('contributors.ts', () => {
  it('should return an array of contributors', async () => {
    const { getContributors } = await import('../lib/contributors');

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: 'test-repo', fork: false, archived: false },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            login: 'testuser',
            type: 'User',
            avatar_url: 'https://example.com/avatar.png',
            html_url: 'https://github.com/testuser',
            contributions: 10,
          },
        ],
      });

    const contributors = await getContributors();

    expect(Array.isArray(contributors)).toBe(true);
    expect(contributors.length).toBeGreaterThan(0);
    expect(contributors[0]).toHaveProperty('login');
    expect(contributors[0]).toHaveProperty('avatar');
    expect(contributors[0]).toHaveProperty('url');
    expect(contributors[0]).toHaveProperty('contributions');
  });

  it('should filter out bot accounts', async () => {
    const { getContributors } = await import('../lib/contributors');

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: 'test-repo', fork: false, archived: false }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            login: 'dependabot[bot]',
            type: 'Bot',
            avatar_url: 'https://example.com/bot.png',
            html_url: 'https://github.com/dependabot[bot]',
            contributions: 50,
          },
          {
            login: 'realuser',
            type: 'User',
            avatar_url: 'https://example.com/user.png',
            html_url: 'https://github.com/realuser',
            contributions: 5,
          },
        ],
      });

    const contributors = await getContributors();

    expect(contributors.find(c => c.login === 'dependabot[bot]')).toBeUndefined();
    expect(contributors.find(c => c.login === 'realuser')).toBeDefined();
  });

  it('should skip forked repositories', async () => {
    const { getContributors } = await import('../lib/contributors');

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: 'original', fork: false, archived: false },
          { name: 'forked-repo', fork: true, archived: false },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            login: 'user1',
            type: 'User',
            avatar_url: 'https://example.com/u1.png',
            html_url: 'https://github.com/user1',
            contributions: 10,
          },
        ],
      });

    const contributors = await getContributors();

    // Should only have made one contributors API call (for original repo)
    expect(mockFetch).toHaveBeenCalledTimes(2); // 1 for repos + 1 for contributors
  });

  it('should return empty array when API fails', async () => {
    const { getContributors } = await import('../lib/contributors');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    const contributors = await getContributors();

    expect(contributors).toEqual([]);
  });

  it('should handle network errors gracefully', async () => {
    const { getContributors } = await import('../lib/contributors');

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const contributors = await getContributors();

    expect(contributors).toEqual([]);
  });
});
