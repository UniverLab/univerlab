/**
 * The page script of Plate I (src/scripts/cosmic-plate.ts), run in jsdom over
 * a fixture with the component's hooks: it drives scenes, captions, the time
 * marks and the coda from the scroll, and stays still under reduced motion.
 */
import { mountCosmicPlate } from '../scripts/cosmic-plate';
import { Z_END } from '../lib/cosmic-plate';

const CAPTIONS = {
  space: Array.from({ length: 8 }, (_, i) => [`scene ${i}`, `scale ${i}`]),
  time: Array.from({ length: 6 }, (_, i) => [`time ${i}`, `span ${i}`]),
};

function fixture(captions: string = JSON.stringify(CAPTIONS)): HTMLElement {
  document.body.innerHTML = `
    <figure data-cosmic>
      <div class="cosmic-track"><div class="cosmic-stage">
        <svg class="cosmic-svg">
          ${Array.from({ length: 8 }, (_, i) => `<g class="cs" data-i="${i}"></g>`).join('')}
          <g class="ct"><path class="tm tm-0"/><g class="tl tl-0"></g><path class="tm tm-4"/><g class="tm-lens"></g></g>
        </svg>
        <div class="cosmic-cap"><span class="cap-name"></span><span class="cap-scale"></span></div>
        <p class="cosmic-coda"></p><p class="cosmic-hint"></p>
      </div></div>
      <script type="application/json" data-cosmic-captions>${captions}</script>
    </figure>`;
  return document.querySelector('[data-cosmic]') as HTMLElement;
}

/** Puts the track so that the scroll progress through it is `p`. */
function scrollTo(track: HTMLElement, p: number): void {
  const height = 5000;
  const run = height - window.innerHeight;
  track.getBoundingClientRect = () => ({ top: -p * run, height, bottom: 0, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) });
}

let observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
let frames: FrameRequestCallback[] = [];
let reduced = false;

beforeEach(() => {
  observers = [];
  frames = [];
  reduced = false;
  (window as any).IntersectionObserver = class {
    constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void) { observers.push(cb); }
    observe() {}
  };
  window.matchMedia = ((q: string) => ({ matches: reduced && q.includes('reduce') })) as any;
  window.requestAnimationFrame = (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; };
});

const flush = () => { const run = frames; frames = []; run.forEach((f) => f(0)); };
const scene = (i: number) => document.querySelectorAll<SVGGElement>('.cs')[i];
const text = (sel: string) => document.querySelector(sel)!.textContent;

describe('cosmic plate script', () => {
  it('starts on the observer, live, with the first caption', () => {
    const root = fixture();
    scrollTo(root.querySelector('.cosmic-track')!, 0);
    mountCosmicPlate();
    expect(root.hasAttribute('data-live')).toBe(true);
    expect(Number(scene(0).style.opacity)).toBe(1);
    expect(scene(3).style.visibility).toBe('hidden');
    expect(text('.cap-name')).toBe('scene 0');
    expect(text('.cap-scale')).toBe('scale 0');
  });

  it('pulls back with the scroll, but only while the plate is on screen', () => {
    const root = fixture();
    const track = root.querySelector<HTMLElement>('.cosmic-track')!;
    scrollTo(track, 0);
    mountCosmicPlate();
    scrollTo(track, 3 / Z_END);
    window.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(0);
    observers.forEach((cb) => cb([{ isIntersecting: true }]));
    flush();
    expect(Number(scene(3).style.opacity)).toBe(1);
    expect(scene(3).getAttribute('transform')).toBe('scale(1.0000)');
    expect(text('.cap-name')).toBe('scene 3');
    expect(document.querySelector('.cosmic-hint')!.classList.contains('off')).toBe(true);
  });

  it('reveals the time marks, the lens and the coda at the end', () => {
    const root = fixture();
    const track = root.querySelector<HTMLElement>('.cosmic-track')!;
    scrollTo(track, 1);
    mountCosmicPlate();
    expect((document.querySelector('.tm-0') as SVGElement).style.opacity).toBe('1');
    expect((document.querySelector('.tm-lens') as SVGElement).style.opacity).toBe('1');
    expect(document.querySelector('.cosmic-coda')!.classList.contains('on')).toBe(true);
    expect(text('.cap-name')).toBe('time 5');
    expect(scene(0).style.visibility).toBe('hidden');
  });

  it('crops a portrait plate and fits the time rule to the visible width', () => {
    const root = fixture();
    const svg = root.querySelector<SVGSVGElement>('.cosmic-svg')!;
    svg.getBoundingClientRect = () => ({ width: 320, height: 400 } as DOMRect);
    scrollTo(root.querySelector('.cosmic-track')!, 0);
    mountCosmicPlate();
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid slice');
    expect(root.querySelector('.ct')!.getAttribute('transform')).toBe('translate(0 70) scale(0.533)');
    svg.getBoundingClientRect = () => ({ width: 1000, height: 640 } as DOMRect);
    window.dispatchEvent(new Event('resize'));
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('holds still on the Milky Way under reduced motion', () => {
    reduced = true;
    const root = fixture();
    scrollTo(root.querySelector('.cosmic-track')!, 0);
    mountCosmicPlate();
    expect(root.hasAttribute('data-live')).toBe(false);
    expect(Number(scene(4).style.opacity)).toBe(1);
    expect(text('.cap-name')).toBe('scene 4');
  });

  it('still runs without captions, and does nothing without the plate', () => {
    const root = fixture('{oops');
    scrollTo(root.querySelector('.cosmic-track')!, 0);
    expect(() => mountCosmicPlate()).not.toThrow();
    expect(text('.cap-name')).toBe('');
    document.body.innerHTML = '';
    expect(() => mountCosmicPlate()).not.toThrow();
  });
});
