import { roadmapMarkdown, type RoadmapItem } from '../src/lib/lab-feed';
import { en } from '../src/i18n/en';

export const SOURCE_URL = 'https://univerlab.org/roadmap/';

export function roadmapTwinRoute(pathname: string): boolean {
  const p = pathname.replace(/\/index\.md$/, '').replace(/\/+$/, '') || '/';
  return p === '/roadmap';
}

export function renderRoadmapTwin(items: RoadmapItem[]): string {
  const H = en.roadmap;
  const board = roadmapMarkdown(items, {
    labels: { lanes: H.lanes, hold: H.hold, empty: '' },
  });
  const out: string[] = [
    '---',
    'title: "Roadmap — what UniverLab is building now, next and later"',
    `source: "${SOURCE_URL}"`,
    '---',
    '',
  ];
  if (board) out.push(board, '');
  return out.join('\n');
}