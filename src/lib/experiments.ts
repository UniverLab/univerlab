/** Experiment registry — shared metadata only. Narrative copy lives in the
 *  i18n dictionary; each experiment page is handcrafted, not template-driven. */
import type { ExperimentId } from '../i18n/en';
export type { ExperimentId };

export type Status = 'active' | 'beta' | 'research';
/** The lab tools that made an experiment — ids of experiments whose tools built this one.
 *  Only the four with verified evidence (see `builtWith` below) exist here. */
export type BuiltWith = 'canopy' | 'ghscaff' | 'demostage' | 'gitkit';
export type BgTheme =
  | 'cosmic'
  | 'brain'
  | 'primitives'
  | 'starfield'
  | 'forge'
  | 'scaffold'
  | 'bubbles'
  | 'takes'
  | 'spiral';

export interface Experiment {
  id: ExperimentId;
  name: string;
  number: string;
  status: Status;
  /** Essence color hex — paints fills, dots, borders and anything on a
   *  dark background. `essenceTextHex` paints text and thin strokes on the
   *  experiment's own light page, chosen for ≥ 4.5:1 contrast. Drives the
   *  `--essence` CSS var and the canvas/OG, which can't read CSS custom
   *  properties. */
  essenceHex: string;
  /** Text ink for the experiment's own light page — text and 1px strokes
   *  only, chosen for ≥ 4.5:1 contrast against its `--surface-bg`. Fills,
   *  dots and large shapes keep `essenceHex`. Omitted → `essenceHex`. */
  essenceTextHex?: string;
  github: string;
  bg: BgTheme;
  /** Hero ASCII motif of the experiment's own page — what the home card window
   *  shows and the hero-mark slot renders. '@i18n' = resolved from the
   *  translations dictionary (language-dependent motifs live there, not here). */
  motif: string;
  /** First commit date (YYYY-MM-DD). Shown in genesis section as "TERRA YYYY · Mon DD". */
  startDate?: string;
  /** Fixed visual surface (data-surface on <html>) for the page + its docs.
   *  Omitted → the default dark lab theme. */
  surface?: string;
  /** One-line install commands per platform, if the experiment ships a binary.
   *  `windows` is only set when the repo also provides a PowerShell installer. */
  install?: { unix: string; windows?: string };
  /** Whether a docs/ folder exists to build documentation pages from. */
  hasDocs?: boolean;
  /** Path to a short screen-recording demo (mp4), shown as "Fig. 1" on the
   *  landing and behind the hero "Watch demo" button. Set to e.g.
   *  '/demos/gitkit.mp4' once recorded; until then both stay hidden. */
  demo?: string;
  /** External app URL for experiments that ship as a hosted web app instead of
   *  (or in addition to) a CLI. Shown as a "Launch app" CTA on the hero. */
  url?: string;
  /** Opt into the circadian palette — the page shifts between day/night
   *  automatically via the /theme command's circadian engine. */
  circadian?: boolean;
  /** Surface-specific circadian palette endpoints. When set, overrides the
   *  default circadian palettes so the surface keeps its own colour identity
   *  across day/night. `day` and `night` each hold the full CSS-var map. */
  circadianPalette?: {
    day: Record<string, string>;
    night: Record<string, string>;
  };
  /** The thread — problem → method → artifact — one small line of shared lab semantics.
   *  Copy is narrative, so the strings live in the i18n dictionaries (the '@i18n' marker
   *  follows `motif`'s convention): `t.experiments[id].thread` = { problem, method,
   *  artifact }, present in en and es. Rendered on the home card (under the tagline) and
   *  the experiment page (under the hero lede). */
  thread: '@i18n';
  /** Which tools of the lab made this experiment. Relations verified 2026-09-29 against
   *  four evidence sources: Canopy's completed graphs built harness-canopy, texforge,
   *  gitkit, ghscaff, demostage and this site (per repo); DemoStage recorded the published
   *  demos of canopy, texforge, gitkit, ghscaff and demostage (public/demos/*.mp4); GitKit
   *  hooks (conventional-commits, no-body, no-trailers, no-invisibles) guard commits in
   *  all eight repos; ghScaff created or configured every repository — the user (2026-09-29):
   *  all but canopy and texforge were created with it, those two configured with it
   *  afterwards — corroborated by ghScaff's standard label set (breaking-change,
   *  target:develop, target:main) and protected main on all nine repos including univerlab
   *  and canopy-registry. Only add a relation with evidence of that kind. */
  builtWith: BuiltWith[];
}

// Install commands go through the redirector worker (see workers/get) — a
// clean, memorable URL that 302s to each repo's real script. `slug` is the
// experiment id (the worker maps it to the repo).
//
// The worker answers on two hostnames. `install` is the one shown here
// because a command that pipes a script into a shell should say out loud
// what it is about to do. `get.univerlab.org` is the same Worker, not a
// redirect to this one, and it keeps working — it is in published skills,
// READMEs and people's shell history, so it never goes away.
const sh = (slug: string) => `curl -fsSL https://install.univerlab.org/${slug} | sh`;
const ps = (slug: string) => `irm https://install.univerlab.org/${slug}.ps1 | iex`;
/** Unix-only installer (no PowerShell script published). */
const unix = (slug: string) => ({ unix: sh(slug) });
/** Cross-platform installer (both shell and PowerShell scripts published). */
const both = (slug: string) => ({ unix: sh(slug), windows: ps(slug) });

