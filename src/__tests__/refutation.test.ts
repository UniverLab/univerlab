/**
 * Source-level tests for the MAN3 refutation map's data contract: the
 * dependency table, the pure logic in src/lib/refutation.ts and the bilingual
 * copy. The map's markup left the site with the redesign (the published paper
 * carries the developed argument now) — these tests guard the structure the
 * paper rests on.
 */
import { NODES } from '../data/fundamentos';
import { premisesOf, dependentsOf, reject } from '../lib/refutation';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const DEPS: Record<string, string[]> = {
  P1: ['A1', 'A2', 'D3'],
  P2: ['A1', 'A2', 'D5'],
  P3: ['A0', 'A1', 'A3'],
  P4: ['P3', 'A4'],
  P5: ['A2', 'A3', 'D5'],
  P6: ['A3', 'P3'],
  P7: ['P1', 'P3'],
  P8: ['A2', 'P3'],
  P9: ['A2', 'A3'],
  P10: ['P3', 'P4', 'P5'],
  C1: ['P1', 'P2'],
  C2: ['P2', 'A2'],
  C3: ['P3', 'P4'],
  C4: ['P5', 'P10'],
};

describe('MAN3 refutation logic', () => {
  it('encodes exactly the declared dependency table (§1)', () => {
    expect(NODES).toHaveLength(25);
    const byId = new Map(NODES.map((n) => [n.id, n]));
    for (const [id, deps] of Object.entries(DEPS)) {
      expect(byId.get(id)?.deps).toEqual(deps);
    }
    for (const n of NODES) {
      if (!(n.id in DEPS)) expect(n.deps).toEqual([]);
    }
    expect(NODES.filter((n) => n.kind === 'definition')).toHaveLength(6);
    expect(NODES.filter((n) => n.kind === 'axiom')).toHaveLength(5);
    expect(NODES.filter((n) => n.kind === 'proposition')).toHaveLength(10);
    expect(NODES.filter((n) => n.kind === 'corollary')).toHaveLength(4);
    expect(NODES.filter((n) => n.empirical).map((n) => n.id)).toEqual(['A4']);
  });

  it("reject('A1'): 12 fall, P5 and P9 stand, P3 and C4 fall", () => {
    const r = reject('A1');
    expect(r.rewritten).toEqual([]);
    expect(r.falls).toHaveLength(12);
    expect(r.falls).toEqual(expect.arrayContaining(['P1', 'P2', 'P3', 'P4', 'P6', 'P7', 'P8', 'P10', 'C1', 'C2', 'C3', 'C4']));
    expect(r.stands).toEqual(expect.arrayContaining(['P5', 'P9']));
    expect(r.stands).not.toEqual(expect.arrayContaining(['P3', 'C4']));
  });

  it("reject('A4'): P4 is rewritten and nothing falls", () => {
    const r = reject('A4');
    expect(r.rewritten).toEqual(['P4']);
    expect(r.falls).toEqual([]);
    // P4's dependents invoke whatever replaces A4, so they stand.
    expect(r.stands).toEqual(expect.arrayContaining(['P10', 'C3', 'C4']));
  });

  it("reject('A3'): P3, P5, P6 and P9 fall", () => {
    const r = reject('A3');
    expect(r.falls).toEqual(expect.arrayContaining(['P3', 'P5', 'P6', 'P9']));
  });

  it('premisesOf/dependentsOf agree on every edge, both directions', () => {
    for (const n of NODES) {
      for (const d of n.deps) {
        // Every declared premise lists the node among its dependents…
        expect(dependentsOf(d)).toContain(n.id);
        // …and the node lists the premise plus its transitive premises.
        expect(premisesOf(n.id)).toContain(d);
        for (const t of premisesOf(d)) expect(premisesOf(n.id)).toContain(t);
      }
    }
    // Spot checks on transitive depth: P10 reaches the axioms through P3/P4/P5.
    // (D3 is NOT among them: neither P3, P4 nor P5 descends from D3.)
    expect(premisesOf('P10')).toEqual(['D5', 'A0', 'A1', 'A2', 'A3', 'A4', 'P3', 'P4', 'P5']);
    expect(premisesOf('P10')).not.toContain('P10');
    expect(dependentsOf('A1')).not.toContain('A1');
    // A0's reach via P3 (P3's own dependents must all be A0's too).
    for (const d of dependentsOf('P3')) expect(dependentsOf('A0')).toContain(d);
  });

  it('has no cycles', () => {
    const deps = new Map(NODES.map((n) => [n.id, n.deps]));
    const color = new Map<string, number>();
    const visit = (id: string): boolean => {
      if (color.get(id) === 1) return false;
      if (color.get(id) === 2) return true;
      color.set(id, 1);
      for (const d of deps.get(id) ?? []) {
        if (!visit(d)) return false;
      }
      color.set(id, 2);
      return true;
    };
    for (const n of NODES) expect(visit(n.id)).toBe(true);
  });

  it('carries EN and ES copy (name + statement) for every node', () => {
    for (const n of NODES) {
      for (const dict of [en.fundamentos, es.fundamentos]) {
        expect(dict.nodes[n.id]?.name?.length).toBeGreaterThan(0);
        expect(dict.nodes[n.id]?.statement?.length).toBeGreaterThan(0);
      }
    }
    // ES names are the source's bold names verbatim.
    expect(es.fundamentos.nodes.A3.name).toBe('Axioma de la Vulnerabilidad');
    expect(es.fundamentos.nodes.P3.name).toBe('Imperativo de la Continuidad');
    expect(es.fundamentos.nodes.C4.name).toBe('Apertura como obligación');
    // ES statements stay condensed (≤25 words).
    for (const n of NODES) {
      expect(es.fundamentos.nodes[n.id].statement.split(/\s+/).length).toBeLessThanOrEqual(25);
    }
  });

  it('renders the A1 sentence from computed counts, never hard-coded', () => {
    const r = reject('A1');
    const stoodP = r.stands.filter((id) => id[0] === 'P' || id[0] === 'C');
    const s = en.fundamentos.fallSentence
      .replace('{id}', 'A1')
      .replace('{n}', String(r.falls.length))
      .replace('{stands}', stoodP.join(' and '));
    expect(s).toBe('Reject A1: 12 pieces fall; P5 and P9 still stand.');
    const t = es.fundamentos.fallSentence
      .replace('{id}', 'A1')
      .replace('{n}', String(r.falls.length))
      .replace('{stands}', stoodP.join(' y '));
    expect(t).toBe('Rechaza A1: caen 12 piezas; P5 y P9 siguen en pie.');
  });
});
