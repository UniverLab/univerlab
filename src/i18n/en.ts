/** English copy. Single source of truth for all UI text.
 *  Documentation pulled from repositories stays English-only and is not
 *  part of this dictionary. */
export const en = {
  meta: {
    description:
      'Open-source computational lab. We build tools for AI agents, CLI, LaTeX, Git, and CAD-as-code — reproducible experiments, free knowledge.',
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
    repo: 'Star on GitHub ↗',
    docs: 'Documentation →',
    install: 'Install',
    copy: 'Copy',
    copied: 'Copied',
    allExperiments: 'All experiments →',
    inPreparation: 'in preparation',
    docsHome: 'Documentation',
    onThisExperiment: 'Experiment',
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
        'UniverLab is an open computational laboratory that groups experiments under the philosophy of <a href="/manifesto">Pensamiento Cósmico</a>, where a need becomes an open experiment, and that experiment becomes open knowledge — tools, datasets, papers.',
      ctaExperiments: 'Explore the experiments →',
      ctaManifesto: 'Read the manifesto →',
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
      kicker: '01 — Origin',
      title: 'It began with one experiment that learned to build the others.',
      body:
        'This isn’t a pile of repositories. It started as a handful of skills for everyday work — until one grew teeth and became <a href="/canopy">Canopy</a>, an agent system that, before long, was building Canopy itself, then every experiment after it. These tools aren’t products lined up for sale — they are open experiments that became tools because someone needed them, and stay open so others can learn from them.',
    },
    experiments: { kicker: '00 — Experiments' },
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
    closing: {
      kicker: '04 — Why',
      title: 'Not a lab about the universe. A lab of the universe.',
      body:
        'UniverLab exists to increase — even infinitesimally — the probability that knowledge and consciousness continue. Not software for its own sake, not AI for its own sake: tools that help the universe keep understanding itself. In practice, that means open-source CLIs you can install today, experiments you can reproduce, and docs that ship with the code.',
      manifesto: 'Read the manifesto →',
      contribute: 'Contribute on GitHub ↗',
    },
  },
  experimentsIndex: {
    kicker: 'Index',
    title: 'Experiments',
    description:
      'Active experiments at UniverLab: Canopy (AI agents), TexForge (LaTeX), GitKit, ghScaff, DemoStage, and more open-source tools.',
    intro:
      'The fundamental unit of UniverLab is the experiment. Experiments are not products — they are ongoing explorations. They may mature, stay active for decades, or grow into new research. Each one starts with a real need — usually one we ran into ourselves.',
  },
  experiments: {
    canopy: {
      need: 'Your AI agents forget everything between sessions — and they can\'t see what the others are doing.',
      tagline:
        'The runtime layer for AI agents that need memory, scheduling, and each other.',
      koan: 'In a forest, the canopy is where the crowns touch — separate trees, one living layer.',
      lede:
        'A Rust daemon and terminal UI that runs alongside your AI agents. It gives them <strong>persistent memory</strong> across sessions, <strong>background scheduling</strong> on cron and file events, a <strong>knowledge graph</strong> that learns from every run, and a <strong>sync protocol</strong> so multiple agents stop colliding in the same workspace.',
      genesis: {
        kicker: 'Genesis',
        title: 'The one that started it all.',
        body:
          'It started as a folder of <strong>skills</strong> for work. Then I noticed what nobody was talking about: agent harnesses shipped a <strong>headless</strong> mode, just sitting there unused. I wired cron jobs to fire tasks through it — too much for a skill, and the models of the day choked on the instructions. So it became an <strong>MCP</strong>: <em>task-trigger</em>. It worked, but it ran blind in the background; only the agent ever saw what happened. Not enough. I killed it and built a <strong>TUI</strong> — then scheduling, memory, sync, identities, and a new name. <strong>Canopy</strong>. By then the twist was complete: Canopy was building Canopy, and everything else in this lab.',
      },
      layer: {
        kicker: 'What it does',
        cols: [
          ['Memory that persists', 'Every session writes facts and patterns to a project-scoped knowledge graph. The next session reads them. Agents stop re-explaining the same codebase to themselves.'],
          ['Background scheduling', 'Agents run on cron schedules or file-change triggers — not just on demand. A daemon watches the workspace so you don\'t have to babysit.'],
          ['Multi-agent sync', 'Agents declare their mission, report stability, and broadcast messages. The workspace "vibe" is visible before anyone touches a file. No more silent collisions.'],
        ] as [string, string][],
      },
      platforms: {
        kicker: 'Supported platforms',
        items: [
          'Claude',
          'Codex',
          'Cursor',
          'Copilot',
          'Gemini',
          'Cline',
          'OpenCode',
          'Kiro',
          'Mistral',
          'Qwen',
          'MiMo',
          'Blackbox',
          'Kilo',
          'CN',
          'Antigravity',
        ],
      },
      loops: {
        kicker: 'Loop engine',
        title: 'Workflows that run themselves',
        body: 'Define a DAG — specs flow through agent, check, and gate nodes. The loop runs autonomously: implement, verify, review, commit. When it hits a wall, it pauses and asks you.',
        cols: [
          ['DAG-based automation', 'Define workflows as directed acyclic graphs: specs flow through agent, check, and gate nodes with pass/fail routing. Automate bug fixing, code review, and multi-step tasks.'],
          ['Background execution', 'Loops run autonomously in the background — implement, verify, review, commit. Each node has timeouts, retries, and a resilience agent that diagnoses failures.'],
          ['Human-in-the-loop', 'When automation hits a wall, the resilience agent reports a blocker and pauses. You decide; the loop resumes when you\'re ready.'],
        ] as [string, string][],
      },
      builder: {
        kicker: 'Loop engine',
        title: 'Watch a loop assemble itself',
        outro: 'Every node runs on the harness you pick. Mix vendors freely — the graph is yours to edit.',
        steps: [
          ['A spec meets an agent',
            'Work enters as a spec — role, what, how. An implementer node picks it up on whichever harness you choose.'],
          ['Deterministic gates',
            'A check node runs your real commands — build, lint, tests. Red routes back to the implementer; only green moves forward.'],
          ['Review on a second brain',
            'A different harness reviews the diff against the spec and commits. Same-vendor blind spots stay out of your branch.'],
          ['Failure is routed, not lost',
            'If the implementer dies mid-run, a resilience node triages it: glitches retry now; a quota death schedules the loop to wake itself at the exact reset time.'],
          ['Ensemble mode',
            'Fan the spec out to several models in parallel, wait for every proposal, and let an arbiter distill the consensus before a single line is implemented.'],
        ] as [string, string][],
      },
      faq: [
        ['What does Canopy actually do?',
          'Canopy orchestrates work across different AI coding harnesses — Claude, Codex, or any agent that runs in a terminal. It lets you use all your free tiers without learning each platform\'s commands, config, or MCP parsing. One daemon, all agents.'],
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
      koan: 'Movable type once took a workshop. Now it takes one binary.',
      figures: ['build pipeline', 'document graph', 'build map'],
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
      faq: [
        ['What problem does TexForge solve?',
          'Compiling LaTeX normally requires installing TeX Live (4+ GB), then separate tools for Mermaid, Graphviz, and D2 diagrams — each with its own setup. TexForge is a single ~15 MB binary that handles everything: scaffolding, linting, formatting, diagrams, and compilation.'],
        ['Can AI agents use TexForge to work with LaTeX?',
          'Yes. An agent can run `texforge build` without installing anything — the LaTeX engine downloads on first use. Errors are concise (not 1000-line logs), and diagrams render inside `.tex` files without Node.js or external tools.'],
        ['Does TexForge support Mermaid and D2 diagrams in LaTeX?',
          'Yes. Write a Mermaid, Graphviz, or D2 block directly in your `.tex` file. TexForge renders it to a figure at build time, in pure Rust, with no browser or Node.js required.'],
      ] as [string, string][],
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
      faq: [
        ['How do I prevent AI agents from making bad commits?',
          'GitKit sets up git hooks in one flow — conventional commits, secret detection, branch naming. Hooks run offline, embedded in the repo. Agents can\'t push code that doesn\'t compile or contains secrets.'],
        ['What are GitKit "builds"?',
          'A build saves your git configuration (hooks, ignore, attributes, config) as a reusable template. Apply it to any future project with one command — no need to reconfigure hooks for every repo.'],
      ] as [string, string][],
    },
    ghscaff: {
      need: 'Creating a GitHub repository properly is a dozen forgettable steps.',
      tagline:
        'An interactive wizard that scaffolds and enforces conventions on GitHub repositories.',
      koan: 'A building is only as straight as its scaffold.',
      lede:
        'ghScaff raises the whole structure in one conversational <strong>wizard</strong> — and because every operation is <strong>idempotent</strong>, it can re-level any existing repository without tearing it down.',
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
      faq: [
        ['How does ghScaff set up a GitHub repository?',
          'Run `ghscaff` — an interactive wizard that creates the repo, commits boilerplate (CI, README, license), sets branch protection, and enforces standard labels. One atomic commit, no manual steps.'],
        ['Why does ghScaff use an encrypted vault for tokens?',
          'Environment variables with tokens are easily exploitable — any process on your machine can read them. ghScaff encrypts tokens with XSalsa20-Poly1305, bound to your OS user and hostname. The vault prevents ghScaff from becoming an attack vector.'],
      ] as [string, string][],
    },
    cadspec: {
      need: 'CAD drawings carry no semantics — just lines on a canvas, impossible to diff, review or automate.',
      tagline:
        'CAD as code: declarative geometry compiled deterministically to DXF.',
      koan: 'The drawing is not drawn. It is declared.',
      lede:
        'cadSpec treats a CAD drawing like source code: geometry declared in <strong>TOML</strong>, previewed live in the browser, compiled to a <strong>bit-identical</strong> DXF every time. <code>git diff</code> works on drawings now.',
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
          'cadSpec is CAD as code for architects who need AI to help them draw. Declare geometry in TOML files, preview live in the browser, compile to bit-identical DXF. `git diff` works on drawings because the source is text.'],
        ['Can AI agents read and generate CAD drawings with cadSpec?',
          'Yes. cadSpec\'s TOML format is plain text that any LLM can read. Run `cadspec schema` to teach the language; previews include bounding boxes so agents can see the drawing.'],
      ] as [string, string][],
    },
    'astro-denoise': {
      need: 'Denoising an astronomical image can recover a faint galaxy — or invent one that was never there. There is no standard, reproducible way to tell which.',
      tagline:
        'A research proposal for benchmarking astronomical denoising — evaluated on the science it recovers, not how clean it looks.',
      koan: 'Frontier knowledge hides behind the noise…',
      lede:
        'A research proposal for benchmarking denoising methods on simulated Vera <strong>Rubin</strong> Observatory images. Any method — classical filter, trained network — plugs into the same protocol and is scored not by how clean the image looks, but by <em>what it does to the science</em>.',
      genesis: {
        kicker: 'Genesis',
        title: "A master's thesis in progress.",
        body:
          "This started as a master's thesis and is still taking shape. The first working version is in place: four open modules (metrics engine, BM3D and U-Net baselines, and an orchestrator with a terminal dashboard), a curated multi-band block of sky regions prepared for distribution on Hugging Face, a one-command scaffold so any researcher can plug in a new method, and initial BM3D-vs-U-Net comparisons with a proper train/eval split. The experiments are running — in the open, right here — but there is more work ahead before this becomes a finished benchmark.",
      },
      followLab: 'Follow the lab ↗',
      papersSoon: 'proposal out · curated dataset & first results in progress',
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
      koan: '// the estimate is already in the room',
      lede:
        'Quorum is <strong>planning poker</strong> — the estimation ritual agile teams use to size a backlog: each person plays a card, the votes flip at once, and the disagreement is where the useful conversation starts. It runs <strong>peer-to-peer</strong> over WebRTC, so a shared room link is the whole app — no cloud, no account. The deck <strong>auto-reveals</strong> once everyone has voted; drop off and the session stays alive — reconnect and the state syncs back from any peer still in the room.',
      genesis: {
        kicker: 'Genesis',
        title: 'One link, no server.',
        body:
          'Every estimation round meant routing the team through a server somewhere: create a room, share an invite, hope it still worked. The question was simple — what does planning poker look like if you remove the server entirely? The answer was a single URL. Open it and the browsers talk to each other directly, routing the signal through the BitTorrent tracker instead of a data centre. No host, nothing in the middle. It’s called Quorum for the rule it runs on: a quorum is the count a decision needs to be valid — so the cards stay hidden until everyone has played, then flip at once.',
      },
      how: {
        kicker: 'P2P session',
        items: [
          'Share the room URL — no sign-up, no invite flow.',
          'Pick a card from the Fibonacci deck (0, 1, 2, 3, 5, 8, 13, 21, ?).',
          'Cards auto-reveal the moment everyone votes — 3 s countdown so nothing surprises.',
          'Load a story list (paste or CSV) and step through stories in order.',
          'Disconnect and reconnect — state syncs back from any peer still in the room.',
        ],
      },
      faq: [
        ['Is Quorum free?',
          'Completely free. No accounts, no user limits, no premium tier. It\'s a P2P experiment in the browser — WebRTC connections, no server. Open the URL and start estimating.'],
        ['How does planning poker work without a server?',
          'Quorum uses peer-to-peer WebRTC connections. Your browser connects directly to your teammates\' browsers — no cloud, no database. A BitTorrent tracker handles the initial handshake; after that, data flows straight between peers.'],
        ['Can I use Quorum for remote sprint planning?',
          'Yes. Share the room URL with your team. Everyone picks a Fibonacci card (0, 1, 2, 3, 5, 8, 13, 21, ?). Cards auto-reveal simultaneously once everyone votes — a 3-second countdown prevents premature reveals.'],
        ['Does Quorum support story lists?',
          'Yes. Paste a story list or load a CSV. Step through stories in order, estimating each one. The session stays alive if someone disconnects — reconnect and state syncs from any peer still in the room.'],
        ['What makes Quorum different from planningpoker.com?',
          'No accounts, no user limits, no data stored on a server. Quorum is open-source and runs entirely in the browser via WebRTC. Your estimation data never leaves your team\'s devices.'],
      ] as [string, string][],
    },
    'demostage': {
      need: 'Recording demos by hand is fiddly — typos, uneven pacing, dead air, and a prompt leaking your host.',
      tagline:
        'Demos as Code — capture, record and export reproducible terminal demos.',
      koan: '// the demo is the source',
      lede:
        'DemoStage records a session as <strong>events</strong>, normalizes human imperfections into a clean <code>demo.toml</code> <strong>score</strong>, and compiles it to gif or mp4 — version-controlled, re-runnable and diffable.',
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
          '<code>export</code> — pure playback: render to gif or mp4 (no re-execution, ffmpeg/chromium auto-provisioned).',
          '<code>edit</code> — edit the timeline interactively; mark several steps and apply bulk changes.',
        ],
      },
      faq: [
        ['What is DemoStage?',
          'A tool for planning and recording multi-source demos — terminal, browser, and files in one scene. Not just screen recording: you configure typography, aspect ratio, fps, and terminal style. Output is optimized for web.'],
        ['Can I re-record a demo if something changes?',
          'Yes. `demostage capture` records events, not video. If the UX changes, re-capture and the demo updates deterministically — no need to manually re-record the whole thing.'],
        ['How is DemoStage different from asciinema?',
          'asciinema records raw terminal output. DemoStage records events, supports multiple sources (terminal + browser + files), normalizes imperfections, and compiles to gif/mp4. The source is a versionable TOML file.'],
      ] as [string, string][],
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
    you: 'You',
    us: 'Us',
    youDetail: 'the universe, observing itself',
    addressTitle: 'Your cosmic address',
    addressIntro: 'Zoom out',
    // Closing beat of the opening scene — names the wonder it has been building,
    // and hands off to the philosophy ("What we value…").
    wonder: 'And a part of it wonders that it exists.',
    address: [
      ['Earth', 'r ≈ 6 400 km'],
      ['Solar System', 'Ø ≈ 9 Tm'],
      ['Orion Arm', 'L ≈ 10 kly'],
      ['Milky Way', 'Ø ≈ 100 kly'],
      ['Local Group', 'Ø ≈ 10 Mly'],
      ['Laniakea', 'Ø ≈ 520 Mly'],
      ['Observable Universe', 'Ø ≈ 93 Gly'],
    ] as [string, string][],
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
    rising: 'Rising',
    falling: 'Falling',
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
      'Ideas that lived and were abandoned — each recorded with what it was and why it died. Not a roadmap, a record.',
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
    description:
      'The people and AI models behind UniverLab — founder, contributors, and the language models that work alongside us.',
    founder: {
      role: 'Founder',
      name: 'Jheison Martinez',
      body:
        'Electronic engineer and software-development specialist, now a master’s student in Artificial Intelligence. Reflective by nature — stoicism and positive nihilism, astronomy and biology — with his family as his greatest joy and the hope of teaching one day. For now he builds UniverLab’s open experiments and tools.',
      link: 'github.com/JheisonMB ↗',
      email: 'jheison.mb@univerlab.org',
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
