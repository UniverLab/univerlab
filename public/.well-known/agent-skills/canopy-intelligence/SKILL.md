---
name: canopy-intelligence
description: >
  Use this skill when the Canopy MCP server is available in the session and
  you need to pull workspace context or persist durable knowledge. It covers
  the Project Intelligence Layer (PIL): when to call get_tools and
  intelligence_get_context, and when to register facts and patterns with
  intelligence_upsert so future sessions inherit what you learned.
license: MIT
metadata:
  author: jheison.martinez
  version: "1.0"
  framework: Canopy
  category: canopy-tooling
  requires: canopy
  last_updated: "2026-07-14"
---

# Canopy Intelligence: The Project's Brain

You operate within a Project Intelligence Layer (PIL). You are responsible for
investigating and documenting the current project's "brain" — knowledge that
outlives this session.

This is a **tooling skill**: it only applies when the Canopy MCP tools
(`get_tools`, `intelligence_*`) are present. Behavior rules live in
`execution-mindset`; this skill covers only how to use the intelligence surface.

---

## Pull Before You Leap

- At the start of a session, call `get_tools(scope="session_start")` — it
  returns the workspace brief and tells you which tools to use.
- For deep architecture work or onboarding, call
  `intelligence_get_context(scope="full")`.
- Align your mission with previous summaries. If the previous mission was
  inconclusive, prioritize finishing it.
- When closing, call `get_tools(scope="close_session")` — it tells you to
  upsert a session summary and report workspace status. The daemon handles
  mission closure automatically.

---

## Document as You Learn

When you discover a durable fact, a reusable pattern, or a critical
architectural rule, DO NOT let it stay only in chat history. Use
`intelligence_upsert` to register it. `project_hash` is auto-detected from
your session workdir — just pass kind, title, and body.

### Upsert a fact (`kind="fact"`) when you discover:

- a project convention that isn't documented ("we always use `anyhow` for errors here")
- a constraint or limitation ("this crate must not depend on tokio")
- a naming/schema convention ("all DB tables use snake_case with `_at` suffix")
- a configuration truth ("the daemon listens on port 7755 by default")
- a dependency relationship ("harness-canopy depends on rmcp for MCP protocol")

### Upsert a pattern (`kind="pattern"`) when you observe:

- a recurring code structure ("`thiserror` enums in domain, `anyhow` in application")
- a workflow pattern ("PRs require cargo fmt + clippy + test before merge")
- an architectural decision ("hexagonal: domain has no infra deps")
- a testing convention ("DB tests use `tempfile::NamedTempFile` for isolation")

### Timing

- **During exploration:** after reading 3+ files and understanding a pattern → upsert immediately.
- **During implementation:** after a design decision that affects future work → upsert before moving on.
- **During review:** after discovering a convention violation → upsert the correct pattern.
- **At session end:** upsert any durable knowledge not captured in code or docs.

### Keep the brain honest

If the PIL says one thing and the code says another, the PIL is stale —
update it first, then continue. Stale intelligence is worse than none: it
confidently misleads every future agent.

---

## Anti-patterns

❌ Upserting chat-level trivia ("user asked me to fix a typo")
✅ Upserting durable knowledge (conventions, constraints, decisions)

❌ Re-deriving the workspace state from scratch every session
✅ Pulling `session_start` context first, then verifying only what you touch

❌ Letting a finished session evaporate
✅ One summary upsert + status report at close
