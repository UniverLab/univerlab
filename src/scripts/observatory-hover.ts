/** Observatory chart hover runtime: crosshair + data strip on every chart.
 *
 *  Each chart serializes its point set into `data-pts`; pointer position is
 *  mapped back into SVG user units so the crosshair snaps to the nearest
 *  sample. The geometry comes from src/data/observatory.ts — the same
 *  constants the template drew with — so drawing and hover cannot drift.
 *
 *  Loaded from Manifesto.astro with a plain `<script>` + `import`, the same
 *  precedent as Home.astro; it lives in src/scripts so the
 *  view stays under the reviewer's 1200-line ceiling. */

import { SVG_W, SVG_LPAD, SVG_RPAD } from '../data/observatory';

type Coord = { year: number; value: number; x: number; y: number };

export function startObservatoryHover(): void {
  document.querySelectorAll<SVGSVGElement>('.obs-svg').forEach((svg) => {
    const raw = svg.dataset.pts;
    if (!raw) return;
    let pts: Coord[];
    try { pts = JSON.parse(raw); } catch { return; }
    if (!pts.length) return;

    const crosshair = svg.querySelector<SVGLineElement>('.obs-crosshair');
    const dot = svg.querySelector<SVGCircleElement>('.obs-dot');
    const chart = svg.closest<HTMLElement>('.obs-chart');
    const yearEl = chart?.querySelector<HTMLElement>('.obs-hover-year');
    const valEl = chart?.querySelector<HTMLElement>('.obs-hover-val');

    const closestPt = (svgX: number) =>
      pts.reduce((best, p) =>
        Math.abs(p.x - svgX) < Math.abs(best.x - svgX) ? p : best);

    const fmtVal = (v: number) =>
      v >= 1000 ? v.toLocaleString() : v % 1 !== 0 ? v.toFixed(1) : String(v);

    const toSvgX = (clientX: number) => {
      const r = svg.getBoundingClientRect();
      return (clientX - r.left) * (SVG_W / r.width);
    };

    const showPt = (svgX: number) => {
      const p = closestPt(svgX);
      crosshair?.setAttribute('x1', p.x.toFixed(1));
      crosshair?.setAttribute('x2', p.x.toFixed(1));
      crosshair?.removeAttribute('visibility');
      dot?.setAttribute('cx', p.x.toFixed(1));
      dot?.setAttribute('cy', p.y.toFixed(1));
      dot?.removeAttribute('visibility');
      if (yearEl) yearEl.textContent = String(p.year);
      if (valEl) valEl.textContent = fmtVal(p.value);
    };

    const hidePt = () => {
      crosshair?.setAttribute('visibility', 'hidden');
      dot?.setAttribute('visibility', 'hidden');
      if (yearEl) yearEl.textContent = '—';
      if (valEl) valEl.textContent = '';
    };

    svg.addEventListener('mousemove', (e) => {
      const svgX = toSvgX(e.clientX);
      if (svgX < SVG_LPAD || svgX > SVG_W - SVG_RPAD) { hidePt(); return; }
      showPt(svgX);
    });

    svg.addEventListener('mouseleave', hidePt);

    svg.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const svgX = toSvgX(e.touches[0].clientX);
      if (svgX < SVG_LPAD || svgX > SVG_W - SVG_RPAD) { hidePt(); return; }
      showPt(svgX);
    }, { passive: false });

    svg.addEventListener('touchend', hidePt);
  });
}
