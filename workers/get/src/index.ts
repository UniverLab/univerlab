/**
 * get.univerlab.org — install-URL redirector, with aggregate counting.
 *
 *   curl -fsSL https://get.univerlab.org/<tool> | sh     (macOS / Linux)
 *   irm https://get.univerlab.org/<tool>.ps1 | iex       (Windows)
 *
 * It only issues a 302 to the real script in each repo. GitHub stays the
 * download origin AND the trust anchor — this Worker proxies nothing, so it
 * adds no supply-chain surface beyond a redirect.
 *
 * It DOES record one aggregate data point per request (Analytics Engine):
 * which tool, which platform, what kind of client, country, referrer host and
 * outcome. No IP, no full user-agent, no cookies, nothing per-person. The write
 * is fire-and-forget inside a try/catch — if analytics breaks, the redirect
 * still happens. See README for what is recorded and how to query it.
 *
 * To pin for integrity, swap REF from "main" to a tag (e.g. "v1.2.0").
 */

const REF = 'main';

const TOOLS: Record<string, { repo: string; win: boolean }> = {
  canopy: { repo: 'harness-canopy', win: false }, // sh only
  texforge: { repo: 'texforge', win: true },
  gitkit: { repo: 'gitkit', win: true },
  ghscaff: { repo: 'ghscaff', win: true },
  cadspec: { repo: 'cadspec', win: true },

  demostage: { repo: 'demostage', win: true },
};

const raw = (repo: string, file: string) =>
  `https://raw.githubusercontent.com/UniverLab/${repo}/${REF}/scripts/${file}`;

interface Env {
  /** Optional: absent in local dev, and the Worker must still serve. */
  INSTALLS?: AnalyticsEngineDataset;
}

/**
 * Coarse client class. Deliberately not the raw user-agent: we want to tell an
 * install apart from someone opening the URL to read the script, nothing more.
 */
function clientClass(ua: string): string {
  const s = ua.toLowerCase();
  if (s.includes('curl')) return 'curl';
  if (s.includes('wget')) return 'wget';
  if (s.includes('powershell')) return 'powershell';
  if (s.includes('mozilla')) return 'browser';
  return ua ? 'other' : 'none';
}

/** Referrer host only — never the full URL, which can carry query strings. */
function referrerHost(ref: string | null): string {
  if (!ref) return '';
  try {
    return new URL(ref).host;
  } catch {
    return '';
  }
}

function record(
  env: Env,
  req: Request,
  tool: string,
  platform: string,
  outcome: string,
): void {
  if (!env.INSTALLS) return;
  try {
    env.INSTALLS.writeDataPoint({
      // Grouping key. Analytics Engine allows exactly one index.
      indexes: [tool],
      blobs: [
        tool,
        platform,
        clientClass(req.headers.get('user-agent') ?? ''),
        (req as { cf?: { country?: string } }).cf?.country ?? '',
        referrerHost(req.headers.get('referer')),
        outcome,
      ],
      doubles: [1],
    });
  } catch {
    // Never let telemetry break an install.
  }
}

export default {
  fetch(req: Request, env: Env): Response {
    const slug = new URL(req.url).pathname.replace(/^\/+|\/+$/g, '').toLowerCase();

    // Bare domain → send people to the experiments page.
    if (slug === '' || slug === 'index.html') {
      record(env, req, '(root)', '-', 'root');
      return Response.redirect('https://univerlab.org/#experiments', 302);
    }

    const win = slug.endsWith('.ps1');
    const tool = win ? slug.slice(0, -4) : slug;
    const platform = win ? 'ps1' : 'sh';
    const entry = TOOLS[tool];

    if (!entry) {
      record(env, req, tool, platform, 'unknown-tool');
      return new Response(`Unknown tool: ${tool}\n`, { status: 404 });
    }
    if (win && !entry.win) {
      record(env, req, tool, platform, 'no-windows');
      return new Response(`No Windows installer for ${tool} (macOS / Linux only).\n`, {
        status: 404,
      });
    }

    record(env, req, tool, platform, 'redirect');
    return Response.redirect(raw(entry.repo, win ? 'install.ps1' : 'install.sh'), 302);
  },
};
