// Open Graph images for UniverLab (1200×630 each).
//
// Generates:
//   • public/og.png          — site-wide default (home, docs, experiments without a card)
//   • public/og/<id>.png     — one per experiment, using its accent colour and tagline
//
// Per-experiment SVGs are intermediate files written to scripts/og/og-<id>.svg;
// they are not committed (see scripts/og/.gitignore).  The final rasterised PNGs
// live in public/og/.
//
// Usage (requires Node ≥ 24):
//   cd scripts/og && npm install && node --experimental-strip-types build-og.mjs
//   google-chrome --headless=new --hide-scrollbars --window-size=1200,630 \
//     --screenshot=../../public/og.png "file://$PWD/render.html"
//
// For per-experiment cards the script writes one render-<id>.html per banner and
// screenshots each in turn.  The full loop is:
//
//   cd scripts/og && npm install && node --experimental-strip-types build-og.mjs
//   for f in render-*.html; do
//     id="${f#render-}"; id="${id%.html}"
//     google-chrome --headless=new --hide-scrollbars --window-size=1200,630 \
//       --screenshot=../../public/og/${id}.png "file://$PWD/${f}"
//   done
//   # site-wide default (home / docs / fallback)
//   google-chrome --headless=new --hide-scrollbars --window-size=1200,630 \
//     --screenshot=../../public/og.png "file://$PWD/render.html"

import opentype from 'opentype.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BANNERS } from './banners.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const BG = '#0a0b0e';
const INK = '#e8e6e1';
const ACCENT = '#e6c84a';

const W = 1200;
const H = 630;
const MARGIN = 100;
const TEXT_W = W - MARGIN * 2;

// IBM Plex Mono — the UniverLab signature font.
const ibmMed = opentype.loadSync(join(HERE, 'fonts', 'IBMPlexMono-500.ttf'));

// The frozen mark — three splayed cube faces, viewBox 0 0 500 500 (Mark.astro).
const MARK_FACES = [
  'M 251.99455,1.0024578 C 233.6105,1.0205149 215.23298,4.77841 201.15461,12.27261 L 62.446773,86.109209 C 34.29001,101.0976 34.314707,125.18721 62.505125,140.12071 l 138.631495,73.43557 c 9.29363,4.92317 20.4529,8.21882 32.24743,9.88749 -0.0475,-0.50849 -0.0716,-1.02097 -0.072,-1.5414 l 4e-5,-100.44132 c 0,-9.63459 8.33359,-17.38979 18.68679,-17.38978 10.35319,0 18.6868,7.75518 18.6868,17.38978 v 100.44133 c 1e-5,0.50806 -0.0232,1.00708 -0.0675,1.50379 11.79086,-1.69165 22.94235,-5.00882 32.22497,-9.95013 l 138.71228,-73.83661 c 28.1568,-14.9884 28.12759,-39.078 -0.0627,-54.011492 L 302.86591,12.172357 C 288.77066,4.7056021 270.37854,0.98455048 251.99455,1.0024578 Z',
  'm 486.78573,382.52546 c 9.07431,-14.87871 14.65054,-31.60228 14.61208,-46.69548 L 501.0191,187.12405 c -0.0769,-30.18638 -22.58948,-42.07793 -50.47699,-26.65974 l -137.13946,75.82292 c -9.19371,5.08296 -17.78983,12.47976 -25.18046,21.19488 0.4985,0.21302 0.98911,0.44681 1.47531,0.70396 l 93.81469,49.66496 c 8.999,4.76402 12.12181,15.33945 7.00249,23.71378 -5.11933,8.37436 -16.48356,11.28048 -25.48246,6.51648 l -93.81476,-49.66496 c -0.47454,-0.25121 -0.92927,-0.51657 -1.37129,-0.79807 -4.25016,10.37372 -6.66586,21.03404 -6.64053,30.98573 l 0.37656,148.70958 c 0.077,30.18636 22.59161,42.07428 50.47907,26.65617 l 137.13722,-75.81929 c 13.94376,-7.7091 26.51366,-20.74594 35.58724,-35.62499 z',
  'M 15.46545,382.52546 C 6.3911449,367.64675 0.81490318,350.92318 0.85336934,335.82998 L 1.2320814,187.12405 C 1.309014,156.93767 23.82154,145.04612 51.70906,160.46431 l 137.13943,75.82292 c 9.19373,5.08296 17.78984,12.47976 25.18046,21.19488 -0.49849,0.21302 -0.98908,0.44681 -1.47528,0.70396 l -93.81469,49.66496 c -8.99901,4.76402 -12.12182,15.33945 -7.0025,23.71378 5.11933,8.37436 16.48354,11.28048 25.48248,6.51648 l 93.81471,-49.66496 c 0.47454,-0.25121 0.9293,-0.51657 1.37133,-0.79807 4.25014,10.37372 6.66582,21.03404 6.64051,30.98573 l -0.37656,148.70958 c -0.077,30.18636 -22.59161,42.07428 -50.47907,26.65617 L 51.05267,418.15045 C 37.10892,410.44135 24.539015,397.40451 15.46545,382.52546 Z',
];

