# Demostage Skill

**Demos as Code** skill for capturing, recording, and exporting terminal demos as reproducible engineering.

---

## Overview

This skill helps agents work with demostage — a CLI tool that turns terminal demos into reproducible code. Records a session as events, normalizes to a clean score (`demo.toml`), executes to produce a recording (`.rec`), and compiles to `gif` or `mp4`.

---

## When This Skill Triggers

Use it when the user asks to:

- capture a live terminal session
- record or re-record a demo from a score
- export a recording to gif/mp4
- edit timing/wait steps in a demo score
- author a demo.toml by hand
- compose terminal + browser pane demos
- manage sources and scenes

---

## Skill Structure

```
demostage/
├── SKILL.md          # Main skill definition
├── README.md         # This file
├── LICENSE           # MIT License
```

---

## Usage

Reference it from agent configuration:

```yaml
skills:
  - name: demostage
    path: skills/demostage/SKILL.md
    triggers:
      - "demo record"
      - "demo capture"
      - "demo export"
      - "terminal demo"
      - "demo.toml"
```

---

## License

MIT © Jheison Martinez

---

## Version

0.2 (2026-06-28)
