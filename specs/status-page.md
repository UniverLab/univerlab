# Spec: Status Page — Bitácora de Actividad con SSE

## Spec 1: Worker + KV Infrastructure

### ROLE
You are a Cloudflare Workers engineer. You deploy Workers and manage KV namespaces.

### WHAT
Create a Cloudflare Worker at `announcements.univerlab.org` that:
- `GET /` returns all entries from KV as JSON array `[{ id, date, title, body, type }]`
- `GET /events` opens an SSE stream, pushes `event: entry` when new content arrives
- `PUT /` adds a new entry to KV and broadcasts to all connected SSE clients
- `PUT /` is protected with `Authorization: Bearer <token>` header
- KV namespace `announcements` is created and bound to the Worker

Acceptance criteria:
- `curl GET /` returns valid JSON array
- `curl -X PUT -H "Authorization: Bearer <token>" -d '{"title":"test","body":"testing","type":"update"}'` adds entry and broadcasts
- SSE stream stays open and receives events on PUT
- Build passes with `wrangler deploy`

### HOW
1. Run `wrangler kv:namespace create announcements` — note the namespace ID
2. Create `workers/announcements/wrangler.toml`:
   ```toml
   name = "univerlab-announcements"
   main = "src/index.ts"
   compatibility_date = "2025-01-01"

   [[kv_namespaces]]
   binding = "ANNOUNCEMENTS"
   id = "<namespace-id>"

   [routes]
   pattern = "announcements.univerlab.org"
   custom_domain = true
   ```
3. Create `workers/announcements/src/index.ts` with:
   - `GET /` handler: read `entries` key from KV, return JSON
   - `GET /events` handler: create SSE stream, store controller in Map, keep alive with `:ping\n\n` every 30s
   - `PUT /` handler: validate Bearer token (read from KV `auth_token` key), parse body, append to entries array, write back to KV, iterate all SSE controllers and enqueue new entry
   - CORS headers for `https://univerlab.org`
4. Seed initial data:
   ```bash
   wrangler kv:put --binding=ANNOUNCEMENTS "entries" '[]'
   wrangler kv:put --binding=ANNOUNCEMENTS "auth_token" "<generate-secure-token>"
   ```
5. Deploy: `cd workers/announcements && wrangler deploy`
6. Verify:
   ```bash
   curl https://announcements.univerlab.org/
   curl -X PUT -H "Authorization: Bearer <token>" \
     -d '{"title":"init","body":"system ready","type":"update"}' \
     https://announcements.univerlab.org/
   ```

---

## Spec 2: Frontend Status Page

### ROLE
You are an Astro frontend developer. You build pages with the circadian system and space mission log aesthetic.

### WHAT
Create `/status` page that:
- Fetches entries from `https://announcements.univerlab.org` on page load
- Connects to SSE stream for real-time updates
- Displays entries as a vertical timeline with monospace mission-log styling
- Shows toast notification when new entry arrives via SSE
- Uses `bg="cosmic"` circadian background (like `/archive`)
- Skeleton loading state while fetching
- Scroll-driven fade-in animation (like archive tombstones)

Acceptance criteria:
- Page renders at `/status`
- Entries load from Worker on page visit
- SSE connection established, new entries prepend to timeline
- Toast appears bottom-right for 4 seconds on new entry
- No i18n — English only
- `npm run build` passes clean

### HOW
1. Create `src/pages/status.astro`:
   ```astro
   ---
   import BaseLayout from '../layouts/BaseLayout.astro';
   ---
   <BaseLayout title="Mission Log — UniverLab" description="Real-time activity from UniverLab experiments." bg="cosmic" circadian>
     <section class="wrap log">
       <span class="label">MISSION LOG</span>
       <h1>Status</h1>
       <p class="intro">Real-time activity from UniverLab experiments and tools.</p>
       <div id="log-entries">
         <article class="entry skeleton"><time></time><div class="entry-body"></div></article>
       </div>
     </section>
   </BaseLayout>
   ```
2. Add `<style>` block with:
   - `.log` — padding, max-width container
   - `.log h1` — mono font, uppercase, letter-spacing 0.08em
   - `.entry` — grid: `7rem 1fr`, border-bottom, padding-block 1.8rem
   - `.entry time` — mono, 0.78rem, ink-faint
   - `.entry h3` — mono, 0.95rem, ink
   - `.entry p` — ink-dim, 0.9rem, line-height 1.6
   - `.skeleton` — pulse animation placeholder
   - `.toast` — fixed bottom-right, border essence, mono 0.82rem, fade-in/out animation
   - `@supports (animation-timeline: view())` — scroll-driven step-rise on `.entry`
3. Add `<script>` block with:
   - `fetch('https://announcements.univerlab.org')` → parse JSON → render entries
   - `new EventSource('https://announcements.univerlab.org/events')` → listen for `entry` events → prepend entry + show toast
   - `renderEntries(entries)` function — creates article elements
   - `prependEntry(entry)` function — inserts at top of `#log-entries`
   - `showToast(title)` function — creates toast element, auto-removes after 4s
4. Verify `npm run build` passes

---

## Spec 3: Nav Integration

### ROLE
You are a frontend developer working on the UniverLab header component.

### WHAT
Add "Log" command to the command palette and a "Log" link to the navigation.

Acceptance criteria:
- Typing `/log` in command palette navigates to `/status`
- "Log" link appears in header nav (desktop + mobile)
- Build passes

### HOW
1. In `src/layouts/BaseLayout.astro`, find `staticCmds` array (~line 596), add:
   ```js
   { cmd: '/log', label: 'Mission Log', href: base + '/status' },
   ```
2. In `src/i18n/en.ts`, add to `nav` object:
   ```ts
   log: 'Log',
   ```
3. In `src/i18n/es.ts`, add to `nav` object:
   ```ts
   log: 'Log',
   ```
4. In `src/components/Header.astro`, add nav link alongside existing items
5. Verify `npm run build` passes
