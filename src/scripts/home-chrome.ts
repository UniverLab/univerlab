/** The home's own chrome: the engraved imprint and the horizon's mask gap.
 *
 *  Both used to run inside startLantern() while the lantern lived on the home.
 *  The lantern moved to /experiments, so they live here and the home mounts
 *  them directly; /experiments has neither #imprint nor a horizon.
 */
import { formatSolLabel } from '../lib/mission-time';

export function startHomeChrome(): void {
  // ── Imprint: the build's Sol, refreshed on load ──────────────────────────
  const imprint = document.getElementById('imprint');
  if (imprint) {
    const now = new Date();
    imprint.textContent = `${now.getFullYear()} · ${formatSolLabel(now.toISOString())} · univerlab.org`;
  }

  // ── Horizon: cut the sea lines to the motto's measured width ─────────────
  const measureHorizon = (): void => {
    const text = document.getElementById('horizon-text') as SVGTextElement | null;
    const gap = document.getElementById('horizon-gap');
    if (!text || !gap) return;
    try {
      const box = text.getBBox();
      gap.setAttribute('x', (box.x - 26).toFixed(1));
      gap.setAttribute('width', (box.width + 52).toFixed(1));
    } catch (_) {
      /* not laid out yet */
    }
  };
  requestAnimationFrame(measureHorizon);
  if (document.fonts?.ready) void document.fonts.ready.then(measureHorizon);
  window.addEventListener('resize', measureHorizon);
}
