# Canopy Loop Design Skill

**Loop orchestration skill** for turning multi-step work into reusable Canopy graphs with real MCP tooling constraints.

---

## Overview

This skill helps an agent turn a user goal into a structured Canopy loop made of:

- ordered specs
- `agent` nodes
- `check` nodes
- `gate` nodes
- routing edges between nodes

It is designed for **generic loops**, not a single hardcoded coding pipeline, and it keeps the plan grounded in the loop tools that actually exist.

---

## What It Does

The skill guides an agent to:

1. understand the user goal and constraints
2. split the work into atomic specs
3. choose an appropriate graph pattern per spec
4. persist the loop through Canopy MCP tools
5. summarize the result before execution

It also supports refining existing loops by inspecting first, then either extending the graph safely or recreating it when the current toolset cannot mutate the shape directly.

---

## When This Skill Triggers

Use it when the user asks to:

- plan or create a loop
- orchestrate several agents in background
- define checkpoints and approvals
- build developer/reviewer/verifier/committer flows
- convert a manual process into a Canopy graph
- update or refine a stored loop
- add retries, approvals, or pass/fail routing around agent work

---

## Skill Structure

```
canopy-loop-design/
├── SKILL.md              # Main skill definition
├── README.md             # This file
├── LICENSE               # MIT License
└── references/
    ├── loop-patterns.md
    ├── graph-validation.md
    └── mcp-tool-playbook.md
```

---

## MCP Tooling Covered

Creation flow:

- `loop_create`
- `loop_add_spec`
- `loop_add_node`
- `loop_add_edge`
- `loop_get`

Refinement flow:

- `loop_list`
- `loop_get`
- extend with `loop_add_spec`, `loop_add_node`, or `loop_add_edge` when the change is append-only
- recreate as a new loop when the graph shape must change in ways the toolset cannot mutate directly

Execution flow:

- `loop_run`
- `loop_pause`
- `loop_continue`
- `loop_schedule_autorun` — resume a loop once, at an exact time (no polling)
- `agent_schedule_enable` — re-enable a background agent once, at an exact time

---

## Usage

Reference it from agent configuration:

```yaml
skills:
  - name: canopy-loop-design
    path: skills/canopy-loop-design/SKILL.md
    triggers:
      - "create loop"
      - "plan loop"
      - "background pipeline"
      - "orchestrate agents"
      - "checkpoint flow"
```

---

## References

- **loop-patterns.md** — examples of reusable graph shapes + field notes from real failures
- **graph-validation.md** — the pre-`loop_run` checklist (nine fatal shapes)
- **mcp-tool-playbook.md** — recommended create/extend/replace flow with the current MCP toolset

---

## License

MIT © Jheison Martinez

---

## Version

2.0 (2026-07-14)

- **Design Expensive, Execute Cheap** (SKILL.md) — author specs and graphs with
  the most powerful model available; implement with mid-tier models; review
  with cheap narrow prompts. Spec quality is the biggest lever on loop
  economics.
- **The Spec Contract: ROLE / WHAT / HOW** (SKILL.md) — every spec must be
  executable by a colder, cheaper context than its author; embed values and
  commands instead of pointing at them.
- **Slimmer SKILL.md** — the nine fatal graph shapes moved to
  `references/graph-validation.md` (progressive disclosure); construction
  playbook condensed.

1.8 (2026-07-10)

- **Recovery Matrix** (mcp-tool-playbook.md) — how to move a loop out of every
  status, including `failed` (no direct tool yet; the `loop_schedule_autorun`
  bypass) and the post-restart `running` zombie (`loop_pause` → `loop_continue`;
  autorun cannot fire on `Running`).
- **Core Rule 6 + Graph Validation** (SKILL.md) — design for the process dying
  mid-run; the nine fatal graph shapes, each learned from a real broken run.
- **Pools are storage-only** (mcp-tool-playbook.md) — and the R1–R7 redesign
  replacing them: loop-level graph (the reusable team), standalone spec backlog,
  run-time pools, live pool mutation, node blueprints.
- **English prompts** — spec descriptions and node templates now default to
  English.

1.7 (2026-07-09) — restored after a stale skills-sync clobbered it; never committed

- **Graph Validation** (SKILL.md) — the fatal shapes: entry node, ambiguous edges,
  `config` typing, `check` timeout default, gate matching on serialized JSON.
- **Patterns 7 & 8** (loop-patterns.md) — *Gated Implement* and the
  *Resilience Branch* that triages a failed implement and schedules its own resume.
- **Resume semantics** (mcp-tool-playbook.md) — why `loop_run` refuses failed loops
  but a scheduled trigger does not.

1.2 (2026-05-13)
