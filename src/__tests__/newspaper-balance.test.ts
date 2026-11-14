/**
 * The front page holds no holes and no lopsided band: on a long edition
 * (the 1021 fixture, 17 letters) and on a short one, the columns end within
 * a few lines of each other, every letter prints exactly once, the rail
 * carries no row count and the lead and the rail stay within a few lines.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPool, collectFacts, letterPool } from '../lib/science-filter';
import { dailyFact } from '../lib/mail';
import {
  chooseHouseSlots,
  estimate,
  firstSentence,
  splitColumns,
  todayAside,
  todayEditionHtml,
  todayEditionMarkdown,
  todayLead,
  type ColEntry,
  type TodayFeed,
} from '../lib/today-edition';
import type { Fact } from '../lib/science-filter';

const FIX = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/onthisday-1021.json'), 'utf8'),
);

function leadYear(): number {
  const pool = buildPool(FIX, 'en');
  for (let y = 2015; y <= 2045; y++) {
    const d = new Date(y, 9, 21, 12);
    if (dailyFact(letterPool(pool), d)?.year === '1928') return y;
  }
  throw new Error('no 1928 event in 2015–2045');
}

const Y = leadYear();
const DATE = new Date(Y, 9, 21, 12);
const FACTS = buildPool(FIX, 'en');

const textOf = (html: string): string => html.replace(/<[^>]+>/g, '');
const colTexts = (html: string): string[] => {
  const cols = html.slice(html.indexOf('<div class="cols">'));
  return [...cols.matchAll(/<section class="col">(.*?)<\/section>/gs)].map((m) => textOf(m[1]));
};
const blockOf = (html: string, start: string, end: string): string => {
  const at = html.indexOf(start);
  return textOf(html.slice(at, html.indexOf(end, at)));
};
// A band is balanced when its longest column runs at most ~1.35x its
// shortest: a few body lines apart, never a hole beside a long column.
const ratioOk = (lengths: number[]): boolean =>
  Math.max(...lengths) / Math.min(...lengths) <= 1.35;

describe('a long edition balances its columns', () => {
  const html = todayEditionHtml({ facts: FACTS, lab: [] }, 'en', DATE);

  it('prints three columns ending within a few lines of each other', () => {
    const lens = colTexts(html).map((s) => s.length);
    expect(lens).toHaveLength(3);
    expect(ratioOk(lens)).toBe(true);
  });

  it('splits contiguous kinds at the cuts nearest each third', () => {
    const lead = todayLead(FACTS, DATE);
    const aside = todayAside(FACTS, lead);
    const entries: ColEntry[] = (['event', 'born', 'died'] as const).flatMap((kind) =>
      FACTS.filter((f) => f.kind === kind && f !== lead && !aside.includes(f))
        .sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10))
        .map((fact) => ({ kind, fact })),
    );
    const cols = splitColumns(entries);
    expect(cols).toHaveLength(3);
    const weights = cols.map((c) => c.reduce((n, e) => n + estimate(e.fact), 0));
    expect(ratioOk(weights)).toBe(true);
    // Contiguous: flattening the columns restores kind order.
    expect(cols.flat().map((e) => e.kind).join(',')).toBe(
      entries.map((e) => e.kind).join(','),
    );
  });

  it('prints every letter of the day exactly once', () => {
    const lead = (html.match(/<article class="lead/g) ?? []).length;
    const side = (html.match(/<div class="aside-item/g) ?? []).length;
    const items = (html.match(/<article class="item/g) ?? []).length;
    expect(lead + side + items).toBe(FACTS.length);
  });

  it('keeps the rail content-sized beside a lead within a few lines', () => {
    expect(html).not.toContain('rail" style=');
    // Lines of ~70 characters: the lead story and the rail (the two events
    // only — the Workbench notice left the rail) end within three lines of
    // each other, so no hole opens under either of them.
    const lines = (s: string): number => Math.ceil(s.length / 70);
    const leadLen = blockOf(html, '<article class="lead', '</article>');
    const railStart = html.indexOf('<div class="rail">');
    const alsoEnd = html.indexOf('</aside>', railStart);
    const railLen = textOf(html.slice(railStart, html.indexOf('</div>', alsoEnd)));
    expect(Math.abs(lines(leadLen) - lines(railLen))).toBeLessThanOrEqual(3);
  });

  it('carries a single Workbench ad with both offers under the lead', () => {
    // One duo, in the audits display's full-bleed place, with a link per
    // offer — and no second Workbench printing anywhere (no tall rail ad).
    expect(html).not.toContain('ad--tall');
    const duos = [...html.matchAll(/<aside class="ad ad--feature"[^>]*>(.*?)<\/aside>/gs)];
    expect(duos).toHaveLength(1);
    expect(duos[0][1]).toContain('href="/workbench/"');
    expect(duos[0][1]).toContain('href="/workbench/audits/"');
    const railStart = html.indexOf('<div class="rail">');
    const railEnd = html.indexOf('</div>', html.indexOf('</aside>', railStart));
    expect(html.slice(railStart, railEnd)).not.toContain('class="ad');
  });

  it('foots the short columns with the house ads and leaves no ad-pair', () => {
    expect(html).not.toContain('ad-pair');
    const colsHtml = html.slice(html.indexOf('<div class="cols">'));
    const colBodies = [...colsHtml.matchAll(/<section class="col">(.*?)<\/section>/gs)].map(
      (m) => m[1],
    );
    expect(colBodies.length).toBeGreaterThan(0);
    const houseInCols =
      colBodies.reduce((n, b) => n + (b.match(/<aside class="ad ad--small"/g) ?? []).length, 0);
    const houseEverywhere = (html.match(/<aside class="ad ad--small"/g) ?? []).length;
    // One merged dual-offer notice or the two notices apart — and every
    // house notice sits inside a column foot, none below the columns.
    expect([1, 2]).toContain(houseEverywhere);
    expect(houseInCols).toBe(houseEverywhere);
  });

  it('prints the same composition in Spanish, twin included', () => {
    const es = todayEditionHtml({ facts: FACTS, lab: [] }, 'es', DATE);
    expect(es).not.toContain('ad-pair');
    expect(es).not.toContain('ad--tall');
    expect(es).toContain('href="/es/workbench/"');
    expect(es).toContain('href="/es/workbench/audits/"');
    expect(es).toContain('href="/es/contributors/"');
    const esMd = todayEditionMarkdown({ facts: FACTS, lab: [] }, 'es', DATE);
    expect(esMd).toContain('https://univerlab.org/es/workbench/');
    expect(esMd).toContain('https://univerlab.org/es/workbench/audits/');
  });

  it('runs a kind that overflows its column on under a continuation mark', () => {
    // The births run past the first column into the second: the second
    // births heading says so instead of repeating the plain heading.
    expect(html).toContain('<span class="cont">continued</span>');
    const es = todayEditionHtml({ facts: FACTS, lab: [] }, 'es', DATE);
    expect(es).toContain('<span class="cont">continuación</span>');
  });

  it('prints every ad as a display ad sized to its content', () => {
    const ads = [...html.matchAll(/<aside class="ad ad--\w+"[^>]*>(.*?)<\/aside>/gs)];
    // The single Workbench duo plus the house footing: one merged notice
    // or the two notices apart.
    expect(ads.length).toBeGreaterThanOrEqual(2);
    expect(ads.length).toBeLessThanOrEqual(3);
    for (const [, body] of ads) {
      expect(body).toContain('class="ad-display"');
      expect(body).toContain('class="ad-copy"');
      expect(body).toContain('class="ad-close"');
      const cta = body.indexOf('class="ad-cta"');
      expect(cta).toBeGreaterThan(body.indexOf('class="ad-close"'));
      // No inner blank: the copy holds the lines, nothing else.
      expect(body).not.toContain('class="tail"');
    }
  });

  it('chooses the house footing from the column weights', () => {
    // Two columns ending well short split the notices; one short column
    // merges them into the lightest one; level columns merge too.
    expect(chooseHouseSlots([10, 5, 5])).toBe('split');
    expect(chooseHouseSlots([10, 10, 5])).toBe('merged');
    expect(chooseHouseSlots([10, 10, 10])).toBe('merged');
    expect(chooseHouseSlots([10])).toBe('merged');
    expect(chooseHouseSlots([])).toBe('merged');
  });

  it('prints column bodies as one sentence, never a wall', () => {
    for (const m of html.matchAll(/<p class="body">(.*?)<\/p>/g)) {
      expect(firstSentence(m[1])).toBe(m[1]);
    }
  });
});

describe('a short edition keeps one column per kind', () => {
  const mk = (kind: Fact['kind'], year: string, text: string): Fact => ({
    year,
    text,
    link: '',
    kind,
    page: `${kind} ${year}`,
  });
  const longLife: Fact = {
    ...mk('born', '1801', 'Another notable person was born'),
    summary: 'She mapped the southern sky. Then she taught for decades. Her catalogue is still in use.',
  };
  const feed: TodayFeed = {
    facts: [
      mk('event', '1901', 'Something happened in 1901 here'),
      mk('event', '1912', 'Something happened in 1912 here'),
      mk('born', '1800', 'A notable person was born'),
      longLife,
    ],
    lab: [],
  };
  const html = todayEditionHtml(feed, 'en', DATE);

  it('lists the one remaining birth without splitting or continuing', () => {
    expect(colTexts(html)).toHaveLength(1);
    expect(html).not.toContain('class="cont"');
    expect(html).toContain('<h3>Births</h3>');
  });

  it('prints each letter exactly once with no sized rail', () => {
    const lead = (html.match(/<article class="lead/g) ?? []).length;
    const side = (html.match(/<div class="aside-item/g) ?? []).length;
    const items = (html.match(/<article class="item/g) ?? []).length;
    expect(lead + side + items).toBe(feed.facts.length);
    expect(html).not.toContain('rail" style=');
  });

  it('prints a long summary as its first sentence only', () => {
    expect(html).toContain('<p class="body">She mapped the southern sky.</p>');
    expect(html).not.toContain('Then she taught for decades.');
  });

  it('merges the house ads into one when a single column leaves one foot', () => {
    // One foot of space: a single merged notice carrying both offers, and
    // it stands inside the columns — never in a row below them.
    const asides = [...html.matchAll(/<aside class="ad[^>]*>(.*?)<\/aside>/gs)].map((m) => m[1]);
    const merged = asides.filter((b) => b.includes('/canopy/') && b.includes('/contributors/'));
    expect(merged).toHaveLength(1);
    expect(html).not.toContain('ad-pair');
    const colsStart = html.indexOf('<div class="cols">');
    expect(colsStart).toBeGreaterThan(-1);
    expect(html.indexOf('/contributors/', colsStart)).toBeGreaterThan(colsStart);
  });
});

describe('firstSentence', () => {
  it('cuts at the first sentence and passes the rest through', () => {
    expect(firstSentence('First. Second.')).toBe('First.');
    expect(firstSentence('¿Hola? Adiós.')).toBe('¿Hola?');
    expect(firstSentence('He led the U.S. Senate. Then he retired.')).toBe(
      'He led the U.S. Senate.',
    );
    expect(firstSentence('Jacques Charles, físico (f. 1823). Otro.')).toBe('Jacques Charles, físico (f. 1823).');
    expect(firstSentence('Robert Scott (b. 1868). Next.')).toBe('Robert Scott (b. 1868).');
    expect(firstSentence('No terminator here')).toBe('No terminator here');
    expect(firstSentence('')).toBe('');
  });

  it('collects long Spanish feed summaries down to one sentence', () => {
    const ES = JSON.parse(
      readFileSync(resolve(__dirname, 'fixtures/onthisday-es-summaries.json'), 'utf8'),
    ) as { events: Array<{ year: number; text: string; pages?: unknown[] }> };
    const facts = collectFacts(ES.events as Parameters<typeof collectFacts>[0], 'event', 'es');
    const withBody = facts.filter((f) => f.summary || f.long);
    expect(withBody.length).toBeGreaterThan(0);
    for (const f of withBody) {
      const body = f.long ?? f.summary ?? '';
      const one = firstSentence(body);
      // One sentence: no terminator runs on into a second sentence.
      expect(one).not.toMatch(/[.?!…] .*$/);
      expect(one.length).toBeLessThanOrEqual(body.length);
    }
  });
});
