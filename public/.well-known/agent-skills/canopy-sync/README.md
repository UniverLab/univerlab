# canopy-sync

Tooling skill for Canopy's collaborative workspace protocol.

Defines the action-driven sync protocol: classify each action by risk
(read / test / write / breaking) and follow the matching tool sequence
(`sync_get_context` → `sync_declare_intent` → execute → `sync_report_status`).
Solo agents build clean history; multi-agent setups get real-time
conflict awareness.

**Requires:** the Canopy MCP server in the session (`requires = "canopy"` in
`skills.toml`). Without those tools this skill is inert — don't install it
globally on hosts that never run Canopy.

Extracted from `execution-mindset` v4.0, which mixed behavior rules with
Canopy tooling. Behavior lives in [execution-mindset](../execution-mindset/);
the intelligence layer lives in [canopy-intelligence](../canopy-intelligence/).

## Contents

- [SKILL.md](SKILL.md) — the action/risk protocol table, core rules, and
  anti-patterns.

## License

MIT — see [LICENSE](LICENSE).
