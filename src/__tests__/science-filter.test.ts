import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SCIENCE_EN,
  SCIENCE_ES,
  POLITICS_EN,
  POLITICS_ES,
  MAX_LEN,
  passesScience,
  collectFacts,
  buildPool,
  letterPool,
  FULL_POOL,
  dayKey,
  fetchPool,
  type FilterLang,
  type Fact,
} from '../lib/science-filter';

describe('science keyword lists', () => {
  it('moved out of the header into this module', () => {
    expect(SCIENCE_EN.length).toBeGreaterThan(40);
    expect(SCIENCE_ES.length).toBeGreaterThan(40);
    expect(POLITICS_EN.length).toBeGreaterThan(30);
    expect(POLITICS_ES.length).toBeGreaterThan(30);
  });
});

describe('passesScience', () => {
  const keeps: Array<[string, FilterLang, string]> = [
    ['Alexander Fleming discovers penicillin, a natural antibiotic.', 'en', 'Fleming'],
    ['Marie Curie wins the Nobel prize in chemistry for her work on radium.', 'en', 'Curie'],
    ['Thomas Edison demonstrates the phonograph, an early invention for recording sound.', 'en', 'Edison'],
    ['Isaac Newton publica sus Principia Mathematica, obra cumbre de la física.', 'es', 'Newton'],
    ['Se descubre el primer exoplaneta en órbita alrededor de una estrella semejante al Sol.', 'es', 'exoplaneta'],
  ];
  it.each(keeps)('keeps %s (%s)', (text, lang) => {
    expect(passesScience(text, lang)).toBe(true);
  });

  const drops: Array<[string, FilterLang, string]> = [
    // Science word present, but war/politics vetoes it.
    ['The army tests a new nuclear reactor as a weapon during the war.', 'en', 'war veto'],
    ['King Gustav opens a new observatory in Stockholm after the battle.', 'en', 'king/battle veto'],
    ['The coronation of Queen Elizabeth II draws a crowd of thousands.', 'en', 'no science'],
    ['A football tournament ends with a championship final at the stadium.', 'en', 'sport veto'],
    ['El ejército invade el país tras un golpe de estado en la capital.', 'es', 'guerra veto'],
    ['El rey firma el tratado con el parlamento tras la rebelión.', 'es', 'rey veto'],
    ['Un campeonato de fútbol se juega en el estadio de la ciudad.', 'es', 'deporte veto'],
  ];
  it.each(drops)('drops %s (%s)', (text, lang) => {
    expect(passesScience(text, lang)).toBe(false);
  });

  it('drops narrative-length entries over the 200-character cap', () => {
    const long = `Alexander Fleming discovers penicillin ${'and keeps observing the mould culture in detail '.repeat(4)}`;
    expect(long.length).toBeGreaterThan(MAX_LEN);
    expect(passesScience(long, 'en')).toBe(false);
  });

  it('drops empty text', () => {
    expect(passesScience('', 'en')).toBe(false);
  });
});

