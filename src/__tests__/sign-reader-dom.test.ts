/**
 * DOM tests for initReader: fit-to-width in continuous mode, and the paged
 * (book) mode the audit page uses — one sheet only, clamped turns, goto
 * jumps, zoom kept across turns — while the signing console keeps its
 * continuous scroll with every page rendered and observed.
 */
import { initReader } from '../lib/sign/reader';

let mockNumPages = 1;
const mockObserve = jest.fn();
const mockRender = jest.fn(() => ({ promise: Promise.resolve() }));
const mockTextRender = jest.fn(() => Promise.resolve());
const mockGetAnnotations = jest.fn(async (): Promise<unknown[]> => []);
const mockGetDestination = jest.fn(async (): Promise<unknown> => null);
const mockGetPageIndex = jest.fn(async (): Promise<number> => 0);
const mockPage = {
  getViewport: ({ scale }: { scale: number }) => ({
    width: 1120 * scale,
    height: 1450 * scale,
    scale,
    clone: ({ scale: s }: { scale: number }) => ({ width: 1120 * s, height: 1450 * s, scale: s }),
    convertToViewportRectangle: (rect: number[]): number[] => rect,
  }),
  getTextContent: jest.fn(async () => ({ items: [] })),
  getAnnotations: mockGetAnnotations,
  render: jest.fn(() => ({ promise: mockRender().promise })),
};

jest.mock(
  'pdfjs-dist',
  () => ({
    GlobalWorkerOptions: {},
    getDocument: jest.fn(() => ({
      promise: Promise.resolve({
        get numPages() {
          return mockNumPages;
        },
        getPage: jest.fn(async () => mockPage),
        getDestination: mockGetDestination,
        getPageIndex: mockGetPageIndex,
      }),
    })),
    TextLayer: jest.fn().mockImplementation(() => ({ render: mockTextRender })),
  }),
  { virtual: true },
);
jest.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => 'worker.js', { virtual: true });

