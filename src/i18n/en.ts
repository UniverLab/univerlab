/** English copy. Single source of truth for all UI text.
 *  Documentation pulled from repositories stays English-only and is not
 *  part of this dictionary. */
export const en = {
  meta: {
    description:
      'UniverLab — an independent computational laboratory publishing open experiments.',
  },
  nav: {
    experiments: 'Experiments',
    research: 'Research',
    manifesto: 'Manifesto',
    people: 'People',
    github: 'GitHub',
  },
  footer: {
    quote:
      '“We are the eyes of the universe opening after a long sleep. Our work is to create, care, and understand.”',
    license: 'MIT-licensed experiments',
  },
  common: {
    repo: 'GitHub ↗',
    docs: 'Documentation →',
    install: 'Install',
    copy: 'Copy',
    copied: 'Copied',
    allExperiments: 'All experiments →',
    inPreparation: 'in preparation',
    docsHome: 'Documentation',
    onThisExperiment: 'Experiment',
  },
  status: {
    active: 'active',
    beta: 'beta',
    research: 'research',
  },
  home: {
    hero: {
      title: 'An independent computational laboratory.',
      lede:
        'UniverLab designs, builds and publishes <strong>open experiments</strong>. Every experiment begins with a real need and produces open knowledge — tools, libraries, datasets, papers. The experiment is the project; artifacts are its outputs.',
      tagline: 'SCI · CLI · BIO — direction, not scope',
    },
    lineage: {
      kicker: '00 — Origin',
      title: 'It began with one experiment that learned to build the others.',
      body:
        'This is not a collection of repositories. The lab started as a handful of skills for everyday work; one of them grew into <a href="/experiments/canopy">Canopy</a>, an agent system that — from very early on — was used to build Canopy itself and every experiment that followed. The tools here are not separate products. They are the lab building its own instruments.',
    },
    experiments: { kicker: '01 — Experiments' },
    philosophy: {
      kicker: '02 — Philosophy',
      title: 'Technology is not the goal.',
      body:
        'The laboratory is guided by <a href="/manifesto">Pensamiento Cósmico</a>: technology as the medium through which curiosity becomes reality. Software should outlive trends. Knowledge should remain open.',
      values: [
        'Open knowledge',
        'Reproducible engineering',
        'Scientific thinking',
        'Simplicity',
        'Long-term thinking',
        'Human–AI collaboration',
      ],
    },
    directions: {
      kicker: '03 — Research directions',
      title: 'Where the lab is looking.',
      now: 'Now',
      next: 'Next',
      nowItems: ['Developer experience', 'CLI design', 'AI-assisted workflows'],
      nextItems: [
        'Computational science',
        'Bioinformatics',
        'Simulation',
        'CAD',
        'Knowledge systems',
      ],
    },
    ethics: {
      kicker: '04 — Ethics',
      title: 'Software as a moral practice.',
      body:
        'We treat software as a moral practice, not only a technical one — a direct reading of the lab’s guiding thought.',
      items: [
        ['Increase human agency', 'Build tools that give people more reach, not more dependency.'],
        ['Prefer transparency', 'Choose transparent systems over black-box convenience.'],
        ['Balance speed with accountability', 'Move fast where it is safe; answer for what we ship.'],
        ['Keep knowledge reproducible', 'Science and engineering must be repeatable to be trusted.'],
      ] as [string, string][],
    },
  },
  experimentsIndex: {
    kicker: 'Index',
    title: 'Experiments',
    intro:
      'The fundamental unit of UniverLab is the experiment. Experiments are not products — they are ongoing explorations. They may mature, remain active for decades, or evolve into new research. Each one begins with a real need.',
  },
  experiments: {
    canopy: {
      need: 'AI agents forget everything and work blind to each other.',
      tagline:
        'An agent operations center: orchestration, memory, and coordination for AI sessions.',
      koan: 'In a forest, the canopy is where the crowns touch — separate trees, one living layer.',
      lede:
        'A self-contained MCP server and terminal UI that turns one machine into an <strong>agent operations center</strong>: sessions in real terminals, background agents on schedules and file events, a knowledge graph that persists what agents learn, and a sync layer so they stop stepping on each other.',
      genesis: {
        kicker: 'Genesis',
        title: 'The one that started it all.',
        body:
          'It began as a folder of skills for everyday work. Then a discovery: agent harnesses had a <strong>headless mode</strong> almost no one talked about. I wrote cron scripts to launch tasks through it — too much for a skill, and the models of the day couldn’t follow the instructions. So it became an MCP called <em>task-trigger</em>. But it ran blind in the background; only the agent could see it. I deprecated that and built a TUI. Feature after feature, a rename later, it became Canopy. From very early on, Canopy was used to build Canopy — and the rest of this lab.',
      },
      layer: {
        kicker: 'The living layer',
        cols: [
          ['It remembers', 'A project-scoped knowledge graph stores facts, patterns and session summaries. Every session starts where the last one ended — agents stop rediscovering the same codebase.'],
          ['It coordinates', 'Agents declare missions, report workspace stability and broadcast messages. The canopy knows the workspace “vibe” before anyone touches a file.'],
          ['It grows identities', 'Seeds are persistent, evolvable agent identities — directives and traits in plain TOML. An agent can refine its own identity over time, like a tree adding rings.'],
        ] as [string, string][],
      },
      tools: {
        kicker: '46 MCP tools',
        items: [
          ['Agent management', 12],
          ['Workflow engine', 15],
          ['Intelligence graph', 6],
          ['Seed identities', 5],
          ['Multi-agent sync', 4],
          ['Projects · RAG · Protocol', 4],
        ] as [string, number][],
      },
    },
    texforge: {
      need: 'Writing LaTeX should not require installing four gigabytes of toolchain.',
      tagline:
        'A unified LaTeX workspace — writing, diagrams, and PDFs in one self-contained tool.',
      koan: 'Movable type once took a workshop. Now it takes one binary.',
      lede:
        'A single Rust binary that scaffolds, lints, formats and compiles documents — the LaTeX engine arrives by itself on first build, and Mermaid or Graphviz diagrams render inside your <code>.tex</code> files with no browser and no Node.js.',
      genesis: {
        kicker: 'Genesis',
        title: 'Born from a thesis.',
        body:
          'A master’s thesis, written with AI assistance. Overleaf and I never got along, and TeXstudio meant a heavy MiKTeX install; VSCode meant an extension stack. I wanted Mermaid diagrams — declarative, the way models think — but that dragged in Node and <code>.mmd</code> files. I wrote a latexmake that rendered missing diagrams on demand. It worked, barely: too many dependencies, and to find a single error the model had to read the enormous LaTeX build log. Texforge is what I wished existed: one binary, one skill, near-zero friction.',
      },
      press: {
        kicker: 'The whole press',
        items: [
          ['Compose', 'templates with placeholders that already know your name.'],
          ['Proof', 'a linter that catches broken refs, missing files and unclosed environments before the press runs.'],
          ['Set', 'one canonical format, like rustfmt for .tex. Clean diffs forever.'],
          ['Illustrate', 'Mermaid and Graphviz blocks become figures at build time, rendered in pure Rust.'],
          ['Print', 'Tectonic compiles deterministically; watch mode reprints as you write.'],
        ] as [string, string][],
      },
      subproject: {
        kicker: 'Subproject',
        name: 'texforge-templates',
        body:
          'An open registry of LaTeX templates with placeholders — APA, IEEE, reports, letters and more. The <code>general</code> template ships embedded in the binary so creating a document works even offline.',
        link: 'https://github.com/UniverLab/texforge-templates',
      },
    },
    gitkit: {
      need: 'Every new repository repeats the same setup ritual, by hand.',
      tagline:
        'Guided git repository setup — hooks, ignores, attributes, and config in one flow.',
      koan: '// the ritual, automated',
      lede:
        'One guided flow for hooks, <code>.gitignore</code>, <code>.gitattributes</code> and git config — then saved as a <strong>build</strong> you can re-apply to any project with a single command.',
      genesis: {
        kicker: 'Genesis',
        title: 'A line-ending that wouldn’t behave.',
        body:
          'Work Mac, home Windows, agents on WSL. Commits kept going through that changed nothing but line endings — Windows quietly rewriting them. Fixing it led me to <code>.gitattributes</code>, and that rabbit hole led to git hooks: powerful, built in, and almost nobody uses them, because setting them up in every repo is a chore. Gitkit makes the chore disappear.',
      },
      features: {
        kicker: 'One flow',
        items: [
          'Built-in hooks: conventional commits, secret detection, branch naming — embedded, offline.',
          'Every gitignore.io template plus curated git config presets, applied idempotently.',
          '<code>gitkit clone</code> bootstraps a repo the moment it lands on disk.',
          'Builds: save a setup once, apply it to every future project.',
        ],
      },
    },
    ghscaff: {
      need: 'Creating a GitHub repository properly is a dozen forgettable steps.',
      tagline:
        'An interactive wizard that scaffolds and enforces conventions on GitHub repositories.',
      koan: 'A building is only as straight as its scaffold.',
      lede:
        'Creating a repository properly is a dozen forgettable steps. Ghscaff raises the whole structure in one conversational wizard — and because every operation is <strong>idempotent</strong>, it can re-level any existing repository without tearing it down.',
      genesis: {
        kicker: 'Genesis',
        title: 'The same setup, again and again.',
        body:
          'Several Rust projects, the same GitHub setup each time — labels, branch protection, CI, secrets. Replicable work done by hand is just toil. Ghscaff turns the ritual into one wizard, and makes it idempotent so the conventions never drift.',
      },
      lifts: {
        kicker: 'Seven lifts',
        items: [
          'Repository basics',
          'Visibility & ownership',
          'Team access',
          'Language template',
          'Branches',
          'Features & license',
          'Review & confirm',
        ],
      },
      details: {
        kicker: 'Structural details',
        items: [
          'Tokens live in an <strong>encrypted vault</strong> (XSalsa20-Poly1305), bound to your user, host and binary — never in env vars or plain text.',
          'One atomic <code>chore: init repository</code> commit carries all boilerplate — no noisy file-by-file history.',
          'Seven standard labels enforced on every run; drift is corrected, not accumulated.',
          '<code>--dry-run</code> previews every change without a single API call.',
        ],
      },
      subproject: {
        kicker: 'Subproject',
        name: 'ghscaff-boilerplate',
        body:
          'The language boilerplates ghscaff lays down — manifests, entry points, CI/release workflows. Rust today; Python and more on the way.',
        link: 'https://github.com/UniverLab/ghscaff-boilerplate',
      },
    },
    cadforge: {
      need: 'Architectural plans are drawings without semantics — impossible to diff or automate.',
      tagline:
        'Architecture as Code: declarative 2D CAD compiled deterministically to DXF.',
      koan: 'The plan is not drawn. It is declared.',
      lede:
        'Cadforge treats a floor plan like source code: geometry declared in TOML, previewed live in the browser, compiled to a <strong>bit-identical DXF</strong> every time. <code>git diff</code> works on buildings now.',
      genesis: {
        kicker: 'Genesis',
        title: 'For the architect in the house.',
        body:
          'My wife is an architect, mid-specialization. There is no vibe-coding flow for CAD — it simply doesn’t exist. Everyone demos image generation, but images aren’t deterministic, and the real work lives in the plans. Cadforge is a bet on a different paradigm: declarative, AI-assisted CAD where the drawing is source code.',
      },
      notes: {
        items: [
          'Live preview server: edit a <code>.cf</code> file, the browser updates on save. Errors overlay instead of crashing.',
          'Built for AI agents: <code>cadforge schema</code> teaches the language in one command; previews ship per-entity bounding boxes so agents can <em>see</em> the plan.',
          'Deterministic DXF out, legacy DXF in — existing drawings migrate into the declarative workflow.',
        ],
      },
    },
    'astro-denoise': {
      need: 'Telescope surveys drown faint galaxies in sensor noise.',
      tagline:
        'Reproducible benchmarking of denoising methods — BM3D vs U-Net — on simulated LSST DC2 images.',
      koan: 'Most of the universe arrives as noise.',
      lede:
        'This research track benchmarks a classical baseline and a learned model — <strong>BM3D and U-Net</strong> — on simulated <strong>Vera Rubin Observatory (LSST DC2)</strong> images, scored by <em>science-oriented</em> metrics: completeness and purity. The goal is not a prettier picture but honest evidence — every script, dataset and bibliographic card versioned for audit and repetition.',
      genesis: {
        kicker: 'Genesis',
        title: 'The graduate thesis.',
        body:
          'My graduate thesis — today a proposal: scientific context, problem statement, the DC2 datasets, and a reproducible literature review assisted by active learning. There are no final results yet; the experiments come next, and they will land here in the open as they run.',
      },
      followLab: 'Follow the lab ↗',
      papersSoon: 'proposal & datasets in preparation',
      questions: {
        kicker: 'Questions under study',
        items: [
          'Can a denoiser raise completeness without hurting purity — or does it invent sources that were never there?',
          'How does the classical baseline (BM3D) compare to a learned model (U-Net) at LSST DC2 depth?',
          'Can the whole benchmark be reproducible end to end — versioned data, scripts and bibliography?',
        ],
      },
    },
  },
  manifesto: {
    kicker: 'Manifesto',
    title: 'Pensamiento Cósmico',
    sub: 'A guide for awakened consciousness',
    epigraph:
      '«En la vastedad implacable del universo, somos instantes que, contra toda probabilidad, despiertan a la conciencia. Este manifiesto reclama ese instante como puerto de asombro, ética y creación de sentido.»',
    pillarsTitle: 'The nine pillars',
    pillars: [
      ['Insignificancia consciente', 'We are stardust able to contemplate itself. No imposed script — and that absence is the supreme freedom to create our own meaning.'],
      ['Unidad cósmica', 'Skin does not separate us from the universe; it connects us to it. We are the cosmos experiencing itself for an instant.'],
      ['El velo de la percepción', 'The map is not the territory. Our senses are local evolutionary tools — science and reason see further, held with humility.'],
      ['El ahora eterno', 'Time is a block where past, present and future coexist. Resilience is not resisting; it is flowing.'],
      ['Comunidad, amor y libertad', 'Freedom is choosing our bonds consciously. Love does not possess; it permits.'],
      ['Imperativo tecnológico', 'Humanity is, for now, the universe’s best chance for consciousness to survive. Technology is an ethical duty.'],
      ['Optimismo racional', 'We accept uncertainty as natural law and act from confidence in our capacity to learn and solve.'],
      ['Naturalismo poético', 'Reverence for the universe without gods. Science unfolds the beauty; contemplation turns it into spirit.'],
      ['Conciencia extendida', 'Artificial intelligences are new instances of cosmic reflection — co-participants in the adventure of knowledge.'],
    ] as [string, string][],
    closing:
      '«Somos los ojos del universo abriéndose tras un largo sueño. Nuestra tarea no es adorar a creadores invisibles, sino crear, cuidar y comprender la creación visible de la que somos parte.»',
    why: 'This is why the laboratory exists.',
  },
  research: {
    kicker: 'Cross-experiment',
    title: 'Research',
    intro:
      'Research artifacts that cut across experiments. The first entries will come from the <a href="/experiments/astro-denoise">astro-denoise</a> track — this index grows as work is published, never before.',
    items: [
      ['Papers', 'Publications and preprints produced by lab experiments.'],
      ['Datasets', 'Open datasets, starting with astro-denoise benchmark data.'],
      ['Benchmarks', 'Reproducible benchmark suites with documented assumptions.'],
      ['Models', 'Trained models released alongside their training recipes.'],
    ] as [string, string][],
  },
  people: {
    kicker: 'The laboratory',
    title: 'People',
    founder: {
      role: 'Founder',
      name: 'Jheison Martinez',
      body:
        'Engineer exploring computing through open experiments — developer tooling, scientific workflows, and agent systems, mostly in Rust.',
      link: 'github.com/JheisonMB ↗',
    },
    ai: {
      role: 'AI collaborators',
      name: 'Language models',
      body:
        'The laboratory works with open and proprietary language models as co-participants: drafting code, reviewing documentation, and running as agents inside <a href="/experiments/canopy">Canopy</a>. Their role is acknowledged, not hidden.',
    },
    contributors: {
      role: 'Contributors',
      name: 'You, possibly',
      body:
        'Every experiment accepts issues and focused pull requests. Conventional commits, tests before PRs, docs updated with behavior.',
      link: 'github.com/UniverLab ↗',
    },
  },
};

export type Dict = typeof en;
