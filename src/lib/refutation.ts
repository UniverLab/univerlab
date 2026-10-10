/** Pure refutation logic over the Fundamentos graph. No DOM.
 *  The canonical implementation — the manifesto's inline script imports these
 *  same functions, so the map and the tests can never drift apart. */
import { NODES, ORDER } from '../data/fundamentos';

const byId = new Map(NODES.map((n) => [n.id, n]));

/** Transitive premises of a node (excludes the node itself), canonical order. */
export function premisesOf(id: string): string[] {
  const seen = new Set<string>();
  const stack = [...(byId.get(id)?.deps ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(byId.get(cur)?.deps ?? []));
  }
  return ORDER.filter((x) => seen.has(x));
}

/** Transitive dependents of a node (excludes the node itself), canonical order. */
export function dependentsOf(id: string): string[] {
  const children = new Map<string, string[]>();
  for (const n of NODES) {
    for (const d of n.deps) {
      const list = children.get(d) ?? [];
      list.push(n.id);
      children.set(d, list);
    }
  }
  const seen = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return ORDER.filter((x) => seen.has(x));
}

export interface Rejection {
  falls: string[];
  rewritten: string[];
  stands: string[];
}

/** What happens when an axiom is rejected. A0–A3 take their dependents down
 *  with them; A4 (per the source's §7) rewrites P4 instead of destroying
 *  anything — P4's dependents stand, invoking whatever medium replaces A4. */
export function reject(axiomId: string): Rejection {
  if (axiomId === 'A4') {
    const rewritten = ['P4'];
    const gone = new Set([axiomId, ...rewritten]);
    return { falls: [], rewritten, stands: ORDER.filter((x) => !gone.has(x)) };
  }
  const falls = dependentsOf(axiomId);
  const gone = new Set([axiomId, ...falls]);
  return { falls, rewritten: [], stands: ORDER.filter((x) => !gone.has(x)) };
}
