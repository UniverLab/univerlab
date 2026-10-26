import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPool, collectFacts, letterPool, summaryText } from '../lib/science-filter';
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

// The letter is events only: the date the scratch run picked is the first
// d = new Date(Y,9,21,12), Y in 2015–2045, whose dailyFact over
// letterPool(buildPool(FIX,'en')) hits the 1928 event.
function leadYear(): number {
  const pool = buildPool(FIX, 'en');
  for (let y = 2015; y <= 2045; y++) {
    const d = new Date(y, 9, 21, 12);
    if (dailyFact(letterPool(pool), d)?.year === '1928') return y;
  }
  throw new Error('no 1928 event in 2015–2045 — the fixture no longer leads with it');
}

const Y = leadYear();
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
        type: 'launch',
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

  it('leads with the same event the mailbox delivers, never a birth', () => {
    expect(todayLead(FACTS, DATE)?.year).toBe('1928');
    expect(todayLead([], DATE)).toBeNull();
    // An events-free day: nothing falls back to a birth or a death.
    const noEvents = FACTS.filter((f) => f.kind !== 'event');
    expect(noEvents.length).toBeGreaterThan(0);
    expect(todayLead(noEvents, DATE)).toBeNull();
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
    expect(html).toContain('Lab mail · today · Quorum · launch');
    expect(html).toContain('Quorum 1.0.0: a planning-poker table drawn as an old plate');
    expect(html).toContain('The table now looks like the rest of the lab.');
    expect(html).not.toContain('Second paragraph');
    expect(html).toContain('<a href="/status/">Read the full announcement →</a>');
  });

  it('prints the lab entry as a second headline, not a level-skip under the h1', () => {
    expect(html).toContain('<h2>Quorum 1.0.0');
    expect(html).not.toContain('<h3>Quorum 1.0.0');
  });

  it('leads with the day’s event as its own headline, never a page title or a photo', () => {
    expect(html).toContain(`Letter of the day · ${Y - 1928} years on its way`);
    // The event's line is the headline: the Wikipedia page behind it
    // ("Boston") is a place, not this story.
    const story =
      'Doctors at a Boston hospital switch on a new laboratory respirator to keep a patient breathing.';
    expect(html).toContain(`<h2>${story}</h2>`);
    expect(html).not.toContain('<h2>Boston</h2>');
    // ...and it is printed once, not repeated as the drop-capped body.
    expect(html.split(story)).toHaveLength(2);
    expect(html).not.toContain('class="dropcap"');
    // The lead is an event, and events never print photos: its block
    // carries no figure and no caption at all.
    const leadBlock = html.slice(html.indexOf('<article class="lead">'), html.indexOf('</aside>'));
    expect(leadBlock.indexOf('<article class="lead">')).toBe(0);
    expect(leadBlock).not.toContain('<img');
    expect(leadBlock).not.toContain('figcaption');
    // Nobel's photo moved down to the Births column: lazy, uncaptioned.
    expect(html).toContain(NOBEL_IMG);
    const tag = html.slice(html.indexOf(NOBEL_IMG), html.indexOf(NOBEL_IMG) + 200);
    expect(tag).toContain('loading="lazy"');
    expect(html).not.toContain('Alfred Nobel · Wikimedia Commons');
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

  it('omits the .lead block and starts at the columns when the day has no event', () => {
    const noEvents = FACTS.filter((f) => f.kind !== 'event');
    expect(noEvents.length).toBeGreaterThan(0);
    const bare = todayEditionHtml({ facts: noEvents, lab: [] }, 'en', DATE);
    expect(bare).not.toContain('class="lead"');
    expect(bare).not.toContain('Letter of the day');
    expect(bare).not.toContain('<aside>');
    // The dateline hands straight over to the columns.
    expect(bare).toMatch(/<\/div><div class="cols">/);
    // And the columns still list every birth and death.
    expect(bare).toContain('<h3>Births</h3>');
    expect(bare).toContain('<h3>Deaths</h3>');
    expect(bare).toContain('Alfred Nobel, Swedish chemist');
    expect(bare).toContain('Niels Bohr, Danish physicist');
    expect(countItems(bare)).toBe(noEvents.length);
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

  it('translates the API type code instead of printing "launch" in Spanish', () => {
    expect(html).toContain('· lanzamiento');
    expect(html).not.toContain('· launch');
    // An unknown code is printed as served, never dropped.
    const odd = todayEditionHtml(
      { facts: [], lab: [{ ...feed().lab[0], type: 'release' }] },
      'es',
      DATE,
    );
    expect(odd).toContain('· release');
  });
});

describe('todayEditionMarkdown', () => {
  it('carries the same lead and columns as text', () => {
    const md = todayEditionMarkdown(feed(), 'en', DATE);
    expect(md).toMatch(/^---\ntitle: "[^"]+"\nsource: "https:\/\/univerlab\.org\/today\/"\n---\n/);
    expect(md).toContain(
      '**Doctors at a Boston hospital switch on a new laboratory respirator to keep a patient breathing.**',
    ); // the lead: the same event as the mailbox
    expect(md).not.toContain('**Boston**');
    // The event's line is the headline and is not printed again as a body.
    const story =
      'Doctors at a Boston hospital switch on a new laboratory respirator to keep a patient breathing.';
    expect(md.split(story)).toHaveLength(2);
    expect(md).toContain('Alfred Nobel'); // the Births column still lists him
    expect(md).toContain('Letters of science arriving today');
    expect(md).toContain(`${FACTS.length} letters from the past · 1 from the lab`);
    expect(md).toContain('## Events');
    expect(md).toContain('Quorum 1.0.0');
    expect(md).not.toContain('class="item');
  });

  it('datelines the day, labels the side column and links the lab entry', () => {
    const md = todayEditionMarkdown(feed(), 'en', DATE);
    const sol = Math.floor((DATE.getTime() - new Date(Y, 0, 0).getTime()) / 86400000);
    expect(md).toContain(`October 21, ${Y} · Sol ${sol}**`);
    expect(md).toContain('## Also on this day');
    // The side column no longer repeats the Events heading right below it.
    expect(md.match(/^## Events$/gm)).toHaveLength(1);
    expect(md).toContain('[Read the full announcement →](https://univerlab.org/status/)');
  });
});

describe('the lead carries the summary (es fixture)', () => {
  const ES = JSON.parse(
    readFileSync(resolve(__dirname, 'fixtures/onthisday-es-summaries.json'), 'utf8'),
  ) as { events: Array<{ year: number; text: string; pages?: unknown[] }> };

  it('renders h2 = text and the drop-cap paragraph = summary', () => {
    const facts = collectFacts(ES.events as Parameters<typeof collectFacts>[0], 'event', 'es');
    const date = new Date(2026, 9, 24, 12);
    const lead = todayLead(facts, date);
    expect(lead).not.toBeNull();
    const html = todayEditionHtml({ facts, lab: [] }, 'es', date);
    expect(html).toContain(`<h2>${lead!.text}</h2>`);
    expect(html).toContain(`<p class="dropcap">${summaryText(lead!)}</p>`);
    const md = todayEditionMarkdown({ facts, lab: [] }, 'es', date);
    expect(md).toContain(`**${lead!.text}**`);
    expect(md).toContain(summaryText(lead!));
  });

  it('ends the paragraph with … when the summary was cut', () => {
    const cut = {
      year: '2007',
      text: 'China lanza la sonda lunar.',
      link: 'https://es.wikipedia.org/wiki/X',
      kind: 'event' as const,
      page: 'X',
      summary: 'Primera frase. Segunda frase que sobra.',
      summaryCut: true,
    };
    const html = todayEditionHtml({ facts: [cut], lab: [] }, 'es', new Date(2026, 9, 24, 12));
    expect(html).toContain(`<p class="dropcap">${summaryText(cut)}</p>`);
    expect(summaryText(cut).endsWith('…')).toBe(true);
  });

  it('keeps the old silence with no summary: no drop-cap paragraph', () => {
    const plain = {
      year: '1928',
      text: 'Un médico enciende un respirador.',
      link: '',
      kind: 'event' as const,
      page: '',
    };
    const html = todayEditionHtml({ facts: [plain], lab: [] }, 'es', new Date(2026, 9, 24, 12));
    expect(html).toContain('<h2>Un médico enciende un respirador.</h2>');
    expect(html).not.toContain('class="dropcap"');
  });
});
