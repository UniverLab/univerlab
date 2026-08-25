---
name: canopy-loop-design
description: >
  Use this skill when the user wants to turn a recurring or multi-step process
  into a reusable Canopy loop, write specs for a backlog or pool, inspect or
  reshape an existing loop graph, or coordinate background agent/check/gate
  flows with approvals and retries. Prefer reusable graph patterns over
  one-off pipelines, and build against the MCP loop tools that actually exist
  in the environment.
license: MIT
metadata:
  author: jheison.martinez
  version: "2.1"
  framework: Canopy
  category: loop-orchestration
  last_updated: "2026-07-21"
---

# Loop Design

Design generic loops for Canopy as editable graphs, not as one-off scripts.

This skill exists for planning and authoring **background loops** — the team
graph and the specs it consumes — that users can later inspect, edit, and run
from Canopy.

---

## Mission

Translate a user goal into:

1. ordered specs, each carrying its own context (role / what / how)
2. a reusable graph of `agent`, `check`, and `gate` nodes
3. a persisted loop built with MCP tools

The output must stay generic enough that different users can plug in different
CLIs, models, prompts, and verification commands.

---

## Design Expensive, Execute Cheap 🔴

**Design the loop and write the specs with the most powerful model the user
has access to.** Spec quality is the single biggest lever on loop economics:
a precise spec lets a cheap implementer land it in one or two iterations; a
vague spec makes even a strong implementer diverge, and divergence is paid in
iteration budget (10 per spec/node), reviewer bounces, and quota.

The asymmetry is deliberate:

- **Spec authoring / graph design** → strongest model available (one-time cost)
- **Implementation nodes** → mid-tier models guided by the spec's HOW
- **Review / resilience nodes** → cheap models with narrow, mechanical prompts

If the user is designing specs from a weak model's session, say so and
recommend switching for the authoring step.

---

## The Spec Contract: ROLE / WHAT / HOW 🔴

Every spec must be executable by a colder, cheaper context than its author.
A spec that assumes the reader knows the conversation is a spec that will
diverge. Structure each one as:

- **ROLE** — who the implementer is for this task: "You are a Rust engineer
  working on harness-canopy's TUI layer." Sets domain, codebase, and register.
- **WHAT** — the outcome plus acceptance criteria: observable behavior,
  files/artifacts that must exist, tests that must pass. This is what the
  reviewer will check against.
- **HOW** — the route: which files/modules to touch, the approach to take,
  known constraints and traps ("the daemon resolves CLIs from its own PATH",
  "never modify data/coadd-*"). Embed measured values and exact commands
  instead of pointing at where to find them.

Rules of thumb:

- If executing the spec correctly requires information that lives only in the
  author's head or chat history, the spec is not finished.
- Narrow intent: "Implement auth domain service", not "Build the whole app".
  Big specs outrun CLI session quotas mid-run — that alone justifies splitting.
- Write specs and node prompts in **English** — models follow English
  instructions more reliably.

---

## Spec Groups: shared warm context 🟡

By default every spec in a queue runs from a **cold** harness session — the
implementer re-analyzes the repo from scratch. Specs that build on each other
can instead share **one warm session**: the `group` argument on
`queue_add_spec` tags members into a named group, and a grouped spec resumes
the session captured by the previous **successfully-completed** sibling in that
group instead of starting cold. That carries the earlier spec's mental model
(files already read, decisions already made) forward into the next.

**Group only a sequence over the same surface** — `T1 theme struct → T2 header
consumes it → T3 panels consume it → …`, or one feature split into ordered
steps. Grouping pays off exactly when step N assumes step N-1's code.

**Do not group unrelated specs.** A shared session pollutes context: an
independent bugfix inheriting an unrelated feature's session reasons over stale
assumptions. Isolation is the correct default; grouping is the exception you
justify. Separate bugs and unrelated areas stay ungrouped and cold.

- **Order is load-bearing.** The warm session flows in queue order, so the
  foundational spec must sit first in the group.
- **Only success seeds the session.** If a grouped spec fails, the next sibling
  starts cold rather than resuming a broken session — a failed run is not a
  context worth inheriting.
