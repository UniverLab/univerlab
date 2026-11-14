// The classifieds layout: the lab's announcements composed as a newspaper
// classifieds section in four ad sizes, across at most two pages.
//
// Pure by design: no i18n, no DOM. The edge (functions/_middleware.ts), the
// client fallback (src/lib/lab-page-client.ts) and the tests all read the
// same rule, so the same entries always produce the same layout.
//
// The rule is fixed counts, never weighted area math: entries are ranked by
// type weight (launch/deploy first, then incident, then update/bugfix, then
// note) with newer entries ahead of older ones at equal weight. The first
// two take display ads (paper page 2 only), the next six are boxed, the
// next ten are small, and everything after is a one-line notice. Pages hold
// 14 slots each and there are at most two pages. When entries outgrow two
// pages the oldest boxed and small ads step down to one-line notices first,
// oldest first and only as many as needed; whatever still overflows is left
// out from the tail, oldest-ranked first, and the layout reports truncated,
// so the last page can point at the Logbook.

import type { Entry } from './lab-feed';

/** The four classifieds sizes, largest first. */
export type AdSize = 'display' | 'boxed' | 'small' | 'line';

/** One composed ad: its entry and the size the rule gave it. */
export interface AdSlot {
  entry: Entry;
  size: AdSize;
}

/** The composed section: at most two pages of slots, each page in reading
 *  order. `truncated` is true when entries were left out. */
export interface ClassifiedLayout {
  pages: AdSlot[][];
  truncated: boolean;
}

/** Slots per classifieds page (paper pages 2 and 3): a hard cap. */
export const CLASSIFIEDS_PAGE_SLOTS = 14;

/** The classifieds never run past paper page 3. */
export const CLASSIFIEDS_MAX_PAGES = 2;

/** Fixed counts: display ads only on the first classifieds page. */
export const CLASSIFIEDS_DISPLAY_COUNT = 2;
export const CLASSIFIEDS_BOXED_COUNT = 6;
export const CLASSIFIEDS_SMALL_COUNT = 10;

const CAPACITY = CLASSIFIEDS_PAGE_SLOTS * CLASSIFIEDS_MAX_PAGES;

/** Type weight: newer and more important entries take the larger formats. */
export function typeWeight(type: unknown): number {
  const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
  if (t === 'launch' || t === 'deploy') return 3;
  if (t === 'incident') return 2;
  if (t === 'update' || t === 'bugfix') return 1;
  return 0;
}

/** Rank newest-and-most-important first: type weight, then date, then id.
 *  The id tie-break keeps the order total, so shuffling the input never
 *  changes the layout. */
export function rankEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    const wa = typeWeight(a.type);
    const wb = typeWeight(b.type);
    if (wa !== wb) return wb - wa;
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** The size a rank position takes: display, boxed, small, then lines. */
export function sizeForRank(index: number): AdSize {
  if (index < CLASSIFIEDS_DISPLAY_COUNT) return 'display';
  if (index < CLASSIFIEDS_DISPLAY_COUNT + CLASSIFIEDS_BOXED_COUNT) return 'boxed';
  if (index < CLASSIFIEDS_DISPLAY_COUNT + CLASSIFIEDS_BOXED_COUNT + CLASSIFIEDS_SMALL_COUNT) {
    return 'small';
  }
  return 'line';
}

/** Compose at most two pages from the entries. With fewer entries there is
 *  one page; with none, no pages. Past 28 entries the oldest boxed and small
 *  ads step down to one-line notices, oldest first and only as many as the
 *  overflow needs; whatever still overflows is left out from the tail,
 *  oldest-ranked first. */
export function layoutClassifieds(entries: Entry[]): ClassifiedLayout {
  const ranked = rankEntries(entries || []);
  if (!ranked.length) return { pages: [], truncated: false };
  const slots: AdSlot[] = ranked.map((entry, i) => ({ entry, size: sizeForRank(i) }));
  if (slots.length > CAPACITY) {
    let need = slots.length - CAPACITY;
    // Oldest boxed/small first: oldest date, ties broken toward the tail
    // (the later rank is the older ad at equal dates).
    const candidates = slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.size === 'boxed' || slot.size === 'small')
      .sort((a, b) =>
        a.slot.entry.date !== b.slot.entry.date
          ? (a.slot.entry.date < b.slot.entry.date ? -1 : 1)
          : b.index - a.index,
      );
    for (const { slot } of candidates) {
      if (need <= 0) break;
      slot.size = 'line';
      need -= 1;
    }
  }
  // Paginate: fourteen slots a page, hard cap — sizes run largest-first so a
  // page never splits a larger ad past a run of notices.
  const pages: AdSlot[][] = [];
  for (let i = 0; i < slots.length; i += CLASSIFIEDS_PAGE_SLOTS) {
    pages.push(slots.slice(i, i + CLASSIFIEDS_PAGE_SLOTS));
  }
  let truncated = false;
  if (pages.length > CLASSIFIEDS_MAX_PAGES) {
    const kept = pages.slice(0, CLASSIFIEDS_MAX_PAGES);
    pages.length = 0;
    pages.push(...kept);
    truncated = true;
  }
  return { pages, truncated };
}
