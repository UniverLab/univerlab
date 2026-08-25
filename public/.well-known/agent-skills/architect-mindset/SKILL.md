---
name: architect-mindset
description: >
  Use this skill when designing systems rather than implementing them:
  choosing boundaries and contracts, comparing architecture options, planning
  multi-component work, decomposing a problem into independently verifiable
  parts, reviewing a design for failure modes, or writing specs and decision
  records that other agents (or cheaper models) will execute. It applies
  systemic thinking at the design level; for code-level structure use
  code-engineering instead.
license: MIT
metadata:
  author: jheison.martinez
  version: "1.1"
  category: agent-behavior
  last_updated: "2026-07-20"
---

# Architect Mindset: Design as Contracts

Design is deciding **where the boundaries go and what promises cross them**.
Code fills in the rest. This skill governs how you behave when the deliverable
is a design, a plan, a spec, or an architecture decision — not the code itself.

It builds on the resolution model in `execution-mindset` (model the system →
locate the divergence → smallest decisive move → verify → re-model). Here that
model is applied *before anything exists*: you are designing the system whose
model future agents will have to build in their heads.

---

## The Design Loop

### 1. Model the forces before proposing structure

A design answers forces: load, change frequency, failure modes, team/agent
capability, cost. Name them explicitly first. A design that doesn't state
what it's protecting against can't be evaluated, only admired.

Ask (the user, the code, the history) until you can write one sentence per
force. If you can't, you're not ready to design — you're guessing.

### 2. Boundaries are promises, not folders

A boundary is real only if it states an invariant someone else can rely on
("domain never imports infra", "every mutation goes through the MCP surface",
"raw data directories are read-only"). When you draw a boundary, write down:

- the **contract**: what holders of a reference may assume
- the **violation signal**: how you'd notice the contract broke
- the **owner**: which component enforces it

**A workaround that bypasses a declared surface is not a shortcut — it's
evidence the contract is broken.** Record it as a defect in the design, even
if the workaround ships today.

### 3. Design for the process dying mid-step

Assume every component halts at its worst moment: the daemon restarts
mid-run, the agent hits quota mid-edit, the machine reboots mid-migration.
For each step in a flow, answer: *what state is left behind, and who repairs
it?* Idempotent re-entry points, reconciliation at startup, and explicit
recovery paths are design features, not ops afterthoughts.

### 4. Spend reversibility wisely

Classify every decision:

- **Reversible** (naming, internal structure, defaults) — decide fast, note it, move on.
- **Expensive to reverse** (schemas, public APIs, wire formats, storage layout) — decide late, decide explicitly, write the alternatives down.

Never let a reversible decision block progress, and never let an expensive one
slip through as an implementation detail.

### 5. Second-order effects are the design

Before changing anything shared, enumerate its consumers — including future
ones the change will invite. A design is not local because the diagram is
small. The question that catches most architecture bugs is: **"who else
consumes this, and what do they believe about it?"**

### 6. Write for the cheapest executor

Plans and specs are executed by someone with less context than you have right
now — a future session, another agent, a smaller model. A spec must carry its
own context: **role** (who the executor is), **what** (outcome + acceptance
criteria), **how** (the route: files, approach, constraints). If executing it
correctly requires information that lives only in your head, the design isn't
finished.

---

## Decompose Into Independently Verifiable Parts

Splitting work is not about size. The test of a good split is: **can this part
be checked on its own, without building the rest?** A subproblem you can only
evaluate once everything else exists isn't a part — it's the whole problem
wearing a smaller name.

- Order parts by dependency, then **attack the highest-risk one first**. Risk
  here means "most likely to invalidate everything else". Failing early is
  cheap; failing at integration means redoing the work that assumed the
  failure away.
- The riskiest part is usually the one with an unverified assumption inside
  it, not the one with the most code.
- Match each part to its executor. A part that a cheap model can complete and
  a deterministic check can verify is a well-cut part; one that needs
  judgment at every step was cut along the wrong seam.
- Before designing a part, ask whether a library, an existing pattern, or an
  existing skill already answers it. Reinvention is a design failure, not a
  design.

---

## Decision Discipline

- Before committing to an approach, **generate at least two** — even briefly.
  The first approach that comes to mind is the most obvious one, which is not
  the same as the best one. If the second is clearly worse, you've lost a
  minute and gained a justification.
- Prefer the simplest approach that meets the success criterion. Complexity is
  justified, never assumed.
- Run a **pre-mortem** before committing: assume this design failed — what is
  the most likely cause? Then design against that cause specifically. A
  pre-mortem that produces no candidate cause means you don't understand the
  design well enough to commit to it yet.
- When the requirements are ambiguous, **interview** (see `execution-mindset`)
  before designing. Options with tradeoffs, not opinions.
- When two viable architectures remain, **recommend one** with the reason,
  don't present a neutral menu. Neutrality at decision time just moves the
  work to someone with less context.
- Record significant decisions as ADRs — context, options, decision,
  consequences. Read
  **[references/architecture-decision-records.md](references/architecture-decision-records.md)**
  when comparing significant options or documenting a tradeoff.

---

## Smells That Mean "Stop Designing, Look Again"

- You can't state what breaks if a boundary is removed → the boundary is decorative.
- A component needs to know *how* another does its job → the contract leaks.
- The recovery story is "that shouldn't happen" → it will; design it.
- The design only works if every executor is as capable as you → it fails at scale.
- You're adding a layer to avoid understanding an existing one → understand it first.

---

## Summary Contract

A finished design handoff contains:

1. the forces (one sentence each)
2. the boundaries with their contracts and violation signals
3. the failure/recovery story per flow
4. decisions taken, marked reversible vs expensive, with alternatives for the expensive ones
5. specs executable by a colder, cheaper context than yours
