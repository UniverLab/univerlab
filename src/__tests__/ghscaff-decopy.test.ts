/**
 * ghScaff de-copy — the page must read as industrial steel, not AuthKit's
 * frosted glass. Astro/CSS aren't rendered in Jest here (see hero-scale and
 * lab-system tests), so the contract is asserted on the source as text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SURFACES = readFileSync(resolve(__dirname, '..', 'styles', 'surfaces.css'), 'utf8');
const VIEW = readFileSync(resolve(__dirname, '..', 'views', 'experiments', 'Ghscaff.astro'), 'utf8');

describe('ghScaff de-copy — industrial steel, not glass', () => {
  it('declares no backdrop-filter on any industrial rule', () => {
    expect(SURFACES).not.toMatch(/industrial[^{}]*\{[^{}]*backdrop-filter/);
  });

  it('carries no fan/tilt transform or script on the lift cards', () => {
    expect(VIEW).not.toMatch(/data-tilt-fan/);
    expect(VIEW).not.toMatch(/is-near/);
    expect(VIEW).not.toMatch(/--tilt|--lift/);
    expect(SURFACES).not.toMatch(/\.fan li[^{}]*\{[^{}]*transform/);
  });

  it('renders the H1 in plain ink — no background-clip text gradient', () => {
    expect(SURFACES).not.toMatch(/background-clip:\s*text/);
    expect(SURFACES).not.toMatch(/text-fill-color/);
  });

  it('paints the hero and glass cards as flat --bg-raise plates with a hairline', () => {
    expect(SURFACES).toMatch(/industrial[^{}]*\.hero[^{}]*\{[^{}]*background:\s*var\(--bg-raise\)/);
    expect(SURFACES).toMatch(/industrial[^{}]*\.glass[^{}]*\{[^{}]*background:\s*var\(--bg-raise\)/);
    expect(SURFACES).toMatch(/industrial[^{}]*\.hero[^{}]*\{[^{}]*border:\s*1px solid var\(--line\)/);
  });

  it('keeps --bg-raise opaque for industrial — the plates must not fall back to the 5% skywash film', () => {
    // global.css rebinds --bg-raise at `html[data-surface]:root` (0,2,1) from
    // its --surface-bg-raise group; surfaces.css wins the tie at the same
    // specificity (it bundles after global.css) — so an opaque industrial
    // redeclaration must exist with the SAME winning selector shape.
    expect(SURFACES).toMatch(/html\[data-surface='industrial'\]:root\s*\{\s*--bg-raise:\s*#[0-9a-fA-F]{6}\s*;\s*\}/);
    // …and nothing inside the industrial :root token block may re-declare
    // --bg-raise as a translucent rgba film.
    const start = SURFACES.indexOf(`:root[data-surface='industrial'] {`);
    const block = SURFACES.slice(start, SURFACES.indexOf('}', start));
    expect(block).not.toMatch(/--bg-raise:/);
  });

  it('drops the blueprint grid + halo layer', () => {
    expect(SURFACES).not.toMatch(/industrial[^{}]*body::before[^{}]*\{[^{}]*linear-gradient/);
  });
});
