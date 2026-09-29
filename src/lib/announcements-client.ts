/** Shared two-fetch loader: announcements + roadmap, memoised on window. */
import type { Entry, RoadmapItem } from './field-notes';

export interface BoardData {
  entries: Entry[];
  roadmap: RoadmapItem[];
}

const KEY = '__labBoardData';
const API = 'https://announcements.univerlab.org';

export function loadBoardData(): Promise<BoardData | null> {
  const w = window as unknown as Record<string, unknown>;
  if (!w[KEY]) {
    w[KEY] = Promise.all([
      fetch(`${API}/?limit=100`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API}/roadmap?limit=100`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([e, rm]) => ({
        entries: Array.isArray((e as { entries?: unknown } | null)?.entries)
          ? (e as { entries: Entry[] }).entries
          : [],
        roadmap: Array.isArray((rm as { items?: unknown } | null)?.items)
          ? (rm as { items: RoadmapItem[] }).items.filter((i) => i.archived_at == null)
          : [],
      }))
      .catch(() => null);
  }
  return w[KEY] as Promise<BoardData | null>;
}
