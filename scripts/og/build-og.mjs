// Open Graph images for UniverLab (1200×630 each), vintage laboratory style.
//
// Generates:
//   • public/og.png               — site-wide default (home, docs, experiments
//                                  without a card): the UniverLab mark, the home
//                                  line, and the workbench machine plate.
//   • public/og/<id>.png         — one per experiment: number, name, status,
//                                  tagline, the day plate of its engraved
//                                  machine, and its canonical URL.
//   • public/og/workbench[.es].png, public/og/newspaper[.es].png — the pages
//                                  people share most, in each locale.
//
// Every card is drawn on the site's paper ground (paper #f4f0ea with the
// pergamino texture), ink #1d1510 type, sepia #6b5a43 secondary type, graphite
// #5d5852 cartouches, and the garnet #87222c accent. Display type is Old
// Standard TT Bold, body type EB Garamond, kickers and URLs IBM Plex Mono.
//
// Every glyph is outlined to an SVG path (fonts in ./fonts, see FONTS.md), so
// headless Chrome rasterises the cards without any installed font. Plates and
// texture are embedded as base64 data URIs, so the generator stays fully
// offline and reproducible. The SVGs and HTML wrappers are intermediate files
// (see .gitignore); the PNGs are committed.
//
// Usage (Node ≥ 24):
//   cd scripts/og && npm install && node --experimental-strip-types build-og.mjs
//   google-chrome --headless=new --hide-scrollbars --window-size=1200,630 \
//     --screenshot=../../public/og.png "file://$PWD/render.html"
//   for f in render-*.html; do
//     case "$f" in render.html) continue;; esac
//     id="${f#render-}"; id="${id%.html}"
//     google-chrome --headless=new --hide-scrollbars --window-size=1200,630 \
//       --screenshot=../../public/og/${id}.png "file://$PWD/${f}"
//   done

import opentype from 'opentype.js';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BANNERS } from './banners.mjs';
import { en } from '../../src/i18n/en.ts';
import { es } from '../../src/i18n/es.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, '..', '..', 'public');

// The vintage laboratory sheet: paper ground, dark ink, engraved plates.
const V = {
  paper: '#f4f0ea',
  ink: '#1d1510',
  sepia: '#6b5a43',
  graphite: '#5d5852',
  garnet: '#87222c',
};

const W = 1200;
const H = 630;
const MARGIN = 88;
const RIGHT = 1112;
const FOOTER = 568;

// sB is Old Standard TT Bold (display), G is EB Garamond (body),
// P is IBM Plex Mono (kickers, pills, URLs).
const sB = opentype.loadSync(join(HERE, 'fonts', 'OldStandardTT-Bold.ttf'));
const G = opentype.loadSync(join(HERE, 'fonts', 'EBGaramond-Regular.ttf'));
const P = opentype.loadSync(join(HERE, 'fonts', 'IBMPlexMono-500.ttf'));

// The frozen mark — three splayed cube faces, viewBox 0 0 500 500 (Mark.astro).
const MARK_FACES = [
  'M 251.99455,1.0024578 C 233.6105,1.0205149 215.23298,4.77841 201.15461,12.27261 L 62.446773,86.109209 C 34.29001,101.0976 34.314707,125.18721 62.505125,140.12071 l 138.631495,73.43557 c 9.29363,4.92317 20.4529,8.21882 32.24743,9.88749 -0.0475,-0.50849 -0.0716,-1.02097 -0.072,-1.5414 l 4e-5,-100.44132 c 0,-9.63459 8.33359,-17.38979 18.68679,-17.38978 10.35319,0 18.6868,7.75518 18.6868,17.38978 v 100.44133 c 1e-5,0.50806 -0.0232,1.00708 -0.0675,1.50379 11.79086,-1.69165 22.94235,-5.00882 32.22497,-9.95013 l 138.71228,-73.83661 c 28.1568,-14.9884 28.12759,-39.078 -0.0627,-54.011492 L 302.86591,12.172357 C 288.77066,4.7056021 270.37854,0.98455048 251.99455,1.0024578 Z',
  'm 486.78573,382.52546 c 9.07431,-14.87871 14.65054,-31.60228 14.61208,-46.69548 L 501.0191,187.12405 c -0.0769,-30.18638 -22.58948,-42.07793 -50.47699,-26.65974 l -137.13946,75.82292 c -9.19371,5.08296 -17.78983,12.47976 -25.18046,21.19488 0.4985,0.21302 0.98911,0.44681 1.47531,0.70396 l 93.81469,49.66496 c 8.999,4.76402 12.12181,15.33945 7.00249,23.71378 -5.11933,8.37436 -16.48356,11.28048 -25.48246,6.51648 l -93.81476,-49.66496 c -0.47454,-0.25121 -0.92927,-0.51657 -1.37129,-0.79807 -4.25016,10.37372 -6.66586,21.03404 -6.64053,30.98573 l 0.37656,148.70958 c 0.077,30.18636 22.59161,42.07428 50.47907,26.65617 l 137.13722,-75.81929 c 13.94376,-7.7091 26.51366,-20.74594 35.58724,-35.62499 z',
  'M 15.46545,382.52546 C 6.3911449,367.64675 0.81490318,350.92318 0.85336934,335.82998 L 1.2320814,187.12405 C 1.309014,156.93767 23.82154,145.04612 51.70906,160.46431 l 137.13943,75.82292 c 9.19373,5.08296 17.78984,12.47976 25.18046,21.19488 -0.49849,0.21302 -0.98908,0.44681 -1.47528,0.70396 l -93.81469,49.66496 c -8.99901,4.76402 -12.12182,15.33945 -7.0025,23.71378 5.11933,8.37436 16.48354,11.28048 25.48248,6.51648 l 93.81471,-49.66496 c 0.47454,-0.25121 0.9293,-0.51657 1.37133,-0.79807 4.25014,10.37372 6.66582,21.03404 6.64051,30.98573 l -0.37656,148.70958 c -0.077,30.18636 -22.59161,42.07428 -50.47907,26.65617 L 51.05267,418.15045 C 37.10892,410.44135 24.539015,397.40451 15.46545,382.52546 Z',
];

