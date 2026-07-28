# get.univerlab.org

A tiny Cloudflare Worker that gives the install commands a clean URL:

```sh
curl -fsSL https://get.univerlab.org/canopy | sh      # macOS / Linux
irm https://get.univerlab.org/texforge.ps1 | iex      # Windows
```

It **only 302-redirects** to each repo's real script on GitHub
(`raw.githubusercontent.com/UniverLab/<repo>/main/scripts/install.{sh,ps1}`).
No proxying, no database — GitHub stays the download origin and the trust
anchor; this Worker is just a prettier doorway. `curl -fsSL` and `irm | iex`
both follow the redirect transparently.

The tool → repo map (and which platforms each ships) lives in `src/index.ts`.

## What it counts

> This used to say "no counting". It counts now — see below for exactly what,
> and why the trust argument is unchanged.

One aggregate data point per request, via
[Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/):

| Field | Example | Why |
|---|---|---|
| tool | `demostage` | which tool people actually install |
| platform | `sh` / `ps1` | Windows vs Unix split |
| client class | `curl`, `powershell`, `browser` | tells a real install from someone reading the script |
| country | `CO` | rough geography |
| referrer host | `news.ycombinator.com` | only ever set for browser visits (see caveat) |
| outcome | `redirect`, `unknown-tool`, `no-windows` | 404s show what people expected to exist |

**Not recorded**: IP addresses, full user-agents, cookies, anything tied to a
person. The client class is a coarse bucket, not the raw header.

The supply-chain argument is unchanged: the Worker still proxies nothing, and
the script still comes from GitHub. What changed is that aggregate metadata
about the *redirect* is now recorded. The write is fire-and-forget inside a
`try/catch`, so if Analytics Engine is down the install still works.

### Caveat: `curl | sh` sends no `Referer`

Referrer is empty for actual installs — curl and PowerShell do not send the
header. It is only populated when someone opens the URL in a browser.

**Attribution for a launch is therefore by time correlation, not referrer.**
Post at a known time, then run `./query.sh daily` and look for the spike. The
`clients` query is the useful companion: a burst of `browser` hits with few
`curl` hits means people looked and did not install.

### Reading the data — unsolved

Writing is done. Reading is not, and it is a real gap: Analytics Engine has no
dashboard, and `wrangler` has no command for it. The only way in is the SQL API:

```
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/analytics_engine/sql
Authorization: Bearer <token with "Account Analytics: Read">
```

Query tooling for this is **deliberately not in this repo**. It needs a
long-lived API token, and keeping one in a local environment variable is a
standing liability — a single compromised dependency in any shell that has it
is enough to exfiltrate it. Deployment is different: there the token is a repo
secret, scoped and rotatable, used by CI in a controlled environment.

Local helpers, if any, live untracked in `workers/get/scripts/` (gitignored).

**This must be solved before it matters.** Counting installs is pointless if
nobody can read the counts. Options worth weighing when the time comes:

- A read-only endpoint on this Worker, gated by a secret set with
  `wrangler secret put` — the credential then lives in Cloudflare, never on a
  laptop.
- A scheduled Worker that queries and publishes an aggregate JSON.
- A short-lived token minted per session, never persisted.

One implementation note for whoever builds it: use `SUM(_sample_interval)`, not
`COUNT(*)`. Analytics Engine samples under load and that column reconstructs the
true count.

## Deploy

It deploys itself: the **Deploy get worker** GitHub Action runs `wrangler deploy`
on any push to `main` that touches `workers/get/**`. It needs two repo secrets:

- `CLOUDFLARE_API_TOKEN` — a token with the *Edit Workers* permission.
- `CLOUDFLARE_ACCOUNT_ID`.

To deploy by hand: `cd workers/get && npx wrangler deploy`.

## One-time setup (all on Cloudflare)

1. **Buy `univerlab.org`** on Cloudflare (registrar + DNS).
2. **Site** → connect this repo to **Cloudflare Pages** (build: `npm run build`,
   output: `dist`). Pages serves the apex + `www` and auto-deploys on push.
3. **`get` subdomain** → after the first deploy, add the Custom Domain
   `get.univerlab.org` to this Worker (Workers & Pages → univerlab-get →
   Settings → Domains & Routes). Cloudflare provisions its TLS.

## Flip the site to the pretty URL (only once the above is live)

In `src/lib/experiments.ts`, point the install helpers at the new host (the
pretty URL uses the experiment **id**, not the repo name):

```ts
const sh = (id: string) => `curl -fsSL https://get.univerlab.org/${id} | sh`;
const ps = (id: string) => `irm https://get.univerlab.org/${id}.ps1 | iex`;
// pass the id (e.g. 'canopy') instead of the repo ('harness-canopy')
```

Until then the site keeps showing the direct GitHub URLs, which keep working.

## Hardening (optional, later)

- Pin installs to a release tag instead of `main`: set `REF` in `src/index.ts`.
  Keeping it current would mean an Action bumping `REF` on each release — skip
  until it matters.
- Publish checksums next to releases so users can verify what `| sh` ran.