/** Outline text with letter-spacing (em), returning the path and its width. */
function spacedPath(font, text, x, baselineY, size, trackEm) {
  const track = size * trackEm;
  let cursor = x;
  const parts = [];
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    parts.push(g.getPath(cursor, baselineY, size).toPathData(2));
    cursor += (g.advanceWidth / font.unitsPerEm) * size + track;
  }
  return { d: parts.join(' '), width: cursor - x - track };
}

/** Wrap text to fit within maxWidth, returning an array of lines. */
function wrapText(font, text, size, maxWidth, trackEm) {
  const track = size * trackEm;
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const testWidth = measureText(font, testLine, size, track);
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/** Measure the width of a text string. */
function measureText(font, text, size, track) {
  let width = 0;
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    width += (g.advanceWidth / font.unitsPerEm) * size + track;
  }
  return width - track; // remove trailing track
}

function wavePath(yMid, amp, wl, xEnd) {
  const step = wl / 24;
  let d = `M 0 ${yMid.toFixed(1)}`;
  for (let x = step; x <= xEnd; x += step) {
    d += ` L ${x.toFixed(1)} ${(yMid + amp * Math.sin((x / wl) * Math.PI * 2)).toFixed(2)}`;
  }
  return d;
}

/**
 * Generate an SVG for a single banner (or the default home card when banner is
 * null).
 *
 * @param {{ name?: string, number?: string, tagline?: string, accent?: string } | null} banner
 * @returns {string} SVG markup
 */
