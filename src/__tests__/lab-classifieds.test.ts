import {
  CLASSIFIEDS_COUPON_COST,
  CLASSIFIEDS_HEAD_COST,
  CLASSIFIEDS_MAX_PAGES,
  CLASSIFIEDS_PAGE_BUDGET,
  CLASSIFIEDS_SIZE_COST,
  layoutClassifieds,
  rankEntries,
  typeWeight,
} from '../lib/lab-classifieds';
import type { Entry } from '../lib/lab-feed';

const at = (id: string, date: string, type: string, topic = 'canopy'): Entry => ({
  id,
  date,
  title: id,
  body: `${id} body.`,
  type,
  topic,
  link: null,
});

/** N newest-first notes with distinct dates. */
const notes = (n: number): Entry[] =>
  Array.from({ length: n }, (_, i) => at(`n${i}`, new Date(Date.UTC(2026, 9, 20) - i * 86400000).toISOString(), 'note'));

/** The live mix: 14 launch, 13 note, 5 update, 1 incident, newest first. */
const liveMix = (): Entry[] => {
  const kinds: Array<Entry['type']> = [
    ...Array<Entry['type']>(14).fill('launch'),
    ...Array<Entry['type']>(13).fill('note'),
    ...Array<Entry['type']>(5).fill('update'),
    'incident',
  ];
  return kinds.map(
    (type, i) =>
      ({
        id: `l${i}`,
        date: new Date(Date.UTC(2026, 9, 6) - i * 86400000).toISOString(),
        title: `Live ${i}`,
        body: 'Body.',
        type,
        topic: 'canopy',
        link: null,
      }) as Entry,
  );
};

const cost = (sizes: string[]): number =>
  sizes.reduce((sum, s) => sum + CLASSIFIEDS_SIZE_COST[s as keyof typeof CLASSIFIEDS_SIZE_COST], 0);

describe('type weights', () => {
  it('ranks launch and deploy first, then incident, then update and bugfix, then note', () => {
    expect(typeWeight('launch')).toBe(3);
    expect(typeWeight('deploy')).toBe(3);
    expect(typeWeight('incident')).toBe(2);
    expect(typeWeight('update')).toBe(1);
    expect(typeWeight('bugfix')).toBe(1);
    expect(typeWeight('note')).toBe(0);
    expect(typeWeight('unknown')).toBe(0);
    expect(typeWeight(null)).toBe(0);
  });

  it('orders by weight, then newer first, with a total tie-break', () => {
    const rows = [
      at('old-launch', '2026-09-01T10:00:00.000Z', 'launch'),
      at('new-note', '2026-10-06T10:00:00.000Z', 'note'),
      at('new-launch', '2026-10-06T10:00:00.000Z', 'launch'),
      at('incident', '2026-10-05T10:00:00.000Z', 'incident'),
    ];
    expect(rankEntries(rows).map((e) => e.id)).toEqual([
      'new-launch',
      'old-launch',
      'incident',
      'new-note',
    ]);
  });
});

