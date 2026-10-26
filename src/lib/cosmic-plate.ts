// The cosmic perspective plate — a Powers-of-Ten pull-back drawn as an
// engraving. Eight scenes, each centred on "us": the observer on the horizon,
// Earth, the Solar System, the Orion Arm, the Milky Way, the Local Group,
// Laniakea and the observable universe. Then deep time on one rule, with the
// last 300 000 years magnified until a human life is a hairline.
//
// Everything is generated at build time from a seeded random, so the markup is
// static and identical on every build. The page script only sets each scene's
// transform and opacity from the scroll (see src/scripts/cosmic-plate.ts).
// Strokes use currentColor and vector-effect="non-scaling-stroke", so the plate
// inks itself for day and night and its lines stay hairline at any zoom; star
// fields are one <path> per scene of zero-length round-capped segments, so a
// thousand stars cost one element.

/** Drawing-unit growth from one scene to the next. */
export const ZOOM = 6;
/** The space phase runs z = 0…SPACE_END, the time phase SPACE_END…Z_END. */
export const SPACE_END = 7;
export const Z_END = 10;

export const VIEW = { x: -500, y: -320, w: 1000, h: 640 };

/** Deterministic PRNG (mulberry32): the same plate on every build. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scroll progress (0…1 through the plate) to camera depth z. */
export function progressToZ(p: number): number {
  return Math.max(0, Math.min(1, p)) * Z_END;
}

/** Scale of scene i at depth z: 1 when the camera sits on it, 1/ZOOM one step later. */
export function sceneScale(i: number, z: number): number {
  return Math.pow(ZOOM, i - z);
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Opacity of scene i at depth z: it fades in as it comes into frame, holds,
 *  and fades as it shrinks into the next scene. The first scene is already
 *  showing at z = 0 and the last holds until the time phase takes over. */
export function sceneOpacity(i: number, z: number, last = SPACE_END): number {
  const fadeIn = i === 0 ? 1 : smooth(i - 0.7, i - 0.2, z);
  const fadeOut = i === last ? 1 - smooth(SPACE_END + 0.1, SPACE_END + 0.6, z) : 1 - smooth(i + 0.35, i + 0.85, z);
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

/** The scene whose caption shows at depth z (the dominant one, clamped). */
export function captionIndex(z: number): number {
  // Scene i fades out from i+0.35 while i+1 fades in from i+0.3: the caption
  // hands over where the two cross, a little past the midpoint.
  return Math.max(0, Math.min(SPACE_END, Math.floor(z + 0.4)));
}

/** Time phase progress 0…1 (0 before it starts). */
export function timeProgress(z: number): number {
  return smooth(SPACE_END + 0.3, Z_END - 0.15, z);
}

/* ── Drawing helpers ─────────────────────────────────────────────────────── */

const f = (n: number): string => (Math.round(n * 10) / 10).toString();
const LINE = 'fill="none" stroke="currentColor" vector-effect="non-scaling-stroke"';

/** Stars as one path of round dots; `w` is the dot size in screen px. */
function dots(points: Array<[number, number]>, w: number, opacity = 1): string {
  const d = points.map(([x, y]) => `M${f(x)} ${f(y)}h0`).join('');
  return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="${opacity}"/>`;
}

function circle(cx: number, cy: number, r: number, extra = ''): string {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" ${LINE} ${extra}/>`;
}

/** Scattered background stars over the whole view, for depth. */
function field(rand: () => number, n: number, spread = 520): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) pts.push([(rand() * 2 - 1) * spread, (rand() * 2 - 1) * spread * 0.66]);
  return pts;
}

/* ── The eight scenes (own units: the main object spans ~±300) ──────────── */

