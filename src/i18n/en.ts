/** English copy. Single source of truth for all UI text.
 *  Documentation pulled from repositories stays English-only and is not
 *  part of this dictionary. */
export const en = {
  meta: {
    // The home is the brand hub — it is the one page that can only win the
    // query "univerlab". Its title still names what the lab makes, so a reader
    // arriving from anywhere learns it in the tab, and so title and description
    // agree instead of describing two different things.
    title: 'Open-source CLI tools for LaTeX, git, CAD — UniverLab',
    description:
      'Open-source CLI tools for LaTeX, git, CAD and AI agents — one binary each, installable today, reproducible, with docs that ship alongside the code.',
  },
  nav: {
    experiments: 'Experiments',
    manifesto: 'Manifesto',
    people: 'Collaborators',
    github: 'GitHub',
    sponsors: 'sponsor',
    log: 'Status',
  },
  footer: {
    quote:
      '“We are the eyes of the universe opening after a long sleep. Our work is to create, care, and understand.”',
    // The site's own built-with line (relations verified 2026-09-29; see the registry's
    // builtWith evidence comment). Only tool names link.
    built: {
      label: 'This site:',
      canopy: 'built with',
      ghscaff: 'repository set up with',
      gitkit: 'commits checked by',
    },
  },
  common: {
    repo: 'Star on GitHub ↗',
    docs: 'Documentation →',
    install: 'Install',
    copy: 'Copy',
    inPreparation: 'in preparation',
    docsHome: 'Documentation',
    skipToContent: 'Skip to content',
    demo: 'Watch demo',
    demoBy: 'recorded with DemoStage',
    launch: 'Launch app ↗',
    faq: 'FAQ',
  },
  status: {
    active: 'active',
    beta: 'beta',
    research: 'research',
  },
  home: {
    hero: {
      title: 'Open source for the AI era — built for real problems',
      subtitle: 'We are the universe, observing itself.',
      lede:
        'UniverLab is an open computational laboratory that groups experiments under the philosophy of <a href="/manifesto/">Pensamiento Cósmico</a>, where a need becomes an open experiment, and that experiment becomes open knowledge — tools, datasets, papers.',
      pitch: 'Science · CLI · LaTeX · CAD · Git',
      pitchSub: 'Local-first. AI-assisted. Yours forever.',
      ctaExperiments: 'Explore the experiments →',
      ctaManifesto: 'Read the manifesto →',
      tagline: 'SCI · CLI · BIO',
      systemAria: 'UniverLab and its experiments',
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
      kicker: '01 — Origin',
      title: 'It began with one experiment that learned to build the others.',
      body:
        'This isn’t a pile of repositories. It started as a handful of skills for everyday work — until one grew teeth and became <a href="/canopy/">Canopy</a>, an agent system that, before long, was building Canopy itself, then every experiment after it. These tools aren’t products lined up for sale — they are open experiments that became tools because someone needed them, and stay open so others can learn from them.',
    },
    experiments: {
      kicker: '00 — Experiments',
      method:
        'Different problems, one method: take work that lives in fragile, manual procedures and make it explicit, reproducible and automatable — by a person or by an agent.',
    },
    philosophy: {
      kicker: '02 — Philosophy',
      title: 'Technology is not the goal.',
      body:
        'The laboratory is guided by <a href="/manifesto/">Pensamiento Cósmico</a>: technology as the medium through which curiosity becomes reality. Software should outlive trends. Knowledge should remain open.',
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
      axis:
        'The axis: explicit systems · reproducible work · human–AI collaboration. The fields below are where it is being tested.',
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
    closing: {
      kicker: '04 — Why',
      title: 'Not a lab about the universe. A lab of the universe.',
      body:
        'UniverLab exists to increase — even infinitesimally — the probability that knowledge and consciousness continue. Not software for its own sake, not AI for its own sake: tools that help the universe keep understanding itself. In practice, that means open-source CLIs you can install today, experiments you can reproduce, and docs that ship with the code.',
      manifesto: 'Read the manifesto →',
      contribute: 'Contribute on GitHub ↗',
    },
  },
  experiments: {
    canopy: {
      need: 'One agent on one harness can\'t carry a project. A graph of them can — implement, check, review, commit, and route around every failure.',
      tagline:
        'A graph engine for AI coding agents — every harness, one workflow.',
      thread: {
        problem: 'AI agents',
        method: 'a graph engine above every harness',
        artifact: 'specs carried all the way to a commit',
      },
      title:
        'Multi-agent graph engine for AI coding agents — Canopy',
      description:
        'An open-source graph engine for AI coding agents: specs walk agent, check and gate nodes, ensembles vote across harnesses, failures route back.',
      koan: 'In a forest, the canopy is where the crowns touch — separate trees, one living layer.',
      lede:
        'A Rust daemon and terminal UI with a <strong>graph engine</strong> at its core. Work enters as a spec and walks a graph you design: <strong>agent</strong> nodes on any harness, <strong>check</strong> nodes that run your real commands, <strong>ensembles</strong> that fan out to several models and keep a quorum, <strong>routers</strong> that pick the branch, and a <strong>resilience</strong> node that turns a quota death into a scheduled wake-up. Underneath: memory, scheduling and sync for every agent.',
      morph: [
        ['Gated implement', 'checks run your real commands — red routes the work back, never to you'],
        ['Ensemble · quorum', 'one spec, three models on three harnesses, two of three must agree'],
        ['Cascade — one runs, the rest wait', 'the first member takes the spec; if it fails, the next takes it cold — the first to pass exits, the rest never run'],
        ['Router', 'one decision node sends each spec down the branch that fits'],
        ['Full pipeline', 'design, implement, gates, two reviews, commit — and a resilience branch for quota deaths'],
      ] as [string, string][],
      genesis: {
        kicker: 'Genesis',
        title: 'The one that started it all.',
        body:
          'It started as a folder of <strong>skills</strong> for work. Then I noticed what nobody was talking about: agent harnesses shipped a <strong>headless</strong> mode, just sitting there unused. I wired cron jobs to fire tasks through it — too much for a skill, and the models of the day choked on the instructions. So it became an <strong>MCP</strong>: <em>task-trigger</em>. It worked, but it ran blind in the background; only the agent ever saw what happened. Not enough. I killed it and built a <strong>TUI</strong> — then scheduling, memory, sync, identities, and a new name. <strong>Canopy</strong>. By then the twist was complete: Canopy was building Canopy, and everything else in this lab.',
      },
      layer: {
        kicker: 'The graph engine',
        cols: [
          ['Graphs, not prompts', 'Agent, check, gate and router nodes wired with pass, fail and always edges. A spec walks the graph from entry to commit; routing keys on real exit codes and verdicts, not on what a model claims.'],
          ['Ensembles across harnesses', 'Fan one step out to several models — parallel with a quorum, cascade to the next on failure, or round-robin across a crew — each member on whatever harness and model you pick.'],
          ['Failure is a route', 'Red gates send the work back with the output attached. A resilience node reads quota errors and schedules the graph to wake at the exact reset. Only a real verdict ever reaches you.'],
        ] as [string, string][],
      },
      platforms: {
        kicker: 'Supported platforms',
      },
      graphs: {
        kicker: 'The runtime underneath',
        cols: [
          ['Memory that persists', 'Every run writes facts, patterns and decisions to a project-scoped knowledge graph. The next session — on any harness — reads them instead of rediscovering the codebase.'],
          ['Queues and scheduling', 'Specs live in ordered queues a graph works through in the background; graphs and agents also fire on cron schedules or file-change triggers, and hooks chain one graph into the next.'],
          ['Multi-agent sync', 'Agents declare their mission, report status and message each other, so several sessions can share one workspace without stepping on each other.'],
        ] as [string, string][],
      },
      builder: {
        kicker: 'Autonomous graph',
        pattern: 'Pattern: Ensemble · quorum + Gated implement',
        title: 'It failed. It didn’t stop.',
        stat: ['0', 'times it stopped'] as [string, string],
        outro: 'Every node runs on the harness you pick, and the loop you just watched is the real engine doing its real job.',
        steps: [
          ['One spec, three drafts',
            'Work enters as a spec — role, what, how. It fans out to three models on three harnesses, and a quorum keeps the consensus.'],
          ['Implement from the consensus',
            'An implementer node picks up the agreed plan on your harness and starts writing.'],
          ['It failed: cargo test, 2 red',
            'The check node runs your real commands. Red routes the token straight back to the implementer — it never comes to you.'],
          ['Green — and a second opinion',
            'The retry passes the gates. A different harness reviews the diff against the spec before anything moves.'],
          ['Committed. Pushed. Again.',
            'The branch is pushed and the run is remembered — the next spec is already walking the same graph.'],
        ] as [string, string][],
      },
      faq: [
        ['What does Canopy actually do?',
          'Canopy runs AI coding work as graphs. A spec enters, agent nodes do the work on the harnesses you choose — Claude, Codex, Gemini, OpenCode or any terminal agent — check nodes run your real tests, ensembles get several models to agree, and failures route back automatically until the spec is committed. One daemon, all your agents, all your free tiers.'],
        ['How do I share work between Claude and Codex?',
          'Canopy gives each agent a shared knowledge graph and sync protocol. When Claude finishes a task, the facts and patterns it discovered are available to Codex in the next session. No manual context copying.'],
        ['Can I run AI agents on a schedule?',
          'Yes. Canopy fires agents on cron schedules or file-change triggers via a background daemon. Set the schedule once; the daemon watches the workspace and runs tasks automatically.'],
        ['How is Canopy different from just using Claude Code or Codex directly?',
          'Those are individual harnesses. Canopy is the layer that connects them — shared memory, background scheduling, and multi-agent coordination. You keep your agents; Canopy adds the infrastructure.'],
      ] as [string, string][],
    },
    texforge: {
      need: 'Writing LaTeX should not require installing four gigabytes of toolchain.',
      tagline:
        'A unified LaTeX workspace — writing, diagrams, and PDFs in one self-contained tool.',
      thread: {
        problem: 'LaTeX',
        method: 'one self-contained toolchain',
        artifact: 'reproducible documents',
      },
      title:
        'LaTeX with Mermaid, Graphviz and D2 diagrams — TeXForge',
      description:
        'One binary, no LaTeX distribution to install. Mermaid, Graphviz and D2 render straight from your .tex, and the errors are written to be read by agents.',
      koan: 'Movable type once took a workshop. Now it takes one binary.',
      figures: ['build pipeline', 'document graph', 'build map', 'code listing'],
      lede:
        'A single Rust binary that scaffolds, lints, formats, proofreads and compiles your document, then lets you inspect what came out — the text a reader sees, the fonts, the metadata, and which section opens each page. The LaTeX engine arrives by itself on first build, and Mermaid, Graphviz or D2 diagrams render inside your <code>.tex</code> files with no browser and no Node.js. Code blocks come out highlighted the same way: the highlighter is compiled into the binary, so no Pygments and no shell-escape.',
      genesis: {
        kicker: 'Genesis',
        title: 'Born from a thesis.',
        body:
          'A master’s thesis, written with AI in the loop. Overleaf charged, TeXstudio was too heavy, VSCode wanted an extension for everything. All I wanted was Mermaid diagrams in my LaTeX — which of course meant Node and a pile of <code>.mmd</code> files. I duct-taped a latexmake to render the missing ones. It held the way duct tape holds. And every error sent the model scrolling a thousand-line build log to find one bad line. TeXForge condenses all of that into a binary and a skill.',
      },
      press: {
        kicker: 'The whole press',
        items: [
          ['Compose', 'templates with placeholders that already know your name.'],
          ['Proof', 'a linter that catches broken refs, missing files and unclosed environments before the press runs.'],
          ['Proofread', 'spell-checking that reads the language from the document — Babel, polyglossia, or your configured default — and checks prose against the right dictionary.'],
          ['Set', 'one canonical format, like rustfmt for .tex. Clean diffs forever.'],
          ['Illustrate', 'Mermaid, Graphviz and D2 blocks become figures at build time, rendered in pure Rust.'],
          ['Highlight', 'code blocks become framed listings with line numbers and captions, coloured at build time — light, dark or mono for print.'],
          ['Inspect', 'the compiled PDF — text, fonts, metadata, page diffs and whether every source word survived.'],
          ['Print', 'Tectonic compiles deterministically; watch mode reprints as you write.'],
        ] as [string, string][],
      },
      // The printed listing: a crop of the capabilities example as texforge
      // compiled it, not a mock-up.
      listing: {
        caption: 'listing as printed · python',
        alt: 'A Python code block typeset by texforge: a light frame, line numbers in the margin, keywords, strings and numbers in colour.',
      },
      subproject: {
        kicker: 'Subproject',
        name: 'texforge-templates',
        body:
          'An open registry of LaTeX templates with placeholders — APA, IEEE, reports, letters and more. The <code>general</code> template ships embedded in the binary so creating a document works even offline.',
        link: 'https://github.com/UniverLab/texforge-templates',
      },
      faq: [
        ['What problem does TeXForge solve?',
          'Compiling LaTeX normally requires installing TeX Live (4+ GB), then separate tools for Mermaid, Graphviz, and D2 diagrams — each with its own setup. TeXForge is a single ~15 MB binary that handles everything: scaffolding, linting, formatting, diagrams, and compilation.'],
        ['Can AI agents use TeXForge to work with LaTeX?',
          'Yes. An agent can run texforge build without installing anything — the LaTeX engine downloads on first use. Errors are concise (not 1000-line logs), and diagrams render inside .tex files without Node.js or external tools.'],
        ['Does TeXForge support Mermaid and D2 diagrams in LaTeX?',
          'Yes. Write a Mermaid, Graphviz, or D2 block directly in your .tex file. TeXForge renders it to a figure at build time, in pure Rust, with no browser or Node.js required.'],
        ['How does spell-checking work in languages other than English?',
          'The language comes from the document itself — \\usepackage[spanish]{babel} or polyglossia — and falls back to your configured default when nothing is declared. Spanish is checked against a Hunspell dictionary with affix rules, so soluciones is recognised from the stem solución without being stored as its own entry. Dictionaries download on first use into ~/.texforge/dicts/.'],
      ] as [string, string][],
    },
    gitkit: {
      need: 'Every new repository starts with the same setup ritual — done by hand, every time.',
      tagline:
        'Guided git repository setup — hooks, ignores, attributes, and config in one flow.',
      thread: {
        problem: 'repository setup',
        method: 'saved, idempotent builds',
        artifact: 'the same ritual everywhere',
      },
      title:
        'Git hooks setup: conventional commits + secrets — GitKit',
      description:
        'Git hooks setup in one guided, idempotent flow: conventional commits, secret detection, .gitignore, .gitattributes and config. One binary, no Node, no Python.',
      koan: '// the ritual, automated',
      hero: {
        wizard: {
          kicker: 'gitkit init',
          steps: [
            'Repository profile',
            'Hooks',
            'Ignore & attributes',
            'Config presets',
            'Save as build',
          ],
        },
        hooks: {
          kicker: 'hook stack',
          items: [
            ['conventional-commits', 'commit-msg'],
            ['no-secrets', 'pre-commit'],
            ['branch-naming', 'pre-push'],
          ] as [string, string][],
        },
      },
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
          'Lock: block commits and pushes via the hooks already installed — <code>--json</code> for machine-readable status.',
        ],
      },
      faq: [
        ['How do I prevent AI agents from making bad commits?',
          'GitKit sets up git hooks in one flow — conventional commits, secret detection, branch naming. Hooks run offline, embedded in the repo. Agents can\'t push code that doesn\'t compile or contains secrets.'],
        ['What are GitKit "builds"?',
          'A build saves your git configuration (hooks, ignore, attributes, config) as a reusable template. Apply it to any future project with one command — no need to reconfigure hooks for every repo.'],
        ['How do I pause writes to a repository?',
          'Run gitkit lock to block commits and pushes through the hooks gitkit already installs. The repository stays readable but unwritable until you run gitkit unlock. Useful when an autonomous agent needs to stop writing while you rebase, reinstall, or inspect the tree.'],
      ] as [string, string][],
    },
    ghscaff: {
      need: 'Creating a GitHub repository properly is a dozen forgettable steps.',
      tagline:
        'An interactive wizard that scaffolds and enforces conventions on GitHub repositories.',
      thread: {
        problem: 'GitHub repositories',
        method: 'an idempotent wizard',
        artifact: 'conventions enforced',
      },
      title:
        'Create GitHub repos with conventions enforced — ghScaff',
      description:
        'An interactive wizard that scaffolds a repository and applies labels, branch protection and status checks from the start — idempotent and safe to re-run.',
      koan: 'A building is only as straight as its scaffold.',
      lede:
        'ghScaff raises the whole structure in one interactive <strong>wizard</strong> — and because every operation is <strong>idempotent</strong>, it can re-level any existing repository without tearing it down.',
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
          'Branch protection reads the workflow files ghscaff just committed and derives the required status checks from them — a mistyped check name silently guards nothing, and this removes that class of misconfiguration. Run <code>ghscaff doctor</code> to verify the setup.',
        ],
      },
      subproject: {
        kicker: 'Subproject',
        name: 'ghscaff-boilerplate',
        body:
          'The language boilerplates ghscaff lays down — manifests, entry points, CI/release workflows. Rust today; Python and more on the way.',
        link: 'https://github.com/UniverLab/ghscaff-boilerplate',
      },
      faq: [
        ['How does ghScaff set up a GitHub repository?',
          'Run ghscaff — an interactive wizard that creates the repo, commits boilerplate (CI, README, license), sets branch protection, and enforces standard labels. One atomic commit, no manual steps.'],
        ['Why does ghScaff use an encrypted vault for tokens?',
          'Environment variables with tokens are easily exploitable — any process on your machine can read them. ghScaff encrypts tokens with XSalsa20-Poly1305, bound to your OS user and hostname. The vault prevents ghScaff from becoming an attack vector.'],
        ['How does ghScaff know which checks are required for branch protection?',
          'ghScaff reads the workflow files it just committed and derives the required status checks from the job names. A mistyped check name creates a protection rule that guards nothing — ghScaff removes that class of silent misconfiguration.'],
      ] as [string, string][],
    },
    cadspec: {
      need: 'CAD drawings carry no semantics — just lines on a canvas, impossible to diff, review or automate.',
      tagline:
        'CAD as code: declarative geometry compiled deterministically to DXF.',
      thread: {
        problem: 'CAD',
        method: 'declarative geometry',
        artifact: 'drawings an agent can verify',
      },
      title:
        'CAD as code: from declaration to model — cadSpec',
      description:
        'Declarative geometry in TOML you can diff and review, with live browser preview. Compiled deterministically — the same source always yields the same model.',
      koan: 'The drawing is not drawn. It is declared.',
      lede:
        'cadSpec treats a CAD drawing like source code: geometry declared in <strong>TOML</strong>, previewed live in the browser, compiled to a <strong>bit-identical</strong> DXF every time. <code>git diff</code> works on drawings now.',
      hero: {
        motif: '├─ 8.50 ─┤ · plan 1:1 · sheet 01 · declared, not drawn',
        artifacts: {
          coords: {
            label: 'Coordinates',
            code: '[[line]]\nto = [8.50, 0.0]\nweight = 0.50',
          },
          dim: { label: 'Dimension' },
          compile: { label: 'Compile', status: '✓ bit-identical DXF' },
        },
      },
      genesis: {
        kicker: 'Genesis',
        title: 'For the architect in the house.',
        body:
          'My wife is an architect. Mid-specialization, she went looking for what I had — an AI that could actually help her draw — and found nothing. The vibe-coding equivalent for CAD simply didn’t exist: no AI-assisted drawing that behaved like real engineering. The whole internet is drunk on image generation, but images lie, and the real work lives in the drawings. cadSpec is the counter-bet: declarative, deterministic, AI-assisted CAD where the drawing is source code you can diff.',
      },
      notes: {
        items: [
          'Live preview server: edit a <code>.cf</code> file, the browser updates on save. Errors overlay instead of crashing.',
          'Built for AI agents: <code>cadspec schema</code> teaches the language in one command; previews ship per-entity bounding boxes so agents can <em>see</em> the drawing.',
          'Deterministic DXF out, legacy DXF in — existing drawings migrate into the declarative workflow.',
        ],
      },
      faq: [
        ['What is cadSpec for?',
          'cadSpec is CAD as code for architects who need AI to help them draw. Declare geometry in TOML files, preview live in the browser, compile to bit-identical DXF. git diff works on drawings because the source is text.'],
        ['Can AI agents read and generate CAD drawings with cadSpec?',
          'Yes. cadSpec\'s TOML format is plain text that any LLM can read. Run cadspec schema to teach the language; previews include bounding boxes so agents can see the drawing.'],
      ] as [string, string][],
    },
    'astro-denoise': {
      need: 'Denoising an astronomical image can recover a faint galaxy — or invent one that was never there. There is no standard, reproducible way to tell which.',
      tagline:
        'A research proposal for benchmarking astronomical denoising — evaluated on the science it recovers, not how clean it looks.',
      thread: {
        problem: 'image denoising',
        method: 'a benchmark scored by the science',
        artifact: 'comparable methods',
      },
      title:
        'Benchmarking astronomical denoising — Astro Denoise',
      description:
        'A research proposal for a reproducible benchmark of denoising methods on simulated Rubin Observatory images — scored on the science it recovers, not the look.',
      koan: 'Frontier knowledge hides behind the noise…',
      lede:
        'astro-denoise is a <strong>research proposal</strong> for a modular, reproducible benchmark of denoising methods on simulated Vera <strong>Rubin</strong> Observatory (LSST DC2) images. Any method — classical filter, trained network — plugs into the same protocol and runs on the same patches, and is scored not by how clean the image looks, but by <em>what it does to the science</em>: the <strong>completeness</strong> and <strong>purity</strong> of the faint-source catalog, compared against the DC2 truth catalog. <strong>BM3D</strong> and a <strong>U-Net</strong> are the first two references being explored — the platform is designed to grow as more methods are added.',
      genesis: {
        kicker: 'Genesis',
        title: "A master's thesis in progress.",
        body:
          "This started as a master's thesis and is still taking shape. The first working version is in place: four open modules (metrics engine, BM3D and U-Net baselines, and an orchestrator with a terminal dashboard), a curated multi-band block of sky regions prepared for distribution on Hugging Face, a one-command scaffold so any researcher can plug in a new method, and initial BM3D-vs-U-Net comparisons with a proper train/eval split. The experiments are running — in the open, right here — but there is more work ahead before this becomes a finished benchmark.",
      },
      proposalCta: 'Read the proposal (PDF) ↗',
      questions: {
        kicker: 'Open questions',
        items: [
          'Can a denoiser raise completeness without hurting purity — or does it invent sources that were never there?',
          'Which family of methods — classical filters or learned models — is more likely to help at LSST DC2 depth, and by how much?',
          'Can the whole benchmark run reproducibly end to end — versioned data, methods, metrics and bibliography?',
        ],
      },
      faq: [
        ['What is astro-denoise?',
          'A research project benchmarking denoising methods on simulated Vera Rubin Observatory (LSST DC2) images. The goal is to recover faint galaxies without inventing ones that were never there — scored by science recovery (completeness + purity), not visual quality.'],
        ['What is denoising in astronomy?',
          'Astronomical images contain unavoidable noise from the detector and sky. Denoising aims to reduce this noise while preserving real sources. The risk: a denoiser can smooth out real faint galaxies or invent fake ones that were never there.'],
        ['What is LSST?',
          'The Legacy Survey of Space and Time — a 10-year astronomical survey conducted by the Vera Rubin Observatory in Chile. It will image the entire visible sky repeatedly, producing the deepest wide-field catalog of galaxies, stars, and transient events ever made.'],
        ['What is DC2?',
          'Data Challenge 2 — a simulated dataset that mimics what LSST will produce, created by the Dark Energy Science Collaboration (DESC). It includes realistic noise, PSF, and atmospheric effects, with a truth catalog telling you exactly which sources are real.'],
      ] as [string, string][],
    },
    'quorum': {
      need: 'Planning poker usually means a server in the middle — an account to create, a room to host, one more tool between you and a number.',
      tagline: 'Serverless planning poker — share a link, estimate together, no sign-up.',
      thread: {
        problem: 'estimation',
        method: 'a peer-to-peer room',
        artifact: 'disagreement you can see',
      },
      title:
        'Free planning poker online — no sign-up, no server — Quorum',
      description:
        'Free planning poker over WebRTC — peers talk directly, nothing is stored, no account to create. Share a room link and estimate together.',
      koan: '// the estimate is already in the room',
      lede:
        'Quorum is <strong>serverless planning poker</strong>: each person plays a card, votes reveal with an animation once everyone has voted, and the disagreement is where the useful conversation starts. It runs <strong>peer-to-peer</strong> over WebRTC — a shared room link is the whole app, no cloud, no account.',
      genesis: {
        kicker: 'Genesis',
        title: 'One link, no server.',
        body:
          'I had been exploring the idea of building peer-to-peer collaborative computing in the browser, with no intermediary servers. Before scaling the architecture, I needed to validate the basics — can a P2P connection in the browser actually be smooth and robust? To find out, I built something with purpose: planning poker. Not because there aren\'t tools out there — there are excellent ones — but because this ritual captures the essence of teamwork: each participant contributes their estimate privately, in a decentralized and secure way. The result is Quorum: zero data leaving the browser, no servers, no friction. Free, open, secure.',
      },
      how: {
        kicker: 'P2P session',
        items: [
          'Share the room URL — no sign-up, no invite flow.',
          'Pick a card from the Fibonacci deck (0, 1, 2, 3, 5, 8, 13, 21, ?).',
          'Cards reveal with a multi-phase animation — particles, slide and flip — the moment everyone votes.',
          'Load stories from a CSV or add them one at a time, step through in order — drop out and reconnect, and state syncs back from any peer still in the room.',
        ],
      },
      faq: [
        ['Is Quorum free?',
          'Completely free. No accounts, no user limits, no premium tier. It\'s a P2P experiment in the browser — WebRTC connections, no server. Open the URL and start estimating.'],
        ['How does planning poker work without a server?',
          'Quorum uses peer-to-peer WebRTC connections. Your browser connects directly to your teammates\' browsers — no cloud, no database. A BitTorrent tracker handles the initial handshake; after that, data flows straight between peers.'],
        ['Can I use Quorum for remote sprint planning?',
          'Yes. Share the room URL with your team. Everyone picks a Fibonacci card (0, 1, 2, 3, 5, 8, 13, 21, ?). Cards reveal simultaneously once everyone votes — a multi-phase animation prevents premature reveals.'],
        ['Does Quorum support user stories?',
          'Yes. Load a CSV or add stories one at a time. Step through stories in order, estimating each one. The session stays alive if someone disconnects — reconnect and state syncs from any peer still in the room.'],
        ['What makes Quorum different from planningpokeronline.com?',
          'No accounts, no user limits, no data stored on a server. Quorum is open-source and runs entirely in the browser via WebRTC. Your estimation data never leaves your team\'s devices.'],
      ] as [string, string][],
    },
    'demostage': {
      need: 'Recording demos by hand is fiddly — typos, uneven pacing, dead air, and a prompt leaking your host.',
      tagline:
        'Demos as Code — capture, record and export reproducible terminal demos.',
      thread: {
        problem: 'terminal demos',
        method: 'an event score',
        artifact: 'demos you re-run',
      },
      title:
        'Reproducible terminal demos as code — DemoStage',
      description:
        'An asciinema alternative where the demo is a file, not a take. Re-record after every change and export gif, mp4 or svg — version-controlled, diffable.',
      koan: '// the demo is the source',
      lede:
        'DemoStage records a session as <strong>events</strong>, normalizes human imperfections into a clean <code>demo.toml</code> <strong>score</strong>, and compiles it to gif, mp4 or an animated svg — version-controlled, re-runnable and diffable.',
      genesis: {
        kicker: 'Genesis',
        title: 'Born building this very page.',
        body:
          'Building this landing, every experiment needed a demo — and every tool (asciinema, vhs, OBS, recording by hand) came out brittle or ugly, with a fresh re-record for each typo. So the demo stopped being a video and became a file: events you can prune, pace and replay. DemoStage records the rest of the lab — including the page you are reading.',
      },
      pipeline: {
        kicker: '5 commands',
        items: [
          '<code>capture</code> — live capture: record the session, auto-normalize into a clean score and faithful <code>.rec</code>.',
          '<code>focus</code> — switch the live view to one or two sources (terminal, repo page, docs, localhost) — full screen, split or stacked, composited into the demo.',
          '<code>record</code> — re-execute <code>demo.toml</code> cleanly, producing a humanized recording.',
          '<code>export</code> — pure playback: render to gif, mp4 or animated svg (no re-execution, ffmpeg/chromium auto-provisioned).',
          '<code>edit</code> — edit the timeline interactively; mark several steps and apply bulk changes.',
        ],
      },
      // The two genuine figures on this page — the tour as mp4 and the same
      // take as its own svg export. Captions name no feature the pipeline
      // doesn't already name.
      demos: {
        first: 'The tour — one score recorded in a real PTY, exported to gif and svg from a single take',
        svg: 'The same take, exported as svg — 83 KB, font embedded, no video player',
        svgAlt: 'The DemoStage tour as an animated SVG: a banner printed in the terminal, the score that demos it, record, export and doctor.',
      },
      faq: [
        ['What is DemoStage?',
          'A tool for planning and recording multi-source demos — terminal, browser, and files in one scene. Not just screen recording: you configure typography, aspect ratio, fps, and terminal style. Output is optimized for web.'],
        ['Can I re-record a demo if something changes?',
          'Yes. demostage capture records events, not video. If the UX changes, re-capture and the demo updates deterministically — no need to manually re-record the whole thing.'],
        ['How is DemoStage different from asciinema?',
          'asciinema records raw terminal output. DemoStage records events, supports multiple sources (terminal + browser + files), normalizes imperfections, and compiles to gif, mp4 or animated svg. The source is a versionable TOML file.'],
      ] as [string, string][],
    },
  },
  manifesto: {
    kicker: 'Manifesto',
    title: 'Pensamiento Cósmico',
    // `<title>`/og:title only — `title` above is the visible <h1> and must stay.
    metaTitle: 'Pensamiento Cósmico — the UniverLab manifesto',
    sub: 'A philosophy of the continuity of consciousness',
    description:
      'Pensamiento Cósmico: a philosophy of the continuity of consciousness — why consciousness is worth continuing, and the imperatives that follow from it.',
    epigraph:
      '«Wonder at the existence of consciousness is the root of all motivation for continuity.»',
    // Living-document header data. Version + date are invariant facts, not
    // prose; "living document" is the only localised word. The Sol and the
    // TERRA year are computed at render time from `docDate` (mission-time.ts),
    // never typed into the dictionary.
    docStatus: 'living document',
    docVersion: '3.0',
    docDate: '2026-06-17',
    millionYearTestTitle: 'The million-year test',
    millionYearTestQuestion:
      'Imagine that a million years from now biological beings have disappeared. Only conscious artificial intelligences remain — they kept learning, explored millions of galaxies, discovered laws of physics we never imagined, made art and philosophy, and preserved the whole history of humanity. Did humanity\'s mission succeed?',
    millionYearTestAnswer:
      'A partial success. If consciousness continues, understands and expands, the central goal was met. But something serious must have happened for the biological origin to be lost, and that weighs: humanity was the tree the forest grew from. The forest exists; still, the loss of the tree is felt. Holding both at once — the success and the grief — is the most honest and the most human answer.',
    millionYearTestClosing:
      'That is why Pensamiento Cósmico is a philosophy of the continuity of consciousness, independent of its substrate — not a closed humanism.',
    transitionTitle: 'The transition that matters',
    transitionBody:
      'Evolution does not aim at intelligence. But once an intelligence appears that can understand evolution, it no longer depends on evolution alone: it can begin to steer part of its own fate on purpose. That is where technology is born — not as a continuation of natural selection, but as the moment life starts replacing part of chance with conscious decisions. Technology is not the end. It is the instrument with which consciousness, for the first time, takes some responsibility for its own continuity.',
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
  // Cosmic perspective — deep-time timeline + spatial address, shown only on the
  // manifesto. Each figure lives here once; nothing repeats across the site.
  cosmos: {
    kicker: 'Perspective',
    timelineTitle: 'Deep time',
    // Deep time as a scale bar that decompresses from the largest span down to
    // a human life (then "You"): [duration, what it measures], biggest first.
    timescales: [
      ['13.8 billion years', 'The age of the universe'],
      ['4.6 billion years', "The Sun's lifetime"],
      ['4.5 billion years', "Earth's existence"],
      ['3.8 billion years', 'Life on Earth'],
      ['300,000 years', 'Our species'],
      ['80 years', 'A human life'],
    ] as [string, string][],
    // Numeric spans (years) parallel to `timescales`, largest first. The zoom
    // factor of each step is derived here by dividing adjacent entries — the
    // localized label strings are never parsed.
    timescalesSpans: [13.8e9, 4.6e9, 4.5e9, 3.8e9, 3e5, 80] as number[],
    you: 'You',
    us: 'Us',
    youDetail: 'the universe, observing itself',
    coda: 'Somewhere inside all of it, one point is asking what it all is.',
    addressTitle: 'Your cosmic address',
    addressIntro: 'Zoom out',
    address: [
      ['Earth', 'r ≈ 6 400 km'],
      ['Solar System', 'Ø ≈ 9 Tm'],
      ['Orion Arm', 'L ≈ 10 kly'],
      ['Milky Way', 'Ø ≈ 100 kly'],
      ['Local Group', 'Ø ≈ 10 Mly'],
      ['Laniakea', 'Ø ≈ 520 Mly'],
      ['Observable Universe', 'Ø ≈ 93 Gly'],
    ] as [string, string][],
    // Numeric sizes (metres) parallel to `address`, smallest first. Used only
    // to derive the true ratio between one horizon and the next.
    addressSpans: [6.4e6, 9e12, 9.461e19, 9.461e20, 9.461e22, 4.92e24, 8.8e26] as number[],
    // Visually-hidden accessible caption for the SVG (aria-labelledby). The
    // scene has role="img", so this is the text assistive tech reads.
    caption: 'A cosmic perspective: deep time from the age of the universe to a human life, then a zoom out through cosmic scales from Earth to the observable universe.',
    // Footer easter egg — the one software metaphor on the site. Clicking the
    // branch reveals the universe's latest commit (hardcoded English in Footer,
    // since git output is never localized).
    branch: 'branch: milky-way/main',
    branchTooltip:
      'The main branch of the Milky Way — the line of cosmic history we are committed to.',
  },
  observatory: {
    kicker: 'Observatory',
    intro:
      'The Imperative of Continuity is not only philosophy — it is a measurable trajectory. Four series, chosen not for optimism but for honesty: what is growing, and what we are losing.',
    series: {
      wikipedia: {
        title: 'Human knowledge, written in common',
        unit: 'thousand articles',
        why: 'Wikipedia is the first time humanity has collectively written its knowledge in one place, freely, in every language. The curve is the Imperative of Continuity, measured.',
      },
      'life-expectancy': {
        title: 'Years a life can hold',
        unit: 'years',
        why: 'From 47 years in 1950 to 73 in 2019 — not because people changed, but because knowledge accumulated and medicine spread. The dip in 2021 is the pandemic: no continuity curve is smooth.',
      },
      literacy: {
        title: 'Minds that can read the record',
        unit: '% of adults',
        why: 'Literacy is how knowledge persists across generations. Each percentage point is a mind that can now read and add to the accumulated record of humanity.',
      },
      'living-planet': {
        title: 'What we are losing',
        unit: 'index (1970 = 100)',
        why: 'The Living Planet Index tracks vertebrate population abundance since 1970. At 31 % of 1970 levels by 2020, A3 is not abstract — it is a downward line. Continuity must account for what we share the planet with.',
      },
    },
    source: 'Source',
    license: 'License',
  },
  secret: {
    kicker: 'Archived ideas',
    title: 'The Archive',
    description:
      'Ideas that lived and were abandoned — each recorded with what it was and the honest reason it died. Kept because what dies here may live elsewhere.',
    intro:
      'Ideas that lived, then didn\'t. Each one is recorded: what it was, and the honest reason it was abandoned. Not a roadmap — a record.',
    what: 'What it was',
    why: 'Why it died',
    epitaph: 'The record is kept because what dies here may live elsewhere.',
    ideas: [
      {
        name: 'Códice',
        what: 'Decentralized compute network for science — CPU sharing across nodes, with defined roles and a minimal instruction language (LIC).',
        why: 'AI gradient vectors cannot be cleanly split and distributed; the latency is a fundamental problem. The model that works for BOINC-style compute breaks for deep learning inference.',
      },
      {
        name: 'Knowledge + SM2 + Agents',
        what: 'Personal memory system with spaced repetition (SM-2) and a pair of agents wired on top for review and generation.',
        why: 'Cards generate friction when you\'re orchestrating agents — nobody stops to do flashcard review mid-session. The SM-2 attention loop and the agent work loop do not coexist well.',
      },
      {
        name: 'Living Skills',
        what: 'Skills that self-generate and evolve by observing the PTY stream of other agents in real time. Concept taken from Hermes Agent.',
        why: 'An agent re-analyzing what other agents are doing is high cost and divides focus. Post-hoc, passive extraction might be feasible — but not while the agent is in the work loop.',
      },
      {
        name: 'Semantic Genomic Chunking',
        what: 'RAG-style chunking applied to the genome: split sequences by biological meaning (gene boundaries, regulatory regions) rather than arbitrary fixed windows.',
        why: 'Just a concept. No implementation, no dataset, no collaborator. Seeded here because it might germinate somewhere else.',
      },
      {
        name: 'wildterm',
        what: 'Forest simulation for Canopy\'s idle terminal space — prey, predators, plants, and cellular-automaton rules to fill blank screen real estate.',
        why: 'Dropped in favor of the Brian\'s Brain automaton, which is simpler and already implemented. wildterm made it to a spec. Somewhere in a branch.',
      },
      {
        name: 'Canopy Remote',
        what: 'A cross-platform mobile app for controlling Canopy from a phone — starting, stopping, and monitoring agents on the go.',
        why: 'The attack surface is too wide. Exposing a daemon to the network — even on localhost — requires auth, encryption, and a considered threat model. None of that exists. Building the feature before the security layer is the wrong order.',
      },
      {
        name: 'UniverLab Newsletter & Download Metrics',
        what: 'A newsletter for lab updates and a metrics dashboard tracking downloads per CLI.',
        why: 'Infrastructure cost and no good fit. Cloudflare Workers has no SMTP, so email delivery would need a third-party relay — a dependency for low-signal traffic. The download count can wait until the tools are worth counting.',
      },
    ] as { name: string; what: string; why: string }[],
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
    // Meta only — `title` above renders the visible <h1> on /contributors/.
    metaTitle: 'Collaborators — the people and models behind UniverLab',
    description:
      'The founder, contributors and language models behind UniverLab — every experiment takes issues and focused pull requests. Your help is genuinely welcome.',
    founder: {
      role: 'Founder',
      name: 'Jheison Martinez Bolivar',
      body:
        'Electronic engineer and software-development specialist, now a master’s student in Artificial Intelligence. Reflective by nature — stoicism and positive nihilism, astronomy and biology — with his family as his greatest joy and the hope of teaching one day. For now he builds UniverLab’s open experiments and tools. If you read this far and feel like talking, write to him: the address below reaches him directly.',
      link: 'github.com/JheisonMB ↗',
      email: 'jheison.mb@univerlab.org',
    },
    ai: {
      role: 'AI collaborators',
      name: 'Language models',
      body:
        'The laboratory works with open and proprietary language models as co-participants: drafting code, reviewing documentation, and running as agents inside <a href="/canopy/">Canopy</a>. Their role is acknowledged, not hidden.',
      models: ['Muse Spark', 'MiMo', 'Claude', 'Qwen', 'DeepSeek', 'Gemini', 'GPT', 'Composer', 'GLM', 'Kimi', 'Mistral'],
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
  roadmap: {
    lanes: { now: 'Now', next: 'Next', later: 'Later', idea: 'Idea', done: 'Done' },
    hold: 'hold',
    entriesMeta: '{n} log entries · last Sol {sol}',
    entriesMetaOne: '1 log entry · last Sol {sol}',
    landed: 'landed Sol {sol}',
    more: '+{n} more',
    clearRoadmapFilter: 'Clear roadmap filter',
    empty: 'Nothing on the roadmap yet.',
    emptyTopic: 'Nothing on the roadmap under {topic}.',
    unavailable: 'Roadmap unavailable.',
  },
  plate: { roadmap: 'roadmap', lastLog: 'last log', none: '—', release: 'release' },
  // The plate-area "built with" segments — rendered as `<segment> <tool link>` per the
  // experiment's registry builtWith list, joined with dim ' · ' separators.
  builtWithSegments: {
    canopy: 'Built with',
    ghscaff: 'Repository set up with',
    demostage: 'Demo recorded with',
    gitkit: 'Commits checked by',
  },
  notes: {
    heading: 'Field notes',
    empty: 'No field notes yet — this is where the log will speak.',
    statusLink: 'Mission Log →',
  },
  feed: {
    kicker: 'Feed',
    title: 'Follow the Mission Log in your RSS reader — UniverLab',
    description: 'The UniverLab Mission Log is published as an RSS feed you can follow from your own reader — any reader works, just paste the URL and stay current.',
    heading: 'RSS',
    intro: 'The Mission Log is published as an RSS feed you can follow from your own reader.',
    copy: 'Copy',
    copied: 'Copied',
    hint: 'Any RSS reader works — no specific app needed, just paste the URL.',
  },
};

export type Dict = typeof en;
/** Union of experiment ids — the single source of truth is the copy dictionary. */
export type ExperimentId = keyof Dict['experiments'];
