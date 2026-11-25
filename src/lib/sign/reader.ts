// Self-hosted PDF reader for the signing page: every page renders as a
// paper sheet in the site's style (no native-viewer iframe, which cannot be
// styled). pdfjs-dist is pinned exact in package.json and its worker ships
// from the site via a `?url` import, so the bundle loads only on signing
// pages (dynamic import from sign-shell.astro). The text layer stays
// selectable; the SHA-256 of the fetched bytes is checked against the
// request's original hash and a mismatch shows an error, never a silent
// render of other bytes.

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

/** Resolve the PDF URL for a `.sign-reader` element: the audit page passes
 *  `data-src` (no `data-orig-hash`, so no hash check), while `/sign` keeps
 *  passing `data-id`/`data-orig-hash`. Pure, tested. */
export function resolveReaderSrc(d: DOMStringMap): string {
  return d['src'] || (d['id'] ? `/api/sign-file?id=${encodeURIComponent(d['id'])}` : '');
}

/** Render every page of the request's PDF into `el`. Never throws: failures
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

  const total = pdf.numPages;
  const toolbar = document.createElement('div');
  toolbar.className = 'sign-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  const prev = button(s.pagePrev, 'prev', '‹');
  const next = button(s.pageNext, 'next', '›');
  const pageNow = document.createElement('span');
  pageNow.className = 'sign-toolbar-page';
  pageNow.setAttribute('aria-live', 'polite');
  pageNow.textContent = pageLabel(1, total, s.pageOf);
  const zoomOut = button(s.zoomOut, 'zoom-out', '−');
  const zoomIn = button(s.zoomIn, 'zoom-in', '+');
  const fit = button(s.zoomFit, 'fit', s.zoomFit);
  toolbar.append(prev, pageNow, next, zoomOut, zoomIn, fit);

  const sheets = document.createElement('div');
  sheets.className = 'sign-sheets';
  el.append(toolbar, sheets);

  // Fit-to-width is the default (phones included): the first page sets the
  // base scale, zoom multiplies it. A re-render keeps every sheet in sync.
  let baseScale = 1;
  let zoom = 1;
  let current = 1;
  const rendered = new Map<number, HTMLElement>();

  const renderPage = async (n: number): Promise<void> => {
    const page = await pdf.getPage(n);
    const scale = baseScale * zoom;
    const viewport = page.getViewport({ scale });
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
      // Sheets must arrive in page order even when renders race.
      [...sheets.children]
        .sort((a, b) => Number((a as HTMLElement).dataset['page']) - Number((b as HTMLElement).dataset['page']))
        .forEach((c) => sheets.append(c));
    }
    sheet.querySelectorAll('canvas, .sign-text-layer').forEach((c) => c.remove());

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
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
  };

  const renderAll = async (): Promise<void> => {
    for (let n = 1; n <= total; n++) await renderPage(n);
  };

  const goTo = (n: number): void => {
    current = Math.min(total, Math.max(1, n));
    pageNow.textContent = pageLabel(current, total, s.pageOf);
    rendered.get(current)?.scrollIntoView({ block: 'nearest' });
  };

  const setZoom = async (z: number): Promise<void> => {
    zoom = Math.min(4, Math.max(0.5, z));
    // Sheets collapse while their canvases re-render, which can throw the
    // scroll position (and the observer-tracked page) elsewhere: hold the
    // reader's place so zooming never teleports the signer.
    const anchor = rendered.get(current);
    await renderAll();
    anchor?.scrollIntoView({ block: 'nearest' });
  };

  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  zoomIn.addEventListener('click', () => void setZoom(zoom * 1.25));
  zoomOut.addEventListener('click', () => void setZoom(zoom / 1.25));
  fit.addEventListener('click', () => void setZoom(1));
  el.tabIndex = 0;
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight' || ev.key === 'PageDown') goTo(current + 1);
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' || ev.key === 'PageUp') goTo(current - 1);
    else if (ev.key === '+' || ev.key === '=') void setZoom(zoom * 1.25);
    else if (ev.key === '-' || ev.key === '_') void setZoom(zoom / 1.25);
    else return;
    ev.preventDefault();
  });

  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const n = Number((e.target as HTMLElement).dataset['page']);
        if (n >= 1 && n <= total) {
          current = n;
          pageNow.textContent = pageLabel(current, total, s.pageOf);
        }
      }
    },
    { rootMargin: '-40% 0px -40% 0px' },
  );

  try {
    const first = await pdf.getPage(1);
    const probe = first.getViewport({ scale: 1 });
    const width = el.clientWidth || probe.width;
    baseScale = width / probe.width;
    await renderAll();
    rendered.forEach((sheet) => seen.observe(sheet));
  } catch {
    const alert = document.createElement('p');
    alert.className = 'sign-reader-alert';
    alert.setAttribute('role', 'alert');
    alert.textContent = s.error;
    sheets.replaceChildren(alert);
  }
}