function observer(): string {
  const rand = rng(11);
  // A figure on a hill under the stars, looking up. The horizon is the top of
  // a huge circle, which becomes Earth's limb as the plate pulls back.
  // Short engraver's strokes just under the horizon, following its curve.
  const hatch = Array.from({ length: 30 }, (_, k) => {
    const x = -420 + k * 29;
    const y = 1040 - Math.sqrt(1000 * 1000 - x * x);
    return `<path d="M${f(x)} ${f(y + 6)} l-10 ${f(14 + (k % 3) * 5)}" ${LINE} stroke-width="0.6" opacity="0.5"/>`;
  }).join('');
  return [
    circle(0, 1040, 1000, 'stroke-width="1"'),
    hatch,
    // The observer: head, coat, a raised arm pointing up.
    `<g transform="translate(0 32) scale(0.9)" ${LINE} stroke-width="1.1">`,
    '<circle cx="0" cy="-60" r="7"/>',
    '<path d="M0 -53 L-2 -18 L-10 10 M-2 -18 L7 10 M-1 -46 L-14 -28 M-1 -46 L12 -66 L16 -82"/>',
    '<path d="M-6 -48 L-12 -10 L8 -10 L4 -48 Z" opacity="0.8"/>',
    '</g>',
    dots(field(rand, 140, 480).filter(([, y]) => y < -30), 1.6, 0.9),
    dots([[60, -150], [-140, -200], [210, -120]], 3.2),
  ].join('');
}

function earth(): string {
  const r = 160;
  const meridians = [-60, -30, 0, 30, 60]
    .map((deg) => {
      const rx = Math.abs(Math.sin((deg * Math.PI) / 180)) * r;
      return deg === 0
        ? `<path d="M0 ${-r} V${r}" ${LINE} stroke-width="0.6" opacity="0.6"/>`
        : `<ellipse cx="0" cy="0" rx="${f(rx)}" ry="${r}" ${LINE} stroke-width="0.6" opacity="0.6"/>`;
    })
    .join('');
  const parallels = [-0.66, -0.33, 0, 0.33, 0.66]
    .map((k) => {
      const y = k * r;
      const w = Math.sqrt(r * r - y * y);
      return `<ellipse cx="0" cy="${f(y)}" rx="${f(w)}" ry="${f(w * 0.12)}" ${LINE} stroke-width="0.6" opacity="0.6"/>`;
    })
    .join('');
  // Night side: a hatched crescent clipped to the globe.
  const shade = Array.from({ length: 26 }, (_, k) => {
    const y = -r + k * 13;
    return `<path d="M${f(r * 0.15)} ${f(y)} l${f(r)} ${f(r * 0.4)}" ${LINE} stroke-width="0.6" opacity="0.7"/>`;
  }).join('');
  const rand = rng(23);
  return [
    `<clipPath id="cp-earth"><circle cx="0" cy="0" r="${r}"/></clipPath>`,
    circle(0, 0, r, 'stroke-width="1.2"'),
    meridians,
    parallels,
    `<g clip-path="url(#cp-earth)">${shade}</g>`,
    // The Moon on its orbit.
    `<circle cx="0" cy="0" r="290" ${LINE} stroke-width="0.6" stroke-dasharray="2 5" opacity="0.6"/>`,
    circle(-232, -174, 9, 'stroke-width="1"'),
    dots(field(rand, 90), 1.4, 0.7),
  ].join('');
}

function solarSystem(): string {
  const orbits = [34, 52, 72, 96, 150, 196, 244, 290];
  const rand = rng(37);
  const planets = orbits
    .map((a, k) => {
      const th = rand() * Math.PI * 2;
      const pr = k === 2 ? 4 : k > 3 ? 3.5 + (k === 4 ? 2 : 0) : 2.5;
      return circle(Math.cos(th) * a, Math.sin(th) * a * 0.42, pr, 'stroke-width="1"');
    })
    .join('');
  const rays = Array.from({ length: 16 }, (_, k) => {
    const th = (k / 16) * Math.PI * 2;
    return `<path d="M${f(Math.cos(th) * 13)} ${f(Math.sin(th) * 13)} L${f(Math.cos(th) * 22)} ${f(Math.sin(th) * 22)}" ${LINE} stroke-width="0.8"/>`;
  }).join('');
  return [
    // Each orbit tilted into the same ellipse; Earth's (the third) drawn solid.
    orbits
      .map((a, k) => `<ellipse cx="0" cy="0" rx="${a}" ry="${f(a * 0.42)}" ${LINE} stroke-width="${k === 2 ? 1 : 0.6}" ${k === 2 ? '' : 'stroke-dasharray="1 4"'} opacity="${k === 2 ? 1 : 0.7}"/>`)
      .join(''),
    circle(0, 0, 10, 'stroke-width="1.2"'),
    rays,
    planets,
    dots(field(rand, 110), 1.3, 0.6),
  ].join('');
}

