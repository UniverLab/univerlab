import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SCIENCE_EN,
  SCIENCE_ES,
  POLITICS_EN,
  POLITICS_ES,
  MAX_LEN,
  SUMMARY_MAX,
  passesScience,
  mainPage,
  shortSummary,
  summaryText,
  collectFacts,
  buildPool,
  letterPool,
  FULL_POOL,
  dayKey,
  readOtdCache,
  fetchPool,
  type FilterLang,
  type Fact,
} from '../lib/science-filter';
import { dailyFact } from '../lib/mail';

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

  it('letterPool is events only: the day’s events, never births or deaths', () => {
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
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((f) => f.kind === 'event')).toBe(true);
    expect(pool.filter((f) => f.kind === 'born')).toHaveLength(0);
    expect(pool.filter((f) => f.kind === 'died')).toHaveLength(0);
    // 0 means none for births/deaths; for events 0 still means "all", so
    // the newspaper's FULL_POOL asks for the whole day.
    expect(letterPool(full, FULL_POOL)).toEqual(full);
    expect(letterPool(full, { events: 0, births: 0, deaths: 0 })).toEqual(
      full.filter((f) => f.kind === 'event'),
    );
    // An explicit cap above 0 still slices: shortest first (the padded
    // texts are the longest, so births 0-1 stay and number 2 does not).
    const capped = letterPool(full, { events: 1, births: 2, deaths: 1 });
    expect(capped.filter((f) => f.kind === 'event')).toHaveLength(1);
    expect(capped.filter((f) => f.kind === 'born')).toHaveLength(2);
    expect(capped.filter((f) => f.kind === 'died')).toHaveLength(1);
    const kept = capped.map((f) => f.text);
    expect(kept.some((t) => t.includes('Chemist number 1'))).toBe(true);
    expect(kept.some((t) => t.includes('Chemist number 2'))).toBe(false);
  });

  it('an events-free pool gives no letter: letterPool [] and dailyFact null', () => {
    const noEvents = buildPool(FEED, 'en').filter((f) => f.kind !== 'event');
    expect(noEvents.length).toBeGreaterThan(0);
    expect(letterPool(noEvents)).toEqual([]);
    expect(dailyFact(letterPool(noEvents), new Date('2026-10-24T12:00:00Z'))).toBeNull();
    // Nothing falls back to a birth or a death: the letter's default asks
    // for events only, and an explicit 0 for the people means none.
    expect(letterPool(noEvents, { events: 0, births: 0, deaths: 0 })).toEqual([]);
  });

  it('filters in the page language', () => {
    const es = collectFacts(
      [{ year: 1921, text: 'Marie Curie recibe el premio Nobel de química.' }],
      'event',
      'es',
    );
    expect(es).toHaveLength(1);
  });

  it('keeps a photo only for a Commons raster, never a vector or a Wikipedia-only file', () => {
    // The real feed appends `?utm_source=…` and serves an SVG thumbnail as a
    // rasterised `…/File.svg/330px-File.svg.png`: the guard must read the path.
    const page = (src: string, w = 330, h = 400) => ({
      year: 1900,
      text: 'A physicist studies the cathode ray and publishes the result.',
      pages: [
        {
          titles: { normalized: 'Cathode ray' },
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Cathode_ray' } },
          thumbnail: { source: src, width: w, height: h },
        },
      ],
    });
    const UTM = '?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail';
    const facts = collectFacts(
      [
        page('https://upload.wikimedia.org/wikipedia/commons/0/0e/Nobel.jpg/330px-Nobel.jpg' + UTM),
        page('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/Zea.svg?utm_source=x'),
        page('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/Zea.svg/330px-Zea.svg.png' + UTM),
        page('https://upload.wikimedia.org/wikipedia/en/4/4a/Portrait.jpg' + UTM),
        page('https://upload.wikimedia.org/wikipedia/commons/1/12/Okada.jpg' + UTM, 250, 300),
      ],
      'event',
      'en',
    );
    expect(facts).toHaveLength(5);
    const withPhoto = facts.filter((f) => f.thumb);
    expect(withPhoto).toHaveLength(2);
    expect(withPhoto[0].thumb).toEqual({
      src: 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Nobel.jpg/330px-Nobel.jpg' + UTM,
      w: 330,
      h: 400,
    });
    expect(withPhoto[1].thumb?.w).toBe(250);
    // Nothing from a vector or a non-Commons page survives.
    expect(facts.some((f) => /\.svg/i.test(f.thumb?.src || ''))).toBe(false);
    expect(facts.some((f) => (f.thumb?.src || '').includes('/wikipedia/en/'))).toBe(false);
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
    const cached = JSON.parse(localStorage.getItem('univerlab-otd-2') || 'null');
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
    // A caller asks for a sliced letter (explicit caps above 0)…
    const items = await fetchPool(fakeFetch, 'en', day, { births: 1, deaths: 1 });
    expect(items.filter((f) => f.kind === 'born')).toHaveLength(1);
    expect(items.filter((f) => f.kind === 'died')).toHaveLength(1);
    // … but the cache still holds the whole day, so /today (reading the same
    // cache the header warmed) never sees a truncated newspaper.
    const cached = JSON.parse(localStorage.getItem('univerlab-otd-2') || 'null');
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
    expect(src).toMatch(/fetchPool\(fetch, lang, editionDate\(\), FULL_POOL\)/);
  });

  it('the mailbox letter shapes its pool with letterPool instead', () => {
    const src = read('scripts/mail.ts');
    expect(src).toMatch(/dailyFact<Fact>\(letterPool\(pool\)/);
  });
});

