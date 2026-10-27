// moonSVG(phase, id, r): the engraved moon at any phase in [0, 1): 0 new, 0.5 full, waxing lit on the right.
// A chalk moon for the night ground: the lit part glows, the shadow is cross-hatched. Fixed colours:
// the moon only shows at night. Ported verbatim from public/bench/identidad/luna.js; r (disc radius in
// the 120 viewBox) defaults to the stamp's 40 so that output stays byte-identical there, while the
// header passes the sun's disc radius so both bodies read the same size.
/** The disc radius of the sun icon (public/bench/identidad/sol.svg) in the same
 *  120 box: the header and the stamp draw the moon at this radius so the two
 *  sky bodies read as one size, rays aside. */
export const SUN_DISC_R = 25;

/** The sun icon's URL, versioned: /bench/ assets are cached for 30 days, so a
 *  redrawn sun needs a new URL or returning visitors keep the old drawing next
 *  to a moon sized for the new one. Bump `v` whenever sol.svg changes. */
export const SUN_SRC = '/bench/identidad/sol.svg?v=2';

export function moonSVG(phase: number, id: string, r = 40): string {
  const c = 60,
    p = ((phase % 1) + 1) % 1;
  // The craters scale with the disc, so a smaller moon keeps the same face;
  // at the default r=40 the scale is 1 and the output is unchanged.
  const s = r / 40;
  const n = (x: number): string => String(Number(x.toFixed(2)));
  const k = Math.cos(2 * Math.PI * p); // terminator ellipse: x radius = |k| * r
  const waxing = p < 0.5;
  const rx = Math.abs(k) * r;
  // Lit region: the outer half-circle on the lit side, closed by the terminator ellipse.
  const outerSweep = waxing ? 1 : 0;
  const innerSweep = (waxing ? k > 0 : k < 0) ? 0 : 1;
  const lit = `M${c} ${c - r} A${r} ${r} 0 0 ${outerSweep} ${c} ${c + r} A${rx.toFixed(2)} ${r} 0 0 ${innerSweep} ${c} ${c - r}Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none" stroke="#ecebe4" stroke-linecap="round">
  <defs>
    <pattern id="${id}-x" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 2.5 H5 M2.5 0 V5" stroke="#ecebe4" stroke-width="1.1" opacity=".45"/></pattern>
    <pattern id="${id}-d" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r=".8" fill="#8f978f" stroke="none"/></pattern>
    <clipPath id="${id}-c"><circle cx="${c}" cy="${c}" r="${r}"/></clipPath>
    <mask id="${id}-shadow"><circle cx="${c}" cy="${c}" r="${r}" fill="white"/><path d="${lit}" fill="black"/></mask>
  </defs>
  <circle cx="${c}" cy="${c}" r="${r}" fill="url(#${id}-x)" stroke="none" mask="url(#${id}-shadow)"/>
  <path d="${lit}" fill="#ecebe4" stroke="none" opacity=".92" clip-path="url(#${id}-c)"/>
  <path d="${lit}" fill="url(#${id}-d)" stroke="none" opacity=".6" clip-path="url(#${id}-c)"/>
  <path d="${lit}" stroke-width="1.2" opacity=".5" clip-path="url(#${id}-c)"/>
  <g clip-path="url(#${id}-c)" stroke="#8f978f" stroke-width="1.4" opacity=".8"><circle cx="${n(c - 14 * s)}" cy="${n(c - 10 * s)}" r="${n(7 * s)}"/><circle cx="${n(c + 12 * s)}" cy="${n(c + 14 * s)}" r="${n(5 * s)}"/><circle cx="${n(c + 6 * s)}" cy="${n(c - 18 * s)}" r="${n(3.5 * s)}"/></g>
  <circle cx="${c}" cy="${c}" r="${r + 10}" fill="#ecebe4" stroke="none" opacity=".08"/>
  <circle cx="${c}" cy="${c}" r="${r}" stroke-width="2.5"/>
</svg>`;
}
