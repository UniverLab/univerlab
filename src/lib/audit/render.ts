// The audit page: cover, deliverables, table of contents and one section
// per layout type. Rendered at the edge into the static `/audits/` shell
// (functions/_middleware.ts) from the validated R2 document.
import { en } from '../../i18n/en';
import { es } from '../../i18n/es';
import { findingEntryHtml, renderBlock, sourcesEntriesHtml, type BlockCtx } from './blocks';
import { assetById, assetUrl, esc, safeExternalUrl } from './util';
import { auditBadge, badgeExpired, badgeLinkLabel, badgeSnippet, badgeValidUntil } from './badge';
import { PUBLIC_AUDIT_BASE } from './markdown';
import type { AuditDocument, AuditLayout, AuditSection } from './types';

export interface PublishedAuditLinks {
  /** Slug of the previous audit of the same system, when it is public. */
  previous: string | null;
  /** Slugs of later audits of the same system that are public. */
  next: string[];
}

export interface AuditPageOptions {
  /** Route base for asset URLs: `/audits` private, `/workbench/audits` public. */
  assetBase?: string;
  /** When set, the audit renders as a published audit with its dates,
   *  history links and client badge snippet. */
  published?: PublishedAuditLinks;
}

function dictOf(doc: AuditDocument): BlockCtx['t'] {
  return (doc.meta.language === 'es' ? es.audit : en.audit) as BlockCtx['t'];
}

function layoutClasses(layout: AuditLayout): string {
  let cls = `audit-layout audit-layout--${esc(layout.type)}`;
  if (layout.ratio) cls += ` audit-layout--ratio-${esc(layout.ratio)}`;
  if (typeof layout.columns === 'number') cls += ` audit-layout--cols-${layout.columns}`;
  return cls;
}

function layoutClass(sec: AuditSection): string {
  return layoutClasses(sec.layout);
}

function personHtml(name: string, url?: string): string {
  const label = esc(name);
  const safe = typeof url === 'string' ? safeExternalUrl(url) : null;
  return safe ? `<a href="${esc(safe)}" rel="noopener noreferrer">${label}</a>` : label;
}

function coverHtml(doc: AuditDocument, slug: string, t: BlockCtx['t'], base: string): string {
  const m = doc.meta;
  const auditors = m.auditors.map((a) => personHtml(a.name, a.url)).join(', ');
  const client = personHtml(m.client.name, m.client.url);
  let bgClass = '';
  let bgAttr = '';
  let bgMedia = '';
  const background = doc.cover.background;
  if (background) {
    const asset = assetById(doc, background);
    if (asset?.kind === 'image') {
      bgClass = ' audit-cover--bg-image';
      bgAttr = ` style="background-image:url(&quot;${assetUrl(slug, asset.path, base)}&quot;)"`;
    } else if (asset?.kind === 'video') {
      bgMedia =
        `<video class="audit-cover-bg" muted loop playsinline preload="metadata" data-autoplay aria-hidden="true">` +
        `<source src="${esc(assetUrl(slug, asset.path, base))}"></video>`;
    } else if (!asset) {
      bgClass = ` audit-cover-bg--${esc(background)}`;
    }
  }
  return (
    `<header class="audit-cover ${layoutClasses(doc.cover.layout)}${bgClass}"${bgAttr}>` +
    bgMedia +
    `<p class="audit-kicker">${esc(m.version)} · ${esc(t.status[m.status])}</p>` +
    `<h1>${esc(m.title)}</h1>` +
    (m.subtitle ? `<p class="audit-subtitle">${esc(m.subtitle)}</p>` : '') +
    `<dl class="audit-meta">` +
    `<div><dt>${esc(t.meta.client)}</dt><dd>${client}</dd></div>` +
    `<div><dt>${esc(t.meta.auditors)}</dt><dd>${auditors}</dd></div>` +
    `<div><dt>${esc(t.meta.period)}</dt><dd>${esc(m.auditPeriod.start)} – ${esc(m.auditPeriod.end)}</dd></div>` +
    `<div><dt>${esc(t.meta.version)}</dt><dd>${esc(m.version)}</dd></div>` +
    `<div><dt>${esc(t.meta.status)}</dt><dd>${esc(t.status[m.status])}</dd></div>` +
    `</dl>` +
    `<p class="audit-scope">${esc(m.scope)}</p>` +
    `<span class="audit-slug" hidden>${esc(slug)}</span>` +
    `</header>`
  );
}

function deliverablesHtml(doc: AuditDocument, slug: string, t: BlockCtx['t'], base: string): string {
  const cards: string[] = [];
  const report = doc.deliverables.report ? assetById(doc, doc.deliverables.report) : null;
  if (report) {
    cards.push(
      `<div class="audit-deliverable"><p>${esc(report.title)}</p>` +
        `<a href="${esc(assetUrl(slug, report.path, base))}">${esc(t.downloadPdf)}</a></div>`,
    );
  }
  const bundle = doc.deliverables.bundle ? assetById(doc, doc.deliverables.bundle) : null;
  if (bundle) {
    cards.push(
      `<div class="audit-deliverable"><p>${esc(bundle.title)}</p>` +
        `<a href="${esc(assetUrl(slug, bundle.path, base))}">${esc(t.downloadBundle)}</a></div>`,
    );
  }
  if (!cards.length) return '';
  return `<section class="audit-deliverables" aria-label="${esc(t.deliverables)}"><h2>${esc(t.deliverables)}</h2>${cards.join('')}</section>`;
}

