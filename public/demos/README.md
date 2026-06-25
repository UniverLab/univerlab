# Demos

Short screen recordings of each experiment, shown as **"Fig. 1"** on its landing
page (right after the hero) and behind the hero **"Watch demo"** button.

## Convention

- **Format:** `mp4` (H.264), muted, short loop (~10–30s). An optional poster
  frame can be added later.
- **Filename:** `<experiment-id>.mp4` — e.g. `gitkit.mp4`, `canopy.mp4`,
  `ghscaff.mp4`, `texforge.mp4`, `cadspec.mp4`.
- Recorded with **DemoStage** (`demo record` → `demo export --format mp4`).

## Activating a demo

1. Drop the clip here: `public/demos/<id>.mp4` → it is served at `/demos/<id>.mp4`.
2. Set `demo: '/demos/<id>.mp4'` on that experiment in
   `src/lib/experiments.ts`.

Until both are done, the figure and the "Watch demo" button stay hidden — the
landing degrades cleanly with no broken media.
