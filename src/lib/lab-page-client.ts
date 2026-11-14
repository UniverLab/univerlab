// Pages 2 and 3 behave like the masthead tabs: without JS both read one
// after the other; with JS the tabs switch and the filters recompose the
// classifieds from the entries. The Logbook page filters the same way.

import {
  classifiedsHtml,
  logbookFilteredHtml,
  type Entry,
  type LabPageLang,
} from './lab-page';
import { fitClassifieds, fitPaper } from './paper-fit';
import { normalizeTopic } from './field-notes';

export interface LabSource {
  entries: Entry[];
  lang: LabPageLang;
  foundingLeft?: number | null;
}

type PageId = 'page-1' | 'lab' | 'lab2';

const store = new WeakMap<object, LabSource>();

/** Hand the binder the fetched entries so filters recompose the pages. */
export function setLabEntries(root: ParentNode, source: LabSource): void {
  store.set(root, source);
  paintLab(root);
}

/** Hand the Logbook binder its entries. */
export function setLogbookEntries(root: ParentNode, source: LabSource): void {
  store.set(root, source);
  paintLogbook(root);
}

function langOf(root: ParentNode, fallback: LabSource | undefined): LabPageLang {
  if (fallback) return fallback.lang;
  const el = root instanceof Document ? root.documentElement : null;
  return el && el.lang === 'es' ? 'es' : 'en';
}

const PAGE_ORDER = ['page-1', 'lab', 'lab2'] as const;

/** Which page reads now: the one section not hidden, page 1 when unsure. */
function currentPage(scope: ParentNode): PageId {
  for (const page of PAGE_ORDER) {
    const section = scope.querySelector?.(`#${page}`) as HTMLElement | null;
    if (section && !section.hidden) return page;
  }
  return 'page-1';
}

/** The pages that read: the order minus the pages with no content (paintLab
 *  hides their tabs and their section), so a missing page 3 leaves two. */
function readablePages(scope: ParentNode): PageId[] {
  const tabs = scope.querySelectorAll
    ? (Array.from(scope.querySelectorAll('.paper-tab')) as HTMLElement[])
    : [];
  const tabbed = PAGE_ORDER.filter((page) =>
    tabs.some((tab) => tab.getAttribute('data-page') === page && !tab.hidden),
  );
  return tabbed.length > 0 ? tabbed : [...PAGE_ORDER];
}

/** The slim strip's page count: "n / total" over the pages that read, so a
 *  missing page 3 reads "2 / 2". Ends disable their arrow; the name
 *  announces the page. */
function paintStrip(scope: ParentNode, id: PageId): void {
  const list = readablePages(scope);
  const at = Math.max(0, list.indexOf(id));
  const num = scope.querySelector?.('[data-page-num]');
  if (num) num.textContent = `${at + 1} / ${list.length}`;
  const name = scope.querySelector?.('[data-page-name]') as HTMLElement | null;
  const section = scope.querySelector?.(`#${id}`) as HTMLElement | null;
  if (name && section) name.textContent = section.getAttribute('aria-label') || '';
  const prevBtn = scope.querySelector?.('[data-page-prev]') as HTMLElement | null;
  const nextBtn = scope.querySelector?.('[data-page-next]') as HTMLElement | null;
  // The ends rest rather than hard-disable: the arrow stays focused (the
  // reader's place in the strip) but assistive tech hears it is inert.
  if (prevBtn) {
    prevBtn.classList.toggle('disabled', at <= 0);
    prevBtn.setAttribute('aria-disabled', at <= 0 ? 'true' : 'false');
  }
  if (nextBtn) {
    nextBtn.classList.toggle('disabled', at >= list.length - 1);
    nextBtn.setAttribute('aria-disabled', at >= list.length - 1 ? 'true' : 'false');
  }
}

