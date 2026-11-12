import { dialArcs, demoCap, demoText, type DialCopy } from '../lib/facet-dial';
import type { FacetCapability, FacetGroup } from '../lib/catalogs';

const copy: DialCopy = {
  checks: {
    duration_tolerance_s: 'duration ±{v} s',
    peak_dbfs_min: 'peak ≥ {v} dBFS',
    wer_max: 'WER ≤ {v}',
  },
  checksByKind: {
    audio: 'duration · loudness',
    image: 'width · height',
  },
  checked: 'output checked',
  seed: 'same seed, same file',
};

const cap = (
  id: string,
  facet: string,
  kind: string,
  extra: Partial<FacetCapability> = {},
): FacetCapability => ({ id, tool: 'T', kind, summary: 's', facet, ...extra });

const group = (facet: string, caps: FacetCapability[]): FacetGroup => ({
  facet,
  label: facet,
  caps,
});

describe('facet-dial — dialArcs', () => {
  it('returns no arcs when there is nothing to show', () => {
    expect(dialArcs([], 0)).toEqual([]);
    expect(dialArcs([group('audio', [cap('a.x', 'audio', 'audio')])], 0)).toEqual([]);
    expect(dialArcs([group('audio', [cap('a.x', 'audio', 'audio')])], -3)).toEqual([]);
  });

  it('splits the ring in proportion to each facet count', () => {
    const groups = [
      group('audio', [cap('a.1', 'audio', 'audio'), cap('a.2', 'audio', 'audio')]),
      group('image', [cap('i.1', 'image', 'image')]),
      group('video', [cap('v.1', 'video', 'video')]),
    ];
    const arcs = dialArcs(groups, 4);
    expect(arcs).toHaveLength(3);
    expect(arcs[0].span).toBeCloseTo(Math.PI, 9);
    expect(arcs[1].span).toBeCloseTo(Math.PI / 2, 9);
    expect(arcs.map((a) => a.count)).toEqual([2, 1, 1]);
    const total = arcs.reduce((n, a) => n + a.span, 0);
    expect(total).toBeCloseTo(Math.PI * 2, 9);
  });

  it('lays arcs end to start with a gap and a valid path', () => {
    const groups = [
      group('audio', [cap('a.1', 'audio', 'audio')]),
      group('image', [cap('i.1', 'image', 'image')]),
    ];
    const arcs = dialArcs(groups, 2);
    expect(arcs[1].start).toBeCloseTo(arcs[0].start + arcs[0].span, 9);
    expect(arcs[0].end - arcs[0].start).toBeLessThan(arcs[0].span);
    for (const a of arcs) {
      expect(a.d).toMatch(/^M -?\d+\.\d+ -?\d+\.\d+ A 96 96 0 [01] 1 -?\d+\.\d+ -?\d+\.\d+$/);
    }
  });
});

describe('facet-dial — demoCap', () => {
  it('prefers the capability whose kind matches the facet and carries a verify', () => {
    const plain = cap('a.plain', 'audio', 'audio');
    const verified = cap('a.bed', 'audio', 'audio', { verify: { lufs_tol: 1 } });
    expect(demoCap(group('audio', [plain, verified]))).toBe(verified);
  });

  it('falls back to kind match, then any verify, then the first capability', () => {
    const plain = cap('a.plain', 'audio', 'audio');
    const foreign = cap('a.img', 'audio', 'image', { verify: { similarity_min: 0.5 } });
    expect(demoCap(group('audio', [foreign, plain]))).toBe(plain);
    expect(demoCap(group('audio', [foreign]))).toBe(foreign);
    const first = cap('a.one', 'audio', 'text');
    const second = cap('a.two', 'audio', 'text');
    expect(demoCap(group('audio', [first, second]))).toBe(first);
  });

  it('returns undefined for an empty facet', () => {
    expect(demoCap(group('audio', []))).toBeUndefined();
  });
});

describe('facet-dial — demoText', () => {
  it('renders kind plus the first two verify thresholds through the copy', () => {
    const c = cap('a.bed', 'audio', 'audio', {
      verify: { duration_tolerance_s: 1, peak_dbfs_min: -40 },
      seed: true,
    });
    expect(demoText(c, copy)).toBe(
      'audio · duration ±1 s · peak ≥ -40 dBFS · same seed, same file',
    );
  });

  it('falls back to a raw key pair for thresholds without a template', () => {
    const c = cap('w.t', 'voice', 'audio', { verify: { min_avg_logprob: -1 } });
    expect(demoText(c, copy)).toBe('audio · min_avg_logprob -1');
  });

  it('falls back to the kind line when there is no verify, without a seed line', () => {
    const c = cap('i.still', 'image', 'image');
    expect(demoText(c, copy)).toBe('image · width · height');
    const unknown = cap('x.y', 'other', 'cad');
    expect(demoText(unknown, { ...copy, checksByKind: {} })).toBe('cad · output checked');
  });
});
