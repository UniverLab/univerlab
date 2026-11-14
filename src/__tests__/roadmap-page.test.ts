import { roadmapLanesHtml } from '../lib/roadmap-board';
import { activeRoadmap, laneRows, BOARD_LANES, DONE_CAP } from '../lib/lab-feed';
import { en } from '../i18n/en';

function item(over: any) {
  return { id: 'x', title: 'X', state: 'next', topic: 'general', pos: 0, ...over };
}

describe('roadmapLanesHtml', () => {
  const items = [
    item({ id: 'n1', title: 'Now one', state: 'now', pos: 1 }),
    item({ id: 'arch', title: 'Archived', state: 'now', pos: 0, archived_at: 1 }),
    item({ id: 'a', title: 'A <script>', state: 'later', pos: 2, summary: 'sum' }),
    item({ id: 'd1', title: 'Shipped 1', state: 'done', pos: 0, shipped_at: '2026-09-02T00:00:00Z', blocked_reason: 'r', entries: { count: 2, last_date: '2026-07-18T10:00:00Z', last_id: 'm1' } }),
    item({ id: 'd0', title: 'Shipped 0', state: 'done', pos: 1, shipped_at: '2026-09-01T00:00:00Z' }),
  ];

  it('renders every active item once', () => {
    const html = roadmapLanesHtml(items, en.roadmap);
    expect((html.match(/class="rm-card"/g) || []).length).toBe(4);
    expect(html).toContain('Now one');
    expect(html).toContain('A &lt;script&gt;');
    expect(html).not.toContain('Archived');
  });

  it('renders the four board lanes in order, with no idea lane', () => {
    expect(BOARD_LANES).toEqual(['now', 'next', 'later', 'done']);
    const html = roadmapLanesHtml(
      [
        item({ id: 'n', title: 'N', state: 'now' }),
        item({ id: 'x', title: 'X', state: 'next' }),
        item({ id: 'l', title: 'L', state: 'later' }),
        item({ id: 'i', title: 'I', state: 'idea' }),
        item({ id: 'd', title: 'D', state: 'done', shipped_at: '2026-09-01T00:00:00Z' }),
      ],
      en.roadmap,
    );
    const idx = (lane: string) => html.indexOf(`data-lane="${lane}"`);
    expect(idx('now')).toBeGreaterThanOrEqual(0);
    expect(idx('now')).toBeLessThan(idx('next'));
    expect(idx('next')).toBeLessThan(idx('later'));
    expect(idx('later')).toBeLessThan(idx('done'));
    expect(idx('idea')).toBe(-1);
    expect(html).not.toContain('>I<');
  });

  it('renders every now/next/later row with no fold', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      item({ id: `l${i}`, title: `Later ${i}`, state: 'later', pos: i }),
    );
    const html = roadmapLanesHtml(many, en.roadmap);
    for (let i = 0; i < 5; i += 1) expect(html).toContain(`Later ${i}`);
    expect((html.match(/class="rm-card"/g) || []).length).toBe(5);
    expect(html).not.toContain('data-lane-more');
  });

  it('done capped newest first, with a see-all control that expands in place', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      item({ id: `d${i}`, title: `Shipment ${i}`, state: 'done', pos: i, shipped_at: `2026-01-${String(1 + i).padStart(2, '0')}T00:00:00Z` }),
    );
    const html = roadmapLanesHtml(many, en.roadmap);
    expect((html.match(/class="rm-card"/g) || []).length).toBe(DONE_CAP);
    expect(html).toContain('Shipment 11');
    expect(html).not.toContain('Shipment 0<');
    expect(html.indexOf('Shipment 11')).toBeLessThan(html.indexOf('Shipment 10'));
    expect(html).toContain('data-lane-more="done"');
    expect(html).toContain(en.roadmap.showAll);

    const open = roadmapLanesHtml(many, en.roadmap, { doneOpen: true });
    expect((open.match(/class="rm-card"/g) || []).length).toBe(12);
    expect(open).toContain('Shipment 0');
    expect(open).toContain(en.roadmap.showLess);
    expect(open).toContain('aria-expanded="true"');
  });

  it('paints the topic chip in the topic colour', () => {
    const html = roadmapLanesHtml(
      [item({ id: 'f', title: 'Facet', state: 'now', topic: 'facetmedia', essence_hex: '#e8c547' })],
      en.roadmap,
      { colors: { facetmedia: '#e8c547' } },
    );
    expect(html).toContain('facetmedia');
    expect(html).toContain('--topic:#e8c547');
  });

  it('falls back to the palette colour when the row has no essence_hex', () => {
    const html = roadmapLanesHtml(
      [item({ id: 'c', title: 'Canopy work', state: 'now', topic: 'canopy' })],
      en.roadmap,
      { colors: { canopy: '#00a9a0' } },
    );
    expect(html).toContain('--topic:#00a9a0');
  });
});
