// The classifieds layout: the lab's announcements composed as a newspaper
// classifieds section in four ad sizes, across at most two pages.
//
// Pure by design: no i18n, no DOM. The edge (functions/_middleware.ts), the
// client fallback (src/lib/lab-page-client.ts) and the tests all read the
// same rule, so the same entries always produce the same layout.
//
// The rule is space, never a fixed count: each classifieds page holds
// CLASSIFIEDS_PAGE_BUDGET units of space (coupons reserve part of it), and
// each ad size costs CLASSIFIEDS_SIZE_COST units. Entries are ranked by type
// weight (launch/deploy first, then incident, then update/bugfix, then note)
// with newer entries ahead of older ones at equal weight. The single
// highest-ranked entry takes the one display ad on the first classifieds
// page; every later entry steps down (boxed, then small, then line) to
// whatever fits the space that is left. When a page cannot fit even a
// one-line notice for the next entry, the page closes and the entry stays
// for the next page; whatever still overflows past the second page is left
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

/** Space units per classifieds page (paper pages 2 and 3): the fixed sheet. */
export const CLASSIFIEDS_PAGE_BUDGET = 146;

/** Space units one coupon ad reserves on its page. */
export const CLASSIFIEDS_COUPON_COST = 9;

/** Space units each ad size costs: roughly the old sheet's fill. */
export const CLASSIFIEDS_SIZE_COST: Record<AdSize, number> = {
  display: 24,
  boxed: 9,
  small: 4,
  line: 2,
};

/** The classifieds never run past paper page 3. */
export const CLASSIFIEDS_MAX_PAGES = 2;

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

/** Compose at most two pages from the entries, filling each page by
 *  available space. `couponCount` reserves coupon space the same way
 *  classifiedsHtml splits the coupons: the first half rides the first
 *  page, the rest the second. With fewer entries there is one page; with
 *  none, no pages. Only the highest-ranked entry may take the display ad;
 *  every later entry takes the largest size that fits what is left. */
export function layoutClassifieds(entries: Entry[], couponCount = 0): ClassifiedLayout {
  const ranked = rankEntries(entries || []);
  if (!ranked.length) return { pages: [], truncated: false };
  const count = Math.max(0, Math.floor(couponCount) || 0);
  const half = Math.ceil(count / 2);
  const reserved = [half * CLASSIFIEDS_COUPON_COST, (count - half) * CLASSIFIEDS_COUPON_COST];
  const pages: AdSlot[][] = [];
  let i = 0;
  for (let p = 0; p < CLASSIFIEDS_MAX_PAGES && i < ranked.length; p += 1) {
    let remaining = CLASSIFIEDS_PAGE_BUDGET - reserved[p];
    const page: AdSlot[] = [];
    while (i < ranked.length) {
      const allowed: AdSize[] =
        i === 0 ? ['display', 'boxed', 'small', 'line'] : ['boxed', 'small', 'line'];
      const size = allowed.find((s) => CLASSIFIEDS_SIZE_COST[s] <= remaining);
      if (!size) break;
      page.push({ entry: ranked[i], size });
      remaining -= CLASSIFIEDS_SIZE_COST[size];
      i += 1;
    }
    pages.push(page);
  }
  return { pages, truncated: i < ranked.length };
}
