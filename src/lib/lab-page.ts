// Pages 2 and 3 of the newspaper — the lab's announcements as a classifieds
// section in four notice sizes, across at most two pages. One server renderer
// for the edge (functions/_middleware.ts fills #lab-body and #lab2-body
// through HTMLRewriter), the client (pages/newspaper.astro fills both when
// the edge did not) and the markdown twin (/newspaper/index.md).
// Escape every text field from the feed.

import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { entriesMarkdown, firstParagraph, sortEntries, type Entry } from './lab-feed';
import { entryTexts } from './field-notes';
import { layoutClassifieds, spanFor, typeWeight, type AdSlot } from './lab-classifieds';
import { cutFor, hashSeed, ornamentImg } from './classifieds-ornaments';
import { liveExperiments } from './experiments';
import { couponNoticeHtml, couponNotices, couponNoteHtml, paperCouponsMarkdown, type CouponNotice } from './paper-coupons';
import { paperNoticeHtml } from './paper-ads';
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

/** Display-notice art from the lab's own assets: the experiment's machine plate
 *  when the entry belongs to an experiment, otherwise a postcard crop.
 *  Whole or cropped by the frame's CSS; nothing generated. */
export function displayArt(topic: unknown): string {
  const id = typeof topic === 'string' ? topic.trim().toLowerCase() : '';
  if (id && PLATE_IDS.has(id)) return `/bench/machines/${id}-day-900.webp`;
  return '/bench/postcards/status-day-800.webp';
}

/** Intrinsic widths of the experiment plates (all 900 tall); the postcard
 *  crop is 800x450. The lead's engraving reserves these, like the cuts. */
const PLATE_WIDTHS: Record<string, number> = {
  canopy: 611,
  texforge: 842,
  gitkit: 906,
  ghscaff: 706,
  quorum: 785,
  demostage: 953,
  facetmedia: 743,
  'astro-denoise': 688,
  cadspec: 929,
};

