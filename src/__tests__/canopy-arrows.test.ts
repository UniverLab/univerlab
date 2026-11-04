/**
 * Canopy's plate arrowheads (FR4): every flow edge across the hero's shapes
 * carries a marker-end, and the built /canopy/ pages ship the plate's marker
 * vocabulary on the autonomous graph (ag) and the catalogue plate (cp).
 *
 * Part 1 dresses real SVG paths through the same shared module the hero's
 * drawEdges calls (HERO_SHAPES + flowPath + markerFor) — the 18s loop is
 * client script, so the unit level is where the shapes are assertable.
 * Part 2 reads the built dist/ HTML with the repo's "run npm run build"
 * convention (canopy-remote-catalogue.test.ts).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EDGE, HERO_SHAPES, flowPath, markerDefs, markerFor, type E, type Shape } from '../lib/canopy-graph';

const root = join(__dirname, '..', '..');
const SVG_NS = 'http://www.w3.org/2000/svg';

function built(page: string): string {
  const file = join(root, 'dist', page);
  if (!existsSync(file)) {
    throw new Error(`dist/${page} not found — run \`npm run build\` before \`npm test\`.`);
  }
  return readFileSync(file, 'utf8');
}

/** One svg's full markup, found by its class (Astro appends scope classes). */
function svgBlock(html: string, cls: string): string {
  const start = html.indexOf(`class="${cls}`);
  if (start === -1) throw new Error(`svg .${cls} not found`);
  const open = html.lastIndexOf('<svg', start);
  const close = html.indexOf('</svg>', start);
  return html.slice(open, close + 6);
}

function markerBlock(svg: string, id: string): string {
  const m = svg.match(new RegExp(`<marker id="${id}"[\\s\\S]*?</marker>`));
  if (!m) throw new Error(`marker #${id} not found`);
  return m[0];
}

/** The hero's drawEdges against a shape's declared coordinates. */
function dressedPath(shape: Shape, e: E): SVGPathElement {
  const p = document.createElementNS(SVG_NS, 'path');
  const at = (i: number) => (i >= 100 ? shape.pts![i - 100] : shape.nodes.find((n) => n.s === i)!);
  const kind = e[1] < 100 ? shape.nodes.find((n) => n.s === e[1])?.k : undefined;
  p.setAttribute('d', flowPath(at(e[0]), at(e[1]), e[2] === 'fail', kind));
  const m = markerFor(e[2], 'gm');
  if (m) p.setAttribute('marker-end', m);
  return p;
}

describe('hero shapes: every flow edge carries an arrowhead (jsdom)', () => {
  HERO_SHAPES.forEach((shape, i) => {
    it(`shape ${i} (${shape.nodes[0].l}) marks exactly its flow edges`, () => {
      const paths = shape.edges.map((e) => dressedPath(shape, e));
      const flowCount = shape.edges.filter((e) => e[2] !== 'order').length;
      expect(flowCount).toBeGreaterThan(0);
      expect(paths.filter((p) => p.getAttribute('marker-end')).length).toBe(flowCount);
    });
  });

  it('order guides never carry a marker (the plate rule)', () => {
    const cascade = HERO_SHAPES[2];
    expect(cascade.edges.filter((e) => e[2] === 'order').length).toBeGreaterThan(0);
    expect(markerFor('order', 'gm')).toBeNull();
  });

  it('markers land short of the target border, on it for free points', () => {
    // The path's final point, parsed from the d string (float-safe).
    const endOf = (d: string) => {
      const nums = d.split('C')[1]!.trim().split(/\s+/).map(Number);
      return { x: nums[4], y: nums[5] };
    };
    // gated implement edges[0]: spec(7,31) → implement(28,31); the agent's
    // half-extent is 3 and the plate margin 0.8 — the S-curve ends at 24.2.
    const gated = HERO_SHAPES[0];
    const end = endOf(dressedPath(gated, gated.edges[0]).getAttribute('d')!);
    expect(end.x).toBeCloseTo(28 - 3 - 0.8, 6);
    expect(end.y).toBe(31);
    // Same-row fail arc into an agent: y pullback (half 3 + margin 0.8 - the
    // arc's own 3-unit bias), and edgePath ends 3 above that.
    const arc = endOf(flowPath({ x: 49, y: 31 }, { x: 28, y: 31 }, true, 'agent'));
    expect(arc.x).toBe(28);
    expect(arc.y).toBeCloseTo(31 - (3 + 0.8 - 3) - 3, 6);
    // A fail that drops rows stays an S-curve, pulled back along x.
    const drop = endOf(flowPath({ x: 37, y: 24 }, { x: 47, y: 52 }, true, 'agent'));
    expect(drop.x).toBeCloseTo(47 - 3.8, 6);
    expect(drop.y).toBe(52);
    // A free point (the cascade's group exit) has no border to stop at.
    const free = flowPath({ x: 63, y: 31 }, { x: 91, y: 31 }, false, undefined);
    expect(free).toBe('M63 31 C77 31 77 31 91 31');
  });
});

