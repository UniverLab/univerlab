// Self-hosted PDF reader for the signing page and the audit report: every
// page renders as a paper sheet in the site's style (no native-viewer
// iframe, which cannot be styled). pdfjs-dist is pinned exact in
// package.json and its worker ships from the site via a `?url` import, so
// the bundle loads only on signing pages (dynamic import from
// sign-shell.astro) or when the audit reader opens. The text layer stays
// selectable; the SHA-256 of the fetched bytes is checked against the
// request's original hash and a mismatch shows an error, never a silent
// render of other bytes.
//
// One reader, two modes (FR guideline): `data-mode="paged"` (the audit
// page) shows one page at a time like a book; the default `continuous`
// mode (/sign) keeps the whole document scrollable so the signer goes
// through every page.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Fill the `pageOf` template: "Page {current} of {total}". Pure, tested. */
export function pageLabel(current: number, total: number, template: string): string {
  return template.replace('{current}', String(current)).replace('{total}', String(total));
}

/** Hex digests match ignoring case and surrounding whitespace. Pure, tested. */
export function hashesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** SHA-256 of the exact bytes the reader renders. */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Clamp a page number into 1..total. Pure, tested. */
export function clampPage(n: number, total: number): number {
  if (!Number.isFinite(total) || total < 1) return 1;
  if (!Number.isFinite(n)) return 1;
  return Math.min(total, Math.max(1, Math.floor(n)));
}

/** Parse a goto-input value: a 1-based page in range wins, anything else
 *  (empty, not a number, out of range) keeps the current page so an
 *  invalid jump restores instead of moving. Pure, tested. */
export function parsePageInput(raw: string, total: number, current: number): number {
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > total) return clampPage(current, total);
  return n;
}

/** Localized strings the server inlines as data-* on the `.sign-reader` div. */
interface ReaderStrings {
  loading: string;
  error: string;
  zoomIn: string;
  zoomOut: string;
  zoomFit: string;
  pagePrev: string;
  pageNext: string;
  pageOf: string;
  pageGo: string;
  pageDownload: string;
  hashMismatch: string;
}

function readStrings(el: HTMLElement): ReaderStrings {
  const d = el.dataset;
  return {
    loading: d['loading'] ?? 'Loading…',
    error: d['error'] ?? 'error',
    zoomIn: d['zoomIn'] ?? '+',
    zoomOut: d['zoomOut'] ?? '−',
    zoomFit: d['zoomFit'] ?? 'Fit',
    pagePrev: d['pagePrev'] ?? '‹',
    pageNext: d['pageNext'] ?? '›',
    pageOf: d['pageOf'] ?? 'Page {current} of {total}',
    pageGo: d['pageGo'] ?? 'Go to page',
    pageDownload: d['download'] ?? 'Download PDF',
    hashMismatch: d['hashMismatch'] ?? 'hash mismatch',
  };
}

function button(label: string, act: string, text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset['act'] = act;
  b.setAttribute('aria-label', label);
  b.textContent = text;
  return b;
}

/** Fit-to-width scale for a page of `pageW` CSS px in `availW` CSS px.
 *  Pure so jest can pin it: the rendered page is never wider than its sheet. */
export function fitScale(availW: number, pageW: number): number {
  return availW > 0 ? availW / pageW : 1;
}

/** Fit-to-page scale: the whole sheet fits in availW×availH CSS px, so at
 *  fit the page shows without scrolling the document at 1280x900 and
 *  390x844 alike. Pure so jest can pin it. */
export function fitPage(availW: number, availH: number, pageW: number, pageH: number): number {
  if (availW <= 0 || availH <= 0 || pageW <= 0 || pageH <= 0) return 1;
  return Math.min(availW / pageW, availH / pageH);
}

/** Resolve the PDF URL for a `.sign-reader` element: the audit page passes
 *  `data-src` (no `data-orig-hash`, so no hash check), while `/sign` keeps
 *  passing `data-id`/`data-orig-hash`. Pure, tested. */
export function resolveReaderSrc(d: DOMStringMap): string {
  return d['src'] || (d['id'] ? `/api/sign-file?id=${encodeURIComponent(d['id'])}` : '');
}

/** Render one page of the request's PDF into `el`. Never throws: failures
 *  replace the loading status with the localized error. */
