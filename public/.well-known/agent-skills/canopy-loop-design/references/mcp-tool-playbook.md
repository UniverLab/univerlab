# MCP Tool Playbook

Recommended tool order for creating and refining Canopy loops with the currently available MCP tools.

---

## Create a New Loop

1. `loop_create` — set `trigger` here if the loop should fire on its own (see below); omit it for a manual-only loop
2. `loop_add_spec` for each ordered spec
3. `loop_add_node` for each node inside the spec
4. `loop_add_edge` for routing
5. `loop_get` to verify the final shape
6. summarize the graph to the user
7. `loop_run` only after explicit approval or direct instruction — not needed at all if a cron/watch trigger will fire it

---

## Setting a Trigger (cron / watch / manual)

`loop_create` and `loop_update` both take an optional `trigger` object (`LoopTriggerParams`). Omit it on create for a manual loop; omit it on update to leave the current trigger untouched.

| Field | Applies to | Notes |
|---|---|---|
| `kind` | all | `"cron"`, `"watch"`, or `"manual"`. `"manual"` (or empty) clears any existing trigger. |
| `schedule` | cron | 5-field cron expression, required when `kind = "cron"`. Evaluated in local wall-clock time, same as agent triggers. |
| `path` | watch | Absolute path to a file or directory, required when `kind = "watch"`. |
| `events` | watch | List of `"create"`, `"modify"`, `"delete"`, `"move"`, or `"all"`. Required (non-empty) when `kind = "watch"`. |
| `debounce_seconds` | watch | Optional, default `2`. |
| `recursive` | watch | Optional, default `false`. |

Example — nightly cron loop:

```json
{
  "name": "nightly-docs-sync",
  "workdir": "/home/user/project",
  "trigger": { "kind": "cron", "schedule": "0 2 * * *" }
}
```

Example — clearing a trigger back to manual via `loop_update`:

```json
{ "loop_id": "...", "trigger": { "kind": "manual" } }
```

A fireable loop (cron/watch) will not re-trigger itself while it is already `Running` or `Paused` — no need to guard against overlapping runs when designing the graph.

---

## Refine an Existing Loop

1. `loop_list` or `loop_get`
2. inspect current specs, nodes, edges, and statuses
3. choose the lowest-risk path:
   - **surgical mutation** with `loop_update`, `loop_update_spec`, `loop_update_node`, or `loop_update_edge` for targeted changes
   - **extend** with `loop_add_spec`, `loop_add_node`, or `loop_add_edge` when the change is additive
   - **recreate** when the graph shape must change drastically
4. `loop_get` again
5. summarize the effective diff or migration path

### Available Mutation Tools

| Tool | What it changes |
|---|---|
| `loop_update` | name, description, workdir |
| `loop_update_spec` | name, description, position, parallelizable |
| `loop_update_node` | name, kind, config, position |
| `loop_update_edge` | condition (pass/fail/always) |

---

## Mutation Heuristics

### Prefer surgical mutation when:

- a single node, spec, or edge needs a config tweak or rename
- the graph topology stays the same
- you want to preserve run history tied to the loop ID

### Prefer extend-in-place when:

- the loop identity should remain stable
- the new behavior can be added without deleting or rewriting existing graph structure
- users already rely on the current loop ID and shape

### Prefer recreate when:

- the loop graph shape changed drastically
- most specs are being replaced
- a clean new draft is easier to reason about

---

## Safety Rules

- do not auto-run after create unless the user explicitly asked for execution
- do not assume one CLI or one model provider
- do not insert commit nodes unless the user explicitly allows loop-managed commits
- preserve strong verification nodes for code loops
- use `loop_report_blocker` when a node needs human input — do not hard-fail silently
- use `loop_pause` + `loop_continue` for graceful retry/skip flows

## Runtime Lifecycle