describe('shared marker vocabulary', () => {
  it('markerDefs carries the plate geometry with inline EDGE fills', () => {
    const defs = markerDefs('gm');
    for (const id of ['gm-arrow', 'gm-arrow-fail', 'gm-arrow-error']) {
      expect(defs).toContain(`id="${id}"`);
    }
    expect(defs).toContain('viewBox="0 0 10 10"');
    expect(defs).toContain('refX="8"');
    expect(defs).toContain('refY="5"');
    expect(defs).toContain('markerWidth="1.3"');
    expect(defs).toContain('markerHeight="1.3"');
    expect(defs).toContain('markerUnits="userSpaceOnUse"');
    expect(defs).toContain('orient="auto-start-reverse"');
    expect(defs).toContain(`fill="${EDGE.pass.fill}" fill-opacity=".85"`);
    expect(defs).toContain(`fill="${EDGE.fail.fill}" fill-opacity=".7"`);
    expect(defs).toContain(`fill="${EDGE.error.fill}" fill-opacity=".45"`);
  });

  it('markerFor names the right marker per condition', () => {
    expect(markerFor('pass', 'ag')).toBe('url(#ag-arrow)');
    expect(markerFor('fail', 'ag')).toBe('url(#ag-arrow-fail)');
    expect(markerFor('error', 'ag')).toBe('url(#ag-arrow-error)');
    expect(markerFor('order', 'ag')).toBeNull();
  });
});

describe.each([
  ['en', 'canopy/index.html'],
  ['es', 'es/canopy/index.html'],
] as const)('built %s /canopy/ page ships the plate arrows', (_lang, page) => {
  const html = built(page);
  const ag = svgBlock(html, 'ag-svg');
  const cp = svgBlock(html, 'cp-svg');

  it('the autonomous graph arrows all 12 of its flow edges', () => {
    expect((ag.match(/class="ag-edge/g) ?? []).length).toBe(12);
    expect((ag.match(/marker-end="url\(#ag-arrow/g) ?? []).length).toBe(12);
  });

  it('the catalogue plate arrows all 6 of its flow edges', () => {
    expect((cp.match(/class="cp-edge/g) ?? []).length).toBe(6);
    expect((cp.match(/marker-end="url\(#cp-arrow/g) ?? []).length).toBe(6);
  });

  it('carries the three namespaced markers with the plate geometry', () => {
    for (const [block, prefix] of [[ag, 'ag'], [cp, 'cp']] as const) {
      for (const suffix of ['', '-fail', '-error']) {
        const marker = markerBlock(block, `${prefix}-arrow${suffix}`);
        expect(marker).toContain('viewBox="0 0 10 10"');
        expect(marker).toContain('refX="8"');
        expect(marker).toContain('refY="5"');
        expect(marker).toContain('markerWidth="1.3"');
        expect(marker).toContain('markerUnits="userSpaceOnUse"');
        expect(marker).toContain('orient="auto-start-reverse"');
      }
    }
  });

  it('the hero svg ships its three gm markers statically', () => {
    const gm = svgBlock(html, 'gm-svg');
    for (const suffix of ['', '-fail', '-error']) {
      expect(gm).toContain(`id="gm-arrow${suffix}"`);
    }
  });
});

describe('provenance pin', () => {
  it('canopy-graph.ts names its canopy-web plate source and commit', () => {
    const source = readFileSync(join(root, 'src/lib/canopy-graph.ts'), 'utf8');
    expect(source).toContain('packages/plate');
    expect(source).toContain('d91e1b716741db9cf6e6027370f8b096417e954f');
  });
});
