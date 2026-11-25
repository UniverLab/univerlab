/**
 * DOM tests for initReader: verifies fit-to-width measures the constrained
 * `.sign-sheet` column rather than the wider `.sign-reader` host, and that
 * zooming in allows horizontal scrolling while Fit returns to sheet width.
 */
import { initReader } from '../lib/sign/reader';

const mockRender = jest.fn(() => ({ promise: Promise.resolve() }));
const mockTextRender = jest.fn(() => Promise.resolve());
const mockPage = {
  getViewport: ({ scale }: { scale: number }) => ({
    width: 1120 * scale,
    height: 1450 * scale,
    scale,
    clone: ({ scale: s }: { scale: number }) => ({ width: 1120 * s, height: 1450 * s, scale: s }),
  }),
  getTextContent: jest.fn(async () => ({ items: [] })),
  render: jest.fn(() => ({ promise: mockRender().promise })),
};

jest.mock(
  'pdfjs-dist',
  () => ({
    GlobalWorkerOptions: {},
    getDocument: jest.fn(() => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: jest.fn(async () => mockPage),
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
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch;
    global.IntersectionObserver = jest.fn(() => ({
      observe: jest.fn(),
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
    await new Promise((r) => setTimeout(r, 0));
    const zoomedCanvas = el.querySelector('.sign-sheet canvas') as HTMLCanvasElement;
    expect(sheets.classList.contains('is-zoomed')).toBe(true);
    expect(parseFloat(zoomedCanvas.style.width)).toBeGreaterThan(sheetWidth);
    expect(zoomedCanvas.style.maxWidth).toBe('none');

    fit.click();
    await new Promise((r) => setTimeout(r, 0));
    const fitCanvas = el.querySelector('.sign-sheet canvas') as HTMLCanvasElement;
    expect(sheets.classList.contains('is-zoomed')).toBe(false);
    expect(parseFloat(fitCanvas.style.width)).toBeLessThanOrEqual(sheetWidth);
    expect(fitCanvas.style.maxWidth).toBe('100%');
  });
});
