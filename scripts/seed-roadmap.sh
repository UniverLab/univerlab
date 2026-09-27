#!/usr/bin/env bash
# One-shot public roadmap seed (univerlab landing block, 2026-09-27).
set -euo pipefail
TOKEN="$(cat "$(dirname "$0")/../workers/announcements/.auth-token.local")"
API="https://announcements.univerlab.org/roadmap"
post() {
  curl -sf -X POST "$API" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$1" | head -c 80; echo
}
# --- now ---
post '{"title":"Small versions: an update command in every CLI (texforge, gitkit, ghScaff, DemoStage)","state":"now","topic":"general"}'
# --- next ---
post '{"title":"TeXForge: syntax-highlighted code listings that keep the self-contained promise","state":"next","topic":"texforge"}'
post '{"title":"DemoStage: SVG output beside gif and mp4","state":"next","topic":"demostage"}'
post '{"title":"Canopy: the quality maintenance loop before any new feature","state":"next","topic":"canopy"}'
# --- later ---
post '{"title":"Canopy: every pending feature of the last two reviews (PTY in the daemon, native Windows, RAG collections, directed messages)","state":"later","topic":"canopy"}'
post '{"title":"Canopy: recipes — installable graph designs and a public catalogue","state":"later","topic":"canopy"}'
post '{"title":"UniverLab Learning — local-first learning tool, the first path to revenue","state":"later","topic":"general"}'
post '{"title":"Package-manager distribution: Homebrew and winget","state":"later","topic":"general"}'
# --- idea ---
post '{"title":"Astro-denoise — benchmarking astronomical denoising by the science it recovers","state":"idea","topic":"astro-denoise","blocked_reason":"Proposal with the evaluation committee; the day it is approved it goes first"}'
# --- done ---
post '{"title":"Canopy 3.0.1 — the loop is now a graph, with update, uninstall and binaries for three platforms","state":"done","topic":"canopy"}'
post '{"title":"Landing: one visual identity per experiment, and this roadmap on the status page","state":"done","topic":"general"}'
post '{"title":"Canopy platform registry with invocation templates per CLI","state":"done","topic":"canopy"}'