function tabShow(paper: HTMLElement, id: PageId): void {
  // The masthead tabs live inside the sheet; the slim strip outside it
  // carries arrows and a count. Sync every tab in the document.
  const scope: ParentNode = paper.ownerDocument ?? paper;
  const prev = currentPage(scope);
  for (const page of PAGE_ORDER) {
    const section = scope.querySelector?.(`#${page}`) as HTMLElement | null;
    if (section) section.hidden = page !== id;
  }
  const tabs = scope.querySelectorAll
    ? (Array.from(scope.querySelectorAll('.paper-tab')) as HTMLElement[])
    : [];
  for (const tab of tabs) {
    tab.classList.toggle('is-active', tab.getAttribute('data-page') === id);
  }
  paintStrip(scope, id);
  if (prev === id) return;
  // The page-turn: the incoming leaf swings over its edge, forward one way
  // and back the other. The sheet keeps its fitted scale throughout; only
  // the page animates, with transform and opacity, never layout.
  const section = scope.querySelector?.(`#${id}`) as HTMLElement | null;
  if (!section) return;
  const cls = PAGE_ORDER.indexOf(id) > PAGE_ORDER.indexOf(prev) ? 'turn-next' : 'turn-prev';
  section.classList.remove('turn-next', 'turn-prev');
  section.classList.add(cls);
  window.setTimeout(() => {
    section.classList.remove('turn-next', 'turn-prev');
  }, 620);
  // The newly shown page was hidden (nothing measured there): fit it now that
  // it reads. Already-fitted pages measure clean and stay untouched.
  fitPaper(scope);
}

function matchState(el: HTMLElement, topic: string, type: string, roadmap: string | null): boolean {
  if (roadmap !== null && (el.getAttribute('data-roadmap') || '') !== roadmap) return false;
  if (topic !== 'all' && (el.getAttribute('data-topic') || '') !== topic) return false;
  if (type !== 'all' && (el.getAttribute('data-type') || '') !== type) return false;
  return true;
}

interface FilterState {
  topic: string;
  type: string;
  roadmap: string | null;
}

const states = new WeakMap<object, FilterState>();

function stateOf(root: ParentNode): FilterState {
  let s = states.get(root);
  if (!s) {
    s = { topic: 'all', type: 'all', roadmap: null };
    states.set(root, s);
  }
  return s;
}

function pressFresh(root: ParentNode, scope: string, st: FilterState): void {
  const doc = root as Document;
  if (!doc.querySelector) return;
  for (const row of Array.from(doc.querySelectorAll(`${scope} .lab-filter-row`)) as HTMLElement[]) {
    const kind = row.getAttribute('data-kind');
    const id = kind === 'topic' ? st.topic : st.type;
    for (const btn of Array.from(row.querySelectorAll('.lab-filter'))) {
      const attr = btn.hasAttribute('data-topic') ? 'data-topic' : 'data-type';
      const on = btn.getAttribute(attr) === id;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-active', on);
    }
  }
}

/** Recompose both classifieds pages from the stored entries, or hide
 *  non-matching ads in the edge-rendered DOM when entries are unknown. The
 *  in-place path is transient: the binders fetch once (see ensureEntries)
 *  and recompose from the matching entries when the read lands. */
function paintLab(root: ParentNode): void {
  const doc = root as Document;
  const paper = doc.querySelector?.('.paper') as HTMLElement | null;
  if (!paper) return;
  const lab = paper.querySelector('#lab') as HTMLElement | null;
  const lab2 = paper.querySelector('#lab2') as HTMLElement | null;
  if (!lab) return;
  const st = stateOf(root);
  const src = store.get(root);
  if (src) {
    const rows = src.entries.filter(
      (e) =>
        (st.roadmap === null || (e.roadmap_id || '') === st.roadmap) &&
        (st.topic === 'all' || normalizeTopic(e.topic) === st.topic) &&
        (st.type === 'all' || (typeof e.type === 'string' ? e.type.toLowerCase() : '') === st.type),
    );
    const { page1, page2 } = classifiedsHtml(rows, src.lang, { foundingLeft: src.foundingLeft });
    const labBody = lab.querySelector('#lab-body') as HTMLElement | null;
    if (labBody) {
      const tmp = doc.createElement('div');
      tmp.innerHTML = page1;
      const next = tmp.querySelector('#lab-log');
      const cur = labBody.querySelector('#lab-log');
      if (next && cur) cur.replaceWith(next);
      else if (next) labBody.appendChild(next);
      else cur?.remove();
      const note = labBody.querySelector('.coupon-note');
      const tmpNote = tmp.querySelector('.coupon-note');
      if (note && tmpNote) note.replaceWith(tmpNote);
    }
    const lab2Body = lab2?.querySelector('#lab2-body') as HTMLElement | null;
    if (lab2 && lab2Body) {
      lab2Body.innerHTML = page2;
      const hasPage = page2.trim().length > 0;
      lab2.hidden = !hasPage;
      const scope: ParentNode = paper.ownerDocument ?? paper;
      for (const tab3 of Array.from(
        scope.querySelectorAll?.('.paper-tab[data-page="lab2"]') ?? [],
      ) as HTMLElement[]) {
        tab3.hidden = !hasPage;
      }
      if (!hasPage && !lab.hidden) tabShow(paper, 'lab');
    }
    pressFresh(root, '#lab', st);
    // Recomposed grids are full grids again: trim them to the sheet, as
    // after every fill. Hidden pages and zero measurements are safe no-ops.
    fitClassifieds(root);
    return;
  }
  // No entries yet (the edge filled the pages): never hide in place —
  // filtering always recomposes the pages from the matching entries, so
  // wait for the one fetched read (see ensureEntries) to repaint.
  pressFresh(root, '#lab', st);
  // Recomposed grids are full grids again: trim them to the sheet, as after
  // every fill. Hidden pages and zero measurements are safe no-ops.
  fitClassifieds(root);
}