const FEED = {
  events: [
    {
      year: 1928,
      text: 'Alexander Fleming notices penicillin killing bacteria, a landmark discovery in medicine.',
      pages: [{ titles: { normalized: 'Penicillin' }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Penicillin' } } }],
    },
    { year: 1969, text: 'The coronation of Queen Elizabeth II takes place.' },
    { year: 1638, text: 'The Great Storm produces the first documented account of ball lightning in England during the war.' },
  ],
  births: [
    { year: 1833, text: 'Alfred Nobel, Swedish chemist and inventor of dynamite, is born.' },
    { year: 1766, text: 'Francisco Antonio Zea, naturalist and scientist, is born.' },
  ],
  deaths: [
    { year: 1958, text: 'Ejnar Hertzsprung, Danish astronomer, dies.' },
  ],
};

describe('collectFacts, buildPool and letterPool', () => {
  it('normalizes the kept entries with year, text, link, kind and page', () => {
    const facts = collectFacts(FEED.events, 'event', 'en');
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      year: '1928',
      kind: 'event',
      link: 'https://en.wikipedia.org/wiki/Penicillin',
      page: 'Penicillin',
    });
    expect(facts[0].text).toContain('penicillin');
  });

  it('buildPool keeps the whole filtered day: every event, birth and death', () => {
    const pool = buildPool(
      { ...FEED, deaths: [...FEED.deaths, { year: 1900, text: 'A chemist dies.' }] },
      'en',
    );
    expect(pool.filter((f) => f.kind === 'event')).toHaveLength(1);
    expect(pool.filter((f) => f.kind === 'born')).toHaveLength(2);
    expect(pool.filter((f) => f.kind === 'died')).toHaveLength(2);
  });

  it('letterPool shapes the letter: every event, the shortest 6 births and 4 deaths', () => {
    const births = Array.from({ length: 9 }, (v, i) => ({
      year: 1800 + i,
      text: `Chemist number ${i}${' a'.repeat(i)} is born.`,
    }));
    const deaths = Array.from({ length: 6 }, (v, i) => ({
      year: 1900 + i,
      text: `Physicist number ${i}${' a'.repeat(i)} dies.`,
    }));
    const full = buildPool({ ...FEED, births, deaths }, 'en');
    const pool = letterPool(full);
    expect(pool.filter((f) => f.kind === 'event')).toHaveLength(1);
    expect(pool.filter((f) => f.kind === 'born')).toHaveLength(6);
    expect(pool.filter((f) => f.kind === 'died')).toHaveLength(4);
    // It kept the shortest ones — the padded texts are the longest, and the
    // sort is per kind: births keep numbers 0-5, deaths keep 0-3.
    const kept = pool.map((f) => f.text);
    expect(kept.some((t) => t.includes('Chemist number 5'))).toBe(true);
    expect(kept.some((t) => t.includes('Chemist number 6'))).toBe(false);
    expect(kept.some((t) => t.includes('Physicist number 3'))).toBe(true);
    expect(kept.some((t) => t.includes('Physicist number 4'))).toBe(false);
    // 0 means everything, which is what the newspaper asks for.
    expect(letterPool(full, FULL_POOL)).toEqual(full);
  });

  it('filters in the page language', () => {
    const es = collectFacts(
      [{ year: 1921, text: 'Marie Curie recibe el premio Nobel de química.' }],
      'event',
      'es',
    );
    expect(es).toHaveLength(1);
  });
});

describe('dayKey and fetchPool', () => {
  it('formats the local calendar day as YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 9, 24))).toBe('2026-10-24');
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('fetches the day feed in the page language, filters it and caches it', async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => FEED };
    }) as unknown as typeof fetch;
    const day = new Date(2026, 9, 24);
    const items = await fetchPool(fakeFetch, 'en', day);
    expect(calls).toEqual(['https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/10/24']);
    expect(items.some((f) => f.text.includes('penicillin'))).toBe(true);
    const cached = JSON.parse(localStorage.getItem('univerlab-otd') || 'null');
    expect(cached.date).toBe('2026-10-24');
    expect(cached.lang).toBe('en');
  });

  it('slices the returned pool by limits but always caches the whole day', async () => {
    const fakeFetch = (async () => ({
      ok: true,
      json: async () => ({
        ...FEED,
        deaths: [
          ...FEED.deaths,
          { year: 1901, text: 'A mathematician dies.' },
          { year: 1902, text: 'Another chemist dies.' },
        ],
      }),
    })) as unknown as typeof fetch;
    const day = new Date(2026, 9, 24);
    // The header asks for the handful-of-shortest letter pool…
    const items = await fetchPool(fakeFetch, 'en', day, { births: 1, deaths: 1 });
    expect(items.filter((f) => f.kind === 'born')).toHaveLength(1);
    expect(items.filter((f) => f.kind === 'died')).toHaveLength(1);
    // … but the cache still holds the whole day, so /today (reading the same
    // cache the header warmed) never sees a truncated newspaper.
    const cached = JSON.parse(localStorage.getItem('univerlab-otd') || 'null');
    const cachedItems = cached.items as Fact[];
    expect(cachedItems.filter((f) => f.kind === 'event')).toHaveLength(1);
    expect(cachedItems.filter((f) => f.kind === 'born')).toHaveLength(2);
    expect(cachedItems.filter((f) => f.kind === 'died')).toHaveLength(3);
  });
});

describe('the newspaper pages ask for the whole day', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

  it.each([
    ['pages/today.astro'],
    ['pages/es/today.astro'],
  ])('%s fetches with FULL_POOL, never a limited pool', (p) => {
    const src = read(p);
    expect(src).toMatch(/fetchPool\(fetch, lang, new Date\(\), FULL_POOL\)/);
  });

  it('the mailbox letter shapes its pool with letterPool instead', () => {
    const src = read('scripts/mail.ts');
    expect(src).toMatch(/dailyFact<Fact>\(letterPool\(pool\)/);
  });
});
