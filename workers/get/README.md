# get.univerlab.org

A tiny Cloudflare Worker that gives the install commands a clean URL:

```sh
curl -fsSL https://get.univerlab.org/canopy | sh      # macOS / Linux
irm https://get.univerlab.org/texforge.ps1 | iex      # Windows
```

It **only 302-redirects** to each repo's real script on GitHub
(`raw.githubusercontent.com/UniverLab/<repo>/main/scripts/install.{sh,ps1}`).
No proxying, no counting, no database — GitHub stays the download origin and the
trust anchor; this Worker is just a prettier doorway. `curl -fsSL` and
`irm | iex` both follow the redirect transparently.

The tool → repo map (and which platforms each ships) lives in `src/index.ts`.

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
