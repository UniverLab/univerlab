# Cadspec Skill

**CAD as code** skill for declarative geometry in `.cf` TOML files compiled to DXF with faithful previews.

---

## Overview

This skill helps agents work with cadspec — a Rust CLI for CAD as code. Geometry is declared in `.cf` TOML layers, compiled deterministically to DXF, and rendered as faithful previews (real text, measured dimension labels, hatches).

---

## When This Skill Triggers

Use it when the user asks to:

- create or initialize a cadspec project
- edit `.cf` primitives and validate the project
- live-preview while editing (`cadspec serve`)
- compile layers to DXF or generate PNG/SVG previews
- visually verify edits with entity highlights
- import an existing DXF into `.cf` layers
- implement or debug cadspec CLI/library features

---

## Skill Structure

```
cadspec/
├── SKILL.md          # Main skill definition
├── README.md         # This file
├── LICENSE           # MIT License
```

---

## Usage

Reference it from agent configuration:

```yaml
skills:
  - name: cadspec
    path: skills/cadspec/SKILL.md
    triggers:
      - "cad as code"
      - "cadspec"
      - ".cf files"
      - "dxf"
```

---

## License

MIT © Jheison Martinez

---

## Version

0.9.0 (2026-06-28)
