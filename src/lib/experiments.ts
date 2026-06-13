/** Experiment registry — shared metadata only. Narrative copy lives in the
 *  i18n dictionary; each experiment page is handcrafted, not template-driven. */
export type Status = 'active' | 'beta' | 'research';
export type BgTheme = 'cosmic' | 'brain' | 'primitives' | 'starfield' | 'drift';

export interface Experiment {
  id: string;
  name: string;
  number: string;
  status: Status;
  /** CSS custom property name holding the essence color. */
  essenceVar: string;
  /** Resolved hex of the essence color (for canvas, which can't read vars). */
  essenceHex: string;
  github: string;
  bg: BgTheme;
  /** One-line install command, if the experiment ships a binary. */
  install?: string;
  /** Whether a docs/ folder exists to build documentation pages from. */
  hasDocs?: boolean;
}

const installer = (repo: string) =>
  `curl -fsSL https://raw.githubusercontent.com/UniverLab/${repo}/main/scripts/install.sh | sh`;

export const experiments: Experiment[] = [
  { id: 'canopy', name: 'Canopy', number: 'EXP-004', status: 'active', essenceVar: '--canopy', essenceHex: '#5dd39e', github: 'https://github.com/UniverLab/harness-canopy', bg: 'brain', install: installer('harness-canopy'), hasDocs: true },
  { id: 'texforge', name: 'Texforge', number: 'EXP-001', status: 'active', essenceVar: '--texforge', essenceHex: '#e0a458', github: 'https://github.com/UniverLab/texforge', bg: 'drift', install: installer('texforge'), hasDocs: true },
  { id: 'gitkit', name: 'Gitkit', number: 'EXP-002', status: 'active', essenceVar: '--gitkit', essenceHex: '#7ee081', github: 'https://github.com/UniverLab/gitkit', bg: 'drift', install: installer('gitkit'), hasDocs: true },
  { id: 'ghscaff', name: 'Ghscaff', number: 'EXP-003', status: 'active', essenceVar: '--gitkit', essenceHex: '#7ee081', github: 'https://github.com/UniverLab/ghscaff', bg: 'drift', install: installer('ghscaff'), hasDocs: true },
  { id: 'cadforge', name: 'Cadforge', number: 'EXP-005', status: 'beta', essenceVar: '--cadforge', essenceHex: '#6ec6e6', github: 'https://github.com/UniverLab/cadforge', bg: 'primitives', install: installer('cadforge'), hasDocs: true },
  { id: 'astro-denoise', name: 'Astro Denoise', number: 'EXP-006', status: 'research', essenceVar: '--astro-denoise', essenceHex: '#a78bfa', github: 'https://github.com/UniverLab', bg: 'starfield' },
];

/** Repo folder name (differs from id only for canopy). */
export const repoOf: Record<string, string> = {
  canopy: 'harness-canopy',
  texforge: 'texforge',
  gitkit: 'gitkit',
  ghscaff: 'ghscaff',
  cadforge: 'cadforge',
};

export const byId = (id: string) => experiments.find((e) => e.id === id)!;
