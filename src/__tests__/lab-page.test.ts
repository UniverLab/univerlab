import {
  LAB_SHOWN,
  LAB_TOPICS,
  LAB_TYPES,
  labPageHtml,
  labPageMarkdown,
  sortEntries,
} from '../lib/lab-page';
import { bindLabPage } from '../lib/lab-page-client';
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

describe('lab page (newspaper page 2)', () => {
  it('sorts newest first', () => {
    const sorted = sortEntries([...entries].reverse());
    expect(sorted.map((e) => e.id)).toEqual([
      'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10', 'e11', 'e12',
    ]);
  });

  it('prints every entry newest first, folded past ten', () => {
    const html = labPageHtml(entries, 'en');
    const titles = [...html.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1]);
    expect(titles).toEqual([
      'Newest', 'Notes on TexForge', 'Mystery topic', 'General note', 'Bugfix',
      'Incident', 'Update', 'Old launch', 'Older note', 'Tenth', 'Eleventh', 'Twelfth',
    ]);
    expect(html).toContain(`data-shown="${LAB_SHOWN}"`);
    expect(LAB_SHOWN).toBe(10);
    const folded = html.match(/class="log-entry is-folded"/g) || [];
    expect(folded).toHaveLength(2);
  });

  it('counts every entry on the All filters and per topic/type', () => {
    const html = labPageHtml(entries, 'en');
    // All counts every entry, twice (topic row + type row).
    expect(html.match(/data-topic="all" aria-pressed="true">All<span class="lab-filter-count">12<\/span>/)).not.toBeNull();
    // canopy ×4 (e1, e5, e7, e11); unknown + null topics fold into general.
    expect(html).toContain('data-topic="canopy" aria-pressed="false">Canopy<span class="lab-filter-count">4</span>');
    expect(html).toContain('>General<span class="lab-filter-count">2</span>');
    // launch ×3, note ×5.
    expect(html).toContain('data-type="launch" aria-pressed="false">launch<span class="lab-filter-count">3</span>');
    expect(html).toContain('data-type="note" aria-pressed="false">note<span class="lab-filter-count">5</span>');
  });

  it('carries the filter axes on every row for the client', () => {
    const html = labPageHtml(entries, 'en');
    expect(html).toContain('data-topic="canopy" data-type="launch" data-roadmap="r1"');
    expect(html).toContain('data-topic="general" data-type="deploy" data-roadmap=""');
  });

  it('ships the older control hidden with its copy', () => {
    const html = labPageHtml(entries, 'en');
    expect(html).toContain('<button type="button" id="lab-older" hidden>Older entries</button>');
  });

  it('renders the heading and control in Spanish', () => {
    const html = labPageHtml(entries, 'es');
    expect(html).toContain('<h2 class="lab-heading">Noticias del laboratorio</h2>');
    expect(html).toContain('<button type="button" id="lab-older" hidden>Ver anteriores</button>');
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

  it('the markdown twin carries the unavailable line', () => {
    expect(labPageMarkdown([], 'en', { unavailable: true })).toBe(
      '## Lab news\n\nThe lab mail did not arrive — try again later.',
    );
    expect(labPageMarkdown([], 'es', { unavailable: true })).toBe(
      '## Noticias del laboratorio\n\nNo llegó el correo del laboratorio; inténtelo más tarde.',
    );
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

  it('escapes entry text', () => {
    const html = labPageHtml(
      [{ id: 'x', date: '2026-10-06T01:09:26.735Z', title: '<b>Hi</b>', body: 'a&b', type: 'note', topic: 'canopy', link: null }],
      'en',
    );
    expect(html).not.toContain('<b>Hi</b>');
    expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;');
    expect(html).toContain('a&amp;b');
  });
});

describe('bindLabPage', () => {
  const scaffold = (lang: 'en' | 'es', rows: Entry[]): void => {
    document.body.innerHTML =
      `<div class="paper">` +
      `<nav class="paper-tabs">` +
      `<a class="paper-tab is-active" data-page="page-1" href="#page-1">Page 1</a>` +
      `<a class="paper-tab" data-page="lab" href="#lab">Page 2</a>` +
      `</nav>` +
      `<section id="page-1" class="paper-page"><div id="edition">edition</div></section>` +
      `<section id="lab" class="paper-page"><div id="lab-body">${labPageHtml(rows, lang)}</div></section>` +
      `</div>`;
  };

  beforeEach(() => {
    window.location.hash = '';
    history.replaceState({}, '', '/newspaper/');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens page 2 directly on #lab', () => {
    scaffold('en', entries);
    window.location.hash = '#lab';
    bindLabPage(document);
    expect((document.getElementById('lab') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('page-1') as HTMLElement).hidden).toBe(true);
    const tabs = Array.from(document.querySelectorAll('.paper-tab'));
    expect(tabs[1].classList.contains('is-active')).toBe(true);
    expect(tabs[0].classList.contains('is-active')).toBe(false);
  });

  it('keeps page 1 without a hash', () => {
    scaffold('en', entries);
    bindLabPage(document);
    expect((document.getElementById('page-1') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('lab') as HTMLElement).hidden).toBe(true);
  });

  it('unfolds ten more on the older control', () => {
    scaffold('en', entries);
    bindLabPage(document);
    const rows = Array.from(document.querySelectorAll('.log-entry'));
    expect(rows.filter((r) => r.classList.contains('is-folded'))).toHaveLength(2);
    const older = document.getElementById('lab-older') as HTMLButtonElement;
    expect(older.hidden).toBe(false);
    older.click();
    expect(document.querySelectorAll('.log-entry.is-folded')).toHaveLength(0);
    expect(older.hidden).toBe(true);
  });

  it('filters toggle is-hidden over every entry', () => {
    scaffold('en', entries);
    bindLabPage(document);
    const canopy = document.querySelector('button[data-topic="canopy"]') as HTMLButtonElement;
    canopy.click();
    const visible = Array.from(document.querySelectorAll('.log-entry')).filter(
      (r) => !(r as HTMLElement).classList.contains('is-hidden'),
    );
    expect(visible).toHaveLength(4);
    // A filter searches the whole logbook: folded rows read too.
    expect(document.querySelectorAll('.log-entry.is-folded')).toHaveLength(0);
  });

  it('honours ?roadmap= and ?topic= on page 2', () => {
    scaffold('en', entries);
    history.replaceState({}, '', '/newspaper/?roadmap=r1');
    bindLabPage(document);
    expect((document.getElementById('lab') as HTMLElement).hidden).toBe(false);
    const visible = Array.from(document.querySelectorAll('.log-entry')).filter(
      (r) => !(r as HTMLElement).classList.contains('is-hidden'),
    );
    expect(visible.map((r) => (r as HTMLElement).querySelector('h3')?.textContent)).toEqual([
      'Newest',
      'Update',
    ]);
  });
});