export function displayArtSize(topic: unknown): { width: number; height: number } {
  const id = typeof topic === 'string' ? topic.trim().toLowerCase() : '';
  if (id && PLATE_IDS.has(id)) return { width: PLATE_WIDTHS[id] ?? 900, height: 900 };
  return { width: 800, height: 450 };
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

/** The engraved cut for an entry: display, boxed and small notices open with
 *  the cut cutFor chose for this entry on this page, first inside
 *  .entry-body and never inside the h3. One-line notices and entries the
 *  chooser left cut-less go without one. */
function noticeCut(e: Entry, page: number, used: Set<string>): string {
  const cut = cutFor(e, page, used);
  if (!cut) return '';
  return `<span class="notice-cut cut-${cut.size}">${ornamentImg(cut.name, `cut-${cut.size}`)}</span>`;
}

/** The big figure of a figure-set notice (type-v5): a version number from the
 *  entry's own words, else a count from its headline or first sentence;
 *  empty when the entry has neither, and the notice then takes another voice. */
function figureFor(e: Entry): string {
  const m = /v?\d+\.\d+(?:\.\d+)?/.exec(`${e.title || ''} ${e.body || ''}`);
  if (m) return m[0];
  // A count from the headline or its first sentence (55 specs, 21 entries)
  // reads as a period price figure; a year never does.
  const n = /\b(?!(?:19|20)\d\d\b)\d{2,4}\b/.exec(`${e.title || ''} ${firstParagraph(e.body || '')}`);
  if (n) return n[0];
  return '';
}

/** The word a repeated-word notice (type-v7) stacks in falling sizes, as the
 *  period soap notices repeated their brand: the experiment's name, else the
 *  lab's. The title follows it in full. */
function repWordFor(e: Entry): string {
  const id = typeof e.topic === 'string' ? e.topic.trim().toLowerCase() : '';
  const exp = liveExperiments.find((x) => x.id === id);
  return exp ? exp.name : 'UniverLab';
}

/** A spare frame accent for a few notices: a light single or double rule, as
 *  in the references. Deterministic per entry; most notices take none. */
function frameAccent(e: Entry): string {
  const h = hashSeed(`frame|${e.id || ''}`);
  if (h % 9 === 0) return ' frame-accent frame-double';
  if (h % 5 === 0) return ' frame-accent';
  return '';
}

function slotHtml(slot: AdSlot, t: Dict, variant: number, page: number, used: Set<string>, lead: boolean, spanCls: string, frame: string, lang: LabPageLang): string {
  const e = slot.entry;
  const texts = entryTexts(e, lang);
  const localized = { ...e, title: texts.title, body: texts.body };
  const title = esc(texts.title);
  const v = ` type-v${variant}`;
  const figure = variant === 5 ? `<span class="notice-figure">${esc(figureFor(localized))}</span>` : '';
  // The two extra voices: a small run-in notice with a bold lead word and
  // no h3, and the title repeated in three stacked sizes over the body.
  const word = esc(repWordFor(e));
  const repWords =
    `<span class="rep-word rep-0" aria-hidden="true">${word}</span>` +
    `<span class="rep-word rep-1" aria-hidden="true">${word}</span>` +
    `<span class="rep-word rep-2" aria-hidden="true">${word}</span>`;
  if (slot.size === 'display') {
    const cls = lead ? 'log-entry display-notice lead-story' : 'log-entry display-notice';
    // The lead is the newest launch; with none it is the newest news.
    const launch = typeWeight(e.type) === 3;
    const kicker = lead
      ? `<p class="lead-kicker">${esc(launch ? t.labPage.leadKicker : t.labPage.leadKickerNews)}</p>`
      : '';
    const art = displayArtSize(e.topic);
    return (
      `<article class="${cls}${v}" ${slotAttrs(e)}>` +
      `<figure class="photo notice-art"><div class="print">` +
      `<img src="${esc(displayArt(e.topic))}" alt="" width="${art.width}" height="${art.height}" loading="lazy" decoding="async">` +
      `</div></figure>` +
      `<div class="entry-body">${kicker}${figure}<h3 class="sz-lg">${title}</h3>` +
      `<p>${linkify(texts.body)}</p>` +
      `<p class="entry-meta">${entryMeta(e, t)}</p>` +
      `</div></article>`
    );
  }
  if (slot.size === 'boxed') {
    const head =
      variant === 6
        ? `<p class="run-in"><b>${title}.</b> ${linkify(texts.body)}</p>`
        : variant === 7
          ? `${repWords}<h3 class="sz-md">${title}</h3><p>${linkify(texts.body)}</p>`
          : `${figure}<h3 class="sz-md">${title}</h3><p>${linkify(texts.body)}</p>`;
    return (
      `<article class="log-entry notice-boxed${spanCls}${frame}${v}" ${slotAttrs(e)}>` +
      `<div class="entry-body">${noticeCut(e, page, used)}${head}` +
      `<p class="entry-meta">${entryMeta(e, t)}</p>` +
      `</div></article>`
    );
  }
  if (slot.size === 'small') {
    const cut = esc(firstParagraph(texts.body));
    const link = e.link
      ? ` <a class="log-link" href="${esc(finalEntryHref(e.link || ''))}" target="_blank" rel="noopener noreferrer">${esc(t.labPage.view)}</a>`
      : '';
    const head =
      variant === 6
        ? `<p class="run-in"><b>${title}.</b> ${cut}${link}</p>`
        : variant === 7
          ? `${repWords}<h3 class="sz-sm">${title}</h3><p>${cut}${link}</p>`
          : `${figure}<h3 class="sz-sm">${title}</h3><p>${cut}${link}</p>`;
    return (
      `<article class="log-entry notice-small${spanCls}${frame}${v}" ${slotAttrs(e)}>` +
      `<div class="entry-body">${noticeCut(e, page, used)}${head}` +
      `</div></article>`
    );
  }
  const link = e.link
    ? `<a class="log-link" href="${esc(finalEntryHref(e.link || ''))}" target="_blank" rel="noopener noreferrer">${title}</a>`
    : `<span class="notice-title">${title}</span>`;
  return `<article class="log-entry notice" ${slotAttrs(e)}><p class="notice-line">${link}</p></article>`;
}

/** One page grid: entry notices with coupon notices interleaved after the `after`-th
 *  slot, consecutive one-line notices grouped into dense runs of small type.
 *  Every entry notice takes one of eight treatments, (hashSeed(id) + n) % 8,
 *  bumped past the previous notice's treatment, width and frame, so neighbours
 *  never share one; coupons ride as the eighth treatment. The sequence is
 *  fixed per edition, so one edition never reshuffles on reload. On page 1
 *  the display notice reads as the lead story in the middle of the page, closed
 *  by a rule. */
function gridHtml(slots: AdSlot[], coupons: CouponNotice[], after: number, t: Dict, lang: LabPageLang, page: number): string {
  const used = new Set<string>();
  type Item = { kind: 'slot'; slot: AdSlot } | { kind: 'coupon'; html: string };
  const items: Item[] = slots.map((slot) => ({ kind: 'slot' as const, slot }));
  if (coupons.length) {
    const at = Math.min(after + 1, items.length);
    items.splice(at, 0, ...coupons.map((c) => ({ kind: 'coupon' as const, html: couponNoticeHtml(lang, c) })));
  }
  const lead = page === 1 && slots.length > 0 && slots[0].size === 'display';
  let out = '';
  let run: string[] = [];
  const flush = (): void => {
    if (run.length) {
      out += `<div class="notice-fleuron">${ornamentImg('fleuron')}</div>` +
        `<div class="notice-run">${run.join('')}</div>`;
    }
    run = [];
  };
  let leadClosed = !lead;
  let n = 0;
  let si = 0;
  let prevTv = -1;
  let prevSpan = -1;
  let prevFrame = '';
  let repUsed = false;
  for (const item of items) {
    if (item.kind === 'coupon') {
      flush();
      out += item.html;
      prevTv = -2;
      prevSpan = 1;
      prevFrame = 'coupon';
      continue;
    }
    const s = item.slot;
    if (s.size === 'line') {
      run.push(slotHtml(s, t, 0, page, used, false, '', '', lang));
      prevTv = -3;
      prevSpan = 5;
      prevFrame = 'run';
      continue;
    }
    flush();
    const voices = s.size === 'display' ? 6 : 8;
    let tv = (hashSeed(s.entry.id || '') + n) % voices;
    n += 1;
    // The repeated word is a shout: once per page at most.
    const sTexts = entryTexts(s.entry, lang);
    const sLocalized = { ...s.entry, title: sTexts.title, body: sTexts.body };
    while (tv === prevTv || (tv === 5 && !figureFor(sLocalized)) || (tv === 7 && repUsed)) tv = (tv + 1) % voices;
    if (tv === 7) repUsed = true;
    let span = spanFor(s.entry, s.size, si);
    si += 1;
    if (span === prevSpan) span = span === 1 ? 2 : span === 2 ? (s.size === 'small' ? 1 : 3) : 2;
    const spanCls = s.size === 'display' ? '' : span === 3 ? ' span3' : span === 2 && s.size === 'small' ? ' span2' : '';
    let frame = frameAccent(s.entry);
    if (frame && frame === prevFrame) frame = '';
    prevFrame = frame;
    const isLead = lead && s === slots[0];
    out += slotHtml(s, t, tv, page, used, isLead, spanCls, frame ? ` ${frame}` : '', lang);
    prevTv = tv;
    prevSpan = span;
    if (isLead && !leadClosed) {
      out += `<div class="classifieds-rule">${ornamentImg('rule')}</div>`;
      leadClosed = true;
    }
  }
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

/** The Logbook pointer line: the overflow's way on. The client materializes
 *  it from the template when its own measure-trim drops notices the server kept. */
function logbookPointerHtml(t: Dict, lang: LabPageLang): string {
  return `<p class="lab-more"><a href="${prefix(lang)}/logbook/">${ornamentImg('manicule', 'manicule')}${esc(t.labPage.logbookPointer)}</a></p>`;
}

/** A classifieds section head set inside the engraved head cartouche,
 *  centred over the plate, on both pages: the edition's own words, short
 *  enough to stay inside the frame. */
function headHtml(t: Dict): string {
  return `<header class="lab-head"><div class="head-cartouche">${ornamentImg('head')}<h2 class="lab-heading">${esc(t.labPage.head)}</h2></div></header>`;
}

/** The last page's foot fillers wait in templates, like page one's: the
 *  lab's own house notices and three engraved ornaments. The client fit
 *  appends them into the last grid's measured free foot, whole only. */
function footFillHtml(lang: LabPageLang): string {
  return (
    `<template data-fill="house-install">${paperNoticeHtml(lang, 'install')}</template>` +
    `<template data-fill="house-collab">${paperNoticeHtml(lang, 'collab')}</template>` +
    `<template data-fill="orn-tree"><figure class="classifieds-plate">${ornamentImg('tree')}</figure></template>` +
    `<template data-fill="orn-gem"><figure class="classifieds-plate">${ornamentImg('gem')}</figure></template>` +
    `<template data-fill="orn-press"><figure class="classifieds-plate">${ornamentImg('press')}</figure></template>`
  );
}

/** Both classifieds grids: page 1 (paper page 2) and page 2 (paper page 3,
 *  empty when everything fits one page — never an empty page). Coupons ride
 *  as notices of their own: the first half after the third slot, the rest after
 *  the ninth. A truncated section closes with the line to the Logbook. */
export function classifiedsHtml(
  entries: Entry[],
  lang: LabPageLang,
  opts?: ClassifiedsOpts,
): { page1: string; page2: string; truncated: boolean } {
  const t = dict(lang);
  const notices = couponNotices(lang, opts?.foundingLeft);
  const { pages, truncated } = layoutClassifieds(entries || [], notices.length);
  const half = Math.ceil(notices.length / 2);
  const empty = { page1: '', page2: '', truncated };
  if (!pages.length) return empty;
  const rest = notices.slice(half);
  const page1 =
    `<div id="lab-log" class="classifieds">${gridHtml(pages[0], notices.slice(0, half), 2, t, lang, 1)}` +
    `${pages[1] ? '' : gridHtml([], rest, 8, t, lang, 1)}${couponNoteHtml(lang)}` +
    `<template data-fill="logbook-pointer">${logbookPointerHtml(t, lang)}</template>${footFillHtml(lang)}</div>`;
  // Page 3 carries no head of its own: the folio line, then notices. Its grid
  // is always there, empty when everything fits page 2, so the client's fit
  // can carry page 2's overflow onto it; an empty grid keeps page 3 out of
  // the paper.
  const page2 =
    `<div id="lab-log2" class="classifieds">${pages[1] ? gridHtml(pages[1], rest, 8, t, lang, 2) : ''}${footFillHtml(lang)}</div>` +
    `<template data-fill="logbook-pointer">${logbookPointerHtml(t, lang)}</template>` +
    (truncated ? logbookPointerHtml(t, lang) : '');
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
    return headHtml(t) +
      `<p class="lab-empty">${esc(t.labPage.unavailable)}</p>`;
  }
  // An edition from before the lab's first news has no classifieds: the
  // newspaper is page 1 alone.
  if (!rows.length) return '';
  const { page1 } = classifiedsHtml(rows, lang, opts);
  return headHtml(t) +
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
    .map((e) => {
      const texts = entryTexts(e, lang);
      return (
        `<article class="log-entry log-full" ${slotAttrs(e)}>` +
        `<div class="entry-body"><h3 class="sz-md">${esc(texts.title)}</h3>` +
        `<p>${linkify(texts.body)}</p>` +
        `<p class="entry-meta">${entryMeta(e, t)}</p>` +
        `</div></article>`
      );
    })
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
    .map((e) => {
      const texts = entryTexts(e, lang);
      return (
        `<article class="log-entry log-full" ${slotAttrs(e)}>` +
        `<div class="entry-body"><h3 class="sz-md">${esc(texts.title)}</h3>` +
        `<p>${linkify(texts.body)}</p>` +
        `<p class="entry-meta">${entryMeta(e, t)}</p>` +
        `</div></article>`
      );
    })
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
  const body = entriesMarkdown(entries || [], { labels: { empty: '' }, lang });
  return `## ${t.labPage.heading}\n\n${paperCouponsMarkdown(lang, opts?.foundingLeft)}\n\n${body}`;
}

/** The Logbook twin: the full record under its own heading. */
export function logbookMarkdown(
  entries: Entry[],
  lang: LabPageLang,
): string {
  const t = dict(lang);
  const body = entriesMarkdown(entries || [], { labels: { empty: t.logbook.empty }, lang });
  return `## ${t.logbook.heading}\n\n${body}`;
}
