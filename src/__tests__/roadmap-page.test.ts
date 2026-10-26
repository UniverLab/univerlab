import { roadmapLanesHtml } from '../lib/roadmap-board';
import { activeRoadmap, laneRows, LANE_ORDER, DONE_CAP } from '../lib/lab-feed';
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

  it('lanes follow LANE_ORDER', () => {
    const html = roadmapLanesHtml(items, en.roadmap);
    const idxNow = html.indexOf('data-lane="now"');
    const idxLater = html.indexOf('data-lane="later"');
    const idxDone = html.indexOf('data-lane="done"');
    expect(idxNow).toBeLessThan(idxLater);
    expect(idxLater).toBeLessThan(idxDone);
  });

  it('done capped and newest first', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      item({ id: `d${i}`, title: `Shipment ${i}`, state: 'done', pos: i, shipped_at: `2026-01-${String(1 + i).padStart(2, '0')}T00:00:00Z` }),
    );
    const html = roadmapLanesHtml(many, en.roadmap);
    expect((html.match(/class="rm-card"/g) || []).length).toBe(DONE_CAP);
    expect(html).toContain('Shipment 11');
    expect(html).not.toContain('Shipment 0<');
    expect(html.indexOf('Shipment 11')).toBeLessThan(html.indexOf('Shipment 10'));
  });
});