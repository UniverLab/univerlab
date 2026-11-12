// The day's newspaper: El Observable / The Observable. One renderer for the
// edge (functions/_middleware.ts fills #edition through HTMLRewriter), the
// client (pages/newspaper.astro fills #edition when the edge did not) and the
// markdown twin (/newspaper/index.md). Escape every text field from the feed.

import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { experiments } from './experiments';
import { firstParagraph } from './lab-feed';
import { dailyFact } from './mail';
import { paperPlateHtml } from './paper-plate';
import { letterPool, summaryText, type Fact, type FilterLang } from './science-filter';

export type TodayLang = FilterLang;

/** One lab announcement, as the public API serves it. */
export interface TodayLab {
  id: string;
  date: string;
  title: string;
  body: string;
  type?: string | null;
  topic?: string | null;
  link?: string | null;
}

export interface TodayFeed {
  facts: Fact[];
  lab: TodayLab[];
}

type Dict = (typeof en)['today'];

const dict = (lang: TodayLang): Dict => (lang === 'es' ? es.today : en.today);

/** Bogotá is UTC−5 with no daylight saving: the edition changes at the
 *  lab's midnight, so the day key is the UTC clock minus five hours. */
export function editionYmd(now: Date = new Date()): string {
  const b = new Date(now.getTime() - 5 * 3600 * 1000);
  return (
    b.getUTCFullYear() +
    '-' +
    String(b.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(b.getUTCDate()).padStart(2, '0')
  );
}

/** The edition as a local-noon Date: stable for dailyFact's day key and for
 *  the dateline's locale formatting. */
export function editionDate(now: Date = new Date()): Date {
  const [y, m, d] = editionYmd(now).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** The edition picked by `?d=YYYY-MM-DD`: that day at local noon when the
 *  parameter is a real calendar day no later than today's edition, otherwise
 *  today's edition. */
export function editionDateFor(search: string, now: Date = new Date()): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URLSearchParams(search).get('d') || '');
  if (m) {
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    if (
      dt.getMonth() === Number(m[2]) - 1 &&
      dt.getDate() === Number(m[3]) &&
      editionYmd(dt) <= editionYmd(now)
    ) {
      return dt;
    }
  }
  return editionDate(now);
}

/** Whether the edition's day is the lab's today. */
export function isToday(date: Date, now: Date = new Date()): boolean {
  return editionYmd(date) === editionYmd(now);
}

/** The masthead's edition line: "today" only for today's edition, otherwise
 *  the edition's own date in words ("Edition of 14 November"). The short
 *  locale prints day-first in both languages (en-GB, not en-US). */
export function editionLabel(lang: TodayLang, date: Date, now: Date = new Date()): string {
  const t = dict(lang);
  if (isToday(date, now)) return t.edition;
  const locale = lang === 'es' ? 'es-ES' : 'en-GB';
  const words = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(date);
  return fmt(t.editionPast, { date: words });
}

