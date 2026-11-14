// The newspaper sheet edge cases: reduced-motion jumps, breakpoint
// activate/deactivate, Escape, wheel without ctrl, pinch zoom, pointercancel,
// single vs double taps, drag click-suppression (real vs keyboard clicks),
// the idle Fit button, the zero-width font fallback and height-only resizes.
import { initPaperSheet } from '../lib/paper-sheet';

const SHEET_W = 1096; // 68.5rem at 16px
const SHEET_H = 2000;
const VIEW_W = 390;

const changes: (() => void)[] = [];
let desktop = false;
let reduced = false;

function stubMatchMedia(): void {
  window.matchMedia = ((query: string) => {
    const isDesktop = query.includes('min-width: 64rem');
    const isReduced = query.includes('prefers-reduced-motion');
    return {
      get matches() { return isDesktop ? desktop : isReduced && reduced; },
      media: query,
      addEventListener: (type: string, fn: () => void) => { if (type === 'change') changes.push(fn); },
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    };
  }) as unknown as typeof window.matchMedia;
}

function mount(width = SHEET_W): { viewport: HTMLElement; sheet: HTMLElement; button: HTMLButtonElement } {
  document.body.innerHTML =
    '<div class="paper-viewport" data-paper-viewport>' +
    '<div class="paper-sheet" data-paper-sheet><div class="paper"></div></div>' +
    '<button class="paper-fit" data-paper-fit type="button" hidden>Fit</button>' +
    '</div>';
  const viewport = document.querySelector('[data-paper-viewport]') as HTMLElement;
  const sheet = document.querySelector('[data-paper-sheet]') as HTMLElement;
  const button = document.querySelector('[data-paper-fit]') as HTMLButtonElement;
  Object.defineProperty(viewport, 'clientWidth', { value: VIEW_W, configurable: true });
  Object.defineProperty(viewport, 'clientHeight', { value: 600, configurable: true });
  Object.defineProperty(sheet, 'offsetWidth', { value: width, configurable: true });
  Object.defineProperty(sheet, 'offsetHeight', { value: SHEET_H, configurable: true });
  viewport.getBoundingClientRect = () => ({ left: 0, top: 0, right: VIEW_W, bottom: 600, width: VIEW_W, height: 600, x: 0, y: 0, toJSON: () => {} });
  return { viewport, sheet, button };
}

function pointer(type: string, id: number, x: number, y: number): Event {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId: id, clientX: x, clientY: y,
  });
}

function scaleOf(transform: string): number {
  return Number(/scale\(([\d.]+)\)/.exec(transform)?.[1]);
}

