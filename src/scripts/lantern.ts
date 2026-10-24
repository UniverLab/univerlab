/** Plate I — the magic lantern on the home.
 *
 *  Ported from specs/redesign-reference/lantern/index.html (`drawFilm`, the
 *  seven-second cycle, the bench hold) and wired to the site's circadian
 *  phase: `data-bench-theme` on <html> (day | night) chooses the lantern
 *  frame, the screen's viewer rectangle and the machine plates. The screen
 *  itself is decorative; every string it shows also exists in the page.
 */
import { formatSolLabel } from '../lib/mission-time';
import { liveExperiments } from '../lib/experiments';
import { fondoLoaders } from './fondos/index';
import type { Fondo } from './fondos/runtime';

type Phase = 'day' | 'night';

const CYCLE_MS = 7000;
const FLASH_MS = 240;
/** One character every 28 ms when the freed corner types the experiment out. */
const TYPE_MS = 28;
/** A touched world falls back to its machine after 12 s without further touches. */
const WORLD_TOUCH_MS = 12000;
/** Worlds that sit on a light ground (the `paper` and `pastel` surfaces);
 *  every other experiment page is a dark surface, and Quorum follows the
 *  phase. The world host carries that ground (see Home.astro `.world-host`). */
const LIGHT_WORLDS = new Set(['texforge', 'gitkit']);

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

  // ── World mode: the screen becomes the experiment's live background ──────
  //  The world's module mounts into #world-host under the clip; the module
  //  listens through the runtime's pointerIn(host), which already reports
  //  coordinates relative to the host, so the cursor drives it exactly as on
  //  the experiment's own page. No iframes; the module loads lazily, only on
  //  the first hover that needs it.
  const worldHost = document.getElementById('world-host');
  const catcher = document.getElementById('catch');
  const typed = document.getElementById('typed');
  const typedK = typed?.querySelector('[data-typed="k"]');
  const typedCmd = typed?.querySelector('[data-typed="cmd"]');
  const typedLine = typed?.querySelector('[data-typed="line"]');
  const hint = document.querySelector('.hint');
  const hintText = hint?.textContent ?? '';
  const expById = new Map(liveExperiments.map((exp) => [exp.id, exp]));
  let inWorld = false;
  let world: Fondo | null = null;
  let worldId: string | null = null;
  /** Bumped on every unmount: a module still downloading for a request that
   *  was already cancelled must not mount into the host (and leak a canvas). */
  let worldToken = 0;
  let typeTimer = 0;
  let lastTouch = 0;

  /** Quorum follows the circadian phase; every other world keeps its colours. */
  const isDarkWorld = (id: string): boolean =>
    id === 'quorum' ? root.dataset.benchTheme === 'night' : !LIGHT_WORLDS.has(id);

  /** The typed block and the bench hint follow the world, not the phase. */
  const paintWorld = (): void => {
    const id = slides[current]?.dataset.exp;
    const dark = inWorld && id ? isDarkWorld(id) : phase === 'night';
    screen.classList.toggle('on-dark', dark);
    screen.classList.toggle('on-light', !dark);
    // The world sits on the experiment's own ground, not on the lantern's
    // parchment: `data-surface` hands the host that page's `--surface-bg`.
    if (worldHost) {
      const surface = slides[current]?.dataset.surface;
      if (surface) worldHost.dataset.surface = surface;
      else delete worldHost.dataset.surface;
    }
    if (world && worldId === 'quorum') {
      world.setNight(root.dataset.benchTheme === 'night');
    }
  };

  const unmountWorld = (): void => {
    worldToken += 1;
    worldId = null;
    if (world) {
      world.destroy();
      world = null;
    }
    if (worldHost) worldHost.innerHTML = '';
  };

  const mountWorld = (id: string): void => {
    unmountWorld();
    worldId = id;
    const token = worldToken;
    const load = fondoLoaders[id];
    if (!load || !worldHost) return;
    const host = worldHost;
    const night = id === 'quorum' ? root.dataset.benchTheme === 'night' : false;
    void (load() as Promise<{ mount: (host: HTMLElement, opts: object) => Fondo }>).then((mod) => {
      // The cursor may have left (or the bench moved on) while loading — and
      // a leave/re-enter for the same id gets a fresh token, so the stale
      // request cannot mount a second world on top of the live one.
      if (worldId !== id || !inWorld || token !== worldToken) return;
      world = mod.mount(host, { night, reduced: reduce, base: `/bench/fondos/${id}/` });
      paintWorld();
    });
  };

  const clearType = (): void => {
    window.clearInterval(typeTimer);
    if (typedK) typedK.textContent = '';
    if (typedCmd) typedCmd.textContent = '';
    if (typedLine) {
      typedLine.textContent = '';
      typedLine.classList.remove('is-on');
    }
    if (hint) hint.textContent = hintText;
  };

  const typeOut = (id: string): void => {
    if (!typedK || !typedCmd || !typedLine) return;
    window.clearInterval(typeTimer);
    const exp = expById.get(id);
    const slide = slides[current];
    const tagline = slide?.dataset.tagline ?? '';
    // Experiments with a binary type their install command; the two without
    // one (Quorum, Astro Denoise) type their bench line instead.
    const cmd = exp?.install?.unix ?? slide?.dataset.bench ?? '';
    typedK.textContent = `${exp?.number ?? id} · ${exp?.name ?? id}`;
    typedLine.textContent = tagline;
    typedLine.classList.remove('is-on');
    // While a world is open the hint appends the click affordance
    // (`data-open-hint`, i18n `home.lantern.open`); clearType restores it.
    if (hint) {
      hint.textContent =
        (slide?.dataset.worldHint ?? hintText) + (hint.dataset.openHint ?? '');
    }
    if (reduce || cmd.length === 0) {
      // Reduced motion (or nothing to type): the still frame and every line
      // appear at once, with no typing effect.
      typedCmd.textContent = cmd;
      typedLine.classList.add('is-on');
      return;
    }
    let i = 0;
    typedCmd.textContent = '';
    typeTimer = window.setInterval(() => {
      i += 1;
      typedCmd.textContent = cmd.slice(0, i);
      if (i >= cmd.length) {
        window.clearInterval(typeTimer);
        typedLine.classList.add('is-on');
      }
    }, TYPE_MS);
  };

  const setWorld = (on: boolean): void => {
    if (on === inWorld) return;
    const id = slides[current]?.dataset.exp;
    // The title slide is not an experiment: it has no world to open onto.
    if (on && !id) return;
    inWorld = on;
    cutAt = performance.now();
    lastTurn = performance.now();
    screen.classList.toggle('is-world', on);
    if (on && id) {
      mountWorld(id);
      typeOut(id);
    } else {
      unmountWorld();
      clearType();
    }
    paintWorld();
  };

  catcher?.addEventListener('pointerenter', (ev) => {
    if ((ev as PointerEvent).pointerType !== 'mouse') return;
    // A mouse takes over from a tap: the touch return must not close the
    // world under a cursor that is still on the screen.
    lastTouch = 0;
    setWorld(true);
  });
  catcher?.addEventListener('pointermove', (ev) => {
    // A scroll can park the cursor over the screen without a fresh entry;
    // the first move inside still opens the world.
    if ((ev as PointerEvent).pointerType !== 'mouse') return;
    lastTouch = 0;
    if (!inWorld) setWorld(true);
  });
  catcher?.addEventListener('pointerleave', (ev) => {
    if ((ev as PointerEvent).pointerType === 'mouse') setWorld(false);
  });
  catcher?.addEventListener('pointerdown', (ev) => {
    if ((ev as PointerEvent).pointerType === 'mouse') return;
    lastTouch = performance.now();
    if (!inWorld) setWorld(true);
  });

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
    // A phase change repaints the world: Quorum follows it live.
    paintWorld();
  };

  // applyPhase() itself runs at the end of startLantern, once every section
  // it positions (slides, the world painter) is declared: the world painter
  // reads the current slide, which lives below.
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
  // Before the first cut the projection is the title slide: no experiment.
  screen.dataset.currentExp = slides[current]?.dataset.exp ?? '';
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
    // The screen publishes the experiment it projects ("" on the title slide)
    // so the page can open it on a click; see Home.astro's #catch handler.
    screen.dataset.currentExp = slides[current]?.dataset.exp ?? '';
    lastTurn = performance.now();
    cutAt = performance.now();

    slides.forEach((slide, i) => slide.classList.toggle('is-on', i === index));
    videos.forEach((video, i) => {
      if (video && i !== index) video.pause();
    });
    playCurrent();
    plates.forEach((plate, i) => plate.setAttribute('aria-current', String(i === index - 1)));
    syncPreload();

    // The bench steers the projection even inside a world: the current world
    // unmounts and the new experiment's mounts in its place.
    if (inWorld) {
      const id = slides[current]?.dataset.exp;
      if (id) {
        mountWorld(id);
        typeOut(id);
      } else {
        setWorld(false);
        return;
      }
    }
    paintWorld();
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
    const worldIdNow = inWorld ? (slides[current]?.dataset.exp ?? '') : '';
    const lightScreen = inWorld ? !isDarkWorld(worldIdNow) : phase !== 'night';

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
    // A touched world falls back to its machine after a quiet while; the
    // slides only turn on machines, never inside a world. (No `:hover` test:
    // a tap leaves the catcher hovered on touch screens.)
    if (inWorld && lastTouch && now - lastTouch > WORLD_TOUCH_MS) {
      setWorld(false);
      lastTouch = 0;
    }
    if (!reduce && !paused && held < 0 && !inWorld && !document.hidden && now - lastTurn > CYCLE_MS) {
      show((current + 1) % slides.length);
    }
    drawFilm(now);
    requestAnimationFrame(loop);
  };

  syncPreload();
  // Positions the screen on the viewer rectangle, picks the frame and paints
  // the world's light/dark classes (which ends in paintWorld()).
  applyPhase();
  requestAnimationFrame(loop);
}
