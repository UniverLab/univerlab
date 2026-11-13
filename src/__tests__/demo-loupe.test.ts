/**
 * Brass loupe over the demo videos (DemoFigure.astro + lupa.svg).
 * Astro components are not renderable in Jest, so these read the source
 * as text (machine-plate.test.ts style). Each assertion breaks if the
 * plain white ring returns.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
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

  it('keeps the lens hole transparent so the magnified video shows through', () => {
    // The loupe is the frame, never a lid: the r=110 circle is stroke-only and
    // the root paints nothing by default. Filling the hole would hide the zoom
    // while every geometry assertion above still passed.
    expect(LUPA).toMatch(/<svg[^>]*fill="none"/);
    const hole = LUPA.match(/<circle cx="150" cy="150" r="110"[^>]*>/)![0];
    expect(hole).not.toContain('fill=');
    expect(LUPA).not.toMatch(/<rect/);
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

  it('draws no ring border or shadow around the lens', () => {
    // Any border or shadow at all would paint a second frame around the zoom;
    // the loupe image is the only frame, so the only allowed value is `none` —
    // whatever colour a later edit picks.
    const lensBlock = DEMO.match(/\.demo-lens \{[\s\S]*?\}/)![0];
    const ring = lensBlock
      .split(';')
      .map((decl) => decl.trim())
      .filter((decl) => /^(border(-(top|right|bottom|left))?|box-shadow)\s*:/.test(decl));
    for (const decl of ring) expect(decl).toMatch(/:\s*none$/);
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

describe('demo loading: poster first, clip on approach', () => {
  it('never autoplays and never preloads: the clip is a poster until approached', () => {
    // The markup video — not the click-to-open dialog's template string.
    const videoTag = DEMO.match(/<video[^>]*class="demo-video"[^>]*>/)![0];
    expect(videoTag).not.toContain('autoplay');
    expect(videoTag).toContain('preload="none"');
    expect(videoTag).toContain('poster={posterUrl}');
    expect(DEMO).not.toContain('preload="metadata"');
    // The dialog opens on a click — an interaction — so its autoplay stays.
    expect(DEMO).toContain('openDemoDialog');
    expect(DEMO).toContain('<video autoplay muted loop playsinline controls');
  });

  it('shows the recorded poster frame at the real mp4 pixels', () => {
    // Posters are the first frame at 720 wide (ffmpeg -ss 0, scale=720:-2).
    for (const id of ['canopy', 'demostage', 'ghscaff', 'gitkit', 'texforge']) {
      const file = resolve(__dirname, `../../public/demos/${id}-poster.webp`);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(0);
    }
    expect(DEMO).toContain("src.replace(/\\.mp4$/, '-poster.webp')");
    expect(DEMO).toContain('poster={posterUrl}');
    // Real pixels (ffprobe) reserve the exact box: canopy 1440x1026,
    // demostage 1200x720, ghscaff 1440x1080, gitkit 1440x1026, texforge 1440x1080.
    expect(DEMO).toContain('canopy: { w: 1440, h: 1026 }');
    expect(DEMO).toContain('demostage: { w: 1200, h: 720 }');
    expect(DEMO).toContain('width={dims?.w}');
    expect(DEMO).toContain('height={dims?.h}');
  });

  it('plays only when the visitor approaches, 200px out', () => {
    expect(DEMO).toContain("rootMargin: '200px'");
    expect(DEMO).toContain('seen.observe(box)');
    expect(DEMO).toMatch(/video\.play\(\)\.catch/);
  });

  it('never preloads the loupe clone: the clip loads only on hover', () => {
    // The lens is a second <video> for the same mp4; an eager preload on it
    // would pull the whole clip during load beside the poster. It starts
    // 'none' before the element is attached; 'auto' is only set by startLens.
    const initPreload = DEMO.indexOf("lensVideo.preload = 'none'");
    expect(initPreload).toBeGreaterThan(-1);
    expect(initPreload).toBeLessThan(DEMO.indexOf('lensInner.appendChild(lensVideo)'));
    expect(DEMO).toMatch(/startLens = function \(\) \{[\s\S]*?lensVideo\.preload = 'auto'/);
    expect(DEMO).toContain("frame.addEventListener('mouseenter', startLens)");
    expect(DEMO).toContain('if (lensReady) lensVideo.play()');
  });
});
