// Engraved ornaments for the classifieds pages (paper pages 2 and 3).
// Only the files in public/bench/classifieds/ are used; when an ornament
// is missing for a case, the case simply goes without one.

/** One ornament: its file and its intrinsic size, for the img tag. */
interface Ornament {
  src: string;
  width: number;
  height: number;
}

/** Every engraved cut the section may set, by name. */
export const ORNAMENTS: Record<string, Ornament> = {
  head: { src: '/bench/classifieds/head.webp', width: 1200, height: 451 },
  fleuron: { src: '/bench/classifieds/fleuron.webp', width: 480, height: 134 },
  manicule: { src: '/bench/classifieds/manicule.webp', width: 192, height: 113 },
  launch: { src: '/bench/classifieds/launch.webp', width: 256, height: 396 },
  update: { src: '/bench/classifieds/update.webp', width: 256, height: 236 },
  incident: { src: '/bench/classifieds/incident.webp', width: 256, height: 287 },
  note: { src: '/bench/classifieds/note.webp', width: 256, height: 209 },
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
