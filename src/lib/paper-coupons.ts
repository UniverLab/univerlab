// Page 2's clip-out coupons: one per standing Workbench offer, set like a
// period newspaper coupon with a dashed cut-here border, a large figure, a
// short condition line and a link. Every figure and condition is read from
// the Workbench copy already published (never retyped), so a price change
// never leaves the coupons out of date. One renderer for the edge, the
// client fallback and the markdown twin — like paper-ads.ts.

import { en } from '../i18n/en';
import { es } from '../i18n/es';

export type PaperCouponLang = 'en' | 'es';

type Dict = typeof en;

const dict = (lang: PaperCouponLang): Dict => (lang === 'es' ? es : en);

const today = (lang: PaperCouponLang): Dict['today'] => dict(lang).today;

const prefix = (lang: PaperCouponLang): string => (lang === 'es' ? '/es' : '');

const abs = (lang: PaperCouponLang): string =>
  lang === 'es' ? 'https://univerlab.org/es' : 'https://univerlab.org';

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The large figure of a coupon: the percentage, or Free/Gratis. */
function percentFigure(text: string): string {
  return text.match(/\d+\s*%/)?.[0] ?? '';
}

interface Coupon {
  figure: string;
  cond: string;
  href: string;
  link: string;
}

/** The four standing offers, in reading order: the free first call, then
 *  the three audit offers. All copy comes from the Workbench dictionary.
 *  A zero founding count drops the founding coupon; null keeps it, so a
 *  number the edge could not read never removes a live offer. */
function coupons(lang: PaperCouponLang, foundingLeft?: number | null): Coupon[] {
  const t = today(lang);
  const p = prefix(lang);
  const wb = dict(lang).workbench;
  const callPrice = wb.tags.items[0][1] ?? '';
  const call: Coupon = {
    figure: callPrice.split('·')[0]?.trim() ?? '',
    cond: wb.tags.items[0][3] ?? '',
    href: `${p}/workbench/`,
    link: t.ads.workbench.link,
  };
  const auditsHref = `${p}/workbench/audits/`;
  const auditsLink = t.ads.audits.link;
  const offers = wb.audits.offers;
  const founding: Coupon[] =
    foundingLeft === 0
      ? []
      : [{ figure: percentFigure(offers.founding.text), cond: offers.founding.text, href: auditsHref, link: auditsLink }];
  return [
    call,
    ...founding,
    { figure: percentFigure(offers.public.text), cond: offers.public.text, href: auditsHref, link: auditsLink },
    { figure: percentFigure(offers.reaudit.text), cond: offers.reaudit.text, href: auditsHref, link: auditsLink },
  ];
}

/** The no-stacking rule, printed once under the coupons. */
function noStack(lang: PaperCouponLang): string {
  const rules: ReadonlyArray<string> = dict(lang).workbench.audits.offers.rules;
  return rules.find((r) => /stack|acumulan/i.test(r)) ?? '';
}

/** Page 2's coupon band as HTML: everything between the heading and the
 *  logbook filters. */
export function paperCouponsHtml(lang: PaperCouponLang, foundingLeft?: number | null): string {
  const t = today(lang);
  const cut = t.labPage.coupons.cut;
  const cards = coupons(lang, foundingLeft)
    .map(
      (c) =>
        `<a class="coupon" href="${esc(c.href)}">` +
        `<span class="coupon-cut">✂ ${esc(cut)}</span>` +
        `<span class="coupon-figure">${esc(c.figure)}</span>` +
        `<span class="coupon-cond">${esc(c.cond)}</span>` +
        `<span class="coupon-link">${esc(c.link)}</span></a>`,
    )
    .join('');
  return (
    `<div class="coupon-band">` +
    `<p class="coupon-kicker">${esc(t.labPage.coupons.kicker)}</p>` +
    `<div class="coupon-grid">${cards}</div>` +
    `<p class="coupon-note">${esc(noStack(lang))}</p></div>`
  );
}

/** The twin's coupons: one plain italic line per coupon, then the rule. */
export function paperCouponsMarkdown(lang: PaperCouponLang, foundingLeft?: number | null): string {
  const b = abs(lang);
  const unprefixed = (href: string): string => href.replace(/^\/es\//, '/');
  const lines = coupons(lang, foundingLeft).map(
    (c) => `*✂ ${c.figure} — ${c.cond} — [${c.link}](${b}${unprefixed(c.href)})*`,
  );
  lines.push(noStack(lang));
  return lines.join('\n');
}
