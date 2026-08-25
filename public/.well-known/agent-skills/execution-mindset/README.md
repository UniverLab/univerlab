# Execution Mindset Skill

**Always-active operating mode** for zero-indulgence, interview-driven agent behavior.

---

## Overview

The Execution Mindset skill turns the agent into a disciplined collaborator rather than a blind executor. It is the default operating mode for starting work, aligning on ambiguous requests, verifying outcomes, and responding efficiently.

---

## Key Principles

### 🔴 CRITICAL Principles

1. **Zero Indulgence + Interview** — No soft landings. When uncertain, interview to align mental models. When clear, execute immediately.
2. **The Resolution Model** — Model the system, locate the expected-vs-observed divergence, make the smallest decisive move, treat anomalies as signal, fix at the broken contract, close the loop.
3. **Verify Before Reporting** — Never say "done" without verifying from the user's perspective

### 🟡 IMPORTANT Principles

4. **Relentless Resourcefulness** — Try 5+ approaches before declaring something impossible
5. **Token Efficiency** — Be lean in commands and responses without losing substance

This skill is pure behavior: Canopy-specific tooling (intelligence layer, sync
protocol) was extracted in v5.0 to [canopy-intelligence](../canopy-intelligence/)
and [canopy-sync](../canopy-sync/). Role behavior stacks on top:
[architect-mindset](../architect-mindset/) for design,
[code-engineering](../code-engineering/) for code.

---

## When This Skill Triggers

This skill is **always active** and applies whenever the agent must:
- decide how to approach a task
- align on ambiguous or underspecified requests
- verify results before reporting completion
- recover from failed attempts
- keep commands and responses lean

---

## Skill Structure

```
execution-mindset/
├── SKILL.md              # Main skill definition
├── README.md             # This file
├── LICENSE               # MIT License
└── references/           # Reference documentation
    ├── VERIFY_EXAMPLES.md
    ├── RESOURCEFULNESS_EXAMPLES.md
    └── TOKEN_EFFICIENCY_EXAMPLES.md
```

---

## Reference Documentation

The `references/` directory is loaded on demand:

- **VERIFY_EXAMPLES.md** — load when you need a stronger validation loop
- **RESOURCEFULNESS_EXAMPLES.md** — load after the first approach fails
- **TOKEN_EFFICIENCY_EXAMPLES.md** — load before verbose commands or long output

---

## Usage

This skill is designed to be always-active. Include it in your agent configuration:

```yaml
skills:
  - name: execution-mindset
    path: skills/execution-mindset/SKILL.md
    always_active: true
```

---

## License

MIT © Jheison Martinez

---

## Author

Jheison Martinez ([@JheisonMB](https://github.com/JheisonMB))

---

## Version

5.0 (2026-07-14)
