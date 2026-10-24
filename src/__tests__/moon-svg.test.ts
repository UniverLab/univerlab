import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { moonSVG } from '../lib/moon-svg';

// The reference implementation the port must match byte-for-byte in output.
const LUNA_SRC = readFileSync(
  resolve(__dirname, '..', '..', 'public', 'bench', 'identidad', 'luna.js'),
  'utf8',
);
const refMoonSVG: (phase: number, id: string) => string = new Function(
  `${LUNA_SRC}; return moonSVG;`,
)() as (phase: number, id: string) => string;

/** First lit-region path `d` in the SVG (the mask's black terminator cut-out). */
function litD(svg: string): string {
  const m = svg.match(/<path d="([^"]+)" fill="black"\/>/);
  if (!m) throw new Error('no lit mask path found');
  return m[1];
}

describe('moonSVG (engraved moon port)', () => {
  it.each([0, 0.25, 0.5, 0.75])(
    'phase %s produces a valid SVG reusing the given id',
    (phase) => {
      const svg = moonSVG(phase, 'hdr');
      expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 120 120"/);
      expect(svg).toContain('id="hdr-x"');
      expect(svg).toContain('id="hdr-c"');
      expect(svg).toContain('id="hdr-shadow"');
      expect(svg).toMatch(/<\/svg>$/);
      // Lit region is drawn (mask cut-out + three lit overlays + rim).
      expect(litD(svg)).toMatch(/^M60 20 A40 40 0 0 [01] 60 100 /);
    },
  );

  it('matches the bench luna.js output exactly', () => {
    for (const phase of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
      expect(moonSVG(phase, 'hdr')).toBe(refMoonSVG(phase, 'hdr'));
    }
  });

  it('lights the right side when waxing and the left side when waning', () => {
    const waxing = litD(moonSVG(0.25, 'm'));
    const waning = litD(moonSVG(0.75, 'm'));
    // Outer half-circle sweep: 1 (right) while waxing, 0 (left) while waning.
    expect(waxing).toContain('A40 40 0 0 1 60 100');
    expect(waning).toContain('A40 40 0 0 0 60 100');
    expect(waxing).not.toBe(waning);
  });

  it('terminator ellipse closes at new moon and opens full at full moon', () => {
    // New moon: |cos 0| = 1 → terminator radius equals the disc (rx 40.00).
    expect(litD(moonSVG(0, 'm'))).toContain('A40.00 40 0 0');
    // Full moon: |cos π| = 1 again, but the outer sweep flips to the left half.
    expect(litD(moonSVG(0.5, 'm'))).toContain('A40.00 40 0 0');
    // Quarter: |cos π/2| = 0 → degenerate straight terminator (rx 0.00).
    expect(litD(moonSVG(0.25, 'm'))).toContain('A0.00 40 0 0');
  });

  it('normalizes phases into [0, 1)', () => {
    expect(moonSVG(1, 'm')).toBe(moonSVG(0, 'm'));
    expect(moonSVG(-0.25, 'm')).toBe(moonSVG(0.75, 'm'));
  });
});
