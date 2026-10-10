/** Fundamentos del Pensamiento Cósmico (v1.0) as data.
 *  The ONLY source for ids, kinds and dependencies is
 *  `../fundamentos-pensamiento-cosmico.md`. Copy (names, statements) lives in
 *  the i18n dictionaries under `fundamentos.nodes`, keyed by id — this file
 *  holds only ids, kinds, deps and flags. Node positions come from row and
 *  index at render time; no layout library. */
export type Kind = 'definition' | 'axiom' | 'proposition' | 'corollary';

export interface FNode {
  id: string;
  kind: Kind;
  /** Ids of the premises this node is declared to depend on. */
  deps: string[];
  /** True only for A4: the one revisable empirical claim. */
  empirical?: boolean;
}

export const NODES: FNode[] = [
  { id: 'D1', kind: 'definition', deps: [] },
  { id: 'D2', kind: 'definition', deps: [] },
  { id: 'D3', kind: 'definition', deps: [] },
  { id: 'D4', kind: 'definition', deps: [] },
  { id: 'D5', kind: 'definition', deps: [] },
  { id: 'D6', kind: 'definition', deps: [] },
  { id: 'A0', kind: 'axiom', deps: [] },
  { id: 'A1', kind: 'axiom', deps: [] },
  { id: 'A2', kind: 'axiom', deps: [] },
  { id: 'A3', kind: 'axiom', deps: [] },
  { id: 'A4', kind: 'axiom', deps: [], empirical: true },
  { id: 'P1', kind: 'proposition', deps: ['A1', 'A2', 'D3'] },
  { id: 'P2', kind: 'proposition', deps: ['A1', 'A2', 'D5'] },
  { id: 'P3', kind: 'proposition', deps: ['A0', 'A1', 'A3'] },
  { id: 'P4', kind: 'proposition', deps: ['P3', 'A4'] },
  { id: 'P5', kind: 'proposition', deps: ['A2', 'A3', 'D5'] },
  { id: 'P6', kind: 'proposition', deps: ['A3', 'P3'] },
  { id: 'P7', kind: 'proposition', deps: ['P1', 'P3'] },
  { id: 'P8', kind: 'proposition', deps: ['A2', 'P3'] },
  { id: 'P9', kind: 'proposition', deps: ['A2', 'A3'] },
  { id: 'P10', kind: 'proposition', deps: ['P3', 'P4', 'P5'] },
  { id: 'C1', kind: 'corollary', deps: ['P1', 'P2'] },
  { id: 'C2', kind: 'corollary', deps: ['P2', 'A2'] },
  { id: 'C3', kind: 'corollary', deps: ['P3', 'P4'] },
  { id: 'C4', kind: 'corollary', deps: ['P5', 'P10'] },
];

/** Ids grouped by row, in canonical D → A → P → C order. */
export const ROWS: Record<Kind, string[]> = {
  definition: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'],
  axiom: ['A0', 'A1', 'A2', 'A3', 'A4'],
  proposition: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'],
  corollary: ['C1', 'C2', 'C3', 'C4'],
};

/** Canonical order of every node id (row by row), for stable output. */
export const ORDER: string[] = [
  ...ROWS.definition,
  ...ROWS.axiom,
  ...ROWS.proposition,
  ...ROWS.corollary,
];
