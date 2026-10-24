// The papers of a letter, as strings: the envelope and its flap, the postmark
// and the foxing that ages every letter differently. Ported from the approved
// mockup (specs/redesign-reference/correo/index.html).

/** The envelope's back: the paper inside the box, hatched. */
export const ENVELOPE = `<svg viewBox="0 0 300 186" preserveAspectRatio="none" aria-hidden="true">
      <defs><pattern id="lin" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><path d="M0 3 H6" stroke="var(--mail-lining-ink)" stroke-width=".7" opacity=".55"/></pattern></defs>
      <rect x=".5" y=".5" width="299" height="185" fill="var(--mail-lining)" stroke="var(--mail-env-edge)"/><rect x=".5" y=".5" width="299" height="185" fill="url(#lin)"/></svg>`;

/** The address side: the folded front of the envelope. */
export const FRONT = `<svg viewBox="0 0 300 186" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sideL" x1="0" x2="1"><stop offset="0" stop-color="var(--mail-env)"/><stop offset="1" stop-color="var(--mail-env-shade)"/></linearGradient>
        <linearGradient id="sideR" x1="1" x2="0"><stop offset="0" stop-color="var(--mail-env)"/><stop offset="1" stop-color="var(--mail-env-shade)"/></linearGradient>
        <linearGradient id="bot" y1="1" y2="0"><stop offset="0" stop-color="var(--mail-env)"/><stop offset="1" stop-color="var(--mail-env-shade)"/></linearGradient>
      </defs>
      <path d="M0 0 L138 104 L0 186 Z" fill="url(#sideL)"/><path d="M300 0 L162 104 L300 186 Z" fill="url(#sideR)"/>
      <path d="M0 186 L150 92 L300 186 Z" fill="url(#bot)" stroke="var(--mail-env-edge)" stroke-width=".8"/>
      <path d="M0 0 L138 104 M300 0 L162 104" stroke="var(--mail-env-edge)" stroke-width=".6" opacity=".7"/>
      <rect x=".5" y=".5" width="299" height="185" fill="none" stroke="var(--mail-env-edge)"/></svg>`;

/** The flap: outside, and the engraved lining drawn apex-up on its own face
 *  (pre-turned on its centre, then turned again with the hinge, so the opened
 *  flap points away from the envelope as a real one does). */
export const FLAP = `<svg class="outer" viewBox="0 0 300 105" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="fo" y1="0" y2="1"><stop offset="0" stop-color="var(--mail-env-shade)"/><stop offset="1" stop-color="var(--mail-env)"/></linearGradient></defs>
      <path d="M0 0 H300 L156 103 Q150 107 144 103 Z" fill="url(#fo)" stroke="var(--mail-env-edge)" stroke-width=".8"/></svg>
    <svg class="inner" viewBox="0 0 300 105" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 105 H300 L156 2 Q150 -2 144 2 Z" fill="var(--mail-lining)" stroke="var(--mail-env-edge)" stroke-width=".8"/>
      <path d="M0 105 H300 L156 2 Q150 -2 144 2 Z" fill="url(#lin)"/></svg>`;

/** The postmark: a ring of the ring's words, the day and its year in the
 *  middle, wavy killer bars off to the right. */
export function postmarkSVG(ring: string, mark: string, year: string, id: string): string {
  const text = `${ring} · `;
  let path = text;
  while (path.length < 46) path += text;
  return `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" aria-hidden="true">
      <defs><path id="pm-${id}" d="M50 50 m-36 0 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0"/></defs>
      <circle cx="50" cy="50" r="46" stroke-width="2.2"/><circle cx="50" cy="50" r="27" stroke-width="1.4"/>
      <text font-family="Sometype Mono, monospace" font-size="9.5" letter-spacing="1.6" fill="currentColor" stroke="none"><textPath href="#pm-${id}" startOffset="2%">${path}</textPath></text>
      <text x="50" y="47" text-anchor="middle" font-family="Sometype Mono, monospace" font-size="9.5" fill="currentColor" stroke="none">${mark}</text>
      <text x="50" y="60" text-anchor="middle" font-family="Sometype Mono, monospace" font-size="10" fill="currentColor" stroke="none">${year}</text>
      <path d="M96 38 q10 -6 20 0 t20 0 t20 0 t20 0 M96 50 q10 -6 20 0 t20 0 t20 0 t20 0 M96 62 q10 -6 20 0 t20 0 t20 0 t20 0" stroke-width="1.8"/></svg>`;
}

/** Nine foxing spots and one faint tide line, different on every letter. */
export function spots(): string {
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  const out: string[] = [];
  for (let i = 0; i < 9; i++) {
    const x = r(4, 96), y = r(6, 94), z = r(0.6, 2.6);
    out.push(`radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgb(122 82 34 / ${r(0.18, 0.34).toFixed(2)}) ${z.toFixed(1)}%, transparent ${(z * 1.9).toFixed(1)}%)`);
  }
  const cx = r(15, 85), cy = r(20, 80), R = r(9, 15);
  out.push(`radial-gradient(circle at ${cx.toFixed(1)}% ${cy.toFixed(1)}%, transparent ${R.toFixed(1)}%, rgb(120 84 40 / .16) ${(R + 0.6).toFixed(1)}%, transparent ${(R + 2.2).toFixed(1)}%)`);
  return out.join(',');
}

/** The deckled edge of the letter, a torn polygon measured on the real sheet. */
export function deckle(el: HTMLElement): void {
  const w = el.offsetWidth, h = el.offsetHeight, pts: string[] = [], j = () => (Math.random() * 1.8).toFixed(1);
  for (let x = 0; x <= w; x += 7) pts.push(`${x}px ${j()}px`);
  for (let y = 0; y <= h; y += 7) pts.push(`calc(100% - ${j()}px) ${y}px`);
  for (let x = w; x >= 0; x -= 7) pts.push(`${x}px calc(100% - ${j()}px)`);
  for (let y = h; y >= 0; y -= 7) pts.push(`${j()}px ${y}px`);
  el.style.setProperty('--deckle', `polygon(${pts.join(',')})`);
}

/** Animate to a promise, degrading gracefully where the Web Animations API
 *  is absent (the letter still opens, just without the flourish). */
export function anim(
  el: Element,
  frames: Keyframe[],
  opts: KeyframeAnimationOptions,
): Promise<void> {
  const a = el as HTMLElement & { animate?: (f: Keyframe[], o?: KeyframeAnimationOptions) => Animation };
  if (typeof a.animate !== 'function') return Promise.resolve();
  return a.animate(frames, { fill: 'forwards', ...opts }).finished.then(() => undefined);
}
