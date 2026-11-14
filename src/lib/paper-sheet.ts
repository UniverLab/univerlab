// The newspaper sheet: below the desktop breakpoint the paper keeps its
// full broadsheet composition at desktop width inside a viewport the reader
// pans and zooms with the device's own gestures. No zoom library, no extra
// controls: pinch and ctrl/mouse-wheel zoom, drag pans, double-tap toggles,
// and one Fit button returns the sheet to fitted width.

import { SHEET_WIDTH_REM } from './paper-sheet-size';

const DESKTOP_QUERY = '(min-width: 64rem)';
const MIN_VIEWPORT_HEIGHT = 260;
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const TAP_MAX_MS = 300;
const TAP_MAX_PX = 24;
const CLICK_SUPPRESS_PX = 6;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface Tap {
  time: number;
  x: number;
  y: number;
}

/** Wire the sheet viewport under `root`. Safe to call on desktop or when the
 *  hooks are missing: it bails, and toggles itself on breakpoint changes. */
export function initPaperSheet(root: ParentNode = document): void {
  const viewport = root.querySelector
    ? (root.querySelector('[data-paper-viewport]') as HTMLElement | null)
    : null;
  const sheet = viewport
    ? (viewport.querySelector('[data-paper-sheet]') as HTMLElement | null)
    : null;
  const fitButton = viewport
    ? (viewport.querySelector('[data-paper-fit]') as HTMLButtonElement | null)
    : null;
  if (!viewport || !sheet || !fitButton) return;
  if (viewport.dataset.paperSheetInit === '1') return;
  viewport.dataset.paperSheetInit = '1';

  const desktopQuery = window.matchMedia(DESKTOP_QUERY);
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  let active = false;
  let fit = 1;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let lastWidth = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinchDistance = 0;
  let suppressClick = false;
  let lastTap: Tap | null = null;
  let downTime = 0;

  const sheetWidth = (): number => {
    const w = sheet.offsetWidth;
    if (w > 0) return w;
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return SHEET_WIDTH_REM * rootSize;
  };

  const sheetHeight = (): number => sheet.offsetHeight;

  const clampPan = (): void => {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const sw = sheetWidth() * scale;
    const sh = sheetHeight() * scale;
    tx = Math.min(0, Math.max(vw - sw, tx));
    ty = Math.min(0, Math.max(vh - sh, ty));
  };

  const paint = (): void => {
    sheet.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  const animateTo = (nextScale: number, nextTx: number, nextTy: number): void => {
    scale = nextScale;
    tx = nextTx;
    ty = nextTy;
    clampPan();
    if (reducedMotion.matches) {
      sheet.style.transition = '';
      paint();
      return;
    }
    sheet.style.transition = 'transform 180ms ease-out';
    paint();
    const clear = (): void => {
      sheet.style.transition = '';
    };
    sheet.addEventListener('transitionend', clear, { once: true });
    window.setTimeout(clear, 250);
  };

  const fitToWidth = (): void => {
    animateTo(fit, 0, 0);
  };

  const zoomAbout = (factor: number, cx: number, cy: number, animate: boolean): void => {
    const next = Math.min(fit * MAX_ZOOM, Math.max(fit, scale * factor));
    if (next === scale) return;
    const ratio = next / scale;
    const nextTx = cx - (cx - tx) * ratio;
    const nextTy = cy - (cy - ty) * ratio;
    if (animate) animateTo(next, nextTx, nextTy);
    else {
      scale = next;
      tx = nextTx;
      ty = nextTy;
      clampPan();
      paint();
    }
  };

  const viewportHeight = (): number =>
    Math.max(
      MIN_VIEWPORT_HEIGHT,
      Math.min(sheetHeight() * fit, window.innerHeight * 0.8),
    );

  const activate = (): void => {
    active = true;
    viewport.classList.add('sheet');
    fitButton.hidden = false;
    const vw = viewport.clientWidth || 1;
    lastWidth = vw;
    fit = vw / sheetWidth();
    scale = fit;
    tx = 0;
    ty = 0;
    viewport.style.height = `${viewportHeight()}px`;
    clampPan();
    paint();
  };

  const deactivate = (): void => {
    active = false;
    viewport.classList.remove('sheet');
    fitButton.hidden = true;
    viewport.style.height = '';
    sheet.style.transform = '';
    sheet.style.transition = '';
    scale = 1;
    tx = 0;
    ty = 0;
  };

  const syncToBreakpoint = (): void => {
    if (desktopQuery.matches) {
      if (active) deactivate();
    } else if (!active) {
      activate();
    } else {
      // A rotation or a sidebar resize changes the fitted scale: refit.
      activate();
    }
  };

  fitButton.addEventListener('click', () => {
    if (!active) return;
    fitToWidth();
  });

  viewport.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      fitToWidth();
    }
  });

  viewport.addEventListener(
    'wheel',
    (event) => {
      if (!active) return;
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomAbout(Math.exp(-event.deltaY * 0.002), event.clientX - rect.left, event.clientY - rect.top, false);
    },
    { passive: false },
  );

  viewport.addEventListener('pointerdown', (event) => {
    if (!active) return;
    // A new gesture owns its own click: a drag's suppression never eats a
    // later genuine tap (the Fit button's included).
    suppressClick = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      moved = 0;
      downTime = Date.now();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!active) return;
    const prev = pointers.get(event.pointerId);
    if (!prev) return;
    const dx = event.clientX - prev.x;
    const dy = event.clientY - prev.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      tx += dx;
      ty += dy;
      clampPan();
      paint();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance > 0 && distance > 0) {
        const rect = viewport.getBoundingClientRect();
        zoomAbout(distance / pinchDistance, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, false);
      }
      pinchDistance = distance;
      moved += Math.abs(dx) + Math.abs(dy);
    }
  });

  const endPointer = (event: PointerEvent): void => {
    if (!active) return;
    const wasSingle = pointers.size === 1 && pointers.has(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (!wasSingle) return;
    if (moved > CLICK_SUPPRESS_PX) {
      suppressClick = true;
      return;
    }
    // A tap: check for a double-tap to toggle between fitted and zoomed.
    const now = Date.now();
    const duration = now - downTime;
    if (
      lastTap &&
      now - lastTap.time < TAP_MAX_MS &&
      duration < TAP_MAX_MS &&
      Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < TAP_MAX_PX
    ) {
      lastTap = null;
      const rect = viewport.getBoundingClientRect();
      const target = scale < fit * DOUBLE_TAP_ZOOM - fit * 0.01 ? fit * DOUBLE_TAP_ZOOM : fit;
      const ratio = target / scale;
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      animateTo(target, cx - (cx - tx) * ratio, cy - (cy - ty) * ratio);
    } else if (duration < TAP_MAX_MS) {
      lastTap = { time: now, x: event.clientX, y: event.clientY };
    } else {
      lastTap = null;
    }
  };

  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
  });

  // Drags are pans, not link activations: swallow the click after a drag.
  viewport.addEventListener(
    'click',
    (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      // Keyboard and assistive clicks (detail 0) are never drags; if a drag
      // ended off-viewport no click cleared the flag, so don't eat them.
      if (event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  if (typeof desktopQuery.addEventListener === 'function') {
    desktopQuery.addEventListener('change', syncToBreakpoint);
  }
  // A width change (rotation, sidebar) changes the fitted scale, so refit;
  // a height-only change (mobile URL bar, window drag) keeps the reader's
  // zoom and pan and just resizes the viewport.
  const relayout = (): void => {
    if (!active) return;
    if (viewport.clientWidth !== lastWidth) activate();
    else viewport.style.height = `${viewportHeight()}px`;
  };
  window.addEventListener('resize', relayout);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(relayout).observe(viewport);
  }

  syncToBreakpoint();
}
