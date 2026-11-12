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
  todayEditionMarkdown,
  todayLead,
  todayAside,
  todayLabBox,
  editionLabel,
  editionYmd,
  editionDate,
  isToday,
  otdUrl,
  type TodayFeed,
} from '../lib/today-edition';
import { summaryText, type Fact } from '../lib/science-filter';

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
    expect(todayRoute('/newspaper')).toBe('en');
    expect(todayRoute('/newspaper/')).toBe('en');
    expect(todayRoute('/newspaper/index.md')).toBe('en');
    expect(todayRoute('/es/newspaper')).toBe('es');
    expect(todayRoute('/es/newspaper/')).toBe('es');
    expect(todayRoute('/es/newspaper/index.md')).toBe('es');
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
    expect(html).toContain('0 years ago'); // the un-parseable year
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
    expect(html).toContain('hace ');
  });
  it('an empty feed still prints the paper', () => {
    const html = todayEditionHtml({ facts: [], lab: [] }, 'en', DATE);
    expect(html).not.toContain('<div class="cols">');
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
  it('each kind is worded by what happened', () => {
    const Y = DATE.getFullYear();
    const mk = (kind: Fact['kind'], year: number): Fact => ({ year: String(year), text: 'x', link: '', kind, page: 'X' });
    const kindsFeed: TodayFeed = { facts: [mk('event', Y - 59), mk('born', Y - 446), mk('died', Y - 13)], lab: [] };
    expect(todayLead(kindsFeed.facts, DATE)).toBe(kindsFeed.facts[0]);
    const en = todayEditionHtml(kindsFeed, 'en', DATE);
    expect(en).toContain(`born 446 years ago`);
    expect(en).toContain(`died 13 years ago`);
    const es = todayEditionHtml(kindsFeed, 'es', DATE);
    expect(es).toContain('nace hace 446 años');
    expect(es).toContain('fallece hace 13 años');
    const md = todayEditionMarkdown(kindsFeed, 'en', DATE);
    expect(md).toContain('(born 446 years ago)');
    expect(md).toContain('(died 13 years ago)');
  });
});

