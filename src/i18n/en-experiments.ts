// Experiment copy (English) — split out of en.ts to keep the dictionary
// files readable. Spread into `en` unchanged.
export const experiments = {
    canopy: {
      need: 'One agent on one harness can\'t carry a project. A graph of them can — implement, check, review, commit, and route around every failure.',
      tagline:
        'A graph engine for AI coding agents — every harness, one workflow.',
      etymology: '(From <em>canopy</em>, the forest’s crown.)',
      figure: 'A wooden hive where many agents work under one roof, each in its own cell and all in one flow. Like the forest canopy, it does not grow the trees: it covers and orders them so the light reaches every one.',
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
        'AI coding agents write code nobody is watching. <strong>Canopy</strong> puts every change through your own tests and reviewers before it is committed.',
      how:
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
      cta: { catalogue: 'Catalogue' },
      remote: {
        kicker: 'Remote',
        title: 'Your sessions and graphs from your phone',
        cols: [
          ['Encrypted end to end',
            'Sessions travel over WebRTC with end-to-end encryption: the relay only carries signalling, and your screen never passes through it.'],
          ['Pairing in one command',
            'Run the command below: it prints a one-time code with its link and a terminal QR code. Scan it and the browser becomes a revocable device of the host.'],
          ['Live graphs, shared',
            'Watch specs walk the graph in real time from your phone, and hand single-use invite codes to guests you trust.'],
        ] as [string, string][],
        button: 'Open remote →',
      },
      catalogue: {
        kicker: 'Graph catalogue',
        caption: 'Pattern: Gated implement — one plate of the live catalogue',
        explore: 'Explore the catalogue →',
        patterns: 'Patterns →',
        transparency: 'Transparency →',
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
      etymology: '(From <em>TeX</em> and <em>forge</em>.)',
      figure: 'A type press for the age of machines: the manuscript goes in, the printed sheet comes out. With it LaTeX stops being an installer\'s trade and becomes again what it always was, the art of setting a page well.',
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
          'The <code>general</code> template ships embedded in the binary so creating a document works even offline.',
        link: 'https://github.com/UniverLab/texforge-templates',
      },
      templates: {
        kicker: 'Templates',
        title: '{n} templates in the open registry',
        cols: { name: 'name', description: 'description', version: 'version' },
        use: 'Every row copies the command; my-doc is your project name:',
        copy: 'Copy',
        copied: 'Copied',
        copyLabel: 'Copy the command that starts a document with {name}',
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
      etymology: '(From <em>git</em> and <em>kit</em>, a case of tools.)',
      figure: 'The craftsman\'s case that gets the most out of git: the hooks nobody sets up and the rules everybody forgets, kept in one case that opens the same way in every repository.',
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
      etymology: '(From <em>GitHub</em> and <em>scaffold</em>.)',
      figure: 'Scaffolding raised before the building: it guards the branches, lifts the checks and leaves every repository standing from day one, so whatever is built on top never needs propping up later.',
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
        link: 'https://github.com/UniverLab/ghscaff-boilerplate',
      },
      boilerplates: {
        kicker: 'Boilerplates',
        title: '{n} boilerplates the wizard can lay down',
        cols: { name: 'name', language: 'language', description: 'description', version: 'version' },
        use: 'Pick one at the wizard\'s language step:',
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
      etymology: '(From <em>CAD</em> and <em>spec</em>, specification.)',
      figure: 'A drafting table that declared parts instead of drawing them. It was archived when the lab chose to wrap the best tools rather than reinvent them; its idea lives on in the tools that replaced it.',
      thread: {
        problem: 'CAD',
        method: 'declarative geometry',
        artifact: 'drawings an agent can verify',
      },
      title:
        'CAD as code: from declaration to model — cadSpec',
      description:
        'Declarative geometry in TOML you can diff and review, with live browser preview. Compiled deterministically — the same source always yields the same model.',
    },
    'astro-denoise': {
      need: 'Noise reduction on an astronomical image can recover a faint galaxy — or invent one that was never there. There is no standard, reproducible way to tell which.',
      tagline:
        'A research proposal for benchmarking astronomical noise reduction — evaluated on the science it recovers, not how clean it looks.',
      etymology: '(From Greek <em>ástron</em>, star, and <em>denoise</em>.)',
      figure: 'An eyepiece that parts light from noise: between the grain the sensor leaves and the star that is really there, a line of research that measures before it claims.',
      thread: {
        problem: 'noise reduction',
        method: 'a benchmark scored by the science',
        artifact: 'comparable methods',
      },
      title: 'Astro Denoise — a noise-reduction benchmark on DC2 images',
      description:
        'A reproducible benchmark of noise-reduction methods on simulated Vera Rubin Observatory DC2 images, scored by faint-source recovery, image quality and cost.',
      koan: 'Frontier knowledge hides behind the noise…',
      lede:
        'astro-denoise is a <strong>research proposal</strong> for a modular, reproducible benchmark of noise-reduction methods on simulated Vera <strong>Rubin</strong> Observatory (LSST DC2) images. Any method — classical filter, trained network — plugs into the same protocol and runs on the same patches, and is scored not by how clean the image looks, but by <em>what it does to the science</em>: the <strong>completeness</strong> and <strong>purity</strong> of the faint-source catalog, compared against the DC2 truth catalog. <strong>BM3D</strong> and a <strong>U-Net</strong> are the first two references being explored — the platform is designed to grow as more methods are added.',
      genesis: {
        kicker: 'Genesis',
        title: "A master's thesis in progress.",
        body:
          "This began as a master's thesis and is still taking shape. The ecosystem has worked since July 2026: an orchestrator with a common command-line protocol (FITS image in and out, metadata in JSON), a no-processing control condition, and two separately packaged methods, BM3D for the classical family and a U-Net for deep learning. The experiments run in the open, right here, but there is work ahead before this is a finished benchmark.",
      },
      objectives: {
        kicker: 'Objectives',
        thesisTitle:
          'Benchmarking noise-reduction methods on simulated DC2 images of the Vera Rubin Observatory',
        general:
          'Develop a reproducible benchmarking platform that compares noise-reduction methods on simulated DC2 images of the Vera Rubin Observatory, evaluating for each method the recovery of faint sources, the resulting image quality and its computational cost.',
        items: [
          {
            state: 'complete',
            text: 'Design a modular, reproducible platform to integrate, run and compare noise-reduction methods on simulated Vera C. Rubin Observatory images, so that new techniques can be added without changing its structure.',
          },
          {
            state: 'in progress',
            text: 'Define a set of evaluation metrics, grounded in the literature, to analyse how well methods recover faint astronomical sources, preserve image quality and keep scientific measurements accurate, as well as their computational cost under comparable conditions.',
          },
          {
            state: 'in progress',
            text: 'Integrate into the platform two representative noise-reduction methods, one based on classical image-processing techniques and one on deep learning.',
          },
          {
            state: 'pending',
            text: 'Evaluate the integrated methods on a documented, versioned dataset built from the DC2 simulation images and reference catalogues, so that experiments can be repeated and results compared under the same conditions.',
          },
        ],
      },
      repos: {
        kicker: 'Repositories',
        items: [
          {
            name: 'UniverLab/astro-denoise',
            description: 'The bench: orchestrator, science metrics and the control condition.',
            url: 'https://github.com/UniverLab/astro-denoise',
          },
          {
            name: 'UniverLab/astro-denoise-bm3d',
            description: 'BM3D, the classical baseline.',
            url: 'https://github.com/UniverLab/astro-denoise-bm3d',
          },
          {
            name: 'UniverLab/astro-denoise-unet',
            description: 'The U-Net, the deep-learning baseline.',
            url: 'https://github.com/UniverLab/astro-denoise-unet',
          },
        ],
      },
      proposalCta: 'Read the proposal (PDF) ↗',
      questions: {
        kicker: 'Open questions',
        items: [
          'Can a denoiser raise completeness without hurting purity — or does it invent sources that were never there?',
          'Which family of methods — classical filters or learned models — is more likely to help at LSST DC2 depth, and by how much?',
          'Can the whole benchmark be repeated with the same scientific results on the same version of data and code?',
        ],
      },
      faq: [
        ['What is astro-denoise?',
          'A research project benchmarking noise-reduction methods on simulated Vera Rubin Observatory (LSST DC2) images. It compares three conditions: a no-processing control, BM3D as the classical baseline and a U-Net as the deep-learning baseline. The goal is to recover faint galaxies without inventing ones that were never there — scored by science recovery (completeness + purity), not visual quality.'],
        ['What is noise reduction in astronomy?',
          'Astronomical images contain unavoidable noise from the detector and sky. Noise reduction aims to lower this noise while preserving real sources. The risk: a method can smooth out real faint galaxies or invent fake ones that were never there.'],
        ['What is LSST?',
          'The Legacy Survey of Space and Time — a 10-year astronomical survey conducted by the Vera Rubin Observatory in Chile. It will image the entire visible sky repeatedly, producing the deepest wide-field catalog of galaxies, stars, and transient events ever made.'],
        ['What is DC2?',
          'Data Challenge 2 — a simulated dataset that mimics what LSST will produce, created by the Dark Energy Science Collaboration (DESC). It includes realistic noise, PSF, and atmospheric effects, with a truth catalog telling you exactly which sources are real.'],
      ] as [string, string][],
      bgCredit: 'Star chart: Yale Bright Star Catalogue (CDS V/50); constellation lines from d3-celestial by Olaf Frohn (BSD-3-Clause).',
    },
    'quorum': {
      need: 'Planning poker usually means a server in the middle — an account to create, a room to host, one more tool between you and a number.',
      tagline: 'Serverless planning poker — share a link, estimate together, no sign-up.',
      etymology: '(From Latin <em>quorum</em>, ‘of whom’.)',
      figure: 'A table of face-down cards: everyone plays their estimate at once and nobody sways the others; agreement appears when they turn over.',
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
      bench: 'open the table → quorum.univerlab.org',
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
    'facetmedia': {
      need: 'An agent can ask for a voice, a model or an image, but it cannot hear, see or measure what came back. The tool has to say whether the result passed.',
      tagline: 'Creation tools for agents, each in its own pinned environment, with every result verified.',
      etymology: '(From French <em>facette</em>, the small face of a cut stone, and Latin <em>media</em>.)',
      figure: 'A gem faceting machine: the rough stone goes in and comes out cut face by face, and each face is measured before the next one is polished.',
      thread: {
        problem: 'agents that make media blind',
        method: 'one verifiable --json contract over every tool',
        artifact: 'assets that carry their own record',
      },
      title: 'facetMedia — creation tools for AI agents, every result verified',
      description: 'Voice, audio, image and CAD tools for AI agents, each in its own pinned environment and run through one --json contract that verifies every asset.',
      koan: 'A stone is not cut all at once: one face, a measure, then the next.',
      lede: 'facet installs each creation tool in its own pinned environment, runs it through one <strong>--json</strong> contract and leaves beside every file its <strong>record</strong>: what made it, under which licence and whether it <strong>passed</strong>.',
      genesis: {
        kicker: 'Genesis',
        title: 'From the lab’s scripts to one contract.',
        body: 'facet began on 22 October 2026 in UniverLab’s graphics lab, where every tool (a voice, a CAD part, a banner) lived in its own script and its environment had to be rebuilt on every machine. The question was the usual one: how does an agent know that what it made is any good? facet’s answer is that every capability brings its own check, and every asset its record.',
      },
      headline: '— Creation tools for agents, each with its result verified',
      facets: 'Voice / Audio / Image / CAD / Text',
      release: 'In development · arrives with 0.1.0b1',
      capabilities: {
        kicker: 'Capabilities ↳',
        columns: ['No.', 'Capability', 'Facet', 'What it does', 'Verified by'] as string[],
        rows: [['kokoro.speak', 'voice', 'Narration from a script, on CPU', 'WER ≤ 5 %'], ['whisper.transcribe', 'voice', 'Transcription and timed subtitles', 'confidence / WER'], ['comfy.still / edit', 'image', 'An image from a prompt, or an edit of another', 'size / hash'], ['cad.solid / drawing', 'cad', 'A 3D part and a 2D drawing from a script', 'volume / audit'], ['ffmpeg.normalize', 'audio', 'Loudness and the music bed under the voice', '±1 LU']] as [string, string, string, string][],
      },
      record: {
        title: '— Every asset leaves its record',
        body: 'Beside every file stays a .facet.json: the capability, the package, the models, the parameters, the check and the licences. Yellow marks what was verified; nothing else carries that colour.',
        caption: 'Fig. 1 / the record of the plate on this page',
      },
      verbs: {
        title: '— Six verbs, nothing installed in the agent',
        items: [['skill', 'learns each tool from its skill, served on demand'], ['list', 'sees the capabilities by facet, with their weight'], ['doctor', 'checks the tool and the machine; every failure brings its fix'], ['run', 'makes from a piece and verifies every asset'], ['preview', 'reads the data of what failed and corrects it without ears or eyes'], ['check', 'judges an asset again against its record']] as [string, string][],
      },
      faq: {
        title: '— Questions',
        items: [['Can I use it yet?', 'Not outside the lab. 0.1.0b1 ships when it passes its acceptance test: a verified voice clip, in one command, in under five minutes and without a GPU, on a clean machine.'], ['What is a facet?', 'A field of creation: voice, audio, image, video, CAD, text or slides. A new facet arrives with a reviewed version of facet; a new tool inside a facet arrives through the registry.'], ['Why not Docker?', 'Each tool fits in a uv environment with its lock pinned and nothing installed on the system. It is lighter, especially on WSL.'], ['Who accepts the licences?', 'A person, once, with facet license accept. The record keeps who and when, and a non-commercial restriction carries over to whatever is made with that asset.'], ['Does it need a GPU?', 'Not for voice, audio, CAD or text. Image generation does, one job at a time.']] as [string, string][],
      },
    },
    'demostage': {
      need: 'Recording demos by hand is fiddly — typos, uneven pacing, dead air, and a prompt leaking your host.',
      tagline:
        'Demos as Code — capture, record and export reproducible terminal demos.',
      etymology: '(From <em>demo</em> and <em>stage</em>.)',
      figure: 'A zoetrope for the terminal: every demo is written like a score and plays back the same, frame by frame, like the gallop Muybridge broke apart so it could finally be seen.',
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
      bgCredit: 'Background: Eadweard Muybridge, The Horse in Motion, 1878 (public domain).',
    },
};
