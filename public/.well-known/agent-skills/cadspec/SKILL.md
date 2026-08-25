---
name: cadspec
description: >
  Use this skill when the user needs cadspec workflows for declarative CAD as code in TOML
  (.cf): creating projects, live-previewing in the browser (serve), compiling to DXF,
  validating layers/constraints, generating PNG/SVG previews for visual verification,
  importing DXF, formatting .cf files, or running watch mode. Activate for prompts
  mentioning cadspec commands (new/init/serve/build/check/layers/preview/schema/fmt/
  watch/import/view), project.toml, .cf primitives, AGENTS.md in a CAD project, or
  CAD-as-code drawing pipelines.
license: MIT
metadata:
  author: jheison.martinez
  version: "0.9.0"
  framework: OpenCode
  category: cli-tool
  last_updated: "2026-06-28"
---

# cadspec skill

cadspec is a Rust CLI + library for CAD as code. Geometry is
declared in `.cf` TOML layers orchestrated by `project.toml`, compiles
deterministically to DXF, and renders faithful previews (real text, measured
dimension labels, hatches) so both humans and AI agents can *see* the drawing.

## When to use

Use this skill when the task involves:
- creating or initializing a cadspec project
- editing `.cf` primitives and validating the project
- live-previewing while editing (`cadspec serve`)
- compiling layers to DXF or generating PNG/SVG previews
- visually verifying edits with entity highlights
- importing an existing DXF into `.cf` layers
- implementing or debugging cadspec CLI/library features

## The vibecoding loop (human watching)

```bash
cadspec new mi-proyecto && cd mi-proyecto
cadspec serve                 # live preview on http://127.0.0.1:4377
# serve DAEMONIZES by default: it prints the URL + pid and returns (the
# server keeps running in the background — it does NOT block the shell).
# Then open the URL in a browser. edit .cf files — the browser refreshes
# ~80ms after every save; parse errors appear as an overlay.
cadspec serve --stop          # stop the background server for this project
cadspec serve --foreground    # opt-in: stay attached, stream logs, Ctrl+C to stop
```

Viewer features:
- scroll = zoom, drag = pan, double-click / `F` = fit, `Esc` = deselect
- **click any entity** → inspector panel with its source TOML block and
  copy buttons (`copy for agent` produces a ready-made targeted-edit prompt)
- left sidebar has two stacked panels (drag the divider to resize): **Layers**
  (keys `1`-`9`: cycle on → ghost → off, ideal for tracing floors) and **Planos**
  (click a sheet to view it; click again to return to the model)
- `3D` button (or key `3`): real extruded 3D view — primitives with an
  `extrude` height become solids/walls (see `.cf format essentials`)

`serve` renders SVG only; run `cadspec build` when you need the DXF.

## The agent feedback loop (autonomous editing)

1. `cadspec schema` — dump the complete `.cf` language reference (markdown).
   If a project lacks an `AGENTS.md`, generate one with `cadspec schema > AGENTS.md`.
2. Edit `.cf` files.
3. `cadspec check --json` — machine-readable validation: layers, entity
   counts, constraint violations, `strict` flag. Non-zero exit if strict+violations.
4. `cadspec preview` — writes `preview.png` (faithful render) and
   `preview.meta.json` mapping every entity id to world **and pixel** bounding
   boxes (plus text content). **Look at the image** to verify the result.
5. `cadspec preview --highlight ln-001,tx-002` — re-render with labeled amber
   dashed markers around those ids to confirm an edit landed where intended.
   Unknown ids are ignored silently.
6. `cadspec preview --3d` — render the extruded 3D view to `preview.png`
   (axonometric). **Look at the image** to verify heights/elevations.

## Core commands

```bash
cadspec new <name>                 # scaffold a starter project (shapes/curves/annotations)
cadspec init                       # scaffold into current directory
cadspec serve [--port N] [--open]  # live preview server (default port 4377);
                                    # DAEMONIZES by default (returns immediately)
cadspec serve --stop               # stop this project's background server
cadspec serve --foreground         # run attached (blocks; Ctrl+C to stop)
cadspec build [--layer <name>] [--output <file>] [--check]
cadspec check [--json]
cadspec layers [--json]
cadspec schema                     # full .cf reference for agents
cadspec preview [--width <px>] [-H <px>] [--layer <name>]
                 [--format png|svg|all] [--highlight id1,id2] [--3d]
                 [--plano <name>]   # render a drawing sheet (see project.toml)
cadspec fmt [--check]
cadspec watch                      # auto-rebuild DXF on save
cadspec import <file.dxf> [--layer <name>]
cadspec view [--layer <name>]      # open DXF in external viewer
cadspec config set|show            # global defaults (author, units)
```

All project commands accept `--path <dir>` to run outside the project directory.

## .cf format essentials

Primitives: `line`, `polyline`, `rect`, `circle`, `arc`, `text`, `point`,
`dim`, `hatch`, `fill`, `group`, plus construction tools `array` (linear /
polar — spiral stairs, gears, repeated columns) and `mirror`. Run
`cadspec schema` for every attribute — do not guess fields from memory.

