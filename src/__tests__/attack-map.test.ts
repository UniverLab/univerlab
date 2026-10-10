/**
 * Tests for the MAN3 attack-map runtime (src/scripts/attack-map.ts) against a
 * real DOM: selection highlights premises/dependents, axiom rejection paints
 * fallen/rewritten states and announces the computed sentence, and the toggle
 * restores. The sentence builder mirrors the template's data-* templates, so
 * counts and ids always come from reject() — nothing hard-coded.
 *
 * Given-When-Then pattern, like orbit.test.ts: build the section DOM the way
 * AttackMap.astro renders it (25 nodes, 31 edges, panel, list, live region).
 */
import { NODES, ROWS } from '../data/fundamentos';
import { premisesOf, dependentsOf, reject } from '../lib/refutation';
import { startAttackMap } from '../scripts/attack-map';
import { en } from '../i18n/en';

const f = en.fundamentos;
const byId = new Map(NODES.map((n) => [n.id, n]));

function buildSection(): HTMLElement {
  const root = document.createElement('div');
  const edges = NODES.flatMap((n) => n.deps.map((d) => [d, n.id] as [string, string]));
  const svgNodes = NODES.map(
    (n) => `<g class="attack-node" data-id="${n.id}" role="button" tabindex="0" aria-label="${n.id} ${f.nodes[n.id].name}" data-node="${n.id}"><circle class="mark" r="16"/><text class="node-id">${n.id}</text></g>`,
  ).join('');
  const svgEdges = edges
    .map(([a, b]) => `<path class="edge" data-from="${a}" data-to="${b}" d="M0 0"/>`)
    .join('');
  const rows = (Object.keys(ROWS) as (keyof typeof ROWS)[])
    .map((kind) =>
      `<h3>${f.rows[kind]}</h3><ul class="attack-items">` +
      ROWS[kind]
        .map((id) => {
          const n = byId.get(id)!;
          return `<li data-id="${id}">` +
            `<button type="button" class="attack-item-btn" data-select="${id}"><span class="attack-item-id">${id}</span>` +
            `<span class="attack-item-name">${f.nodes[id].name}</span>` +
            (n.empirical ? `<span class="attack-emp">· ${f.empirical}</span>` : '') +
            `</button><p class="attack-item-statement">${f.nodes[id].statement}</p>` +
            `<p class="attack-item-deps">${id}${n.deps.length > 0 ? ` ← ${n.deps.join(', ')}` : ''}</p>` +
            (n.kind === 'axiom'
              ? `<button type="button" class="attack-reject" data-reject-item="${id}">${f.rejectLabel} ${id}</button>`
              : '') +
            `<p class="attack-item-result" data-item-result="${id}"></p></li>`;
        })
        .join('') +
      `</ul>`,
    )
    .join('');
  root.innerHTML =
    `<section id="attack"><div class="attack-grid" data-attack data-and="${f.andWord}" ` +
    `data-fall="${f.fallSentence}" data-rewrite="${f.rewriteSentence}">` +
    `<svg class="attack-svg" aria-hidden="true">${svgEdges}${svgNodes}</svg>` +
    `<aside class="attack-panel" data-panel><p class="attack-prompt" data-prompt>${f.selectPrompt}</p>` +
    `<h3 class="attack-name" data-name hidden></h3><p class="attack-statement" data-statement hidden></p>` +
    `<p class="attack-kind-note" data-kind-note data-revisable="${f.revisableNote}" data-value="${f.valueNote}" hidden></p>` +
    `<div class="attack-deps" data-deps hidden><p><span>${f.restsOn}</span> <span data-rests></span></p>` +
    `<p><span>${f.supports}</span> <span data-supports></span></p></div>` +
    `<button type="button" class="attack-reject" data-reject data-label="${f.rejectLabel}" data-restore="${f.restoreLabel}" hidden></button>` +
    `<p class="attack-result" data-result></p></aside></div>` +
    `<div class="attack-list" data-attack-list>${rows}</div>` +
    `<div class="visually-hidden" aria-live="polite" data-live></div></section>`;
  document.body.appendChild(root);
  return root.querySelector<HTMLElement>('#attack') as HTMLElement;
}

const panelText = (section: HTMLElement, sel: string) =>
  section.querySelector<HTMLElement>(`[data-panel] ${sel}`)?.textContent ?? '';
const resultText = (section: HTMLElement) =>
  section.querySelector<HTMLElement>('[data-result]')?.textContent ?? '';
