<h1 align="center">UniverLab — landing</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Astro-static-FF5D01?style=for-the-badge&logo=astro&logoColor=white" alt="Astro"/>
  <img src="https://img.shields.io/badge/i18n-EN%20%C2%B7%20ES-5dd39e?style=for-the-badge" alt="i18n"/>
  <img src="https://img.shields.io/badge/host-Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare Pages"/>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2E8B57?style=for-the-badge" alt="License"/></a>
</p>

The public site for UniverLab (→ univerlab.org): an Astro static site, bilingual
(EN at the root, ES under `/es`), that aggregates the lab's experiments, their
documentation, the manifesto, and the collaborators.

---

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # static build into dist/  (also the CI/Pages check)
```

Docs are globbed at build time from the **sibling repos'** `docs/` folders
(`../texforge/docs`, …), so a full build expects those repos checked out next to
this one.

---

## How it fits together

| Concern | Where |
|---|---|
| Experiment registry (ids, colors, install, bg) | `src/lib/experiments.ts` |
| Copy — single source of truth, mirrored EN/ES | `src/i18n/en.ts` · `src/i18n/es.ts` |
| Per-experiment pages (handcrafted) | `src/views/experiments/*.astro` |
| Routes (thin shells → views) | `src/pages/*.astro` · `src/pages/es/*.astro` |
| Essence colors | `src/styles/global.css` |
| Themed canvas backgrounds | `src/scripts/backgrounds.ts` |
| Hero ASCII banners | `src/lib/banners.ts` |
| Docs collections (one per experiment) | `src/content.config.ts` |
| `get.univerlab.org` redirector | `workers/get/` |

Experiments live at **flat root URLs** (`/canopy`, `/texforge`, …), with docs at
`/<id>/docs`. Copy is the source of truth: `en.ts` defines the shape
(`type Dict = typeof en`) and `es.ts` (`es: Dict`) must mirror **every** key or
the build fails.

---

## Add a new experiment to the landing

Example: a tool with id `widgetforge`, repo `UniverLab/widgetforge`.

1. **Register it** — add a row to `src/lib/experiments.ts`:
   ```ts
   { id: 'widgetforge', name: 'WidgetForge', number: 'EXP-007', status: 'beta',
     essenceHex: '#c98aa0', github: 'https://github.com/UniverLab/widgetforge',
     bg: 'drift', install: both('widgetforge'), hasDocs: true },
   ```
   `install`: `both('repo')` (sh + ps1), `unix('repo')` (sh only), or omit it
   (research, no binary).

2. **Essence color** — add the same hex as a variable in `src/styles/global.css`:
   ```css
   --widgetforge: #c98aa0;
   ```

3. **Copy, in both languages** — add an `experiments.widgetforge` block to
   **`src/i18n/en.ts` and `src/i18n/es.ts`**. The hero/genesis need at least
   `need`, `tagline`, `koan`, `lede`, and `genesis: { kicker, title, body }`;
   add any extra keys your page reads. Keys must exist in both files.

4. **Page** — create `src/views/experiments/WidgetForge.astro`:
   ```astro
   ---
   import ExperimentLayout from '../../layouts/ExperimentLayout.astro';
   import { getLang, useTranslations } from '../../i18n';
   const e = useTranslations(getLang(Astro.url)).experiments.widgetforge;
   ---
   <ExperimentLayout id="widgetforge">
     <!-- custom sections; the layout renders hero + install + genesis -->
   </ExperimentLayout>
   ```

5. **Routes** — two thin shells:
   - `src/pages/widgetforge.astro` → `import V from '../views/experiments/WidgetForge.astro'; <V />`
   - `src/pages/es/widgetforge.astro` → `import V from '../../views/experiments/WidgetForge.astro'; <V />`

6. **Docs** *(if `hasDocs: true`)* — the repo needs a `docs/` folder of `.md`
   with frontmatter `{ title, description?, order }`. Register the collection in
   `src/content.config.ts`:
   ```ts
   'docs-widgetforge': docsCollection('../widgetforge/docs'),
   ```
   The `/widgetforge/docs` routes generate automatically from the registry.

7. **Install URL** *(if it ships a binary)* — the repo needs
   `scripts/install.sh` (+ `scripts/install.ps1` for Windows). Add the
   tool → repo entry to `workers/get/src/index.ts` so `get.univerlab.org/widgetforge`
   resolves.

8. **Command palette** — add the experiment ID to the `experimentIds` array in
   `src/layouts/BaseLayout.astro` (inside the command palette script). This
   makes `/widgetforge` available in the palette automatically.

9. **Optional polish** — an ASCII banner in `src/lib/banners.ts` (keyed by id),
   and/or a new background runner in `src/scripts/backgrounds.ts` (add its name
   to the `BgTheme` union in `experiments.ts`).

10. **Verify** — `npm run build`. It builds every page and enforces EN/ES parity.

---

## Keyboard shortcuts

The landing is navigable via keyboard, inspired by Canopy's TUI navigation.

| Shortcut | Action |
|---|---|
| `↑` / `↓` | Jump between sections and cards on the page |
| `Shift+↑` | Previous experiment or doc |
| `Shift+↓` | Next experiment or doc |
| `Shift+←` | Go back (browser history) |
| `Shift+→` | Go forward (browser history) |
| `Enter` | Follow the focused card link |
| `Esc` | Close active overlay |
| `/` | Open command palette |
| `?` | Open help / command list |

### Command palette

Press `/` to open a terminal-style command palette (dark, monospace, transparent).
Commands are auto-generated from experiment IDs in `experiments.ts`.

- **Tab** — autocomplete to the selected command
- **↑↓** — navigate the command list
- **Enter** — execute the selected command
- **Esc** — close the palette

Built-in commands: `/home`, `/experiments`, `/manifesto`, `/contributors`, `/github`, `/docs`, `/find`, `/faq`, `/theme`.
Theme submenu: `/theme` → Light, Dark, Auto (circadian).
Each experiment also gets a `/<id>` command (e.g. `/canopy`, `/texforge`).

To add a new experiment command: add its ID to the `experimentIds` array in
`src/layouts/BaseLayout.astro` (step 8 in the checklist above).

---

## Deploy

- **Site** → Cloudflare Pages (`univerlab` project), connected to this repo
  (build `npm run build`, output `dist`). Auto-deploys on push to `main`.
- **Demos** → MP4s in `public/demos/` are committed to the repo and served as
  static assets by Astro. Record with `demo record` + `demo export --format mp4`,
  drop in `public/demos/<id>.mp4`, set `demo` in `experiments.ts`.
- **`get.univerlab.org`** → the Worker in `workers/get/`, deployed by the
  **Deploy get worker** Action when `workers/get/**` changes. See its README.