- Grouping is a property of queue membership, not of the spec: the same spec
  can be ungrouped in one queue and grouped in another. Set it when adding, or
  re-add with a `group` to change it (see the playbook's queue section).

---

## Core Rules

### 1. Model loops as graphs, not lists

- `agent` — produces or analyzes work
- `check` — verifies with commands or deterministic checks
- `gate` — decides the next route based on prior output

If the loop needs iteration, use edges and gates. If it is linear, keep it
simple.

### 2. Preserve genericity

Never assume one CLI platform, one model vendor, one review style, or one
commit strategy. Any node may use Copilot, OpenCode, Kimi, local MCP-driven
agents, or other supported CLIs. Design prompts and checks accordingly —
platform-specific behavior belongs in the platform registry, never hardcoded
into prompts.

### 3. Ask before irreversible behavior

Before you create or run a loop, clarify: draft or run; which verification
commands are authoritative; whether commits are allowed inside the loop;
whether blockers should pause or hard-fail.

### 4. A loop does not have to be run by hand

`loop_create`/`loop_update` accept an optional `trigger`: **manual** (default),
**cron** (5-field expression, local wall-clock), or **watch** (file/dir
changes with debounce). A one-off migration is almost always manual; a
recurring maintenance sweep is a candidate for cron or watch. See
**[references/mcp-tool-playbook.md](references/mcp-tool-playbook.md)** for the
exact fields.

### 5. Reuse patterns, adapt prompts

Reuse graph patterns from
**[references/loop-patterns.md](references/loop-patterns.md)**, but adapt node
prompts, CLI/model selection, verification commands, retry routing, and
blocker behavior to the project.

### 6. Design for the process dying mid-run

Loops outlive daemon restarts and PC reboots badly unless you plan for it:

- A restart leaves the loop `running` with nobody executing it (a zombie).
  Recovery is `loop_pause` → `loop_continue(retry_current_node)` — see the
  Recovery Matrix in `mcp-tool-playbook.md`. Scheduled autoruns can NOT
  rescue a `running` zombie.
- Resume at (or before) an idempotent node. Deterministic checks that
  recompile and re-run tests are safe re-entry points; marker files written
  by earlier nodes are stale after a restart.
- Give failure knowledge somewhere to go: a resilience branch (pattern 8)
  that triages the failed implement — quota deaths schedule their own
  autorun instead of silently losing the reset time.

### 6b. Who supervises the loop — the recovery hierarchy

There are three places recovery logic can live. Order them by determinism,
and push each responsibility as far up this list as it can go:

1. **Engine guards (deterministic, always right):** boot reconcile of zombie
   runs, empty-spec-set launch errors, stale-spec recovery, pool-aware
   autoruns. Anything expressible as a state-machine rule belongs HERE, in
   the daemon — not in any agent's prompt.
2. **The in-graph resilience node (LLM, language only):** its unique value is
   reading prose the engine can't parse — "resets 5:10pm" — and converting it
   into one scheduling call. Keep it on a platform that reliably COMPLETES
   runs; a resilience that times out is a resilience that doesn't exist.
3. **An external watcher agent (LLM on cron): last resort, and know the cost.**
   Field evidence from running one at scale: it saved two overnight runs, and
   it also *falsely completed* a loop by relaunching without its pool, left
   another stuck in `draft` by resetting and never relaunching, mangled its
   own report JSON for hours, and burned a run every 15 minutes to conclude
   "healthy". An LLM watcher acts on state it half-understands with tools
   that let it half-recover. If you deploy one anyway: give it a closed
   decision table, forbid every mutating call not in that table (especially
   pool-less `loop_run`), and prefer wiring its enable/disable to the
   resilience node so it only lives during recovery windows.

Rule of thumb: **no LLM in the deterministic part of the critical path.**
When you catch a watcher doing state-machine work, that work is an engine
feature request — file it, don't re-prompt.

---

## Construction Playbook

1. **Understand the target outcome** — deliverable, hard constraints, allowed
   tools/CLIs, required validations, parallelism.
2. **Split into specs** — ordered, independently understandable, small enough
   to validate, each with ROLE / WHAT / HOW.
3. **Pick a graph shape** — linear, review loop, verify loop, gated implement
   (pattern 7), resilience branch (pattern 8), or a fusion/join shape.
   **Route the implement's success edge with `pass`, never `always`.**
4. **Validate the graph** — read
   **[references/graph-validation.md](references/graph-validation.md)**
   immediately before creating: entry node, ambiguous edges, timeouts, gate
   tokens, PATH resolution. Every rule there broke a real run.
5. **Persist via MCP tools** — `loop_create` → specs → nodes → edges →
   `loop_get` to verify; order and mutation heuristics in
   **[references/mcp-tool-playbook.md](references/mcp-tool-playbook.md)**.
6. **Summarize before running** — loop name, specs in order, graph, chosen
   CLIs/models/checks, and what still needs user confirmation. Only call
   `loop_run` after explicit approval or direct instruction.

---

## Authoring Guidelines

### Agent nodes

Explicit configs: platform, model, `prompt_template` (e.g.
`{{spec_content}}\n\n{{previous_feedback}}`), `timeout_minutes`. Prompts state
the goal, expected outputs, constraints, and when to report blocker vs fail.

### Check nodes

Real verification, not vague "looks good" logic:
`cargo fmt --all && cargo clippy --all-targets -- -D warnings && cargo test`,
`npm test`, `pytest tests/auth -q`, domain-specific smoke checks. Cap noisy
output (`| tail -60`) so a 65 KB test log never rides into the next node's
argv. Set `timeout_seconds` explicitly.

### Gate nodes

Use gates when routing depends on semantics, not just exit codes. Gate on a
strict token (`APPROVED`), never on a word that can appear in narration.

---

## Progressive Disclosure

- **[references/loop-patterns.md](references/loop-patterns.md)** — reusable
  graph patterns + field notes from real failures. Read when choosing a shape.
- **[references/graph-validation.md](references/graph-validation.md)** — the
  pre-`loop_run` checklist. Read immediately before persisting a graph.
- **[references/mcp-tool-playbook.md](references/mcp-tool-playbook.md)** —
  tool order, triggers, mutation heuristics, recovery matrix. Read immediately
  before creating, extending, or recovering a loop.

See **[README.md](README.md)** for overview and usage.
