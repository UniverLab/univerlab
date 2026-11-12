// The day's newspaper: El Observable / The Observable. One renderer for the
// edge (functions/_middleware.ts fills #edition through HTMLRewriter), the
// client (pages/newspaper.astro fills #edition when the edge did not) and the
// markdown twin (/newspaper/index.md). Escape every text field from the feed.

import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { experiments } from './experiments';
import { firstParagraph } from './lab-feed';
import { dailyFact } from './mail';
import { paperAdHtml, paperAdsMarkdown } from './paper-ads';
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

const SENTENCE_ABBREV = new Set([
  'mr', 'mrs', 'ms', 'mme', 'dr', 'dra', 'sr', 'sra', 'srta', 'ud', 'uds',
  'vs', 'viz', 'cf', 'al', 'eg', 'ie', 'fig',
]);

/** The first sentence of a column body: columns print one sentence, never a
 *  wall of italic paragraphs. The lead keeps its whole paragraph. */
export function firstSentence(s: string): string {
  const flat = (s || '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < flat.length; i++) {
    const c = flat[i];
    if (c !== '.' && c !== '!' && c !== '?' && c !== '…') continue;
    const atEnd = i + 1 >= flat.length;
    if (!atEnd && flat[i + 1] !== ' ') continue;
    if (c === '.') {
      const prev = flat[i - 1] || '';
      const after = flat[i + 1] || '';
      if (/\d/.test(prev) && /\d/.test(after)) continue;
      const tail = /([A-Za-z]+(?:\.[A-Za-z]+)*)$/.exec(flat.slice(0, i))?.[1] || '';
      const bare = tail.replace(/\./g, '').toLowerCase();
      if (tail.includes('.') || /^[A-Z]$/.test(tail) || SENTENCE_ABBREV.has(bare)) continue;
    }
    return flat.slice(0, i + 1);
  }
  return flat;
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

/** Every lab announcement published on the edition's day, newest first. */
export function todayLabBoxes(lab: TodayLab[], date: Date): TodayLab[] {
  const ymd = editionYmd(date);
  return [...(lab || [])]
    .filter((e) => {
      const t = Date.parse(e?.date || '');
      return Number.isFinite(t) && editionYmd(new Date(t)) === ymd;
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** The newest lab announcement published on the edition's day, if any. */
export function todayLabBox(lab: TodayLab[], date: Date): TodayLab | null {
  return todayLabBoxes(lab, date)[0] ?? null;
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
 *  shift from rounding the count down a day. Exported for the masthead ear,
 *  which prints the same number beside the edition label. */
export function solOf(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

/** The engraving's size on the page: the lead's picture spans columns, the
 *  side column's pictures are next in weight, column events print smaller
 *  and births and deaths keep their small portraits. */
export type PhotoSize = 'lead' | 'medium' | 'event' | 'stamp';

function photoFigure(
  fact: Fact,
  t: Dict,
  opts: { eager: boolean; caption: boolean; size: PhotoSize },
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
    `<figure class="photo photo--${opts.size}"><div class="print">` +
    `<img src="${esc(src)}" alt="${alt}"${dims}${loading}></div>${cap}</figure>`
  );
}

function itemHtml(fact: Fact, t: Dict, date: Date, size: 'event' | 'stamp'): string {
  const years = yearsOnWay(fact, date);
  const text = fact.text ? fact.text.charAt(0).toUpperCase() + fact.text.slice(1) : '';
  const img = photoFigure(fact, t, { eager: false, caption: false, size });
  const cls = img ? `item has-photo item--${size}` : 'item';
  const link = fact.link
    ? `<a href="${esc(fact.link)}" target="_blank" rel="noopener noreferrer">${esc(t.wikiLink)}</a>`
    : '';
  // The body's own paragraph: the first sentence only, so a long summary
  // never leaves one column longer than the rest. Skipped when empty or when
  // it would repeat the line above (a person with no summary, whose line is
  // already the body). The lead keeps its whole paragraph.
  const body = firstSentence(itemBody(fact));
  const bodyHtml = body && body !== fact.text ? `<p class="body">${esc(body)}</p>` : '';
  return (
    `<article class="${cls}">${img}` +
    `<div class="yr"><b>${esc(fact.year)}</b><span>${esc(fmt(t.ago[fact.kind], { years }))}</span></div>` +
    `<p>${esc(text)}</p>${bodyHtml}${link}</article>`
  );
}

/** A column shows this many letters before the rest fold under "show more". */
export const COLUMN_FOLD = 6;

/** One column entry: its kind sets the heading it prints under. */
export interface ColEntry {
  kind: Fact['kind'];
  fact: Fact;
}

/** A printed column's weight in body lines: the line, one sentence of body
 *  and the engraving's own rows. The splitter below balances columns by it. */
export function estimate(f: Fact): number {
  const body = firstSentence(itemBody(f));
  return Math.ceil((f.text || '').length / 26) + Math.ceil(body.length / 34) + (f.thumb ? 7 : 0) + 2;
}

const kindTitle = (kind: Fact['kind'], t: Dict): string =>
  kind === 'event' ? t.events : kind === 'born' ? t.births : t.deaths;

/** Split the day's letters into balanced columns. Entries stay contiguous in
 *  kind order; each column closes at the cut nearest its third of the total
 *  weight, so the columns end within a few lines of each other. Short days
 *  (or days with a single kind) keep one column per kind instead. */
export function splitColumns(entries: ColEntry[]): ColEntry[][] {
  if (!entries.length) return [];
  if (entries.length === 1) return [[entries[0]]];
  const kinds = new Set(entries.map((e) => e.kind));
  const total = entries.reduce((n, e) => n + estimate(e.fact), 0);
  if (!(total > 45 && kinds.size >= 2)) {
    const cols: ColEntry[][] = [];
    for (const e of entries) {
      const last = cols[cols.length - 1];
      if (last && last[0].kind === e.kind) last.push(e);
      else cols.push([e]);
    }
    return cols;
  }
  const cum: number[] = [];
  let running = 0;
  for (const e of entries) {
    running += estimate(e.fact);
    cum.push(running);
  }
  // The end index of the column closing nearest weight t, never before lo
  // and never past the second-to-last letter (every column keeps at least
  // one letter).
  const cutNear = (t: number, lo: number): number => {
    let best = Math.min(lo, entries.length - 2);
    for (let i = best; i <= entries.length - 2; i++) {
      if (Math.abs(cum[i] - t) < Math.abs(cum[best] - t)) best = i;
    }
    return best;
  };
  const cut1 = cutNear(total / 3, 0);
  const cut2 = cutNear((2 * total) / 3, cut1 + 1);
  return [
    entries.slice(0, cut1 + 1),
    entries.slice(cut1 + 1, cut2 + 1),
    entries.slice(cut2 + 1),
  ].filter((c) => c.length > 0);
}

/** One balanced column: a heading per kind change, marked as a continuation
 *  when the kind runs on from the previous column. */
function balancedColumnHtml(
  col: ColEntry[],
  openKind: Fact['kind'] | null,
  t: Dict,
  date: Date,
  lang: TodayLang,
  plate: boolean,
): { html: string; endKind: Fact['kind'] | null } {
  const head = col.slice(0, COLUMN_FOLD);
  const extra = col.slice(COLUMN_FOLD);
  let cur: Fact['kind'] | null = null;
  let first = true;
  const render = (items: ColEntry[]): string => {
    let html = '';
    for (const e of items) {
      if (e.kind !== cur) {
        const continuing = first && cur === null && openKind === e.kind;
        html +=
          `<h3>${esc(kindTitle(e.kind, t))}` +
          (continuing ? ` <span class="cont">${esc(t.continued)}</span>` : '') +
          `</h3>`;
        cur = e.kind;
      }
      first = false;
      html += itemHtml(e.fact, t, date, e.kind === 'event' ? 'event' : 'stamp');
    }
    return html;
  };
  let html = `<section class="col">` + render(head);
  if (extra.length) {
    html +=
      `<details class="more"><summary>${esc(fmt(t.more, { n: extra.length }))}</summary>` +
      render(extra) +
      `</details>`;
  }
  if (plate) html += paperPlateHtml(lang);
  return { html: html + `</section>`, endKind: cur };
}

/** The edition's inner HTML: everything inside `#edition`. */
export function todayEditionHtml(feed: TodayFeed, lang: TodayLang, date: Date): string {
  const t = dict(lang);
  const facts = feed?.facts || [];
  const lead = todayLead(facts, date);
  const aside = todayAside(facts, lead);
  const boxes = todayLabBoxes(feed?.lab || [], date);

  const full = new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const sol = solOf(date);
  const counts = fmt(t.counts, { n: facts.length, m: boxes.length });

  let out =
    `<div class="dateline"><span>${esc(full)}</span>` +
    `<span>${esc(t.sol)} ${sol}</span><span>${esc(counts)}</span></div>`;

  out += `<div class="banner">${esc(t.banner)}</div><div class="front">`;

  for (const box of boxes) {
    const exp = expNameOf(box.topic);
    const kicker = [t.labKicker, exp, typeOf(box, t)]
      .filter((s) => s)
      .join(' · ');
    out +=
      `<article class="labmail">` +
      `<p class="kicker">${esc(kicker)}</p>` +
      `<h2>${esc(box.title || '')}</h2>` +
      `<p>${esc(firstParagraph(box.body || ''))}</p>` +
      `<a href="${lang === 'es' ? '/es/newspaper/#lab' : '/newspaper/#lab'}">${esc(t.labLink)}</a></article>`;
  }

  if (lead) {
    const years = yearsOnWay(lead, date);
    const headline = leadHeadline(lead);
    const body = leadBody(lead);
    out +=
      `<article class="lead${aside.length ? '' : ' solo'}"><div class="story">` +
      `<p class="kicker">${esc(fmt(t.leadKicker, { years }))}</p>` +
      `<h2>${esc(headline)}</h2>` +
      photoFigure(lead, t, { eager: true, caption: true, size: 'lead' }) +
      (body ? `<p class="dropcap">${esc(body)}</p>` : '') +
      (lead.link
        ? `<a href="${esc(lead.link)}" target="_blank" rel="noopener noreferrer">${esc(t.readOn)}</a>`
        : '') +
      `</div></article>`;
  }

  // The rail beside the lead: the events the lead pushed aside read first,
  // then the Workbench notice. Nothing else shares it, so a long side column
  // can no longer stretch past the lead and leave a hole under it.
  const side = aside.length
    ? `<aside class="also">` +
      aside
        .map((f) => {
          const text = f.text ? f.text.charAt(0).toUpperCase() + f.text.slice(1) : '';
          const body = firstSentence(itemBody(f));
          const bodyHtml =
            body && body !== f.text ? `<p class="aside-body">${esc(body)}</p>` : '';
          const img = photoFigure(f, t, { eager: false, caption: false, size: 'medium' });
          return (
            `<div class="aside-item${img ? ' has-photo' : ''}">${img}<div>` +
            `<p><b>${esc(f.year)}</b>${esc(text)}</p>${bodyHtml}</div></div>`
          );
        })
        .join('') +
      `</aside>`
    : '';
  if (side) {
    out += `<div class="rail">${side}${paperAdHtml(lang, 'workbench')}</div>`;
  }

  // The audits display advertisement spans the front under the lead and,
  // when the day has one, the rail — never the lead slot itself.
  out += paperAdHtml(lang, 'audits');

  const rest = (kind: Fact['kind']) =>
    facts.filter((f) => f.kind === kind && f !== lead && !aside.includes(f)).sort(byYearAsc);
  // Every letter whose article carries a photo prints it, like births and
  // deaths do; the column folds the overflow under "show more" instead.
  const entries: ColEntry[] = (['event', 'born', 'died'] as const).flatMap((kind) =>
    rest(kind).map((fact) => ({ kind, fact })),
  );
  const cols = splitColumns(entries);
  if (cols.length) {
    // The engraving absorbs the slack the day's content leaves: it is
    // appended in the lightest column (ties to the first).
    let plateAt = 0;
    let lightest = Infinity;
    cols.forEach((col, i) => {
      const weight = col.reduce((n, e) => n + estimate(e.fact), 0);
      if (weight < lightest) {
        lightest = weight;
        plateAt = i;
      }
    });
    let openKind: Fact['kind'] | null = null;
    out += `<div class="cols">`;
    cols.forEach((col, i) => {
      const rendered = balancedColumnHtml(col, openKind, t, date, lang, i === plateAt);
      out += rendered.html;
      openKind = rendered.endKind;
    });
    out += `</div>`;
  }

  // The small notices close the front, each sized to its own content. On a
  // day without a side column the Workbench notice joins them instead of
  // leaving the rail's column empty.
  out +=
    `<div class="ad-pair">` +
    (side ? '' : paperAdHtml(lang, 'workbench')) +
    paperAdHtml(lang, 'install') +
    paperAdHtml(lang, 'collab') +
    `</div>`;

  out += `</div><p class="colophon-note">${esc(t.colophon)}</p>`;
  return out;
}

/** The markdown twin: the same edition as plain text, one line per letter. */
export function todayEditionMarkdown(feed: TodayFeed, lang: TodayLang, date: Date): string {
  const t = dict(lang);
  const facts = feed?.facts || [];
  const lead = todayLead(facts, date);
  const aside = todayAside(facts, lead);
  const boxes = todayLabBoxes(feed?.lab || [], date);

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
    `${fmt(t.counts, { n: facts.length, m: boxes.length })}`,
    '',
  ];

  for (const box of boxes) {
    const exp = expNameOf(box.topic);
    const kicker = [t.labKicker, exp, typeOf(box, t)].filter((s) => s).join(' · ');
    lines.push(`## ${kicker}`, '', `**${box.title || ''}**`, '', firstParagraph(box.body || ''));
    lines.push('', `[${t.labLink}](${path}#lab)`, '');
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
  // The lab's advertisements ride the twin as one short line each.
  lines.push(paperAdsMarkdown(lang), '');
  return lines.join('\n');
}
