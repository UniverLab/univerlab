import { labPageHtml, labPageHtml2 } from '../lib/lab-page';
import { bindLabPage, syncPages } from '../lib/lab-page-client';
import type { Entry } from '../lib/lab-feed';

const entries: Entry[] = [
  { id: 'e1', date: '2026-10-06T01:09:26.735Z', title: 'Newest', body: 'First.\n\nSecond.', type: 'launch', topic: 'canopy', link: null, roadmap_id: 'r1' },
  { id: 'e2', date: '2026-10-05T10:00:00.000Z', title: 'Notes on TexForge', body: 'Body two.', type: 'note', topic: 'texforge', link: 'https://example.com/o' },
  { id: 'e3', date: '2026-10-04T10:00:00.000Z', title: 'Mystery topic', body: 'Body three.', type: 'deploy', topic: 'unknown-thing', link: null },
  { id: 'e4', date: '2026-10-03T10:00:00.000Z', title: 'General note', body: 'Body four.', type: 'note', topic: null, link: null },
  { id: 'e5', date: '2026-10-02T10:00:00.000Z', title: 'Bugfix', body: 'Body five.', type: 'bugfix', topic: 'canopy', link: null },
  { id: 'e6', date: '2026-10-01T10:00:00.000Z', title: 'Incident', body: 'Body six.', type: 'incident', topic: 'gitkit', link: null },
  { id: 'e7', date: '2026-09-30T10:00:00.000Z', title: 'Update', body: 'Body seven.', type: 'note', topic: 'canopy', link: null, roadmap_id: 'r1' },
  { id: 'e8', date: '2026-09-29T10:00:00.000Z', title: 'Old launch', body: 'Body eight.', type: 'launch', topic: 'ghscaff', link: null },
  { id: 'e9', date: '2026-09-28T10:00:00.000Z', title: 'Older note', body: 'Body nine.', type: 'note', topic: 'demostage', link: null },
  { id: 'e10', date: '2026-09-27T10:00:00.000Z', title: 'Tenth', body: 'Body ten.', type: 'note', topic: 'quorum', link: null },
  { id: 'e11', date: '2026-09-26T10:00:00.000Z', title: 'Eleventh', body: 'Body eleven.', type: 'note', topic: 'canopy', link: null },
  { id: 'e12', date: '2026-09-25T10:00:00.000Z', title: 'Twelfth', body: 'Body twelve.', type: 'launch', topic: 'astro-denoise', link: null },
];

// Enough lab news to run onto page 3 before any measuring.
const manyNotes: Entry[] = Array.from({ length: 60 }, (_, i) => ({
  id: `m${i}`,
  date: new Date(Date.UTC(2026, 9, 6) - i * 86400000).toISOString(),
  title: `Note ${i}`,
  body: 'Body.',
  type: 'note',
  topic: 'canopy',
  link: null,
}) as Entry);

