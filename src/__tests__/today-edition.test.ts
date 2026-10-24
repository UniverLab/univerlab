import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPool, letterPool } from '../lib/science-filter';
import { dailyFact } from '../lib/mail';
import {
  editionDate,
  editionYmd,
  otdUrl,
  todayAside,
  todayEditionHtml,
  todayEditionMarkdown,
  todayLabBox,
  todayLead,
  todayRoute,
  type TodayFeed,
} from '../lib/today-edition';

const FIX = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/onthisday-1021.json'), 'utf8'),
);

// The date the scratch run picked: dailyFact(letterPool(buildPool(FIX,'en')),d)
// for d = new Date(Y,9,21,12), Y in 2015–2045, first hits Alfred Nobel.
function nobelYear(): number {
  const pool = buildPool(FIX, 'en');
  for (let y = 2015; y <= 2045; y++) {
    const d = new Date(y, 9, 21, 12);
    if (dailyFact(letterPool(pool), d)?.year === '1833') return y;
  }
  throw new Error('no Nobel year in 2015–2045 — the fixture no longer leads with Nobel');
}

const Y = nobelYear();
const DATE = new Date(Y, 9, 21, 12);
const FACTS = buildPool(FIX, 'en');
const NOBEL_IMG =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Alfred_Nobel.jpg/330px-Alfred_Nobel.jpg';
const EDISON_IMG =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Thomas_Edison.jpg/320px-Thomas_Edison.jpg';

function feed(lang: 'en' | 'es' = 'en'): TodayFeed {
  return {
    facts: FACTS,
    lab: [
      {
        id: 'q-100',
        date: new Date(Y, 9, 21, 9, 0, 0).toISOString(),
        title: 'Quorum 1.0.0: a planning-poker table drawn as an old plate',
        body: 'The table now looks like the rest of the lab.\n\nSecond paragraph that must not survive.',
        type: 'lanzamiento',
        topic: 'quorum',
        link: null,
      },
    ],
  };
}

