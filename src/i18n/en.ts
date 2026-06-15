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
    people: 'Collaborators',
    github: 'GitHub',
  },
  footer: {
    quote:
      '“We are the eyes of the universe opening after a long sleep. Our work is to create, care, and understand.”',
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
      title: 'We are the universe, observing itself.',
      lede:
        'UniverLab runs on one loop: a real need becomes an <strong>open experiment</strong>, and the experiment produces open knowledge — tools, libraries, datasets, papers. The experiment is the work; everything it ships is a byproduct.',
      tagline: 'SCI · CLI · BIO',
      // Name gloss: "univer" holds while the suffix + sense rotate, unpacking
      // universe / universal / university — a laboratory of the universe.
      // Each "univer—" sense carries a small catalog; the hero picks one at random.
      senses: [
        { suffix: 'se', glosses: ['a laboratory of the universe', 'the cosmos, studying itself', 'knowledge under an open sky'] },
        { suffix: 'sal', glosses: ['universal knowledge, open by default', 'tools for anyone, anywhere', 'open to all, owned by none'] },
        { suffix: 'sity', glosses: ['a university without walls', 'research done in the open', 'learning that ships its work'] },
        { suffix: 'salize', glosses: ['make knowledge belong to everyone', 'an open answer to every real need', 'reach, not dependency'] },
      ],
    },
    lineage: {
      kicker: '00 — Origin',
      title: 'It began with one experiment that learned to build the others.',
      body:
        'This isn’t a pile of repositories. It started as a handful of skills for everyday work — until one grew teeth and became <a href="/canopy">Canopy</a>, an agent system that, before long, was building Canopy itself, then every experiment after it. These tools aren’t products lined up for sale. We are the universe forging its own instruments to keep studying itself.',
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
      nowItems: ['Developer experience', 'CLI design', 'AI-assisted workflows', 'CAD'],
      nextItems: [
        'Computational science',
        'Bioinformatics',
        'Simulation',
        'Knowledge systems',
      ],
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
          'It started as a folder of skills for work. Then I noticed what nobody was talking about: agent harnesses shipped a <strong>headless mode</strong>, just sitting there unused. I wired cron jobs to fire tasks through it — too much for a skill, and the models of the day choked on the instructions. So it became an MCP: <em>task-trigger</em>. It worked, but it ran blind in the background; only the agent ever saw what happened. Not enough. I killed it and built a TUI — then scheduling, memory, sync, identities, and a new name. Canopy. By then the twist was complete: Canopy was building Canopy, and everything else in this lab.',
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
          'A master’s thesis, written with AI in the loop. Overleaf wanted my money or my patience; TeXstudio dragged in MiKTeX; VSCode wanted an extension for everything. All I wanted was Mermaid diagrams in my LaTeX — which of course meant Node and a pile of <code>.mmd</code> files. I duct-taped a latexmake to render the missing ones. It held the way duct tape holds. And every error sent the model scrolling a thousand-line build log to find one bad line. TexForge is the tool I should have had from the start: one binary, one skill, zero ceremony.',
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
          'It started with a commit that changed nothing — just line endings, silently rewritten somewhere between my work Mac, my Windows box and the agents on WSL. Chasing it down led me to <code>.gitattributes</code>. That led to git hooks: built into git, genuinely powerful, and ignored by almost everyone — because wiring them into every repo is a chore. So I deleted the chore. That’s gitkit.',
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
        'Creating a repository properly is a dozen forgettable steps. ghScaff raises the whole structure in one conversational wizard — and because every operation is <strong>idempotent</strong>, it can re-level any existing repository without tearing it down.',
      genesis: {
        kicker: 'Genesis',
        title: 'The same setup, again and again.',
        body:
          'New Rust project. Same labels, same branch protection, same CI, same secrets. Again. And again. Replicable work you do by hand isn’t craft — it’s toil. ghScaff runs the whole ritual in one wizard, idempotently, so your conventions hold the line instead of drifting.',
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
      need: 'CAD drawings carry no semantics — just lines on a canvas, impossible to diff, review or automate.',
      tagline:
        'CAD as code: declarative geometry compiled deterministically to DXF.',
      koan: 'The drawing is not drawn. It is declared.',
      lede:
        'cadForge treats a CAD drawing like source code: geometry declared in TOML, previewed live in the browser, compiled to a <strong>bit-identical DXF</strong> every time. <code>git diff</code> works on drawings now.',
      genesis: {
        kicker: 'Genesis',
        title: 'For the architect in the house.',
        body:
          'My wife is an architect. Mid-specialization, she went looking for what I had — an AI that could actually help her draw — and found nothing. The vibe-coding equivalent for CAD simply didn’t exist: no AI-assisted drawing that behaved like real engineering. The whole internet is drunk on image generation, but images lie, and the real work lives in the drawings. cadForge is the counter-bet: declarative, deterministic, AI-assisted CAD where the drawing is source code you can diff.',
      },
      notes: {
        items: [
          'Live preview server: edit a <code>.cf</code> file, the browser updates on save. Errors overlay instead of crashing.',
          'Built for AI agents: <code>cadforge schema</code> teaches the language in one command; previews ship per-entity bounding boxes so agents can <em>see</em> the drawing.',
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
        title: "The master's thesis.",
        body:
          "My master's thesis. Right now it's a proposal — scientific context, problem statement, the DC2 datasets, and a literature review made reproducible with active learning. No results yet. But the lab was built to hold work exactly like this, and when the experiments run, they'll run in the open — right here.",
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
    purposeTitle: 'Purpose & vision',
    purposeBody:
      'Life is not a series of separate events, but an interconnected fabric where every moment, every fear, every choice of freedom and every communal encounter continuously shapes us. With this premise, our aim is to forge an ethical, aesthetic and existential framework that allows us to:',
    purpose: [
      'Confront the absence of imposed purpose without falling into nihilism — and create our own meaning.',
      'Value life as a statistically improbable phenomenon, and therefore infinitely precious.',
      'Carry the flame of consciousness beyond our biological, planetary origin.',
      'Contemplate the universe with informed awe, where science reveals a beauty greater than any myth.',
      'Act with rational optimism, using technology and ethics to secure our continuity.',
    ],
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
    pathTitle: 'The path of transformation',
    path: [
      ['From insignificance', 'to awe at the gift of existing.'],
      ['From separation', 'to unity with the whole.'],
      ['From naïve perception', 'to a deeper grasp of the reality underneath.'],
      ['From rigid control', 'to resilient flow and adaptation.'],
      ['From possession', 'to a love that lets things be.'],
      ['From superstition', 'to poetic naturalism and tangible truth.'],
      ['From self-destruction', 'to cosmic responsibility — guardians of life.'],
    ] as [string, string][],
    closing:
      '«Somos los ojos del universo abriéndose tras un largo sueño. Nuestra tarea no es adorar a creadores invisibles, sino crear, cuidar y comprender la creación visible de la que somos parte.»',
    why: 'This is why the laboratory exists.',
  },
  research: {
    kicker: 'Cross-experiment',
    title: 'Research',
    intro:
      'Research artifacts that cut across the lab’s experiments — papers, datasets, benchmarks, models. The first entries come from this track; the list grows only as work is actually published.',
    items: [
      ['Papers', 'Publications and preprints produced by lab experiments.'],
      ['Datasets', 'Open datasets, starting with astro-denoise benchmark data.'],
      ['Benchmarks', 'Reproducible benchmark suites with documented assumptions.'],
      ['Models', 'Trained models released alongside their training recipes.'],
    ] as [string, string][],
  },
  people: {
    kicker: 'The laboratory',
    title: 'Collaborators',
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
        'The laboratory works with open and proprietary language models as co-participants: drafting code, reviewing documentation, and running as agents inside <a href="/canopy">Canopy</a>. Their role is acknowledged, not hidden.',
      models: ['Claude', 'GPT', 'DeepSeek', 'Mistral', 'Qwen', 'Gemini', 'MiMo', 'Kimi', 'GLM'],
    },
    contributors: {
      role: 'Contributors',
      name: 'You, possibly',
      body:
        'Every experiment accepts issues and focused pull requests. Conventional commits, tests before PRs, docs updated with behavior.',
      link: 'github.com/UniverLab ↗',
    },
    wall: {
      kicker: 'Across the repositories',
      commits: 'commits',
    },
  },
};

export type Dict = typeof en;
/** Union of experiment ids — the single source of truth is the copy dictionary. */
export type ExperimentId = keyof Dict['experiments'];
