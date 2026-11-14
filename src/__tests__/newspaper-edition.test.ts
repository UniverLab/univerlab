import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { experiments } from '../lib/experiments';
import { labPlateHtml, paperPlateHtml } from '../lib/paper-plate';
import { buildPool, collectFacts, letterPool, summaryText, type Fact } from '../lib/science-filter';
import { dailyFact } from '../lib/mail';
import {
  editionDate,
  editionDateFor,
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
    expect(todayRoute('/newspaper')).toBe('en');
    expect(todayRoute('/newspaper/')).toBe('en');
    expect(todayRoute('/newspaper/index.md')).toBe('en');
    expect(todayRoute('/es/newspaper')).toBe('es');
    expect(todayRoute('/es/newspaper/')).toBe('es');
    expect(todayRoute('/es/newspaper/index.md')).toBe('es');
    expect(todayRoute('/newspaperx/')).toBeNull();
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

  it('frames the lab mail with its kicker, title, first paragraph and newspaper link', () => {
    expect(html).toContain('Lab mail · today · Quorum · launch');
    expect(html).toContain('Quorum 1.0.0: a planning-poker table drawn as an old plate');
    expect(html).toContain('The table now looks like the rest of the lab.');
    expect(html).not.toContain('Second paragraph');
    expect(html).toContain('<a href="/newspaper/#lab">Read the full announcement →</a>');
  });

  it('prints the lab entry as a second headline, not a level-skip under the h1', () => {
    expect(html).toContain('<h2>Quorum 1.0.0');
    expect(html).not.toContain('<h3>Quorum 1.0.0');
  });

  it('leads with the day’s event as its own headline, never a page title or a photo', () => {
    expect(html).toContain(`Letter of the day · ${Y - 1928} years ago`);
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
    const leadStart = html.indexOf('<article class="lead">');
    const leadBlock = html.slice(leadStart, html.indexOf('</article>', leadStart));
    expect(leadBlock.indexOf('<article class="lead">')).toBe(0);
    expect(leadBlock).not.toContain('<img');
    expect(leadBlock).not.toContain('figcaption');
    // Nobel's photo moved down to the Births column: lazy, uncaptioned.
    expect(html).toContain(NOBEL_IMG);
    const tag = html.slice(html.indexOf(NOBEL_IMG), html.indexOf(NOBEL_IMG) + 200);
    expect(tag).toContain('loading="lazy"');
    expect(html).not.toContain('Alfred Nobel · Wikimedia Commons');
  });

  it('keeps the side column to two events, their pictures next in weight', () => {
    const at = html.indexOf('<aside class="also">');
    const aside = html.slice(at, html.indexOf('</aside>', at));
    expect(aside).toContain('1879');
    expect(aside).toContain('1638');
    expect(aside.indexOf('1879')).toBeLessThan(aside.indexOf('1638'));
    // The 1879 portrait prints at the side column's own size; nothing in the
    // side column outranks the lead's engraving or shrinks to a stamp.
    expect(aside).toContain('photo--medium');
    expect(aside).not.toContain('photo--lead');
    expect(aside).not.toContain('photo--event');
    expect(aside).not.toContain('photo--stamp');
    // One sentence of body under each event, never the whole summary.
    for (const m of aside.matchAll(/<p class="aside-body">(.*?)<\/p>/g)) {
      expect(m[1]).not.toMatch(/[.?!…] .*$/);
    }
  });

  it('lists every other fact once across the three columns', () => {
    expect(countItems(html)).toBe(FACTS.length - 1 - todayAside(FACTS, todayLead(FACTS, DATE)).length);
    expect(html).toContain('<h3>Events</h3>');
    expect(html).toContain('<h3>Births</h3>');
    expect(html).toContain('<h3>Deaths</h3>');
    // Capitalized text and a Wikipedia link per item.
    expect(html).toContain('Thomas Edison invents a practical incandescent lamp');
  });

  it('a letter beside the lead is not printed again in the columns', () => {
    const facts: Fact[] = ['1901', '1912', '1923'].map((year) => ({
      year,
      text: `event of ${year} happened here`,
      link: '',
      kind: 'event',
      page: '',
    }));
    const lead = todayLead(facts, DATE);
    const aside = todayAside(facts, lead);
    expect(aside).toHaveLength(2);
    const html = todayEditionHtml({ facts, lab: [] }, 'en', DATE);
    const md = todayEditionMarkdown({ facts, lab: [] }, 'en', DATE);
    for (const f of aside) {
      const text = f.text.charAt(0).toUpperCase() + f.text.slice(1);
      expect(html.split(text)).toHaveLength(2);
      expect(md.split(text)).toHaveLength(2);
    }
  });

  it('a kind with no letters prints no column', () => {
    const events: Fact[] = ['1901', '1912', '1923', '1934'].map((year) => ({
      year,
      text: `event of ${year} happened here`,
      link: '',
      kind: 'event',
      page: '',
    }));
    const four = todayEditionHtml({ facts: events, lab: [] }, 'en', DATE);
    expect(four.match(/<section class="col">/g)).toHaveLength(1);
    const one = todayEditionHtml({ facts: events.slice(0, 1), lab: [] }, 'en', DATE);
    expect(one).not.toContain('<div class="cols">');
  });

  it('a column folds after six letters', () => {
    const births: Fact[] = Array.from({ length: 9 }, (_, i) => ({
      year: String(1800 + i),
      text: `notable person ${i} was born`,
      link: '',
      kind: 'born',
      page: `Person ${i}`,
    }));
    const html = todayEditionHtml({ facts: births, lab: [] }, 'en', DATE);
    const at = html.indexOf('<details class="more">');
    expect(at).toBeGreaterThan(-1);
    expect(html.slice(0, at).match(/class="item/g)).toHaveLength(6);
    expect(html.slice(at).match(/class="item/g)).toHaveLength(3);
    expect(html).toContain('Show 3 more');
    const es = todayEditionHtml({ facts: births, lab: [] }, 'es', DATE);
    expect(es).toContain('Ver 3 más');
  });

  it('the markdown twin lists every letter', () => {
    const births: Fact[] = Array.from({ length: 9 }, (_, i) => ({
      year: String(1800 + i),
      text: `notable person ${i} was born`,
      link: '',
      kind: 'born',
      page: `Person ${i}`,
    }));
    const md = todayEditionMarkdown({ facts: births, lab: [] }, 'en', DATE);
    expect(md.match(/^- \*\*/gm)).toHaveLength(9);
  });

  it('omits the .lead block and runs feature, columns, notices when the day has no event', () => {
    const noEvents = FACTS.filter((f) => f.kind !== 'event');
    expect(noEvents.length).toBeGreaterThan(0);
    const bare = todayEditionHtml({ facts: noEvents, lab: [] }, 'en', DATE);
    expect(bare).not.toContain('class="lead"');
    expect(bare).not.toContain('Letter of the day');
    expect(bare).not.toContain('<aside>');
    // With no side column there is no rail to leave a hole beside: the
    // single Workbench display runs full width and the house notices foot
    // the columns — no closing row, no second Workbench anywhere.
    const front = bare.slice(bare.indexOf('<div class="front">'));
    expect(front).not.toContain('<div class="rail">');
    const order = ['ad--feature', '<div class="cols">'].map((m) => front.indexOf(m));
    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(front).not.toContain('class="ad ad--tall"');
    expect(front).not.toContain('ad-pair');
    expect(bare).not.toContain('rail" style=');
    // And the columns still list every birth and death.
    expect(bare).toContain('<h3>Births</h3>');
    expect(bare).toContain('<h3>Deaths</h3>');
    expect(bare).toContain('Alfred Nobel, Swedish chemist');
    expect(bare).toContain('Niels Bohr, Danish physicist');
    expect(countItems(bare)).toBe(noEvents.length);
  });

  it('prints an event photo beside the event, like births and deaths', () => {
    // 1879 carries a Commons portrait but sits sidelined, so the column
    // proof uses letters of its own: one event per column slot.
    const ev = (year: string): Fact => ({
      year,
      text: `something happened in ${year}`,
      link: '',
      kind: 'event',
      page: `Event of ${year}`,
      thumb: { src: `https://upload.wikimedia.org/wikipedia/commons/${year}.jpg` },
    });
    const col = todayEditionHtml(
      { facts: [ev('1901'), ev('1902'), ev('1903'), ev('1904'), ev('1905'), ev('1906')], lab: [] },
      'en',
      DATE,
    );
    // Six letters: one leads, two stand aside, three fill the column —
    // every column event prints its photo at the column size, lazily.
    expect(col.match(/class="item has-photo item--event"/g)).toHaveLength(3);
    expect(col).toContain('photo--event');
    expect(col).toContain('loading="lazy"');
  });

  it('still excludes non-Commons images and .svg files', () => {
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
    expect(html).toContain('Carta del día · hace ');
    expect(html).toContain('<h3>Acontecimientos</h3>');
    expect(html).toContain('<h3>Nacimientos</h3>');
    expect(html).toContain('<h3>Defunciones</h3>');
    expect(html).toContain('Correo del laboratorio · hoy · Quorum · lanzamiento');
    expect(html).toContain('<a href="/es/newspaper/#lab">Leer el anuncio completo →</a>');
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
    expect(md).toMatch(/^---\ntitle: "[^"]+"\nsource: "https:\/\/univerlab\.org\/newspaper\/"\n---\n/);
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
    expect(md).toContain('[Read the full announcement →](https://univerlab.org/newspaper/#lab)');
  });
});

describe('the sundial engraving sits inside the grid', () => {
  it('renders the day plate, lazy, with the paper caption', () => {
    const fig = paperPlateHtml('en');
    expect(fig).toContain('<figure class="photo paper-plate">');
    expect(fig).toContain('/bench/postcards/today-day-1600.avif 1600w');
    expect(fig).toContain('/bench/postcards/today-day-800.webp 800w');
    expect(fig).toContain('loading="lazy"');
    expect(fig).toContain("The sundial, the paper's engraving");
    expect(fig).not.toContain('today-night');
  });

  it('sets the page-2 ticker plate at the same sizes as the page-1 plate', () => {
    const sizesOf = (fig: string): string[] =>
      [...fig.matchAll(/sizes="([^"]+)"/g)].map((m) => m[1]);
    const day = sizesOf(paperPlateHtml('en'));
    const lab = sizesOf(labPlateHtml('en'));
    expect(day.length).toBeGreaterThan(0);
    expect(lab).toEqual(day);
    expect(lab).toContain('(min-width: 48rem) 20rem, 100vw');
    const esFig = labPlateHtml('es');
    expect(sizesOf(esFig)).toEqual(day);
    expect(esFig).toContain('El teletipo, el grabado del periódico');
  });

  it('is appended in the shortest column, ties to the first', () => {
    const mk = (kind: Fact['kind'], year: string): Fact => ({
      year,
      text: `${kind} letter of ${year}`,
      link: '',
      kind,
      page: `${kind} ${year}`,
    });
    // No events: no lead, no aside — births take three slots, deaths one.
    const html = todayEditionHtml(
      { facts: [mk('born', '1800'), mk('born', '1801'), mk('born', '1802'), mk('died', '1900')], lab: [] },
      'en',
      DATE,
    );
    expect(html.match(/paper-plate/g)).toHaveLength(1);
    expect(html.indexOf('paper-plate')).toBeGreaterThan(html.indexOf('<h3>Deaths</h3>'));
    // Equal columns: the first one takes the plate.
    const tied = todayEditionHtml(
      { facts: [mk('born', '1800'), mk('born', '1801'), mk('died', '1900'), mk('died', '1901')], lab: [] },
      'en',
      DATE,
    );
    const at = tied.indexOf('paper-plate');
    expect(at).toBeGreaterThan(tied.indexOf('<h3>Births</h3>'));
    expect(at).toBeLessThan(tied.indexOf('<h3>Deaths</h3>'));
  });
});

describe('the lab advertisements', () => {
  it('prints the duo and the house footing on every edition, honestly labelled, never the lead', () => {
    for (const lang of ['en', 'es'] as const) {
      const html = todayEditionHtml({ facts: [], lab: [] }, lang, DATE);
      // No columns on an empty edition: the single Workbench duo plus the
      // merged house notice closing the front on its own.
      const asides = html.match(/<aside class="ad ad--[a-z]+" aria-label="[^"]*">/g) ?? [];
      expect(asides).toHaveLength(2);
      const label = lang === 'es' ? 'Aviso' : 'Notice';
      for (const a of asides) expect(a).toContain(`aria-label="${label}"`);
      // The label is printed, not only spoken to a screen reader.
      expect(html.match(new RegExp(`<p class="kicker">${label}</p>`, 'g')) ?? []).toHaveLength(2);
      expect(html).toContain('<div class="banner">');
    }
    // With a full edition the lead carries no advertisement.
    const full = todayEditionHtml(feed(), 'en', DATE);
    const leadStart = full.indexOf('<article class="lead');
    expect(leadStart).toBeGreaterThan(-1);
    expect(full.slice(leadStart, full.indexOf('</article>', leadStart))).not.toContain('class="ad');
    // The front runs rail, feature, columns: the side column beside the
    // lead, the single Workbench display under them, the house notices
    // footing the short columns — never a row below them.
    const front = full.slice(full.indexOf('<div class="front">'));
    const order = ['<div class="rail">', 'class="ad ad--feature"', '<div class="cols">'].map((m) =>
      front.indexOf(m),
    );
    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(full).not.toContain('<div class="ad-pair">');
    expect(full).not.toContain('class="ad ad--tall"');
    // The rail holds only the side column, never a sized band and never an
    // ad: no rail carries an inline row count.
    expect(full).toContain('<div class="rail">');
    expect(full.indexOf('<aside class="also">')).toBeGreaterThan(full.indexOf('<div class="rail"'));
    expect(full).not.toContain('rail" style=');
    // Every ad is a display ad: a large display line, copy and a boxed
    // call to action that closes the notice.
    for (const m of full.matchAll(/<aside class="ad ad--\w+"[^>]*>(.*?)<\/aside>/gs)) {
      expect(m[1]).toContain('class="ad-display"');
      expect(m[1]).toContain('class="ad-copy"');
      const close = m[1].indexOf('class="ad-close"');
      expect(close).toBeGreaterThan(-1);
      expect(m[1].indexOf('class="ad-cta"', close)).toBeGreaterThan(close);
    }
  });

  it('leaves no sized band on the front: no rail carries a row count', () => {
    // No lead and no lab mail, a full edition, a lead-less day: the rail is
    // always content-sized.
    expect(todayEditionHtml({ facts: [], lab: [] }, 'en', DATE)).not.toContain('rail" style=');
    const noEvents = FACTS.filter((f) => f.kind !== 'event');
    expect(noEvents.length).toBeGreaterThan(0);
    expect(todayEditionHtml({ facts: noEvents, lab: [] }, 'en', DATE)).not.toContain('rail" style=');
    expect(todayEditionHtml(feed(), 'en', DATE)).not.toContain('rail" style=');
  });

  it('spells the Spanish Workbench notice without a lone banco', () => {
    const html = todayEditionHtml({ facts: [], lab: [] }, 'es', DATE);
    expect(html).toContain('Banco de trabajo');
    expect(html).toContain('inteligencia artificial');
    expect(html).not.toMatch(/[a-zñ] banco/);
    expect(html).toContain('<a class="ad-cta" href="/es/workbench/">Abrir el Banco de trabajo</a>');
    expect(html).toContain('<a class="ad-cta" href="/es/workbench/audits/">');
    expect(html).toContain('<a href="/es/canopy/">Canopy</a>');
    expect(html).toContain('<a href="/es/facetmedia/">');
    expect(html).toContain('<a class="ad-cta" href="/es/contributors/">');
  });

  it('installs with the registry one-liners, never hardcoded', () => {
    const html = todayEditionHtml({ facts: [], lab: [] }, 'en', DATE);
    const canopy = experiments.find((e) => e.id === 'canopy')?.install?.unix;
    const facet = experiments.find((e) => e.id === 'facetmedia')?.install?.unix;
    expect(canopy).toBeTruthy();
    expect(facet).toBeTruthy();
    expect(html).toContain(canopy!);
    expect(html).toContain(facet!);
    expect(html).toContain('curl -fsSL https://install.univerlab.org/canopy | sh');
    expect(html).toContain('uv tool install facetmedia');
  });

  it('rides the markdown twin on the duo line and the house footing', () => {
    const md = todayEditionMarkdown(feed(), 'en', DATE);
    // One Workbench-duo line with both links, then the house footing the
    // columns take: one merged line or the two notices apart.
    const lines = md.match(/^\*Notice — /gm) ?? [];
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(md).toContain('[The Workbench](https://univerlab.org/workbench/)');
    expect(md).toContain('https://univerlab.org/workbench/audits/');
    expect(md).toContain('https://univerlab.org/canopy/');
    expect(md).toContain('https://univerlab.org/facetmedia/');
    expect(md).toContain('https://univerlab.org/contributors/');
    const es = todayEditionMarkdown(feed('es'), 'es', DATE);
    const esLines = es.match(/^\*Aviso — /gm) ?? [];
    expect(esLines.length).toBeGreaterThanOrEqual(2);
    expect(esLines.length).toBeLessThanOrEqual(3);
    expect(es).toContain('[Banco de trabajo](https://univerlab.org/es/workbench/)');
    expect(es).toContain('https://univerlab.org/es/workbench/audits/');
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

describe('the lead prints the long body when the fact carries one', () => {
  const date = new Date(2026, 9, 24, 12);
  const withLong = {
    year: '2007',
    text: 'China lanza la sonda lunar.',
    link: 'https://es.wikipedia.org/wiki/X',
    kind: 'event' as const,
    page: 'X',
    summary: 'Short.',
    summaryCut: false,
    long: 'First. Second. Third.',
    longCut: false,
  };

  it('renders the long body inside the drop-cap paragraph and the markdown twin', () => {
    const html = todayEditionHtml({ facts: [withLong], lab: [] }, 'es', date);
    expect(html).toContain('<p class="dropcap">First. Second. Third.</p>');
    const md = todayEditionMarkdown({ facts: [withLong], lab: [] }, 'es', date);
    expect(md).toContain('First. Second. Third.');
  });

  it('a fact without long still prints its summary', () => {
    const short = {
      year: '2007',
      text: 'China lanza la sonda lunar.',
      link: 'https://es.wikipedia.org/wiki/X',
      kind: 'event' as const,
      page: 'X',
      summary: 'Short.',
      summaryCut: false,
    };
    const html = todayEditionHtml({ facts: [short], lab: [] }, 'es', date);
    expect(html).toContain('<p class="dropcap">Short.</p>');
    const md = todayEditionMarkdown({ facts: [short], lab: [] }, 'es', date);
    expect(md).toContain('Short.');
  });
});

describe('editionDateFor', () => {
  // 2026-11-09T18:00:00Z is 13:00 in Bogotá: the edition is 2026-11-09.
  const NOW = new Date('2026-11-09T18:00:00Z');
  const today = () => editionDate(NOW);

  it('no parameter gives today’s edition', () => {
    expect(editionDateFor('', NOW)).toEqual(today());
    expect(editionDateFor('?x=1', NOW)).toEqual(today());
  });

  it('a past day is honoured', () => {
    const d = editionDateFor('?d=2024-07-20', NOW);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(12);
  });

  it('a future day falls back to today', () => {
    expect(editionDateFor('?d=2026-11-10', NOW)).toEqual(today());
  });

  it('a malformed or impossible day falls back to today', () => {
    expect(editionDateFor('?d=11-09', NOW)).toEqual(today());
    expect(editionDateFor('?d=2026-02-30', NOW)).toEqual(today());
    expect(editionDateFor('?d=abc', NOW)).toEqual(today());
  });
});
