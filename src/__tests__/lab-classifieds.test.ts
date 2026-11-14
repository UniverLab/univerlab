import {
  CLASSIFIEDS_DISPLAY_COUNT,
  CLASSIFIEDS_MAX_PAGES,
  CLASSIFIEDS_PAGE_SLOTS,
  layoutClassifieds,
  rankEntries,
  sizeForRank,
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

/** Twelve newest-first notes: the small case of one page, no lines. */
const notes12: Entry[] = Array.from({ length: 12 }, (_, i) => {
  const day = String(20 - i).padStart(2, '0');
  return at(`n${i}`, `2026-10-${day}T10:00:00.000Z`, 'note');
});

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

describe('sizeForRank', () => {
  it('takes two display, six boxed, ten small, then lines', () => {
    const sizes = Array.from({ length: 20 }, (_, i) => sizeForRank(i));
    expect(sizes.slice(0, 2)).toEqual(['display', 'display']);
    expect(sizes.slice(2, 8)).toEqual(Array(6).fill('boxed'));
    expect(sizes.slice(8, 18)).toEqual(Array(10).fill('small'));
    expect(sizes.slice(18)).toEqual(['line', 'line']);
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
    const first = layoutClassifieds(rows);
    const shuffled = layoutClassifieds([...rows].reverse());
    expect(shuffled).toEqual(first);
  });

  it('gives the newest releases the display ads', () => {
    const rows: Entry[] = [
      at('note-new', '2026-10-06T10:00:00.000Z', 'note'),
      at('launch-old', '2026-09-01T10:00:00.000Z', 'launch'),
      at('launch-new', '2026-10-05T10:00:00.000Z', 'launch'),
    ];
    const { pages } = layoutClassifieds(rows);
    expect(pages).toHaveLength(1);
    expect(pages[0].map((s) => s.entry.id)).toEqual(['launch-new', 'launch-old', 'note-new']);
    expect(pages[0].map((s) => s.size)).toEqual(['display', 'display', 'boxed']);
  });

  it('fits twelve entries on one page and never leaves an empty one', () => {
    const { pages, truncated } = layoutClassifieds(notes12);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(12);
    expect(truncated).toBe(false);
  });

  it('caps each page at fourteen slots', () => {
    const rows: Entry[] = Array.from({ length: 20 }, (_, i) => {
      const day = String(28 - i).padStart(2, '0');
      return at(`e${i}`, `2026-09-${day}T10:00:00.000Z`, i < 3 ? 'launch' : 'note');
    });
    const { pages, truncated } = layoutClassifieds(rows);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(CLASSIFIEDS_PAGE_SLOTS);
    expect(pages[1]).toHaveLength(6);
    expect(truncated).toBe(false);
  });

  it('leaves the oldest out past two pages and reports truncated', () => {
    const rows: Entry[] = Array.from({ length: 40 }, (_, i) => {
      const day = String(30 - (i % 30)).padStart(2, '0');
      const month = i < 30 ? '10' : '09';
      return at(`e${i}`, `2026-${month}-${day}T10:00:00.000Z`, i % 5 === 0 ? 'launch' : 'note');
    });
    const { pages, truncated } = layoutClassifieds(rows);
    expect(pages).toHaveLength(CLASSIFIEDS_MAX_PAGES);
    expect(pages[0]).toHaveLength(CLASSIFIEDS_PAGE_SLOTS);
    expect(pages[1]).toHaveLength(CLASSIFIEDS_PAGE_SLOTS);
    expect(truncated).toBe(true);
    const kept = new Set(pages.flat().map((s) => s.entry.id));
    expect(kept.size).toBe(CLASSIFIEDS_PAGE_SLOTS * CLASSIFIEDS_MAX_PAGES);
    // The kept entries outrank the dropped ones: the eight launches read first.
    const firstPageIds = pages[0].map((s) => s.entry.id);
    expect(firstPageIds.slice(0, CLASSIFIEDS_DISPLAY_COUNT).every((id) => rows.find((e) => e.id === id)?.type === 'launch')).toBe(true);
  });

  it('steps the oldest boxed and small ads down to lines, oldest first', () => {
    // Thirty notes run two past the 28 slots: the two oldest small ads
    // (ranks 16 and 17) read as one-line notices, and the two oldest-ranked
    // entries are left out — two pages of fourteen, truncated. All notes,
    // so ranks 2-7 read boxed and ranks 8-17 small.
    const rows: Entry[] = Array.from({ length: 30 }, (_, i) => {
      const day = String(30 - i).padStart(2, '0');
      return at(`e${i}`, `2026-08-${day}T10:00:00.000Z`, 'note');
    });
    const { pages, truncated } = layoutClassifieds(rows);
    expect(truncated).toBe(true);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(14);
    expect(pages[1]).toHaveLength(14);
    const kept = pages.flat();
    expect(kept).toHaveLength(28);
    expect(kept.map((s) => s.entry.id)).not.toContain('e28');
    expect(kept.map((s) => s.entry.id)).not.toContain('e29');
    const count = (size: string): number => kept.filter((s) => s.size === size).length;
    // The two oldest small ads (e16, e17) read as lines; the boxed six stay.
    expect(count('display')).toBe(2);
    expect(count('boxed')).toBe(6);
    expect(count('small')).toBe(8);
    expect(count('line')).toBe(12);
    const byId = new Map(kept.map((s) => [s.entry.id, s.size] as const));
    expect(byId.get('e16')).toBe('line');
    expect(byId.get('e17')).toBe('line');
    expect(byId.get('e15')).toBe('small');
  });

  it('demotes only as many as the overflow needs, newest boxed ads keep theirs', () => {
    // Forty notes run twelve past the 28 slots: every small ad and the two
    // oldest boxed ads step down, while the four newest boxed ads (e2-e5)
    // keep their boxes.
    const mk = (n: number): Entry[] =>
      Array.from({ length: n }, (_, i) => ({
        ...at(`e${i}`, new Date(Date.UTC(2026, 7, 30) - i * 86400000).toISOString(), 'note'),
      }));
    const { pages, truncated } = layoutClassifieds(mk(40));
    expect(truncated).toBe(true);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(14);
    expect(pages[1]).toHaveLength(14);
    const kept = pages.flat();
    expect(kept).toHaveLength(28);
    expect(kept.map((s) => s.entry.id)).not.toContain('e39');
    const count = (size: string): number => kept.filter((s) => s.size === size).length;
    expect(count('display')).toBe(2);
    expect(count('boxed')).toBe(4);
    expect(count('small')).toBe(0);
    expect(count('line')).toBe(22);
    const byId = new Map(kept.map((s) => [s.entry.id, s.size] as const));
    for (const id of ['e2', 'e3', 'e4', 'e5']) expect(byId.get(id)).toBe('boxed');
    for (const id of ['e6', 'e7', 'e8']) expect(byId.get(id)).toBe('line');
  });

  it('leaves the oldest out past twenty-eight entries', () => {
    // Twenty-eight entries fill two pages of fourteen; the 29th has nowhere
    // to go: the two pages keep their 28 and report truncated.
    const mk = (n: number): Entry[] =>
      Array.from({ length: n }, (_, i) => {
        const day = String(31 - i).padStart(2, '0');
        return at(`e${i}`, `2026-08-${day}T10:00:00.000Z`, 'note');
      });
    const over = layoutClassifieds(mk(29));
    expect(over.truncated).toBe(true);
    expect(over.pages).toHaveLength(2);
    expect(over.pages.flat()).toHaveLength(28);
    expect(over.pages.flat().map((s) => s.entry.id)).not.toContain('e28');
  });

  it('returns no pages for no entries', () => {
    expect(layoutClassifieds([])).toEqual({ pages: [], truncated: false });
  });
});
