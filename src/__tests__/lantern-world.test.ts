/**
 * Lantern world mode must unmount cleanly: after leaving the screen, no
 * canvas, listener or animation frame of the world may remain. Uses the real
 * runtime (pointerIn/loop/hostCanvas), not mocks — a world that leaked a
 * window listener or kept its canvas would fail here.
 */
import { mount } from '../scripts/fondos/gitkit';
import { mount as mountReduced } from '../scripts/fondos/texforge';

const rect = (w = 100, h = 80) =>
  ({
    left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

describe('lantern world unmount', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('destroy() removes the canvas and the runtime listeners', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.getBoundingClientRect = () => rect();

    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const docRemoveSpy = jest.spyOn(document, 'removeEventListener');
    const fondo = mount(host, { night: false, reduced: false, base: '/bench/fondos/gitkit/' });

    // The world painted into the host …
    expect(host.querySelector('canvas')).not.toBeNull();

    // … and reacts to the cursor through the runtime's pointerIn, which
    // reports coordinates relative to the host (no forwarding needed).
    const move = new Event('pointermove');
    Object.assign(move, { clientX: 10, clientY: 10 });
    expect(() => window.dispatchEvent(move)).not.toThrow();

    fondo.destroy();

    // No canvas of the world remains in the host …
    expect(host.querySelector('canvas')).toBeNull();
    expect(host.childNodes.length).toBe(0);

    // … and the runtime's listeners are gone with it (pointer tracking on
    // window, the tab-visibility guard on document).
    const removed = removeSpy.mock.calls.map((call) => call[0]);
    expect(removed).toContain('pointermove');
    expect(removed).toContain('pointerdown');
    const docRemoved = docRemoveSpy.mock.calls.map((call) => call[0]);
    expect(docRemoved).toContain('visibilitychange');

    // A later cursor move reaches no world and throws nothing.
    expect(() => window.dispatchEvent(move)).not.toThrow();
  });

  it('a reduced-motion world paints its still frame and destroys cleanly', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.getBoundingClientRect = () => rect();

    const fondo = mountReduced(host, { night: false, reduced: true, base: '/bench/fondos/texforge/' });
    // The still engraving is in the host …
    expect(host.childNodes.length).toBeGreaterThan(0);

    fondo.setNight(true);
    fondo.destroy();
    expect(host.childNodes.length).toBe(0);
  });
});
