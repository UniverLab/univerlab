import { mount } from '../scripts/fondos/canopy';
import { hostCanvas, pointerIn, loop, loadImage } from '../scripts/fondos/runtime';

jest.mock('../scripts/fondos/runtime', () => ({
  hostCanvas: jest.fn(),
  pointerIn: jest.fn(),
  loop: jest.fn(),
  loadImage: jest.fn(),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('canopy fondo, reduced motion', () => {
  let ctx: { setTransform: jest.Mock; clearRect: jest.Mock; drawImage: jest.Mock };
  let resizeCallbacks: Array<() => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = { setTransform: jest.fn(), clearRect: jest.fn(), drawImage: jest.fn() };
    (hostCanvas as jest.Mock).mockReturnValue({
      canvas: document.createElement('canvas'),
      ctx,
      size: () => ({ w: 100, h: 100, dpr: 1 }),
    });
    (loadImage as jest.Mock).mockResolvedValue({ naturalWidth: 200, naturalHeight: 200 });
    resizeCallbacks = [];
    (global as any).ResizeObserver = class {
      constructor(cb: () => void) {
        resizeCallbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    delete (global as any).ResizeObserver;
  });

  it('attaches no pointer handler and no frame loop', () => {
    mount(document.createElement('div'), { night: false, reduced: true, base: '/bench/fondos/canopy/' });
    expect(pointerIn).not.toHaveBeenCalled();
    expect(loop).not.toHaveBeenCalled();
  });

  it('paints the still engraving once it loads', async () => {
    mount(document.createElement('div'), { night: false, reduced: true, base: '/bench/fondos/canopy/' });
    await flush();
    expect(loadImage).toHaveBeenCalledWith('/bench/fondos/canopy/panal.webp');
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it('repaints the still after a resize clears the canvas', async () => {
    mount(document.createElement('div'), { night: false, reduced: true, base: '/bench/fondos/canopy/' });
    await flush();
    resizeCallbacks.forEach((cb) => cb());
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });
});
