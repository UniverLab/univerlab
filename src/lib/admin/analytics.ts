// The control-room analytics core: aggregate campaign-funnel and installer
// counts from Cloudflare's Analytics Engine SQL API. Pure orchestration over
// injected dependencies — the Pages Function file under functions/api/ is a
// thin adapter, so this handler runs unchanged in jest with a stub verifier,
// a stub fetch and a stub cache.
//
// Datasets (written elsewhere, read here):
// - `univerlab_funnel` (functions/funnel-landing.ts, functions/api/event.ts):
//   blob1 event, blob2 tool, blob3 path, blob4 utm_source, blob5 utm_medium,
//   blob6 utm_campaign, blob7 utm_content, blob8 country.
// - `univerlab_installs` (workers/get/src/index.ts): blob1 tool,
//   blob2 platform, blob3 clientClass, blob4 country, blob5 referrer host,
//   blob6 outcome.

import { isOwnerEmail, readToken } from '../sign/handlers';

/** The selectable windows, in days. Anything else falls back to 30. */
export const ANALYTICS_WINDOWS = [7, 30, 90] as const;

export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

export function parseAnalyticsWindow(raw: unknown): AnalyticsWindow {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : typeof raw === 'number' ? raw : Number.NaN;
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

export interface AnalyticsEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  SIGN_OWNER_EMAILS?: string;
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
}

export interface AnalyticsDeps {
  verify: (token: string, env: { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string }) => Promise<string | null>;
  fetchImpl?: typeof fetch;
  cache?: {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
  };
}

export interface FunnelRow {
  event: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  count: number;
}

export interface InstallRow {
  tool: string;
  clientClass: string;
  count: number;
}

/** Coarse client class for the installs table: installer CLIs together,
 *  browsers together, everything else together. */
export function coarseClientClass(raw: string): 'installer' | 'browser' | 'other' {
  const s = raw.trim().toLowerCase();
  if (s === 'curl' || s === 'wget' || s === 'powershell') return 'installer';
  if (s === 'browser') return 'browser';
  return 'other';
}

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

/** Read-only aggregate over the funnel dataset: totals per event and UTM
 *  triple. `days` is allowlisted by parseAnalyticsWindow, so interpolation
 *  is safe. */
export function buildFunnelQuery(days: AnalyticsWindow): string {
  return (
    `SELECT blob1 AS event, blob4 AS utm_source, blob5 AS utm_medium, blob6 AS utm_campaign, ` +
    `SUM(_sample_interval) AS count FROM univerlab_funnel ` +
    `WHERE timestamp > NOW() - INTERVAL '${days}' DAY ` +
    `GROUP BY blob1, blob4, blob5, blob6 ORDER BY count DESC`
  );
}

/** Read-only aggregate over the installs dataset: totals per tool and raw
 *  client class (the panel maps them to the coarse class). */
export function buildInstallsQuery(days: AnalyticsWindow): string {
  return (
    `SELECT blob1 AS tool, blob3 AS client_class, SUM(_sample_interval) AS count FROM univerlab_installs ` +
    `WHERE timestamp > NOW() - INTERVAL '${days}' DAY ` +
    `GROUP BY blob1, blob3 ORDER BY count DESC`
  );
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** One Analytics Engine SQL call: POST the read-only query, return the
 *  `data` rows. Throws on any transport or API failure — the caller
 *  decides whether stale cache or an explicit error answers. */
export async function fetchSql(
  accountId: string,
  token: string,
  sql: string,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>[]> {
  const res = await fetchImpl(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain; charset=utf-8' },
      body: sql,
    },
  );
  if (!res.ok) throw new Error(`analytics sql failed (${res.status})`);
  let payload: unknown;
  try {
    payload = (await res.json()) as unknown;
  } catch {
    throw new Error('analytics sql unreadable');
  }
  const data = (payload as Record<string, unknown>)?.['data'];
  if (!Array.isArray(data)) throw new Error('analytics sql malformed');
  return data as Record<string, unknown>[];
}

function funnelRows(data: Record<string, unknown>[]): FunnelRow[] {
  return data.map((r) => ({
    event: str(r['event']),
    utm_source: str(r['utm_source']),
    utm_medium: str(r['utm_medium']),
    utm_campaign: str(r['utm_campaign']),
    count: num(r['count']),
  }));
}

function installRows(data: Record<string, unknown>[]): InstallRow[] {
  return data.map((r) => ({
    tool: str(r['tool']),
    clientClass: str(r['client_class']),
    count: num(r['count']),
  }));
}

/** GET /api/admin-analytics?window=7|30|90: owner-only aggregate counts.
 *  Missing credentials answer an explicit `unconfigured` state (never
 *  zeros); a failed SQL call serves stale cache when there is one, and
 *  `ok: false` otherwise — also never zeros. */
export async function handleAdminAnalytics(
  request: Request,
  env: AnalyticsEnv,
  deps: AnalyticsDeps,
): Promise<Response> {
  const token = readToken(request);
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401);
  const email = await deps.verify(token, env);
  if (!email) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!isOwnerEmail(email, env)) return json({ ok: false, error: 'forbidden' }, 403);

  const window = parseAnalyticsWindow(new URL(request.url).searchParams.get('window'));
  const accountId = (env.CF_ACCOUNT_ID ?? '').trim();
  const apiToken = (env.CF_ANALYTICS_TOKEN ?? '').trim();
  if (accountId === '' || apiToken === '') {
    return json({ ok: false, state: 'unconfigured', window });
  }

  const cacheKey = new Request(`https://admin-analytics.local/api/admin-analytics?window=${window}`);
  const cache = deps.cache;
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {
      // A broken cache never blocks the live query.
    }
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  let funnel: FunnelRow[];
  let installs: InstallRow[];
  try {
    const [funnelData, installsData] = await Promise.all([
      fetchSql(accountId, apiToken, buildFunnelQuery(window), fetchImpl),
      fetchSql(accountId, apiToken, buildInstallsQuery(window), fetchImpl),
    ]);
    funnel = funnelRows(funnelData);
    installs = installRows(installsData);
  } catch {
    return json({ ok: false, error: 'unavailable', window }, 502);
  }

  const res = json({ ok: true, window, funnel, installs });
  if (cache) {
    const cached = new Response(await res.clone().text(), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=3600' },
    });
    try {
      await cache.put(cacheKey, cached);
    } catch {
      // The live answer stands without the cache write.
    }
  }
  return res;
}
