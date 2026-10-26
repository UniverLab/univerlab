import { solDayOfYear } from './mission-time';
import { activeRoadmap, laneRows, LANE_ORDER, topicOf, type RoadmapItem } from './lab-feed';

export interface EntriesSummary {
  count: number;
  last_date: string | null;
  last_id: string | null;
}

export interface RoadmapCardItem {
  id: string;
  title: string;
  state: string;
  topic: string | null;
  essence_hex?: string | null;
  blocked_reason?: string | null;
  summary?: string | null;
  shipped_at?: string | null;
  updatedAt?: string | null;
  pos: number;
  entries?: EntriesSummary | null;
}

const ROADMAP_PEEK = 2;

export function shouldShowEntriesMeta(
  entries: EntriesSummary | null | undefined,
): boolean {
  return !!entries && (entries.count ?? 0) > 0;
}

export function peekLane<T>(rows: T[], opts?: { collapsed?: boolean; peek?: number }): {
  visible: T[];
  hiddenCount: number;
} {
  const collapsed = opts?.collapsed ?? true;
  const peek = opts?.peek ?? ROADMAP_PEEK;
  if (!collapsed || rows.length <= peek) return { visible: rows.slice(), hiddenCount: 0 };
  return { visible: rows.slice(0, peek), hiddenCount: rows.length - peek };
}

/** DONE newest first: shipped_at DESC (lexicographic ISO), nulls last, tie pos ASC. */
export function sortDoneNewestFirst<T extends { shipped_at?: string | null; pos: number }>(
  rows: T[],
): T[] {
  return rows
    .slice()
    .sort((a, b) => {
      const sa = a.shipped_at ?? null;
      const sb = b.shipped_at ?? null;
      if (sa === sb) return a.pos - b.pos;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sa < sb ? 1 : -1;
    });
}

export function formatTemplate(tpl: string, vars: Record<string, string | number>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split('{' + k + '}').join(String(v));
  }
  return out;
}

export function entriesMetaText(
  tplOne: string,
  tplMany: string,
  count: number,
  lastDate: string | null,
): string {
  const sol = lastDate ? solDayOfYear(lastDate) : 0;
  return formatTemplate(count === 1 ? tplOne : tplMany, { n: count, sol });
}

export function landedText(tpl: string, shippedAt: string): string {
  return formatTemplate(tpl, { sol: solDayOfYear(shippedAt) });
}

export function moreText(tpl: string, n: number): string {
  return formatTemplate(tpl, { n });
}

function escHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RoadmapHtmlLabels {
  lanes?: Partial<Record<string, string>>;
  hold?: string;
  landed?: string;
  entriesMeta?: string;
  entriesMetaOne?: string;
}

export function roadmapLanesHtml(items: any, labels?: RoadmapHtmlLabels | any): string {
  const L = labels || {};
  const lanesMap = (L && L.lanes) ? L.lanes : L;
  const laneName = (lane: string): string => {
    if (lanesMap && lanesMap[lane]) return String(lanesMap[lane]);
    return lane.charAt(0).toUpperCase() + lane.slice(1);
  };
  const active = activeRoadmap(Array.isArray(items) ? items : []);
  let out = '';
  for (const lane of LANE_ORDER) {
    const rows = laneRows(active as any, lane as any) as any[];
    if (!rows.length) continue;
    out += `<section class="rm-seg" data-lane="${escHtml(lane)}" aria-labelledby="lane-${escHtml(lane)}">`;
    out += `<h2 id="lane-${escHtml(lane)}">${escHtml(laneName(lane))} <span class="rm-count">${rows.length}</span></h2>`;
    for (const item of rows) {
      const id = item.id;
      out += `<article class="rm-card" data-roadmap-id="${escHtml(id)}">`;
      out += `<h3 class="rm-title">${escHtml(item.title)}</h3>`;
      if (item.summary != null && String(item.summary).trim() !== '') {
        out += `<p class="rm-summary">${escHtml(item.summary)}</p>`;
      }
      const topic = topicOf(item.topic);
      let meta = `<span class="rm-topic">${escHtml(topic)}</span>`;
      if (shouldShowEntriesMeta(item.entries)) {
        const e = item.entries;
        const text = entriesMetaText(
          (L && L.entriesMetaOne) || '1 log entry · last Sol {sol}',
          (L && L.entriesMeta) || '{n} log entries · last Sol {sol}',
          e.count,
          e.last_date,
        );
        meta += ` <a href="/status/?roadmap=${escHtml(id)}" class="rm-entries">${escHtml(text)}</a>`;
      }
      if (item.state === 'done' && item.shipped_at) {
        const text = landedText((L && L.landed) || 'landed Sol {sol}', item.shipped_at);
        meta += ` <time class="rm-landed" datetime="${escHtml(item.shipped_at)}">${escHtml(text)}</time>`;
      }
      out += `<div class="rm-meta">${meta}</div>`;
      if (item.blocked_reason) {
        out += `<div class="rm-hold">${escHtml((L && L.hold) || 'hold')}: ${escHtml(item.blocked_reason)}</div>`;
      }
      out += `</article>`;
    }
    out += `</section>`;
  }
  return out;
}