const liveText = (section: HTMLElement) =>
  section.querySelector<HTMLElement>('[data-live]')?.textContent ?? '';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('attack-map runtime', () => {
  it('selecting A1 lights its premises and dependents and fills the panel', () => {
    // Given: a mounted attack section
    const section = buildSection();
    startAttackMap(section);

    // When: the A1 list button is selected
    section.querySelector<HTMLButtonElement>('[data-select="A1"]')?.click();

    // Then: exactly premises(A1) ∪ {A1} ∪ dependents(A1) light up
    const lit = new Set([...premisesOf('A1'), 'A1', ...dependentsOf('A1')]);
    let litCount = 0;
    section.querySelectorAll<SVGGElement>('.attack-node').forEach((g) => {
      const id = g.dataset.id as string;
      const on = g.hasAttribute('data-lit');
      expect(on).toBe(lit.has(id));
      if (on) litCount += 1;
    });
    expect(litCount).toBe(lit.size);
    expect(premisesOf('A1')).toEqual([]);
    expect(dependentsOf('A1')).toContain('P3');
    // And: the panel shows the name, statement, rests-on and supports ids
    expect(panelText(section, '[data-name]')).toBe(f.nodes.A1.name);
    expect(panelText(section, '[data-statement]')).toBe(f.nodes.A1.statement);
    expect(panelText(section, '[data-rests]')).toBe('—');
    expect(panelText(section, '[data-supports]')).toContain('P1');
    // And: the axiom reject toggle appears with the value-position note
    const toggle = section.querySelector<HTMLButtonElement>('[data-panel] [data-reject]');
    expect(toggle?.hidden).toBe(false);
    expect(panelText(section, '[data-kind-note]')).toBe(f.valueNote);
  });

  it('rejecting A1 falls 12, keeps P5/P9 standing, and announces the sentence', () => {
    // Given: a mounted attack section with A1 selected
    const section = buildSection();
    startAttackMap(section);
    section.querySelector<HTMLButtonElement>('[data-select="A1"]')?.click();

    // When: A1 is rejected
    section.querySelector<HTMLButtonElement>('[data-reject-item="A1"]')?.click();

    // Then: the fallen set is exactly reject('A1').falls on SVG and list
    const { falls } = reject('A1');
    expect(falls).toHaveLength(12);
    for (const id of falls) {
      expect(section.querySelector(`.attack-node[data-id="${id}"]`)?.hasAttribute('data-fallen')).toBe(true);
      expect(section.querySelector(`.attack-items li[data-id="${id}"]`)?.hasAttribute('data-fallen')).toBe(true);
    }
    expect(section.querySelector('.attack-node[data-id="P5"]')?.hasAttribute('data-fallen')).toBe(false);
    expect(section.querySelector('.attack-node[data-id="P9"]')?.hasAttribute('data-fallen')).toBe(false);
    // And: panel, live region and per-item line announce the same sentence
    const expected = 'Reject A1: 12 pieces fall; P5 and P9 still stand.';
    expect(resultText(section)).toBe(expected);
    expect(liveText(section)).toBe(expected);
    expect(section.querySelector('[data-item-result="A1"]')?.textContent).toBe(expected);

    // When: the toggle is pressed again
    section.querySelector<HTMLButtonElement>('[data-reject-item="A1"]')?.click();

    // Then: everything is restored and the sentence clears
    expect(resultText(section)).toBe('');
    expect(liveText(section)).toBe('');
    section.querySelectorAll('.attack-node').forEach((g) => {
      expect(g.hasAttribute('data-fallen')).toBe(false);
    });
  });

  it('rejecting A4 rewrites P4, falls nothing, and marks A4 revisable', () => {
    // Given: a mounted attack section
    const section = buildSection();
    startAttackMap(section);

    // When: A4 is rejected
    section.querySelector<HTMLButtonElement>('[data-reject-item="A4"]')?.click();

    // Then: nothing falls, P4 is rewritten, and the sentence says so
    const r = reject('A4');
    expect(r.falls).toEqual([]);
    expect(r.rewritten).toEqual(['P4']);
    expect(section.querySelector('.attack-node[data-id="P4"]')?.hasAttribute('data-rewritten')).toBe(true);
    section.querySelectorAll('.attack-node').forEach((g) => {
      expect(g.hasAttribute('data-fallen')).toBe(false);
    });
    const expected = 'Reject A4: nothing falls; P4 is rewritten to invoke the new medium.';
    expect(resultText(section)).toBe(expected);
    expect(liveText(section)).toBe(expected);
    // And: the panel carries the revisable-empirical note, not the value note
    section.querySelector<HTMLButtonElement>('[data-select="A4"]')?.click();
    expect(panelText(section, '[data-kind-note]')).toBe(f.revisableNote);
  });

  it('ignores pointer-leave on the svg and restores the prompt on empty selection', () => {
    // Given: a mounted attack section with a node selected
    const section = buildSection();
    startAttackMap(section);
    section.querySelector<HTMLButtonElement>('[data-select="P4"]')?.click();
    expect(section.querySelector('.attack-grid')?.hasAttribute('data-selected')).toBe(true);

    // When: the pointer leaves the svg (sight-only hover out)
    section.querySelector<SVGSVGElement>('.attack-svg')?.dispatchEvent(new Event('pointerleave'));

    // Then: selection clears, dimming lifts, and the prompt returns
    expect(section.querySelector('.attack-grid')?.hasAttribute('data-selected')).toBe(false);
    expect(section.querySelector('[data-prompt]')?.hasAttribute('hidden')).toBe(false);
  });

  it('selecting a non-axiom shows its graph but no reject toggle', () => {
    // Given: a mounted attack section
    const section = buildSection();
    startAttackMap(section);

    // When: P4 (a proposition) is selected
    section.querySelector<HTMLButtonElement>('[data-select="P4"]')?.click();

    // Then: its premises and dependents light, the panel fills, but the axiom
    // toggle stays hidden and no kind note shows
    expect(panelText(section, '[data-name]')).toBe(f.nodes.P4.name);
    expect(panelText(section, '[data-rests]')).toBe(premisesOf('P4').join(', '));
    expect(panelText(section, '[data-supports]')).toBe(dependentsOf('P4').join(', '));
    expect(section.querySelector<HTMLButtonElement>('[data-panel] [data-reject]')?.hidden).toBe(true);
    expect(section.querySelector('[data-kind-note]')?.hasAttribute('hidden')).toBe(true);
  });

  it('bails out cleanly when the section has no grid or list', () => {
    // Given: an empty section root (e.g. a page without the map)
    const empty = document.createElement('section');
    document.body.appendChild(empty);

    // When + Then: starting the map does not throw
    expect(() => startAttackMap(empty)).not.toThrow();
  });

  it('activates SVG nodes by keyboard: focus selects, Enter/Space select', () => {
    // Given: a mounted attack section
    const section = buildSection();
    startAttackMap(section);
    const node = section.querySelector<SVGGElement>('.attack-node[data-id="P3"]') as SVGGElement;

    // Then: the node exposes the button contract from spec §4
    expect(node.getAttribute('role')).toBe('button');
    expect(node.getAttribute('tabindex')).toBe('0');
    expect(node.getAttribute('aria-label')).toContain('P3');

    // When: the node receives focus
    node.dispatchEvent(new Event('focus'));

    // Then: its graph lights and the panel fills, like the list button
    expect(section.querySelector('.attack-grid')?.hasAttribute('data-selected')).toBe(true);
    expect(panelText(section, '[data-name]')).toBe(f.nodes.P3.name);

    // When: Enter is pressed on another node
    const other = section.querySelector<SVGGElement>('.attack-node[data-id="C1"]') as SVGGElement;
    other.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Then: selection moves there
    expect(panelText(section, '[data-name]')).toBe(f.nodes.C1.name);

    // When: Space is pressed elsewhere, and an unrelated key is ignored
    const third = section.querySelector<SVGGElement>('.attack-node[data-id="A2"]') as SVGGElement;
    third.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(panelText(section, '[data-name]')).toBe(f.nodes.A2.name);
    third.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panelText(section, '[data-name]')).toBe(f.nodes.A2.name);
  });

  it('rejecting A3 takes P3, P5, P6 and P9 down with it', () => {
    // Given: a mounted attack section
    const section = buildSection();
    startAttackMap(section);

    // When: A3 is rejected
    section.querySelector<HTMLButtonElement>('[data-reject-item="A3"]')?.click();

    // Then: the spec-named casualties fall and the count comes from reject()
    for (const id of ['P3', 'P5', 'P6', 'P9']) {
      expect(section.querySelector(`.attack-node[data-id="${id}"]`)?.hasAttribute('data-fallen')).toBe(true);
    }
    expect(resultText(section)).toContain(`Reject A3: ${reject('A3').falls.length} pieces fall;`);
  });
});
