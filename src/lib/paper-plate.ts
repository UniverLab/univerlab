// The sundial engraving, set among the paper's columns like an old plate
// instead of above the masthead. The day plate's paper was keyed to
// transparent, so it sits on both the sepia day paper and the grey night
// paper without an edge.

import { en } from '../i18n/en';
import { es } from '../i18n/es';
import type { FilterLang } from './science-filter';

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The plate figure: the day postcard's desktop crops, lazy, with the
 *  paper's caption line under it. */
export function labPlateHtml(lang: FilterLang): string {
  const t = (lang === 'es' ? es : en).today;
  const alt = (lang === 'es' ? es : en).postcards.status;
  const img = (ext: 'avif' | 'webp'): string =>
    `/bench/postcards/status-day-1600.${ext} 1600w, /bench/postcards/status-day-800.${ext} 800w`;
  return (
    `<figure class="photo paper-plate"><div class="print">` +
    `<picture>` +
    `<source srcset="${img('avif')}" sizes="(min-width: 48rem) 20rem, 100vw" type="image/avif">` +
    `<source srcset="${img('webp')}" sizes="(min-width: 48rem) 20rem, 100vw" type="image/webp">` +
    `<img src="/bench/postcards/status-day-800.webp" alt="${esc(alt)}" width="1600" height="900" loading="lazy">` +
    `</picture></div><figcaption>${esc(t.labPlate)}</figcaption></figure>`
  );
}

export function paperPlateHtml(lang: FilterLang): string {
  const t = (lang === 'es' ? es : en).today;
  const alt = (lang === 'es' ? es : en).postcards.today;
  const img = (ext: 'avif' | 'webp'): string =>
    `/bench/postcards/today-day-1600.${ext} 1600w, /bench/postcards/today-day-800.${ext} 800w`;
  return (
    `<figure class="photo paper-plate"><div class="print">` +
    `<picture>` +
    `<source srcset="${img('avif')}" sizes="(min-width: 48rem) 20rem, 100vw" type="image/avif">` +
    `<source srcset="${img('webp')}" sizes="(min-width: 48rem) 20rem, 100vw" type="image/webp">` +
    `<img src="/bench/postcards/today-day-800.webp" alt="${esc(alt)}" width="1600" height="900" loading="lazy">` +
    `</picture></div><figcaption>${esc(t.plate)}</figcaption></figure>`
  );
}