function wheel(ctrl: boolean): Event {
  return Object.assign(new Event('wheel', { bubbles: true, cancelable: true }), {
    ctrlKey: ctrl, metaKey: false, deltaY: -100, clientX: 200, clientY: 300,
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  changes.length = 0;
  desktop = false;
  reduced = false;
  stubMatchMedia();
  jest.useRealTimers();
});

describe('paper sheet reduced motion and breakpoints', () => {
  it('jumps without a transition when reduced motion is on', () => {
    reduced = true;
    const { sheet } = mount();
    initPaperSheet(document);
    const fit = VIEW_W / SHEET_W;
    expect(scaleOf(sheet.style.transform)).toBeCloseTo(fit, 4);
    expect(sheet.style.transition).toBe('');
  });

  it('deactivates when the breakpoint flips to desktop and back', () => {
    const { viewport, sheet, button } = mount();
    initPaperSheet(document);
    expect(viewport.classList.contains('sheet')).toBe(true);
    desktop = true;
    changes.forEach((fn) => fn());
    expect(viewport.classList.contains('sheet')).toBe(false);
    expect(button.hidden).toBe(true);
    expect(sheet.style.transform).toBe('');
    desktop = false;
    changes.forEach((fn) => fn());
    expect(viewport.classList.contains('sheet')).toBe(true);
    expect(button.hidden).toBe(false);
  });

  it('refits on breakpoint re-entry while already active', () => {
    const { sheet } = mount();
    initPaperSheet(document);
    const before = sheet.style.transform;
    changes.forEach((fn) => fn());
    expect(sheet.style.transform).toBe(before);
    expect(scaleOf(sheet.style.transform)).toBeCloseTo(VIEW_W / SHEET_W, 4);
  });
});

describe('paper sheet keys, wheel and fit', () => {
  it('Escape returns a zoomed sheet to fitted width', () => {
    const { viewport, sheet } = mount();
    initPaperSheet(document);
    viewport.dispatchEvent(wheel(true));
    expect(scaleOf(sheet.style.transform)).toBeGreaterThan(VIEW_W / SHEET_W);
    viewport.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(scaleOf(sheet.style.transform)).toBeCloseTo(VIEW_W / SHEET_W, 4);
  });

  it('other keys do nothing', () => {
    const { viewport, sheet } = mount();
    initPaperSheet(document);
    viewport.dispatchEvent(wheel(true));
    const zoomed = sheet.style.transform;
    viewport.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(sheet.style.transform).toBe(zoomed);
  });

  it('wheel without ctrl or meta never zooms', () => {
    const { viewport, sheet } = mount();
    initPaperSheet(document);
    const fitted = sheet.style.transform;
    viewport.dispatchEvent(wheel(false));
    expect(sheet.style.transform).toBe(fitted);
  });

  it('the Fit button is idle when the sheet is inactive', () => {
    desktop = true;
    const { button, sheet } = mount();
    initPaperSheet(document);
    button.click();
    expect(sheet.style.transform).toBe('');
    expect(button.hidden).toBe(true);
  });

  it('falls back to the root font size when the sheet reports no width', () => {
    const { sheet } = mount(0);
    expect(() => initPaperSheet(document)).not.toThrow();
    expect(Number.isFinite(scaleOf(sheet.style.transform))).toBe(true);
    expect(scaleOf(sheet.style.transform)).toBeGreaterThan(0);
  });

  it('the Fit button jumps straight back when reduced motion is on', () => {
    reduced = true;
    const { viewport, sheet, button } = mount();
    initPaperSheet(document);
    viewport.dispatchEvent(Object.assign(new Event('wheel', { bubbles: true, cancelable: true }), {
      ctrlKey: true, deltaY: -100, clientX: 200, clientY: 300,
    }));
    button.click();
    expect(sheet.style.transition).toBe('');
    expect(scaleOf(sheet.style.transform)).toBeCloseTo(VIEW_W / SHEET_W, 4);
  });

  it('observes viewport resizes when ResizeObserver exists', () => {
    const box: { fn: (() => void) | null } = { fn: null };
    (window as unknown as { ResizeObserver?: unknown })['ResizeObserver'] = jest.fn().mockImplementation(
      (cb: () => void) => ({ observe: () => { box.fn = cb; }, unobserve: () => {}, disconnect: () => {} }));
    const { viewport, sheet } = mount();
    initPaperSheet(document);
    expect(box.fn).not.toBe(null);
    Object.defineProperty(viewport, 'clientWidth', { value: 500, configurable: true });
    box.fn?.();
    expect(scaleOf(sheet.style.transform)).toBeCloseTo(500 / SHEET_W, 4);
    delete (window as unknown as { ResizeObserver?: unknown })['ResizeObserver'];
  });
});

describe('paper sheet gestures', () => {
  it('pinch-out grows the scale', () => {
    const { viewport, sheet } = mount();
    initPaperSheet(document);
    const fit = VIEW_W / SHEET_W;
    viewport.dispatchEvent(pointer('pointerdown', 1, 100, 300));
    viewport.dispatchEvent(pointer('pointerdown', 2, 200, 300));
    viewport.dispatchEvent(pointer('pointermove', 2, 260, 300));
    expect(scaleOf(sheet.style.transform)).toBeGreaterThan(fit);
  });

  it('pointercancel ends the gesture without zooming', () => {
    const { viewport, sheet } = mount();
    initPaperSheet(document);
    const fitted = sheet.style.transform;
    viewport.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    viewport.dispatchEvent(pointer('pointercancel', 1, 100, 100));
    viewport.dispatchEvent(pointer('pointerup', 1, 100, 100));
    expect(sheet.style.transform).toBe(fitted);
  });

  it('double-tap zooms in and a second double-tap zooms back out', () => {
    const { viewport, sheet } = mount();
    initPaperSheet(document);
    const fit = VIEW_W / SHEET_W;
    const tap = (x: number, y: number): void => {
      viewport.dispatchEvent(pointer('pointerdown', 1, x, y));
      viewport.dispatchEvent(pointer('pointerup', 1, x, y));
    };
    tap(200, 300);
    tap(200, 300);
    expect(scaleOf(sheet.style.transform)).toBeGreaterThan(fit * 2);
    tap(200, 300);
    tap(200, 300);
    expect(scaleOf(sheet.style.transform)).toBeCloseTo(fit, 4);
  });

  it('a slow press is not a tap and never zooms', () => {
    const { viewport, sheet } = mount();
    initPaperSheet(document);
    const fitted = sheet.style.transform;
    const now = Date.now();
    viewport.dispatchEvent(pointer('pointerdown', 1, 200, 300));
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now + 1000);
    try {
      viewport.dispatchEvent(pointer('pointerup', 1, 200, 300));
    } finally {
      spy.mockRestore();
    }
    expect(sheet.style.transform).toBe(fitted);
  });

  it('a drag suppresses the real click but never a keyboard click', () => {
    const { viewport } = mount();
    initPaperSheet(document);
    const onClick = jest.fn();
    viewport.addEventListener('click', onClick);
    viewport.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    viewport.dispatchEvent(pointer('pointermove', 1, 300, 100));
    viewport.dispatchEvent(pointer('pointerup', 1, 300, 100));
    const blocked = viewport.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(blocked).toBe(false);
    const keyboard = viewport.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    expect(keyboard).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the fitted scale across a height-only resize', () => {
    const { viewport, sheet } = mount();
    initPaperSheet(document);
    Object.defineProperty(viewport, 'clientHeight', { value: 700, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(scaleOf(sheet.style.transform)).toBeCloseTo(VIEW_W / SHEET_W, 4);
    expect(viewport.style.height).not.toBe('');
  });
});
