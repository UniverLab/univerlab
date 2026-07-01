/** Experiment registry — shared metadata only. Narrative copy lives in the
 *  i18n dictionary; each experiment page is handcrafted, not template-driven. */
import type { ExperimentId } from '../i18n/en';
export type { ExperimentId };

export type Status = 'active' | 'beta' | 'research';
export type BgTheme =
  | 'cosmic'
  | 'brain'
  | 'primitives'
  | 'starfield'
  | 'forge'
  | 'gitgraph'
  | 'scaffold'
  | 'drift';

export interface Experiment {
  id: ExperimentId;
  name: string;
  number: string;
  status: Status;
  /** Essence color hex — drives the `--essence` CSS var and the canvas/OG,
   *  which can't read CSS custom properties. */
  essenceHex: string;
  github: string;
  bg: BgTheme;
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
}

// Install commands go through the `get.univerlab.org` redirector worker (see
// workers/get) — a clean, memorable URL that 302s to each repo's real script.
// `slug` is the experiment id (the worker maps it to the repo).
const sh = (slug: string) => `curl -fsSL https://get.univerlab.org/${slug} | sh`;
const ps = (slug: string) => `irm https://get.univerlab.org/${slug}.ps1 | iex`;
/** Unix-only installer (no PowerShell script published). */
const unix = (slug: string) => ({ unix: sh(slug) });
/** Cross-platform installer (both shell and PowerShell scripts published). */
const both = (slug: string) => ({ unix: sh(slug), windows: ps(slug) });

export const experiments: Experiment[] = [
  { id: 'canopy', name: 'Harness Canopy', number: 'EXP-001', status: 'active', essenceHex: '#5dd39e', github: 'https://github.com/UniverLab/harness-canopy', bg: 'brain', surface: 'tui', install: unix('canopy'), hasDocs: true },
  { id: 'texforge', name: 'TexForge', number: 'EXP-002', status: 'active', essenceHex: '#e0a458', github: 'https://github.com/UniverLab/texforge', bg: 'forge', surface: 'paper', install: both('texforge'), hasDocs: true },
  { id: 'gitkit', name: 'GitKit', number: 'EXP-003', status: 'active', essenceHex: '#d977a8', github: 'https://github.com/UniverLab/gitkit', bg: 'gitgraph', surface: 'vcs', install: both('gitkit'), hasDocs: true, demo: '/demos/gitkit.mp4' },
  { id: 'ghscaff', name: 'ghScaff', number: 'EXP-004', status: 'active', essenceHex: '#7ee081', github: 'https://github.com/UniverLab/ghscaff', bg: 'scaffold', surface: 'scaffold', install: both('ghscaff'), hasDocs: true, demo: '/demos/ghscaff.mp4' },
  { id: 'cadspec', name: 'cadSpec', number: 'EXP-005', status: 'beta', essenceHex: '#6ec6e6', github: 'https://github.com/UniverLab/cadspec', bg: 'primitives', surface: 'blueprint', install: both('cadspec'), hasDocs: true },
  { id: 'astro-denoise', name: 'Astro Denoise', number: 'EXP-006', status: 'research', essenceHex: '#a78bfa', github: 'https://github.com/UniverLab', bg: 'starfield', surface: 'observatory' },
  { id: 'demostage', name: 'DemoStage', number: 'EXP-007', status: 'active', essenceHex: '#ef8354', github: 'https://github.com/UniverLab/demostage', bg: 'drift', surface: 'studio', install: both('demostage'), hasDocs: true, demo: '/demos/demostage.gif' },
  { id: 'quorum', name: 'Quorum', number: 'EXP-008', status: 'active', essenceHex: '#c68a2e', github: 'https://github.com/UniverLab/quorum', bg: 'forge', surface: 'quorum', url: 'https://quorum.univerlab.org' },
];

/** Look up an experiment by id, failing fast if the id is unknown. */
export function byId(id: string): Experiment {
  const exp = experiments.find((e) => e.id === id);
  if (!exp) throw new Error(`Unknown experiment id: ${id}`);
  return exp;
}
