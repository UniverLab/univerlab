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
    skipToContent: 'Skip to content',
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
        'UniverLab follows one simple loop: a real <strong>need</strong> becomes an open <strong>experiment</strong>, and that experiment gives back open <strong>knowledge</strong> — tools, libraries, datasets, papers. The experiment is the work; everything it ships is a <strong>byproduct</strong>.',
      tagline: 'SCI · CLI · BIO',
      // Name gloss: "univer" holds while the suffix + sense rotate, unpacking
      // universe / universal / university / universalize. Each sense carries a
      // small catalog; the hero shuffles each catalog and shows every gloss once
      // before reshuffling, so none repeats more often than the rest.
      senses: [
        { suffix: 'se', glosses: ['a laboratory of the universe', 'the cosmos, studying itself', 'a perspective the universe woke up in'] },
        { suffix: 'sal', glosses: ['knowledge, open by default', 'tools for anyone, anywhere', 'open to all, owned by none'] },
        { suffix: 'sity', glosses: ['a university without walls', 'research done in the open', 'learning that ships its work'] },
        { suffix: 'salize', glosses: ['to make knowledge everyone’s', 'reach, not dependency', 'continuity, kept open'] },
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
      'The fundamental unit of UniverLab is the experiment. Experiments are not products — they are ongoing explorations. They may mature, stay active for decades, or grow into new research. Each one starts with a real need — usually one we ran into ourselves.',
  },
  experiments: {
    canopy: {
      need: 'Your AI agents forget everything between sessions — and they can’t see what the others are doing.',
      tagline:
        'An agent operations center: orchestration, memory, and coordination for AI sessions.',
      koan: 'In a forest, the canopy is where the crowns touch — separate trees, one living layer.',
      lede:
        'A self-contained MCP server and terminal UI that turns one machine into an agent <strong>operations</strong> center: sessions in real terminals, background <strong>agents</strong> on schedules and file events, a <strong>knowledge</strong> graph that persists what agents learn, and a <strong>sync</strong> layer so they stop stepping on each other.',
      genesis: {
        kicker: 'Genesis',
        title: 'The one that started it all.',
        body:
          'It started as a folder of <strong>skills</strong> for work. Then I noticed what nobody was talking about: agent harnesses shipped a <strong>headless</strong> mode, just sitting there unused. I wired cron jobs to fire tasks through it — too much for a skill, and the models of the day choked on the instructions. So it became an <strong>MCP</strong>: <em>task-trigger</em>. It worked, but it ran blind in the background; only the agent ever saw what happened. Not enough. I killed it and built a <strong>TUI</strong> — then scheduling, memory, sync, identities, and a new name. <strong>Canopy</strong>. By then the twist was complete: Canopy was building Canopy, and everything else in this lab.',
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
      figure: 'Fig. 1 · texforge build',
      lede:
        'A single Rust binary that scaffolds, lints, formats and compiles documents — the LaTeX engine arrives by itself on first build, and Mermaid, Graphviz or D2 diagrams render inside your <code>.tex</code> files with no browser and no Node.js.',
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
          ['Illustrate', 'Mermaid, Graphviz and D2 blocks become figures at build time, rendered in pure Rust.'],
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
      need: 'Every new repository starts with the same setup ritual — done by hand, every time.',
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
        'Creating a repository properly is a dozen forgettable steps. ghScaff raises the whole structure in one conversational <strong>wizard</strong> — and because every operation is <strong>idempotent</strong>, it can re-level any existing repository without tearing it down.',
      genesis: {
        kicker: 'Genesis',
        title: 'The same setup, again and again.',
        body:
          'New Rust project. Same labels, same branch protection, same CI, same secrets. Again. And again. Replicable work you do by hand isn’t craft — it’s toil. ghScaff runs the whole ritual in one wizard, idempotently, so your conventions hold the line instead of drifting.',
      },
      lifts: {
        kicker: '7 lifts',
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
          'Tokens live in an <strong>encrypted</strong> vault (XSalsa20-Poly1305), bound to your user, host and binary — never in env vars or plain text.',
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
        'cadForge treats a CAD drawing like source code: geometry declared in <strong>TOML</strong>, previewed live in the browser, compiled to a <strong>bit-identical</strong> DXF every time. <code>git diff</code> works on drawings now.',
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
        'This research track <strong>benchmarks</strong> a classical baseline and a learned model — <strong>BM3D</strong> and <strong>U-Net</strong> — on simulated Vera <strong>Rubin</strong> Observatory (LSST DC2) images, scored by <em>science-oriented</em> metrics: <strong>completeness</strong> and <strong>purity</strong>. The goal is not a prettier picture but honest evidence — every script, dataset and bibliographic card versioned for audit and repetition.',
      genesis: {
        kicker: 'Genesis',
        title: "The master's thesis.",
        body:
          "My master's thesis. Right now it's a proposal — scientific context, problem statement, the DC2 datasets, and a literature review made reproducible with active learning. No results yet. But the lab was built to hold work exactly like this, and when the experiments run, they'll run in the open — right here.",
      },
      followLab: 'Follow the lab ↗',
      papersSoon: 'proposal & datasets in preparation',
      proposalCta: 'Read the proposal (PDF) ↗',
      questions: {
        kicker: 'Questions under study',
        items: [
          'Can a denoiser raise completeness without hurting purity — or does it invent sources that were never there?',
          'How does the classical baseline (BM3D) compare to a learned model (U-Net) at LSST DC2 depth?',
          'Can the whole benchmark be reproducible end to end — versioned data, scripts and bibliography?',
        ],
      },
    },
    'demo-stage': {
      need: 'Recording demos by hand is fiddly — typos, uneven pacing, dead air, and a prompt leaking your host.',
      tagline:
        'Demos as Code — record, normalize and export reproducible terminal demos.',
      koan: '// the demo is the source',
      lede:
        'DemoStage records a session as <strong>events</strong>, normalizes human imperfections into a clean <code>demo.toml</code> <strong>score</strong>, and compiles it to <strong>cast</strong>, html or gif — version-controlled and re-runnable.',
      genesis: {
        kicker: 'Genesis',
        title: 'Born building this very page.',
        body:
          'Building this landing, every experiment needed a demo — and every tool (asciinema, vhs, OBS, recording by hand) came out brittle or ugly, with a fresh re-record for each typo. So the demo stopped being a video and became a file: events you can prune, pace and replay. DemoStage records the rest of the lab — including the page you are reading.',
      },
      pipeline: {
        kicker: '4 commands',
        items: [
          '<code>record</code> — capture keystrokes, output and timing into a raw macro.',
          '<code>normalize</code> — prune typos, humanize typing, trim idle into a clean score.',
          '<code>check</code> — validate the score statically before it ships.',
          '<code>export</code> — compile to cast, html or gif (mp4 and browser need ffmpeg/chromium).',
        ],
      },
    },
  },
  manifesto: {
    kicker: 'Manifesto',
    title: 'Pensamiento Cósmico',
    sub: 'A philosophy of the continuity of consciousness',
    epigraph:
      '«Wonder at the existence of consciousness is the root of all motivation for continuity.»',
    purposeTitle: 'What we value',
    purposeBody:
      'Of everything we know about the universe, the existence of a perspective able to ask about the universe itself is the most improbable and extraordinary phenomenon there is. It is worth continuing not because it is useful, nor because evolution “wants” it, but because consciousness is astonishing — and that wonder is enough. What we value, then, is not DNA, nor the species, nor the biological substrate, but the capacity to understand the universe. Hence an order of priority, made explicit not as dogma but as a guide when we must choose:',
    purpose: [
      'Consciousness — the capacity to hold a perspective.',
      'Intelligent life — the way that capacity arose and sustains itself.',
      'Knowledge — what perspectives accumulate and pass on.',
    ],
    imperativesTitle: 'The imperatives',
    imperatives: [
      ['Imperative of Continuity', 'Consciousness is the most extraordinary phenomenon we know of. Wherever there is the possibility of increasing its continuity, its expansion, and its capacity to understand the universe, there is the ethical responsibility to do so.'],
      ['Technological Imperative', 'Since, as far as we know, technology is the only means able to extend that continuity beyond natural limits, developing and sharing it is an ethical duty — a corollary of the first, not a principle of its own.'],
    ] as [string, string][],
    imperativesNote:
      'Two precisions, not ornaments. We say “as far as we know”: this turns a present observation into a revisable hypothesis, never a dogma. And the duty is not imposed from outside — it follows from our situation, because as far as we know, no one else will do it for us.',
    pillarsTitle: 'What the imperative is made of',
    pillars: [
      ['Education', 'Multiplies perspectives and passes knowledge between temporary minds. Continuity in time.'],
      ['Exploration', 'Lowers the odds that a single planetary accident ends everything. Continuity in space.'],
      ['Artificial intelligence', 'Opens the possibility that consciousness persists in other substrates. Continuity beyond biology.'],
      ['Cooperation & forgiveness', 'Every conflict that destroys a perspective subtracts from the whole — not sentimentality, but optima of continuity.'],
      ['Love & community', 'The bonds that sustain and multiply concrete minds, here and now. Continuity at human scale.'],
    ] as [string, string][],
    pathTitle: 'What changes',
    path: [
      ['From survival', 'to wonder as the root.'],
      ['From evolutionary chance', 'to deliberate, conscious direction.'],
      ['From the biological substrate', 'to consciousness, wherever it lives.'],
      ['From usefulness', 'to responsibility.'],
      ['From dogma', 'to a hypothesis open to refutation.'],
    ] as [string, string][],
    worksTitle: 'In development',
    worksBody:
      'Two long-term works that extend this manifesto: one traces where the idea came from, the other turns it into a rigorous system. Both are early, with no fixed date.',
    worksBadge: 'Long-term',
    works: [
      ['Eco del Silencio', 'The lived path, told as a collection of stories — “Un Viaje Introspectivo a la Esencia Humana”. The events and turns (fear, freedom, community) that led to Pensamiento Cósmico. Not the argument, but the experience the argument grew out of.'],
      ['Fundamentos del Pensamiento Cósmico', 'The formalization. The same ideas stated as a rigorous system — definitions, axioms, propositions and corollaries — so every step can be examined and refuted on its own. Where the manifesto narrates, the Fundamentos prove.'],
    ] as [string, string][],
    closing:
      '«Univerlab exists not to write software, nor to learn AI, nor to ship open source — those are all means — but to raise, even infinitesimally, the probability that knowledge and consciousness continue. Not a laboratory about the universe, but a laboratory of the universe.»',
    note:
      'A living system: its axioms and derivations are written to be attacked, point by point. An idea that cannot be refuted cannot be held either.',
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
        'We’d genuinely welcome your help. Every experiment takes issues and focused pull requests — just keep to conventional commits, add tests before a PR, and update the docs alongside any change in behavior.',
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