function tocHtml(doc: AuditDocument, t: BlockCtx['t']): string {
  const items = doc.sections
    .map(
      (s) =>
        `<li><a href="#audit-sec-${esc(s.id)}">${esc(s.navLabel || s.title)}</a></li>`,
    )
    .join('');
  return `<nav class="audit-toc" aria-label="${esc(t.contents)}"><h2>${esc(t.contents)}</h2><ol>${items}</ol></nav>`;
}

function asideHtml(sec: AuditSection, si: number): string {
  const links = sec.blocks
    .map((b, bi) => {
      if (!b || b.type !== 'heading') return '';
      const text = String((b as { text?: unknown }).text ?? '');
      if (text === '') return '';
      return `<li><a href="#audit-h-${si}-${bi}">${esc(text)}</a></li>`;
    })
    .join('');
  if (!links) return '';
  return `<aside class="audit-aside"><ol>${links}</ol></aside>`;
}

function sectionHtml(doc: AuditDocument, sec: AuditSection, si: number, ctx: BlockCtx): string {
  ctx.sec = si;
  const blocks = sec.blocks
    .map((b, bi) => {
      ctx.i = bi;
      return renderBlock(b, ctx);
    })
    .join('');
  const aside = sec.layout.type === 'sidebar' ? asideHtml(sec, si) : '';
  return (
    `<section id="audit-sec-${esc(sec.id)}" class="${layoutClass(sec)}">` +
    `<h2 class="audit-sec-title">${esc(sec.title)}</h2>` +
    `<div class="audit-sec-body">${blocks}${aside}</div>` +
    `</section>`
  );
}

/** The published-audit block, right after the cover: the audit date and its
 *  validity, links to earlier and later audits of the same system, and the
 *  badge with the copyable snippet for the client's own site. */
function publishedHtml(
  doc: AuditDocument,
  slug: string,
  t: BlockCtx['t'],
  links: PublishedAuditLinks,
  now: Date,
): string {
  const badge = doc.badge;
  if (!badge) return '';
  const expired = badgeExpired(badge, now);
  const dates =
    `<dl class="audit-published-dates">` +
    `<div><dt>${esc(t.published.issued)}</dt><dd>${esc(badge.issued)}</dd></div>` +
    `<div><dt>${esc(t.published.validUntil)}</dt><dd>${esc(badgeValidUntil(badge))}</dd></div>` +
    `</dl>` +
    (expired ? `<p class="audit-published-expired">${esc(t.published.expired)}</p>` : '');
  const history: string[] = [];
  if (links.previous) {
    history.push(
      `<a class="audit-history-prev" href="${esc(`${PUBLIC_AUDIT_BASE}/${links.previous}/`)}">${esc(t.published.previous)}</a>`,
    );
  }
  for (const next of links.next) {
    history.push(
      `<a class="audit-history-next" href="${esc(`${PUBLIC_AUDIT_BASE}/${next}/`)}">${esc(t.published.next)}</a>`,
    );
  }
  const historyHtml = history.length ? `<nav class="audit-history">${history.join('')}</nav>` : '';
  const snippet = badgeSnippet(doc, slug, 'https://univerlab.org');
  return (
    `<section class="audit-published" aria-label="${esc(badgeLinkLabel(doc))}">` +
    dates +
    historyHtml +
    `<h2>${esc(t.badge.title)}</h2>` +
    `<p class="audit-badge">${auditBadge(doc, slug, '')}</p>` +
    `<pre class="audit-badge-snippet"><code>${esc(snippet)}</code></pre>` +
    `<button type="button" class="audit-badge-copy" data-snippet="${esc(snippet)}">${esc(t.badge.copy)}</button>` +
    `</section>`
  );
}

export function auditPageHtml(doc: AuditDocument, slug: string, opts: AuditPageOptions = {}): string {
  const t = dictOf(doc);
  const lang = doc.meta.language;
  const accent = doc.accent ?? 'lab';
  const base = opts.assetBase ?? '/audits';
  const ctx: BlockCtx = {
    slug,
    doc,
    t,
    assetBase: opts.assetBase,
    sec: 0,
    i: 0,
    renderedFindings: new Set<string>(),
    renderedSources: new Set<string>(),
  };
  const data = JSON.stringify({ slug, lang }).replace(/</g, '\\u003c');
  const sectionsHtml = doc.sections.map((s, si) => sectionHtml(doc, s, si, ctx)).join('');
  const missingFindings = doc.findings.filter((f) => !ctx.renderedFindings?.has(f.id));
  const missingSources = doc.sources.map((s) => s.id).filter((id) => !ctx.renderedSources?.has(id));
  const findingsEntries = missingFindings.length
    ? `<section class="audit-auto-findings" aria-label="${esc(t.findings)}"><h2>${esc(t.findings)}</h2>` +
      missingFindings.map((f) => findingEntryHtml(ctx, f)).join('') +
      `</section>`
    : '';
  const sourceEntries = missingSources.length
    ? `<section class="audit-auto-sources">${sourcesEntriesHtml(ctx, missingSources)}</section>`
    : '';
  const published = opts.published
    ? publishedHtml(doc, slug, t, opts.published, new Date())
    : '';
  return (
    `<div class="audit audit-accent--${esc(accent)}">` +
    `<script type="application/json" id="audit-data">${data}</script>` +
    coverHtml(doc, slug, t, base) +
    published +
    deliverablesHtml(doc, slug, t, base) +
    tocHtml(doc, t) +
    sectionsHtml +
    findingsEntries +
    sourceEntries +
    `</div>`
  );
}
