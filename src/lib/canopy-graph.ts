// Shared vocabulary of the Canopy graph drawings: the hero's GraphMorph, the
// "Autonomous graph" section and the CataloguePlate on the Canopy page all
// draw from this, so a node kind, an edge curve, an arrowhead or a colour
// means the same thing in each.
//
// The arrowhead/colour vocabulary below the edge curves (ARROW_MARGIN,
// shortenEdgeEnd, markerDefs, markerFor, flowPath, EDGE) is copied from
// canopy-web's plate — packages/plate/vocabulary.ts and
// packages/plate/render.ts @ d91e1b716741db9cf6e6027370f8b096417e954f
// (2026-11-01) — replicated in-repo so the landing never builds against
// another repository. The endpoint pullback convention follows the plate's
// canvas (apps/graphs/src/editor/canvas.ts, same commit).

export type Kind = 'chip' | 'agent' | 'check' | 'gate' | 'commit';

// Geometry of each node kind, as an interpolatable rect (viewBox units).
export const GEOM: Record<Kind, { w: number; h: number; rx: number; rot: number }> = {
  chip: { w: 10, h: 5.2, rx: 1, rot: 0 },
  agent: { w: 6, h: 6, rx: 3, rot: 0 },
  check: { w: 5.6, h: 5.6, rx: 0.7, rot: 0 },
  gate: { w: 5, h: 5, rx: 0.5, rot: 45 },
  commit: { w: 6.4, h: 6.4, rx: 3.2, rot: 0 },
};

// Colours and type sizes of the drawing (the hero's CSS carries the same values).
export const PALETTE = {
  chipFill: '#0c1416',
  gateFill: '#0c1416',
  gateStroke: '#e8f6f1',
  label: '#e8f6f1',
  deep: '#04110f',
  red: '#ff6b6b',
  token: '#cbfffc',
};
export const TYPE = {
  label: 2.3,
  labelDy: 6.4,
  chipLabelDy: 0.8,
  harness: 1.9,
  harnessDy: 8.9,
};

type Pt = { x: number; y: number };

/**
 * Edge path between two node centres: a smooth S-curve. A failure that drops to
 * another row is the same curve; one that routes back along the same row arcs
 * ABOVE the pair (labels sit below nodes). `lift` raises such an arc further, so
 * two back-edges into one node stay distinct (0 = the hero's drawing).
 * `forceArc` draws the arc whatever the row gap — a fail or error edge
 * touching an ensemble group never S-curves through the row.
 * (Verbatim from canopy-web packages/plate/vocabulary.ts @ d91e1b716741db9cf6e6027370f8b096417e954f.)
 */
