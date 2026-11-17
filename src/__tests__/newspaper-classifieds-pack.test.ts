/**
 * The packed classifieds page (paper pages 2 and 3): varied display type
 * rotating across the notices, each engraved cut used at most once per page,
 * the night sheet keeping its light paper, and every cut lazy with its
 * dimensions reserved.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { labPageHtml, labPageHtml2 } from '../lib/lab-page';
import type { Entry } from '../lib/lab-feed';

const src = readFileSync(resolve(__dirname, '..', 'components', 'TodaysPaper.astro'), 'utf8');
const css = src.slice(src.indexOf('<style is:global>'), src.indexOf('</style>'));

const entry = (over: Partial<Entry>): Entry => ({
  id: 'k', date: '2026-10-06T01:09:26.735Z', title: 'T', body: 'B.',
  type: 'note', topic: 'general', link: null, ...over,
});

const mixed: Entry[] = [
  entry({ id: 'l1', type: 'launch', topic: 'canopy', title: 'Launch one' }),
  entry({ id: 'l2', type: 'launch', topic: 'texforge', title: 'Launch two' }),
  ...Array.from({ length: 10 }, (_, i) => entry({
    id: `g${i}`,
    date: new Date(Date.UTC(2026, 9, 4) - i * 86400000).toISOString(),
    type: i % 3 ? 'note' : 'update',
    topic: ['general', 'quorum', 'demostage'][i % 3],
    title: `Ad ${i}`,
  })),
];

describe('the packed classifieds page', () => {
  it('packs five narrow columns with mixed spans under a central lead', () => {
    // Five narrow columns filled top to bottom, like the 1886 notice pages: the
    // column flow leaves no half-empty column, and the phone sheet scales
    // the same composition.
    expect(css).toMatch(/\.paper \.classifieds \{[^}]*column-count: 5/);
    expect(css).toContain('column-rule: 1px solid var(--p-rule)');
    expect(css).not.toMatch(/\.paper \.classifieds \{[^}]*display: grid/);
    // The lead spans the page above the columns, largest of all.
    expect(css).toMatch(/\.paper \.classifieds > \.lead-story, \.paper \.classifieds > \.classifieds-rule \{ column-span: all; \}/);
    expect(css).toContain('.paper .notice-cut.cut-lg img { width: 100%; }');
    // The small type runs tight and justified, with no prose measure.
    expect(css).toContain('.paper .classifieds .log-entry p { font-size: 12.5px; line-height: 1.38; max-width: none;');
    const html = labPageHtml(mixed, 'en') + labPageHtml2(mixed, 'en');
    // The latest launch leads central; one-, two- and three-column ads mix.
    expect(html).toContain('<article class="log-entry display-notice lead-story type-v');
    expect(html).toContain('notice-boxed');
    expect(html).toContain('class="coupon"');
    // No notice is an empty frame: every entry card shows its title as a
    // heading, the repeated word, or the run-in lead.
    const cards = [...html.matchAll(/<article class="([^"]*)"([\s\S]*?)<\/article>/g)]
      .filter((m) => !m[1].split(/\s+/).includes('notice'));
    expect(cards.length).toBeGreaterThan(1);
    for (const card of cards) {
      expect(card[2]).toMatch(/<h3|<span class="rep-word|<p class="run-in"><b>/);
    }
    // No empty ribbon frame rides either page.
    expect(html).not.toContain('classifieds-ribbon');
  });

  it('paints reversed ads light-on-ink after the generic heading rule', () => {
    // The later equal-specificity .log-entry h3 rule once won and painted
    // reversed headings ink on ink; the classifieds-scoped rule must come
    // after it and read ground on ink in both themes.
    const generic = css.indexOf('.paper .log-entry h3 {');
    const reversed = css.indexOf('.paper .classifieds .type-v2 h3');
    expect(generic).toBeGreaterThan(-1);
    expect(reversed).toBeGreaterThan(generic);
    const rule = css.slice(reversed, css.indexOf('}', reversed));
    expect(rule).toContain('background: var(--p-ink)');
    expect(rule).toContain('color: var(--p-ground)');
  });

  it('always paints the lead reversed, whatever its id', () => {
    // The lead is the newest launch (or the newest news): ink ground,
    // paper-coloured type, never the entry-id hash. A new launch keeps the
    // look, and the rotation starts after it — so the second notice never
    // repeats the reversed voice.
    const leadOf = (html: string): string | null =>
      html.match(/<article class="log-entry display-notice lead-story (type-v\d)/)?.[1] ?? null;
    expect(leadOf(labPageHtml(mixed, 'en'))).toBe('type-v2');
    expect(leadOf(labPageHtml(mixed, 'es'))).toBe('type-v2');
    const facet = entry({
      id: 'facetmedia-launch',
      type: 'launch',
      topic: 'facetmedia',
      title: 'FacetMedia launches',
      date: new Date(Date.UTC(2026, 9, 7)).toISOString(),
    });
    const unknown = entry({
      id: 'some-unknown-id-xyz',
      type: 'launch',
      topic: 'general',
      title: 'Unknown launches',
      date: new Date(Date.UTC(2026, 9, 6)).toISOString(),
    });
    expect(leadOf(labPageHtml([facet, ...mixed.slice(1)], 'en'))).toBe('type-v2');
    expect(leadOf(labPageHtml([unknown], 'en'))).toBe('type-v2');
    const variants = [...labPageHtml(mixed, 'en').matchAll(/<article class="[^"]*type-v(\d)/g)].map(
      (m) => m[1],
    );
    expect(variants[0]).toBe('2');
    expect(variants[1]).not.toBe('2');
  });

  it('rotates the display voices so adjacent ads never share one', () => {
    for (const html of [labPageHtml(mixed, 'en'), labPageHtml2(mixed, 'en')]) {
      if (!html.includes('type-v')) continue;
      const variants = [...html.matchAll(/<article class="[^"]*type-v(\d)/g)].map((m) => m[1]);
      expect(variants.length).toBeGreaterThan(1);
      for (let i = 1; i < variants.length; i += 1) {
        expect(variants[i]).not.toBe(variants[i - 1]);
      }
    }
    expect(new Set(
      [...labPageHtml(mixed, 'en').matchAll(/type-v(\d)/g)].map((m) => m[1]),
    ).size).toBeGreaterThan(1);
  });

  it('uses no entry-notice cut twice on one page', () => {
    let seen = 0;
    for (const html of [labPageHtml(mixed, 'en'), labPageHtml2(mixed, 'en')]) {
      const cuts = [...html.matchAll(/<span class="notice-cut[^"]*"><img src="([^"]+)"/g)].map((m) => m[1]);
      seen += cuts.length;
      expect(new Set(cuts).size).toBe(cuts.length);
    }
    // Both pages really set cuts: an empty page would pass trivially.
    expect(seen).toBeGreaterThan(0);
  });

  it('keeps the night sheet light with the cuts inked to suit it', () => {
    expect(css).toContain(`[data-bench-theme='night'] .paper`);
    expect(css).toContain('--p-ground: #e3e5e2');
    expect(css).not.toContain('var(--bench-c-slate)');
    expect(css).toContain('grayscale(1) sepia(.22) contrast(1.12)');
    expect(css).toContain('mix-blend-mode: multiply');
  });

  it('lazy-loads every image with its dimensions reserved', () => {
    const html = labPageHtml(mixed, 'en') + labPageHtml2(mixed, 'en');
    const imgs = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img).toContain('loading="lazy"');
    }
    for (const img of imgs.filter((i) => i.includes('/bench/classifieds/'))) {
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
    }
  });

  it('keeps page two free of any logbook link: the single link lives outside the sheet', () => {
    const page2 = src.slice(src.indexOf('<section id="lab"'), src.indexOf('<section id="lab2"'));
    expect(page2).not.toContain('folio-logbook');
    expect(page2).not.toContain('/logbook');
    expect(src).not.toContain('folio-logbook');
  });
});
