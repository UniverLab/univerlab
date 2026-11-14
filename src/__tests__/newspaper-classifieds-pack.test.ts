/**
 * The packed classifieds page (paper pages 2 and 3): varied display type
 * rotating across the ads, each engraved cut used at most once per page,
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
  it('rotates the six display voices so adjacent ads never share one', () => {
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

  it('uses no entry-ad cut twice on one page', () => {
    let seen = 0;
    for (const html of [labPageHtml(mixed, 'en'), labPageHtml2(mixed, 'en')]) {
      const cuts = [...html.matchAll(/<span class="ad-cut[^"]*"><img src="([^"]+)"/g)].map((m) => m[1]);
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
});
