/** CRT power-off between the home and an experiment page.
 *
 *  Ported from specs/redesign-reference/bench-mockup/index.html: the home view
 *  collapses to a line, then a point, a white dot flashes, and the browser
 *  navigates. The destination's BaseLayout reads the handshake key and plays
 *  `crt-on` once. Under reduced motion it navigates at once.
 */
const CRT_KEY = 'univerlab-crt';
const OFF_MS = 550;
const DOT_MS = 430;
const NAV_MS = 820;

export function crtNavigate(href: string, view: HTMLElement, dot: HTMLElement): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    window.location.assign(href);
    return;
  }

  try {
    sessionStorage.setItem(CRT_KEY, '1');
  } catch (_) {
    /* storage disabled: navigate plainly below */
  }

  view.classList.remove('on');
  view.classList.add('off');

  window.setTimeout(() => {
    dot.classList.remove('flash');
    // Restart the animation even if it is already on screen.
    void dot.offsetWidth;
    dot.classList.add('flash');
  }, DOT_MS);

  window.setTimeout(() => {
    window.location.assign(href);
  }, NAV_MS);
}
