// Open Graph images for UniverLab (1200×630 each).
//
// Generates:
//   • public/og.png          — site-wide default (home, docs, experiments without a card)
//   • public/og/<id>.png     — one per experiment: number, status, name, tagline,
//                              motif line, in the palette of the experiment's own
//                              page (its surface group in src/styles/global.css)
//
// Every glyph is outlined to an SVG path (fonts in ./fonts, see FONTS.md), so
// headless Chrome rasterises the cards without any installed font. The SVGs and
// HTML wrappers are intermediate files (see .gitignore); the PNGs are committed.
//
// Usage (Node ≥ 24):
//   cd scripts/og && npm install && node --experimental-strip-types build-og.mjs
//   google-chrome --headless=new --hide-scrollbars --window-size=1200,630 \
//     --screenshot=../../public/og.png "file://$PWD/render.html"
//   for f in render-*.html; do
//     id="${f#render-}"; id="${id%.html}"
//     google-chrome --headless=new --hide-scrollbars --window-size=1200,630 \
//       --screenshot=../../public/og/${id}.png "file://$PWD/${f}"
//   done

import opentype from 'opentype.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BANNERS } from './banners.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// The lab's own palette: the home card. Experiment cards bring their surface's.
const LAB = { bg: '#0a0b0e', ink: '#e8e6e1', inkDim: '#8b8a86', inkFaint: '#55544f', accent: '#e6c84a' };

const W = 1200;
const H = 630;
const MARGIN = 88;

// IBM Plex Mono is the UniverLab signature (wordmark, kickers, motif); Space
// Grotesk carries names and prose. The DejaVu faces only fill glyphs Plex lacks
// in a motif line (box drawing, braille).
const plex = opentype.loadSync(join(HERE, 'fonts', 'IBMPlexMono-500.ttf'));
const grotesk = opentype.loadSync(join(HERE, 'fonts', 'SpaceGrotesk-500.ttf'));
const dejaMono = opentype.loadSync(join(HERE, '..', '..', 'public', 'fonts', 'DejaVuSansMono.ttf'));
const dejaSans = opentype.loadSync(join(HERE, 'fonts', 'DejaVuSans.ttf'));

// The frozen mark — three splayed cube faces, viewBox 0 0 500 500 (Mark.astro).
const MARK_FACES = [
  'M 251.99455,1.0024578 C 233.6105,1.0205149 215.23298,4.77841 201.15461,12.27261 L 62.446773,86.109209 C 34.29001,101.0976 34.314707,125.18721 62.505125,140.12071 l 138.631495,73.43557 c 9.29363,4.92317 20.4529,8.21882 32.24743,9.88749 -0.0475,-0.50849 -0.0716,-1.02097 -0.072,-1.5414 l 4e-5,-100.44132 c 0,-9.63459 8.33359,-17.38979 18.68679,-17.38978 10.35319,0 18.6868,7.75518 18.6868,17.38978 v 100.44133 c 1e-5,0.50806 -0.0232,1.00708 -0.0675,1.50379 11.79086,-1.69165 22.94235,-5.00882 32.22497,-9.95013 l 138.71228,-73.83661 c 28.1568,-14.9884 28.12759,-39.078 -0.0627,-54.011492 L 302.86591,12.172357 C 288.77066,4.7056021 270.37854,0.98455048 251.99455,1.0024578 Z',
  'm 486.78573,382.52546 c 9.07431,-14.87871 14.65054,-31.60228 14.61208,-46.69548 L 501.0191,187.12405 c -0.0769,-30.18638 -22.58948,-42.07793 -50.47699,-26.65974 l -137.13946,75.82292 c -9.19371,5.08296 -17.78983,12.47976 -25.18046,21.19488 0.4985,0.21302 0.98911,0.44681 1.47531,0.70396 l 93.81469,49.66496 c 8.999,4.76402 12.12181,15.33945 7.00249,23.71378 -5.11933,8.37436 -16.48356,11.28048 -25.48246,6.51648 l -93.81476,-49.66496 c -0.47454,-0.25121 -0.92927,-0.51657 -1.37129,-0.79807 -4.25016,10.37372 -6.66586,21.03404 -6.64053,30.98573 l 0.37656,148.70958 c 0.077,30.18636 22.59161,42.07428 50.47907,26.65617 l 137.13722,-75.81929 c 13.94376,-7.7091 26.51366,-20.74594 35.58724,-35.62499 z',
  'M 15.46545,382.52546 C 6.3911449,367.64675 0.81490318,350.92318 0.85336934,335.82998 L 1.2320814,187.12405 C 1.309014,156.93767 23.82154,145.04612 51.70906,160.46431 l 137.13943,75.82292 c 9.19373,5.08296 17.78984,12.47976 25.18046,21.19488 -0.49849,0.21302 -0.98908,0.44681 -1.47528,0.70396 l -93.81469,49.66496 c -8.99901,4.76402 -12.12182,15.33945 -7.0025,23.71378 5.11933,8.37436 16.48354,11.28048 25.48248,6.51648 l 93.81471,-49.66496 c 0.47454,-0.25121 0.9293,-0.51657 1.37133,-0.79807 4.25014,10.37372 6.66582,21.03404 6.64051,30.98573 l -0.37656,148.70958 c -0.077,30.18636 -22.59161,42.07428 -50.47907,26.65617 L 51.05267,418.15045 C 37.10892,410.44135 24.539015,397.40451 15.46545,382.52546 Z',
];