export const experiments: Experiment[] = [
  { id: 'canopy', name: 'Canopy', number: 'EXP-001', status: 'active', essenceHex: '#00a9a0', github: 'https://github.com/UniverLab/harness-canopy', bg: 'brain', motif: '⠿⠶⠦⠤ · ⠤⠦⠶⠿', surface: 'tui', startDate: '2026-03-20', install: unix('canopy'), hasDocs: true, demo: '/demos/canopy.mp4', thread: '@i18n', builtWith: ['canopy', 'ghscaff', 'demostage', 'gitkit'] },
  { id: 'texforge', name: 'TeXForge', number: 'EXP-002', status: 'active', essenceHex: '#d34e5b', essenceTextHex: '#87222c', github: 'https://github.com/UniverLab/texforge', bg: 'forge', motif: '.tex ──→ lint ──→ typeset ──→ PDF', surface: 'paper', startDate: '2026-03-28', install: both('texforge'), hasDocs: true, demo: '/demos/texforge.mp4', thread: '@i18n', builtWith: ['canopy', 'ghscaff', 'demostage', 'gitkit'] },
  { id: 'gitkit', name: 'GitKit', number: 'EXP-003', status: 'active', essenceHex: '#e06fc0', essenceTextHex: '#d12da2', github: 'https://github.com/UniverLab/gitkit', bg: 'bubbles', motif: 'o──o──◆ origin/main · 3 hooks · idempotent', surface: 'pastel', startDate: '2026-04-01', install: both('gitkit'), hasDocs: true, demo: '/demos/gitkit.mp4', thread: '@i18n', builtWith: ['canopy', 'ghscaff', 'demostage', 'gitkit'] },
  { id: 'ghscaff', name: 'ghScaff', number: 'EXP-004', status: 'active', essenceHex: '#62c4ec', github: 'https://github.com/UniverLab/ghscaff', bg: 'scaffold', motif: '+--+ 07 lifts · idempotent +--+', surface: 'industrial', startDate: '2026-04-03', install: both('ghscaff'), hasDocs: true, demo: '/demos/ghscaff.mp4', thread: '@i18n', builtWith: ['canopy', 'ghscaff', 'demostage', 'gitkit'] },
  { id: 'cadspec', name: 'cadSpec', number: 'EXP-005', status: 'beta', essenceHex: '#4874ea', essenceTextHex: '#3f6de9', github: 'https://github.com/UniverLab/cadspec', bg: 'primitives', motif: '@i18n', surface: 'blueprint', startDate: '2026-04-10', install: both('cadspec'), hasDocs: true, thread: '@i18n', builtWith: ['ghscaff', 'gitkit'] },
  { id: 'astro-denoise', name: 'Astro Denoise', number: 'EXP-006', status: 'research', essenceHex: '#a78bfa', github: 'https://github.com/UniverLab', bg: 'starfield', motif: '⁘∴⁙∵ ──∿──→ · ✦ ·', surface: 'observatory', startDate: '2026-04-10', thread: '@i18n', builtWith: [] },
  { id: 'demostage', name: 'DemoStage', number: 'EXP-007', status: 'active', essenceHex: '#fa5838', github: 'https://github.com/UniverLab/demostage', bg: 'takes', motif: '▶──●────●───□', surface: 'studio', startDate: '2026-06-18', install: both('demostage'), hasDocs: true, demo: '/demos/demostage.mp4', thread: '@i18n', builtWith: ['canopy', 'ghscaff', 'demostage', 'gitkit'] },
  { id: 'quorum', name: 'Quorum', number: 'EXP-008', status: 'active', essenceHex: '#e6b24a', github: 'https://github.com/UniverLab/quorum', bg: 'spiral', motif: '○──◇──○', surface: 'quorum', startDate: '2026-06-30', url: 'https://quorum.univerlab.org', circadian: true, thread: '@i18n', builtWith: ['ghscaff', 'gitkit'],
    circadianPalette: {
      day:   { '--bg': '#f0e8da', '--bg-raise': '#f7f2e8', '--ink': '#3a2a1a', '--ink-dim': '#7a6a52', '--ink-faint': '#a89878', '--line': '#ddd2c0', '--accent': '#e6b24a', '--canvas-color': '#e6b24a', '--canvas-mute': '#c4b8a0' },
      night: { '--bg': '#241a12', '--bg-raise': '#2f2318', '--ink': '#f2e7d3', '--ink-dim': '#b8a583', '--ink-faint': '#8a7a5e', '--line': '#40331f', '--accent': '#e6b24a', '--canvas-color': '#e6b24a', '--canvas-mute': '#5a4a32' },
    },
  },
];

/** Look up an experiment by id, failing fast if the id is unknown. */
export function byId(id: string): Experiment {
  const exp = experiments.find((e) => e.id === id);
  if (!exp) throw new Error(`Unknown experiment id: ${id}`);
  return exp;
}
