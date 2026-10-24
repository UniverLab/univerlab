/**
 * Brass loupe over the demo videos (DemoFigure.astro + lupa.svg).
 * Astro components are not renderable in Jest, so these read the source
 * as text (machine-plate.test.ts style). Each assertion breaks if the
 * plain white ring returns.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEMO = readFileSync(resolve(__dirname, '../components/DemoFigure.astro'), 'utf8');
const LUPA = readFileSync(resolve(__dirname, '../../public/bench/identidad/lupa.svg'), 'utf8');

describe('demo loupe: asset', () => {
  it('is a 330 box whose lens circle is 220 wide, centred on (150,150)', () => {
    expect(LUPA).toContain('viewBox="0 0 330 330"');
    expect(LUPA).toMatch(/cx="150" cy="150" r="124"/);
    expect(LUPA).toMatch(/cx="150" cy="150" r="110"/);
  });

  it('is dark brass with hatching, fixed for day and night', () => {
    expect(LUPA).toContain('#2a2118');
    expect(LUPA).toContain('#a07c3a');
  });
});

describe('demo loupe: markup', () => {
  it('draws the loupe image over the lens, decorative and pointer-transparent', () => {
    expect(DEMO).toContain('/bench/identidad/lupa.svg');
    expect(DEMO).toContain('class="demo-loupe"');
    expect(DEMO).toContain('alt=""');
    expect(DEMO).toContain('aria-hidden="true"');
  });

  it('keeps the zoom layer separate from the overlay so the ring never scales the zoom', () => {
    expect(DEMO).toContain('demo-lens-inner');
    const lensBlock = DEMO.slice(DEMO.indexOf('<div class="demo-lens"'));
    expect(lensBlock.indexOf('demo-lens-inner')).toBeLessThan(lensBlock.indexOf('demo-loupe'));
  });
});

describe('demo loupe: css', () => {
  it('sizes the loupe so its lens circle matches the 220px lens diameter', () => {
    expect(DEMO).toMatch(/\.demo-loupe\s*\{[^}]*width:\s*330px/);
    expect(DEMO).toMatch(/\.demo-loupe\s*\{[^}]*height:\s*330px/);
    expect(DEMO).toMatch(/\.demo-loupe\s*\{[^}]*left:\s*-40px/);
    expect(DEMO).toMatch(/\.demo-loupe\s*\{[^}]*top:\s*-40px/);
  });

  it('never intercepts pointer events and never recolours with the theme', () => {
    expect(DEMO).toMatch(/\.demo-loupe\s*\{[^}]*pointer-events:\s*none/);
    expect(DEMO).toMatch(/\.demo-loupe\s*\{[^}]*filter:\s*none/);
    expect(DEMO).toMatch(/\.demo-loupe\s*\{[^}]*max-width:\s*none/);
  });

  it('has no white ring border or shadow left on the lens', () => {
    expect(DEMO).not.toMatch(/\.demo-lens\s*\{[^}]*border:\s*2px solid rgba\(255,\s*255,\s*255/);
    expect(DEMO).not.toMatch(/\.demo-lens\s*\{[^}]*box-shadow:\s*0 0 0 1px rgba\(0,0,0/);
    expect(DEMO).toMatch(/\.demo-lens\s*\{[^}]*overflow:\s*visible/);
  });

  it('clips the zoomed video inside the inner circle', () => {
    expect(DEMO).toMatch(/\.demo-lens-inner\s*\{[^}]*overflow:\s*hidden/);
    expect(DEMO).toMatch(/\.demo-lens-inner\s*\{[^}]*border-radius:\s*50%/);
  });

  it('aligns the SVG lens circle with the magnified area within 1px', () => {
    // Reads the values the browser will use instead of restating them, so any
    // drift in image size or offset is caught here.
    const blockOf = (sel: string) => DEMO.match(new RegExp(`\\${sel} \\{[^}]*\\}`))![0];
    const pxOf = (sel: string, prop: string) =>
      Number(blockOf(sel).match(new RegExp(`${prop}:\\s*(-?[\\d.]+)px`))![1]);

    const lensDia = pxOf('.demo-lens', 'width');
    const imgW = pxOf('.demo-loupe', 'width');
    const imgH = pxOf('.demo-loupe', 'height');
    const left = pxOf('.demo-loupe', 'left');
    const top = pxOf('.demo-loupe', 'top');

    // Asset geometry: square box, transparent lens circle (r=110) at (150,150).
    const box = Number(LUPA.match(/viewBox="0 0 (\d+) (\d+)"/)![1]);
    const hole = LUPA.match(/<circle cx="(\d+)" cy="(\d+)" r="110"/)!;
    const [cx, cy, r] = [Number(hole[1]), Number(hole[2]), 110];
    expect(box).toBe(imgW);
    expect(imgH).toBe(imgW);

    const scale = imgW / box;
    // Drawn hole diameter equals the lens diameter.
    expect(Math.abs(2 * r * scale - lensDia)).toBeLessThanOrEqual(1);
    // Drawn hole centre sits on the lens centre, inside the lens box.
    expect(Math.abs(left + cx * scale - lensDia / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(top + cy * scale - lensDia / 2)).toBeLessThanOrEqual(1);
    // And the transparent hole is the 220/330 of the box the spec names.
    expect(Math.abs((2 * r) / box - 220 / 330)).toBeLessThan(0.001);
  });
});

describe('demo loupe: behaviour', () => {
  it('keeps the 220px lens size and follow logic', () => {
    expect(DEMO).toMatch(/var LENS_SIZE = 220/);
    expect(DEMO).toContain('LENS_SIZE / 2');
  });

  it('keeps the reduced-motion early return', () => {
    expect(DEMO).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(DEMO).toContain('video.controls = true');
  });
});
