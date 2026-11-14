import {
  LAB_TOPICS,
  LAB_TYPES,
  displayArt,
  finalEntryHref,
  labPageHtml,
  labPageHtml2,
  labPageMarkdown,
  logbookMarkdown,
  logbookPageHtml,
  sortEntries,
} from '../lib/lab-page';
import {
  CLASSIFIEDS_COUPON_COST,
  CLASSIFIEDS_HEAD_COST,
  CLASSIFIEDS_PAGE_BUDGET,
  CLASSIFIEDS_SIZE_COST,
  layoutClassifieds,
} from '../lib/lab-classifieds';
import { bindLabPage, bindLogbook, setLabEntries, setLogbookEntries } from '../lib/lab-page-client';
import type { Entry } from '../lib/lab-feed';

const entries: Entry[] = [
  { id: 'e1', date: '2026-10-06T01:09:26.735Z', title: 'Newest', body: 'First.\n\nSecond.', type: 'launch', topic: 'canopy', link: null, roadmap_id: 'r1' },
  { id: 'e2', date: '2026-10-05T10:00:00.000Z', title: 'Notes on TexForge', body: 'Body two.', type: 'note', topic: 'texforge', link: 'https://example.com/o' },
  { id: 'e3', date: '2026-10-04T10:00:00.000Z', title: 'Mystery topic', body: 'Body three.', type: 'deploy', topic: 'unknown-thing', link: null },
  { id: 'e4', date: '2026-10-03T10:00:00.000Z', title: 'General note', body: 'Body four.', type: 'note', topic: null, link: null },
  { id: 'e5', date: '2026-10-02T10:00:00.000Z', title: 'Bugfix', body: 'Body five.', type: 'bugfix', topic: 'canopy', link: null },
  { id: 'e6', date: '2026-10-01T10:00:00.000Z', title: 'Incident', body: 'Body six.', type: 'incident', topic: 'gitkit', link: null },
  { id: 'e7', date: '2026-09-30T10:00:00.000Z', title: 'Update', body: 'Body seven.', type: 'update', topic: 'canopy', link: null, roadmap_id: 'r1' },
  { id: 'e8', date: '2026-09-29T10:00:00.000Z', title: 'Old launch', body: 'Body eight.', type: 'launch', topic: 'ghscaff', link: null },
  { id: 'e9', date: '2026-09-28T10:00:00.000Z', title: 'Older note', body: 'Body nine.', type: 'note', topic: 'demostage', link: null },
  { id: 'e10', date: '2026-09-27T10:00:00.000Z', title: 'Tenth', body: 'Body ten.', type: 'note', topic: 'quorum', link: null },
  { id: 'e11', date: '2026-09-26T10:00:00.000Z', title: 'Eleventh', body: 'Body eleven.', type: 'note', topic: 'canopy', link: null },
  { id: 'e12', date: '2026-09-25T10:00:00.000Z', title: 'Twelfth', body: 'Body twelve.', type: 'launch', topic: 'astro-denoise', link: null },
];

