/**
 * Roadmap flight-plan UI (lroad-ui-v2) — pure-helper + source-guard tests.
 * No live announcements API calls.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { solDayOfYear, formatMissionDate, formatSolLabel } from '../lib/mission-time';
import {
  peekLane,
  shouldShowEntriesMeta,
  sortDoneNewestFirst,
  formatTemplate,
  entriesMetaText,
  landedText,
  moreText,
  type RoadmapCardItem,
} from '../lib/roadmap-board';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

function card(overrides: Partial<RoadmapCardItem> = {}): RoadmapCardItem {
  return {
    id: 'x',
    title: 'X',
    state: 'next',
    topic: 'general',
    pos: 0,
    ...overrides,
  };
}

function fixture(): RoadmapCardItem[] {
  const rows: RoadmapCardItem[] = [];
  rows.push(card({ id: 'now-1', state: 'now', pos: 0 }));
  for (let i = 0; i < 3; i += 1) rows.push(card({ id: `next-${i}`, state: 'next', pos: 1 + i }));
  for (let i = 0; i < 4; i += 1) rows.push(card({ id: `later-${i}`, state: 'later', pos: 4 + i }));
  rows.push(card({ id: 'idea-1', state: 'idea', pos: 8 }));
  for (let i = 0; i < 3; i += 1) {
    rows.push(
      card({ id: `done-${i}`, state: 'done', pos: 9 + i, shipped_at: `2026-09-1${4 + i}T10:00:00Z` }),
    );
  }
  return rows;
}

describe('roadmap peek (collapsed first-2 + more toggle)', () => {
  it('1 now / 3 next / 4 later / 1 idea / 3 done: later shows 2 + "+2 more"', () => {
    const rows = fixture();
    expect(rows.filter((r) => r.state === 'now')).toHaveLength(1);
    expect(rows.filter((r) => r.state === 'next')).toHaveLength(3);
    expect(rows.filter((r) => r.state === 'later')).toHaveLength(4);
    expect(rows.filter((r) => r.state === 'idea')).toHaveLength(1);
    expect(rows.filter((r) => r.state === 'done')).toHaveLength(3);

    const later = peekLane(rows.filter((r) => r.state === 'later'), { collapsed: true });
    expect(later.visible).toHaveLength(2);
    expect(later.hiddenCount).toBe(2);
    expect(moreText(en.roadmap.more, later.hiddenCount)).toBe('+2 more');
  });

  it('idea with 1 item has no more toggle', () => {
    const idea = peekLane(fixture().filter((r) => r.state === 'idea'), { collapsed: true });
    expect(idea.visible).toHaveLength(1);
    expect(idea.hiddenCount).toBe(0);
  });

  it('done peeks the same way when collapsed, all when expanded', () => {
    const done = fixture().filter((r) => r.state === 'done');
    const collapsed = peekLane(done, { collapsed: true });
    expect(collapsed.visible).toHaveLength(2);
    expect(collapsed.hiddenCount).toBe(1);
    const open = peekLane(done, { collapsed: false });
    expect(open.visible).toHaveLength(3);
    expect(open.hiddenCount).toBe(0);
  });
});

describe('entries meta visibility', () => {
  it('count 0 shows no entries meta; count 3 shows it', () => {
    expect(shouldShowEntriesMeta({ count: 0, last_date: null, last_id: null })).toBe(false);
    expect(shouldShowEntriesMeta({ count: 3, last_date: '2026-07-18T10:00:00Z', last_id: 'm1' })).toBe(true);
    expect(shouldShowEntriesMeta(null)).toBe(false);
    expect(shouldShowEntriesMeta(undefined)).toBe(false);
  });
});

describe('Sol parity with the Mission Log formatter', () => {
  it('shipped_at Sol matches the log formatter for the same instant', () => {
    const shippedAt = '2026-09-16T10:00:00Z';
    const sol = solDayOfYear(shippedAt);
    expect(formatMissionDate(shippedAt)).toContain(`Sol ${sol}`);
    expect(formatSolLabel(shippedAt)).toBe(`Sol ${sol}`);
    expect(landedText(en.roadmap.landed, shippedAt)).toBe(`landed Sol ${sol}`);
    expect(entriesMetaText(en.roadmap.entriesMetaOne, en.roadmap.entriesMeta, 1, shippedAt)).toBe(
      `1 log entry · last Sol ${sol}`,
    );
    expect(entriesMetaText(en.roadmap.entriesMetaOne, en.roadmap.entriesMeta, 3, shippedAt)).toBe(
      `3 log entries · last Sol ${sol}`,
    );
  });

  it('page script keeps the shared day-of-year algorithm', () => {
    const src = readFileSync(resolve(__dirname, '../pages/status.astro'), 'utf8');
    expect(src).toContain('new Date(y, 0, 0)');
    expect(src).toContain('86400000');
    expect(src).toContain('mission-time');
  });

  it('page inline formatter equals the shared formatter for the same instants', () => {
    // The page cannot import the lib (is:inline script), so it duplicates the
    // Sol math. Execute that duplicate against the shared helpers to catch drift
    // instead of trusting a substring match on the source.
    const src = readFileSync(resolve(__dirname, '../pages/status.astro'), 'utf8');
    const between = (from: string, to: string): string => {
      const a = src.indexOf(from);
      const b = src.indexOf(to);
      if (a === -1 || b === -1 || b <= a) throw new Error(`cannot isolate ${from}`);
      return src.slice(a, b);
    };
    const body =
      between('function formatDate', 'function solOf') +
      between('function solOf', 'function fillTpl');
    const page = new Function(`${body}; return { formatDate, solOf };`)() as {
      formatDate: (iso: string) => string;
      solOf: (iso: string) => number;
    };
    for (const iso of [
      '2026-01-01T00:00:00Z',
      '2026-09-16T10:00:00Z',
      '2026-07-18T10:00:00Z',
      '2024-02-29T23:30:00Z',
      '2026-12-31T23:59:00Z',
    ]) {
      expect(page.solOf(iso)).toBe(solDayOfYear(iso));
      expect(page.formatDate(iso)).toBe(formatMissionDate(iso));
    }
  });
});

describe('done order', () => {
  it('sorts done newest first by shipped_at, nulls last, tie pos ASC', () => {
    const rows = [
      card({ id: 'a', state: 'done', pos: 2, shipped_at: null }),
      card({ id: 'b', state: 'done', pos: 1, shipped_at: '2026-09-14T10:00:00Z' }),
      card({ id: 'c', state: 'done', pos: 0, shipped_at: '2026-09-16T10:00:00Z' }),
    ];
    expect(sortDoneNewestFirst(rows).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('template helper', () => {
  it('replaces every placeholder', () => {
    expect(formatTemplate('{n} of {n} · Sol {sol}', { n: 2, sol: 259 })).toBe('2 of 2 · Sol 259');
  });
});

describe('status.astro flight-plan guards', () => {
  const src = readFileSync(resolve(__dirname, '../pages/status.astro'), 'utf8');

  it('removes the orphan line', () => {
    expect(src).not.toContain('rm-quiet');
    expect(src).not.toContain('Project updates live at');
  });

  it('renders trajectory cards with dots, summaries and hold notes', () => {
    expect(src).toContain('rm-flight');
    expect(src).toContain('rm-dot');
    expect(src).toContain('rm-summary');
    expect(src).toContain('rm-hold');
    expect(src).toContain('rm-entries');
    expect(src).toContain('rm-seg');
  });

  it('uses shipped_at for done meta, not updatedAt', () => {
    expect(src).toMatch(/shipped_at/);
    expect(src).not.toMatch(/rm-date/);
  });

  it('wires the entries filter into the log with a clear chip', () => {
    expect(src).toContain('activeRoadmapId');
    expect(src).toContain('roadmap_id');
    expect(src).toContain('rm-clear');
  });

  it('stays read-only on the public page', () => {
    expect(src).not.toMatch(/contenteditable/i);
    expect(src).not.toMatch(/roadmap.*PATCH|PATCH.*roadmap/i);
    expect(src).not.toMatch(/<form[^>]*roadmap/i);
  });

  it('keeps the shared board-head RSS link', () => {
    expect(src).toMatch(/href="\/feed\/?"/);
  });
});

describe('roadmap i18n parity', () => {
  it('en and es carry the same roadmap keys', () => {
    expect(en).toHaveProperty('roadmap');
    expect(es).toHaveProperty('roadmap');
    expect(Object.keys(en.roadmap).sort()).toEqual(Object.keys((es as typeof en).roadmap).sort());
    expect(Object.keys(en.roadmap.lanes).sort()).toEqual(
      Object.keys((es as typeof en).roadmap.lanes).sort(),
    );
  });
});
