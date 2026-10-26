/**
 * The mail's engraved art: the fixed SVG constants, the postmark's ring text,
 * the foxing layer, the deckle polygon on an element, and the animation
 * fallback when the Web Animations API is absent.
 */
import { ENVELOPE, FRONT, FLAP, postmarkSVG, spots, deckle, anim } from '../scripts/mail-svg';

describe('the engraved parts', () => {
  it('the three shell svgs carry their art', () => {
    for (const svg of [ENVELOPE, FRONT, FLAP]) expect(svg).toContain('<svg');
  });
  it('the postmark repeats its ring text and stamps the mark and year', () => {
    const svg = postmarkSVG('UNIVERLAB', 'UL', '2026', 'day');
    expect(svg).toContain('pm-day');
    expect(svg).toContain('UNIVERLAB · UNIVERLAB');
    expect(svg).toContain('>UL<');
    expect(svg).toContain('>2026<');
  });
  it('spots paints nine blots and a tide line', () => {
    const css = spots();
    expect(css.split('radial-gradient').length).toBe(11); // 9 + tide + the split seam
  });
  it('deckle measures a polygon off the element box', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: 14 });
    Object.defineProperty(el, 'offsetHeight', { value: 7 });
    deckle(el);
    const poly = el.style.getPropertyValue('--deckle');
    expect(poly.startsWith('polygon(')).toBe(true);
    expect(poly).toContain('100%');
  });
  it('anim resolves without the Web Animations API', async () => {
    const plain = document.createElement('div');
    await expect(anim(plain, [], {})).resolves.toBeUndefined();
  });
  it('anim waits for the animation to finish', async () => {
    const el = document.createElement('div');
    let settled = false;
    (el as any).animate = () => ({
      finished: new Promise((res) => setTimeout(() => { settled = true; res(undefined); }, 0)),
    });
    await anim(el, [{ opacity: 0 }], { duration: 1 });
    expect(settled).toBe(true);
  });
});
