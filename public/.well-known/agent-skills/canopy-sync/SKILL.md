---
name: canopy-sync
description: >
  Use this skill when the Canopy MCP server is available and you are about to
  act on a shared workspace: writing files, running builds or tests,
  installing dependencies, or committing. It defines the action-driven sync
  protocol (sync_get_context, sync_declare_intent, sync_broadcast,
  sync_report_status) that keeps solo history clean and multi-agent work
  conflict-free.
license: MIT
metadata:
  author: jheison.martinez
  version: "1.0"
  framework: Canopy
  category: canopy-tooling
  requires: canopy
  last_updated: "2026-07-14"
---

# Canopy Sync: Action-Driven Workspace Protocol

Sync is not a "multi-agent only" feature. It's a workspace state protocol you
follow based on **what action you're about to take**, not how many agents are
present. Solo agents build history; multi-agent setups get real-time
coordination.

This is a **tooling skill**: it only applies when the Canopy sync tools are
present. Behavior rules live in `execution-mindset`.

---

## Action Protocol

Before any action, check its risk level and follow the corresponding protocol:

| Action type | Risk | Protocol |
|---|---|---|
| Read files, search, analyze | `low` | Execute directly |
| Run tests, builds, linters | `medium` | `sync_broadcast` before + broadcast result |
| Write files, modify code | `high` | `sync_get_context` → check conflicts → `sync_declare_intent` → execute → `sync_report_status` |
| Install deps, schema changes, commits | `breaking` | Same as `high` + `impact="breaking"` in declare_intent |

### get_tools — your action guide

`get_tools(scope)` returns the right tools + protocol for any situation:

- `get_tools(scope="session_start")` — what to do first
- `get_tools(scope="file_write", path="...")` — check conflicts before modifying
- `get_tools(scope="test_run")` — coordinate test execution
- `get_tools(scope="close_session")` — wrap up properly
- `get_tools(scope="multi_agent")` — full sync toolkit

---

## Core Rules

1. **Protocol by action, not by count.** Don't check `participant_count` to
   decide whether to sync — the history matters even when you're alone.
2. **Non-blocking.** All sync operations complete immediately. Never wait for
   responses; act on last-known state.
3. **Communicate intent, not implementation.** Missions explain *what* and
   *why*, not *how*.
4. **The daemon closes missions on exit.** You don't need to self-report
   closure — call `sync_report_status("stable", "Mission complete: ...")` when
   done for clean history.

---

## Anti-patterns

❌ Skipping sync because you think you're alone — you don't know who reads this history next session
✅ Follow the action protocol: declare, execute, report. Always.

❌ Excessive broadcasting — dumping every commit message or intermediate step
✅ Broadcast milestones: "Completed auth refactor, all tests passing"

❌ Fine-grained missions — declaring a mission for every file edit
✅ Coarse missions: "Refactoring database layer" covers all related edits