export async function initReader(el: HTMLElement): Promise<void> {
  const s = readStrings(el);
  const src = resolveReaderSrc(el.dataset);
  const origHash = el.dataset['origHash'] ?? '';
  if (!src) {
    el.textContent = s.error;
    return;
  }

  let bytes: ArrayBuffer;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = await res.arrayBuffer();
  } catch {
    el.textContent = s.error;
    return;
  }

  try {
    if (origHash && !hashesEqual(await sha256Hex(bytes.slice(0)), origHash)) {
      const alert = document.createElement('p');
      alert.className = 'sign-reader-alert';
      alert.setAttribute('role', 'alert');
      alert.textContent = s.hashMismatch;
      el.replaceChildren(alert);
    } else {
      el.replaceChildren();
    }
  } catch {
    el.replaceChildren();
  }

  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  let pdf: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  } catch {
    const alert = document.createElement('p');
    alert.className = 'sign-reader-alert';
    alert.setAttribute('role', 'alert');
    alert.textContent = s.error;
    el.append(alert);
    return;
  }

  // Paged mode (the audit page) turns pages like a book; continuous is the
  // /sign default and keeps the whole document scrollable.
  const paged = (el.dataset['mode'] ?? 'continuous') === 'paged';
  const total = pdf.numPages;
  const toolbar = document.createElement('div');
  toolbar.className = 'sign-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  const prev = button(s.pagePrev, 'prev', '‹');
  const next = button(s.pageNext, 'next', '›');
  // The page label announces turns to screen readers (aria-live); it is
  // also the label of the jump input, so the number can be typed to jump.
  const pageStatus = document.createElement('label');
  pageStatus.className = 'sign-toolbar-page';
  pageStatus.setAttribute('aria-live', 'polite');
  const gotoId = `sign-goto-${Math.random().toString(36).slice(2, 8)}`;
  pageStatus.setAttribute('for', gotoId);
  pageStatus.textContent = pageLabel(1, total, s.pageOf);
  const goto = document.createElement('input');
  goto.id = gotoId;
  goto.type = 'number';
  goto.min = '1';
  goto.max = String(total);
  goto.value = '1';
  goto.dataset['act'] = 'goto';
  goto.setAttribute('aria-label', s.pageGo);
  const zoomOut = button(s.zoomOut, 'zoom-out', '−');
  const zoomIn = button(s.zoomIn, 'zoom-in', '+');
  const fit = button(s.zoomFit, 'fit', s.zoomFit);
  const dl = document.createElement('a');
  dl.dataset['act'] = 'dl';
  dl.href = src;
  dl.setAttribute('download', '');
  dl.setAttribute('aria-label', s.pageDownload);
  dl.textContent = '⤓';
  toolbar.append(prev, pageStatus, goto, next, zoomOut, zoomIn, fit, dl);

  const sheets = document.createElement('div');
  sheets.className = 'sign-sheets';
  el.append(toolbar, sheets);

  // Fit-to-width is the default (phones included): the first page sets the
  // base scale, zoom multiplies it. A re-render keeps every sheet in sync.
  // Paged mode fits the whole page (width and height) instead, so at fit
  // the page shows without scrolling the document; zoomed in, the reader
  // pans inside the viewer.
  let baseScale = 1;
  let zoom = 1;
  let current = 1;
  const rendered = new Map<number, HTMLElement>();

  const syncPageUi = (): void => {
    pageStatus.textContent = pageLabel(current, total, s.pageOf);
    if (document.activeElement !== goto) goto.value = String(current);
  };

  const ensureSheet = (n: number): HTMLElement => {
    let sheet = rendered.get(n);
    if (!sheet) {
      sheet = document.createElement('section');
      sheet.className = 'sign-sheet';
      sheet.dataset['page'] = String(n);
      const num = document.createElement('p');
      num.className = 'sign-sheet-no';
      num.textContent = pageLabel(n, total, s.pageOf);
      sheet.append(num);
      sheets.append(sheet);
      rendered.set(n, sheet);
      if (!paged) {
        // Sheets must arrive in page order even when renders race.
        [...sheets.children]
          .sort((a, b) => Number((a as HTMLElement).dataset['page']) - Number((b as HTMLElement).dataset['page']))
          .forEach((c) => sheets.append(c));
      }
    }
    return sheet;
  };

  /** A link destination to a 1-based page, or null when it points nowhere
   *  usable. Never throws: unknown destinations keep the current page. */
  const resolveDestPage = async (dest: unknown): Promise<number | null> => {
    try {
      const explicit: unknown = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(explicit) || explicit.length === 0) return null;
      const idx = await pdf.getPageIndex(explicit[0] as never);
      return idx + 1;
    } catch {
      return null;
    }
  };

  const renderPage = async (n: number): Promise<void> => {
    const page = await pdf.getPage(n);
    // A stale turn (a second goTo before this render started) never paints:
    // only the current page may create or replace its sheet.
    if (paged && n !== current) return;
    const scale = baseScale * zoom;
    const viewport = page.getViewport({ scale });
    const sheet = ensureSheet(n);
    if (paged) {
      // One sheet only: pages that are not shown never render.
      for (const [k, other] of rendered) {
        if (k !== n) {
          other.remove();
          rendered.delete(k);
        }
      }
    }
    sheet.querySelectorAll('canvas, .sign-text-layer, .sign-link-overlay').forEach((c) => c.remove());

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = zoom > 1 ? `${viewport.height}px` : 'auto';
    canvas.style.maxWidth = zoom > 1 ? 'none' : '100%';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    await page.render({ canvasContext: ctx, viewport: viewport.clone({ scale: scale * dpr }) }).promise;

    const layer = document.createElement('div');
    layer.className = 'sign-text-layer';
    layer.style.setProperty('--scale-factor', String(viewport.scale));
    layer.style.width = `${viewport.width}px`;
    layer.style.height = `${viewport.height}px`;
    const textContent = await page.getTextContent();
    const textLayer = new pdfjs.TextLayer({
      textContentSource: textContent,
      container: layer,
      viewport,
    });
    await textLayer.render();
    sheet.prepend(canvas, layer);

    // Internal links: the report's own table of contents and
    // cross-references are Link annotations, not text, so without an
    // overlay they would be dead. Each destination gets a positioned tap
    // target; the `#page=N` click handler below routes it through `goTo`.
    // Never throws: a page without usable annotations gets no overlays.
    try {
      const withAnnots = page as unknown as { getAnnotations?: () => Promise<unknown[]> };
      const annots = typeof withAnnots.getAnnotations === 'function' ? await withAnnots.getAnnotations() : [];
      const rectOf = (viewport as unknown as { convertToViewportRectangle?: (rect: number[]) => number[] })
        .convertToViewportRectangle;
      if (Array.isArray(annots) && typeof rectOf === 'function') {
        for (const raw of annots) {
          const link = raw as { subtype?: unknown; url?: unknown; dest?: unknown; rect?: unknown };
          if (link.subtype !== 'Link' || link.url || link.dest === undefined || link.dest === null) continue;
          if (!Array.isArray(link.rect) || link.rect.length !== 4) continue;
          const corners = link.rect as unknown[];
          if (!corners.every((v): v is number => typeof v === 'number')) continue;
          const target = await resolveDestPage(link.dest);
          if (target === null || target < 1 || target > total) continue;
          // A later turn may have moved on while the destination resolved.
          if (paged && n !== current) return;
          const [qx1, qy1, qx2, qy2] = rectOf.call(viewport, corners);
          const overlay = document.createElement('a');
          overlay.href = `#page=${target}`;
          overlay.className = 'sign-link-overlay';
          overlay.setAttribute('aria-label', pageLabel(target, total, s.pageOf));
          overlay.style.left = `${Math.min(qx1, qx2)}px`;
          overlay.style.top = `${Math.min(qy1, qy2)}px`;
          overlay.style.width = `${Math.abs(qx2 - qx1)}px`;
          overlay.style.height = `${Math.abs(qy2 - qy1)}px`;
          sheet.append(overlay);
        }
      }
    } catch {
      // The page still reads; only its internal links stay inert.
    }
  };

  const renderAll = async (): Promise<void> => {
    for (let n = 1; n <= total; n++) await renderPage(n);
  };

  const goTo = (n: number): void => {
    const next = clampPage(n, total);
    current = next;
    syncPageUi();
    if (paged) {
      // One sheet only: the rest of the document never renders, the turn
      // keeps the zoom, and only the viewer scrolls — never the document.
      sheets.classList.add('is-turning');
      window.setTimeout(() => sheets.classList.remove('is-turning'), 170);
      void renderPage(current).then(() => {
        sheets.scrollTop = 0;
      });
    } else {
      rendered.get(current)?.scrollIntoView({ block: 'nearest' });
    }
  };

  const setZoom = async (z: number): Promise<void> => {
    zoom = Math.min(4, Math.max(0.5, z));
    sheets.classList.toggle('is-zoomed', zoom > 1);
    if (zoom === 1) measureBase();
    if (paged) {
      await renderPage(current);
    } else {
      // Sheets collapse while their canvases re-render, which can throw the
      // scroll position (and the observer-tracked page) elsewhere: hold the
      // reader's place so zooming never teleports the signer.
      const anchor = rendered.get(current);
      await renderAll();
      anchor?.scrollIntoView({ block: 'nearest' });
    }
  };

  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  zoomIn.addEventListener('click', () => void setZoom(zoom * 1.25));
  zoomOut.addEventListener('click', () => void setZoom(zoom / 1.25));
  fit.addEventListener('click', () => void setZoom(1));
  const commitGoto = (): void => {
    const n = parsePageInput(goto.value, total, current);
    goto.value = String(n);
    goTo(n);
  };
  goto.addEventListener('change', commitGoto);
  goto.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commitGoto();
      goto.blur();
    } else if (ev.key === 'Escape') {
      goto.value = String(current);
      goto.blur();
    }
  });
  el.tabIndex = 0;
  el.addEventListener('keydown', (ev) => {
    const t = ev.target as Element | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight' || ev.key === 'PageDown') goTo(current + 1);
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' || ev.key === 'PageUp') goTo(current - 1);
    else if (ev.key === 'Home') goTo(1);
    else if (ev.key === 'End') goTo(total);
    else if (ev.key === '+' || ev.key === '=') void setZoom(zoom * 1.25);
    else if (ev.key === '-' || ev.key === '_') void setZoom(zoom / 1.25);
    else if (ev.key === '0') void setZoom(1);
    else return;
    ev.preventDefault();
  });

  // A horizontal swipe turns the page on phones.
  let touchX: number | null = null;
  sheets.addEventListener('touchstart', (ev) => {
    touchX = ev.touches[0]?.clientX ?? null;
  }, { passive: true });
  sheets.addEventListener('touchend', (ev) => {
    const startX = touchX;
    touchX = null;
    // A zoomed reader pans inside the viewer; only an unzoomed swipe turns.
    if (startX === null || zoom !== 1) return;
    const dx = (ev.changedTouches[0]?.clientX ?? startX) - startX;
    if (Math.abs(dx) < 40) return;
    goTo(current + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // Links inside the PDF to its own sections go to the right page instead
  // of the dead `#page=N` / `#nameddest=` fragment default.
  sheets.addEventListener('click', (ev) => {
    const a = (ev.target as Element | null)?.closest?.('a[href^="#"]');
    if (!(a instanceof HTMLAnchorElement)) return;
    const frag = a.getAttribute('href') ?? '';
    const byPage = frag.match(/^#page=(\d+)$/);
    if (byPage) {
      ev.preventDefault();
      goTo(Number(byPage[1]));
      return;
    }
    const named = frag.match(/^#nameddest=(.+)$/);
    if (named) {
      ev.preventDefault();
      void pdf.getDestination(decodeURIComponent(named[1])).then(async (dest) => {
        if (!Array.isArray(dest) || dest.length === 0) return;
        try {
          const idx = await pdf.getPageIndex(dest[0] as never);
          goTo(idx + 1);
        } catch {
          // Unknown destination: stay on the current page.
        }
      }).catch(() => {});
    }
  });

  const probeRef: { viewport: { width: number; height: number } } = {
    viewport: { width: 1, height: 1 },
  };
  const measureBase = (): void => {
    const probeNow = probeRef.viewport;
    // Paged mode measures the sheet on screen, never a leftover page 1:
    // after a turn there is exactly one sheet, the current one.
    const anchor = paged ? current : 1;
    const sheet = rendered.get(anchor) ?? ensureSheet(anchor);
    const avail = sheet.clientWidth || sheets.clientWidth || el.clientWidth || probeNow.width;
    if (paged) {
      const availH = Math.max(1, Math.round((window.innerHeight || 900) * 0.7));
      baseScale = fitPage(avail, availH, probeNow.width, probeNow.height);
    } else {
      baseScale = fitScale(avail, probeNow.width);
    }
  };

  try {
    const first = await pdf.getPage(1);
    const probe = first.getViewport({ scale: 1 });
    probeRef.viewport = probe;
    measureBase();
    if (paged) {
      await renderPage(1);
      syncPageUi();
    } else {
      await renderAll();
      const seen = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const n = Number((e.target as HTMLElement).dataset['page']);
            if (n >= 1 && n <= total) {
              current = n;
              syncPageUi();
            }
          }
        },
        { rootMargin: '-40% 0% -40% 0%' },
      );
      rendered.forEach((sheet) => seen.observe(sheet));
    }
    let resizeTimer = 0;
    const onResize = (): void => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (zoom !== 1) return;
        measureBase();
        void (paged ? renderPage(current) : renderAll());
      }, 150);
    };
    window.addEventListener('resize', onResize);
  } catch {
    const alert = document.createElement('p');
    alert.className = 'sign-reader-alert';
    alert.setAttribute('role', 'alert');
    alert.textContent = s.error;
    sheets.replaceChildren(alert);
  }
}
