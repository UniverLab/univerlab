/** Home → experiment: the lantern's screen tunes in to the experiment.
 *
 *  A short burst of static (lantern.ts paints it while `#screen.is-tuning`),
 *  then the browser navigates and the cross-document view transition zooms
 *  the source into the destination's hero: both carry `exp-<id>` in the
 *  `exp-zoom` class (ExperimentLayout's hero, global.css's timing). Engines
 *  without cross-document view transitions keep the static and load plainly.
 *  Under reduced motion it navigates at once.
 */
const STATIC_MS = 170;

export function tuneNavigate(href: string, exp: string, source: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.location.assign(href);
    return;
  }
  source.style.setProperty('view-transition-name', `exp-${exp}`);
  source.style.setProperty('view-transition-class', 'exp-zoom');
  document.getElementById('screen')?.classList.add('is-tuning');
  window.setTimeout(() => window.location.assign(href), STATIC_MS);
}

/** Back restores the bfcache snapshot mid-tune: drop the static and the
 *  shared name, or the next click would carry two `exp-*` names. */
export function untune(): void {
  document.getElementById('screen')?.classList.remove('is-tuning');
  document.querySelectorAll<HTMLElement>('#screen, .plate[data-exp]').forEach((el) => {
    el.style.removeProperty('view-transition-name');
    el.style.removeProperty('view-transition-class');
  });
}
