/** Plate I — the magic lantern on the home.
 *
 *  Ported from specs/redesign-reference/lantern/index.html (`drawFilm`, the
 *  seven-second cycle, the bench hold) and wired to the site's circadian
 *  phase: `data-bench-theme` on <html> (day | night) chooses the lantern
 *  frame, the screen's viewer rectangle and the machine plates. The screen
 *  itself is decorative; every string it shows also exists in the page.
 */
import { formatSolLabel } from '../lib/mission-time';

type Phase = 'day' | 'night';

const CYCLE_MS = 7000;
const FLASH_MS = 240;

export function startLantern(): void {
  const root = document.documentElement;
  const screen = document.getElementById('screen');
  const film = document.getElementById('film') as HTMLCanvasElement | null;
  if (!screen || !film) return;

  const slides = Array.from(screen.querySelectorAll<HTMLElement>('.slide'));
  if (slides.length === 0) return;
  const plates = Array.from(document.querySelectorAll<HTMLButtonElement>('.plate[data-exp]'));
  const lanternImg = document.getElementById('lantern-img') as HTMLImageElement | null;
  const pauseBtn = document.getElementById('lantern-pause') as HTMLButtonElement | null;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Circadian phase ──────────────────────────────────────────────────────
  let phase: Phase | null = null;

  const applyPhase = (): void => {
    const next: Phase = root.dataset.benchTheme === 'night' ? 'night' : 'day';
    if (next === phase) return;
    phase = next;

    // Every <source data-phase> pair (lantern frame + machine plates) flips
    // together: the inactive phase is parked behind `media="not all"`.
    document.querySelectorAll<HTMLSourceElement>('source[data-phase]').forEach((source) => {
      if (source.dataset.phase === phase) source.removeAttribute('media');
      else source.setAttribute('media', 'not all');
    });

    // The <img> fallback follows too (and carries the intrinsic box).
    document.querySelectorAll<HTMLImageElement>('img[data-day-src]').forEach((img) => {
      const src = phase === 'night' ? img.dataset.nightSrc : img.dataset.daySrc;
      if (src) img.src = src;
    });
    if (lanternImg) {
      lanternImg.width = phase === 'night' ? 1178 : 1068;
      lanternImg.height = 900;
    }

    // The screen sits over the frame's viewer rectangle, in fractions.
    const viewer =
      (phase === 'night' ? screen.dataset.viewerNight : screen.dataset.viewerDay) ?? '';
    const [x, y, w, h] = viewer.split(' ').map(Number);
    if ([x, y, w, h].every((n) => Number.isFinite(n))) {
      screen.style.left = `${x * 100}%`;
      screen.style.top = `${y * 100}%`;
      screen.style.width = `${w * 100}%`;
      screen.style.height = `${h * 100}%`;
    }
    screen.dataset.phase = phase;
  };

  applyPhase();
  new MutationObserver(applyPhase).observe(root, {
    attributes: true,
    attributeFilter: ['data-bench-theme'],
  });
  window.addEventListener('univerlab:themechange', applyPhase);

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

  // ── Slides ───────────────────────────────────────────────────────────────
  const videos = slides.map((slide) => slide.querySelector('video'));
  let current = 0;
  let lastTurn = performance.now();
  let cutAt = -1e4;
  let paused = false;
  let held = -1;

  const currentVideo = (): HTMLVideoElement | null => videos[current] ?? null;

  const syncPreload = (): void => {
    videos.forEach((video, i) => {
      if (!video) return;
      // Reduced motion never plays a clip: keep the poster and spend no bytes
      // on the files. Otherwise the current slide and the one after it load.
      video.preload =
        !reduce && (i === current || i === current + 1) ? 'auto' : 'none';
    });
  };

  const playCurrent = (): void => {
    if (reduce || paused || document.hidden) return;
    const video = currentVideo();
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => {});
  };

  const show = (index: number): void => {
    if (index === current) return;
    current = index;
    lastTurn = performance.now();
    cutAt = performance.now();

    slides.forEach((slide, i) => slide.classList.toggle('is-on', i === index));
    videos.forEach((video, i) => {
      if (video && i !== index) video.pause();
    });
    playCurrent();
    plates.forEach((plate, i) => plate.setAttribute('aria-current', String(i === index - 1)));
    syncPreload();
  };

  // Pointing at (or focusing) a machine projects it and holds it.
  plates.forEach((plate, i) => {
    const enter = (): void => {
      held = i;
      show(i + 1);
    };
    const leave = (): void => {
      if (held !== i) return;
      held = -1;
      lastTurn = performance.now();
    };
    plate.addEventListener('pointerenter', enter);
    plate.addEventListener('pointerleave', leave);
    plate.addEventListener('focus', enter);
    plate.addEventListener('blur', leave);
  });

  // ── Pause toggle ─────────────────────────────────────────────────────────
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      paused = !paused;
      pauseBtn.setAttribute('aria-pressed', String(paused));
      pauseBtn.textContent =
        (paused ? pauseBtn.dataset.resumeLabel : pauseBtn.dataset.pauseLabel) ?? pauseBtn.textContent;
      if (paused) currentVideo()?.pause();
      else {
        lastTurn = performance.now();
        playCurrent();
      }
    });
  }

  // The cycle and the clip stop while the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos.forEach((video) => video?.pause());
    else {
      lastTurn = performance.now();
      playCurrent();
    }
  });

  // ── Old-cinema layer ─────────────────────────────────────────────────────
  const ctx = film.getContext('2d');
  const grain = (() => {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const g = tile.getContext('2d');
    if (!g) return tile;
    const data = g.createImageData(128, 128);
    for (let i = 0; i < data.data.length; i += 4) {
      const v = Math.random() * 255;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
      data.data[i + 3] = 22;
    }
    g.putImageData(data, 0, 0);
    return tile;
  })();

  const drawFilm = (now: number): void => {
    if (!ctx) return;
    const w = (film.width = film.clientWidth);
    const h = (film.height = film.clientHeight);
    if (w === 0 || h === 0) return;
    const t = now / 1000;
    const lightScreen = phase !== 'night';

    ctx.clearRect(0, 0, w, h);
    if (!reduce) {
      ctx.save();
      ctx.translate(-Math.random() * 128, -Math.random() * 128);
      ctx.fillStyle = ctx.createPattern(grain, 'repeat') ?? '#000';
      ctx.fillRect(0, 0, w + 128, h + 128);
      ctx.restore();

      ctx.globalAlpha = Math.max(0, 0.04 + 0.04 * Math.sin(t * 23) * Math.sin(t * 7));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      if (Math.sin(t * 1.3) > 0.3) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = lightScreen ? '#3b2f24' : '#ece4d4';
        ctx.fillRect((Math.sin(t * 0.7) * 0.5 + 0.5) * w, 0, 1, h);
      }
    }

    const vignette = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.3,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    if (!reduce) {
      const flash = Math.max(0, 1 - (now - cutAt) / FLASH_MS);
      if (flash > 0) {
        ctx.globalAlpha = flash;
        ctx.fillStyle = '#fffaf0';
        ctx.fillRect(0, 0, w, h);
      }
    }
    ctx.globalAlpha = 1;
  };

  const loop = (now: number): void => {
    if (!reduce && !paused && held < 0 && !document.hidden && now - lastTurn > CYCLE_MS) {
      show((current + 1) % slides.length);
    }
    drawFilm(now);
    requestAnimationFrame(loop);
  };

  syncPreload();
  requestAnimationFrame(loop);
}