/** Outline `text` with letter-spacing (em); returns the path and its width. */
function spacedPath(font, text, x, baselineY, size, trackEm = 0) {
  const track = size * trackEm;
  let cursor = x;
  const parts = [];
  for (const ch of text) {
    const g = font.charToGlyph(ch);
    parts.push(g.getPath(cursor, baselineY, size).toPathData(2));
    cursor += (g.advanceWidth / font.unitsPerEm) * size + track;
  }
  return { d: parts.join(' '), width: cursor - x - (text.length ? track : 0) };
}

const measure = (font, text, size, trackEm = 0) =>
  spacedPath(font, text, 0, 0, size, trackEm).width;

/** One outlined text run; `anchor` is start | middle | end. */
function text(font, str, x, y, size, fill, { track = 0, anchor = 'start', opacity = 1 } = {}) {
  const w = measure(font, str, size, track);
  const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  const op = opacity < 1 ? ` fill-opacity="${opacity}"` : '';
  return `<path d="${spacedPath(font, str, x0, y, size, track).d}" fill="${fill}"${op}/>`;
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
  str = str.replace(/ (—|–) /g, ' $1 ');
  const target = greedyWrap(font, str, size, maxWidth).length;
  let lo = 0;
  let hi = maxWidth;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (greedyWrap(font, str, size, mid).length <= target) hi = mid;
    else lo = mid;
  }
  return greedyWrap(font, str, size, hi).map((l) => l.replace(/ /g, ' '));
}

const mark = (x, y, size, fill) =>
  `<g transform="translate(${x} ${y}) scale(${size / 500})" fill="${fill}">${MARK_FACES.map((d) => `<path d="${d}"/>`).join('')}</g>`;

// ── Vintage paper ground ────────────────────────────────────────────────────
// The pergamino texture, embedded once as base64, tiles the sheet at 20% over
// the paper colour; a double graphite cartouche frames every card.
const TEXTURE_B64 = readFileSync(join(PUBLIC, 'bench', 'textures', 'pergamino.webp')).toString('base64');