describe('lab page (newspaper pages 2 and 3)', () => {
  it('sorts newest first', () => {
    const sorted = sortEntries([...entries].reverse());
    expect(sorted.map((e) => e.id)).toEqual([
      'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10', 'e11', 'e12',
    ]);
  });

  it('composes one classifieds page from twelve entries: releases on top', () => {
    const html = labPageHtml(entries, 'en');
    const titles = [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((m) => m[1]);
    // Ranked by type then recency: the four launches, the incident, the
    // bugfix and update, then the notes newest first.
    expect(titles).toEqual([
      'Newest', 'Mystery topic', 'Old launch', 'Twelfth', 'Incident', 'Bugfix',
      'Update', 'Notes on TexForge', 'General note', 'Older note', 'Tenth', 'Eleventh',
    ]);
    expect(html).toContain('id="lab-log"');
    expect(html).not.toContain('id="lab-log2"');
    expect(labPageHtml2(entries, 'en')).toBe('');
  });

  it('has no older control and never folds', () => {
    const html = labPageHtml(entries, 'en');
    expect(html).not.toContain('lab-older');
    expect(html).not.toContain('data-shown');
    expect(html).not.toContain('is-folded');
  });

  it('sizes the display line by rank and closes full ads with the meta line', () => {
    const html = labPageHtml(entries, 'en');
    // Only the top-ranked release reads largest; the rest read boxed.
    expect(html).toContain('<h3 class="sz-lg">Newest</h3>');
    expect(html).not.toContain('<h3 class="sz-lg">Mystery topic</h3>');
    expect(html).toContain('<h3 class="sz-md">Mystery topic</h3>');
    expect(html).toContain('<h3 class="sz-md">Incident</h3>');
    expect(html).toContain('<h3 class="sz-md">Notes on TexForge</h3>');
    expect(html).toContain('<h3 class="sz-md">General note</h3>');
    const metas = html.match(/<p class="entry-meta">.*?<\/p>/g) ?? [];
    // Display and boxed ads carry the meta line; small ads and notices do not.
    expect(metas).toHaveLength(12);
    expect(metas[0]).toContain('type-badge');
    expect(metas[0]).toContain('<time datetime="2026-10-06T01:09:26.735Z" data-mission="">');
  });

  it('cuts small ads short, ending in the link', () => {
    // Two launches then twelve notes: rank 12 lands in a small slot.
    const rows: Entry[] = [
      { id: 'l1', date: '2026-10-06T10:00:00.000Z', title: 'L1', body: 'B.', type: 'launch', topic: 'canopy', link: null },
      { id: 'l2', date: '2026-10-05T10:00:00.000Z', title: 'L2', body: 'B.', type: 'launch', topic: 'canopy', link: null },
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `s${i}`,
        date: new Date(Date.UTC(2026, 9, 4) - i * 86400000).toISOString(),
        title: i === 10 ? 'Cut note' : `Note ${i}`,
        body: i === 10 ? 'First.\n\nSecond.' : 'Body.',
        type: 'note',
        topic: 'texforge',
        link: i === 10 ? 'https://example.com/o' : null,
      }) as Entry),
    ];
    const html = labPageHtml(rows, 'en');
    expect(html).toContain('<h3 class="sz-sm">Cut note</h3>');
    expect(html).toContain('<p>First. <a class="log-link"');
    expect(html).not.toContain('Second.');
  });

  it('runs overflow entries as one-line notices of title and link only', () => {
    // Twenty notes fit the two pages by space: no entry reads as a line.
    const rows: Entry[] = Array.from({ length: 20 }, (_, i) => {
      const day = String(28 - i).padStart(2, '0');
      return {
        id: `n${i}`, date: `2026-09-${day}T10:00:00.000Z`, title: `Notice ${i}`,
        body: 'Body.', type: 'note', topic: 'canopy', link: i % 2 ? 'https://example.com/o' : null,
      } as Entry;
    });
    expect(labPageHtml(rows, 'en')).not.toContain('notice-run');
    expect(labPageHtml2(rows, 'en')).not.toContain('notice-run');
    // The live mix overflows by space: the tail steps down to lines grouped
    // in a run on page 3 only.
    const kinds: Array<Entry['type']> = [
      ...Array<Entry['type']>(14).fill('launch'),
      ...Array<Entry['type']>(13).fill('note'),
      ...Array<Entry['type']>(5).fill('update'),
      'incident',
    ];
    const live: Entry[] = kinds.map((type, i) => ({
      id: `m${i}`,
      date: new Date(Date.UTC(2026, 9, 6) - i * 86400000).toISOString(),
      title: `Live ${i}`,
      body: 'Body.',
      type,
      topic: 'canopy',
      link: null,
    }) as Entry);
    expect(labPageHtml(live, 'en')).not.toContain('notice-run');
    const html2 = labPageHtml2(live, 'en');
    expect(html2).toContain('id="lab-log2"');
    expect(html2).toContain('notice-run');
    expect(html2).toContain('<p class="notice-line">');
    // Exactly one entry overflows into a line on page 3: the rest are boxed.
    expect(html2.match(/<article class="log-entry notice"/g)).toHaveLength(1);
  });

  it('counts every entry on the All filters and per topic/type', () => {
    const html = labPageHtml(entries, 'en');
    // All counts every entry, twice (topic row + type row).
    expect(html.match(/data-topic="all" aria-pressed="true">All<span class="lab-filter-count">12<\/span>/)).not.toBeNull();
    // canopy ×4 (e1, e5, e7, e11); unknown + null topics fold into general.
    expect(html).toContain('data-topic="canopy" aria-pressed="false">Canopy<span class="lab-filter-count">4</span>');
    expect(html).toContain('>General<span class="lab-filter-count">2</span>');
    // launch ×3 (e1, e8, e12; e3 is a deploy), note ×5.
    expect(html).toContain('data-type="launch" aria-pressed="false">launch<span class="lab-filter-count">3</span>');
    expect(html).toContain('data-type="note" aria-pressed="false">note<span class="lab-filter-count">5</span>');
  });

  it('carries the filter axes on every ad for the client', () => {
    const html = labPageHtml(entries, 'en') + labPageHtml2(entries, 'en');
    expect(html).toContain('data-topic="canopy" data-type="launch" data-roadmap="r1"');
    expect(html).toContain('data-topic="general" data-type="deploy" data-roadmap=""');
  });

  it('renders the heading and the filters in Spanish', () => {
    const html = labPageHtml(entries, 'es');
    expect(html).toContain('<h2 class="lab-heading">Noticias del laboratorio</h2>');
    expect(html).toContain('>Todas<span class="lab-filter-count">12</span>');
    expect(html).toContain('>lanzamiento<span class="lab-filter-count">3</span>');
  });

  it('exposes the registry topics and the logbook types', () => {
    expect(LAB_TOPICS[0]).toEqual({ id: 'general', label: 'General' });
    expect(LAB_TOPICS.map((t) => t.id)).toContain('canopy');
    expect(LAB_TYPES).toEqual(['launch', 'deploy', 'bugfix', 'note', 'incident']);
  });

  it('says the lab mail did not arrive instead of empty filter rows', () => {
    const html = labPageHtml([], 'en', { unavailable: true });
    expect(html).toContain('<h2 class="lab-heading">Lab news</h2>');
    expect(html).toContain('<p class="lab-empty">The lab mail did not arrive — try again later.</p>');
    expect(html).not.toContain('lab-filter');
    expect(html).not.toContain('lab-log');
    expect(html).not.toContain('lab-older');
    expect(html).not.toContain('coupon');
  });

  it('says the same in Spanish', () => {
    const html = labPageHtml([], 'es', { unavailable: true });
    expect(html).toContain('<h2 class="lab-heading">Noticias del laboratorio</h2>');
    expect(html).toContain('<p class="lab-empty">No llegó el correo del laboratorio; inténtelo más tarde.</p>');
    expect(html).not.toContain('lab-filter');
  });

  it('keeps the filter rows when the feed simply has no entries', () => {
    const html = labPageHtml([], 'en');
    expect(html).toContain('lab-filter');
    expect(html).not.toContain('lab-empty');
  });

  it('escapes entry text', () => {
    const html = labPageHtml(
      [{ id: 'x', date: '2026-10-06T01:09:26.735Z', title: '<b>Hi</b>', body: 'a&b', type: 'note', topic: 'canopy', link: null }],
      'en',
    );
    expect(html).not.toContain('<b>Hi</b>');
    expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;');
    expect(html).toContain('a&amp;b');
  });

  it('mixes the four coupons among the ads at boxed and small sizes, never in a band', () => {
    const html = labPageHtml(entries, 'en');
    expect(html).not.toContain('coupon-band');
    expect(html).not.toContain('coupon-grid');
    expect(html.match(/class="coupon"/g)).toHaveLength(4);
    const log = html.slice(html.indexOf('id="lab-log"'));
    // The first half rides after the third slot; all four keep the cut border.
    const firstCard = log.indexOf('class="coupon"');
    const thirdSlot = log.indexOf('</article>', log.indexOf('</article>', log.indexOf('</article>') + 1) + 1);
    expect(firstCard).toBeGreaterThan(thirdSlot);
    expect((log.match(/class="coupon-cut"/g) || [])).toHaveLength(4);
    // Every coupon keeps its figure, condition, link and dashed border.
    expect(html).toContain('<span class="coupon-figure">Free</span>');
    expect(html).toContain('<span class="coupon-figure">50 %</span>');
    expect(html).toContain('✂ cut here');
  });

  it('reads every coupon figure from the Workbench copy, never invented', () => {
    const html = labPageHtml(entries, 'en');
    expect(html).toContain('<span class="coupon-figure">Free</span>');
    expect(html).toContain('<span class="coupon-figure">50 %</span>');
    expect(html).toContain('<span class="coupon-figure">20 %</span>');
    expect(html).toContain('<span class="coupon-figure">30 %</span>');
    expect(html).toContain('The first 5 audits: 50 % of the price');
    expect(html).toContain('costs 30 % less');
  });

  it('links the call to the Workbench and the audits to the audits page', () => {
    const html = labPageHtml(entries, 'en');
    expect(html).toContain('href="/workbench/#first-call"');
    expect(html.match(/href="\/workbench\/audits\/"/g)).toHaveLength(3);
    const esHtml = labPageHtml(entries, 'es');
    expect(esHtml).toContain('href="/es/workbench/#primera-llamada"');
    expect(esHtml.match(/href="\/es\/workbench\/audits\/"/g)).toHaveLength(3);
    expect(esHtml).toContain('<span class="coupon-figure">Gratis</span>');
    expect(esHtml).toContain('✂ recorta aquí');
  });

  it('prints the no-stack rule once under the coupons', () => {
    const html = labPageHtml(entries, 'en');
    expect(html.match(/largest one applies/g)).toHaveLength(1);
    expect(labPageHtml(entries, 'es')).toContain('aplica el mayor');
  });

  it('sets display art from the lab assets: machine plates for experiments, a postcard crop otherwise', () => {
    expect(displayArt('canopy')).toBe('/bench/machines/canopy-day-900.webp');
    expect(displayArt('general')).toBe('/bench/postcards/status-day-800.webp');
    expect(displayArt('unknown-thing')).toBe('/bench/postcards/status-day-800.webp');
    const html = labPageHtml(entries, 'en');
    // The newest release belongs to canopy: its display ad carries the plate.
    expect(html).toContain('<figure class="photo ad-art"><div class="print"><img src="/bench/machines/canopy-day-900.webp"');
    expect(html).toContain('loading="lazy"');
  });

  it('caps the section at two pages and points the overflow at the Logbook', () => {
    // The live mix: 14 launch, 13 note, 5 update, 1 incident.
    const kinds: Array<Entry['type']> = [
      ...Array<Entry['type']>(14).fill('launch'),
      ...Array<Entry['type']>(13).fill('note'),
      ...Array<Entry['type']>(5).fill('update'),
      'incident',
    ];
    const live: Entry[] = kinds.map((type, i) => ({
      id: `l${i}`,
      date: new Date(Date.UTC(2026, 9, 6) - i * 86400000).toISOString(),
      title: `Live ${i}`,
      body: 'Body.',
      type,
      topic: 'canopy',
      link: null,
    }) as Entry);
    const { pages, truncated } = layoutClassifieds(live, 4);
    expect(pages).toHaveLength(2);
    // Space decides the fit: each page holds ads plus its half of the
    // coupons within the budget, and the tail is left out.
    expect(truncated).toBe(true);
    const reserved = [2 * CLASSIFIEDS_COUPON_COST, 2 * CLASSIFIEDS_COUPON_COST];
    pages.forEach((page, p) => {
      const used = page.reduce((sum, s) => sum + CLASSIFIEDS_SIZE_COST[s.size], 0);
      expect(used + reserved[p] + CLASSIFIEDS_HEAD_COST).toBeLessThanOrEqual(CLASSIFIEDS_PAGE_BUDGET);
    });
    const html2 = labPageHtml2(live, 'en');
    expect(html2).toContain('id="lab-log2"');
    expect(html2).toContain('Lab news · continued');
    expect(html2).toContain('<p class="lab-more"><a href="/logbook/"><img src="/bench/classifieds/manicule.webp"');
    expect(html2).toContain('The complete record continues in the Logbook →</a></p>');
    const es2 = labPageHtml2(live, 'es');
    expect(es2).toContain('<p class="lab-more"><a href="/es/logbook/"><img src="/bench/classifieds/manicule.webp"');
    expect(es2).toContain('El registro completo continúa en el Cuaderno →</a></p>');
  });

  it('opens each classifieds page with the engraved section head, words in type', () => {
    const kinds: Array<Entry['type']> = [
      ...Array<Entry['type']>(14).fill('launch'),
      ...Array<Entry['type']>(13).fill('note'),
      ...Array<Entry['type']>(5).fill('update'),
      'incident',
    ];
    const live: Entry[] = kinds.map((type, i) => ({
      id: `h${i}`,
      date: new Date(Date.UTC(2026, 9, 6) - i * 86400000).toISOString(),
      title: `Live ${i}`,
      body: 'Body.',
      type,
      topic: 'canopy',
      link: null,
    }) as Entry);
    const html1 = labPageHtml(live, 'en');
    expect(html1).toContain('<header class="lab-head"><img src="/bench/classifieds/head.webp" alt="" width="1200" height="451"');
    expect(html1).toContain('<h2 class="lab-heading">Lab news</h2>');
    const html2 = labPageHtml2(live, 'en');
    expect(html2).toContain('<header class="lab-head"><img src="/bench/classifieds/head.webp" alt="" width="1200" height="451"');
    expect(html2).toContain('<h2 class="lab-heading lab-heading--cont">Lab news · continued</h2>');
    // The words are set in type, never inside the image.
    expect(html1).not.toMatch(/<img[^>]*Lab news/);
  });

  it('maps one engraved cut per entry type', () => {
    const rows: Entry[] = [
      { id: 'l1', date: '2026-10-06T10:00:00.000Z', title: 'Launch', body: 'B.', type: 'launch', topic: 'canopy', link: null },
      { id: 'd1', date: '2026-10-05T10:00:00.000Z', title: 'Deploy', body: 'B.', type: 'deploy', topic: 'canopy', link: null },
      { id: 'u1', date: '2026-10-04T10:00:00.000Z', title: 'Update', body: 'B.', type: 'update', topic: 'canopy', link: null },
      { id: 'b1', date: '2026-10-03T10:00:00.000Z', title: 'Bugfix', body: 'B.', type: 'bugfix', topic: 'canopy', link: null },
      { id: 'i1', date: '2026-10-02T10:00:00.000Z', title: 'Incident', body: 'B.', type: 'incident', topic: 'canopy', link: null },
      { id: 'n1', date: '2026-10-01T10:00:00.000Z', title: 'Note', body: 'B.', type: 'note', topic: 'canopy', link: null },
      { id: 'x1', date: '2026-09-30T10:00:00.000Z', title: 'Odd', body: 'B.', type: 'mystery', topic: 'canopy', link: null },
    ];
    const html = labPageHtml(rows, 'en');
    // One cut per known type: launch and deploy share the launch cut, update
    // and bugfix share the update cut.
    expect(html).toContain('<span class="ad-cut"><img src="/bench/classifieds/launch.webp"');
    expect(html).toContain('<span class="ad-cut"><img src="/bench/classifieds/update.webp"');
    expect(html).toContain('<span class="ad-cut"><img src="/bench/classifieds/incident.webp"');
    expect(html).toContain('<span class="ad-cut"><img src="/bench/classifieds/note.webp"');
    expect(html.match(/<span class="ad-cut"><img src="\/bench\/classifieds\/launch.webp"/g)).toHaveLength(2);
    expect(html.match(/<span class="ad-cut"><img src="\/bench\/classifieds\/update.webp"/g)).toHaveLength(2);
    // The cuts open the entry body, never the h3: every h3 still reads bare.
    expect(html).toContain('<div class="entry-body"><span class="ad-cut">');
    expect(html).not.toMatch(/<h3[^>]*>[^<]*ad-cut/);
    // The cuts are decorative and sized.
    expect(html).toContain('alt=""');
    // The unknown type goes without one.
    const oddStart = html.lastIndexOf('<article', html.indexOf('>Odd</h3>'));
    const oddArticle = html.slice(oddStart, html.indexOf('</article>', oddStart));
    expect(oddArticle).not.toContain('ad-cut');
  });

  it('sets the cut on small ads and never on one-line notices', () => {
    // Thirty notes by space: one highest entry takes display, the page-1 tail
    // steps down to a small ad, and the last overflows to a one-line notice.
    // The fixture must reach both sizes or this test says nothing about them.
    const rows: Entry[] = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      date: new Date(Date.UTC(2026, 9, 6) - i * 86400000).toISOString(),
      title: `Small ${i}`,
      body: 'Body.',
      type: 'note',
      topic: 'canopy',
      link: null,
    }) as Entry);
    const html = labPageHtml(rows, 'en') + labPageHtml2(rows, 'en');
    const articles = (cls: string): string[] =>
      html.match(new RegExp(`<article class="log-entry ${cls}"[\\s\\S]*?</article>`, 'g')) ?? [];
    const small = articles('ad-small');
    const line = articles('notice');
    // Both sizes really occur, so the assertions below have teeth.
    expect(small).toHaveLength(1);
    expect(line).toHaveLength(1);
    // A small ad shows its type's cut; a line notice never carries one.
    expect(small[0]).toContain('<span class="ad-cut"><img src="/bench/classifieds/note.webp"');
    expect(small[0]).toContain('<div class="entry-body"><span class="ad-cut">');
    expect(line[0]).toContain('<p class="notice-line">');
    expect(line[0]).not.toContain('ad-cut');
  });

  it('divides the one-line runs with a fleuron, and only where a run is', () => {
    // Twenty notes fit the two pages by space: no run, no fleuron.
    const rows: Entry[] = Array.from({ length: 20 }, (_, i) => {
      const day = String(28 - i).padStart(2, '0');
      return {
        id: `f${i}`, date: `2026-09-${day}T10:00:00.000Z`, title: `Notice ${i}`,
        body: 'Body.', type: 'note', topic: 'canopy', link: null,
      } as Entry;
    });
    expect(labPageHtml2(rows, 'en')).not.toContain('notice-fleuron');
    // The live mix overflows into one run on page 3: exactly one fleuron.
    const kinds: Array<Entry['type']> = [
      ...Array<Entry['type']>(14).fill('launch'),
      ...Array<Entry['type']>(13).fill('note'),
      ...Array<Entry['type']>(5).fill('update'),
      'incident',
    ];
    const live: Entry[] = kinds.map((type, i) => ({
      id: `g${i}`,
      date: new Date(Date.UTC(2026, 9, 6) - i * 86400000).toISOString(),
      title: `Live ${i}`,
      body: 'Body.',
      type,
      topic: 'canopy',
      link: null,
    }) as Entry);
    const html2 = labPageHtml2(live, 'en');
    expect(html2.match(/<div class="notice-fleuron"><img src="\/bench\/classifieds\/fleuron.webp" alt="" width="480" height="134"/g)).toHaveLength(1);
    // The fleuron stands before the run, never inside it.
    expect(html2.indexOf('notice-fleuron')).toBeLessThan(html2.indexOf('notice-run'));
  });

  it('marks the coupons and the logbook line with the pointing hand', () => {
    const html = labPageHtml(entries, 'en');
    // Four coupons, one hand each, inside the link span before the text.
    expect(html.match(/<span class="coupon-link"><img src="\/bench\/classifieds\/manicule.webp" alt="" width="192" height="113"/g)).toHaveLength(4);
    expect(html).toContain('class="coupon"');
  });

  it('the markdown twin carries the unavailable line under the coupons', () => {
    const enMd = labPageMarkdown([], 'en', { unavailable: true });
    expect(enMd.split('\n')[0]).toBe('## Lab news');
    expect(enMd).toContain('The lab mail did not arrive — try again later.');
    expect(enMd).toContain('*✂ Free — ');
    const esMd = labPageMarkdown([], 'es', { unavailable: true });
    expect(esMd.split('\n')[0]).toBe('## Noticias del laboratorio');
    expect(esMd).toContain('No llegó el correo del laboratorio; inténtelo más tarde.');
    expect(esMd).toContain('*✂ Gratis — ');
  });

  it('twins page 2 as markdown under its heading', () => {
    const md = labPageMarkdown(entries, 'en');
    const lines = md.split('\n');
    expect(lines[0]).toBe('## Lab news');
    expect(md).toContain('**Newest**');
    expect(md).toContain('**Twelfth**');
    // Newest first, like the page.
    expect(md.indexOf('**Newest**')).toBeLessThan(md.indexOf('**Twelfth**'));
    expect(labPageMarkdown(entries, 'es').split('\n')[0]).toBe('## Noticias del laboratorio');
  });

  it('twins the coupons as plain markdown lines with links', () => {
    const md = labPageMarkdown(entries, 'en');
    expect(md).toContain('*✂ Free — ');
    expect(md).toContain('[Open the Workbench](https://univerlab.org/workbench/#first-call)');
    expect(md.match(/\(https:\/\/univerlab\.org\/workbench\/audits\/\)/g)).toHaveLength(3);
    expect(md).toContain('Discounts do not stack');
    expect(md.indexOf('*✂')).toBeLessThan(md.indexOf('**Newest**'));
    const esMd = labPageMarkdown(entries, 'es');
    expect(esMd).toContain('[Abrir el Banco de trabajo](https://univerlab.org/es/workbench/#primera-llamada)');
    expect(esMd).toContain('no se acumulan');
  });
});