function orionArm(): string {
  const rand = rng(41);
  // A band of stars running across the frame, the Sun ringed at the centre.
  const band: Array<[number, number]> = [];
  for (let k = 0; k < 520; k++) {
    const x = (rand() * 2 - 1) * 520;
    const y = x * -0.28 + (rand() + rand() + rand() - 1.5) * 120;
    band.push([x, y]);
  }
  return [
    dots(band, 1.5, 0.85),
    dots(field(rand, 80), 1.1, 0.5),
    circle(0, 0, 8, 'stroke-width="1"'),
    dots([[0, 0]], 3.4),
  ].join('');
}

/** Spiral galaxy dots, centred on (cx, cy), rotated by `rot`, `size` ≈ radius. */
function spiral(rand: () => number, cx: number, cy: number, size: number, n: number, rot = 0, tilt = 1): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    const arm = k % 2;
    const t = Math.pow(rand(), 0.7);
    const th = t * 3.4 * Math.PI + arm * Math.PI + rot + (rand() - 0.5) * 0.5;
    const r = size * (0.08 + t * 0.92) + (rand() - 0.5) * size * 0.08;
    const x = Math.cos(th) * r;
    const y = Math.sin(th) * r * tilt;
    pts.push([cx + x, cy + y]);
  }
  // The bulge.
  for (let k = 0; k < n / 6; k++) {
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 1.6) * size * 0.16;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * tilt]);
  }
  return pts;
}

function milkyWay(): string {
  const rand = rng(53);
  // The Sun sits two thirds out on a spiral arm, at the origin: the galaxy's
  // own centre is up and to the left of "us".
  const cx = -170;
  const cy = -80;
  return [
    dots(spiral(rand, cx, cy, 300, 1500, 0.4, 0.82), 1.4, 0.8),
    circle(0, 0, 10, 'stroke-width="1"'),
    `<path d="M14 14 L44 44 H96" ${LINE} stroke-width="0.7"/>`,
  ].join('');
}

function localGroup(): string {
  const rand = rng(67);
  return [
    dots(spiral(rand, 0, 0, 50, 420, 0.4, 0.82), 1.1, 0.8),
    dots(spiral(rand, 230, -120, 70, 520, 1.2, 0.38), 1.1, 0.8),
    dots(spiral(rand, 150, 110, 26, 160, 2.1, 0.7), 1, 0.7),
    dots(field(rand, 40, 300), 2, 0.6),
    circle(0, 0, 64, 'stroke-width="0.7" stroke-dasharray="2 4"'),
  ].join('');
}

function laniakea(): string {
  const rand = rng(79);
  // Streamlines of galaxies flowing toward the Great Attractor, (80, 30).
  const ax = 80;
  const ay = 30;
  const lines: string[] = [];
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < 44; k++) {
    let x = (rand() * 2 - 1) * 480;
    let y = (rand() * 2 - 1) * 300;
    let d = `M${f(x)} ${f(y)}`;
    for (let s = 0; s < 16; s++) {
      const dx = ax - x;
      const dy = ay - y;
      const len = Math.hypot(dx, dy) || 1;
      x += (dx / len) * 18 + (-dy / len) * 6;
      y += (dy / len) * 18 + (dx / len) * 6;
      d += ` L${f(x)} ${f(y)}`;
      if (rand() < 0.5) pts.push([x + (rand() - 0.5) * 8, y + (rand() - 0.5) * 8]);
      if (len < 24) break;
    }
    lines.push(`<path d="${d}" ${LINE} stroke-width="0.5" opacity="0.55"/>`);
  }
  return [lines.join(''), dots(pts, 1.6, 0.85), circle(0, 0, 9, 'stroke-width="1"')].join('');
}