/** One read of the announcements for a root that the edge filled: the
 *  filter then recomposes from the matching entries instead of hiding the
 *  edge-rendered ads in place. Shared by the newspaper and the Logbook.
 *  Null when the read fails, so a dead API never wipes the edge content. */
function fetchLabEntries(): Promise<Entry[] | null> {
  return fetch('https://announcements.univerlab.org/?limit=100')
    .then((res) => {
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json() as Promise<{ entries?: unknown }>;
    })
    .then((data) => (Array.isArray(data?.entries) ? (data.entries as Entry[]) : []))
    .catch(() => null);
}

const inflight = new WeakMap<object, Promise<void>>();

function ensureEntries(root: ParentNode, paint: (root: ParentNode) => void): void {
  if (store.get(root) || inflight.get(root)) return;
  const done = (): void => {
    if (inflight.get(root) === p) inflight.delete(root);
  };
  const p: Promise<void> = fetchLabEntries().then(
    (entries) => {
      done();
      // A failed read leaves the edge-rendered page (and its pressed
      // filter) in place instead of recomposing from an empty record.
      if (entries !== null && !store.get(root)) {
        store.set(root, { entries, lang: langOf(root, undefined) });
        paint(root);
      }
    },
    () => {
      done();
    },
  );
  inflight.set(root, p);
}

function paintLogbook(root: ParentNode): void {
  const doc = root as Document;
  const body = doc.querySelector?.('#logbook-body') as HTMLElement | null;
  if (!body) return;
  const st = stateOf(root);
  const src = store.get(root);
  const lang = langOf(root, src);
  if (src) {
    const rows = src.entries.filter(
      (e) =>
        (st.roadmap === null || (e.roadmap_id || '') === st.roadmap) &&
        (st.topic === 'all' || normalizeTopic(e.topic) === st.topic) &&
        (st.type === 'all' || (typeof e.type === 'string' ? e.type.toLowerCase() : '') === st.type),
    );
    // The filter rows always describe the whole record; only the list
    // follows the filter, so counts and buttons never collapse.
    body.innerHTML = logbookFilteredHtml(src.entries, rows, lang);
    pressFresh(root, '#logbook', st);
    return;
  }
  const filtered = st.topic !== 'all' || st.type !== 'all' || st.roadmap !== null;
  const ads = Array.from(body.querySelectorAll('.log-entry')) as HTMLElement[];
  for (const el of ads) {
    el.classList.toggle('is-hidden', filtered && !matchState(el, st.topic, st.type, st.roadmap));
  }
  pressFresh(root, '#logbook', st);
}

/** Wire the three tabs, the filters and the deep links under `root`. Safe to
 *  call when the edge already filled the pages: it only binds, never renders. */
