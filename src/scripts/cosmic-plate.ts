// Drives Plate I (src/components/CosmicPlate.astro) from the scroll: the
// pull-back through the eight scenes, then deep time. Only transforms and
// opacities change, at most once a frame and only while the plate is on
// screen. Reduced motion keeps the plate still, on the Milky Way.
import {
  progressToZ,
  sceneScale,
  sceneOpacity,
  captionIndex,
  timeProgress,
  SPACE_END,
  VIEW,
} from '../lib/cosmic-plate';

/** When each time label and mark shows, as fractions of the time phase. */
const MARK_AT = [0.12, 0.2, 0.28, 0.55, 0.72];
const LENS_AT = 0.45;
const CODA_AT = 0.86;
const STILL_Z = 4;

export function mountCosmicPlate(): void {
  const root = document.querySelector<HTMLElement>('[data-cosmic]');
  if (!root) return;
  const track = root.querySelector<HTMLElement>('.cosmic-track');
  const scenes = Array.from(root.querySelectorAll<SVGGElement>('.cs'));
  const time = root.querySelector<SVGGElement>('.ct');
  const lens = root.querySelector<SVGGElement>('.tm-lens');
  const name = root.querySelector<HTMLElement>('.cap-name');
  const scale = root.querySelector<HTMLElement>('.cap-scale');
  const coda = root.querySelector<HTMLElement>('.cosmic-coda');
  const hint = root.querySelector<HTMLElement>('.cosmic-hint');
  if (!track || !time || !name || !scale) return;
  const svg = root.querySelector<SVGSVGElement>('.cosmic-svg');
  let captions: { space: [string, string][]; time: [string, string][] } = { space: [], time: [] };
  try {
    captions = JSON.parse(root.querySelector('[data-cosmic-captions]')?.textContent || '{}');
  } catch (e) {
    // Without captions the plate still runs; the legend below carries the facts.
  }
  const marks = Array.from(root.querySelectorAll<SVGElement>('.tm, .tl')).map((el) => {
    const m = /(?:tm|tl)-(\d)/.exec(el.getAttribute('class') || '');
    return { el, at: m ? MARK_AT[Number(m[1])] ?? 0 : 0 };
  });

  let shown = -1;
  const paint = (z: number) => {
    scenes.forEach((g, i) => {
      const o = sceneOpacity(i, z);
      g.style.opacity = o.toFixed(3);
      g.style.visibility = o > 0.001 ? 'visible' : 'hidden';
      if (o > 0.001) g.setAttribute('transform', `scale(${sceneScale(i, z).toPrecision(5)})`);
    });
    const t = timeProgress(z);
    time.style.opacity = Math.min(1, t * 4).toFixed(3);
    for (const { el, at } of marks) el.style.opacity = t >= at ? '1' : '0';
    if (lens) lens.style.opacity = t >= LENS_AT ? '1' : '0';
    coda?.classList.toggle('on', t >= CODA_AT);
    hint?.classList.toggle('off', z > 0.25);
    // Space phase: the dominant scene. Time phase: the latest mark revealed
    // (index 0 is the universe's age, shown as soon as the rule appears).
    const inTime = z > SPACE_END + 0.5;
    const idx = inTime ? 100 + MARK_AT.filter((at) => t >= at).length : captionIndex(z);
    if (idx === shown) return;
    shown = idx;
    const c = inTime ? captions.time?.[idx - 100] : captions.space?.[idx];
    name.textContent = c ? c[0] : '';
    scale.textContent = c ? c[1] : '';
  };

  // A narrow (portrait) plate crops the scenes instead of shrinking them, and
  // the time rule is scaled to the width that stays visible.
  const fit = () => {
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const narrow = r.width < r.height * 1.2;
    svg.setAttribute('preserveAspectRatio', narrow ? 'xMidYMid slice' : 'xMidYMid meet');
    const visible = narrow && r.height ? (VIEW.h * r.width) / r.height : VIEW.w;
    time.setAttribute('transform', `translate(0 70) scale(${Math.min(1, visible / 960).toFixed(3)})`);
  };
  fit();

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    paint(STILL_Z);
    return;
  }

  root.setAttribute('data-live', '');
  let frame = 0;
  const update = () => {
    frame = 0;
    const r = track.getBoundingClientRect();
    const run = r.height - innerHeight;
    paint(progressToZ(run > 0 ? -r.top / run : 0));
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  let onScreen = false;
  new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    if (onScreen) schedule();
  }).observe(track);
  addEventListener('scroll', () => onScreen && schedule(), { passive: true });
  addEventListener('resize', () => {
    fit();
    schedule();
  });
  update();
}