function observable(): string {
  const rand = rng(97);
  // The cosmic web: nodes joined to their nearest neighbours, inside the
  // particle horizon. "Here" is the centre — every observer's is.
  const nodes: Array<[number, number]> = [];
  while (nodes.length < 160) {
    const x = (rand() * 2 - 1) * 290;
    const y = (rand() * 2 - 1) * 290;
    if (x * x + y * y < 285 * 285) nodes.push([x, y]);
  }
  const edges: string[] = [];
  nodes.forEach(([x, y], k) => {
    const near = nodes
      .map(([u, v], j) => [Math.hypot(u - x, v - y), j] as [number, number])
      .filter(([, j]) => j !== k)
      .sort((a, b) => a[0] - b[0])
      .slice(0, 2);
    for (const [, j] of near) if (j > k) edges.push(`M${f(x)} ${f(y)} L${f(nodes[j][0])} ${f(nodes[j][1])}`);
  });
  return [
    `<path d="${edges.join('')}" ${LINE} stroke-width="0.5" opacity="0.6"/>`,
    dots(nodes, 2, 0.9),
    circle(0, 0, 300, 'stroke-width="1.1"'),
    circle(0, 0, 306, 'stroke-width="0.5" stroke-dasharray="1 3"'),
    dots([[0, 0]], 3.4),
  ].join('');
}

/** SVG markup of each scene, index 0…7, in pull-back order. */
export function scenes(): string[] {
  return [observer(), earth(), solarSystem(), orionArm(), milkyWay(), localGroup(), laniakea(), observable()];
}

/* ── Deep time ───────────────────────────────────────────────────────────── */

/** Billions of years before now, for the five marks the rule carries. */
export const TIME_MARKS_GYR = [4.6, 4.5, 3.8, 0.0003, 0.00000008];
export const UNIVERSE_GYR = 13.8;

/** x position (−450…450) of an event `ago` Gyr before now on the full rule. */
export function timeX(agoGyr: number, spanGyr = UNIVERSE_GYR): number {
  return 450 - (agoGyr / spanGyr) * 900;
}

/** The time rule: 13.8 Gyr across, one tick per Gyr, the marks drawn as
 *  ticks the script reveals in turn; and below it the magnifier, the last
 *  300 000 years spread across the same width, where a human life (80 years)
 *  is 0.24 units: a hairline. */
export function timeRule(): string {
  const ticks = Array.from({ length: 14 }, (_, k) => {
    const x = timeX(13 - k + 0.8);
    return `<path d="M${f(x)} -60 v${k % 5 === 0 ? -10 : -5}" ${LINE} stroke-width="0.7"/>`;
  }).join('');
  const marks = TIME_MARKS_GYR.slice(0, 3)
    .map((g, k) => `<path class="tm tm-${k}" d="M${f(timeX(g))} -60 v-34" ${LINE} stroke-width="1"/>`)
    .join('');
  const lifeW = (80 / 300000) * 900;
  return [
    `<path d="M-450 -60 H450" ${LINE} stroke-width="1.2"/>`,
    ticks,
    marks,
    // The magnifier: the last sliver of the rule, opened out below.
    `<g class="tm-lens">`,
    `<path d="M449 -56 L-450 40 M450 -56 L450 40" ${LINE} stroke-width="0.5" stroke-dasharray="2 4" opacity="0.7"/>`,
    `<path d="M-450 60 H450" ${LINE} stroke-width="1.2"/>`,
    `<path d="M-450 60 v-8 M450 60 v-8" ${LINE} stroke-width="0.8"/>`,
    `<path class="tm tm-3" d="M-450 60 v-30" ${LINE} stroke-width="1"/>`,
    `<path class="tm tm-4" d="M${f(450 - lifeW)} 60 v-44 M450 60 v-44" ${LINE} stroke-width="0.8"/>`,
    `</g>`,
  ].join('');
}