/** The glyph for `ch` in `font`, or in the first fallback face that has it. */
function glyphFor(font, ch, fallback) {
  const g = font.charToGlyph(ch);
  if (g.index !== 0 || !fallback) return [font, g];
  for (const f of [dejaMono, dejaSans]) {
    const fg = f.charToGlyph(ch);
    if (fg.index !== 0) return [f, fg];
  }
  return [font, g];
}

/** Outline `text` with letter-spacing (em); returns the path and its width. */
function spacedPath(font, text, x, baselineY, size, trackEm = 0, fallback = false) {
  const track = size * trackEm;
  let cursor = x;
  const parts = [];
  for (const ch of text) {
    const [f, g] = glyphFor(font, ch, fallback);
    parts.push(g.getPath(cursor, baselineY, size).toPathData(2));
    cursor += (g.advanceWidth / f.unitsPerEm) * size + track;
  }
  return { d: parts.join(' '), width: cursor - x - (text.length ? track : 0) };
}

const measure = (font, text, size, trackEm = 0, fallback = false) =>
  spacedPath(font, text, 0, 0, size, trackEm, fallback).width;

/** One outlined text run; `anchor` is start | middle | end. */
function text(font, str, x, y, size, fill, { track = 0, anchor = 'start', opacity = 1, fallback = false } = {}) {
  const w = measure(font, str, size, track, fallback);
  const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  const op = opacity < 1 ? ` fill-opacity="${opacity}"` : '';
  return `<path d="${spacedPath(font, str, x0, y, size, track, fallback).d}" fill="${fill}"${op}/>`;
}

