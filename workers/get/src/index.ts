/**
 * get.univerlab.org — dumb install-URL redirector.
 *
 *   curl -fsSL https://get.univerlab.org/<tool> | sh     (macOS / Linux)
 *   irm https://get.univerlab.org/<tool>.ps1 | iex       (Windows)
 *
 * It only issues a 302 to the real script in each repo. GitHub stays the
 * download origin AND the trust anchor — this Worker proxies nothing and
 * counts nothing, so it adds no supply-chain surface beyond a redirect.
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

export default {
  fetch(req: Request): Response {
    const slug = new URL(req.url).pathname.replace(/^\/+|\/+$/g, '').toLowerCase();

    // Bare domain → send people to the experiments page.
    if (slug === '' || slug === 'index.html') {
      return Response.redirect('https://univerlab.org/#experiments', 302);
    }

    const win = slug.endsWith('.ps1');
    const tool = win ? slug.slice(0, -4) : slug;
    const entry = TOOLS[tool];

    if (!entry) {
      return new Response(`Unknown tool: ${tool}\n`, { status: 404 });
    }
    if (win && !entry.win) {
      return new Response(`No Windows installer for ${tool} (macOS / Linux only).\n`, {
        status: 404,
      });
    }

    return Response.redirect(raw(entry.repo, win ? 'install.ps1' : 'install.sh'), 302);
  },
};