export function edgePath(a: Pt, b: Pt, fail: boolean, lift = 0, forceArc = false): string {
  if (!forceArc && (!fail || Math.abs(b.y - a.y) > 6)) {
    const mx = (a.x + b.x) / 2;
    return `M${a.x} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
  }
  const rise = Math.min(a.y, b.y) - 8 - Math.abs(a.x - b.x) * 0.1 - lift;
  return `M${a.x} ${a.y - 3} C${a.x} ${rise} ${b.x} ${rise} ${b.x} ${b.y - 3}`;
}

// ── Plate arrowhead/colour vocabulary ─────────────────────────────────────
// Copied from canopy-web packages/plate/{vocabulary,render}.ts @ d91e1b7.

/** Gap between an arrowhead tip and the target border, in plate units. */
const ARROW_MARGIN = 0.8;

/**
 * Pull an edge endpoint back so an arrowhead tip lands on the target's
 * border instead of hiding under its shape. `half` is the target's
 * half-extent along the arrival `axis`, `arrive` the arrival direction
 * (+1/-1; null follows the endpoint delta, for S-curves), and `bias` the
 * offset the path builder already applies on that axis (arcs end 3 short
 * of b). Returns b unchanged when the bias already covers the pullback
 * or the endpoints overlap with no room to shorten.
 * (Verbatim from canopy-web packages/plate/vocabulary.ts @ d91e1b716741db9cf6e6027370f8b096417e954f.)
 */
function shortenEdgeEnd(
  a: Pt,
  b: Pt,
  half: number,
  axis: 'x' | 'y',
  arrive: 1 | -1 | null,
  bias = 0,
  margin: number = ARROW_MARGIN,
): Pt {
  const pull = half + margin - bias;
  if (pull <= 0) return b;
  const delta = axis === 'x' ? b.x - a.x : b.y - a.y;
  const dir = arrive ?? (delta === 0 ? 1 : Math.sign(delta));
  if (arrive === null && Math.abs(delta) < pull + 1.5) return b;
  return axis === 'x' ? { x: b.x - dir * pull, y: b.y } : { x: b.x, y: b.y - dir * pull };
}

/** Half-extent of a node kind along an axis (rotated kinds span √2·dim). */
function halfExtent(kind: Kind, axis: 'x' | 'y'): number {
  const g = GEOM[kind];
  const dim = axis === 'x' ? g.w : g.h;
  return (g.rot !== 0 ? dim * Math.SQRT2 : dim) / 2;
}

/**
 * Edge colour tokens, copied from canopy-web `packages/plate/render.ts`
 * @ d91e1b716741db9cf6e6027370f8b096417e954f (2026-11-01): a pass edge
 * strokes `var(--canopy)` at opacity .85, a fail edge `#ff6b6b` at .7, an
 * error edge `currentColor` at .45 — the error arrowhead keeps the plate's
 * pale `#e8f6f1` fill, because a marker inherits from its `<defs>`, never
 * from the edge that references it.
 */
export const EDGE = {
  pass: { color: 'var(--canopy)', fill: 'var(--canopy)' },
  fail: { color: '#ff6b6b', fill: '#ff6b6b' },
  error: { color: 'currentColor', fill: '#e8f6f1' },
} as const;

/**
 * The three flow arrowheads (pass/fail/error share the plate's geometry),
 * as a `<defs>` fragment. `prefix` namespaces the ids — several svgs share
 * the /canopy/ document, and marker ids are document-global. Fills ride
 * inline on the marker path (the plate paints them through its own
 * `<style>`; Astro scoped CSS never reaches `set:html` content).
 */
export function markerDefs(prefix: string): string {
  const marker = (suffix: string, fill: string, opacity: string): string =>
    `<marker id="${prefix}-arrow${suffix}" viewBox="0 0 10 10" refX="8" refY="5" ` +
    `markerWidth="1.3" markerHeight="1.3" markerUnits="userSpaceOnUse" ` +
    `orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${fill}" fill-opacity="${opacity}"/></marker>`;
  return (
    marker('', EDGE.pass.fill, '.85') +
    marker('-fail', EDGE.fail.fill, '.7') +
    marker('-error', EDGE.error.fill, '.45')
  );
}

/** The `marker-end` for a flow edge, or null for order guides (the plate's rule). */
export function markerFor(cond: 'pass' | 'fail' | 'error' | 'order', prefix: string): string | null {
  if (cond === 'order') return null;
  if (cond === 'fail') return `url(#${prefix}-arrow-fail)`;
  if (cond === 'error') return `url(#${prefix}-arrow-error)`;
  return `url(#${prefix}-arrow)`;
}

/**
 * A flow edge in the plate vocabulary: the S-curve or fail arc, with its
 * end pulled back so the arrowhead tip lands on the target's border — the
 * plate canvas's convention @ d91e1b7 (a same-row fail arc pulls back
 * along y with arrive 1 and the arc's own 3-unit bias; every other edge
 * along x, direction from the endpoint delta). `target` is the endpoint
 * node's kind; undefined (the hero's free points) skips the pullback.
 * `lift` raises a same-row arc, as in edgePath.
 */
export function flowPath(a: Pt, b: Pt, fail: boolean, target: Kind | undefined, lift = 0): string {
  const arc = fail && Math.abs(b.y - a.y) <= 6;
  if (target === undefined) return edgePath(a, b, fail, lift, arc);
  const end = arc
    ? shortenEdgeEnd(a, b, halfExtent(target, 'y'), 'y', 1, 3)
    : shortenEdgeEnd(a, b, halfExtent(target, 'x'), 'x', null, 0);
  return edgePath(a, end, fail, lift, arc);
}

// ── The hero's shapes ──────────────────────────────────────────────────────

export type N = { s: number; x: number; y: number; k: Kind; l: string; h?: string };
// 'order' = the try-next-member sequence inside an ensemble group (not a route).
export type E = [number, number, 'pass' | 'fail' | 'order'];
// An ensemble group: a labelled outline around its members, tried in `members` order.
export type Group = { x: number; y: number; w: number; h: number; label: string; members: number[] };
export type Leg = [number, number, boolean, ('red' | 'ok' | 'none')?];
// Edge/leg endpoints >= 100 are the shape's free points (`pts`), e.g. a group's exit.
export type Shape = { nodes: N[]; edges: E[]; walk: Leg[]; group?: Group; pts?: { x: number; y: number }[] };

// Slots: 0 spec · 1 main agent · 2 gate/check · 3 reviewer/third · 4 commit ·
// 5,6 extra members · 7 designer · 8 resilience.
export const HERO_SHAPES: Shape[] = [
  { // gated implement
    nodes: [
      { s: 0, x: 7, y: 31, k: 'chip', l: 'spec' },
      { s: 1, x: 28, y: 31, k: 'agent', l: 'implement', h: 'claude' },
      { s: 2, x: 49, y: 31, k: 'check', l: 'gates' },
      { s: 3, x: 70, y: 31, k: 'agent', l: 'review', h: 'opencode' },
      { s: 4, x: 91, y: 31, k: 'commit', l: 'commit' },
    ],
    edges: [[0, 1, 'pass'], [1, 2, 'pass'], [2, 1, 'fail'], [2, 3, 'pass'], [3, 1, 'fail'], [3, 4, 'pass']],
    walk: [[0, 1, false], [1, 2, false], [2, 1, true], [1, 2, false], [2, 3, false], [3, 4, false]],
  },
  { // ensemble quorum
    nodes: [
      { s: 0, x: 7, y: 31, k: 'chip', l: 'spec' },
      { s: 5, x: 34, y: 11, k: 'agent', l: 'propose', h: 'codex' },
      { s: 1, x: 34, y: 31, k: 'agent', l: 'propose', h: 'gemini' },
      { s: 6, x: 34, y: 51, k: 'agent', l: 'propose', h: 'copilot' },
      { s: 2, x: 62, y: 31, k: 'gate', l: 'quorum 2/3' },
      { s: 4, x: 91, y: 31, k: 'commit', l: 'commit' },
    ],
    edges: [[0, 5, 'pass'], [0, 1, 'pass'], [0, 6, 'pass'], [5, 2, 'pass'], [1, 2, 'pass'], [6, 2, 'pass'], [2, 4, 'pass']],
    walk: [[0, 5, false], [5, 2, false], [0, 1, false], [1, 2, false], [0, 6, false], [6, 2, true], [2, 4, false]],
  },
  { // cascade: standby alternatives — #1 runs; on failure #2 takes the spec cold; #3 never runs
    nodes: [
      { s: 0, x: 7, y: 31, k: 'chip', l: 'spec' },
      { s: 1, x: 47, y: 13, k: 'agent', l: 'first', h: 'kiro' },
      { s: 2, x: 47, y: 31, k: 'agent', l: 'fallback', h: 'mimo' },
      { s: 3, x: 47, y: 49, k: 'agent', l: 'last resort', h: 'qwen' },
      { s: 4, x: 91, y: 31, k: 'commit', l: 'commit' },
    ],
    // Entry only to #1; a single exit leaves the group (point 100, its right edge).
    edges: [[0, 1, 'pass'], [1, 2, 'order'], [2, 3, 'order'], [100, 4, 'pass']],
    // [from, to, red token, impact on arrival]
    walk: [[0, 1, false, 'red'], [1, 2, false, 'ok'], [2, 100, false, 'none'], [100, 4, false, 'ok']],
    group: { x: 31, y: 2, w: 32, h: 58, label: 'cascade', members: [1, 2, 3] },
    pts: [{ x: 63, y: 31 }],
  },
  { // router
    nodes: [
      { s: 0, x: 7, y: 31, k: 'chip', l: 'spec' },
      { s: 2, x: 27, y: 31, k: 'gate', l: 'router' },
      { s: 5, x: 52, y: 11, k: 'agent', l: 'bugfix', h: 'claude' },
      { s: 1, x: 52, y: 31, k: 'agent', l: 'feature', h: 'codex' },
      { s: 6, x: 52, y: 51, k: 'agent', l: 'docs', h: 'gemini' },
      { s: 4, x: 88, y: 31, k: 'commit', l: 'commit' },
    ],
    edges: [[0, 2, 'pass'], [2, 5, 'pass'], [2, 1, 'pass'], [2, 6, 'pass'], [5, 4, 'pass'], [1, 4, 'pass'], [6, 4, 'pass']],
    walk: [[0, 2, false], [2, 5, false], [5, 4, false]],
  },
  { // rq pipeline + resilience
    nodes: [
      { s: 0, x: 6, y: 24, k: 'chip', l: 'spec' },
      { s: 7, x: 21, y: 24, k: 'agent', l: 'design', h: 'claude' },
      { s: 1, x: 37, y: 24, k: 'agent', l: 'implement', h: 'deepseek' },
      { s: 2, x: 53, y: 24, k: 'check', l: 'gates' },
      { s: 3, x: 69, y: 24, k: 'agent', l: 'review ×2', h: 'kiro' },
      { s: 4, x: 90, y: 24, k: 'commit', l: 'commit' },
      { s: 8, x: 47, y: 52, k: 'agent', l: 'resilience', h: 'muse' },
    ],
    edges: [[0, 7, 'pass'], [7, 1, 'pass'], [1, 2, 'pass'], [2, 1, 'fail'], [2, 3, 'pass'], [3, 4, 'pass'], [1, 8, 'fail'], [8, 7, 'pass']],
    walk: [[0, 7, false], [7, 1, false], [1, 8, true], [8, 7, false], [7, 1, false], [1, 2, false], [2, 3, false], [3, 4, false]],
  },
];
