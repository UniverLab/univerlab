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
  /** One-line install commands per platform, if the experiment ships a binary.
   *  `windows` is only set when the repo also provides a PowerShell installer. */
  install?: { unix: string; windows?: string };
  /** Whether a docs/ folder exists to build documentation pages from. */
  hasDocs?: boolean;
}

const sh = (repo: string) =>
  `curl -fsSL https://raw.githubusercontent.com/UniverLab/${repo}/main/scripts/install.sh | sh`;
const ps = (repo: string) =>
  `irm https://raw.githubusercontent.com/UniverLab/${repo}/main/scripts/install.ps1 | iex`;
/** Unix-only installer (no PowerShell script published). */
const unix = (repo: string) => ({ unix: sh(repo) });
/** Cross-platform installer (both shell and PowerShell scripts published). */
const both = (repo: string) => ({ unix: sh(repo), windows: ps(repo) });

export const experiments: Experiment[] = [
  { id: 'canopy', name: 'Harness Canopy', number: 'EXP-004', status: 'active', essenceHex: '#5dd39e', github: 'https://github.com/UniverLab/harness-canopy', bg: 'brain', install: unix('harness-canopy'), hasDocs: true },
  { id: 'texforge', name: 'TexForge', number: 'EXP-001', status: 'active', essenceHex: '#e0a458', github: 'https://github.com/UniverLab/texforge', bg: 'forge', install: both('texforge'), hasDocs: true },
  { id: 'gitkit', name: 'GitKit', number: 'EXP-002', status: 'active', essenceHex: '#7ee081', github: 'https://github.com/UniverLab/gitkit', bg: 'gitgraph', install: both('gitkit'), hasDocs: true },
  { id: 'ghscaff', name: 'ghScaff', number: 'EXP-003', status: 'active', essenceHex: '#7ee081', github: 'https://github.com/UniverLab/ghscaff', bg: 'scaffold', install: both('ghscaff'), hasDocs: true },
  { id: 'cadforge', name: 'cadForge', number: 'EXP-005', status: 'beta', essenceHex: '#6ec6e6', github: 'https://github.com/UniverLab/cadforge', bg: 'primitives', install: both('cadforge'), hasDocs: true },
  { id: 'astro-denoise', name: 'Astro Denoise', number: 'EXP-006', status: 'research', essenceHex: '#a78bfa', github: 'https://github.com/UniverLab', bg: 'starfield' },
];

/** Look up an experiment by id, failing fast if the id is unknown. */
export function byId(id: string): Experiment {
  const exp = experiments.find((e) => e.id === id);
  if (!exp) throw new Error(`Unknown experiment id: ${id}`);
  return exp;
}
