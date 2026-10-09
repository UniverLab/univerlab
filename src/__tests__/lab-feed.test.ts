/**
 * The shared lab feed (AGR2 req 6) — one data layer, two readers.
 *
 * Everything here is pure or takes its `fetch` through `fetchImpl`, so the
 * browser (WebMCP tools), workerd (the markdown twin) and this file all reach
 * the same code. No test touches the network.
 */
import {
  activeRoadmap,
  ANNOUNCEMENTS_API,
  DONE_CAP,
  ENTRIES_URL,
  entriesMarkdown,
  entryLine,
  FEED_URL,
  filterEntries,
  firstParagraph,
  isoDate,
  LANE_ORDER,
  laneRows,
  loadEntries,
  loadRoadmap,
  roadmapLine,
  roadmapMarkdown,
  ROADMAP_URL,
  sortEntries,
  topicOf,
  type Entry,
  type Lane,
  type RoadmapItem,
} from '../lib/lab-feed';

function item(over: Partial<RoadmapItem> & { id: string; title: string; state: string }): RoadmapItem {
  return { pos: 0, topic: 'general', ...over };
}

function entry(over: Partial<Entry> & { id: string; title: string }): Entry {
  return {
    date: '2026-10-06T01:09:26.735Z',
    body: 'First paragraph.\n\nSecond paragraph that must not survive.',
    type: 'launch',
    topic: 'general',
    link: null,
    ...over,
  };
}