describe('layoutClassifieds', () => {
  it('is deterministic: shuffling the input never changes the layout', () => {
    const rows: Entry[] = [
      at('e1', '2026-10-06T01:09:26.735Z', 'launch', 'canopy'),
      at('e2', '2026-10-05T10:00:00.000Z', 'note', 'texforge'),
      at('e3', '2026-10-04T10:00:00.000Z', 'deploy', 'general'),
      at('e4', '2026-10-03T10:00:00.000Z', 'note', null as unknown as string),
      at('e5', '2026-10-02T10:00:00.000Z', 'bugfix', 'canopy'),
      at('e6', '2026-10-01T10:00:00.000Z', 'incident', 'gitkit'),
      at('e7', '2026-09-30T10:00:00.000Z', 'update', 'canopy'),
      at('e8', '2026-09-29T10:00:00.000Z', 'launch', 'ghscaff'),
      at('e9', '2026-09-28T10:00:00.000Z', 'note', 'demostage'),
    ];
    const first = layoutClassifieds(rows, 4);
    const shuffled = layoutClassifieds([...rows].reverse(), 4);
    expect(shuffled).toEqual(first);
  });

  it('gives the newest release the single display ad', () => {
    const rows: Entry[] = [
      at('note-new', '2026-10-06T10:00:00.000Z', 'note'),
      at('launch-old', '2026-09-01T10:00:00.000Z', 'launch'),
      at('launch-new', '2026-10-05T10:00:00.000Z', 'launch'),
    ];
    const { pages } = layoutClassifieds(rows);
    expect(pages).toHaveLength(1);
    expect(pages[0].map((s) => s.entry.id)).toEqual(['launch-new', 'launch-old', 'note-new']);
    expect(pages[0].map((s) => s.size)).toEqual(['display', 'boxed', 'boxed']);
  });

  it('fills two pages from the live mix with one display ad and reports truncated', () => {
    const rows = liveMix();
    const ranked = rankEntries(rows);
    const { pages, truncated } = layoutClassifieds(rows);
    expect(pages).toHaveLength(2);
    expect(truncated).toBe(true);
    const kept = pages.flat();
    // Exactly one display ad: the highest-ranked entry, first on page 1.
    expect(kept.filter((s) => s.size === 'display')).toHaveLength(1);
    expect(pages[0][0].size).toBe('display');
    expect(pages[0][0].entry.id).toBe(ranked[0].id);
    // Whatever does not fit is left out from the tail, oldest-ranked first.
    const keptIds = new Set(kept.map((s) => s.entry.id));
    const dropped = ranked.filter((e) => !keptIds.has(e.id));
    expect(dropped.length).toBeGreaterThan(0);
    expect(ranked.slice(0, kept.length).map((e) => e.id)).toEqual(kept.map((s) => s.entry.id));
    expect(dropped.map((e) => e.id)).toEqual(ranked.slice(kept.length).map((e) => e.id));
  });

  it('fills each page by space, never past the budget, with no room for a line left over', () => {
    for (const coupons of [0, 4]) {
      const rows = liveMix();
      const { pages, truncated } = layoutClassifieds(rows, coupons);
      expect(truncated).toBe(true);
      const half = Math.ceil(coupons / 2);
      const reserved = [half * CLASSIFIEDS_COUPON_COST, (coupons - half) * CLASSIFIEDS_COUPON_COST];
      pages.forEach((page, p) => {
        const sizes = page.map((s) => s.size);
        expect(cost(sizes) + reserved[p] + CLASSIFIEDS_HEAD_COST).toBeLessThanOrEqual(CLASSIFIEDS_PAGE_BUDGET);
        // Entries remain after this page, yet not even a line fits: no blank band.
        const leftover = CLASSIFIEDS_PAGE_BUDGET - CLASSIFIEDS_HEAD_COST - reserved[p] - cost(sizes);
        expect(leftover).toBeLessThan(CLASSIFIEDS_SIZE_COST.line);
      });
    }
  });

  it('fits fourteen notes on one page, and two pages once coupons take space', () => {
    const one = layoutClassifieds(notes(14));
    expect(one.pages).toHaveLength(1);
    expect(one.truncated).toBe(false);
    const two = layoutClassifieds(notes(14), 4);
    expect(two.pages).toHaveLength(2);
    expect(two.truncated).toBe(false);
  });

  it('steps the twelfth note down to small when coupons take space', () => {
    const rows = notes(14);
    const { pages } = layoutClassifieds(rows, 4);
    const twelfthId = rankEntries(rows)[12].id;
    const twelfth = pages.flat().find((s) => s.entry.id === twelfthId);
    expect(twelfth?.size).toBe('small');
  });

  it('ends the second page with one line on the live mix', () => {
    const { pages } = layoutClassifieds(liveMix());
    expect(pages).toHaveLength(CLASSIFIEDS_MAX_PAGES);
    const last = pages[1][pages[1].length - 1];
    expect(last.size).toBe('line');
  });

  it('returns no pages for no entries', () => {
    expect(layoutClassifieds([])).toEqual({ pages: [], truncated: false });
  });

  it('reserves the section head inside the budget: entries still fill the old sheet', () => {
    // The head ornament costs space without reflowing the entries: the net
    // sheet is what it always was.
    expect(CLASSIFIEDS_PAGE_BUDGET - CLASSIFIEDS_HEAD_COST).toBe(146);
  });
});