const countItems = (html: string): number => (html.match(/class="item/g) ?? []).length;

describe('today edition helpers', () => {
  it('keys the edition by the lab’s midnight (UTC−5), not UTC', () => {
    // 2026-10-21 04:59 UTC is still the 20th in Bogotá.
    expect(editionYmd(new Date('2026-10-21T04:59:00Z'))).toBe('2026-10-20');
    expect(editionYmd(new Date('2026-10-21T05:00:00Z'))).toBe('2026-10-21');
    expect(editionDate(new Date('2026-10-21T04:59:00Z'))).toEqual(new Date(2026, 9, 20, 12));
  });

  it('builds the feed URL in the page language from the edition day', () => {
    expect(otdUrl('en', new Date(2026, 9, 21, 12))).toBe(
      'https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/10/21',
    );
    expect(otdUrl('es', new Date(2026, 9, 21, 12))).toBe(
      'https://es.wikipedia.org/api/rest_v1/feed/onthisday/all/10/21',
    );
  });

  it('routes the four newspaper paths per language', () => {
    expect(todayRoute('/today')).toBe('en');
    expect(todayRoute('/today/')).toBe('en');
    expect(todayRoute('/today/index.md')).toBe('en');
    expect(todayRoute('/es/today')).toBe('es');
    expect(todayRoute('/es/today/')).toBe('es');
    expect(todayRoute('/es/today/index.md')).toBe('es');
    expect(todayRoute('/todayx/')).toBeNull();
    expect(todayRoute('/')).toBeNull();
  });

  it('leads with the same letter the mailbox delivers', () => {
    expect(todayLead(FACTS, DATE)?.year).toBe('1833');
    expect(todayLead([], DATE)).toBeNull();
  });

  it('sides the two oldest non-lead events, newer first', () => {
    const aside = todayAside(FACTS, todayLead(FACTS, DATE));
    expect(aside.map((f) => f.year)).toEqual(['1879', '1638']);
  });

  it('boxes the newest lab entry of the edition day only', () => {
    expect(todayLabBox(feed().lab, DATE)?.id).toBe('q-100');
    expect(todayLabBox([], DATE)).toBeNull();
    const old = [{ ...feed().lab[0], id: 'old', date: new Date(Y, 8, 1).toISOString() }];
    expect(todayLabBox(old, DATE)).toBeNull();
  });
});

describe('todayEditionHtml (en)', () => {
  const html = todayEditionHtml(feed(), 'en', DATE);

  it('datelines the full date, the Sol and the counts', () => {
    expect(html).toContain('October 21');
    expect(html).toContain(String(Y));
    const sol = Math.floor((DATE.getTime() - new Date(Y, 0, 0).getTime()) / 86400000);
    expect(html).toContain(`Sol ${sol}`);
    expect(html).toContain(`${FACTS.length} letters from the past · 1 from the lab`);
  });

  it('frames the lab mail with its kicker, title, first paragraph and /status/ link', () => {
    expect(html).toContain('Lab mail · today · Quorum · lanzamiento');
    expect(html).toContain('Quorum 1.0.0: a planning-poker table drawn as an old plate');
    expect(html).toContain('The table now looks like the rest of the lab.');
    expect(html).not.toContain('Second paragraph');
    expect(html).toContain('<a href="/status/">Read the full announcement →</a>');
  });

  it('leads with Nobel: headline, drop-capped first paragraph, Commons photo, caption', () => {
    expect(html).toContain(`Letter of the day · ${Y - 1833} years on its way`);
    expect(html).toContain('<h2>Alfred Nobel</h2>');
    expect(html).toContain('class="dropcap"');
    expect(html.match(/class="dropcap"/g)).toHaveLength(1);
    expect(html).toContain(NOBEL_IMG);
    // The lead photo loads eagerly — no loading="lazy" on its tag.
    const tag = html.slice(html.indexOf(NOBEL_IMG) - 200, html.indexOf(NOBEL_IMG));
    expect(tag).not.toContain('loading=');
    expect(html).toContain('Alfred Nobel · Wikimedia Commons');
  });

  it('keeps the side column to two events and no photos', () => {
    const aside = html.slice(html.indexOf('<aside>'), html.indexOf('</aside>'));
    expect(aside).toContain('1879');
    expect(aside).toContain('1638');
    expect(aside.indexOf('1879')).toBeLessThan(aside.indexOf('1638'));
    expect(aside).not.toContain('<img');
  });

  it('lists every other fact once across the three columns', () => {
    expect(countItems(html)).toBe(FACTS.length - 1);
    expect(html).toContain('<h3>Events</h3>');
    expect(html).toContain('<h3>Births</h3>');
    expect(html).toContain('<h3>Deaths</h3>');
    // Capitalized text and a Wikipedia link per item.
    expect(html).toContain('Thomas Edison invents a practical incandescent lamp');
  });

  it('never prints event photos, non-Commons images or .svg files', () => {
    expect(html).not.toContain(EDISON_IMG);
    expect(html).not.toContain('wikipedia/en/');
    expect(html).not.toContain('.svg');
  });

  it('shows people photos lazily', () => {
    expect(html).toContain('Martin_Gardner.jpg');
    expect(html).toContain('loading="lazy"');
  });

  it('escapes feed text', () => {
    const evil = todayEditionHtml(
      { facts: [{ year: '1900', text: '<script>alert(1)</script> chemist', link: '', kind: 'event', page: '' }], lab: [] },
      'en',
      DATE,
    );
    expect(evil).not.toContain('<script>');
    expect(evil).toContain('&lt;script&gt;');
  });
});

describe('todayEditionHtml (es)', () => {
  const html = todayEditionHtml(feed(), 'es', DATE);

  it('speaks Spanish: masthead copy lives in the component, edition copy here', () => {
    expect(html).toContain('Carta del día');
    expect(html).toContain('años en camino');
    expect(html).toContain('<h3>Acontecimientos</h3>');
    expect(html).toContain('<h3>Nacimientos</h3>');
    expect(html).toContain('<h3>Defunciones</h3>');
    expect(html).toContain('Correo del laboratorio · hoy · Quorum · lanzamiento');
    expect(html).toContain('Wikipedia →');
  });
});

describe('todayEditionMarkdown', () => {
  it('carries the same lead and columns as text', () => {
    const md = todayEditionMarkdown(feed(), 'en', DATE);
    expect(md).toMatch(/^---\ntitle: "[^"]+"\nsource: "https:\/\/univerlab\.org\/today\/"\n---\n/);
    expect(md).toContain('Alfred Nobel');
    expect(md).toContain('Letters of science arriving today');
    expect(md).toContain(`${FACTS.length} letters from the past · 1 from the lab`);
    expect(md).toContain('## Events');
    expect(md).toContain('Quorum 1.0.0');
    expect(md).not.toContain('class="item');
  });
});
