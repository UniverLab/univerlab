/**
 * The edition renderer, exercised through its public entry with facts that
 * reach every print path: the photo figure (dims, lazy/eager, caption), the
 * item column (links, missing text, the un-parseable year), the lead with and
 * without a summary, the lab box on the edition's day and off it, and the
 * route matcher in all its spellings. Today's suites cover the happy page;
 * this one covers the branches.
 */
import {
  todayRoute,
  todayEditionHtml,
  todayLead,
  todayAside,
  todayLabBox,
  editionYmd,
  editionDate,
  otdUrl,
  type TodayFeed,
} from '../lib/today-edition';
import type { Fact } from '../lib/science-filter';

const DATE = new Date(2026, 9, 25, 12, 0, 0); // Sun Oct 25 2026, noon
const ymd = editionYmd(DATE);

const fact = (over: Partial<Fact>): Fact => ({
  year: '1881',
  text: 'a botanist was born',
  link: 'https://en.wikipedia.org/wiki/Friedrich_von_Berchtold',
  kind: 'born',
  page: 'Friedrich von Berchtold',
  ...over,
});

const born = fact({});
const bornNoYear = fact({ year: 'ancient', page: 'Unknown', text: '' });
const bornNoLink = fact({ link: '', page: 'Heinrich Schwabe' });
const died = fact({ kind: 'died', year: '1647', page: 'Evangelista Torricelli', text: 'died' });
const event = fact({ kind: 'event', year: '1945', page: 'United Nations', text: 'charter signed', thumb: { src: 'https://upload.wikimedia.org/commons/x.jpg' } });
const leadWithSummary = fact({ year: '1929', page: 'Hubble telescope', text: 'an idea', summary: 'An idea that widened the sky.', thumb: { src: 'https://upload.wikimedia.org/commons/y.jpg', w: 320, h: 240 } });
const bornThinThumb = fact({ year: '1804', page: 'A thin sheet', text: 'born', thumb: { src: 'https://upload.wikimedia.org/commons/z.jpg' } });

const feed: TodayFeed = {
  facts: [born, bornNoYear, bornNoLink, died, event, leadWithSummary, bornThinThumb],
  lab: [
    { id: 'l1', date: `${ymd}T09:00:00Z`, title: 'A launch', body: 'shipped', type: 'launch', topic: 'canopy', link: '/canopy/' },
    { id: 'l0', date: '2000-01-01T00:00:00Z', title: 'Ancient', body: 'old', type: 'weird-code', topic: '  ', link: null },
    { id: 'lx', date: 'not-a-date', title: 'Broken', body: 'x', type: null, topic: null, link: null },
    { id: 'l9', date: `${ymd}T08:00:00Z`, title: 'No type', body: 'plain', type: '', topic: 'nope', link: undefined },
  ],
};

describe('todayRoute', () => {
  it('accepts both languages with or without slash and the md twin', () => {
    expect(todayRoute('/today')).toBe('en');
    expect(todayRoute('/today/')).toBe('en');
    expect(todayRoute('/today/index.md')).toBe('en');
    expect(todayRoute('/es/today')).toBe('es');
    expect(todayRoute('/es/today/')).toBe('es');
    expect(todayRoute('/es/today/index.md')).toBe('es');
    expect(todayRoute('/status/')).toBeNull();
  });
});

describe('helpers', () => {
  it('the otd url is locale-prefixed and zero-padded', () => {
    expect(otdUrl('en', DATE)).toBe('https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/10/25');
    expect(otdUrl('es', new Date(2026, 0, 5, 12))).toBe('https://es.wikipedia.org/api/rest_v1/feed/onthisday/all/01/05');
  });
  it('the lead survives an empty pool and picks the day event', () => {
    expect(todayLead([], DATE)).toBeNull();
    expect(todayLead([event], DATE)).toBe(event);
    expect(todayAside([], null)).toEqual([]);
  });
  it('the aside takes the two oldest events, newer first', () => {
    const e1 = fact({ kind: 'event', year: '1901', page: 'One' });
    const e2 = fact({ kind: 'event', year: '1999', page: 'Two' });
    const e3 = fact({ kind: 'event', year: '1955', page: 'Three' });
    expect(todayAside([e1, e2, e3, born], null).map((f) => f.year)).toEqual(['1955', '1901']);
  });
  it('the lab box takes the newest entry on the edition day only', () => {
    expect(todayLabBox(feed.lab, DATE)?.id).toBe('l1');
    expect(todayLabBox([], DATE)).toBeNull();
    expect(todayLabBox([{ id: 'z', date: '1999-12-31T23:00:00Z', title: 't', body: 'b' }], DATE)).toBeNull();
  });
});

describe('todayEditionHtml prints every branch', () => {
  it('the English edition holds links, photos and fallbacks', () => {
    const html = todayEditionHtml(feed, 'en', DATE);
    expect(html).toContain('Berchtold');
    expect(html).toContain('loading="lazy"'); // column figures are lazy
    expect(html).toContain('width="320"'); // dims print when known
    expect(html).not.toContain('width="undefined"');
    expect(html).toContain('Wikipedia'); // link column
    expect(html).toContain('0 years on its way'); // the un-parseable year
    expect(html).toContain('A launch'); // the newest lab letter of the day
    expect(html).toContain('launch'); // known type in the page language
    expect(html).toContain('Canopy'); // its topic spelled as a name
  });
  it('an unknown announcement type prints as served', () => {
    const html = todayEditionHtml(
      { facts: [event], lab: [{ id: 'w', date: `${ymd}T09:00:00Z`, title: 't', body: 'b', type: 'weird-code' }] },
      'en',
      DATE,
    );
    expect(html).toContain('weird-code');
  });
  it('the Spanish edition localizes the columns and the links', () => {
    const html = todayEditionHtml(feed, 'es', DATE);
    expect(html).toContain('Berchtold');
    expect(html).toContain('Nacimientos');
    expect(html).toContain('Leer en Wikipedia');
    expect(html).toContain('años en camino');
  });
  it('an empty feed still prints the paper', () => {
    const html = todayEditionHtml({ facts: [], lab: [] }, 'en', DATE);
    expect(html).toContain('<h3>Events</h3>');
    expect(html).toContain('0 letters from the past');
  });
  it('a feed field missing entirely degrades to empty', () => {
    expect(todayEditionHtml({} as TodayFeed, 'en', DATE).length).toBeGreaterThan(0);
  });
  it('the edition date is noon-local of its ymd', () => {
    const d = editionDate(DATE);
    expect(d.getHours()).toBe(12);
    expect(editionYmd(d)).toBe(ymd);
  });
});