/** Greedy word wrap to `maxWidth`. */
function greedyWrap(font, str, size, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of str.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (measure(font, next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Balanced wrap: as many lines as the greedy wrap needs, but at the narrowest
 * width that still fits in that many, so the last line is never an orphan.
 */
function wrapText(font, str, size, maxWidth) {
  // A dash belongs to the clause it closes: never let it open a line.
  str = str.replace(/ (—|–) /g, '\u00a0$1 ');
  const target = greedyWrap(font, str, size, maxWidth).length;
  let lo = 0;
  let hi = maxWidth;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (greedyWrap(font, str, size, mid).length <= target) hi = mid;
    else lo = mid;
  }
  return greedyWrap(font, str, size, hi).map((l) => l.replace(/\u00a0/g, ' '));
}

/** Relative luminance of a #rrggbb colour (WCAG). */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function wavePath(yMid, amp, wl, xEnd) {
  const step = wl / 24;
  let d = `M 0 ${yMid.toFixed(1)}`;
  for (let x = step; x <= xEnd; x += step) {
    d += ` L ${x.toFixed(1)} ${(yMid + amp * Math.sin((x / wl) * Math.PI * 2)).toFixed(2)}`;
  }
  return d;
}

const mark = (x, y, size, fill) =>
  `<g transform="translate(${x} ${y}) scale(${size / 500})" fill="${fill}">${MARK_FACES.map((d) => `<path d="${d}"/>`).join('')}</g>`;

/** Background, accent glow and the wave band shared by every card. */
function frame({ bg, accent }, body, glow) {
  // On a light sheet the accent glow reads as a smudge; keep it a whisper there.
  const glowOpacity = luminance(bg) > 0.5 ? 0.06 : 0.13;
  const waves = [
    { amp: 18, wl: 380, sw: 2.4, op: 0.55 },
    { amp: 28, wl: 560, sw: 1.4, op: 0.22 },
  ]
    .map(({ amp, wl, sw, op }) =>
      `<path d="${wavePath(H - 78, amp, wl, W + wl)}" fill="none" stroke="${accent}" stroke-width="${sw}" stroke-opacity="${op}" stroke-linecap="round"/>`)
    .join('\n    ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="${glow.cx}" cy="${glow.cy}" r="75%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="${glowOpacity}"/>
      <stop offset="60%" stop-color="${bg}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="waveFadeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000"/>
      <stop offset="0.12" stop-color="#fff"/>
      <stop offset="0.88" stop-color="#fff"/>
      <stop offset="1" stop-color="#000"/>
    </linearGradient>
    <mask id="waveFade"><rect width="${W}" height="${H}" fill="url(#waveFadeGrad)"/></mask>
  </defs>
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g mask="url(#waveFade)">
    ${waves}
  </g>
  ${body}
</svg>
`;
}

/** Site-wide card: the mark and the full wordmark lockup. */
function homeSvg() {
  const markSize = 176;
  const textX = MARGIN + markSize + 52;
  const { ink, inkDim, inkFaint, accent } = LAB;
  const body = `${mark(MARGIN, 150, markSize, ink)}
  ${text(plex, 'UNIVERLAB', textX, 232, 76, ink, { track: 0.2 })}
  <rect x="${textX}" y="254" width="64" height="4" rx="2" fill="${accent}"/>
  ${text(plex, 'SCI · CLI · BIO', textX, 300, 24, accent, { track: 0.2 })}
  ${text(grotesk, 'An independent computational laboratory', textX, 350, 30, inkDim)}
  ${text(grotesk, 'of open experiments.', textX, 390, 30, inkDim)}
  ${text(plex, 'univerlab.org', W - MARGIN, 56, 18, inkFaint, { track: 0.08, anchor: 'end' })}`;
  return frame(LAB, body, { cx: '22%', cy: '30%' });
}

/** Per-experiment card: lab header, name, tagline, motif, canonical URL. */
function experimentSvg({ id, name, number, palette, tagline, status, motif }) {
  const { ink, inkFaint, accent } = palette;
  const statusLabel = status.toUpperCase();
  const pillW = measure(plex, statusLabel, 14, 0.18) + 28;
  const pillX = W - MARGIN - pillW;
  const nameSize = name.length > 11 ? 84 : 96;
  const lines = wrapText(grotesk, tagline ?? '', 32, W - 2 * MARGIN).slice(0, 3);
  const motifY = 336 + lines.length * 44 + 26;
  const body = `${mark(MARGIN, 38, 34, ink)}
  ${text(plex, 'UNIVERLAB', MARGIN + 48, 63, 19, ink, { track: 0.26 })}
  ${text(plex, number, pillX - 18, 63, 17, accent, { track: 0.16, anchor: 'end' })}
  <rect x="${pillX}" y="43" width="${pillW}" height="28" rx="14" fill="none" stroke="${accent}" stroke-opacity="0.55"/>
  ${text(plex, statusLabel, pillX + pillW / 2, 62, 14, accent, { track: 0.18, anchor: 'middle' })}
  ${text(grotesk, name, MARGIN, 250, nameSize, ink)}
  <rect x="${MARGIN + 2}" y="276" width="64" height="4" rx="2" fill="${accent}"/>
  ${lines.map((l, i) => text(grotesk, l, MARGIN, 336 + i * 44, 32, ink, { opacity: 0.72 })).join('\n  ')}
  ${motif ? text(plex, motif, MARGIN, motifY, 20, accent, { track: 0.04, opacity: 0.75, fallback: true }) : ''}
  ${text(plex, `univerlab.org/${id}`, W - MARGIN, H - 26, 16, inkFaint, { track: 0.08, anchor: 'end' })}`;
  return frame(palette, body, { cx: '78%', cy: '22%' });
}

const page = (svg, bg) =>
  `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${W}px;height:${H}px;background:${bg}}</style></head><body>${svg}</body></html>\n`;

// ── Default home card ───────────────────────────────────────────────────────
const defaultSvg = homeSvg();
writeFileSync(join(HERE, 'og.svg'), defaultSvg);
writeFileSync(join(HERE, 'render.html'), page(defaultSvg, LAB.bg));
console.log('✓ og.svg + render.html  (home card)');

// ── Per-experiment cards ────────────────────────────────────────────────────
mkdirSync(join(HERE, '..', '..', 'public', 'og'), { recursive: true });

for (const banner of BANNERS) {
  const svg = experimentSvg(banner);
  writeFileSync(join(HERE, `og-${banner.id}.svg`), svg);
  writeFileSync(join(HERE, `render-${banner.id}.html`), page(svg, banner.palette.bg));
  console.log(`✓ og-${banner.id}.svg + render-${banner.id}.html  (${banner.name})`);
}
