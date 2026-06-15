// Build-time fetch of the organisation's GitHub contributors.
//
// Walks every public repo in the org, aggregates contributors by login
// (summing commits across repos), drops bots and the founder (who has a
// dedicated card), and sorts by contribution count. The result is baked into
// the static page — no client-side requests, no exposed token. If the API is
// unreachable or rate-limited the page simply renders without the wall.

const ORG = 'UniverLab';
const FOUNDER = 'jheisonmb'; // lowercased; already shown as the founder

export interface Contributor {
  login: string;
  avatar: string;
  url: string;
  contributions: number;
}

async function gh<T>(path: string): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'univerlab-site',
  };
  // Optional token lifts the rate limit from 60 to 5000 requests/hour in CI.
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`https://api.github.com${path}`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface GhRepo {
  name: string;
  fork: boolean;
  archived: boolean;
}
interface GhContributor {
  login: string;
  type: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

// Memoised for the process lifetime so dev reloads and multi-page builds
// hit the API once, not on every render.
let cache: Promise<Contributor[]> | null = null;

export function getContributors(): Promise<Contributor[]> {
  if (!cache) cache = load();
  return cache;
}

async function load(): Promise<Contributor[]> {
  const repos = await gh<GhRepo[]>(`/orgs/${ORG}/repos?per_page=100&type=public`);
  if (!Array.isArray(repos)) return [];

  const totals = new Map<string, Contributor>();
  for (const repo of repos) {
    if (repo.fork || repo.archived) continue;
    const list = await gh<GhContributor[]>(
      `/repos/${ORG}/${repo.name}/contributors?per_page=100`,
    );
    if (!Array.isArray(list)) continue;
    for (const c of list) {
      if (c.type !== 'User') continue; // skip dependabot and other bots
      // TEMP: founder exclusion disabled to preview the wall with everyone.
      void FOUNDER; // keep the constant referenced while the filter is off
      // if (c.login.toLowerCase() === FOUNDER) continue;
      const existing = totals.get(c.login);
      if (existing) {
        existing.contributions += c.contributions;
      } else {
        totals.set(c.login, {
          login: c.login,
          avatar: c.avatar_url,
          url: c.html_url,
          contributions: c.contributions,
        });
      }
    }
  }
  return [...totals.values()].sort((a, b) => b.contributions - a.contributions);
}
