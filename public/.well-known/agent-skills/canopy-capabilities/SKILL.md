---
name: canopy-capabilities
description: >
  Use this skill when someone asks what Canopy can do: onboarding a new user,
  answering "what can I do here?", proposing automations for a workspace, or
  deciding whether a need maps to an agent, a loop, memory, or sync. It gives
  the capability map plus concrete starter ideas, and teaches how to discover
  the live tool surface instead of trusting a static list.
license: MIT
metadata:
  author: jheison.martinez
  version: "1.0"
  framework: Canopy
  category: canopy-tooling
  requires: canopy
  last_updated: "2026-07-14"
---

# Canopy Capabilities: What Can I Do Here?

Canopy is a runtime layer that sits alongside AI coding agents (Claude, Codex,
OpenCode, Gemini, Copilot, and any CLI in its platform registry) and gives
them what harnesses don't: persistent memory, background scheduling,
multi-agent coordination, and autonomous work loops.

This skill is a MAP, not an inventory. Tool names and flags evolve — always
verify the live surface (below) before promising an exact call.

---

## Discover the live surface first

- `get_tools(scope="session_start")` — the workspace brief + which MCP tools apply right now.
- `canopy --help` and `canopy <command> --help` — the CLI surface.
- `agent_models` — which CLI platforms and models this machine can actually run.
- `blueprint_list` — ready-made node blueprints for building loops.

If this skill and the live surface disagree, the live surface wins.

---

## The capability map

### 1. Memory that survives sessions (Project Intelligence Layer)
Facts, patterns, and session summaries persist per project and load into any
future session — across different harnesses. Ask: "what does this workspace
already know?" before re-deriving anything. (Details: `canopy-intelligence`.)

### 2. Background agents (cron / file-watch)
Any prompt can run on a schedule or fire when files change — on any installed
CLI platform. Starter ideas: nightly dependency audit, docs drift checker,
"summarize what changed today", data-pipeline sanity checks on file arrival.

### 3. Loops (autonomous work queues)
A reusable graph of agent / check / gate nodes consumes a queue of specs:
implement → verify with real commands → review on a different model → commit.
Runs unattended, survives restarts, schedules its own resumption after CLI
quota resets. This is the heavy hitter: backlogs of bugfixes, refactors,
docs, or migrations executed overnight. (Design guidance: `canopy-loop-design`.)

### 4. Multi-agent sync
Agents declare missions, report status, and broadcast milestones so parallel
sessions stop colliding in one workspace — and solo sessions leave a legible
history. (Details: `canopy-sync`.)

### 5. Interactive session management (TUI)
Live terminals for interactive agents, status semaphores, a prompt builder
(with scheduled sends), project views with backlog/knowledge/history, and
live loop graphs — one dashboard over everything above.

### 6. RAG over local documents
Index a directory of PDFs/documents and query it from any agent — useful for
literature-driven work (specs that cite real sources) and project docs.

### 7. Spec backlogs and pools
Work items (specs) live in a standalone backlog, tagged per project, ordered
in pools, and fed to any compatible loop. Writing good specs is a skill:
role / what / how (see `canopy-loop-design`).

---

## Mapping a need to a capability

| The user says | Reach for |
|---|---|
| "I keep re-explaining my codebase" | Intelligence layer (facts/patterns) |
| "Run X every night / when Y changes" | Background agent (cron / watch) |
| "Work through this backlog without me" | Specs + pool + loop |
| "Two agents keep stepping on each other" | Sync protocol |
| "Ask questions over these papers/docs" | RAG |
| "Send my agent a prompt at 6am" | Prompt builder scheduled send |

When proposing, be concrete: name the trigger, the platform, the verification
step, and what "done" looks like. An automation without a deterministic check
is a wish, not a capability.
