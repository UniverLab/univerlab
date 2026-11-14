// Pages 2 and 3 of the newspaper — the lab's announcements as a classifieds
// section in four ad sizes, across at most two pages. One server renderer
// for the edge (functions/_middleware.ts fills #lab-body and #lab2-body
// through HTMLRewriter), the client (pages/newspaper.astro fills both when
// the edge did not) and the markdown twin (/newspaper/index.md).
// Escape every text field from the feed.

import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { entriesMarkdown, firstParagraph, sortEntries, type Entry } from './lab-feed';
import { layoutClassifieds, type AdSlot } from './lab-classifieds';
import { liveExperiments } from './experiments';
import { couponAdHtml, couponAds, couponNoteHtml, paperCouponsMarkdown, type CouponAd } from './paper-coupons';
import { normalizeTopic } from './field-notes';

export { sortEntries };
export type { Entry } from './lab-feed';

/** Experiment ids with an engraved machine plate under public/bench/. */
const PLATE_IDS: Set<string> = new Set(liveExperiments.map((e) => e.id));

export type LabPageLang = 'en' | 'es';

/** Topics with a filter button, in order: general first, then the registry. */
export const LAB_TOPICS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'general', label: 'General' },
  ...liveExperiments.map((e) => ({ id: e.id, label: e.name })),
];

/** Entry types with a filter button, in the logbook's own order. */
export const LAB_TYPES: ReadonlyArray<string> = ['launch', 'deploy', 'bugfix', 'note', 'incident'];

type Dict = (typeof en)['today'];

const dict = (lang: LabPageLang): Dict => (lang === 'es' ? es.today : en.today);

const prefix = (lang: LabPageLang): string => (lang === 'es' ? '/es' : '');

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Retired addresses the announcements still link: their redirect targets,
 *  byte-for-byte scripts/build-redirects.ts STATIC_RULES. */
const RETIRED: Record<string, string> = { '/status/': '/newspaper/#lab' };

/** Advertise the final URL: a same-site page link takes its trailing slash
 *  and a retired address resolves to its redirect target, so an indexable
 *  page never advertises a redirect (scripts/seo/final-urls.ts). Foreign
 *  hosts, files and the site root pass through untouched. */