function paper(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="grain" width="1024" height="1024" patternUnits="userSpaceOnUse">
      <image href="data:image/webp;base64,${TEXTURE_B64}" x="0" y="0" width="1024" height="1024"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${V.paper}"/>
  <rect width="${W}" height="${H}" fill="url(#grain)" opacity="0.2"/>
  ${body}
  <rect x="24.5" y="24.5" width="1151" height="581" fill="none" stroke="${V.graphite}" stroke-width="1.5" stroke-opacity="0.45"/>
  <rect x="31.5" y="31.5" width="1137" height="567" fill="none" stroke="${V.graphite}" stroke-width="1" stroke-opacity="0.3"/>
</svg>
`;
}

// ── Engraved machine plates ─────────────────────────────────────────────────
// The day plate of public/bench/machines, embedded as a base64 data URI at
// 280 px tall, right-aligned to x=1112, from y=175. Dimensions come from the
// manifest entry machines/<id>-day-450.webp.
const MANIFEST = JSON.parse(readFileSync(join(PUBLIC, 'bench', 'manifest.json'), 'utf8'));

function plate(id) {
  const file = `machines/${id}-day-450.webp`;
  const asset = MANIFEST.assets.find((a) => a.kind === 'machine' && a.file === file);
  if (!asset) throw new Error(`og: no manifest entry for ${file}`);
  const w = (280 * asset.width) / asset.height;
  const b64 = readFileSync(join(PUBLIC, 'bench', file)).toString('base64');
  return `<image x="${(RIGHT - w).toFixed(1)}" y="175" width="${w.toFixed(1)}" height="280" href="data:image/webp;base64,${b64}"/>`;
}

/** Per-experiment card: kicker, number, name, garnet rule, status, tagline, plate. */
function experimentSvg({ id, name, number, tagline, statusLabel }) {
  const nameSize = measure(sB, name, 88) > 640 ? 74 : 88;
  const lines = wrapText(G, tagline ?? '', 34, 640).slice(0, 3);
  const body = `${text(P, 'UNIVERLAB', MARGIN, 104, 17, V.ink, { track: 0.2 })}
  ${text(P, number, RIGHT, 104, 17, V.sepia, { track: 0.1, anchor: 'end' })}
  ${text(sB, name, MARGIN, 268, nameSize, V.ink)}
  <rect x="90" y="292" width="96" height="3" fill="${V.garnet}"/>
  ${text(P, statusLabel.toUpperCase(), 90, 338, 16, V.garnet, { track: 0.18 })}
  ${lines.map((l, i) => text(G, l, MARGIN, 394 + i * 46, 34, V.sepia)).join('\n  ')}
  ${plate(id)}
  ${text(P, `univerlab.org/${id}`, MARGIN, FOOTER, 15, V.graphite, { track: 0.08 })}`;
  return paper(body);
}

/** Site-wide card: the mark, the home line, and the workbench machine plate. */
function homeSvg() {
  const line = en.home.hero.subtitle.split('. ')[0] + '.';
  const lines = wrapText(sB, line, 68, 640).slice(0, 2);
  const body = `${mark(MARGIN, 148, 104, V.ink)}
  ${text(P, en.home.hero.tagline, MARGIN, 300, 17, V.garnet, { track: 0.2 })}
  ${lines.map((l, i) => text(sB, l, MARGIN, 400 + i * 72, 68, V.ink)).join('\n  ')}
  ${plate('workbench')}
  ${text(P, 'univerlab.org', MARGIN, FOOTER, 15, V.graphite, { track: 0.08 })}`;
  return paper(body);
}

/** Workbench and newspaper cards, in each locale. */
function pageSvg(lang, kind) {
  const t = lang === 'es' ? es : en;
  if (kind === 'workbench') {
    const ad = t.today.ads.workbench;
    const sub = wrapText(G, ad.lines[0], 34, 640).slice(0, 2);
    const url = lang === 'es' ? 'univerlab.org/es/workbench' : 'univerlab.org/workbench';
    const body = `${text(sB, ad.head, MARGIN, 268, 88, V.ink)}
  ${sub.map((l, i) => text(G, l, MARGIN, 394 + i * 46, 34, V.sepia)).join('\n  ')}
  ${text(P, ad.lines[1], MARGIN, 500, 16, V.graphite, { track: 0.08 })}
  ${plate('workbench')}
  ${text(P, url, MARGIN, FOOTER, 15, V.graphite, { track: 0.08 })}`;
    return paper(body);
  }
  const nameSize = measure(sB, t.today.name, 128) > 1000 ? 108 : 128;
  const motto = wrapText(G, t.today.motto, 30, 720).slice(0, 2);
  const url = lang === 'es' ? 'univerlab.org/es/newspaper' : 'univerlab.org/newspaper';
  const body = `${text(P, t.today.edition, RIGHT, 104, 17, V.sepia, { track: 0.1, anchor: 'end' })}
  <rect x="88" y="176" width="1024" height="2" fill="${V.ink}"/>
  <rect x="88" y="182" width="1024" height="1" fill="${V.ink}"/>
  ${text(sB, t.today.name, 600, 300, nameSize, V.ink, { anchor: 'middle' })}
  <rect x="88" y="330" width="1024" height="1" fill="${V.ink}"/>
  ${motto.map((l, i) => text(G, l, 600, 436 + i * 42, 30, V.sepia, { anchor: 'middle' })).join('\n  ')}
  ${text(P, url, 600, FOOTER, 15, V.graphite, { track: 0.08, anchor: 'middle' })}`;
  return paper(body);
}

const page = (svg) =>
  `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${W}px;height:${H}px;background:${V.paper}}</style></head><body>${svg}</body></html>\n`;

// ── Emit every card ─────────────────────────────────────────────────────────
// `name` is the PNG basename: og.svg/render.html feed public/og.png,
// og-<name>.svg/render-<name>.html feed public/og/<name>.png.
const CARDS = [
  { svg: homeSvg(), name: 'og' },
  ...BANNERS.map((b) => ({ svg: experimentSvg(b), name: `og-${b.id}` })),
  { svg: pageSvg('en', 'workbench'), name: 'og-workbench' },
  { svg: pageSvg('es', 'workbench'), name: 'og-workbench-es' },
  { svg: pageSvg('en', 'newspaper'), name: 'og-newspaper' },
  { svg: pageSvg('es', 'newspaper'), name: 'og-newspaper-es' },
];

mkdirSync(join(HERE, '..', '..', 'public', 'og'), { recursive: true });

for (const { svg, name } of CARDS) {
  const stem = name === 'og' ? 'og' : name;
  writeFileSync(join(HERE, `${stem}.svg`), svg);
  writeFileSync(join(HERE, name === 'og' ? 'render.html' : `render-${name.slice(3)}.html`), page(svg));
  console.log(`✓ ${stem}.svg + render wrapper`);
}
