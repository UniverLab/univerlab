# canopy-intelligence

Tooling skill for the Canopy Project Intelligence Layer (PIL).

Teaches an agent to pull workspace context at session start
(`get_tools`, `intelligence_get_context`) and to persist durable knowledge —
facts, patterns, session summaries — with `intelligence_upsert`, so every
future session inherits what this one learned.

**Requires:** the Canopy MCP server in the session (`requires = "canopy"` in
`skills.toml`). Without those tools this skill is inert — don't install it
globally on hosts that never run Canopy.

Extracted from `execution-mindset` v4.0, which mixed behavior rules with
Canopy tooling. Behavior lives in [execution-mindset](../execution-mindset/);
the sync protocol lives in [canopy-sync](../canopy-sync/).

## Contents

- [SKILL.md](SKILL.md) — pull-before-you-leap workflow, upsert triggers
  (facts vs patterns), timing, and anti-patterns.

## License

MIT — see [LICENSE](LICENSE).