```toml
[layer]                 # optional per-file metadata
name = "muros"
color = "#FFFFFF"
line_weight = 0.35

[[line]]
id = "ln-001"           # ids enable hatch boundaries, belongs_to, --highlight
from = [0.0, 0.0]
to = [8.5, 0.0]
weight = 0.50

[[polyline]]
id = "pl-001"
points = [[0.0, 0.0], [5.0, 0.0], [5.0, 3.0], [0.0, 3.0]]
closed = true
extrude = 3.0           # 3D view only: height (world units). closed shape → solid;
                        #   line / open polyline → wall. omitted/0 = flat
elevation = 0.0         # 3D view only: base Z the shape sits at (default 0)

[[text]]
position = [4.0, 3.0]
content = "SALA"
size = 0.25             # world units, not points
align = "center"

[[dim]]                 # measured distance is labeled automatically in render
from = [0.0, 0.0]
to = [8.5, 0.0]
offset = -0.8           # sign picks the side
text_size = 0.25        # label height in world units (optional)
precision = 2           # decimals (default 2)
show_units = true       # append project units (default true)

[[hatch]]
boundary = "pl-001"     # id of a closed polyline/rect in the same file
pattern = "ansi31"      # ansi31..34 | solid | none

[[array]]               # polar array: spiral stair / gear teeth
target = "pl-huella"    # or targets = [...]; copies get ids id@1, id@2, …
mode = "polar"          # polar | linear (linear uses offset = [dx, dy])
count = 16              # total instances including the original
center = [0.0, 0.0]
step_angle = 22.5

[[mirror]]              # mirrored copies get ids id@m
targets = ["pl-nave", "ar-puerta"]
axis = [[2.5, 0.0], [2.5, 1.0]]

# 3D-only solids + CSG booleans (do NOT appear in the 2D plan or DXF).
# Cube with a hole = box − cylinder:
[[solid]]   id = "cubo"  shape = "box"      at = [0,0,0]      size = [4,4,4]
[[solid]]   id = "broca" shape = "cylinder" at = [2,2,-0.5]   radius = 1.2  height = 5
[[boolean]] id = "perforado" op = "difference" base = "cubo" tools = ["broca"]
# op = difference (cut) | union | intersection; result rendered, inputs consumed
```

## project.toml essentials

```toml
[project]
name = "mi-proyecto"
units = "m"             # used in dimension labels
strict = false          # true: constraint violations fail the build

[layers]                # order = draw order (later on top)
muros = { file = "muros.cf", locked = false }
cotas = { file = "cotas.cf", locked = false }

[constraints]           # optional
cotas.parent = "muros"          # child bbox inside parent bbox
cotas.belongs_to = "muros"      # children reference parent ids via belongs_to

# Planos (drawing sheets / "ventanas"): named views of the one model, framed at
# a paper size with a title block (rótulo). Listed in the viewer's Planos panel
# (under Layers); render with `cadspec preview --plano <name>`.
[[plano]]
name = "P-01"
view = "plan"           # plan | iso | front | back | left | right | top | section
size = [420.0, 297.0]   # sheet size in mm (default A3 landscape)
scale = "1:50"
title = "Planta baja"
rotulo = "rotulo.cf"    # optional: a .cf drawn as a custom title block (else default)

[[plano]]               # a cut: keep one side of a plane, see the interior
name = "C-01"
view = "section"
cut_axis = "z"          # x | y | z
cut_at = 1.5
keep = "min"            # min (default) keeps ≤ side, max keeps ≥ side
```

## Gotchas

- `[[polyline]]` uses `points`, not `vertices`. Coordinates are floats, Y grows up.
- `preview` height short flag is `-H` (`-h` is help). `--width/-H` are a fit box;
  the image keeps the content aspect ratio.
- `text.size` is in world units (e.g. `0.25` for a 25cm-tall label at units = m),
  not font points.
- `cadspec check` validates only; `build --check` is equivalent. Neither writes DXF.
- Generated artifacts (`output.dxf`, `preview.png`, `preview.svg`,
  `preview.meta.json`) are gitignored — never hand-edit them.
- Text rendering uses an embedded DejaVu Sans Mono: previews are deterministic and
  work in containers with no system fonts.
- `serve` watches `.cf`/`.toml` only and renders SVG; it does not write DXF.
  It runs as a background daemon by default (pid + log under `.cadspec/`);
  do not wrap it in your own `&`/`nohup`, and stop it with `cadspec serve --stop`.
- `[[array]]`/`[[mirror]]` expand at build time; generated copies have ids
  like `base@3` / `base@m`. To change all copies, edit the base entity or the
  array/mirror block — generated ids do not exist in the source files.
- Geometry is authored in 2D plan coordinates, but cadspec HAS a real 3D view
  (`cadspec preview --3d`, viewer `3D` button):
  - **Extrusion** — give a 2D primitive an `extrude` height (+ optional
    `elevation`): closed shapes → prisms/cylinders, lines/open polylines → walls.
  - **Solids + CSG booleans** — `[[solid]]` (box/cylinder) combined with
    `[[boolean]]` (`difference`/`union`/`intersection`). "Cube with a hole" =
    box − cylinder. This is how you cut/drill.
  If a user wants a 3D model, reach for `extrude`/`elevation` or `[[solid]]` +
  `[[boolean]]` here — do **not** scaffold external tools (Three.js/OpenSCAD/
  FreeCAD). What is NOT supported: a B-rep feature tree / interactive
  sketch-on-a-face workflow (select a face of a result, draw, pad/pocket) —
  position the cutting solid by coordinates instead. For constraints/import
  edge cases, check `cadspec-spec.md` in the repo before promising behavior.