const ES_FIX = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/onthisday-es-summaries.json'), 'utf8'),
);

describe('mainPage picks the event\u2019s own page', () => {
  it('picks Chang\u2019e 1 over the country, the observatory over the city, Deep Space 1 alone', () => {
    const [change, cordoba, deep] = ES_FIX.events;
    expect(mainPage(change)?.titles?.normalized).toBe("Chang'e 1");
    expect(mainPage(cordoba)?.titles?.normalized).toBe('Observatorio Astronómico de Córdoba');
    expect(mainPage(deep)?.titles?.normalized).toBe('Deep Space 1');
  });

  it('matches a title across the non-breaking space the live feed writes', () => {
    const entry = {
      year: 2007,
      text: "China lanza la sonda lunar Chang'e\u00a01.",
      pages: [
        { titles: { normalized: 'República Popular China' } },
        { titles: { normalized: "Chang'e 1" } },
      ],
    };
    expect(mainPage(entry)?.titles?.normalized).toBe("Chang'e 1");
  });

  it('breaks ties by the latest match: the object of the sentence comes last', () => {
    const entry = {
      year: 1879,
      text: 'Thomas Edison invents a practical lamp in Menlo Park.',
      pages: [
        { titles: { normalized: 'Thomas Edison' } },
        { titles: { normalized: 'Menlo Park' } },
      ],
    };
    expect(mainPage(entry)?.titles?.normalized).toBe('Menlo Park');
  });

  it('reads display titles with tags stripped and underscores as spaces', () => {
    // Both pages match, so only a title read out of the HTML display form
    // lets the craft win: "Estados Unidos" matches, but starts earlier.
    const entry = {
      year: 1998,
      text: 'Estados Unidos lanza la sonda espacial Deep Space 1.',
      pages: [
        { titles: { display: '<b>Estados_Unidos</b>' } },
        { titles: { display: '<b>Deep</b>_Space_1' } },
      ],
    };
    expect(mainPage(entry)?.titles?.display).toBe('<b>Deep</b>_Space_1');
  });

  it('falls back to the first page whose extract holds the year', () => {
    const entry = {
      year: 1907,
      text: 'A physicist publishes a paper on the new observatory findings.',
      pages: [
        { titles: { normalized: 'Alpha' }, extract: 'A dirty snowball from the outer system.' },
        { titles: { normalized: 'Beta' }, extract: 'In 1907 the observatory recorded the tremors.' },
      ],
    };
    expect(mainPage(entry)?.titles?.normalized).toBe('Beta');
  });

  it('returns pages[0] when nothing matches and no extract holds the year', () => {
    const entry = {
      year: 1900,
      text: 'A physicist publishes a paper on cathode rays.',
      pages: [{ titles: { normalized: 'Physics' } }, { titles: { normalized: 'Paris' } }],
    };
    expect(mainPage(entry)?.titles?.normalized).toBe('Physics');
  });

  it('returns undefined when the entry carries no pages', () => {
    expect(mainPage({ year: 1900, text: 'A chemist dies.' })).toBeUndefined();
    expect(mainPage({ year: 1900, text: 'A chemist dies.', pages: [] })).toBeUndefined();
  });
});