describe('finalEntryHref', () => {
  it('leaves foreign hosts, files and the root alone', () => {
    expect(finalEntryHref('https://example.com/o')).toBe('https://example.com/o');
    expect(finalEntryHref('https://announcements.univerlab.org/feed.atom')).toBe(
      'https://announcements.univerlab.org/feed.atom',
    );
    expect(finalEntryHref('https://univerlab.org')).toBe('https://univerlab.org');
    expect(finalEntryHref('')).toBe('');
  });

  it('gives same-site page links their trailing slash, keeping queries and fragments', () => {
    expect(finalEntryHref('https://univerlab.org/archive#exp-005')).toBe(
      'https://univerlab.org/archive/#exp-005',
    );
    expect(finalEntryHref('/workbench')).toBe('/workbench/');
    expect(finalEntryHref('/roadmap/?lane=now')).toBe('/roadmap/?lane=now');
  });

  it('resolves the retired status address to its redirect target', () => {
    expect(finalEntryHref('https://univerlab.org/status')).toBe('https://univerlab.org/newspaper/#lab');
  });

  it('advertises the final URL on the entry link', () => {
    const stale: Entry[] = [
      {
        id: 's1', date: '2026-10-06T01:09:26.735Z', title: 'Status', body: 'B.',
        type: 'launch', topic: 'canopy', link: 'https://univerlab.org/status',
      },
      {
        id: 's2', date: '2026-10-05T10:00:00.000Z', title: 'Archived', body: 'B.',
        type: 'note', topic: 'canopy', link: 'https://univerlab.org/archive#exp-005',
      },
    ];
    const html = logbookPageHtml(stale, 'en');
    expect(html).toContain('href="https://univerlab.org/newspaper/#lab"');
    expect(html).toContain('href="https://univerlab.org/archive/#exp-005"');
    expect(html).not.toContain('href="https://univerlab.org/status"');
    expect(html).not.toContain('href="https://univerlab.org/archive#exp-005"');
  });
});