function generateSvg(banner) {
  const accent = banner?.accent ?? ACCENT;
  const name = banner?.name ?? 'UNIVERLAB';
  const number = banner?.number;
  const tagline = banner?.tagline;

  // --- Waves ---------------------------------------------------------------
  const waves = [
    { amp: 20, wl: 360, sw: 2.6, op: 0.5 },
    { amp: 31, wl: 540, sw: 1.6, op: 0.24 },
  ]
    .map(({ amp, wl, sw, op }) =>
      `<path d="${wavePath(H - 96, amp, wl, W)}" fill="none" stroke="${accent}" stroke-width="${sw}" stroke-opacity="${op}" stroke-linecap="round"/>`)
    .join('\n    ');

  // --- Wordmark (top-left, small) -----------------------------------------
  const WM_SIZE = 22;
  const WM_TRACK = 0.28;
  const wmY = 56;
  const wmPath = spacedPath(ibmMed, 'UNIVERLAB', MARGIN, wmY, WM_SIZE, WM_TRACK).d;

  // --- Accent bar under wordmark -------------------------------------------
  const barY = wmY + 20;
  const barW = 44;

  // --- Experiment number (kicker, below wordmark) --------------------------
  let numberPath = '';
  let numberY = 0;
  if (number) {
    const NUM_SIZE = 16;
    const NUM_TRACK = 0.18;
    numberY = barY + 34;
    numberPath = `<path d="${spacedPath(ibmMed, number, MARGIN, numberY, NUM_SIZE, NUM_TRACK).d}" fill="${accent}" opacity="0.6"/>`;
  }

  // --- Experiment name (large, centred) ------------------------------------
  const NAME_SIZE = 56;
  const NAME_TRACK = 0.08;
  const nameWidth = measureText(ibmMed, name, NAME_SIZE, NAME_SIZE * NAME_TRACK);
  const nameX = (W - nameWidth) / 2;
  const nameY = H / 2 - 20;
  const namePath = spacedPath(ibmMed, name, nameX, nameY, NAME_SIZE, NAME_TRACK).d;

  // --- Tagline (word-wrapped, centred) -------------------------------------
  let taglinePaths = '';
  if (tagline) {
    const TAG_SIZE = 24;
    const TAG_TRACK = 0.06;
    const lines = wrapText(ibmMed, tagline, TAG_SIZE, TEXT_W, TAG_TRACK);
    const lineH = TAG_SIZE * 1.55;
    const tagStartY = nameY + NAME_SIZE * 0.6 + 48;
    const tagLines = lines.length;
    const tagTotalH = tagLines * lineH;
    const tagCenterY = tagStartY + tagTotalH / 2;
    // Shift up a bit so the name+tagline block is visually centred
    const offsetY = -20;

    taglinePaths = lines.map((line, i) => {
      const lw = measureText(ibmMed, line, TAG_SIZE, TAG_SIZE * TAG_TRACK);
      const lx = (W - lw) / 2;
      const ly = tagCenterY + (i - (tagLines - 1) / 2) * lineH + offsetY;
      return `<path d="${spacedPath(ibmMed, line, lx, ly, TAG_SIZE, TAG_TRACK).d}" fill="${INK}" opacity="0.7"/>`;
    }).join('\n    ');
  }

  // --- Glow ----------------------------------------------------------------
  const glowColor = accent;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="34%" r="70%">
      <stop offset="0%" stop-color="${glowColor}" stop-opacity="0.12"/>
      <stop offset="60%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="waveFadeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000"/>
      <stop offset="0.16" stop-color="#fff"/>
      <stop offset="0.84" stop-color="#fff"/>
      <stop offset="1" stop-color="#000"/>
    </linearGradient>
    <mask id="waveFade"><rect width="${W}" height="${H}" fill="url(#waveFadeGrad)"/></mask>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g mask="url(#waveFade)">
    ${waves}
  </g>

  <path d="${wmPath}" fill="${INK}"/>
  <rect x="${MARGIN}" y="${barY}" width="${barW}" height="3" rx="1.5" fill="${accent}"/>
  ${numberPath}
  <path d="${namePath}" fill="${INK}"/>
  ${taglinePaths}
</svg>
`;
}

// ── Default home card (same as before) ──────────────────────────────────────
const defaultSvg = generateSvg(null);
writeFileSync(join(HERE, 'og.svg'), defaultSvg);
writeFileSync(
  join(HERE, 'render.html'),
  `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${W}px;height:${H}px}</style></head><body>${defaultSvg}</body></html>\n`,
);
console.log(`✓ og.svg + render.html  (home card)`);

// ── Per-experiment cards ────────────────────────────────────────────────────
mkdirSync(join(HERE, '..', '..', 'public', 'og'), { recursive: true });

for (const banner of BANNERS) {
  const svg = generateSvg(banner);
  const svgFile = `og-${banner.id}.svg`;
  const renderFile = `render-${banner.id}.html`;

  writeFileSync(join(HERE, svgFile), svg);
  writeFileSync(
    join(HERE, renderFile),
    `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${W}px;height:${H}px}</style></head><body>${svg}</body></html>\n`,
  );
  console.log(`✓ ${svgFile} + ${renderFile}  (${banner.name})`);
}
