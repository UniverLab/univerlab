---
name: demostage
description: >
  CLI tool for making terminal demos as reproducible code ("Demos as Code"). Use this skill whenever the
  user wants to capture, record, export, or edit a terminal demo, author a demo.toml score, produce a
  gif/mp4 of a CLI session, compose a terminal pane next to a browser/PDF pane, or manage sources and
  scenes. Activate when the user mentions "demo capture", "demo record", "demo export", "demo edit",
  demo.toml, macro.raw.toml, recording a terminal demo, gif/mp4 of a terminal, DemoStage, or a
  multi-scene terminal+browser demo.
license: MIT
metadata:
  author: jheison.martinez
  version: "0.2"
  framework: OpenCode
  category: cli-tool
  last_updated: "2026-06-28"
---

# DemoStage CLI (`demo`)

Turns terminal demos into reproducible engineering. Records a session as **events**, normalizes human
imperfections into a clean **score** (`demo.toml`), executes that score to produce a **recording**
(`.rec`), and compiles recordings to `gif` or `mp4`. A demo becomes a version-controlled, re-runnable
file. Heavy tools are auto-provisioned tectonic-style: `mp4` fetches a managed **ffmpeg** and browser
panes fetch **Chromium** on first use (a system install is used if present).

## Installation

```bash
# Linux / macOS
curl -fsSL https://get.univerlab.org/demostage | sh
# or from source
cargo install --path .
```

## The loop

```
demo capture ──> macro.raw.toml ──> demo.toml ──> demo record ──> demo.rec ──> demo export ──> gif/mp4
```

| Command | Does |
|---|---|
| `demo capture [--font F] [--into stage] [--raw file] [-O score]` | Capture an interactive PTY session. Produces a raw macro and normalizes to a score. Stop with `exit`/Ctrl-D or on idle. |
| `demo record [-i demo.toml] [-o demo.rec]` | Execute a score in a PTY to (re)produce a recording. |
| `demo export [gif,mp4] [-i demo.rec] [--speed 2x] [--force]` | Render a recording to formats. `--force` renders a raw capture directly. |
| `demo edit [demo.toml]` | Interactively edit timing/wait steps in a score. |
| `demo doctor` | Check the environment for browser/video dependencies and report fixes. |

You can skip capture and **author `demo.toml` by hand**, then `record` + `export`.

## In-capture commands

During `demo capture`, these commands are intercepted from stdin and never appear in the recording:

| Command | Does |
|---|---|
| `/stop` | End the capture session |
| `/focus <scene>` | Switch to a different scene (e.g. `/focus browser`) |

## Sources and scenes

Demos are composed of **sources** (content elements) and **scenes** (compositions/layouts):

- **Sources**: `TerminalSource`, `BrowserSource`, `PdfSource` — individual content panes
- **Scenes**: named compositions that arrange sources using layout strings

Layout string format:
- `"main+google"` — 50/50 split
- `"main+google+github"` — thirds
- `"main*2+google"` — weighted (2:1)

## demo.toml (the DSL)

```toml
[demo]
name = "my-demo"
output_dir = "./dist"

[typing]            # optional: humanized typing for human_salt steps
base_ms = 80
salt_ms = 15
seed = 42           # set for reproducible output

[layout]
width = 1280
height = 720
fps = 15
background = "#0b0f14"
font_family = "DejaVu Sans Mono"
font_size = 14

  [[layout.panes]]
  id = "console"
  type = "terminal"   # "terminal" | "browser"
  x = 0
  y = 0
  width = 1280
  height = 720
  font_size = 16

[[timeline]]
action = "focus"
pane = "console"

[[timeline]]
action = "type"
text = "cargo build --release"
human_salt = true

[[timeline]]
action = "keypress"
key = "enter"          # enter, tab, esc, up/down/left/right, ctrl+c, …

[[timeline]]
action = "wait_for_stdout"
match = "Finished"

[[timeline]]
action = "terminate"
```

Timeline actions: `focus` (set active pane), `type` (`text`, `human_salt?`), `keypress` (`key`), `wait`
(`duration_ms`), `caption` (`text` — on-canvas step label for gif/mp4; empty clears), `wait_for_stdout`
(`match`, `pane?`), `scroll` (browser: `direction`, `duration_ms`), `focus_scene` (`scene`), `terminate`.

## Multi-scene (terminal + browser)

Add a `browser` pane (a PDF viewer or live web preview) beside the terminal; `gif`/`mp4` composite both.

```toml
  [[layout.panes]]
  id = "preview"
  type = "browser"
  x = 640
  y = 0
  width = 640
  height = 720
  url = "file:///tmp/out/main.pdf"   # required for browser panes

[[timeline]]
action = "focus"
pane = "preview"
[[timeline]]
action = "scroll"
direction = "down"
duration_ms = 3000
```

## Fonts

DemoStage bundles 5 fonts for Unicode coverage in exports:

| Font | Unicode coverage |
|---|---|
| DejaVu Sans Mono (default) | 13/14 blocks |
| Liberation Mono | 12/14 blocks |
| JetBrains Mono | 11/14 blocks |
| IBM Plex Mono | 10/14 blocks |
| Ubuntu Mono | 6/14 blocks |

Use `--font` during capture to pick interactively, or pass `--font "JetBrains Mono"` to skip the wizard.

## Notes for agents

- Always `demo record` a score before `demo export`; `export` plays back a `.rec`, it does not execute the score.
- **Secrets:** `demo capture` redacts input typed at password/passphrase prompts (it's
  forwarded but never recorded). It's a heuristic — review the macro/score before
  sharing, and prefer non-interactive bypasses (e.g. `GITHUB_TOKEN` for ghScaff) for
  secret flows. Secrets a program *prints* to stdout are not redacted; edit them out.
- For a clean recording, DemoStage forces `PS1='$ '` during capture, so demos never leak `user@host`.
- `gif`/`mp4` are the export targets. `mp4` auto-fetches ffmpeg; browser panes auto-fetch
  Chromium (or use a system install). If a download is blocked, install the tool via the package manager.
- Scrolling Chrome's built-in **PDF** viewer is best-effort; for reliable PDF paging prefer a web preview or
  page fragments. Web pages scroll normally.
- Browser panes are captured **after** the terminal run, so point them at something still available then — a
  persistent file (PDF, rendered SVG/PNG) or a server the terminal leaves running (don't stop it mid-score).
- A browser pane **reveals when first focused**: `focus` it right after the server is up / the PDF compiled
  (e.g. after a `wait_for_stdout`) and it opens at that moment.
- For reproducible secret-gated flows, don't store the secret: list the env var in `[env].requires` and have
  the runner provide it (e.g. `GITHUB_TOKEN` for ghScaff). `check` fails if a required var is unset.
- Use `caption` steps to overlay step labels on the canvas (gif/mp4); add a `wait` after one to hold it.
- Use `[typing].seed` whenever the output must be byte-stable (CI, golden files).
- In-capture `/stop` and `/focus <scene>` are intercepted from stdin and never reach the PTY or recording.