describe('logbook page', () => {
  it('prints the complete record newest first, every entry in full', () => {
    const html = logbookPageHtml(entries, 'en');
    const titles = [...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((m) => m[1]);
    expect(titles).toEqual([
      'Newest', 'Notes on TexForge', 'Mystery topic', 'General note', 'Bugfix',
      'Incident', 'Update', 'Old launch', 'Older note', 'Tenth', 'Eleventh', 'Twelfth',
    ]);
    expect(html).toContain('<h2 class="lab-heading">Logbook</h2>');
    expect(html).toContain('id="logbook-list"');
    // Full: every entry closes with the meta line, bodies uncut.
    expect(html.match(/<p class="entry-meta">.*?<\/p>/g)).toHaveLength(12);
    expect(html).toContain('First.');
    expect(logbookPageHtml(entries, 'es')).toContain('<h2 class="lab-heading">Cuaderno de bitácora</h2>');
  });

  it('carries the same topic and type filters as the classifieds', () => {
    const html = logbookPageHtml(entries, 'en');
    expect(html).toContain('lab-filter-row" data-kind="topic"');
    expect(html).toContain('lab-filter-row" data-kind="type"');
    expect(html.match(/data-topic="all" aria-pressed="true">All<span class="lab-filter-count">12<\/span>/)).not.toBeNull();
  });

  it('says the Logbook did not arrive instead of empty filter rows', () => {
    const html = logbookPageHtml([], 'en', { unavailable: true });
    expect(html).toContain('<h2 class="lab-heading">Logbook</h2>');
    expect(html).toContain('<p class="lab-empty">The Logbook did not arrive — try again later.</p>');
    expect(html).not.toContain('lab-filter');
    expect(html).not.toContain('logbook-list');
  });

  it('says the same in Spanish and names the empty shelf', () => {
    expect(logbookPageHtml([], 'es', { unavailable: true })).toContain('El Cuaderno no llegó; inténtelo más tarde.');
    expect(logbookPageHtml([], 'en')).toContain('No announcements yet — the lab is quiet.');
    expect(logbookPageHtml([], 'es')).toContain('Aún no hay anuncios — el laboratorio está en silencio.');
  });

  it('twins the Logbook under its own heading', () => {
    const md = logbookMarkdown(entries, 'en');
    expect(md.split('\n')[0]).toBe('## Logbook');
    expect(md.indexOf('**Newest**')).toBeLessThan(md.indexOf('**Twelfth**'));
  });
});

describe('bindLabPage', () => {
  const scaffold = (lang: 'en' | 'es', rows: Entry[]): void => {
    document.body.innerHTML =
      `<div class="paper">` +
      `<nav class="paper-tabs">` +
      `<a class="paper-tab is-active" data-page="page-1" href="#page-1">Page 1</a>` +
      `<a class="paper-tab" data-page="lab" href="#lab">Page 2</a>` +
      `<a class="paper-tab" data-page="lab2" href="#lab2">Page 3</a>` +
      `</nav>` +
      `<section id="page-1" class="paper-page"><div id="edition">edition</div></section>` +
      `<section id="lab" class="paper-page"><div id="lab-body">${labPageHtml(rows, lang)}</div></section>` +
      `<section id="lab2" class="paper-page"><div id="lab2-body">${labPageHtml2(rows, lang)}</div></section>` +
      `</div>`;
  };

  beforeEach(() => {
    window.location.hash = '';
    history.replaceState({}, '', '/newspaper/');
    // The client fetches once when the edge filled the pages; stay offline
    // by default so filter clicks never leave the test runner.
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockRejectedValue(new Error('offline'));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('opens page 2 directly on #lab and page 3 on #lab2', () => {
    scaffold('en', entries);
    window.location.hash = '#lab';
    bindLabPage(document);
    expect((document.getElementById('lab') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('page-1') as HTMLElement).hidden).toBe(true);
    const tabs = Array.from(document.querySelectorAll('.paper-tab'));
    expect(tabs).toHaveLength(3);
    expect(tabs[1].classList.contains('is-active')).toBe(true);
    expect(tabs[0].classList.contains('is-active')).toBe(false);
    window.location.hash = '#lab2';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect((document.getElementById('lab2') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('lab') as HTMLElement).hidden).toBe(true);
    expect(tabs[2].classList.contains('is-active')).toBe(true);
  });

  it('keeps page 1 without a hash', () => {
    scaffold('en', entries);
    bindLabPage(document);
    expect((document.getElementById('page-1') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('lab') as HTMLElement).hidden).toBe(true);
  });

  it('turns pages from the bar without a jump: pushState, synced tabs, brief turn', () => {
    jest.useFakeTimers();
    try {
      document.body.innerHTML =
        `<div class="paper">` +
        `<nav class="paper-tabs">` +
        `<a class="paper-tab is-active" data-page="page-1" href="#page-1">Page 1</a>` +
        `<a class="paper-tab" data-page="lab" href="#lab">Page 2</a>` +
        `<a class="paper-tab" data-page="lab2" href="#lab2">Page 3</a>` +
        `</nav>` +
        `<section id="page-1" class="paper-page"><div id="edition">edition</div></section>` +
        `<section id="lab" class="paper-page"><div id="lab-body">${labPageHtml(entries, 'en')}</div></section>` +
        `<section id="lab2" class="paper-page"><div id="lab2-body">${labPageHtml2(entries, 'en')}</div></section>` +
        `</div>` +
        `<div class="paper-bar" data-paper-bar>` +
        `<nav class="paper-bar-tabs">` +
        `<a class="paper-tab is-active" data-page="page-1" href="#page-1">Page 1</a>` +
        `<a class="paper-tab" data-page="lab" href="#lab">Page 2</a>` +
        `<a class="paper-tab" data-page="lab2" href="#lab2">Page 3</a>` +
        `</nav></div>`;
      bindLabPage(document);
      // The anchor's own jump never runs: the URL updates by history instead.
      const push = jest.spyOn(window.history, 'pushState').mockImplementation(() => {});
      const barLab = document.querySelector('.paper-bar .paper-tab[data-page="lab"]') as HTMLAnchorElement;
      barLab.click();
      expect(push).toHaveBeenCalledWith({}, '', '#lab');
      expect((document.getElementById('lab') as HTMLElement).hidden).toBe(false);
      expect((document.getElementById('page-1') as HTMLElement).hidden).toBe(true);
      // Masthead and bar agree: six tabs, the two lab ones active.
      const tabs = Array.from(document.querySelectorAll('.paper-tab'));
      expect(tabs).toHaveLength(6);
      const active = tabs.filter((t) => (t as HTMLElement).classList.contains('is-active'));
      expect(active).toHaveLength(2);
      expect(active.every((t) => (t as HTMLElement).getAttribute('data-page') === 'lab')).toBe(true);
      // Forward travel turns next; the class clears after the ~300 ms turn.
      expect((document.getElementById('lab') as HTMLElement).classList.contains('turn-next')).toBe(true);
      jest.advanceTimersByTime(400);
      expect((document.getElementById('lab') as HTMLElement).classList.contains('turn-next')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('recomposes both pages from the filters once entries arrive', () => {
    scaffold('en', entries);
    bindLabPage(document);
    setLabEntries(document, { entries, lang: 'en' });
    const canopy = document.querySelector('#lab button[data-topic="canopy"]') as HTMLButtonElement;
    canopy.click();
    // A filter searches the whole record: four canopy entries recompose page 1.
    expect(document.querySelectorAll('#lab-log .log-entry')).toHaveLength(4);
    expect(document.querySelector('#lab2')).not.toBeNull();
    expect((document.getElementById('lab2') as HTMLElement).hidden).toBe(true);
    // aria-pressed follows the filter.
    expect(canopy.getAttribute('aria-pressed')).toBe('true');
  });

  it('honours ?roadmap= and ?topic= on page 2', () => {
    scaffold('en', entries);
    history.replaceState({}, '', '/newspaper/?roadmap=r1');
    bindLabPage(document);
    setLabEntries(document, { entries, lang: 'en' });
    expect((document.getElementById('lab') as HTMLElement).hidden).toBe(false);
    const titles = Array.from(document.querySelectorAll('#lab-log .log-entry h3')).map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(['Newest', 'Update']);
  });

  it('recomposes the edge-filled pages from one fetched read', async () => {
    // No setLabEntries on a fresh root: the edge filled the pages, so the
    // first click only refreshes the pressed state — then the fetched
    // entries arrive and the pages recompose from the matching entries.
    (globalThis as { fetch?: unknown }).fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ entries }) } as Response);
    const fresh = document.implementation.createHTMLDocument();
    fresh.body.innerHTML =
      `<div class="paper">` +
      `<nav class="paper-tabs">` +
      `<a class="paper-tab is-active" data-page="page-1" href="#page-1">Page 1</a>` +
      `<a class="paper-tab" data-page="lab" href="#lab">Page 2</a>` +
      `<a class="paper-tab" data-page="lab2" href="#lab2">Page 3</a>` +
      `</nav>` +
      `<section id="page-1" class="paper-page"><div id="edition">edition</div></section>` +
      `<section id="lab" class="paper-page"><div id="lab-body">${labPageHtml(entries, 'en')}</div></section>` +
      `<section id="lab2" class="paper-page"><div id="lab2-body">${labPageHtml2(entries, 'en')}</div></section>` +
      `</div>`;
    bindLabPage(fresh);
    const canopy = fresh.querySelector('#lab button[data-topic="canopy"]') as HTMLButtonElement;
    canopy.click();
    await new Promise((r) => setTimeout(r, 0));
    // A filter searches the whole record: four canopy entries recompose page 1.
    expect(fresh.querySelectorAll('#lab-log .log-entry')).toHaveLength(4);
    expect((fresh.getElementById('lab2') as HTMLElement).hidden).toBe(true);
    // The filter rows still describe the whole record: All counts every entry.
    expect(
      fresh.querySelector('#lab [data-topic="all"]')?.textContent,
    ).toContain('12');
    expect(canopy.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the edge-filled pages when the fetched read fails', async () => {
    // No setLabEntries on a fresh root: the edge filled the pages, but the
    // API is down — the failed read must not wipe the edge content with an
    // empty recompose.
    (globalThis as { fetch?: unknown }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline'));
    const fresh = document.implementation.createHTMLDocument();
    fresh.body.innerHTML =
      `<div class="paper">` +
      `<nav class="paper-tabs">` +
      `<a class="paper-tab is-active" data-page="page-1" href="#page-1">Page 1</a>` +
      `<a class="paper-tab" data-page="lab" href="#lab">Page 2</a>` +
      `<a class="paper-tab" data-page="lab2" href="#lab2">Page 3</a>` +
      `</nav>` +
      `<section id="page-1" class="paper-page"><div id="edition">edition</div></section>` +
      `<section id="lab" class="paper-page"><div id="lab-body">${labPageHtml(entries, 'en')}</div></section>` +
      `<section id="lab2" class="paper-page"><div id="lab2-body">${labPageHtml2(entries, 'en')}</div></section>` +
      `</div>`;
    bindLabPage(fresh);
    const before = fresh.querySelectorAll('#lab-log .log-entry').length;
    expect(before).toBeGreaterThan(0);
    const canopy = fresh.querySelector('#lab button[data-topic="canopy"]') as HTMLButtonElement;
    canopy.click();
    await new Promise((r) => setTimeout(r, 0));
    // The edge grid survives; only the pressed state follows the filter.
    expect(fresh.querySelectorAll('#lab-log .log-entry')).toHaveLength(before);
    expect(canopy.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('bindLogbook', () => {
  // A fresh host per test: filter state is keyed by the bound root, so
  // binding the shared document would leak ?roadmap=/clicks between tests.
  const scaffold = (lang: 'en' | 'es', rows: Entry[]): HTMLDivElement => {
    const host = document.createElement('div');
    host.innerHTML =
      `<div class="paper" id="logbook"><div id="logbook-body">${logbookPageHtml(rows, lang)}</div></div>`;
    document.body.appendChild(host);
    return host;
  };

  beforeEach(() => {
    history.replaceState({}, '', '/logbook/');
    // The client fetches once when the edge filled the page; stay offline
    // by default so filter clicks never leave the test runner.
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockRejectedValue(new Error('offline'));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it('arms the hide rule and filters the edge-rendered entries in place', () => {
    const host = scaffold('en', entries);
    bindLogbook(host);
    // The hide rule is `.paper.js .log-entry.is-hidden`: without the class
    // the filter would run but every entry would stay visible.
    expect(host.querySelector('#logbook')?.classList.contains('js')).toBe(true);
    const canopy = host.querySelector('#logbook button[data-topic="canopy"]') as HTMLButtonElement;
    canopy.click();
    const visible = Array.from(host.querySelectorAll('#logbook-list .log-entry')).filter(
      (el) => !(el as HTMLElement).classList.contains('is-hidden'),
    );
    // Four canopy entries: Newest, Bugfix, Update, Eleventh.
    expect(visible).toHaveLength(4);
    expect(canopy.getAttribute('aria-pressed')).toBe('true');
  });

  it('recomposes the list from the filters once entries arrive', () => {
    const host = scaffold('en', entries);
    bindLogbook(host);
    setLogbookEntries(host, { entries, lang: 'en' });
    const note = host.querySelector('#logbook button[data-type="note"]') as HTMLButtonElement;
    note.click();
    // Five notes: Notes on TexForge, General note, Older note, Tenth, Eleventh.
    expect(host.querySelectorAll('#logbook-list .log-entry')).toHaveLength(5);
    // The filter rows still describe the whole record: All counts every
    // entry and no topic/type button drops out.
    expect(host.querySelector('#logbook [data-topic="all"]')?.textContent).toContain('12');
    expect(host.querySelector('#logbook [data-topic="canopy"]')?.textContent).toContain('4');
    expect(host.querySelector('#logbook [data-type="note"]')?.textContent).toContain('5');
    // Recomposing rebuilds the filter rows, so re-query the live button.
    const noteNow = host.querySelector('#logbook button[data-type="note"]') as HTMLButtonElement;
    expect(noteNow.getAttribute('aria-pressed')).toBe('true');
  });

  it('recomposes the edge-filled list from one fetched read', async () => {
    // No setLogbookEntries: the edge filled the page, so the first click
    // only hides in place — then the fetched entries arrive and the list
    // recomposes from the matching entries, keeping the full filter rows.
    const host = scaffold('en', entries);
    bindLogbook(host);
    (globalThis as { fetch?: unknown }).fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ entries }) } as Response);
    const canopy = host.querySelector('#logbook button[data-topic="canopy"]') as HTMLButtonElement;
    canopy.click();
    await new Promise((r) => setTimeout(r, 0));
    const visible = Array.from(host.querySelectorAll('#logbook-list .log-entry'));
    expect(visible).toHaveLength(4);
    expect(host.querySelector('#logbook [data-topic="all"]')?.textContent).toContain('12');
    expect(host.querySelector('#logbook [data-topic="canopy"]')?.textContent).toContain('4');
    // Recomposing rebuilds the filter rows, so re-query the live button.
    const canopyNow = host.querySelector('#logbook button[data-topic="canopy"]') as HTMLButtonElement;
    expect(canopyNow.getAttribute('aria-pressed')).toBe('true');
  });

  it('honours ?topic= on the Logbook', () => {
    const host = scaffold('en', entries);
    history.replaceState({}, '', '/logbook/?topic=canopy');
    bindLogbook(host);
    setLogbookEntries(host, { entries, lang: 'en' });
    const titles = Array.from(host.querySelectorAll('#logbook-list .log-entry h3')).map(
      (h) => h.textContent,
    );
    expect(titles).toEqual(['Newest', 'Bugfix', 'Update', 'Eleventh']);
  });
});
