import { labPageHtml, labPageHtml2 } from '../lib/lab-page';
import { bindLabPage, labPageNeeds, paintLabEdition } from '../lib/lab-page-client';
import { entriesUpTo, type Entry } from '../lib/lab-feed';

// A past edition (?d=2026-07-22) whose lab fits one page: the edge prints
// page 2 but ships page 3 as inert <template>s, so the client fill — not
// syncPages — must print the edition's classifieds from entriesUpTo.
// Each test binds a fresh root: filter state and stored entries are keyed
// by root, so sharing the runner document would leak clicks between tests.
const day = new Date(2026, 6, 22, 12);

const all: Entry[] = [
  { id: 'c1', date: '2026-07-22T10:00:00.000Z', title: 'Canopy first', body: 'Body one.', type: 'launch', topic: 'canopy', link: null },
  { id: 'c2', date: '2026-07-20T10:00:00.000Z', title: 'Canopy second', body: 'Body two.', type: 'note', topic: 'canopy', link: null },
  { id: 't1', date: '2026-07-19T10:00:00.000Z', title: 'TexForge note', body: 'Body three.', type: 'note', topic: 'texforge', link: null },
  { id: 'g1', date: '2026-07-21T10:00:00.000Z', title: 'General note', body: 'Body four.', type: 'note', topic: null, link: null },
  { id: 'later', date: '2026-07-25T10:00:00.000Z', title: 'Later notice', body: 'Body five.', type: 'note', topic: 'canopy', link: null },
];

const titles = ['Canopy first', 'Canopy second', 'TexForge note', 'General note'];

const scaffold = (lang: 'en' | 'es', lab: string, lab2: string, edition = 'edition'): Document => {
  const fresh = document.implementation.createHTMLDocument();
  fresh.body.innerHTML =
    `<div class="paper">` +
    `<nav class="paper-tabs">` +
    `<a class="paper-tab is-active" data-page="page-1" href="#page-1">Page 1</a>` +
    `<a class="paper-tab" data-page="lab" href="#lab">Page 2</a>` +
    `<a class="paper-tab" data-page="lab2" href="#lab2">Page 3</a>` +
    `</nav>` +
    `<section id="page-1" class="paper-page"><div id="edition">${edition}</div></section>` +
    `<section id="lab" class="paper-page"><div id="lab-body">${lab}</div></section>` +
    `<section id="lab2" class="paper-page"><div id="lab2-body">${lab2}</div></section>` +
    `</div>`;
  return fresh;
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

describe('newspaper past-edition lab fill', () => {
  it('reads a one-page past edition as lab2-only work and prints its grid', () => {
    const rows = entriesUpTo(all, day);
    expect(rows.map((e) => e.id).sort()).toEqual(['c1', 'c2', 'g1', 't1']);
    const fresh = scaffold('es', labPageHtml(rows, 'es'), labPageHtml2(rows, 'es'));
    // Page 3 ships markup but no readable text: only templates wait inert.
    expect(labPageNeeds(fresh)).toEqual({ edition: false, lab: false, lab2: true, read: true });
    paintLabEdition(fresh, rows, 'es', { unavailable: false });
    const grid = fresh.querySelector('#lab-body .classifieds') as HTMLElement;
    expect(grid).not.toBeNull();
    for (const title of titles) expect(grid.textContent).toContain(title);
    expect(grid.textContent).not.toContain('Later notice');
    expect((fresh.querySelector('.paper-tab[data-page="lab"]') as HTMLElement).hidden).toBe(false);
    expect((fresh.querySelector('.paper-tab[data-page="lab2"]') as HTMLElement).hidden).toBe(true);
  });

  it('keeps the edge coupon count when the edition is recomposed', () => {
    const rows = entriesUpTo(all, day);
    const opts = { foundingLeft: 0 };
    const fresh = scaffold('es', labPageHtml(rows, 'es', opts), labPageHtml2(rows, 'es', opts));
    const coupons = () => fresh.querySelectorAll('#lab-body .coupon').length;
    expect(coupons()).toBe(3);
    paintLabEdition(fresh, rows, 'es', { unavailable: false, foundingLeft: 0 });
    expect(coupons()).toBe(3);
  });

  it('keeps filter clicks inside the edition, not the full feed', () => {
    const rows = entriesUpTo(all, day);
    const fresh = scaffold('es', labPageHtml(rows, 'es'), labPageHtml2(rows, 'es'));
    bindLabPage(fresh);
    paintLabEdition(fresh, rows, 'es', { unavailable: false });
    (fresh.querySelector('#lab button[data-topic="canopy"]') as HTMLButtonElement).click();
    // The stored record is the edition's: the later canopy notice never
    // arrives, and the other topics filter out.
    const grid = fresh.querySelector('#lab-log') as HTMLElement;
    expect(grid.textContent).toContain('Canopy first');
    expect(grid.textContent).toContain('Canopy second');
    expect(grid.textContent).not.toContain('Later notice');
    expect(grid.textContent).not.toContain('TexForge note');
    expect(grid.textContent).not.toContain('General note');
  });

  it('prints no grid for an edition with no entries up to its day', () => {
    const fresh = scaffold('es', '', '', '');
    expect(labPageNeeds(fresh)).toEqual({ edition: true, lab: true, lab2: true, read: true });
    paintLabEdition(fresh, [], 'es');
    expect(fresh.querySelector('#lab-body .classifieds')).toBeNull();
    expect((fresh.querySelector('.paper-tab[data-page="lab"]') as HTMLElement).hidden).toBe(true);
    expect((fresh.querySelector('.paper-tab[data-page="lab2"]') as HTMLElement).hidden).toBe(true);
  });

  it('keeps the edge grid when the lab read failed', () => {
    const rows = entriesUpTo(all, day);
    const fresh = scaffold('es', labPageHtml(rows, 'es'), labPageHtml2(rows, 'es'));
    paintLabEdition(fresh, rows, 'es', { unavailable: true });
    // Nothing stored, nothing touched: the edge grid survives, and a filter
    // click with the API down only refreshes the pressed state.
    bindLabPage(fresh);
    const grid = fresh.querySelector('#lab-body .classifieds') as HTMLElement;
    expect(grid).not.toBeNull();
    for (const title of titles) expect(grid.textContent).toContain(title);
    const canopy = fresh.querySelector('#lab button[data-topic="canopy"]') as HTMLButtonElement;
    canopy.click();
    for (const title of titles) expect(grid.textContent).toContain(title);
    expect(canopy.getAttribute('aria-pressed')).toBe('true');
  });
});