describe('initReader fit-to-width and zoom', () => {
  const origFetch = global.fetch;
  const origIO = global.IntersectionObserver;
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  const origClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

  let sheetWidth = 680;
  let hostWidth = 1120;

  beforeEach(() => {
    document.body.innerHTML = '';
    sheetWidth = 680;
    hostWidth = 1120;
    mockNumPages = 1;
    mockObserve.mockClear();
    mockGetAnnotations.mockReset();
    mockGetAnnotations.mockResolvedValue([]);
    mockGetDestination.mockReset();
    mockGetDestination.mockResolvedValue(null);
    mockGetPageIndex.mockReset();
    mockGetPageIndex.mockResolvedValue(0);
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;
    global.IntersectionObserver = jest.fn(() => ({
      observe: mockObserve,
      disconnect: jest.fn(),
      unobserve: jest.fn(),
    })) as unknown as typeof IntersectionObserver;
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    Element.prototype.scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        if ((this as HTMLElement).classList?.contains('sign-sheet')) return sheetWidth;
        return hostWidth;
      },
    });
  });

  afterEach(() => {
    global.fetch = origFetch;
    global.IntersectionObserver = origIO;
    HTMLCanvasElement.prototype.getContext = origGetContext;
    if (origClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', origClientWidth);
  });

  const flush = async (): Promise<void> => {
    await new Promise((r) => setTimeout(r, 0));
  };

  const swipe = (el: HTMLElement, fromX: number, toX: number): void => {
    const sheets = el.querySelector('.sign-sheets') as HTMLElement;
    const start = new Event('touchstart', { bubbles: true });
    (start as unknown as { touches: { clientX: number }[] }).touches = [{ clientX: fromX }];
    sheets.dispatchEvent(start);
    const end = new Event('touchend', { bubbles: true });
    (end as unknown as { changedTouches: { clientX: number }[] }).changedTouches = [{ clientX: toX }];
    sheets.dispatchEvent(end);
  };

  it.each([360, 680, 1120, 1920])(
    'fits page canvas and text layer to the %dpx sheet even when host is wider',
    async (w) => {
      sheetWidth = Math.min(w, 680);
      hostWidth = w;
      const el = document.createElement('div');
      el.className = 'sign-reader';
      el.dataset['src'] = '/audits/s/assets/report.pdf';
      document.body.append(el);

      await initReader(el);

      const canvas = el.querySelector('.sign-sheet canvas') as HTMLCanvasElement;
      const layer = el.querySelector('.sign-text-layer') as HTMLElement;
      expect(canvas).not.toBeNull();
      expect(parseFloat(canvas.style.width)).toBeLessThanOrEqual(sheetWidth);
      expect(parseFloat(layer.style.width)).toBeLessThanOrEqual(sheetWidth);
      expect(canvas.style.maxWidth).toBe('100%');
    },
  );

  it('allows wider canvas when zoomed in and returns to sheet width on Fit', async () => {
    const el = document.createElement('div');
    el.className = 'sign-reader';
    el.dataset['src'] = '/audits/s/assets/report.pdf';
    document.body.append(el);

    await initReader(el);

    const zoomIn = el.querySelector('button[data-act="zoom-in"]') as HTMLButtonElement;
    const fit = el.querySelector('button[data-act="fit"]') as HTMLButtonElement;
    const sheets = el.querySelector('.sign-sheets') as HTMLElement;

    zoomIn.click();
    await flush();
    const zoomedCanvas = el.querySelector('.sign-sheet canvas') as HTMLCanvasElement;
    expect(sheets.classList.contains('is-zoomed')).toBe(true);
    expect(parseFloat(zoomedCanvas.style.width)).toBeGreaterThan(sheetWidth);
    expect(zoomedCanvas.style.maxWidth).toBe('none');

    fit.click();
    await flush();
    const fitCanvas = el.querySelector('.sign-sheet canvas') as HTMLCanvasElement;
    expect(sheets.classList.contains('is-zoomed')).toBe(false);
    expect(parseFloat(fitCanvas.style.width)).toBeLessThanOrEqual(sheetWidth);
    expect(fitCanvas.style.maxWidth).toBe('100%');
  });

  describe('paged (book) mode', () => {
    const openPaged = async (): Promise<HTMLElement> => {
      mockNumPages = 3;
      const el = document.createElement('div');
      el.className = 'sign-reader';
      el.dataset['mode'] = 'paged';
      el.dataset['src'] = '/audits/s/assets/report.pdf';
      document.body.append(el);
      await initReader(el);
      return el;
    };

    const status = (el: HTMLElement): string =>
      (el.querySelector('.sign-toolbar-page') as HTMLElement).textContent ?? '';

    const canvases = (el: HTMLElement): number =>
      el.querySelectorAll('.sign-sheet canvas').length;

    it('renders one sheet only and announces the page with a download link', async () => {
      const el = await openPaged();
      expect(canvases(el)).toBe(1);
      expect(el.querySelectorAll('.sign-sheet').length).toBe(1);
      expect(status(el)).toBe('Page 1 of 3');
      const live = el.querySelector('.sign-toolbar-page') as HTMLElement;
      expect(live.getAttribute('aria-live')).toBe('polite');
      const dl = el.querySelector('a[data-act="dl"]') as HTMLAnchorElement;
      expect(dl.getAttribute('href')).toBe('/audits/s/assets/report.pdf');
      expect(dl.getAttribute('aria-label')).toBeTruthy();
    });

    it('stays on the first page at prev and on the last page at next', async () => {
      const el = await openPaged();
      const prev = el.querySelector('button[data-act="prev"]') as HTMLButtonElement;
      const next = el.querySelector('button[data-act="next"]') as HTMLButtonElement;

      prev.click();
      await flush();
      expect(status(el)).toBe('Page 1 of 3');

      next.click();
      await flush();
      next.click();
      await flush();
      expect(status(el)).toBe('Page 3 of 3');
      next.click();
      await flush();
      expect(status(el)).toBe('Page 3 of 3');
      expect(canvases(el)).toBe(1);
    });

    it('jumps through the goto input and restores invalid jumps', async () => {
      const el = await openPaged();
      const input = el.querySelector('input[data-act="goto"]') as HTMLInputElement;

      input.value = '2';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
      expect(status(el)).toBe('Page 2 of 3');
      expect(canvases(el)).toBe(1);

      input.value = '99';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
      expect(status(el)).toBe('Page 2 of 3');

      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
      expect(status(el)).toBe('Page 2 of 3');
    });

    it('keeps the zoom across page turns', async () => {
      const el = await openPaged();
      const zoomIn = el.querySelector('button[data-act="zoom-in"]') as HTMLButtonElement;
      const next = el.querySelector('button[data-act="next"]') as HTMLButtonElement;

      zoomIn.click();
      await flush();
      const zoomedWidth = parseFloat(
        (el.querySelector('.sign-sheet canvas') as HTMLCanvasElement).style.width,
      );

      next.click();
      await flush();
      expect(status(el)).toBe('Page 2 of 3');
      expect(canvases(el)).toBe(1);
      expect(
        parseFloat((el.querySelector('.sign-sheet canvas') as HTMLCanvasElement).style.width),
      ).toBe(zoomedWidth);
    });

    it('moves with Home and End keys', async () => {
      const el = await openPaged();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await flush();
      expect(status(el)).toBe('Page 3 of 3');
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      await flush();
      expect(status(el)).toBe('Page 1 of 3');
    });

    it('turns to the page an internal link points at', async () => {
      mockGetAnnotations.mockResolvedValue([
        { subtype: 'Link', dest: [{ num: 5, gen: 0 }], rect: [10, 10, 110, 30] },
      ]);
      mockGetPageIndex.mockResolvedValue(2);
      const el = await openPaged();
      await flush();
      const overlay = el.querySelector('a.sign-link-overlay') as HTMLAnchorElement | null;
      expect(overlay?.getAttribute('href')).toBe('#page=3');
      overlay?.click();
      await flush();
      expect(status(el)).toBe('Page 3 of 3');
      expect(canvases(el)).toBe(1);
    });

    it('turns on an unzoomed horizontal swipe', async () => {
      const el = await openPaged();
      swipe(el, 200, 100);
      await flush();
      expect(status(el)).toBe('Page 2 of 3');
    });

    it('ignores a horizontal swipe while zoomed so the page can pan', async () => {
      const el = await openPaged();
      const zoomIn = el.querySelector('button[data-act="zoom-in"]') as HTMLButtonElement;
      zoomIn.click();
      await flush();
      swipe(el, 200, 100);
      await flush();
      expect(status(el)).toBe('Page 1 of 3');
    });
  });

  describe('continuous (signing console) mode', () => {
    it('still renders every page and observes each sheet', async () => {
      mockNumPages = 3;
      const el = document.createElement('div');
      el.className = 'sign-reader';
      el.dataset['id'] = 'req-1';
      document.body.append(el);

      await initReader(el);

      expect(el.querySelectorAll('.sign-sheet canvas').length).toBe(3);
      expect(mockObserve).toHaveBeenCalledTimes(3);
      expect((el.querySelector('.sign-toolbar-page') as HTMLElement).textContent).toBe(
        'Page 1 of 3',
      );
    });
  });
});
