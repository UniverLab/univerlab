# Code Engineering Skill

**Production-grade coding skill** for implementation, refactoring, review, and architecture decisions that need more than syntax.

---

## Overview

The Code Engineering skill helps an agent make durable code decisions: where logic should live, when to extract abstractions, how to keep interfaces small, and when a pattern is actually justified. It complements the Execution Mindset skill, which handles execution discipline and safety.

---

## Key Principles

### Core defaults

1. **Read before writing** — match existing conventions and abstractions
2. **Prefer logical milestones** — make coherent changes that can be validated as a unit
3. **Choose simple structures first** — no speculative abstraction
4. **Fail fast** — guard clauses and explicit invalid-state handling
5. **Keep boundaries clear** — small public APIs, focused responsibilities, explicit names

---

## When This Skill Triggers

Use this skill when the task involves:
- implementing code across one or more files
- refactoring or restructuring existing code
- reviewing maintainability or design quality
- selecting a pattern or abstraction boundary
- making architecture decisions with tradeoffs

---

## Skill Structure

```
code-engineering/
├── SKILL.md              # Main skill definition
├── README.md             # This file
├── LICENSE               # MIT License
└── references/           # Reference documentation
    ├── design-patterns.md
    └── clean-code-checklist.md
```

---

## Reference Documentation

The `references/` directory is intentionally loaded on demand:

- **design-patterns.md** — load when a real pattern decision appears
- **clean-code-checklist.md** — load before finalizing structural changes

For architecture decision records, use the
[architect-mindset](../architect-mindset/) skill — the ADR reference moved
there in v2.0.

---

## Usage

Include in your agent configuration for coding tasks:

```yaml
skills:
  - name: code-engineering
    path: skills/code-engineering/SKILL.md
    triggers:
      - "write code"
      - "review code"
      - "design pattern"
      - "refactor"
      - "architecture"
```

---

## License

MIT © Jheison Martinez

---

## Author

Jheison Martinez ([@JheisonMB](https://github.com/JheisonMB))

---

## Version

1.4 (2026-05-13)