/** The day's Wikipedia feed in the page language. */
export function otdUrl(lang: TodayLang, date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`;
}

/** The newspaper routes, with or without trailing slash or index.md. */
export function todayRoute(pathname: string): TodayLang | null {
  const p = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  if (p === '/newspaper' || p === '/newspaper/index.md') return 'en';
  if (p === '/es/newspaper' || p === '/es/newspaper/index.md') return 'es';
  return null;
}

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Years between the edition and the fact: the letter's time on its way. */
function yearsOnWay(fact: Fact, date: Date): number {
  const y = parseInt(fact.year, 10);
  return Number.isFinite(y) ? date.getFullYear() - y : 0;
}

function byYearAsc(a: Fact, b: Fact): number {
  return parseInt(a.year, 10) - parseInt(b.year, 10);
}

/** The lead's headline. A person is named by their page; an event has no
 *  name of its own — its page is a place, a country or a craft ("Boston",
 *  "República Popular China") — so its own line is the headline. */
function leadHeadline(lead: Fact): string {
  const text = lead.text ? lead.text.charAt(0).toUpperCase() + lead.text.slice(1) : '';
  return lead.kind === 'event' ? text : lead.page || text.slice(0, 72);
}

/** A printed letter's body, under its line. With a summary, the summary is
 *  the paragraph (trimmed by the same rules the lead uses, so columns keep
 *  fitting); without one, an event keeps its old silence (its one line is
 *  already the headline) and a person prints their line. */
function itemBody(fact: Fact): string {
  if (fact.long) return summaryText({ summary: fact.long, summaryCut: fact.longCut });
  if (fact.summary) return summaryText(fact);
  return fact.kind === 'event' ? '' : fact.text;
}

/** The lead's body, under the headline: the same rules as every letter. */
function leadBody(lead: Fact): string {
  return itemBody(lead);
}

/** The edition's lead: the same letter the mailbox delivers, chosen by the
 *  shared filter from the day's pool. */
export function todayLead(facts: Fact[], date: Date): Fact | null {
  return dailyFact<Fact>(letterPool(facts), date);
}

/** The side column: the two oldest non-lead events, newer first. */
export function todayAside(facts: Fact[], lead: Fact | null): Fact[] {
  return facts
    .filter((f) => f.kind === 'event' && f !== lead)
    .sort(byYearAsc)
    .slice(0, 2)
    .reverse();
}

/** The newest lab announcement published on the edition's day, if any. */
export function todayLabBox(lab: TodayLab[], date: Date): TodayLab | null {
  const ymd = editionYmd(date);
  const rows = [...(lab || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const e of rows) {
    const t = Date.parse(e?.date || '');
    if (Number.isFinite(t) && editionYmd(new Date(t)) === ymd) return e;
  }
  return null;
}

function expNameOf(topic: unknown): string {
  const id = typeof topic === 'string' ? topic.trim().toLowerCase() : '';
  if (!id) return '';
  const exp = experiments.find((x) => x.id === id);
  return exp ? exp.name : '';
}

/** The announcement's type as the edition's language spells it. The API
 *  stores English codes (`launch`, `note`, `update`), so the Spanish
 *  newspaper never prints "launch" in its kicker; an unknown code passes
 *  through as served. */
function typeOf(box: TodayLab, t: Dict): string {
  const raw = (box.type || '').trim();
  const known = t.types as Record<string, string>;
  return known[raw.toLowerCase()] || raw;
}

/** The day-of-year number the dateline prints as `Sol n`. Noon keeps a DST
 *  shift from rounding the count down a day. */
function solOf(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

function photoFigure(
  fact: Fact,
  t: Dict,
  opts: { eager: boolean; caption: boolean },
): string {
  const src = fact.thumb?.src || '';
  if (!src) return '';
  const name = fact.page || '';
  const alt = esc(name);
  const dims =
    (typeof fact.thumb?.w === 'number' ? ` width="${fact.thumb.w}"` : '') +
    (typeof fact.thumb?.h === 'number' ? ` height="${fact.thumb.h}"` : '');
  const loading = opts.eager ? '' : ' loading="lazy"';
  const cap = opts.caption && name ? `<figcaption>${esc(fmt(t.caption, { name }))}</figcaption>` : '';
  return (
    `<figure class="photo"><div class="print">` +
    `<img src="${esc(src)}" alt="${alt}"${dims}${loading}></div>${cap}</figure>`
  );
}

function itemHtml(fact: Fact, t: Dict, date: Date, photo: boolean): string {
  const years = yearsOnWay(fact, date);
  const text = fact.text ? fact.text.charAt(0).toUpperCase() + fact.text.slice(1) : '';
  const img = photo ? photoFigure(fact, t, { eager: false, caption: false }) : '';
  const cls = img ? 'item has-photo' : 'item';
  const link = fact.link
    ? `<a href="${esc(fact.link)}" target="_blank" rel="noopener noreferrer">${esc(t.wikiLink)}</a>`
    : '';
  // The body's own paragraph: skipped when empty or when it would repeat the
  // line above (a person with no summary, whose line is already the body).
  const body = itemBody(fact);
  const bodyHtml = body && body !== fact.text ? `<p class="body">${esc(body)}</p>` : '';
  return (
    `<article class="${cls}">${img}` +
    `<div class="yr"><b>${esc(fact.year)}</b><span>${esc(fmt(t.ago[fact.kind], { years }))}</span></div>` +
    `<p>${esc(text)}</p>${bodyHtml}${link}</article>`
  );
}

/** A column shows this many letters before the rest fold under "show more". */
export const COLUMN_FOLD = 6;

function columnHtml(
  title: string,
  items: Fact[],
  t: Dict,
  date: Date,
  lang: TodayLang,
  photo: (f: Fact) => boolean,
  plate: boolean,
): string {
  const head = items.slice(0, COLUMN_FOLD);
  const extra = items.slice(COLUMN_FOLD);
  const headHtml = head.map((f) => itemHtml(f, t, date, photo(f))).join('');
  const extraHtml = extra.length
    ? `<details class="more"><summary>${esc(fmt(t.more, { n: extra.length }))}</summary>` +
      extra.map((f) => itemHtml(f, t, date, photo(f))).join('') +
      `</details>`
    : '';
  return (
    `<section class="col"><h3>${esc(title)}</h3>` +
    headHtml +
    extraHtml +
    (plate ? paperPlateHtml(lang) : '') +
    `</section>`
  );
}

/** The edition's inner HTML: everything inside `#edition`. */
export function todayEditionHtml(feed: TodayFeed, lang: TodayLang, date: Date): string {
  const t = dict(lang);
  const facts = feed?.facts || [];
  const lead = todayLead(facts, date);
  const aside = todayAside(facts, lead);
  const box = todayLabBox(feed?.lab || [], date);

  const full = new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const sol = solOf(date);
  const counts = fmt(t.counts, { n: facts.length, m: box ? 1 : 0 });

  let out =
    `<div class="dateline"><span>${esc(full)}</span>` +
    `<span>${esc(t.sol)} ${sol}</span><span>${esc(counts)}</span></div>`;

  if (box) {
    const exp = expNameOf(box.topic);
    const kicker = [t.labKicker, exp, typeOf(box, t)]
      .filter((s) => s)
      .join(' · ');
    out +=
      `<article class="labmail">` +
      `<p class="kicker">${esc(kicker)}</p>` +
      `<h2>${esc(box.title || '')}</h2>` +
      `<p>${esc(firstParagraph(box.body || ''))}</p>` +
      `<a href="/status/">${esc(t.labLink)}</a></article>`;
  }

  if (lead) {
    const years = yearsOnWay(lead, date);
    const headline = leadHeadline(lead);
    const body = leadBody(lead);
    out +=
      `<article class="lead${aside.length ? '' : ' solo'}"><div class="story">` +
      `<p class="kicker">${esc(fmt(t.leadKicker, { years }))}</p>` +
      `<h2>${esc(headline)}</h2>` +
      photoFigure(lead, t, { eager: true, caption: true }) +
      (body ? `<p class="dropcap">${esc(body)}</p>` : '') +
      (lead.link
        ? `<a href="${esc(lead.link)}" target="_blank" rel="noopener noreferrer">${esc(t.readOn)}</a>`
        : '') +
      `</div>`;
    if (aside.length) {
      const side = aside
        .map((f) => {
          const text = f.text ? f.text.charAt(0).toUpperCase() + f.text.slice(1) : '';
          const body = itemBody(f);
          const bodyHtml =
            body && body !== f.text ? `<p class="aside-body">${esc(body)}</p>` : '';
          return `<p><b>${esc(f.year)}</b>${esc(text)}</p>${bodyHtml}`;
        })
        .join('');
      out += `<aside>${side}</aside>`;
    }
    out += `</article>`;
  }

  const rest = (kind: Fact['kind']) =>
    facts.filter((f) => f.kind === kind && f !== lead && !aside.includes(f)).sort(byYearAsc);
  // Every event whose article carries a photo prints it, like births and
  // deaths do; the column folds the overflow under "show more" instead.
  const eventPhoto = (f: Fact): boolean => !!f.thumb;
  const pairs: Array<[string, Fact[], (f: Fact) => boolean]> = [
    [t.events, rest('event'), eventPhoto],
    [t.births, rest('born'), () => true],
    [t.deaths, rest('died'), () => true],
  ].filter(([, items]) => items.length > 0) as Array<[string, Fact[], (f: Fact) => boolean]>;
  if (pairs.length) {
    // The engraving fills the gap the day's content leaves: it is appended
    // in the shortest column (fewest letters, ties to the first).
    let plateAt = 0;
    for (let i = 1; i < pairs.length; i++) {
      if (pairs[i][1].length < pairs[plateAt][1].length) plateAt = i;
    }
    out +=
      `<div class="cols">` +
      pairs.map(([title, items, photo], i) => columnHtml(title, items, t, date, lang, photo, i === plateAt)).join('') +
      `</div>`;
  }

  // The Workbench notice: a period advertisement in every edition, never
  // the lead story.
  const ad = lang === 'es' ? '/es/workbench/' : '/workbench/';
  out +=
    `<aside class="notice" aria-label="${esc(t.notice.label)}">` +
    `<p class="kicker">${esc(t.notice.label)}</p>` +
    `<h2>${esc(t.notice.head)}</h2>` +
    `<p>${esc(t.notice.text)}</p>` +
    `<a href="${ad}">${esc(t.notice.link)}</a></aside>`;

  out += `<p class="colophon-note">${esc(t.colophon)}</p>`;
  return out;
}

/** The markdown twin: the same edition as plain text, one line per letter. */
export function todayEditionMarkdown(feed: TodayFeed, lang: TodayLang, date: Date): string {
  const t = dict(lang);
  const facts = feed?.facts || [];
  const lead = todayLead(facts, date);
  const aside = todayAside(facts, lead);
  const box = todayLabBox(feed?.lab || [], date);

  const path = lang === 'es' ? 'https://univerlab.org/es/newspaper/' : 'https://univerlab.org/newspaper/';
  const full = new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const lines = [
    '---',
    `title: "${t.name}"`,
    `source: "${path}"`,
    '---',
    '',
    `# ${t.name}`,
    '',
    `*${t.motto}*`,
    '',
    // The edition's dateline: an agent reading the twin needs the day it
    // was set, exactly as the page prints it.
    `**${full} · ${t.sol} ${solOf(date)}**`,
    '',
    `${fmt(t.counts, { n: facts.length, m: box ? 1 : 0 })}`,
    '',
  ];

  if (box) {
    const exp = expNameOf(box.topic);
    const kicker = [t.labKicker, exp, typeOf(box, t)].filter((s) => s).join(' · ');
    lines.push(`## ${kicker}`, '', `**${box.title || ''}**`, '', firstParagraph(box.body || ''));
    lines.push('', `[${t.labLink}](https://univerlab.org/status/)`, '');
  }

  if (lead) {
    const years = yearsOnWay(lead, date);
    const headline = leadHeadline(lead);
    const body = leadBody(lead);
    lines.push(`## ${fmt(t.leadKicker, { years })}`, '', `**${headline}**`);
    if (body) lines.push('', body);
    if (lead.link) lines.push('', `[${t.readOn}](${lead.link})`);
    if (aside.length) {
      // The page's side column: its own label, so the events heading below
      // is not printed twice in a row.
      lines.push('', `## ${t.aside}`);
      for (const f of aside) {
        const text = f.text ? f.text.charAt(0).toUpperCase() + f.text.slice(1) : '';
        lines.push(`- **${f.year}**: ${text}`);
        const body = itemBody(f);
        if (body && body !== f.text) lines.push(`  ${body}`);
      }
    }
    lines.push('');
  }

  const rest = (kind: Fact['kind']) =>
    facts.filter((f) => f.kind === kind && f !== lead && !aside.includes(f)).sort(byYearAsc);
  const cols: Array<[string, Fact[]]> = [
    [t.events, rest('event')],
    [t.births, rest('born')],
    [t.deaths, rest('died')],
  ];
  for (const [title, items] of cols) {
    lines.push(`## ${title}`, '');
    if (!items.length) lines.push(t.empty, '');
    for (const f of items) {
      const years = yearsOnWay(f, date);
      const text = f.text ? f.text.charAt(0).toUpperCase() + f.text.slice(1) : '';
      const link = f.link ? ` ([${t.wikiLink.trim()}](${f.link}))` : '';
      lines.push(`- **${f.year}** (${fmt(t.ago[f.kind], { years })}): ${text}${link}`);
      const body = itemBody(f);
      if (body && body !== f.text) lines.push(`  ${body}`);
    }
    lines.push('');
  }
  // The Workbench notice rides the twin as one short line with its link.
  const adUrl = lang === 'es' ? 'https://univerlab.org/es/workbench/' : 'https://univerlab.org/workbench/';
  lines.push(`*${t.notice.label} — [${t.notice.head}](${adUrl}): ${t.notice.text}*`, '');
  return lines.join('\n');
}
