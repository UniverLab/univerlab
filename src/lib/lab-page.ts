// Page 2 of the newspaper — the lab logbook in the paper's own type.
// One server renderer for the edge (functions/_middleware.ts fills #lab-body
// through HTMLRewriter), the client (pages/newspaper.astro fills #lab-body
// when the edge did not) and the markdown twin (/newspaper/index.md).
// Escape every text field from the feed.

import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { labPlateHtml } from './paper-plate';
import { liveExperiments } from './experiments';
import { paperCouponsHtml, paperCouponsMarkdown } from './paper-coupons';
import { normalizeTopic } from './field-notes';
import { entriesMarkdown, sortEntries, type Entry } from './lab-feed';

export { sortEntries };
export type { Entry } from './lab-feed';

export type LabPageLang = 'en' | 'es';

/** Topics with a filter button, in order: general first, then the registry. */
export const LAB_TOPICS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'general', label: 'General' },
  ...liveExperiments.map((e) => ({ id: e.id, label: e.name })),
];

/** Entry types with a filter button, in the logbook's own order. */
export const LAB_TYPES: ReadonlyArray<string> = ['launch', 'deploy', 'bugfix', 'note', 'incident'];

/** How many entries read before the older control folds the rest. */
export const LAB_SHOWN = 10;

type Dict = (typeof en)['today'];

const dict = (lang: LabPageLang): Dict => (lang === 'es' ? es.today : en.today);

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkify(text: string): string {
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

/** The mission-date label, byte-for-byte the status page's format. */
function logDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const start = new Date(y, 0, 0);
  const sol = Math.floor((d.getTime() - start.getTime()) / 86400000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y} · Sol ${sol} · ${hh}:${mm} UTC`;
}

function typeLabel(raw: unknown, t: Dict): string {
  const id = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (t.types as Record<string, string>)[id] || (typeof raw === 'string' ? raw : '');
}

function filterButtons(
  kind: 'topic' | 'type',
  items: ReadonlyArray<{ id: string; label: string; count: number }>,
): string {
  const attr = kind === 'topic' ? 'data-topic' : 'data-type';
  const btn = (id: string, label: string, count: number): string =>
    `<button type="button" class="lab-filter" ${attr}="${esc(id)}" aria-pressed="${id === 'all'}">` +
    `${esc(label)}<span class="lab-filter-count">${count}</span></button>`;
  const shown = items.filter((i) => i.id === 'all' || i.count > 0);
  return shown.map((i) => btn(i.id, i.label, i.count)).join('');
}

/** Page 2's inner HTML: everything inside `#lab-body`. When the lab feed
 *  could not be read (`unavailable`) and there is nothing to print, the page
 *  says so in one line instead of showing empty filter rows. */
export function labPageHtml(
  entries: Entry[],
  lang: LabPageLang,
  opts?: { unavailable?: boolean; foundingLeft?: number | null },
): string {
  const t = dict(lang);
  const rows = sortEntries(entries || []);
  if (!rows.length && opts?.unavailable) {
    return `<h2 class="lab-heading">${esc(t.labPage.heading)}</h2>` +
      labPlateHtml(lang) +
      paperCouponsHtml(lang, opts?.foundingLeft) +
      `<p class="lab-empty">${esc(t.labPage.unavailable)}</p>`;
  }

  const topicCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  for (const e of rows) {
    const topic = normalizeTopic(e.topic);
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    if (typeof e.type === 'string' && (LAB_TYPES as ReadonlyArray<string>).includes(e.type)) {
      typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
    }
  }
  const topics = LAB_TOPICS.map((topic) => ({
    id: topic.id,
    label: topic.label,
    count: topicCounts.get(topic.id) ?? 0,
  }));
  const types = LAB_TYPES.map((id) => ({
    id,
    label: typeLabel(id, t),
    count: typeCounts.get(id) ?? 0,
  }));

  let out = `<h2 class="lab-heading">${esc(t.labPage.heading)}</h2>`;
  out += paperCouponsHtml(lang, opts?.foundingLeft);
  out +=
    `<div class="lab-filters">` +
    `<div class="lab-filter-row" data-kind="topic">${filterButtons('topic', [{ id: 'all', label: t.labPage.all, count: rows.length }, ...topics])}</div>` +
    `<div class="lab-filter-row" data-kind="type">${filterButtons('type', [{ id: 'all', label: t.labPage.all, count: rows.length }, ...types])}</div>` +
    `</div>`;
  out += `<div id="lab-log" data-shown="${LAB_SHOWN}">`;
  out += labPlateHtml(lang);
  rows.forEach((e, i) => {
    const topic = normalizeTopic(e.topic);
    const type = typeof e.type === 'string' ? e.type.toLowerCase() : '';
    const folded = i >= LAB_SHOWN ? ' is-folded' : '';
    // The classifieds display line is set by the entry's type: a release
    // reads largest, a note smallest.
    const size = type === 'launch' || type === 'deploy' ? 'sz-lg' : type === 'incident' ? 'sz-md' : 'sz-sm';
    const meta =
      (type ? `<span class="type-badge">${esc(typeLabel(type, t))}</span>` : '') +
      `<time datetime="${esc(e.date)}" data-mission="">${esc(logDate(e.date))}</time>` +
      (e.link
        ? `<a class="log-link" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${esc(t.labPage.view)}</a>`
        : '');
    out +=
      `<article class="log-entry${folded}" data-topic="${esc(topic)}" data-type="${esc(type)}" data-roadmap="${esc(e.roadmap_id || '')}">` +
      `<div class="entry-body"><h3 class="${size}">${esc(e.title || '')}</h3>` +
      `<p>${linkify(e.body || '')}</p>` +
      `<p class="entry-meta">${meta}</p>` +
      `</div></article>`;
  });
  out += `</div>`;
  out += `<button type="button" id="lab-older" hidden>${esc(t.labPage.older)}</button>`;
  return out;
}

/** The twin's second page: the heading over the shared entry lines, or over
 *  the one unavailable line when the feed could not be read. */
export function labPageMarkdown(
  entries: Entry[],
  lang: LabPageLang,
  opts?: { unavailable?: boolean; foundingLeft?: number | null },
): string {
  const t = dict(lang);
  if (!(entries || []).length && opts?.unavailable) {
    return `## ${t.labPage.heading}\n\n${paperCouponsMarkdown(lang, opts?.foundingLeft)}\n\n${t.labPage.unavailable}`;
  }
  const body = entriesMarkdown(entries || [], { labels: { empty: '' } });
  return `## ${t.labPage.heading}\n\n${paperCouponsMarkdown(lang, opts?.foundingLeft)}\n\n${body}`;
}
