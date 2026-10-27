/** Home → experiment: the lantern's screen tunes in to the experiment.
 *
 *  The browser navigates at once and the cross-document view transition zooms
 *  the source into the destination's hero: both carry `exp-<id>` in the
 *  `exp-zoom` class (ExperimentLayout's hero, global.css's timing). Engines
 *  without cross-document view transitions load plainly. Under reduced motion
 *  it navigates without naming the source.
 */

export function tuneNavigate(href: string, exp: string, source: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.location.assign(href);
    return;
  }
  source.style.setProperty('view-transition-name', `exp-${exp}`);
  source.style.setProperty('view-transition-class', 'exp-zoom');
  window.location.assign(href);
}

/** Back restores the bfcache snapshot mid-tune: drop the shared name, or the
 *  next click would carry two `exp-*` names. */
export function untune(): void {
  document.querySelectorAll<HTMLElement>('#screen, .plate[data-exp]').forEach((el) => {
    el.style.removeProperty('view-transition-name');
    el.style.removeProperty('view-transition-class');
  });
}
