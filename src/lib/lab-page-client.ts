// Page 2's behaviour: the masthead tabs, the filters and the older control.
// Progressive enhancement — without this script both pages read one after
// the other, every entry unfolded, and the hash still jumps to page 2.

/** Wire the tabs, filters and older control under `root`. Safe to call when
 *  the edge already filled the pages: it only binds, never renders. */
export function bindLabPage(root: ParentNode = document): void {
  const paper = root.querySelector
    ? (root.querySelector('.paper') as HTMLElement | null)
    : null;
  if (!paper) return;
  paper.classList.add('js');

  const page1 = paper.querySelector('#page-1') as HTMLElement | null;
  const lab = paper.querySelector('#lab') as HTMLElement | null;
  if (!page1 || !lab) return;
  const tabs = Array.from(paper.querySelectorAll('.paper-tab')) as HTMLElement[];

  const show = (id: 'page-1' | 'lab'): void => {
    page1.hidden = id !== 'page-1';
    lab.hidden = id !== 'lab';
    for (const tab of tabs) {
      tab.classList.toggle('is-active', tab.getAttribute('data-page') === id);
    }
  };

  const showFromHash = (): void => {
    show(window.location.hash === '#lab' ? 'lab' : 'page-1');
  };

  const log = lab.querySelector('#lab-log') as HTMLElement | null;
  const older = lab.querySelector('#lab-older') as HTMLButtonElement | null;
  const step = log ? Number(log.getAttribute('data-shown')) || 10 : 10;
  let shown = step;
  let activeTopic = 'all';
  let activeType = 'all';
  let activeRoadmap: string | null = null;

  const entries = (): HTMLElement[] =>
    log ? (Array.from(log.querySelectorAll('.log-entry')) as HTMLElement[]) : [];

  const filtered = (): boolean => activeTopic !== 'all' || activeType !== 'all' || activeRoadmap !== null;

  const match = (el: HTMLElement): boolean => {
    if (activeRoadmap !== null && (el.getAttribute('data-roadmap') || '') !== activeRoadmap) return false;
    if (activeTopic !== 'all' && (el.getAttribute('data-topic') || '') !== activeTopic) return false;
    if (activeType !== 'all' && (el.getAttribute('data-type') || '') !== activeType) return false;
    return true;
  };

  const paint = (): void => {
    const rows = entries();
    if (filtered()) {
      // A filter searches the whole logbook: every match reads, folded or not.
      for (const el of rows) {
        el.classList.toggle('is-hidden', !match(el));
        el.classList.remove('is-folded');
      }
      if (older) older.hidden = true;
      return;
    }
    let visible = 0;
    for (const el of rows) {
      el.classList.remove('is-hidden');
      const fold = visible >= shown;
      el.classList.toggle('is-folded', fold);
      if (!fold) visible++;
    }
    if (older) older.hidden = rows.length <= shown;
  };

  const press = (row: Element | null, id: string): void => {
    if (!row) return;
    for (const btn of Array.from(row.querySelectorAll('.lab-filter'))) {
      const on = btn.getAttribute(btn.hasAttribute('data-topic') ? 'data-topic' : 'data-type') === id;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-active', on);
    }
  };

  const topicRow = lab.querySelector('.lab-filter-row[data-kind="topic"]');
  const typeRow = lab.querySelector('.lab-filter-row[data-kind="type"]');
  if (topicRow) {
    topicRow.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest('button[data-topic]');
      if (!btn) return;
      activeTopic = btn.getAttribute('data-topic') || 'all';
      press(topicRow, activeTopic);
      paint();
    });
  }
  if (typeRow) {
    typeRow.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest('button[data-type]');
      if (!btn) return;
      activeType = btn.getAttribute('data-type') || 'all';
      press(typeRow, activeType);
      paint();
    });
  }

  if (older) {
    older.addEventListener('click', () => {
      shown += step;
      paint();
    });
  }

  // Deep links from the roadmap board and the experiment pages land here
  // filtered — and on page 2, whatever the hash says.
  try {
    const params = new URLSearchParams(window.location.search);
    const roadmap = params.get('roadmap');
    const topic = params.get('topic');
    if (roadmap) activeRoadmap = roadmap;
    if (topic) activeTopic = topic;
    if (roadmap || topic) {
      press(topicRow, activeTopic);
      press(typeRow, activeType);
      show('lab');
    } else {
      showFromHash();
    }
  } catch {
    showFromHash();
  }
  paint();
  window.addEventListener('hashchange', showFromHash);
}