export function bindLabPage(root: ParentNode = document): void {
  const doc = root as Document;
  if (!doc.querySelector) return;
  const paper = doc.querySelector('.paper') as HTMLElement | null;
  if (!paper) return;
  paper.classList.add('js');

  const page1 = paper.querySelector('#page-1') as HTMLElement | null;
  const lab = paper.querySelector('#lab') as HTMLElement | null;
  if (!page1 || !lab) return;
  const st = stateOf(root);

  const showFromHash = (): void => {
    const h = window.location.hash;
    tabShow(paper, h === '#lab2' ? 'lab2' : h === '#lab' ? 'lab' : 'page-1');
  };

  // Tabs read as plain anchors without JS. With JS the click never leaves
  // through the anchor: preventDefault keeps the window from scrolling to
  // the fragment, pushState keeps the hash in the URL without the native
  // jump, and the sheet stays fitted where it was.
  doc.addEventListener('click', (event) => {
    // The slim strip's arrows step one readable page either way, like the
    // tabs but without leaving through an anchor: pushState keeps the hash
    // without the native jump, and the sheet stays fitted where it was.
    const stepBtn = (event.target as HTMLElement).closest?.(
      'button[data-page-prev], button[data-page-next]',
    ) as HTMLButtonElement | null;
    if (stepBtn) {
      // One step per click even when the binder ran twice (the document
      // listener would otherwise step once per binding): the first handler
      // to reach the click owns it.
      const claimed = event as unknown as Record<string, unknown>;
      if (claimed.__labStripStep === true) return;
      claimed.__labStripStep = true;
      const back = stepBtn.hasAttribute('data-page-prev');
      const list = readablePages(root);
      const at = Math.max(0, list.indexOf(currentPage(root)));
      const next = list[Math.min(list.length - 1, Math.max(0, at + (back ? -1 : 1)))];
      if (next === undefined || next === currentPage(root)) return;
      event.preventDefault();
      history.pushState({}, '', `#${next}`);
      tabShow(paper, next);
      return;
    }
    const anchor = (event.target as HTMLElement).closest?.('a.paper-tab') as HTMLAnchorElement | null;
    if (!anchor) return;
    // Modified clicks keep the anchor's own meaning: new tab, new window.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const id = anchor.getAttribute('data-page');
    if (id !== 'page-1' && id !== 'lab' && id !== 'lab2') return;
    event.preventDefault();
    history.pushState({}, '', `#${id}`);
    tabShow(paper, id);
  });

  paper.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest?.('button.lab-filter');
    if (!btn) return;
    if (btn.hasAttribute('data-topic')) st.topic = btn.getAttribute('data-topic') || 'all';
    else if (btn.hasAttribute('data-type')) st.type = btn.getAttribute('data-type') || 'all';
    else return;
    // Without stored entries (the edge filled the pages) the paint below
    // only refreshes the pressed state; fetch once so the filter recomposes
    // the pages from the matching entries when the read lands.
    ensureEntries(root, paintLab);
    paintLab(root);
  });

  // Deep links from the roadmap board and the experiment pages land here
  // filtered — and on page 2, whatever the hash says.
  try {
    const params = new URLSearchParams(window.location.search);
    const roadmap = params.get('roadmap');
    const topic = params.get('topic');
    if (roadmap) st.roadmap = roadmap;
    if (topic) st.topic = topic;
    if (roadmap || topic) {
      tabShow(paper, 'lab');
      ensureEntries(root, paintLab);
    } else {
      showFromHash();
    }
  } catch {
    showFromHash();
  }
  paintLab(root);
  window.addEventListener('hashchange', showFromHash);
}

/** Wire the Logbook page's filters under `root`. Safe to call when the edge
 *  already filled the page: it only binds, never renders. Like bindLabPage
 *  it marks the paper `js`, which is what arms the `.is-hidden` hide rule. */
export function bindLogbook(root: ParentNode = document): void {
  const doc = root as Document;
  if (!doc.querySelector) return;
  const scope = doc.querySelector('#logbook') as HTMLElement | null;
  if (!scope) return;
  scope.classList.add('js');
  const st = stateOf(root);
  try {
    const params = new URLSearchParams(window.location.search);
    const roadmap = params.get('roadmap');
    const topic = params.get('topic');
    if (roadmap) st.roadmap = roadmap;
    if (topic) st.topic = topic;
  } catch {
    /* keep defaults */
  }
  scope.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest?.('button.lab-filter');
    if (!btn) return;
    if (btn.hasAttribute('data-topic')) st.topic = btn.getAttribute('data-topic') || 'all';
    else if (btn.hasAttribute('data-type')) st.type = btn.getAttribute('data-type') || 'all';
    else return;
    // Without stored entries (the edge filled the page) the paint below
    // only hides in place; fetch once so the filter recomposes the list
    // from the matching entries instead.
    ensureEntries(root, paintLogbook);
    paintLogbook(root);
  });
  if (st.roadmap !== null || st.topic !== 'all' || st.type !== 'all') {
    ensureEntries(root, paintLogbook);
  }
  paintLogbook(root);
}
