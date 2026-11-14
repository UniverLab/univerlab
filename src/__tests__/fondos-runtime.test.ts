import { hostCanvas, pointerIn, loop } from '../scripts/fondos/runtime';

describe('fondos runtime', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    delete (global as any).IntersectionObserver;
  });

  it('pointerIn reports host-relative coordinates', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 100, height: 50, right: 110, bottom: 70, x: 10, y: 20, toJSON: () => ({}) } as any);

    const onMove = jest.fn();
    const unsub = pointerIn(host, onMove);

    const ev = new Event('pointermove');
    Object.assign(ev, { clientX: 30, clientY: 40 });
    window.dispatchEvent(ev);

    expect(onMove).toHaveBeenCalledWith(20, 20);

    unsub();
    window.dispatchEvent(ev);
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('pointerIn stops reporting after unsubscribe', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as any);

    const onMove = jest.fn();
    const unsub = pointerIn(host, onMove);
    unsub();

    const ev = new Event('pointerdown');
    Object.assign(ev, { clientX: 50, clientY: 60 });
    window.dispatchEvent(ev);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('hostCanvas sizes the canvas from the host rect before appending it', () => {
    // A default 300x150 canvas appended first and resized after would move
    // the background after first paint; sizing before append keeps its place.
    // jsdom has no 2d context (the canvas npm package is not installed), so
    // the context call is stubbed: this test pins the sizing, not painting.
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as any);
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as any);
    // Capture the intrinsic size at the moment the canvas enters the DOM: the
    // default box (300x150) is also > 1, so only the exact value proves the
    // resize happened before the append and not after it.
    const appendChild = host.appendChild.bind(host);
    const appended: Array<{ w: number; h: number }> = [];
    (host as any).appendChild = (node: Node) => {
      if ((node as HTMLElement).tagName === 'CANVAS') {
        appended.push({ w: (node as HTMLCanvasElement).width, h: (node as HTMLCanvasElement).height });
      }
      return appendChild(node);
    };
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const { canvas, size } = hostCanvas(host);
    expect(appended).toEqual([{ w: Math.floor(800 * dpr), h: Math.floor(600 * dpr) }]);
    expect(canvas.parentElement).toBe(host);
    expect(size().w).toBe(800);
    expect(size().h).toBe(600);
    // Positive control: a zero-size host still yields a valid canvas.
    const empty = document.createElement('div');
    empty.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as any);
    const zero = hostCanvas(empty);
    expect(zero.canvas.width).toBeGreaterThanOrEqual(1);
    expect(zero.canvas.height).toBeGreaterThanOrEqual(1);
  });

  it('loop does not call the frame callback while the tab is hidden', () => {
    // Queue RAF callbacks so flushFrame() really runs whatever loop scheduled;
    // without that, a loop that ignored visibility would still look idle.
    let queued: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      queued.push(cb);
      return queued.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      queued = [];
    });
    const flushFrame = () => {
      const pending = queued;
      queued = [];
      pending.forEach((cb) => cb(0));
    };

    // IntersectionObserver reports the host on screen straight away.
    (global as any).IntersectionObserver = class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(host: Element) {
        this.cb([{ target: host, isIntersecting: true } as IntersectionObserverEntry], this as any);
      }
      unobserve() {}
      disconnect() {}
    };

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const frame = jest.fn();
    const stop = loop(host, frame);

    flushFrame();
    flushFrame();
    expect(frame).not.toHaveBeenCalled();

    // Positive control: once the tab is visible, the same loop does run.
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    flushFrame();
    expect(frame).toHaveBeenCalled();

    stop();
  });
});