/** A `fetch` that answers one URL and records what it was called with. */
function api(handler: (url: string) => unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const body = handler(String(input));
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

// ------------------------------------------------------------------ constants

describe('the public endpoints', () => {
  it('names the two reads and the feed from one host', () => {
    expect(ANNOUNCEMENTS_API).toBe('https://announcements.univerlab.org');
    expect(ROADMAP_URL).toBe('https://announcements.univerlab.org/roadmap');
    expect(ENTRIES_URL).toBe('https://announcements.univerlab.org/');
    expect(FEED_URL).toBe('https://announcements.univerlab.org/feed.atom');
  });

  it('keeps the board order and the done cap the twin pins', () => {
    expect(LANE_ORDER).toEqual(['now', 'next', 'later', 'idea', 'done']);
    expect(DONE_CAP).toBe(10);
  });
});

// -------------------------------------------------------------------- helpers

describe('row helpers', () => {
  it('calls an empty or missing topic general', () => {
    expect(topicOf(null)).toBe('general');
    expect(topicOf(undefined)).toBe('general');
    expect(topicOf('   ')).toBe('general');
    expect(topicOf(' canopy ')).toBe('canopy');
  });

  it('cuts an ISO instant to its date', () => {
    expect(isoDate('2026-10-06T01:09:26.735Z')).toBe('2026-10-06');
    expect(isoDate('2026-10-06')).toBe('2026-10-06');
  });

  it('flattens only the first paragraph of a body', () => {
    expect(firstParagraph('one\n  two\n\nrest')).toBe('one two');
    expect(firstParagraph('solo')).toBe('solo');
  });

  it('drops archived rows', () => {
    const rows = [
      item({ id: 'a', title: 'Active', state: 'now' }),
      item({ id: 'b', title: 'Archived', state: 'now', archived_at: 1758000000000 }),
    ];
    expect(activeRoadmap(rows).map((r) => r.id)).toEqual(['a']);
  });

  it('prints title, topic and the hold reason on one line', () => {
    expect(roadmapLine(item({ id: 'a', title: 'Now one', state: 'now' }))).toBe(
      '- **Now one** · general',
    );
    expect(
      roadmapLine(
        item({ id: 'b', title: 'Blocked', state: 'now', topic: 'canopy', blocked_reason: 'on review' }),
        'hold',
      ),
    ).toBe('- **Blocked** · canopy — hold: on review');
  });

  it('prints an entry as one line, with and without a link', () => {
    expect(entryLine(entry({ id: 'e1', title: 'Launched', link: 'https://example.com/x' }))).toBe(
      '- **2026-10-06** · launch · general — **Launched**: First paragraph. [link](https://example.com/x)',
    );
    expect(entryLine(entry({ id: 'e2', title: 'Note', type: 'note', topic: null, link: null }))).toBe(
      '- **2026-10-06** · note · general — **Note**: First paragraph.',
    );
  });
});

// --------------------------------------------------------------- lane ordering

describe('laneRows', () => {
  it('orders by pos outside done', () => {
    const rows = [
      item({ id: 'b', title: 'B', state: 'next', pos: 5 }),
      item({ id: 'a', title: 'A', state: 'next', pos: 1 }),
    ];
    expect(laneRows(rows, 'next').map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('orders done newest-first by shipped_at and caps it', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      item({
        id: `d${i}`,
        title: `Shipment ${i}`,
        state: 'done',
        pos: i,
        shipped_at: `2026-01-${String(1 + i).padStart(2, '0')}T00:00:00Z`,
      }),
    );
    const done = laneRows(many, 'done');
    expect(done).toHaveLength(DONE_CAP);
    expect(done[0].id).toBe('d11');
    expect(done.map((r) => r.id)).not.toContain('d0');
  });

  it('sorts a done item with no shipped_at last, not first', () => {
    const rows = [
      item({ id: 'u', title: 'Undated', state: 'done', pos: 0, shipped_at: null }),
      item({ id: 'd', title: 'Dated', state: 'done', pos: 1, shipped_at: '2026-05-01T00:00:00Z' }),
    ];
    expect(laneRows(rows, 'done').map((r) => r.id)).toEqual(['d', 'u']);
  });

  it('does not mutate the rows it was given', () => {
    const rows = [
      item({ id: 'b', title: 'B', state: 'next', pos: 5 }),
      item({ id: 'a', title: 'A', state: 'next', pos: 1 }),
    ];
    laneRows(rows, 'next');
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

// ------------------------------------------------------------------- roadmap

describe('roadmapMarkdown', () => {
  const roadmap = [
    item({ id: 'n1', title: 'Now one', state: 'now', pos: 1, blocked_reason: 'waiting on review' }),
    item({ id: 'x1', title: 'Archived one', state: 'now', pos: 0, archived_at: 1758000000000 }),
    item({ id: 'nn', title: 'Next one', state: 'next', pos: 5, topic: 'canopy' }),
    item({ id: 'l1', title: 'Later one', state: 'later', pos: 2 }),
    item({ id: 'd1', title: 'Shipped', state: 'done', pos: 3, shipped_at: '2026-09-01T00:00:00Z' }),
  ];

  it('groups non-empty lanes in board order and skips the empty ones', () => {
    const md = roadmapMarkdown(roadmap);
    expect(md.match(/^### .*$/gm)).toEqual(['### Now', '### Next', '### Later', '### Done']);
    expect(md).not.toContain('### Idea');
    expect(md).not.toContain('Archived one');
    expect(md).toContain('- **Now one** · general — hold: waiting on review');
    expect(md).toContain('- **Next one** · canopy');
  });

  it('takes its labels from the caller, so the twin keeps its own copy', () => {
    const md = roadmapMarkdown(roadmap, {
      labels: { lanes: { now: 'Ahora', done: 'Hecho' }, hold: 'en espera' },
    });
    expect(md).toContain('### Ahora');
    expect(md).toContain('### Hecho');
    expect(md).toContain('— en espera: waiting on review');
    expect(md).toContain('### Next');
  });

  it('filters to one topic', () => {
    const md = roadmapMarkdown(roadmap, { topic: 'canopy' });
    expect(md).toBe('### Next\n\n- **Next one** · canopy');
  });

  it('filters to one lane', () => {
    const md = roadmapMarkdown(roadmap, { lane: 'later' });
    expect(md).toBe('### Later\n\n- **Later one** · general');
  });

  it('says so when nothing matches', () => {
    expect(roadmapMarkdown(roadmap, { topic: 'quorum' })).toBe('Nothing on the roadmap.');
    expect(roadmapMarkdown(roadmap, { topic: 'quorum', labels: { empty: '' } })).toBe('');
  });
});

// ---------------------------------------------------------------- mission log

describe('entry ordering and filtering', () => {
  const log: Entry[] = [
    entry({ id: 'a', title: 'Older', date: '2026-08-01T10:00:00Z', topic: 'canopy', type: 'note' }),
    entry({ id: 'c', title: 'Same day, later id', date: '2026-09-03T10:00:00Z', topic: 'general' }),
    entry({ id: 'b', title: 'Newest', date: '2026-09-03T10:00:00Z', topic: 'gitkit', type: 'release' }),
  ];

  it('sorts newest first, id desc as the tie-break — the API’s own order', () => {
    expect(sortEntries(log).map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('filters by topic and by type, without disturbing the order', () => {
    expect(filterEntries(log, { topic: 'canopy' }).map((e) => e.id)).toEqual(['a']);
    expect(filterEntries(log, { type: 'release' }).map((e) => e.id)).toEqual(['b']);
    expect(filterEntries(log, { topic: 'general', type: 'note' })).toEqual([]);
  });

  it('caps at the limit', () => {
    expect(filterEntries(log, { limit: 2 }).map((e) => e.id)).toEqual(['c', 'b']);
  });

  it('renders one line per entry and says so when empty', () => {
    const md = entriesMarkdown(log, { limit: 2 });
    expect(md.split('\n')).toHaveLength(2);
    expect(md.startsWith('- **2026-09-03** · launch · general — **Same day, later id**')).toBe(true);
    expect(entriesMarkdown(log, { topic: 'quorum' })).toBe('Nothing in the Mission Log.');
    expect(entriesMarkdown(log, { topic: 'quorum', labels: { empty: '' } })).toBe('');
  });
});

// --------------------------------------------------------------------- loads

describe('loadRoadmap', () => {
  it('asks for 100 rows and drops the archived ones', async () => {
    const { fetchImpl, calls } = api(() => ({
      items: [
        item({ id: 'a', title: 'Active', state: 'now' }),
        item({ id: 'b', title: 'Archived', state: 'now', archived_at: 1 }),
      ],
    }));
    const rows = await loadRoadmap({ fetchImpl });
    expect(calls[0].url).toBe('https://announcements.univerlab.org/roadmap?limit=100');
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('passes the caller’s init and signal straight through', async () => {
    const { fetchImpl, calls } = api(() => ({ items: [] }));
    const controller = new AbortController();
    await loadRoadmap({ fetchImpl, signal: controller.signal, init: { method: 'GET' } });
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.signal).toBe(controller.signal);
  });

  it('honours an explicit limit', async () => {
    const { fetchImpl, calls } = api(() => ({ items: [] }));
    await loadRoadmap({ fetchImpl, limit: 20 });
    expect(calls[0].url).toBe('https://announcements.univerlab.org/roadmap?limit=20');
  });

  it('renders an unexpected body as an empty board, never a 500', async () => {
    const { fetchImpl } = api(() => ({ nope: true }));
    expect(await loadRoadmap({ fetchImpl })).toEqual([]);
  });

  it('throws on a non-OK read, so the caller can fall back', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(loadRoadmap({ fetchImpl })).rejects.toThrow('503');
  });
});

describe('loadEntries', () => {
  it('asks for 100 rows and keeps the API’s order', async () => {
    const { fetchImpl, calls } = api(() => ({ entries: [entry({ id: 'b', title: 'B' }), entry({ id: 'a', title: 'A', date: '2026-01-01T00:00:00Z' })] }));
    const rows = await loadEntries({ fetchImpl });
    expect(calls[0].url).toBe('https://announcements.univerlab.org/?limit=100');
    expect(rows.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('honours an explicit limit', async () => {
    const { fetchImpl, calls } = api(() => ({ entries: [] }));
    await loadEntries({ fetchImpl, limit: 20 });
    expect(calls[0].url).toBe('https://announcements.univerlab.org/?limit=20');
  });

  it('renders an unexpected body as an empty log', async () => {
    const { fetchImpl } = api(() => 'not json');
    expect(await loadEntries({ fetchImpl })).toEqual([]);
  });

  it('throws on a non-OK read', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    await expect(loadEntries({ fetchImpl })).rejects.toThrow('500');
  });

  it('rejects when the body does not parse', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => {
        throw new Error('bad json');
      },
    })) as unknown as typeof fetch;
    await expect(loadEntries({ fetchImpl })).rejects.toThrow('bad json');
  });
});

describe('lane type', () => {
  it('is the union the tool schema advertises', () => {
    const lane: Lane = 'idea';
    expect(LANE_ORDER).toContain(lane);
  });
});