| Action | Tool |
|---|---|
| Start execution | `loop_run` |
| Halt after current node | `loop_pause` |
| Retry current node | `loop_continue(action="retry_current_node")` |
| Skip to next spec | `loop_continue(action="skip_next_spec")` |
| Re-open a failed/completed loop | `loop_reset` (optionally `{specs:[…]}`), then `loop_run` |
| Resume once at an exact future time | `loop_schedule_autorun(loop_id, at)` |
| Re-enable an agent once at an exact time | `agent_schedule_enable(id, at)` |
| Node reports success/failure | `loop_complete_node` |
| Node blocked, needs human | `loop_report_blocker` |

---

## Recovery Matrix (loop status → how to move it)

Learned from real incidents; each row was needed at least once.

| Loop state | How to recover |
|---|---|
| `draft` / `pending` | `loop_run` |
| `paused` | `loop_continue` (`retry_current_node` or `skip_next_spec`) |
| `running` but the daemon restarted (zombie: no child process behind it) | `loop_pause`, then `loop_continue(retry_current_node)`. Do **not** wait for a scheduled autorun: `is_fireable()` excludes `Running`, so it will never fire. |
| `failed` | `loop_reset` (clears the failed state, keeps completed specs), then `loop_run` for a single clean launch. `loop_reset` with no `specs` resets only non-completed specs, so `loop_run` resumes at the first pending one — nothing already done is re-implemented. |
| `completed` | `loop_reset {specs:[…]}` to re-open specific specs, then `loop_run`. |

**Prefer `loop_reset` + `loop_run` over `loop_schedule_autorun` for manual recovery.**
`loop_schedule_autorun` auto-resets and resumes when it fires — convenient, but its
resume-and-launch path can double-launch a loop that already has an in-flight run,
which routes a superseded run down the fail edge and (with a resilience node there)
can spin an implement→resilience→implement loop. Use autorun only for the case it is
built for: a quota death converting a stated reset time into one future resume. For
resuming *now*, `loop_reset` then a single `loop_run` avoids the double-launch.

Two asymmetries worth knowing:

- **`loop_run` freezes the spec list at launch; `loop_continue` re-reads it.** Adding
  a spec and then resuming with `loop_continue` picks it up; adding one mid-`loop_run`
  does not.
- A commit-check that keys on a marker file (e.g. `.git/canopy-prev-head`) survives
  daemon/PC restarts pointing at a stale HEAD. Delete the marker in pre-flight, and
  only resume at or before the gates node that rewrites it.

---

## Queues: runtime spec lists the engine runs through a loop

The redesign landed. A loop is now a reusable **graph** (the "team"), and the
specs it runs come from a standalone backlog (`spec_create` / `spec_list`)
collected into a **queue** the loop executes in order:
`loop_run {loop_id, queue_id, workdir}`. Build the graph once (~13 calls), then
point different queues at it across workdirs — the loop's own bound specs are
typically empty when it runs a queue. (`pool` is the old name for the same
thing; `queue_*` tools supersede `loop_pool_*`, and `queue_id` wins over the
deprecated `pool_id` argument.)

| Tool | What it does |
|---|---|
| `queue_create` | create an empty queue |
| `queue_add_spec {queue_id, spec_id, group?}` | append a backlog spec; optional `group` shares a warm session (below) |
| `queue_remove_spec` | drop a spec from the queue |
| `queue_reorder {queue_id, spec_ids}` | total reorder — pass **every** member exactly once, in the desired order |
| `queue_list {queue_id?}` | one queue's ordered members, or all queues in summary |

**Warm-context groups.** `group` on `queue_add_spec` makes a spec resume the
session of the previous **successfully-completed** sibling in the same group
instead of analyzing the repo cold — see *Spec Groups* in `SKILL.md`. Group
only an ordered sequence over the same surface; leave unrelated specs ungrouped.
There is no "set group in place" tool: to (re)group an existing member, remove
it and re-add it with the `group`, then `queue_reorder` to restore position.
`queue_reorder` preserves each member's group; it only moves positions.

**Membership vs. status.** `queue_*` tools change membership only; a spec's
run status (pending / completed / failed) lives on the spec, so removing and
re-adding a spec does not re-run an already-completed one — `loop_run` still
resumes at the first non-completed member.

---

## Language

Write spec descriptions and node prompt templates in **English** — models follow
English instructions more reliably, and the reviewer/implementer contract gets
stricter compliance.