describe('shortSummary keeps the body short', () => {
  it('keeps at most 2 sentences and 260 characters, marking the cut', () => {
    const extract =
      'Primera frase corta. Segunda frase corta también. Tercera frase que no debe entrar.';
    const out = shortSummary(extract, 'Titular distinto');
    expect(out).not.toBeNull();
    expect(out!.summary).toBe('Primera frase corta. Segunda frase corta también.');
    expect(out!.cut).toBe(true);
  });

  it('leaves a whole short extract uncut', () => {
    const out = shortSummary('Una sola frase corta.', 'Titular distinto');
    expect(out).toEqual({ summary: 'Una sola frase corta.', cut: false });
  });

  it('cuts a long first sentence at the last space before 260 characters', () => {
    const long = 'Palabra '.repeat(60).trim() + '.';
    expect(long.length).toBeGreaterThan(SUMMARY_MAX);
    const out = shortSummary(long, 'Titular distinto');
    expect(out).not.toBeNull();
    expect(out!.summary.length).toBeLessThanOrEqual(SUMMARY_MAX);
    expect(out!.cut).toBe(true);
    // Cut at a space: the next character in the flat extract is a space.
    const flat = long.replace(/\s+/g, ' ').trim();
    expect(flat[out!.summary.length]).toBe(' ');
  });

  it('ignores a period inside a number or after a single capital initial', () => {
    const out = shortSummary('El Dr. J. Smith midió 3.14 voltios en el laboratorio.', 'Titular');
    expect(out).toEqual({
      summary: 'El Dr. J. Smith midió 3.14 voltios en el laboratorio.',
      cut: false,
    });
  });

  it('omits a summary that would only repeat the headline', () => {
    expect(shortSummary('El mismo titular', 'el mismo titular')).toBeNull();
  });

  it('omits an empty extract', () => {
    expect(shortSummary('', 'Titular')).toBeNull();
    expect(shortSummary(undefined, 'Titular')).toBeNull();
  });
});

describe('collectFacts with the chosen page and its summary', () => {
  it('links events to the chosen page and carries its summary, never people', () => {
    const facts = collectFacts(ES_FIX.events, 'event', 'es');
    expect(facts).toHaveLength(3);
    const change = facts.find((f) => f.year === '2007')!;
    expect(change.link).toBe("https://es.wikipedia.org/wiki/Chang%27e_1");
    expect(change.page).toBe("Chang'e 1");
    expect(change.summary).toContain("Chang'e 1 fue la primera sonda lunar");
    expect(typeof change.summaryCut).toBe('boolean');
    const cordoba = facts.find((f) => f.year === '1871')!;
    expect(cordoba.page).toBe('Observatorio Astronómico de Córdoba');
    expect(cordoba.link).toContain('Observatorio');
    expect(cordoba.summary).toBeDefined();

    const born = collectFacts(ES_FIX.births, 'born', 'es');
    expect(born).toHaveLength(1);
    // A birth keeps pages[0] — the person — even though a later page title
    // ("Colombia") is what mainPage would pick for an event.
    expect(mainPage(ES_FIX.births[0])?.titles?.normalized).toBe('Colombia');
    expect(born[0].link).toBe('https://es.wikipedia.org/wiki/Francisco_Antonio_Zea');
    expect(born[0].page).toBe('Francisco Antonio Zea');
    expect(born[0].summary).toBeUndefined();
    expect(born[0].summaryCut).toBeUndefined();
  });

  it('reads link, page, thumb and summary from the chosen page, not pages[0]', () => {
    const UTM = '?utm_source=es.wikipedia.org&utm_campaign=api&utm_content=thumbnail';
    const facts = collectFacts(
      [
        {
          year: 2007,
          text: "China lanza la sonda lunar Chang'e 1.",
          pages: [
            { titles: { normalized: 'China' } },
            {
              titles: { normalized: "Chang'e 1" },
              content_urls: { desktop: { page: 'https://es.wikipedia.org/wiki/X' } },
              thumbnail: {
                source: 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Probe.jpg' + UTM,
                width: 330,
                height: 400,
              },
              extract: 'Una sonda lunar china. Orbitó la Luna.',
            },
          ],
        },
      ],
      'event',
      'es',
    );
    expect(facts).toHaveLength(1);
    expect(facts[0].link).toBe('https://es.wikipedia.org/wiki/X');
    expect(facts[0].page).toBe("Chang'e 1");
    expect(facts[0].thumb?.src).toContain('/wikipedia/commons/');
    expect(facts[0].summary).toBe('Una sonda lunar china. Orbitó la Luna.');
    expect(facts[0].summaryCut).toBe(false);
    expect(summaryText(facts[0])).toBe('Una sonda lunar china. Orbitó la Luna.');
  });

  it('a v1 cache is ignored and the pool is written under the v2 key', async () => {
    localStorage.clear();
    localStorage.setItem(
      'univerlab-otd',
      JSON.stringify({ date: '2026-10-24', lang: 'es', items: [{ year: '2007' }] }),
    );
    expect(readOtdCache('es')).toBeNull();
    const fakeFetch = (async () => ({ ok: true, json: async () => ES_FIX })) as unknown as typeof fetch;
    await fetchPool(fakeFetch, 'es', new Date(2026, 9, 24));
    const cached = JSON.parse(localStorage.getItem('univerlab-otd-2') || 'null');
    expect(cached.items.some((f: Fact) => f.summary)).toBe(true);
  });
});
