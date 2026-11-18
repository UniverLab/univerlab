/**
 * The front page holds no holes and no lopsided band: on a long edition
 * (the 1021 fixture, 17 letters) and on a short one, the columns end within
 * a few lines of each other, every letter prints exactly once and nothing
 * stands beside the lead to end short of it.
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

const textOf = (html: string): string => {
  let out = html;
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(/<[^>]+>/g, '');
  }
  return out;
};
const colTexts = (html: string): string[] => {
  const cols = html.slice(html.indexOf('<div class="cols"'));
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
    // The columns carry every letter but the lead, events first, and the
    // printed text ends within a few lines.
    const lead = todayLead(FACTS, DATE);
    const entries: ColEntry[] = (['event', 'born', 'died'] as const).flatMap((kind) =>
      FACTS.filter((f) => f.kind === kind && f !== lead)
        .sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10))
        .map((fact) => ({ kind, fact })),
    );
    // Contiguous cuts end within one letter of each other: the tallest
    // letter is the most a cut can be off.
    const weights = splitColumns(entries).map((c) => c.reduce((n, e) => n + estimate(e.fact), 0));
    const tallest = Math.max(...entries.map((e) => estimate(e.fact)));
    expect(Math.max(...weights) - Math.min(...weights)).toBeLessThanOrEqual(tallest);
    const lens = colTexts(html).map((s) => s.length);
    expect(lens).toHaveLength(3);
    const lines = lens.map((n) => Math.ceil(n / 70));
    expect(Math.max(...lines) - Math.min(...lines)).toBeLessThanOrEqual(3);
  });

  it('splits contiguous kinds at the cuts nearest each third', () => {
    const lead = todayLead(FACTS, DATE);
    const entries: ColEntry[] = (['event', 'born', 'died'] as const).flatMap((kind) =>
      FACTS.filter((f) => f.kind === kind && f !== lead)
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

  it('stands nothing beside the lead: no rail to end short of it', () => {
    expect(html).not.toContain('class="rail"');
    expect(html).not.toContain('class="aside-item');
  });

  it('carries a single Workbench notice with both offers under the lead', () => {
    // One duo, in the audits display's full-bleed place, with a link per
    // offer — and no second Workbench printing anywhere (no tall rail notice).
    expect(html).not.toContain('notice--tall');
    const duos = [...html.matchAll(/<aside class="notice notice--feature"[^>]*>(.*?)<\/aside>/gs)];
    expect(duos).toHaveLength(1);
    expect(duos[0][1]).toContain('href="/workbench/#first-call"');
    expect(duos[0][1]).toContain('href="/workbench/audits/"');
  });

  it('keeps the columns free of footers: the plate and the notices wait in templates', () => {
    expect(html).not.toContain('notice-pair');
    const colsHtml = html.slice(html.indexOf('<div class="cols"'));
    const colBodies = [...colsHtml.matchAll(/<section class="col">([\s\S]*?)<\/section>/gs)].map(
      (m) => m[1],
    );
    expect(colBodies.length).toBeGreaterThan(0);
    // No estimate footing: no column carries the plate or a house notice.
    // The client foots only measured free space, one filler per foot.
    for (const body of colBodies) {
      expect(body).not.toContain('paper-plate');
      expect(body).not.toContain('<aside class="notice notice--small"');
    }
    // The fillers wait in templates: the plate, the two notices apart and
    // the merged duo — the page keeps the single Workbench duo plus at most
    // these two house notices.
    for (const kind of ['plate', 'install', 'collab', 'house-duo']) {
      expect(html).toContain(`<template data-filler="${kind}">`);
    }
    // Each waiting notice is complete: a display line, copy and a boxed
    // call to action — the client appends it whole or not at all.
    for (const m of html.matchAll(/<template data-filler="(install|collab|house-duo)">([\s\S]*?)<\/template>/g)) {
      expect(m[2]).toContain('class="display-notice"');
      expect(m[2]).toContain('class="notice-call"');
    }
  });

  it('prints the same composition in Spanish, twin included', () => {
    const es = todayEditionHtml({ facts: FACTS, lab: [] }, 'es', DATE);
    expect(es).not.toContain('notice-pair');
    expect(es).not.toContain('notice--tall');
    expect(es).toContain('href="/es/workbench/#primera-llamada"');
    expect(es).toContain('href="/es/workbench/audits/"');
    expect(es).toContain('href="/es/contributors/"');
    const esMd = todayEditionMarkdown({ facts: FACTS, lab: [] }, 'es', DATE);
    expect(esMd).toContain('https://univerlab.org/es/workbench/#primera-llamada');
    expect(esMd).toContain('https://univerlab.org/es/workbench/audits/');
  });

  it('runs a kind that overflows its column on under a continuation mark', () => {
    // The births run past the first column into the second: the second
    // births heading says so instead of repeating the plain heading.
    expect(html).toContain('<span class="cont">continued</span>');
    const es = todayEditionHtml({ facts: FACTS, lab: [] }, 'es', DATE);
    expect(es).toContain('<span class="cont">continuación</span>');
  });

  it('prints every notice as a display notice sized to its content', () => {
    // Rendered asides only — the templates below are inert until the client
    // foots measured free space. The single Workbench duo prints; the plate
    // and the house notices wait their turn.
    const rendered = html.replace(/<template[\s\S]*?<\/template>/g, '');
    const notices = [...rendered.matchAll(/<aside class="notice notice--\w+"[^>]*>(.*?)<\/aside>/gs)];
    expect(notices).toHaveLength(1);
    expect(notices[0][0]).toContain('notice--feature');
    for (const [, body] of notices) {
      expect(body).toContain('class="display-notice"');
      expect(body).toContain('class="notice-copy"');
      expect(body).toContain('class="notice-close"');
      const cta = body.indexOf('class="notice-call"');
      expect(cta).toBeGreaterThan(body.indexOf('class="notice-close"'));
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

  it('lists the other event and the births a column each, without continuing', () => {
    expect(colTexts(html)).toHaveLength(2);
    expect(html).not.toContain('class="cont"');
    expect(html).toContain('<h3>Events</h3>');
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

  it('stages the house ads in templates when a short day prints', () => {
    // A short day: the notices wait in templates instead of a row below the
    // columns — the client foots the single foot with the duo or one notice.
    const rendered = html.replace(/<template[\s\S]*?<\/template>/g, '');
    expect(rendered).not.toContain('class="notice notice--small"');
    expect(html).not.toContain('notice-pair');
    const colsStart = html.indexOf('<div class="cols"');
    expect(colsStart).toBeGreaterThan(-1);
    const duo = html.match(/<template data-filler="house-duo">([\s\S]*?)<\/template>/);
    expect(duo?.[1]).toContain('/canopy/');
    expect(duo?.[1]).toContain('/contributors/');
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
