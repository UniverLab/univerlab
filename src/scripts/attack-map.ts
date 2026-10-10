/** MAN3 attack map runtime. Imports the canonical graph + logic (no drift from
 *  src/lib/refutation.ts possible), reads copy from data-* attributes the
 *  template serialized, and wires selection + axiom rejection.
 *
 *  Loaded from Manifesto.astro with a plain `<script>` + `import`, the same
 *  precedent as Home.astro importing `../scripts/backgrounds`. */
import { NODES } from '../data/fundamentos';
import { premisesOf, dependentsOf, reject } from '../lib/refutation';

const byId = new Map(NODES.map((n) => [n.id, n]));

export function startAttackMap(root: HTMLElement): void {
  const grid = root.querySelector<HTMLElement>('[data-attack]');
  const list = root.querySelector<HTMLElement>('[data-attack-list]');
  const live = root.querySelector<HTMLElement>('[data-live]');
  if (!grid || !list) return;

  const andWord = grid.dataset.and ?? 'and';
  const fallTpl = grid.dataset.fall ?? 'Reject {id}: {n} pieces fall; {stands} still stand.';
  const rewriteTpl = grid.dataset.rewrite ?? 'Reject {id}: nothing falls; {rewritten} is rewritten.';
  // Copy was serialized into the template per language; recover it from the
  // rendered list (single source, never duplicated in JS).
  const copy = new Map<string, { name: string; statement: string; depsLine: string; empirical: boolean; axiom: boolean }>();
  list.querySelectorAll<HTMLElement>('.attack-items li[data-id]').forEach((li) => {
    const id = li.dataset.id as string;
    copy.set(id, {
      name: li.querySelector('.attack-item-name')?.textContent ?? id,
      statement: li.querySelector('.attack-item-statement')?.textContent ?? '',
      depsLine: li.querySelector('.attack-item-deps')?.textContent ?? '',
      empirical: li.querySelector('.attack-emp') !== null,
      axiom: byId.get(id)?.kind === 'axiom',
    });
  });
  const restsOn = grid.querySelector('[data-deps] .attack-deps-label')?.textContent ?? '';
  const supportsEl = grid.querySelectorAll('[data-deps] .attack-deps-label')[1];
  const supports = supportsEl?.textContent ?? '';

  const panel = grid.querySelector<HTMLElement>('[data-panel]');
  const promptEl = panel?.querySelector<HTMLElement>('[data-prompt]');
  const nameEl = panel?.querySelector<HTMLElement>('[data-name]');
  const stmtEl = panel?.querySelector<HTMLElement>('[data-statement]');
  const kindNoteEl = panel?.querySelector<HTMLElement>('[data-kind-note]');
  const depsEl = panel?.querySelector<HTMLElement>('[data-deps]');
  const restsEl = panel?.querySelector<HTMLElement>('[data-rests]');
  const supportsOutEl = panel?.querySelector<HTMLElement>('[data-supports]');
  const rejectBtn = panel?.querySelector<HTMLButtonElement>('[data-reject]');
  const resultEl = panel?.querySelector<HTMLElement>('[data-result]');

  let selected: string | null = null;
  let rejected: string | null = null;

  const sentence = (axiomId: string): string => {
    const r = reject(axiomId);
    if (r.rewritten.length > 0)
      return rewriteTpl.replace('{id}', axiomId).replace('{rewritten}', r.rewritten.join(', '));
    // {stands} names the standing propositions and corollaries — with the
    // declared deps, rejecting A1 names exactly P5 and P9. Every id and every
    // count comes from reject(); nothing is hard-coded.
    const stoodP = r.stands.filter((id) => byId.get(id)?.kind === 'proposition' || byId.get(id)?.kind === 'corollary');
    const named = stoodP.length > 0 ? stoodP : r.stands;
    const stands = named.length > 1
      ? `${named.slice(0, -1).join(', ')} ${andWord} ${named[named.length - 1]}`
      : named.join('');
    return fallTpl.replace('{id}', axiomId).replace('{n}', String(r.falls.length)).replace('{stands}', stands);
  };

  const paint = () => {
    const lit = new Set<string>();
    if (selected) {
      lit.add(selected);
      for (const p of premisesOf(selected)) lit.add(p);
      for (const d of dependentsOf(selected)) lit.add(d);
    }
    const r = rejected ? reject(rejected) : null;
    const fallen = new Set(r?.falls ?? []);
    const rewritten = new Set(r?.rewritten ?? []);

    grid.querySelectorAll<SVGGElement>('.attack-node').forEach((g) => {
      const id = g.dataset.id as string;
      g.toggleAttribute('data-lit', !!selected && lit.has(id));
      g.toggleAttribute('data-fallen', fallen.has(id));
      g.toggleAttribute('data-rewritten', rewritten.has(id));
    });
    // `data-selected` must vanish entirely when nothing is selected, or the
    // dimming rules keep applying.
    if (selected) grid.setAttribute('data-selected', selected);
    else grid.removeAttribute('data-selected');
    grid.querySelectorAll<SVGPathElement>('.edge').forEach((e) => {
      const a = e.dataset.from as string;
      const b = e.dataset.to as string;
      e.toggleAttribute('data-lit', !!selected && lit.has(a) && lit.has(b));
    });

    // Panel.
    if (panel && selected && copy.has(selected)) {
      const c = copy.get(selected) as { name: string; statement: string; empirical: boolean; axiom: boolean };
      const pre = premisesOf(selected);
      const dep = dependentsOf(selected);
      if (promptEl) promptEl.hidden = true;
      if (nameEl) { nameEl.hidden = false; nameEl.textContent = c.name; }
      if (stmtEl) { stmtEl.hidden = false; stmtEl.textContent = c.statement; }
      if (kindNoteEl) {
        // The method note comes from the source: A4 is the revisable empirical
        // claim, A0–A3 are value positions. Non-axioms carry no note.
        const noteHost = grid.querySelector('[data-kind-note]') as HTMLElement | null;
        const noteText = c.axiom
          ? (noteHost?.dataset[c.empirical ? 'revisable' : 'value'] ?? '')
          : '';
        kindNoteEl.hidden = noteText === '';
        kindNoteEl.textContent = noteText;
      }
      if (depsEl) depsEl.hidden = false;
      if (restsEl) restsEl.textContent = pre.length > 0 ? pre.join(', ') : '—';
      if (supportsOutEl) supportsOutEl.textContent = dep.length > 0 ? dep.join(', ') : '—';
      if (rejectBtn) {
        if (c.axiom) {
          rejectBtn.hidden = false;
          const on = rejected === selected;
          rejectBtn.setAttribute('aria-pressed', String(on));
          rejectBtn.textContent = `${rejectBtn.dataset[on ? 'restore' : 'label'] ?? ''} ${selected}`.trim();
        } else rejectBtn.hidden = true;
      }
      void restsOn;
      void supports;
    } else if (panel) {
      if (promptEl) promptEl.hidden = false;
      for (const el of [nameEl, stmtEl, kindNoteEl, depsEl, rejectBtn]) if (el) el.hidden = true;
    }

    // Result sentence: panel + live region + per-item line, all identical.
    const text = rejected ? sentence(rejected) : '';
    if (resultEl) resultEl.textContent = text;
    if (live) live.textContent = text;
    list.querySelectorAll<HTMLElement>('[data-item-result]').forEach((el) => {
      const id = el.dataset.itemResult as string;
      el.textContent = rejected === id ? text : '';
    });
    list.querySelectorAll<HTMLButtonElement>('[data-reject-item]').forEach((b) => {
      const id = b.dataset.rejectItem as string;
      b.setAttribute('aria-pressed', String(rejected === id));
    });
    if (rejectBtn && selected) {
      const on = rejected === selected;
      rejectBtn.setAttribute('aria-pressed', String(on));
    }
    list.querySelectorAll<HTMLElement>('.attack-items li[data-id]').forEach((li) => {
      const id = li.dataset.id as string;
      li.toggleAttribute('data-fallen', fallen.has(id));
      li.toggleAttribute('data-rewritten', rewritten.has(id));
    });
  };

  const select = (id: string | null) => {
    selected = id;
    paint();
  };

  // SVG nodes (pointer + keyboard — each <g> is role="button" tabindex="0",
  // Enter/Space selects, mirroring the list buttons for sighted users).
  grid.querySelectorAll<SVGGElement>('.attack-node').forEach((g) => {
    const id = g.dataset.id as string;
    g.addEventListener('pointerenter', () => select(id));
    g.addEventListener('pointerover', () => select(id));
    g.addEventListener('focus', () => select(id));
    g.addEventListener('click', () => select(id));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(id);
      }
    });
  });
  grid.querySelector<SVGSVGElement>('.attack-svg')?.addEventListener('pointerleave', () => select(null));

  // List: focus/click selects; reject toggles run `reject()`.
  list.querySelectorAll<HTMLButtonElement>('[data-select]').forEach((b) => {
    const id = b.dataset.select as string;
    b.addEventListener('click', () => select(id));
    b.addEventListener('focus', () => select(id));
  });
  const toggleReject = (id: string) => {
    rejected = rejected === id ? null : id;
    if (rejected) selected = rejected;
    paint();
  };
  list.querySelectorAll<HTMLButtonElement>('[data-reject-item]').forEach((b) => {
    b.addEventListener('click', () => toggleReject(b.dataset.rejectItem as string));
  });
  rejectBtn?.addEventListener('click', () => {
    if (selected) toggleReject(selected);
  });

  paint();
}
