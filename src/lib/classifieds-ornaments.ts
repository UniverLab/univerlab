// Engraved ornaments for the classifieds pages (paper pages 2 and 3).
// Only the files in public/bench/classifieds/ are used; when an ornament
// is missing for a case, the case simply goes without one.

/** One ornament: its file and its intrinsic size, for the img tag. */
interface Ornament {
  src: string;
  width: number;
  height: number;
}

/** Every engraved cut the section may set, by name. Sizes come from the
 *  bench manifest (kind "ornament" under classifieds/). */
export const ORNAMENTS: Record<string, Ornament> = {
  head: { src: '/bench/classifieds/head.webp', width: 1200, height: 451 },
  fleuron: { src: '/bench/classifieds/fleuron.webp', width: 480, height: 134 },
  ribbon: { src: '/bench/classifieds/ribbon.webp', width: 579, height: 141 },
  rule: { src: '/bench/classifieds/rule.webp', width: 683, height: 83 },
  manicule: { src: '/bench/classifieds/manicule.webp', width: 192, height: 113 },
  hand: { src: '/bench/classifieds/hand.webp', width: 339, height: 183 },
  launch: { src: '/bench/classifieds/launch.webp', width: 256, height: 396 },
  locomotive: { src: '/bench/classifieds/locomotive.webp', width: 346, height: 232 },
  update: { src: '/bench/classifieds/update.webp', width: 256, height: 236 },
  incident: { src: '/bench/classifieds/incident.webp', width: 256, height: 287 },
  lantern: { src: '/bench/classifieds/lantern.webp', width: 219, height: 269 },
  note: { src: '/bench/classifieds/note.webp', width: 256, height: 209 },
  envelope: { src: '/bench/classifieds/envelope.webp', width: 318, height: 211 },
  watch: { src: '/bench/classifieds/watch.webp', width: 321, height: 233 },
  trumpet: { src: '/bench/classifieds/trumpet.webp', width: 301, height: 285 },
  bulb: { src: '/bench/classifieds/bulb.webp', width: 226, height: 281 },
  tree: { src: '/bench/classifieds/tree.webp', width: 547, height: 519 },
  press: { src: '/bench/classifieds/press.webp', width: 299, height: 278 },
  keys: { src: '/bench/classifieds/keys.webp', width: 321, height: 289 },
  scaffold: { src: '/bench/classifieds/scaffold.webp', width: 228, height: 269 },
  cards: { src: '/bench/classifieds/cards.webp', width: 281, height: 232 },
  stage: { src: '/bench/classifieds/stage.webp', width: 261, height: 247 },
  gem: { src: '/bench/classifieds/gem.webp', width: 443, height: 427 },
  telescope: { src: '/bench/classifieds/telescope.webp', width: 201, height: 290 },
  compass: { src: '/bench/classifieds/compass.webp', width: 231, height: 247 },
  bench: { src: '/bench/classifieds/bench.webp', width: 300, height: 256 },
  loupe: { src: '/bench/classifieds/loupe.webp', width: 415, height: 271 },
};

/** One ornament as an img tag: decorative, lazily loaded, sized. */
export function ornamentImg(name: string, className?: string): string {
  const o = ORNAMENTS[name];
  if (!o) return '';
  const cls = className ? ` class="${className}"` : '';
  return (
    `<img src="${o.src}" alt="" width="${o.width}" height="${o.height}"` +
    ` loading="lazy" decoding="async"${cls}>`
  );
}

/** The engraved cut for an entry type: launch and deploy share the launch
 *  cut, update and bugfix share the update cut; anything else has none. */
export function typeOrnament(type: unknown): string | null {
  const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
  if (t === 'launch' || t === 'deploy') return 'launch';
  if (t === 'update' || t === 'bugfix') return 'update';
  if (t === 'incident') return 'incident';
  if (t === 'note') return 'note';
  return null;
}

/** The cut's printed size: small, medium or large. */
export type CutSize = 'sm' | 'md' | 'lg';

/** One chosen cut: its ornament name and its printed size. */
export interface Cut {
  name: string;
  size: CutSize;
}

/** An announcement about one experiment uses that experiment's cut. */
const EXPERIMENT_CUT: Record<string, string> = {
  canopy: 'tree',
  texforge: 'press',
  gitkit: 'keys',
  ghscaff: 'scaffold',
  quorum: 'cards',
  demostage: 'stage',
  facetmedia: 'gem',
  'astro-denoise': 'telescope',
  cadspec: 'compass',
};

/** General announcements take a generic cut matching their subject; any
 *  subject may also take the watch, the trumpet or the bulb. */
function genericCuts(type: unknown): string[] {
  const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
  if (t === 'launch' || t === 'deploy') return ['locomotive', 'launch'];
  if (t === 'incident') return ['lantern', 'incident'];
  if (t === 'note') return ['envelope', 'note'];
  if (t === 'update' || t === 'bugfix') return ['update'];
  return ['watch', 'trumpet', 'bulb'];
}

/** FNV-1a over the seed: deterministic for a given edition, so the page
 *  never reshuffles on reload. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface CutEntry {
  id: string;
  date: string;
  type?: unknown;
  topic?: unknown;
}

/** The engraved cut for one entry on one page: the experiment's cut for an
 *  announcement about an experiment, else a generic cut matching its
 *  subject. Roughly a third of the ads go without a cut, no cut repeats on
 *  one page (the `used` set carries the page's cuts; a repeat falls back
 *  to no cut), and cuts come in three sizes. */
export function cutFor(entry: CutEntry, page: number, used: Set<string>): Cut | null {
  const h = hashSeed(`${entry.date || ''}|${page}|${entry.id || ''}`);
  if (h % 3 === 0) return null;
  const topic = typeof entry.topic === 'string' ? entry.topic.trim().toLowerCase() : '';
  const own = topic && EXPERIMENT_CUT[topic] ? [EXPERIMENT_CUT[topic]] : [];
  const candidates = own.length ? own : genericCuts(entry.type);
  const pick = candidates[Math.floor(h / 3) % candidates.length];
  if (!pick || used.has(pick)) return null;
  used.add(pick);
  const size: CutSize = h % 3 === 1 ? 'lg' : h % 2 === 0 ? 'md' : 'sm';
  return { name: pick, size };
}
