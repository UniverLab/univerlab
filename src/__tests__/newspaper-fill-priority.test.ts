/**
 * Page-one fill priority: at most one lab announcement, the lead letter,
 * every event that fits, then births, then deaths. A lower item never
 * prints while a higher one was left out — in English and Spanish, on
 * several edition dates. The queue decides admission only: the lead still
 * prints first and the lab announcement sits under it.
 */
import {
  todayAside,
  todayEditionHtml,
  todayEditionMarkdown,
  todayLead,
  type TodayFeed,
  type TodayLab,
} from '../lib/today-edition';
import type { Fact } from '../lib/science-filter';

// Three edition dates, November 16th among them: the fill order holds on
// every date, not just one.
const DATES = [new Date(2026, 10, 16, 12), new Date(2026, 9, 21, 12), new Date(2026, 0, 5, 12)];

const ev = (year: string): Fact => ({
  year,
  text: `the happening of ${year} shook the town`,
  link: '',
  kind: 'event',
  page: '',
});
const born = (year: string): Fact => ({
  year,
  text: `a notable person of ${year} was born`,
  link: '',
  kind: 'born',
  page: `Person ${year}`,
});
const died = (year: string): Fact => ({
  year,
  text: `a notable person of ${year} died`,
  link: '',
  kind: 'died',
  page: `Person ${year}`,
});

const FACTS: Fact[] = [ev('1800'), ev('1900'), ev('2000'), born('1801'), born('1901'), died('1950')];

const box = (id: string, date: Date, hour: number): TodayLab => ({
  id,
  date: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0).toISOString(),
  title: `Title ${id}`,
  body: `Body ${id}.`,
  type: 'launch',
  topic: 'general',
  link: null,
});

const feedFor = (date: Date): TodayFeed => ({
  facts: FACTS,
  lab: [box('old', date, 8), box('mid', date, 9), box('new', date, 10)],
});

const labmails = (html: string): string[] =>
  [...html.matchAll(/<article class="labmail">([\s\S]*?)<\/article>/g)].map((m) => m[1]);

describe.each([['en'], ['es']] as Array<['en' | 'es']>)('page-one fill priority (%s)', (lang) => {
  it.each([0, 1, 2])('admits the queue in order and prints the lead first on date %i', (d) => {
    const date = DATES[d];
    const feed = feedFor(date);
    const html = todayEditionHtml(feed, lang, date);
    const lead = todayLead(feed.facts, date);
    const aside = todayAside(feed.facts, lead);

    // At most one lab announcement: the day's newest box.
    const mails = labmails(html);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toContain('Title new');
    expect(mails[0]).not.toContain('Title old');

    // Every letter prints exactly once: the lead and the columns' events,
    // births and deaths.
    const items = (html.match(/<article class="item/g) ?? []).length;
    expect((html.match(/<article class="lead/g) ?? []).length).toBe(1);
    expect(1 + items).toBe(FACTS.length);
    expect(html).not.toContain('class="rail"');

    // The queue's head after the lead opens the columns: every non-lead
    // event, oldest first — so no birth or death reads before an event.
    const colsAt = html.indexOf('<div class="cols"');
    expect(colsAt).toBeGreaterThan(-1);
    const colsHtml = html.slice(colsAt);
    const eventYears = [...colsHtml.matchAll(/data-kind="event" data-i="\d+">(?:<figure[\s\S]*?<\/figure>)?<div class="yr"><b>(\d+)<\/b>/g)].map((m) => m[1]);
    expect(eventYears).toEqual(aside.map((f) => f.year));
    expect(aside.map((f) => f.year)).toEqual([...aside.map((f) => f.year)].sort());

    // Births and deaths follow the events, kind by kind.
    const birthsAt = colsHtml.indexOf('1801');
    const deathsAt = colsHtml.indexOf('1950');
    expect(birthsAt).toBeGreaterThan(-1);
    expect(deathsAt).toBeGreaterThan(-1);
    expect(birthsAt).toBeLessThan(deathsAt);

    // The lead is the top story of page one: the lab story is placed by
    // the layout under the lead, above the Workbench display.
    expect(html.indexOf('<article class="lead')).toBeLessThan(html.indexOf('<article class="labmail">'));
    expect(html.indexOf('<article class="labmail">')).toBeLessThan(html.indexOf('class="notice notice--feature"'));
  });

  it.each([0, 1, 2])('the twin still lists every letter and every lab box on date %i', (d) => {
    const date = DATES[d];
    const feed = feedFor(date);
    const md = todayEditionMarkdown(feed, lang, date);
    const lead = todayLead(feed.facts, date);
    // Every non-lead letter rides its year line; the lead rides its
    // headline. Nothing prints twice.
    for (const f of FACTS) {
      if (f === lead) {
        const headline = f.text.charAt(0).toUpperCase() + f.text.slice(1);
        expect(md).toContain(`**${headline}**`);
      } else {
        expect(md).toContain(`**${f.year}**`);
      }
    }
    expect(md).toContain('Title old');
    expect(md).toContain('Title mid');
    expect(md).toContain('Title new');
  });
});
