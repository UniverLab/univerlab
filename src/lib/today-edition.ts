// The day's newspaper: El Correo del Pasado. One renderer for the edge
// (functions/_middleware.ts fills #edition through HTMLRewriter), the client
// (pages/today.astro fills #edition when the edge did not) and the markdown
// twin (/today/index.md). Escape every text field from the feed.

import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { experiments } from './experiments';
import { firstParagraph } from './lab-feed';
import { dailyFact } from './mail';
import { letterPool, type Fact, type FilterLang } from './science-filter';

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

/** The day's Wikipedia feed in the page language. */
export function otdUrl(lang: TodayLang, date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`;
}

/** The newspaper routes, with or without trailing slash or index.md. */
export function todayRoute(pathname: string): TodayLang | null {
  const p = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  if (p === '/today' || p === '/today/index.md') return 'en';
  if (p === '/es/today' || p === '/es/today/index.md') return 'es';
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
  return (
    `<article class="${cls}">${img}` +
    `<div class="yr"><b>${esc(fact.year)}</b><span>${esc(fmt(t.yearsWay, { years }))}</span></div>` +
    `<p>${esc(text)}</p>${link}</article>`
  );
}

function columnHtml(title: string, items: Fact[], t: Dict, date: Date): string {
  return (
    `<section class="col"><h3>${esc(title)}</h3>` +
    items.map((f) => itemHtml(f, t, date, f.kind !== 'event')).join('') +
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
  const start = new Date(date.getFullYear(), 0, 0);
  const sol = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const counts = fmt(t.counts, { n: facts.length, m: box ? 1 : 0 });

  let out =
    `<div class="dateline"><span>${esc(full)}</span>` +
    `<span>${esc(t.sol)} ${sol}</span><span>${esc(counts)}</span></div>`;

  if (box) {
    const exp = expNameOf(box.topic);
    const kicker = [t.labKicker, exp, box.type || '']
      .filter((s) => s)
      .join(' · ');
    out +=
      `<article class="labmail">` +
      `<p class="kicker">${esc(kicker)}</p>` +
      `<h3>${esc(box.title || '')}</h3>` +
      `<p>${esc(firstParagraph(box.body || ''))}</p>` +
      `<a href="/status/">${esc(t.labLink)}</a></article>`;
  }

  if (lead) {
    const years = yearsOnWay(lead, date);
    const headline = lead.page || lead.text.slice(0, 72);
    out +=
      `<article class="lead"><div class="story">` +
      `<p class="kicker">${esc(fmt(t.leadKicker, { years }))}</p>` +
      `<h2>${esc(headline)}</h2>` +
      (lead.kind !== 'event' ? photoFigure(lead, t, { eager: true, caption: true }) : '') +
      `<p class="dropcap">${esc(lead.text)}</p>` +
      (lead.link
        ? `<a href="${esc(lead.link)}" target="_blank" rel="noopener noreferrer">${esc(t.readOn)}</a>`
        : '') +
      `</div>`;
    if (aside.length) {
      const side = aside
        .map((f) => {
          const text = f.text ? f.text.charAt(0).toUpperCase() + f.text.slice(1) : '';
          return `<p><b>${esc(f.year)}</b>${esc(text)}</p>`;
        })
        .join('');
      out += `<aside>${side}</aside>`;
    }
    out += `</article>`;
  }

  const rest = (kind: Fact['kind']) =>
    facts.filter((f) => f.kind === kind && f !== lead).sort(byYearAsc);
  out +=
    `<div class="cols">` +
    columnHtml(t.events, rest('event'), t, date) +
    columnHtml(t.births, rest('born'), t, date) +
    columnHtml(t.deaths, rest('died'), t, date) +
    `</div>`;

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

  const path = lang === 'es' ? 'https://univerlab.org/es/today/' : 'https://univerlab.org/today/';
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
    `${fmt(t.counts, { n: facts.length, m: box ? 1 : 0 })}`,
    '',
  ];

  if (box) {
    const exp = expNameOf(box.topic);
    const kicker = [t.labKicker, exp, box.type || ''].filter((s) => s).join(' · ');
    lines.push(`## ${kicker}`, '', `**${box.title || ''}**`, '', firstParagraph(box.body || ''), '');
  }

  if (lead) {
    const years = yearsOnWay(lead, date);
    const headline = lead.page || lead.text.slice(0, 72);
    lines.push(`## ${fmt(t.leadKicker, { years })}`, '', `**${headline}**`, '', lead.text);
    if (lead.link) lines.push('', `[${t.readOn}](${lead.link})`);
    if (aside.length) {
      lines.push('', `## ${t.events}`);
      for (const f of aside) lines.push(`- **${f.year}**: ${f.text}`);
    }
    lines.push('');
  }

  const rest = (kind: Fact['kind']) =>
    facts.filter((f) => f.kind === kind && f !== lead).sort(byYearAsc);
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
      lines.push(`- **${f.year}** (${fmt(t.yearsWay, { years })}): ${text}${link}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