describe('event photos print beside every event that has one', () => {
  const thumbedEvent = (year: string): Fact =>
    fact({ kind: 'event', year, page: `Event of ${year}`, text: `something happened in ${year}`, thumb: { src: `https://upload.wikimedia.org/wikipedia/commons/${year}.jpg`, w: 320, h: 200 } });

  it('the lead event prints its photo', () => {
    const ev = thumbedEvent('1945');
    const html = todayEditionHtml({ facts: [ev], lab: [] }, 'en', DATE);
    expect(todayLead([ev], DATE)).toBe(ev);
    expect(html).toContain('<article class="lead solo">');
    expect(html).toContain('<figure class="photo">');
    expect(html).not.toContain('loading="lazy"');
  });
  it('a lead without a thumb prints no figure', () => {
    const ev = fact({ kind: 'event', year: '1945', page: 'United Nations', text: 'charter signed' });
    const html = todayEditionHtml({ facts: [ev], lab: [] }, 'en', DATE);
    expect(todayLead([ev], DATE)).toBe(ev);
    expect(html).toContain('<article class="lead solo">');
    expect(html).not.toContain('<figure');
  });
  it('a lead with no side column spans the full width, with one it does not', () => {
    const one = [thumbedEvent('1945')];
    expect(todayEditionHtml({ facts: one, lab: [] }, 'en', DATE)).toContain('<article class="lead solo">');
    const three = ['1945', '1946', '1947'].map(thumbedEvent);
    const threeHtml = todayEditionHtml({ facts: three, lab: [] }, 'en', DATE);
    expect(threeHtml).toContain('<article class="lead">');
    expect(threeHtml).not.toContain('lead solo');
  });
  it('every column event with a thumb prints its photo, the lead included', () => {
    const facts = ['1901', '1902', '1903', '1904', '1905', '1906'].map(thumbedEvent);
    const html = todayEditionHtml({ facts, lab: [] }, 'en', DATE);
    // Six letters: one leads, two stand aside, three fill the column.
    expect((html.match(/class="item has-photo"/g) ?? []).length).toBe(3);
    // The lead, the three column photos and the engraving: no cap.
    expect((html.match(/<figure class="photo/g) ?? []).length).toBe(5);
  });
  it('an event without a thumb prints no figure while the rest print theirs', () => {
    const noThumb = fact({ kind: 'event', year: '1800', page: 'Old event', text: 'something old happened' });
    const facts = [noThumb, ...['1901', '1902', '1903', '1904', '1905', '1906'].map(thumbedEvent)];
    const html = todayEditionHtml({ facts, lab: [] }, 'en', DATE);
    const lead = todayLead(facts, DATE)!;
    const aside = todayAside(facts, lead);
    const cols = facts.filter((f) => f !== lead && !aside.includes(f));
    // Every column event carrying a photo prints it, thumb or none.
    expect((html.match(/class="item has-photo"/g) ?? []).length).toBe(cols.filter((f) => f.thumb).length);
    for (const f of cols) {
      if (f.thumb) expect(html).toContain(f.thumb.src);
    }
  });
});

describe('every letter prints its body, not only the lead', () => {
  const day = new Date(2026, 9, 25, 12, 0, 0);
  const summarized = fact({
    kind: 'born',
    year: '1800',
    page: 'Ada Byron',
    text: 'a mathematician was born',
    summary: 'She wrote the first program.',
    summaryCut: false,
  });

  it('a column letter prints its summary body in the html and the twin', () => {
    const html = todayEditionHtml({ facts: [summarized], lab: [] }, 'en', day);
    expect(html).toContain('<p class="body">She wrote the first program.</p>');
    const md = todayEditionMarkdown({ facts: [summarized], lab: [] }, 'en', day);
    expect(md).toContain('  She wrote the first program.');
  });

  it('a cut body ends with … in the column, like the lead', () => {
    const cut = fact({
      ...summarized,
      summary: 'First sentence. The rest is cut.',
      summaryCut: true,
    });
    const html = todayEditionHtml({ facts: [cut], lab: [] }, 'es', day);
    expect(html).toContain(`<p class="body">${summaryText(cut)}</p>`);
    expect(summaryText(cut).endsWith('…')).toBe(true);
  });

  it('an event without a summary prints no body', () => {
    const ev = fact({ kind: 'event', year: '1945', page: 'United Nations', text: 'charter signed' });
    const html = todayEditionHtml({ facts: [ev], lab: [] }, 'en', day);
    expect(html).toContain('<h2>Charter signed</h2>');
    expect(html).not.toContain('class="body"');
    const md = todayEditionMarkdown({ facts: [ev], lab: [] }, 'en', day);
    expect(md.split('Charter signed')).toHaveLength(2);
  });

  it('a person without a summary does not print their line twice', () => {
    const bare = fact({ kind: 'born', year: '1800', page: 'Ada Byron', text: 'a mathematician was born' });
    const html = todayEditionHtml({ facts: [bare], lab: [] }, 'en', day);
    expect(html).not.toContain('class="body"');
    expect(html.split('A mathematician was born')).toHaveLength(2);
  });
});

describe('editionLabel', () => {
  // 2026-11-09T18:00:00Z is 13:00 in Bogotá: the edition is 2026-11-09.
  const NOW = new Date('2026-11-09T18:00:00Z');

  it('reads today only for today’s edition', () => {
    expect(isToday(editionDate(NOW), NOW)).toBe(true);
    expect(editionLabel('en', editionDate(NOW), NOW)).toBe("Today's edition");
    expect(editionLabel('es', editionDate(NOW), NOW)).toBe('Edición de hoy');
  });

  it('reads the edition’s date otherwise, day-first in both languages', () => {
    const past = new Date(2024, 6, 20, 12);
    expect(isToday(past, NOW)).toBe(false);
    expect(editionLabel('en', past, NOW)).toBe('Edition of 20 July');
    expect(editionLabel('es', past, NOW)).toBe('Edición del 20 de julio');
  });
});
