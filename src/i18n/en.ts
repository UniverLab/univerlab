/** English copy. Single source of truth for all UI text.
 *  Documentation pulled from repositories stays English-only and is not
 *  part of this dictionary. */
import { experiments } from './en-experiments.ts';

export const en = {
  meta: {
    // The home is the brand hub — it is the one page that can only win the
    // query "univerlab". Its title still names what the lab makes, so a reader
    // arriving from anywhere learns it in the tab, and so title and description
    // agree instead of describing two different things.
    title: 'Open-source tools for AI agents, LaTeX and git — UniverLab',
    description:
      'Open-source CLI tools for AI coding agents, LaTeX and git — one binary each, installable today, reproducible, with docs that ship alongside the code.',
  },
  nav: {
    experiments: 'Experiments',
    manifesto: 'Manifesto',
    people: 'Collaborators',
    github: 'GitHub',
    sponsors: 'sponsor',
    log: 'Status',
    api: 'API',
    archive: 'Archive',
    roadmap: 'Roadmap',
    workbench: 'Workbench',
    observable: 'The Observable',
  },
  header: {
    // The sky body's click names the action it will do: the body showing now
    // is the sun → switch to night, the moon → switch to day.
    skyToNight: 'Switch to the night theme',
    skyToDay: 'Switch to the day theme',
    // The page-turn language switch: the corner shows the other language.
    switchTo: 'Switch to',
    langLabel: { en: 'English', es: 'Español' },
    // The mailbox at the end of the header rule and the letters it delivers.
    mailbox: {
      open: 'Mailbox: {n} new letters',
      openOne: 'Mailbox: one new letter',
      openNone: 'Mailbox: no new letters',
      close: 'Close the letter',
      stage: 'The letter: turn it over and break the seal',
      hintFlip: '',
      hintFlipTouch: '',
      hintSeal: '',
      hintSealTouch: '',
      next: 'Next letter ({n}) →',
      bandPast: 'Mail from the past',
      bandLab: 'Lab mail',
      postmarkPast: 'MAIL FROM THE PAST · UNIVERLAB',
      postmarkLab: 'LAB MAIL · UNIVERLAB',
      stampYears: '{years} YEARS',
      addrNamePast: 'To whoever looks at the sky',
      addrDatePast: 'on {day}, {year}',
      addrNameLab: 'To whoever follows the lab',
      addrLab: '{name}, {exp}',
      headPast: 'Letter of {day}, {year}',
      onWay: '{years} years on its way',
      today: 'Today',
      readWikipedia: 'Read on Wikipedia →',
      continuesWikipedia: 'Continues on Wikipedia →',
      allToday: 'See the newspaper →',
      readAnnouncement: 'Read the full announcement →',
    },
  },
  // The command palette (catalog card), its theme card and the paper slips:
  // the strings the console script reads from the inlined JSON. The theme
  // names stay English in both languages — they are the three grounds.
  console: {
    drawer: 'fichero · univerlab',
    themeDrawer: 'ficha 2 · temas',
    placeholder: 'type a command…',
    themePlaceholder: 'choose a theme',
    keys: 'Tab completes · ↑↓ moves · Enter',
    esc: 'Esc puts it back',
    theme: { circadian: 'Circadian', papyrus: 'Papyrus', slate: 'Slate' },
    answer: 'The Answer to the Ultimate Question of Life, the Universe, and Everything.',
    guide: "The Hitchhiker's Guide to the Galaxy",
    belowSurface: 'You went below the surface.',
    pullRequest: 'The next great discovery is one pull request.',
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
    // Experiment pages only: the colophon credits line above the seal.
    forged: 'Artifact conceived and forged at UniverLab',
    cta: 'Workbench · free first call →',
    operator: 'UniverLab is run by Jheison Martinez Bolivar, Colombia.',
    copyright: '© 2026 Jheison Martinez Bolivar',
    licenseName: 'Apache-2.0',
    groups: { work: 'Experiments', lab: 'The lab' },
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
    cite: 'Cite',
    citeTitle: 'How to cite',
    license: 'License',
  },
  status: {
    active: 'active',
    beta: 'beta',
    research: 'research',
    archived: 'archived',
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
    // Home frontispiece, Plate I and the bench (redesign 2026-10-22).
    frontis: {
      sub: 'Open computational laboratory',
    },
    plate: {
      lead: 'Plate I',
      title: 'The lab’s lantern',
    },
    lanternLink: 'See them in the projection room →',
    workbench: {
      kicker: 'The Workbench',
      text: 'The tools are open; the hands that built them can be booked. A free 15-minute call, then consultations, audits and agentic flows built for you.',
      link: 'Visit the Workbench →',
    },
    about: {
      kicker: 'About the lab',
    },
    lantern: {
      pause: 'Pause the lantern',
      resume: 'Resume the lantern',
      paused: 'Paused',
      benchLabel: 'The room: point at a machine to project it, click to open its page.',
      alt: 'An engraved magic lantern projecting onto a cloth screen',
      open: ' · click the screen to open it',
      worldHint: {
        canopy: 'seeds the hive automaton',
        texforge: 'the cursor is the ink roller',
        gitkit: 'linger on the reed and it ears in pink',
        ghscaff: 'the lantern draws the scaffold',
        'astro-denoise': 'the sky turns; the cursor shifts it',
        demostage: 'the cursor is the gallop crank',
        quorum: 'the cursor reveals the draughtsman’s plate',
        facetmedia: 'rest the cursor and the arm cuts a gem',
      },
    },
    lineage: {
      kicker: '01 — Origin',
      title: 'It began with one experiment that learned to build the others.',
      body:
        'This isn’t a pile of repositories. It started as a handful of skills for everyday work — until one grew teeth and became <a href="/canopy/">Canopy</a>, an agent system that, before long, was building Canopy itself, then every experiment after it. These tools aren’t products lined up for sale — they are open experiments that became tools because someone needed them, and stay open so others can learn from them.',
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
      roadmap: 'The roadmap, item by item →',
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
  experiments,
  manifesto: {
    kicker: 'Manifesto',
    title: 'Pensamiento Cósmico',
    // `<title>`/og:title only — `title` above is the visible <h1> and must stay.
    metaTitle: 'Pensamiento Cósmico — the UniverLab manifesto',
    sub: 'A philosophy for the present and a heuristic of transcendence',
    // The paper itself, citable: a PDF on papers.univerlab.org (R2). Opens in
    // a new tab; the MIME type is declared so the browser renders, not
    // downloads, it.
    paper: 'Read the paper: Pensamiento Cósmico (PDF) ↗',
    // Paper showcase plate: the citable form (PDF) plus the concept DOI — the
    // DOI to cite (per Intelligence 8a70c979).
    paperShowcaseBlurb:
      'The published, citable form of this argument: the full essay, references and DOI included.',
    paperDoiLabel: 'Concept DOI — cite this one: 10.5281/zenodo.23503658',
    description:
      'Pensamiento Cósmico: we are part of the universe’s material history; from there, an orientation for acting with perspective and revisable heuristics.',
    epigraph: '«Keep perspective, and strive by heuristics.»',
    // Living-document header data. Version + date are invariant facts, not
    // prose; "living document" is the only localised word. The Sol and the
    // year are computed at render time from `docDate` (mission-time.ts),
    // never typed into the dictionary. v4 follows the 19 October 2026 paper:
    // it replaces v3's hierarchy, imperatives and pillars, which the paper
    // corrected.
    docStatus: 'living document',
    docVersion: '4.0',
    docDate: '2026-10-26',
    // The folded index's label below 1100px.
    toc: 'Contents',
    lead:
      'Losing a shared explanation of the world does not force the conclusion that life has no orientation. It leaves a practical question: how to act when no one is coming to rescue us and no meaning is guaranteed in advance. This is an answer from the cosmic perspective: the universe is not a stage set in front of us; we are part of its material history, and knowing it is a local possibility that arose within it.',
    dissipativeTitle: 'Dissipative islands',
    dissipative: [
      'A living organism sustains a local order it could not keep in isolation: it takes in matter and energy, transforms them, and returns heat and waste to its surroundings. It is no exception to the second law of thermodynamics; it depends on flows that obey it. Each life is a dissipative island: organised, situated and temporary.',
      'The membrane — skin, senses, attention — is the boundary that sets a body apart from its surroundings without making it independent of them. It is permeable, active, and dependent on what lies outside it.',
      'Beneath every deliberation lies the belly: the need to feed, to keep oneself and to reproduce. Reason does not appear outside that condition; it regulates it and sometimes reorders its priorities. Brains, language, tools and collective memory allow a partial escape from the belly: spending energy on what does not meet an immediate need. In that surplus, one part of the universe represents other parts and can revise its own actions.',
    ],
    dissipativeQuote: 'The cosmos studies itself.',
    dissipativeGloss:
      'Not because the universe has a mind, but because those who study it are made of the same matter they study.',
    // Labels of the membrane plate.
    membrane: { inflow: 'matter and energy', outflow: 'heat and waste', wall: 'membrane', world: 'surroundings' },
    otherTitle: 'The other is us',
    other: [
      'If there is no human substance set apart from the rest of the universe, each person is a singular configuration of a common reality. But sharing an origin is not sharing an experience: each life receives the world through its own membrane and cannot inhabit another’s perspective.',
      '“The other is us” expresses that continuity without erasing the difference. The other is not a copy of me, nor a piece of a collective consciousness: it is another instance of the same world, from which that world is felt differently.',
      'In the egocentric circle, one imagines oneself as the centre and orders everything around oneself. In the ellipse, two foci hold the figure: the self remains, but it is no longer the only point that gives meaning.',
      'Altruism does not follow from material unity. It takes an explicit premise: the wellbeing and suffering of others count, even when I do not live them. With it, cooperation stops being a slogan and becomes a condition of lives that sustain one another, without dissolving each person’s responsibility for what they do.',
    ],
    // Labels of the circle-and-ellipse plate.
    foci: { circle: 'circle · one centre', ellipse: 'ellipse · two foci', self: 'self', other: 'the other' },
    ethicsTitle: 'A heuristic ethics',
    ethicsIntro:
      'Keeping perspective means placing a decision on more than one scale: the immediate need, the lives of those around us, and the conditions that sustain knowledge and cooperation. Striving by heuristics means acting on revisable rules of thumb when the consequences are uncertain. Three questions to examine an action:',
    heuristics: [
      ['H1', 'Self-construction', 'Does this lead me toward the self — or the us — we want to be?'],
      ['H2', 'Viable technology', 'Does this build tools and capacities that widen our room to act, including, in the long run, not depending on a single planet?'],
      ['H3', 'Operative altruism', 'Does this improve someone else’s living conditions or reduce suffering?'],
    ] as [string, string, string][],
    heuristicsCheck:
      'The questions correct one another: technology without orientation widens harm; self-construction without others turns into self-absorption; help that cannot sustain itself soon runs out.',
    nihilismLabel: 'The eraser of nihilism',
    nihilismQuestion: 'How many people live better because you exist?',
    nihilismBody:
      'It turns no one into a number and asks no sacrifice to justify a life. It is a heuristic against paralysing abstraction: look for verifiable effects on the wellbeing of others, from caring for a community to sharing knowledge others can use.',
    ethicsLimit:
      'A heuristic can fail: the impact may be ambiguous, unevenly shared, or hide paternalism. The three questions do not replace deliberation, evidence or accountability; they show what is being built and whom it reaches.',
    partialTitle: 'Transcendence and partial success',
    partial: [
      'Earth is not a home guaranteed forever: the Sun has about five billion years left before it swells into a red giant. That horizon does not make space expansion urgent, nor does it guarantee we survive; it does mean that any project that values the continuity of life must acknowledge the planet’s limits.',
      'Interplanetary transcendence names a technological and political possibility, not a destiny: building, through sustained cooperation, the conditions for life not to depend forever on a single planet. The ethical question comes before the technical feat: which forms of life we want to preserve, and which present costs we are willing to impose.',
      'Artificial intelligence is an artefact of our history: an instrumental extension and a symbolic memory of a human culture. Changing substrate does not remove fragility; machines fail in their own ways. That is why biological continuity remains the primary goal.',
      'If that goal failed and machines carrying our memory and our imperatives persisted, it would be a partial success: the continuity of an inheritance, not of those who lived it. The forest that survives the fall of the mother tree keeps something real; it does not bring the tree back.',
    ],
    partialQuote: 'Preserving a work is not preserving its authors.',
    provenanceTitle: 'Where each claim comes from',
    provenanceIntro:
      'The argument mixes science, metaphor and values, but does not treat them as interchangeable. Thermodynamics describes conditions of organisation; it deduces no duty. Monism expresses material continuity; it does not prove that all experiences are one. Each statement declares where it comes from, so it can be attacked on its own:',
    provenance: [
      ['Empirical base', 'Organisms are open systems that sustain local order through exchanges with their surroundings (Schrödinger; Nicolis and Prigogine). It describes; it does not prescribe.'],
      ['Postulates O1–O3', 'Material continuity: we are not observers outside the cosmos. The organism as a dissipative organisation with a membrane. Each other as a distinct perspective within a shared reality.'],
      ['Ethical premises E1–E2', 'E1: the wellbeing and suffering of others count morally. E2: the continuity of biological life takes priority over keeping only its records or artefacts. They are declared values, not conclusions of physics.'],
      ['Heuristics H1–H3', 'Self-construction, viable technology and operative altruism: questions for applying E1–E2 under uncertainty. They are not laws.'],
      ['Conclusions', 'The theses on artificial intelligence, interplanetary expansion and partial success depend on all of the above: they are revised if the evidence changes or a premise is rejected.'],
    ] as [string, string][],
    // The plate's dashed arrow: duty does not follow from physics.
    provenanceGap: 'needs an added premise',
    limitsTitle: 'What it does not prove',
    limits: [
      'Monism does not prove an ethics.',
      'Heuristics do not settle every conflict.',
      'Interplanetary exploration remains uncertain.',
      'Artificial continuity is not human continuity.',
    ],
    limitsNote:
      'Making these limits explicit keeps hope from turning into certainty. An idea that cannot be refuted cannot be upheld either.',
    practiceTitle: 'The practice',
    practice: [
      'Cosmic thinking begins with a location — we are material organisms, sustained by exchanges, with a limited perspective and dependent on other lives — and proposes a modest and demanding task: regulate immediate needs, build relationships where the other counts, and choose tools that increase our collective capacity to understand and act.',
      'UniverLab is one such practice when it works as an open laboratory. Sharing code, documentation, experiments and tools lets knowledge circulate and be carried on by people other than those who produced it. Open science does not by itself secure justice or transcendence, but it makes one form of altruism operative: pooling cognitive resources and lowering the cost for others to learn and build.',
    ],
    practiceQuote: 'Not a laboratory about the universe, but a laboratory of the universe.',
    worksTitle: 'In development',
    worksBody:
      'The published essay that develops this argument, and a long-term work that traces where the idea was born. The work is at a very early stage, with no set date.',
    worksBadge: 'Long-term',
    works: [
      ['Eco del Silencio', 'The lived path, told as a collection of stories — “Un Viaje Introspectivo a la Esencia Humana”. The events and turns (fear, freedom, community) that led to Pensamiento Cósmico. Not the argument, but the experience the argument grew out of.'],
    ] as [string, string][],
    closing:
      'Keeping perspective and striving by heuristics means, in the end, working in the present for lives that can be lived better, and for knowledge that does not end with a single person or a single generation.',
    why: 'This is why the lab exists.',
  },
  // The Fundamentos refutation map's copy — data only: the map left the page
  // with the paper redesign (the citable paper carries the developed
  // argument), and refutation.test.ts guards this dictionary with the graph.
  // The graph (ids, kinds, deps) lives in src/data/fundamentos.ts, keyed by the
  // same ids. Statements are condensed from the source §§1-4, tag-free so the
  // i18n tag-parity check stays trivially satisfied.
  fundamentos: {
    label: 'Where to attack it',
    intro:
      'The manifesto is the narrative. Underneath it is a system — definitions, axioms, propositions — written to be attacked point by point. Pick an axiom and reject it: see what falls.',
    closingQuote:
      'A system that offers no place to attack it is not a philosophy, it is a belief.',
    restsOn: 'Rests on',
    supports: 'Supports',
    empirical: 'empirical',
    revisableNote:
      'A revisable empirical claim — if another medium were found, this axiom is replaced, not the system.',
    valueNote: 'A value position — what this system chooses to hold valuable.',
    rejectLabel: 'Reject',
    restoreLabel: 'Restore',
    fallSentence: 'Reject {id}: {n} pieces fall; {stands} still stand.',
    rewriteSentence: 'Reject {id}: nothing falls; {rewritten} is rewritten to invoke the new medium.',
    andWord: 'and',
    selectPrompt: 'Select a piece to see what it rests on and what rests on it.',
    rows: {
      definition: 'Definitions',
      axiom: 'Axioms',
      proposition: 'Propositions',
      corollary: 'Corollaries',
    },
    nodes: {
      D1: { name: 'Consciousness', statement: 'A system\u2019s capacity to hold a perspective from which the universe can be represented.' },
      D2: { name: 'Perspective', statement: 'Each particular consciousness as a unique, unrepeatable way of representing the universe.' },
      D3: { name: 'Substrate', statement: 'The physical support instantiating a consciousness; value lies in consciousness, not its support.' },
      D4: { name: 'Continuity', statement: 'Persistence of consciousness and knowledge across time, space and substrates.' },
      D5: { name: 'Knowledge', statement: 'What perspectives extract, accumulate and transmit about the universe; cumulative and transferable between consciousnesses.' },
      D6: { name: 'Wonder', statement: 'A consciousness\u2019s recognition of how improbable and extraordinary its own existence is.' },
      A0: { name: 'Axiom of Wonder', statement: 'Wonder at the existence of consciousness is the root of all motivation for continuity.' },
      A1: { name: 'Axiom of Consciousness', statement: 'Consciousness is the most extraordinary known phenomenon in the universe.' },
      A2: { name: 'Axiom of Perspective', statement: 'Each consciousness represents a unique, unrepeatable perspective from which the universe can be known.' },
      A3: { name: 'Axiom of Vulnerability', statement: 'Every consciousness is temporal and vulnerable: it can go extinct, and its perspective with it.' },
      A4: { name: 'Axiom of the Medium', statement: 'As far as we know, only technological intelligence can significantly raise the probability of continuity beyond planetary and biological limits.' },
      P1: { name: 'Substrate independence', statement: 'If what matters is consciousness and not its support, a consciousness\u2019s value does not depend on a biological substrate.' },
      P2: { name: 'Value hierarchy', statement: 'The priority order is: consciousness, intelligent life, knowledge — because perspectives are not transferable.' },
      P3: { name: 'Imperative of Continuity', statement: 'If we value consciousness and it is vulnerable, there is an ethical responsibility to increase its continuity wherever possible.' },
      P4: { name: 'Technological Imperative', statement: 'Technology is the only means able to extend continuity; developing and sharing it is an ethical duty.' },
      P5: { name: 'Duty of education', statement: 'As consciousnesses are temporary but knowledge is transferable, education is continuity in time.' },
      P6: { name: 'Duty of exploration', statement: 'Concentrating consciousness on a single planet maximizes vulnerability; exploring is continuity in space.' },
      P7: { name: 'Place of artificial intelligence', statement: 'If consciousness is substrate-independent, conscious AI is a legitimate fulfillment of the imperative.' },
      P8: { name: 'Cooperation and forgiveness', statement: 'Every conflict destroying a perspective subtracts value and continuity; cooperating is the system\u2019s optimum.' },
      P9: { name: 'Love and community', statement: 'Bonds between consciousnesses sustain vulnerable perspectives and create conditions for new ones.' },
      P10: { name: 'Univerlab', statement: 'An open laboratory producing and sharing tools, knowledge and education instantiates the Imperative of Continuity.' },
      C1: { name: 'Against biological chauvinism', statement: 'Preferring the biological for being biological, over a greater consciousness, is incoherent with the system.' },
      C2: { name: 'Partial success', statement: 'A future of only artificial consciousnesses that understand and preserve history counts as partial success.' },
      C3: { name: 'Technology is a means, not an end', statement: 'Technology is never the ultimate value: if it stopped serving continuity, it would stop being a duty.' },
      C4: { name: 'Openness as obligation', statement: 'If knowledge is continuity, keeping it closed contradicts the imperative: sharing is coherence.' },
    } as Record<string, { name: string; statement: string }>,
  },
  cosmos: {
    kicker: 'The cosmic perspective',
    intro:
      'Two scales that are usually kept apart. On the physical one, human life takes up a small and brief region of the universe. On the scale of experience, that region holds memory, cooperation and questions about the whole it belongs to. The disproportion does not prove we are irrelevant: it asks what value can be built without mistaking size for importance.',
    // The animated plate: it pulls back with the scroll, from the observer to
    // the observable universe, then compresses deep time down to one life.
    hint: 'Scroll: the plate pulls back.',
    usScale: 'h ≈ 1.7 m',
    timelineTitle: 'Deep time',
    // Deep time as a list of spans: [duration, what it measures], biggest
    // first, read as typography (mono span over serif name).
    timescales: [
      ['13.8 billion years', 'The age of the universe'],
      ['4.6 billion years', "The Sun's lifetime"],
      ['4.5 billion years', "Earth's existence"],
      ['3.8 billion years', 'Life on Earth'],
      ['300,000 years', 'Our species'],
      ['80 years', 'A human life'],
    ] as [string, string][],
    us: 'Us',
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
    // Footer easter egg — the one software metaphor on the site. Clicking the
    // branch reveals the universe's latest commit (hardcoded English in Footer,
    // since git output is never localized).
    branch: 'branch: milky-way/orion',
    branchTooltip:
      'The Orion Arm of the Milky Way — the line of cosmic history we are committed to.',
  },
  observatory: {
    kicker: 'Observatory',
    intro:
      'Continuity is not only philosophy: it leaves measurable traces. Four series, chosen not for optimism but for honesty: what is growing, and what we are losing.',
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
    archive: {
      heading: 'Built and archived',
      neverHeading: 'Never built',
      wasBeta: 'was beta',
      repo: 'Archived repository',
      labels: {
        built: 'What was built',
        learned: 'What we learned',
        closed: 'Why it closed',
        instead: 'Use instead',
      },
      cadspec: {
        built: 'A CAD-as-code CLI and Rust library. Two-dimensional geometry is declared in <code>.cf</code> TOML files (layers, arrays and mirrors, dimensions). <code>cadspec serve</code> previews it live in the browser; the tool validates and formats the source and compiles it to DXF, with PNG and SVG previews for AI agents. Shipped as 0.1.0 betas.',
        learned: 'Declared sources diff and review cleanly, and the same source always compiles to the same DXF. The hard part was not the format. It was everything around the drawing: the viewer, the validation, and the interop with the tools people already use.',
        closed: 'Existing tools already cover this better. ezdxf does 2D DXF from code, CadQuery does 3D, OpenSCAD has its own scripts and libraries, and FreeCAD has an MCP server. cadSpec could not compete with them, so no more tokens go into it.',
        instead: 'ezdxf for 2D DXF. CadQuery for 3D parametric models. OpenSCAD for scripted solids. FreeCAD with its MCP server for agent-driven CAD.',
      },
    },
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
        why: 'Shelved at first: exposing a daemon to the network — even on localhost — needs auth, encryption and a considered threat model, and none of that existed. It came back in the right order. Canopy now ships remote control built peer to peer: one pairing command, sessions over WebRTC with end-to-end encryption, and a relay that only carries signalling. No mobile app was needed — it runs in the phone’s browser.',
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
      email: 'hola@univerlab.org',
    },
    ai: {
      role: 'AI collaborators',
      name: 'Language models',
      body:
        'The laboratory works with open and proprietary language models as co-participants: drafting code, reviewing documentation, and running as agents inside <a href="/canopy/">Canopy</a>. Their role is acknowledged, not hidden.',
      models: ['Muse', 'MiMo', 'Claude', 'Qwen', 'DeepSeek', 'Gemini', 'GPT', 'Grok', 'Composer', 'GLM', 'Kimi', 'MiniMax', 'Mistral', 'LongCat', 'Nemotron'],
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
  postcards: {
    api: 'An engraved set of speaking tubes with brass mouthpieces above a wooden desk, joined by a network of bent pipes',
    archive: 'An engraved glass-front cabinet with dust sheets draped over brass instruments on its shelves and a carved plinth below',
    contributors: 'An engraved meeting room with a long table holding an open ledger, chairs along both sides and three empty picture frames',
    experiments: 'An engraved wall of labelled drawers with a leaning ladder beside them',
    feed: 'An engraved desk with a duplicating press, a typewriter and printed sheets on a wire',
    manifesto: 'An engraved observatory dome open to the stars with a telescope on a tripod',
    'not-found': 'An engraved torn sea chart with a corner gone, dividers resting over the water',
    roadmap: 'An engraved drafting table with a half-drawn sea chart, a compass rose, rolled maps, dividers and a globe',
    status: 'An engraved desk with a ticker under a glass dome, an open ledger and a brass lamp',
    today: 'An engraved armillary sphere beside a stone sundial on a cobbled floor',
  },
  // The 404: the edge of the known world — the kraken chart, its warning and
  // the two ways back. The kicker and the Latin title are the same in every
  // language; they live here so no visible string sits outside the dictionary.
  notFound: {
    kicker: '404 · terra incognita',
    title: 'Hic sunt dracones',
    line: 'This page is on no map. Beyond here, only monsters.',
    alt: 'An antique engraved sea chart fading into blank parchment, where a giant kraken rises from the waves',
    back: '← Back to the hall',
    lantern: 'The projection room →',
  },
  roadmap: {
    lanes: { now: 'Now', next: 'Next', later: 'Later', idea: 'Idea', done: 'Done' },
    hold: 'hold',
    entriesMeta: '{n} log entries · last Sol {sol}',
    entriesMetaOne: '1 log entry · last Sol {sol}',
    landed: 'landed Sol {sol}',
    more: '+{n} more',
    showAll: 'see all',
    showLess: 'show less',
    clearRoadmapFilter: 'Clear roadmap filter',
    empty: 'Nothing on the roadmap yet.',
    emptyTopic: 'Nothing on the roadmap under {topic}.',
    unavailable: 'Roadmap unavailable.',
    statusFeedLink: 'Logbook →',
    roadmapLink: 'Roadmap →',
  },
  labStrip: { lab: 'UniverLab · open laboratory' },
  sites: { nav: 'UniverLab sites' },
  plate: { roadmap: 'roadmap', lastLog: 'last log', none: '—', release: 'release' },
  hints: { palette: 'Press <kbd>/</kbd> for commands', themeMark: 'The sun and the moon at the top switch between day and night', branch: 'The branch label opens a small terminal trace' },
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
    statusLink: 'Logbook →',
  },
  feed: {
    kicker: 'Feed',
    title: 'Follow the Logbook in your RSS reader — UniverLab',
    description: 'The UniverLab Logbook is published as an RSS feed you can follow from your own reader — any reader works, just paste the URL and stay current.',
    heading: 'RSS',
    intro: 'The Logbook is published as an RSS feed you can follow from your own reader.',
    copy: 'Copy',
    copied: 'Copied',
    hint: 'Any RSS reader works — no specific app needed, just paste the URL.',
  },
  api: {
    title: 'UniverLab announcements API — endpoints and examples',
    description:
      'Every route of the public announcements API — the Logbook and the roadmap — with its parameters, its response shape and a curl example you can run today.',
    kicker: 'API',
    heading: 'Announcements API',
    intro:
      'The public API behind the Logbook and the roadmap on this site. Every route listed here is an unauthenticated, read-only GET: there is no account, no key and nothing to arrange before calling it. Read what you like, as often as you like.',
    baseLabel: 'Base URL',
    baseNote: 'Anonymous, read-only GET. Every response carries the CORS origin this site runs on.',
    endpointsLabel: 'Endpoints',
    parametersLabel: 'Parameters',
    noneLabel: 'This route takes no parameters.',
    exampleLabel: 'Example',
    responseLabel: 'Response',
    optionalLabel: 'optional',
    requiredLabel: 'required',
    specLabel: 'OpenAPI document',
    specNote:
      'This page is generated at build time from the OpenAPI 3.1 description of the same API, so the page and the description cannot drift. Fetch it for the machine-readable version of everything above.',
    catalogLabel: 'API catalog',
    catalogNote:
      'The RFC 9727 catalog that advertises this API to agents.',
    authLabel: 'auth.md',
    authNote:
      'The file that states plainly that there is nothing to register for here, and what is asked of a client that reads this API.',
    mcpHeading: 'MCP server',
    mcpIntro:
      'The same four read-only tools this site exposes to a browser agent are also served from a real remote MCP server — stateless Streamable HTTP. Point any MCP client at the endpoint:',
    mcpEndpointLabel: 'Endpoint',
    mcpClientLabel: 'Add it with the Claude Code CLI',
    mcpConfigLabel: 'Or in any MCP client’s JSON config',
    mcpCardLabel: 'Server Card',
    mcpCardNote: 'The MCP Server Card (SEP-2127) that advertises this server to agents.',
  },
  lanternRoom: {
    title: 'Experiments — the UniverLab lantern, every tool projected',
    description:
      'The lab’s magic lantern: point at a machine to project its experiment on the screen, then open its page. Every open tool and research project of UniverLab.',
    head: 'The projection room',
    intro: 'Point at a machine and the lantern projects it. Click it to open its page.',
  },
  encyclopedia: {
    tome: 'Volume I · The lab’s experiments',
    intro: 'Every experiment of the lab, each with its machine: the tools you can install today, the research in progress, and what was archived.',
    tabs: {
      aria: 'Filter by status',
      all: 'All',
      active: 'Active',
      research: 'Research',
      archived: 'Archive',
    },
    statuses: {
      active: 'active',
      beta: 'beta',
      research: 'research',
      archived: 'archived',
    },
    meta: 'EXP-{n} · {status}',
    definitionNumber: '1.',
    definitionNumber2: '2.',
    figLabel: 'fig.',
    use: {
      copy: 'Copy',
      copied: 'Copied',
      plate: 'Learn more →',
      open: 'Open {name}',
      archive: 'See in the archive →',
      repo: 'Repository ↗',
      quorum: 'open the table → quorum.univerlab.org',
      research: 'research state',
    },
    key: '§ active · ‡ beta · ¶ research · † archived',
    titleStatus: {
      active: 'active',
      beta: 'beta',
      research: 'research',
      archived: 'archived',
    },
  },
  today: {
    path: 'univerlab.org/newspaper',
    edition: "Today's edition",
    editionPast: 'Edition of {date}',
    name: 'The Observable',
    motto: 'Letters of science arriving today, after years on their way',
    banner: 'SCIENCE LETTERS FOR TODAY!',
    sol: 'Sol',
    counts: '{n} letters from the past · {m} from the lab',
    labKicker: 'Lab mail · today',
    labLink: 'Read the full announcement →',
    tabs: { p1: 'Page 1', p2: 'Page 2 · Lab news' },
    labPage: {
      heading: 'Lab news',
      older: 'Older entries',
      all: 'All',
      view: 'View →',
      unavailable: 'The lab mail did not arrive — try again later.',
      coupons: { kicker: 'Clip-out coupons', cut: 'cut here' },
    },
    leadKicker: 'Letter of the day · {years} years ago',
    readOn: 'Read on Wikipedia →',
    wikiLink: 'Wikipedia →',
    events: 'Events',
    births: 'Births',
    deaths: 'Deaths',
    aside: 'Also on this day',
    more: 'Show {n} more',
    continued: 'continued',
    price: 'Price: free',
    types: { launch: 'launch', note: 'note', update: 'update', deploy: 'deploy', bugfix: 'bugfix', incident: 'incident' },
    ago: {
      event: '{years} years ago',
      born: 'born {years} years ago',
      died: 'died {years} years ago',
    },
    caption: '{name} · Wikimedia Commons',
    colophon:
      'Data comes from Wikipedia’s “On this day”, filtered to science; photos from Wikimedia Commons, printed in halftone. Each letter carries its year as a postmark.',
    loading: 'Setting the type…',
    empty: 'No science events for today.',
    error: 'Failed to load the day’s letters.',
    pick: { label: 'Edition of', go: 'Print', prev: 'Previous day', next: 'Next day' },
    plate: "The sundial, the paper's engraving",
    labPlate: "The ticker, the paper's engraving",
    ads: {
      label: 'Notice',
      workbench: {
        head: 'The Workbench',
        lines: [
          'Counsel on artificial intelligence and Agent Experience',
          'First call free · a quarter of an hour',
        ],
        tail: 'Write to us on WhatsApp',
        link: 'Open the Workbench',
      },
      audits: {
        head: 'Audits of the Workbench',
        lines: [
          'How your team uses artificial intelligence, reviewed with rigour',
          'Findings with evidence · risk chart · roadmap',
        ],
        tail: 'From USD 400 · dedicated page, PDF report and repository',
        link: 'Read the audits',
      },
      install: {
        head: 'The lab’s machines, on your desk',
        cmd1: 'Canopy',
        cmd2: 'facetMedia',
        link: 'Take them home',
      },
      collab: {
        head: 'Correspondents wanted',
        lines: [
          'Every experiment takes issues and focused pull requests',
          'Your help is genuinely welcome',
        ],
        tail: 'UniverLab · open source',
        link: 'Join the contributors',
      },
    },
  },
  audit: {
    contents: 'Contents',
    deliverables: 'Deliverables',
    downloadPdf: 'Download the report (PDF)',
    downloadBundle: 'Download the asset bundle',
    repository: 'Code repository',
    openRepository: 'Open the repository',
    repositoryInvite: 'Access is by invitation — ask UniverLab for yours.',
    findings: 'Findings',
    annexes: 'Annexes',
    annexUsage: 'Usage',
    meta: { client: 'Client', auditors: 'Auditors', period: 'Period', version: 'Version', status: 'Status' },
    status: { draft: 'draft', delivered: 'delivered', final: 'final' },
    filters: { all: 'All', severity: 'Severity', status: 'Status' },
    severity: { critical: 'critical', high: 'high', medium: 'medium', low: 'low', info: 'info' },
    findingStatus: { open: 'open', fixed: 'fixed', accepted: 'accepted', 'wont-fix': 'won’t fix' },
    finding: { evidence: 'Evidence', recommendation: 'Recommendation', effort: 'Effort', cost: 'Cost', fixedIn: 'Fixed in' },
    effort: { small: 'small', medium: 'medium', large: 'large' },
    sources: 'Sources',
    back: 'Back to the reference ↑',
    showStep: 'Show step {n}',
    chartFallback: 'Chart data is available in the downloadable bundle.',
    codeCopy: 'Copy',
    codeCopied: 'Copied',
    published: {
      issued: 'Audit date',
      validUntil: 'Valid until',
      expired: 'over 12 months ago',
      previous: 'Previous audit',
      next: 'Later audit',
      doi: 'DOI',
      conceptDoi: 'Concept DOI',
      cite: 'How to cite',
      match: 'PDF SHA-256 {hash} — matches the file deposited in Zenodo (record checksum verified at deposit).',
    },
    badge: { title: 'Badge for your site', copy: 'Copy the HTML', copied: 'Copied' },
  },
  workbench: {
    title: 'The Workbench — UniverLab consulting on artificial intelligence agents and automation',
    description: 'Book the bench of the people who built this lab: consulting on artificial intelligence agents, workflow automation and audits. The work funds the open lab.',
    label: 'THE WORKBENCH',
    head: 'Are your agents failing in silence? Bring them to the Workbench.',
    headEm: 'in silence',
    intro: 'The hands that built this lab, for whatever you need in artificial intelligence and Agent Experience (AX): technical judgement, ideas, agents or the latest release. You leave with written notes and a clear next step.',
    cta: 'Book the free call · 15 min →',
    ctaShort: 'Free call · 15 min →',
    ctaNote: 'on WhatsApp',
    ctaMessage: 'Hi, I come from the Workbench page.',
    tags: { kicker: 'Services and prices', items: [
      ['First call', 'Free · 15 min', '', 'We look at what you need and whether the Workbench is the right place for it.'],
      ['Consultation', 'USD 45 / hour', 'COP 150,000 / hour', 'An hour with the people who build this lab. Bring anything in artificial intelligence: harnesses and models, agent engineering, the app idea on your mind or what came out this week. Every answer comes from something we already built, used and broke in the lab.'],
      ['Agentic flow', 'From USD 150', 'In Colombia: from COP 550,000', 'We design and install an agentic flow around how your team already works, with 30 days of support. The code ends up in your repository; your subscriptions, your harnesses and your model tokens are your own accounts and your own costs.'],
      ['Audit', 'From USD 400', 'In Colombia: from COP 1,500,000', 'We evaluate how you use artificial intelligence with rigour: the technology, the judgement behind each decision and the depth of every flow. You receive a dedicated page, a PDF report and the audit repository, with the findings, the risk matrix and the roadmap in writing.'],
    ] as [string, string, string, string][] },
    how: { kicker: 'How a session goes', steps: [
      ['You write', 'Tell us your case on WhatsApp. We note what you want to cover so we arrive at the session with something prepared.'],
      ['You book and pay', 'Bre-B in Colombia, PayPal from abroad. The slot is yours once the payment is checked.'],
      ['We work your case', 'Live or in writing, as you ask. You leave with written notes; what we build stays yours.'],
    ] as [string, string][] },
    who: { kicker: 'Who comes to the bench', items: [
      ['Teams that already run agents', 'Your agents write code, answer customers or move data, and you want them to stop failing in silence: graphs with real gates, failures that route back, quotas that do not stop the work.'],
      ['Businesses that want an agent', 'An assistant that answers your customers on WhatsApp, books appointments or reads your documents, built around how your business already works.'],
    ] as [string, string][] },
    policy: { kicker: 'Cancellations and refunds', summary: 'Cancel or move a paid session up to 24 hours before it starts and get a new slot or your money back. If you book more than five days ahead you can also withdraw within five business days of booking (Ley 1480 de 2011, art. 47).', link: 'Full cancellation and refund terms →', terms: 'Workbench bookings: cancellations and refunds', items: [
      'Cancel or move a paid session up to 24 hours before it starts and you choose: a new slot or your money back in full.',
      'Less than 24 hours before, the session can be moved once at no cost; it is not refunded, except under the right of retraction below.',
      'If you join late, the session still ends at the booked time; if you do not join within 15 minutes of the start, it counts as given.',
      'If the lab has to cancel or move a session, you choose a new slot or a full refund.',
      'No session is held without a confirmed payment: a payment that cannot be verified releases the slot.',
      'Refunds go back by the method you paid with, within 5 business days.',
      'The free first call can be cancelled at any time; just tell us.',
      'Audits and agentic flows follow the terms of their written quote.',
      'Right of retraction: if you book a session more than five days ahead, you may withdraw within 5 business days of booking and get all your money back, whatever the 24-hour rule says (Ley 1480 de 2011, art. 47).',
    ] },
    money: { kicker: 'Where the money goes', text: 'What comes in at the bench pays for the lab: artificial intelligence models, compute and infrastructure. The tools, the experiments and what we learn stay open.' },
    principles: { kicker: 'How we work', items: ['Everything is a script and lives in version control: no closed magic.', 'The code is yours: it ends up in your repository.', 'One heavy job at a time: we work in focus, not in parallel.'] },
    proof: { kicker: 'What already came out of this Workbench', items: ['canopy', 'facetmedia', 'gitkit', 'texforge'] },
    close: { head: 'What you pay at the Workbench funds the lab: the tools stay open.', cta: 'Write to the Workbench on WhatsApp →', phone: 'WhatsApp +57 305 389 2323' },
    audits: {
      title: 'Workbench audits — UniverLab consulting on artificial intelligence',
      description: 'The Workbench audit: a dedicated page, a PDF report and a private repository. Findings with evidence, a risk matrix and a roadmap.',
      head: 'Workbench audits',
      lede: 'We review how your team uses artificial intelligence and agents, and we deliver what to fix first and what risk you run if you do not.',
      scope: { kicker: 'What we review', items: [
        ['Agent security', 'What they can read, write and run: secrets, permissions, instruction injection and surfaces open to the internet.'],
        ['Technical judgement', 'Whether the model, the harness and the architecture fit each task, and what the alternatives are.'],
        ['Flow depth', 'Where a flow depends on someone reviewing by hand, where it fails silently and how to measure it.'],
        ['Data', 'What personal or business information reaches third-party models and what data-protection rules ask of you.'],
        ['Agent Experience (AX)', 'Whether your documentation, your APIs and your repositories serve an agent, not only a person.'],
      ] as [string, string][] },
      how: { kicker: 'How we work', steps: [
        ['Free call', 'A free 15-minute call to agree on the scope.'],
        ['Read-only access', 'Read-only access to what we agree on (repositories, configurations, flows); nothing in production without your permission.'],
        ['We review and measure', 'A person tests, agents do real work and an agentic audit runs in an isolated environment that never touches production: every finding carries its evidence.'],
        ['Delivery and session', 'The delivery and a session to walk through the findings.'],
      ] as [string, string][] },
      deliver: { kicker: 'What you receive', items: [
        ['Dedicated page', 'A dedicated page on univerlab.org, open only to the addresses you name, with the findings by severity, their evidence, the risk matrix and a prioritised roadmap.'],
        ['PDF report', 'An editorial-style PDF report, composed with TeXForge, with the evidence, the recommendations and the depth of each finding.'],
        ['Audit repository', 'The audit repository, private and shared with whoever you name, holding the sandbox, every evidence file and the full detail: each finding can be checked and reproduced.'],
        ['Optional: public record with DOI', 'Optional: a permanent, verifiable and citable public record with a DOI, if you decide to publish the audit.'],
      ] as [string, string][] },
      impl: { kicker: 'The build, a separate service', paras: [
        "Building the agentic solution the audit recommends is the Workbench's agentic-flow service, from USD 150 (from COP 550,000 in Colombia): you can also build it from the report or book paid consultation hours.",
        'It comes with 30 days of support.',
        'It does not include your subscriptions, your harnesses or your model tokens: those are your own accounts and your own costs.',
      ] },
      privacy: { kicker: 'Confidentiality', text: 'We use your data only for the audit, we keep it for 6 months after delivery and we delete it sooner if you ask.', link: 'The detail is in the privacy policy →' },
      price: { kicker: 'Price', text: 'From USD 400. The scope and the final price are agreed in writing before we start.', cop: 'In Colombia: from COP 1,500,000. The scope and the final price are agreed in writing before we start.' },
      cardLink: 'What we review and what you receive →',
      offers: { kicker: 'Publishing your audit', founding: {
        title: 'Founding audits',
        text: 'The first 5 audits: we refund 50 % of the price when the audit is published. A founding spot is taken when the agreement is signed.',
        spots: 5,
      }, public: {
        title: 'Audit in public',
        text: 'Any other client gets 20 % of the price back when they publish, even if they first chose a private audit.',
      }, reaudit: {
        title: 'Re-audit',
        text: 'Auditing the same system again, to check the fixes and issue a new audit with a new date, costs 30 % less, applied when it is charged.',
      }, zenodoNote: 'A published audit is also deposited permanently in Zenodo, a public research repository, and cannot be removed from there afterwards. Personal data such as employee names never goes into the deposited files.', rules: [
        'Publication happens once critical and high findings are fixed, with your written approval of what is shown.',
        'The refund must be claimed within 12 months of delivery; after that the audit stays private and the founding spot is not returned.',
        'Discounts and refunds do not stack: the largest one applies.',
        'The badge is your choice to display and is never a condition for any refund or discount.',
      ] },
    },
  },
};

export type Dict = typeof en;
/** Union of experiment ids — the single source of truth is the copy dictionary. */
export type ExperimentId = keyof Dict['experiments'];