export function finalEntryHref(raw: string): string {
  const m = /^(https?:\/\/univerlab\.org)?(\/[^?#]*)([?#].*)?$/.exec(raw || '');
  if (!m) return raw;
  const origin = m[1] || '';
  const path = m[2];
  const rest = m[3] || '';
  if (!path || path === '/') return raw;
  if (/\/[^/]+\.[a-z0-9]+$/i.test(path)) return raw;
  const slashed = path.endsWith('/') ? path : `${path}/`;
  const target = RETIRED[slashed];
  return `${origin}${target || slashed}${rest}`;
}

function linkify(text: string): string {
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    const href = finalEntryHref(url);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
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

function slotAttrs(e: Entry): string {
  const topic = normalizeTopic(e.topic);
  const type = typeof e.type === 'string' ? e.type.toLowerCase() : '';
  return `data-topic="${esc(topic)}" data-type="${esc(type)}" data-roadmap="${esc(e.roadmap_id || '')}"`;
}

/** Display-ad art from the lab's own assets: the experiment's machine plate
 *  when the entry belongs to an experiment, otherwise a postcard crop.
 *  Whole or cropped by the frame's CSS; nothing generated. */
export function displayArt(topic: unknown): string {
  const id = typeof topic === 'string' ? topic.trim().toLowerCase() : '';
  if (id && PLATE_IDS.has(id)) return `/bench/machines/${id}-day-900.webp`;
  return '/bench/postcards/status-day-800.webp';
}

function entryMeta(e: Entry, t: Dict): string {
  const type = typeof e.type === 'string' ? e.type.toLowerCase() : '';
  return (
    (type ? `<span class="type-badge">${esc(typeLabel(type, t))}</span>` : '') +
    `<time datetime="${esc(e.date)}" data-mission="">${esc(logDate(e.date))}</time>` +
    (e.link
      ? `<a class="log-link" href="${esc(finalEntryHref(e.link || ''))}" target="_blank" rel="noopener noreferrer">${esc(t.labPage.view)}</a>`
      : '')
  );
}

function slotHtml(slot: AdSlot, t: Dict): string {
  const e = slot.entry;
  const title = esc(e.title || '');
  if (slot.size === 'display') {
    return (
      `<article class="log-entry ad ad-display" ${slotAttrs(e)}>` +
      `<figure class="photo ad-art"><div class="print">` +
      `<img src="${esc(displayArt(e.topic))}" alt="" loading="lazy">` +
      `</div></figure>` +
      `<div class="entry-body"><h3 class="sz-lg">${title}</h3>` +
      `<p>${linkify(e.body || '')}</p>` +
      `<p class="entry-meta">${entryMeta(e, t)}</p>` +
      `</div></article>`
    );
  }
  if (slot.size === 'boxed') {
    return (
      `<article class="log-entry ad ad-boxed" ${slotAttrs(e)}>` +
      `<div class="entry-body"><h3 class="sz-md">${title}</h3>` +
      `<p>${linkify(e.body || '')}</p>` +
      `<p class="entry-meta">${entryMeta(e, t)}</p>` +
      `</div></article>`
    );
  }
  if (slot.size === 'small') {
    const cut = esc(firstParagraph(e.body || ''));
    const link = e.link
      ? ` <a class="log-link" href="${esc(finalEntryHref(e.link || ''))}" target="_blank" rel="noopener noreferrer">${esc(t.labPage.view)}</a>`
      : '';
    return (
      `<article class="log-entry ad-small" ${slotAttrs(e)}>` +
      `<div class="entry-body"><h3 class="sz-sm">${title}</h3>` +
      `<p>${cut}${link}</p>` +
      `</div></article>`
    );
  }
  const link = e.link
    ? `<a class="log-link" href="${esc(finalEntryHref(e.link || ''))}" target="_blank" rel="noopener noreferrer">${title}</a>`
    : `<span class="notice-title">${title}</span>`;
  return `<article class="log-entry notice" ${slotAttrs(e)}><p class="notice-line">${link}</p></article>`;
}

/** One page grid: entry ads with coupon ads interleaved after the `after`-th
 *  slot, consecutive one-line notices grouped into dense runs of small type. */
function gridHtml(slots: AdSlot[], coupons: CouponAd[], after: number, t: Dict, lang: LabPageLang): string {
  const parts: string[] = slots.map((s) => slotHtml(s, t));
  const kinds: string[] = slots.map((s) => s.size);
  const cards = coupons.map((c) => couponAdHtml(lang, c));
  if (cards.length) {
    const at = Math.min(after + 1, parts.length);
    parts.splice(at, 0, ...cards);
    kinds.splice(at, 0, ...cards.map(() => 'coupon'));
  }
  let out = '';
  let run: string[] = [];
  const flush = (): void => {
    if (run.length) out += `<div class="notice-run">${run.join('')}</div>`;
    run = [];
  };
  parts.forEach((html, i) => {
    if (kinds[i] === 'line') run.push(html);
    else {
      flush();
      out += html;
    }
  });
  flush();
  return out;
}

function topicTypeCounts(rows: Entry[]): { topics: Array<{ id: string; label: string; count: number }>; types: Array<{ id: string; label: string; count: number }> } {
  const topicCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  for (const e of rows) {
    const topic = normalizeTopic(e.topic);
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    if (typeof e.type === 'string' && (LAB_TYPES as ReadonlyArray<string>).includes(e.type)) {
      typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
    }
  }
  return {
    topics: LAB_TOPICS.map((topic) => ({
      id: topic.id,
      label: topic.label,
      count: topicCounts.get(topic.id) ?? 0,
    })),
    types: LAB_TYPES.map((id) => ({ id, label: id, count: typeCounts.get(id) ?? 0 })),
  };
}

function filtersHtml(rows: Entry[], t: Dict): string {
  const { topics, types } = topicTypeCounts(rows);
  const all = { id: 'all', label: t.labPage.all, count: rows.length };
  return (
    `<div class="lab-filters">` +
    `<div class="lab-filter-row" data-kind="topic">${filterButtons('topic', [all, ...topics])}</div>` +
    `<div class="lab-filter-row" data-kind="type">${filterButtons('type', [all, ...types.map((x) => ({ ...x, label: typeLabel(x.id, t) }))])}</div>` +
    `</div>`
  );
}

export interface ClassifiedsOpts {
  unavailable?: boolean;
  foundingLeft?: number | null;
}

/** Both classifieds grids: page 1 (paper page 2) and page 2 (paper page 3,
 *  empty when everything fits one page — never an empty page). Coupons ride
 *  as ads of their own: the first half after the third slot, the rest after
 *  the ninth. A truncated section closes with the line to the Logbook. */
export function classifiedsHtml(
  entries: Entry[],
  lang: LabPageLang,
  opts?: ClassifiedsOpts,
): { page1: string; page2: string; truncated: boolean } {
  const t = dict(lang);
  const ads = couponAds(lang, opts?.foundingLeft);
  const { pages, truncated } = layoutClassifieds(entries || [], ads.length);
  const half = Math.ceil(ads.length / 2);
  const empty = { page1: '', page2: '', truncated };
  if (!pages.length) return empty;
  const rest = ads.slice(half);
  const page1 =
    `<div id="lab-log" class="classifieds">${gridHtml(pages[0], ads.slice(0, half), 2, t, lang)}` +
    `${pages[1] ? '' : gridHtml([], rest, 8, t, lang)}${couponNoteHtml(lang)}</div>`;
  let page2 = '';
  if (pages[1]) {
    page2 =
      `<h2 class="lab-heading lab-heading--cont">${esc(t.labPage.heading)} · ${esc(t.continued)}</h2>` +
      `<div id="lab-log2" class="classifieds">${gridHtml(pages[1], rest, 8, t, lang)}</div>`;
  }
  if (truncated) {
    page2 += `<p class="lab-more"><a href="${prefix(lang)}/logbook/">${esc(t.labPage.logbookPointer)}</a></p>`;
  }
  return { page1, page2, truncated };
}

/** Page 2's inner HTML: everything inside `#lab-body`. When the lab feed
 *  could not be read (`unavailable`) and there is nothing to print, the page
 *  says so in one line instead of showing empty filter rows. */
export function labPageHtml(
  entries: Entry[],
  lang: LabPageLang,
  opts?: ClassifiedsOpts,
): string {
  const t = dict(lang);
  const rows = sortEntries(entries || []);
  if (!rows.length && opts?.unavailable) {
    return `<h2 class="lab-heading">${esc(t.labPage.heading)}</h2>` +
      `<p class="lab-empty">${esc(t.labPage.unavailable)}</p>`;
  }
  const { page1 } = classifiedsHtml(rows, lang, opts);
  return `<h2 class="lab-heading">${esc(t.labPage.heading)}</h2>` +
    filtersHtml(rows, t) +
    page1;
}

/** Paper page 3's inner HTML: everything inside `#lab2-body`. Empty when
 *  the section fits one page — the page then stays hidden, never empty. */
export function labPageHtml2(
  entries: Entry[],
  lang: LabPageLang,
  opts?: ClassifiedsOpts,
): string {
  const rows = sortEntries(entries || []);
  return classifiedsHtml(rows, lang, opts).page2;
}

/** The Logbook page's inner HTML with a filtered list but the full filter
 *  rows: the topic/type buttons and their counts always describe the whole
 *  record, never the filtered subset, so filtering never drops a button.
 *  `allEntries` feeds the filters; `rows` feeds the list. */
export function logbookFilteredHtml(
  allEntries: Entry[],
  rows: Entry[],
  lang: LabPageLang,
): string {
  const t = dict(lang);
  const lt = t.logbook;
  const all = sortEntries(allEntries || []);
  const list = sortEntries(rows || []);
  const items = list
    .map(
      (e) =>
        `<article class="log-entry log-full" ${slotAttrs(e)}>` +
        `<div class="entry-body"><h3 class="sz-md">${esc(e.title || '')}</h3>` +
        `<p>${linkify(e.body || '')}</p>` +
        `<p class="entry-meta">${entryMeta(e, t)}</p>` +
        `</div></article>`,
    )
    .join('');
  const empty = list.length ? '' : `<p class="lab-empty">${esc(lt.empty)}</p>`;
  return `<h2 class="lab-heading">${esc(lt.heading)}</h2>` +
    filtersHtml(all, t) +
    `<div id="logbook-list" class="logbook-list">${items}</div>` +
    empty;
}

/** The Logbook page's inner HTML: everything inside `#logbook-body`. The
 *  complete record, newest first, in full: type, date, title, body and link.
 *  Same filters as the classifieds; filtering recomposes client-side. */
export function logbookPageHtml(
  entries: Entry[],
  lang: LabPageLang,
  opts?: { unavailable?: boolean },
): string {
  const t = dict(lang);
  const rows = sortEntries(entries || []);
  const lt = t.logbook;
  if (!rows.length && opts?.unavailable) {
    return `<h2 class="lab-heading">${esc(lt.heading)}</h2>` +
      `<p class="lab-empty">${esc(lt.unavailable)}</p>`;
  }
  const items = rows
    .map(
      (e) =>
        `<article class="log-entry log-full" ${slotAttrs(e)}>` +
        `<div class="entry-body"><h3 class="sz-md">${esc(e.title || '')}</h3>` +
        `<p>${linkify(e.body || '')}</p>` +
        `<p class="entry-meta">${entryMeta(e, t)}</p>` +
        `</div></article>`,
    )
    .join('');
  const empty = rows.length ? '' : `<p class="lab-empty">${esc(lt.empty)}</p>`;
  return `<h2 class="lab-heading">${esc(lt.heading)}</h2>` +
    filtersHtml(rows, t) +
    `<div id="logbook-list" class="logbook-list">${items}</div>` +
    empty;
}

/** The twin's second page: the heading over the shared entry lines, or over
 *  the one unavailable line when the feed could not be read. */
export function labPageMarkdown(
  entries: Entry[],
  lang: LabPageLang,
  opts?: ClassifiedsOpts,
): string {
  const t = dict(lang);
  if (!(entries || []).length && opts?.unavailable) {
    return `## ${t.labPage.heading}\n\n${paperCouponsMarkdown(lang, opts?.foundingLeft)}\n\n${t.labPage.unavailable}`;
  }
  const body = entriesMarkdown(entries || [], { labels: { empty: '' } });
  return `## ${t.labPage.heading}\n\n${paperCouponsMarkdown(lang, opts?.foundingLeft)}\n\n${body}`;
}

/** The Logbook twin: the full record under its own heading. */
export function logbookMarkdown(
  entries: Entry[],
  lang: LabPageLang,
): string {
  const t = dict(lang);
  const body = entriesMarkdown(entries || [], { labels: { empty: t.logbook.empty } });
  return `## ${t.logbook.heading}\n\n${body}`;
}
