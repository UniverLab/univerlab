/** The experiment registry. Each experiment owns a handcrafted landing page
 *  with its own identity — these entries only carry shared metadata. */
export interface Experiment {
  id: string;
  name: string;
  /** What need it was born from — every experiment starts with a real need. */
  need: string;
  tagline: string;
  status: 'active' | 'beta' | 'research';
  /** CSS custom property holding the experiment's essence color. */
  essence: string;
  github: string;
  number: string;
}

export const experiments: Experiment[] = [
  {
    id: 'canopy',
    name: 'Canopy',
    number: 'EXP-004',
    need: 'AI agents forget everything and work blind to each other.',
    tagline: 'An agent operations center: orchestration, memory, and coordination for AI sessions.',
    status: 'active',
    essence: 'var(--canopy)',
    github: 'https://github.com/UniverLab/harness-canopy',
  },
  {
    id: 'texforge',
    name: 'Texforge',
    number: 'EXP-001',
    need: 'Writing LaTeX should not require installing four gigabytes of toolchain.',
    tagline: 'A unified LaTeX workspace — writing, diagrams, and PDFs in one self-contained tool.',
    status: 'active',
    essence: 'var(--texforge)',
    github: 'https://github.com/UniverLab/texforge',
  },
  {
    id: 'gitkit',
    name: 'Gitkit',
    number: 'EXP-002',
    need: 'Every new repository repeats the same setup ritual, by hand.',
    tagline: 'Guided git repository setup — hooks, ignores, attributes, and config in one flow.',
    status: 'active',
    essence: 'var(--gitkit)',
    github: 'https://github.com/UniverLab/gitkit',
  },
  {
    id: 'ghscaff',
    name: 'Ghscaff',
    number: 'EXP-003',
    need: 'Creating a GitHub repository properly is a dozen forgettable steps.',
    tagline: 'An interactive wizard that scaffolds and enforces conventions on GitHub repositories.',
    status: 'active',
    essence: 'var(--gitkit)',
    github: 'https://github.com/UniverLab/ghscaff',
  },
  {
    id: 'cadforge',
    name: 'Cadforge',
    number: 'EXP-005',
    need: 'Architectural plans are drawings without semantics — impossible to diff or automate.',
    tagline: 'Architecture as Code: declarative 2D CAD compiled deterministically to DXF.',
    status: 'beta',
    essence: 'var(--cadforge)',
    github: 'https://github.com/UniverLab/cadforge',
  },
  {
    id: 'astro-denoise',
    name: 'Astro Denoise',
    number: 'EXP-006',
    need: 'Telescope surveys drown faint galaxies in sensor noise.',
    tagline: 'Denoising benchmark research on DESC DC2 / LSST astronomical data.',
    status: 'research',
    essence: 'var(--astro-denoise)',
    github: 'https://github.com/UniverLab',
  },
];