describe('bindLabPage (the continued content sheet)', () => {
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

  it('opens the continued sheet directly on #page-1b and steps through four pages', () => {
    jest.useFakeTimers();
    try {
      document.body.innerHTML =
        `<div class="paper">` +
        `<nav class="paper-tabs">` +
        `<a class="paper-tab is-active" data-page="page-1" href="#page-1">Page 1</a>` +
        `<a class="paper-tab" data-page="page-1b" href="#page-1b">Continued</a>` +
        `<a class="paper-tab" data-page="lab" href="#lab">Page 2</a>` +
        `<a class="paper-tab" data-page="lab2" href="#lab2">Page 3</a>` +
        `</nav>` +
        `<nav class="folio-tabs" aria-label="Page and date controls">` +
        `<a class="paper-tab" data-page="page-1" href="#page-1">1</a>` +
        `<a class="paper-tab" data-page="page-1b" href="#page-1b">2</a>` +
        `<a class="paper-tab" data-page="lab" href="#lab">3</a>` +
        `<a class="paper-tab" data-page="lab2" href="#lab2">4</a>` +
        `</nav>` +
        `<section id="page-1" class="paper-page" aria-label="Page 1"><div id="edition">edition</div></section>` +
        `<section id="page-1b" class="paper-page" aria-label="Page 1 · Continued"><div id="page-1b-body">` +
        `<div class="cols"><section class="col"><article class="item">kept</article></section></div>` +
        `</div></section>` +
        `<section id="lab" class="paper-page" aria-label="Page 2"><div id="lab-body">${labPageHtml(manyNotes, 'en')}</div></section>` +
        `<section id="lab2" class="paper-page" aria-label="Page 3"><div id="lab2-body">${labPageHtml2(manyNotes, 'en')}</div></section>` +
        `</div>` +
        `<div class="paper-bar" data-paper-bar>` +
        `<nav class="paper-strip-pages" aria-label="Page and date controls">` +
        `<button type="button" data-page-prev aria-label="Previous page">prev</button>` +
        `<span data-page-indicator aria-live="polite"><span data-page-num>1 / 4</span><span class="sr-only" data-page-name></span></span>` +
        `<button type="button" data-page-next aria-label="Next page">next</button>` +
        `</nav></div>`;
      window.location.hash = '#page-1b';
      bindLabPage(document);
      const num = () => (document.querySelector('[data-page-num]') as HTMLElement).textContent;
      const name = () => (document.querySelector('[data-page-name]') as HTMLElement).textContent;
      // The deep link lands on the continued sheet: second of four.
      expect(num()).toBe('2 / 4');
      expect(name()).toBe('Page 1 · Continued');
      const folio = Array.from(document.querySelectorAll('.folio-tabs .paper-tab')).map(
        (t) => (t as HTMLElement).textContent,
      );
      expect(folio).toEqual(['1', '2', '3', '4']);
      jest.advanceTimersByTime(700);
      // The strip steps on to the classifieds and back onto the continued sheet.
      const push = jest.spyOn(window.history, 'pushState').mockImplementation(() => {});
      (document.querySelector('[data-page-next]') as HTMLElement).click();
      expect(push).toHaveBeenCalledWith({}, '', '#lab');
      expect(num()).toBe('3 / 4');
      expect(name()).toBe('Page 2');
      jest.advanceTimersByTime(700);
      (document.querySelector('[data-page-prev]') as HTMLElement).click();
      expect(push).toHaveBeenCalledWith({}, '', '#page-1b');
      expect(num()).toBe('2 / 4');
      expect(name()).toBe('Page 1 · Continued');
      jest.advanceTimersByTime(700);
      expect((document.getElementById('page-1b') as HTMLElement).hidden).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('hides an empty continued sheet and closes the folio numbers', () => {
    document.body.innerHTML =
      `<div class="paper">` +
      `<nav class="paper-tabs">` +
      `<a class="paper-tab is-active" data-page="page-1" href="#page-1">Page 1</a>` +
      `<a class="paper-tab" data-page="page-1b" href="#page-1b">Continued</a>` +
      `<a class="paper-tab" data-page="lab" href="#lab">Page 2</a>` +
      `<a class="paper-tab" data-page="lab2" href="#lab2">Page 3</a>` +
      `</nav>` +
      `<nav class="folio-tabs" aria-label="Page and date controls">` +
      `<a class="paper-tab" data-page="page-1" href="#page-1">1</a>` +
      `<a class="paper-tab" data-page="page-1b" href="#page-1b">2</a>` +
      `<a class="paper-tab" data-page="lab" href="#lab">3</a>` +
      `<a class="paper-tab" data-page="lab2" href="#lab2">4</a>` +
      `</nav>` +
      `<section id="page-1" class="paper-page" aria-label="Page 1"><div id="edition">edition</div></section>` +
      `<section id="page-1b" class="paper-page" aria-label="Continued"><div id="page-1b-body"></div></section>` +
      `<section id="lab" class="paper-page" aria-label="Page 2"><div id="lab-body">${labPageHtml(entries, 'en')}</div></section>` +
      `<section id="lab2" class="paper-page" aria-label="Page 3"><div id="lab2-body">${labPageHtml2(entries, 'en')}</div></section>` +
      `</div><span data-page-num>2 / 4</span>`;
    syncPages(document);
    const tab = (id: string) => document.querySelector(`.paper-tab[data-page="${id}"]`) as HTMLElement;
    expect(tab('page-1b').hidden).toBe(true);
    expect((document.getElementById('page-1b') as HTMLElement).hidden).toBe(true);
    // With the continued sheet and page 3 hidden, the folio numbers close up.
    const folio = Array.from(document.querySelectorAll('.folio-tabs .paper-tab'))
      .filter((t) => !(t as HTMLElement).hidden)
      .map((t) => (t as HTMLElement).textContent);
    expect(folio).toEqual(['1', '2']);
    expect(document.querySelector('[data-page-num]')?.textContent).toBe('1 / 2');
  });
});
