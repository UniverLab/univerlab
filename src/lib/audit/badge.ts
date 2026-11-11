// The public-audit badge: a small SVG in the site's style plus the HTML
// snippet clients paste on their own site. The badge attests an audit of a
// stated scope on a stated date — never certification, security or a
// guarantee — and its date is how readers judge how current the audit is.
import { esc } from './escape';
import type { AuditBadge, AuditDocument } from './types';

const ES_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** End of the badge validity: the explicit date, or 12 months after issue. */
export function badgeValidUntil(badge: AuditBadge): string {
  if (badge.validUntil) return badge.validUntil;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(badge.issued);
  if (!m) return badge.issued;
  const year = parseInt(m[1], 10) + 1;
  return `${year}-${m[2]}-${m[3]}`;
}

/** Whether `now` is past the badge validity (date granularity). */
export function badgeExpired(badge: AuditBadge, now: Date = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  return today > badgeValidUntil(badge);
}

function monthYear(issued: string, lang: 'es' | 'en'): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(issued);
  if (!m) return issued;
  const months = lang === 'es' ? ES_MONTHS : EN_MONTHS;
  const name = months[parseInt(m[2], 10) - 1];
  if (!name) return issued;
  return `${name} ${m[1]}`;
}

/** The badge line: who, when and what scope — plus, past its validity, how
 *  long ago, with no other state change. */
export function badgeText(doc: AuditDocument, now: Date = new Date()): string {
  const lang = doc.meta.language;
  const badge = doc.badge;
  if (!badge) return '';
  const lead = lang === 'es' ? 'Auditado por UniverLab' : 'Audited by UniverLab';
  const base = `${lead} · ${monthYear(badge.issued, lang)} · ${badge.scope}`;
  if (!badgeExpired(badge, now)) return base;
  return `${base} · ${lang === 'es' ? 'hace más de 12 meses' : 'over 12 months ago'}`;
}

/** Accessible name of the badge link: who did the audit, nothing more. */
export function badgeLinkLabel(doc: AuditDocument): string {
  return doc.meta.language === 'es' ? 'Auditado por UniverLab' : 'Audited by UniverLab';
}

/** The badge SVG: dark, 640×32, escaped. When opened directly it links to
 *  the published audit; embedded via `<img>` it is inert, as badges are. */
export function auditBadge(doc: AuditDocument, slug: string, origin: string, now: Date = new Date()): string {
  const text = badgeText(doc, now);
  const url = `${origin}/workbench/audits/${slug}/`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="32" viewBox="0 0 640 32" role="img" aria-label="${esc(text)}">` +
    `<rect width="640" height="32" rx="6" fill="#1a1a2e"/>` +
    `<a href="${esc(url)}"><text x="320" y="21" text-anchor="middle" font-family="monospace" font-size="14" fill="#e8e6df">${esc(text)}</text></a>` +
    `</svg>`
  );
}

/** The snippet the published audit page hands the client: an ordinary link
 *  to the audit carrying the badge image, named only «Auditado por
 *  UniverLab» — no keyword-stuffed anchor. Absolute URLs: it lives on the
 *  client's own site. */
export function badgeSnippet(doc: AuditDocument, slug: string, origin: string): string {
  const url = `${origin}/workbench/audits/${slug}/`;
  const label = badgeLinkLabel(doc);
  return (
    `<a href="${esc(url)}" aria-label="${esc(label)}">` +
    `<img src="${esc(url)}badge.svg" alt="">` +
    `</a>`
  );
}
