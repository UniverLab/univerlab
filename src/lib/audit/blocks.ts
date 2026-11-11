// One renderer per v1 block type. Every string from the document is escaped
// (see ./util.ts); unknown block types render as nothing.
import {
  KNOWN_BLOCK_TYPES,
  type AuditBlock,
  type AuditDocument,
  type AuditFinding,
} from './types';
import { assetById, assetUrl, esc, proseRefs, safeExternalUrl } from './util';
import { iconSvg } from '../icon-svg';
import { copy } from '../icons';
import type { en } from '../../i18n/en';

export type AuditStrings = (typeof en)['audit'];

export interface BlockCtx {
  slug: string;
  doc: AuditDocument;
  t: AuditStrings;
  /** Position of the block being rendered, set by the section loop so
   *  heading blocks get stable `audit-h-<sec>-<i>` anchors. */
  sec: number;
  i: number;
  /** Entries already rendered in the document flow; the page renderer uses
   *  these to append only the findings/sources no block claimed. */
  renderedFindings?: Set<string>;
  renderedSources?: Set<string>;
}

const KNOWN = new Set<string>(KNOWN_BLOCK_TYPES as readonly string[]);

function wrap(type: string, span: unknown, inner: string): string {
  const n = typeof span === 'number' ? Math.min(4, Math.max(1, Math.floor(span))) : 0;
  return (
    `<div class="audit-block audit-block--${esc(type)}"` +
    (n > 0 ? ` style="--audit-span:${n}"` : '') +
    `>${inner}</div>`
  );
}

function backButton(t: AuditStrings): string {
  return `<button type="button" class="audit-back">${esc(t.back)}</button>`;
}

function costText(doc: AuditDocument, cost: { amount: number; currency: string }): string {
  try {
    return new Intl.NumberFormat(doc.meta.language, { style: 'currency', currency: cost.currency }).format(cost.amount);
  } catch {
    return `${cost.amount} ${cost.currency}`;
  }
}

function findingById(doc: AuditDocument, id: string): AuditFinding | null {
  return doc.findings.find((f) => f.id === id) ?? null;
}

function evidenceList(ctx: BlockCtx, f: AuditFinding): string {
  if (!f.evidence.length) return '';
  const items = f.evidence
    .map((e) => {
      if (e.type === 'source') {
        const s = ctx.doc.sources.find((x) => x.id === e.id);
        const label = s ? s.title : e.id;
        return s
          ? `<li><a class="audit-ref" href="#audit-source-${esc(e.id)}">${esc(label)}</a></li>`
          : `<li>${esc(label)}</li>`;
      }
      const a = assetById(ctx.doc, e.id);
      const label = a ? a.title : e.id;
      return a
        ? `<li><a href="${esc(assetUrl(ctx.slug, a.path))}">${esc(label)}</a></li>`
        : `<li>${esc(label)}</li>`;
    })
    .join('');
  return `<div class="audit-finding-evidence"><h4>${esc(ctx.t.finding.evidence)}</h4><ul>${items}</ul></div>`;
}

function findingCard(ctx: BlockCtx, f: AuditFinding): string {
  const { t } = ctx;
  const extra: string[] = [];
  extra.push(
    `<p>${esc(t.finding.recommendation)}: ${esc(f.recommendation)}</p>`,
    `<p>${esc(t.finding.effort)}: ${esc(t.effort[f.effort])}</p>`,
  );
  if (f.cost) extra.push(`<p>${esc(t.finding.cost)}: ${costText(ctx.doc, f.cost)}</p>`);
  if (f.fixedIn) extra.push(`<p>${esc(t.finding.fixedIn)}: ${esc(f.fixedIn)}</p>`);
  return (
    `<article class="audit-finding" id="audit-finding-${esc(f.id)}" ` +
    `data-severity="${esc(f.severity)}" data-status="${esc(f.status)}">` +
    `<p class="audit-finding-badges"><span class="audit-sev audit-sev--${esc(f.severity)}">` +
    `${esc(t.severity[f.severity])}</span> ` +
    `<span class="audit-status audit-status--${esc(f.status)}">${esc(t.findingStatus[f.status])}</span></p>` +
    `<h3>${esc(f.title)}</h3>` +
    `<p class="audit-finding-area">${esc(f.area)} · ${esc(String(f.likelihood))}×${esc(String(f.impact))}</p>` +
    `<p>${esc(f.summary)}</p>` +
    evidenceList(ctx, f) +
    extra.join('') +
    backButton(t) +
    `</article>`
  );
}

function findingsTable(ctx: BlockCtx, b: { severity?: string[]; status?: string[] }): string {
  const { t, doc } = ctx;
  const sevActive = [...new Set(b.severity ?? [])];
  const stActive = [...new Set(b.status ?? [])];
  const sevPreset = sevActive.length ? sevActive : ['all'];
  const stPreset = stActive.length ? stActive : ['all'];
  const sevMatch = (v: string): boolean => sevPreset.includes('all') || sevPreset.includes(v);
  const stMatch = (v: string): boolean => stPreset.includes('all') || stPreset.includes(v);
  const sevBtns = ['all', 'critical', 'high', 'medium', 'low', 'info']
    .map(
      (s) =>
        `<button type="button" data-sev="${esc(s)}"${sevPreset.includes(s) ? ' aria-pressed="true"' : ''}>` +
        `${esc(s === 'all' ? t.filters.all : t.severity[s as keyof typeof t.severity])}</button>`,
    )
    .join('');
  const stBtns = ['all', 'open', 'fixed', 'accepted', 'wont-fix']
    .map(
      (s) =>
        `<button type="button" data-status="${esc(s)}"${stPreset.includes(s) ? ' aria-pressed="true"' : ''}>` +
        `${esc(s === 'all' ? t.filters.all : t.findingStatus[s as keyof typeof t.findingStatus])}</button>`,
    )
    .join('');
  const rows = doc.findings
    .map((f) => {
      const hidden = sevMatch(f.severity) && stMatch(f.status) ? '' : ' hidden';
      return (
        `<tr data-severity="${esc(f.severity)}" data-status="${esc(f.status)}"${hidden}>` +
        `<td><a class="audit-ref" href="#audit-finding-${esc(f.id)}">${esc(f.title)}</a></td>` +
        `<td><span class="audit-sev audit-sev--${esc(f.severity)}">${esc(t.severity[f.severity])}</span></td>` +
        `<td>${esc(t.findingStatus[f.status])}</td>` +
        `<td>${esc(f.area)}</td></tr>`
      );
    })
    .join('');
  return (
    `<div class="audit-findingsTable" data-sev="${esc(sevPreset.join(','))}" data-status="${esc(stPreset.join(','))}">` +
    `<div class="audit-filters" role="group" aria-label="${esc(t.filters.severity)}">${sevBtns}</div>` +
    `<div class="audit-filters" role="group" aria-label="${esc(t.filters.status)}">${stBtns}</div>` +
    `<table><thead><tr><th>${esc(t.findings)}</th><th>${esc(t.filters.severity)}</th>` +
    `<th>${esc(t.filters.status)}</th><th>·</th></tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

function riskMatrix(ctx: BlockCtx, title?: string): string {
  let grid = '';
  for (let impact = 5; impact >= 1; impact--) {
    let row = '';
    for (let likelihood = 1; likelihood <= 5; likelihood++) {
      const here = ctx.doc.findings.filter(
        (f) => f.likelihood === likelihood && f.impact === impact,
      );
      row +=
        `<td>${here.map((f) => `<a class="audit-ref" href="#audit-finding-${esc(f.id)}">${esc(f.id)}</a>`).join(' ')}</td>`;
    }
    grid += `<tr><th scope="row">${impact}</th>${row}</tr>`;
  }
  return (
    `<figure class="audit-riskMatrix">` +
    (title ? `<figcaption>${esc(title)}</figcaption>` : '') +
    `<table><thead><tr><th>×</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr></thead>` +
    `<tbody>${grid}</tbody></table></figure>`
  );
}

function chart(ctx: BlockCtx, b: { spec?: Record<string, unknown>; dataAsset?: string; caption?: string }): string {
  let dataUrl = '';
  if (typeof b.dataAsset === 'string' && b.dataAsset !== '') {
    const a = assetById(ctx.doc, b.dataAsset);
    if (a) dataUrl = assetUrl(ctx.slug, a.path);
  }
  const spec = b.spec ?? {};
  return (
    `<figure class="audit-chart" data-spec="${esc(JSON.stringify(spec))}"` +
    (dataUrl ? ` data-url="${esc(dataUrl)}"` : '') +
    `><div class="audit-chart-mount"></div>` +
    (b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : '') +
    `<noscript><p>${esc(ctx.t.chartFallback)}</p></noscript></figure>`
  );
}

function figure(ctx: BlockCtx, b: { asset: string; caption?: string; poster?: string }): string {
  const a = typeof b.asset === 'string' ? assetById(ctx.doc, b.asset) : null;
  if (!a) return '';
  const url = assetUrl(ctx.slug, a.path);
  let media = '';
  if (a.kind === 'image') {
    media = `<img src="${esc(url)}" alt="${esc(a.alt ?? a.title)}" loading="lazy">`;
  } else if (a.kind === 'video') {
    let poster = '';
    if (typeof b.poster === 'string' && b.poster !== '') {
      const p = assetById(ctx.doc, b.poster);
      if (p?.kind === 'image') poster = ` poster="${esc(assetUrl(ctx.slug, p.path))}"`;
    }
    media =
      `<video controls preload="metadata" loop muted playsinline data-autoplay${poster}>` +
      `<source src="${esc(url)}"></video>`;
  } else if (a.kind === 'audio') {
    media = `<audio controls preload="metadata" src="${esc(url)}"></audio>`;
  } else {
    media = `<a href="${esc(url)}">${esc(a.title)}</a>`;
  }
  return (
    `<figure class="audit-figure">${media}` +
    (b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : '') +
    `</figure>`
  );
}

function code(ctx: BlockCtx, b: { language: string; source?: string; sourceAsset?: string; highlight?: number[] }): string {
  const hl = Array.isArray(b.highlight) ? b.highlight.filter((n) => Number.isInteger(n) && n >= 1) : [];
  const hlAttr = hl.length ? ` data-highlight="${esc(hl.join(','))}"` : '';
  if (typeof b.sourceAsset === 'string' && b.sourceAsset !== '') {
    const a = assetById(ctx.doc, b.sourceAsset);
    if (!a) return '';
    return (
      `<figure class="audit-code"><button type="button" class="audit-code-copy" aria-label="${esc(ctx.t.codeCopy)}" title="${esc(ctx.t.codeCopy)}">` +
      `<span class="copy-icon">${iconSvg(copy, { size: 16 })}</span></button>` +
      `<pre><code data-lang="${esc(b.language)}" data-src="${esc(assetUrl(ctx.slug, a.path))}"${hlAttr}></code></pre></figure>`
    );
  }
  const src = typeof b.source === 'string' ? b.source : '';
  return (
    `<figure class="audit-code"><button type="button" class="audit-code-copy" aria-label="${esc(ctx.t.codeCopy)}" title="${esc(ctx.t.codeCopy)}">` +
    `<span class="copy-icon">${iconSvg(copy, { size: 16 })}</span></button>` +
    `<pre><code data-lang="${esc(b.language)}" data-inline="${esc(src)}"${hlAttr}>${esc(src)}</code></pre></figure>`
  );
}

function stepper(ctx: BlockCtx, steps: { title: string; markdown: string }[]): string {
  const items = steps
    .map(
      (s, i) =>
        `<div class="audit-step">` +
        `<button type="button" class="audit-step-btn" aria-expanded="${i === 0 ? 'true' : 'false'}">` +
        `${esc(ctx.t.showStep).replace('{n}', esc(String(i + 1)))}: ${esc(s.title)}</button>` +
        `<div class="audit-step-body"${i > 0 ? ' hidden' : ''}>${proseRefs(s.markdown, ctx)}</div></div>`,
    )
    .join('');
  return `<div class="audit-stepper">${items}</div>`;
}

function sources(ctx: BlockCtx, ids: string[]): string {
  const seen = new Set<string>();
  const fresh = ids.filter((id) => {
    if (seen.has(id) || ctx.renderedSources?.has(id)) return false;
    seen.add(id);
    if (!ctx.doc.sources.some((s) => s.id === id)) return false;
    ctx.renderedSources?.add(id);
    return true;
  });
  const items = fresh
    .map((id) => {
      const s = ctx.doc.sources.find((x) => x.id === id);
      if (!s) return '';
      const url = typeof s.url === 'string' ? safeExternalUrl(s.url) : null;
      const link = url
        ? ` <a href="${esc(url)}" rel="noopener noreferrer">${esc(url)}</a>`
        : typeof s.url === 'string' && s.url !== ''
          ? ` <span>${esc(s.url)}</span>`
          : '';
      const pub = s.publisher ? ` · ${esc(s.publisher)}` : '';
      const acc = s.accessed ? ` · ${esc(s.accessed)}` : '';
      return (
        `<li id="audit-source-${esc(id)}"><span>${esc(s.title)}</span>${pub}${acc}${link} ` +
        backButton(ctx.t) +
        `</li>`
      );
    })
    .join('');
  if (!items) return '';
  return `<div class="audit-sources"><h3>${esc(ctx.t.sources)}</h3><ol>${items}</ol></div>`;
}

export function findingEntryHtml(ctx: BlockCtx, f: AuditFinding): string {
  return findingCard(ctx, f);
}

export function sourcesEntriesHtml(ctx: BlockCtx, ids: string[]): string {
  return sources(ctx, ids);
}

export function renderBlock(b: AuditBlock, ctx: BlockCtx): string {
  if (!b || typeof b.type !== 'string' || !KNOWN.has(b.type)) return '';
  const span = (b as { span?: unknown }).span;
  switch (b.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Math.floor((b as { level?: unknown }).level as number) || 2));
      const hid = `audit-h-${ctx.sec}-${ctx.i}`;
      return wrap(b.type, span, `<h${level} id="${hid}">${esc(String((b as { text?: unknown }).text ?? ''))}</h${level}>`);
    }
    case 'prose':
      return wrap(b.type, span, proseRefs(String((b as { markdown?: unknown }).markdown ?? ''), ctx));
    case 'callout': {
      const tone = String((b as { tone?: unknown }).tone ?? 'info');
      const title = (b as { title?: unknown }).title;
      return wrap(
        b.type,
        span,
        `<aside class="audit-callout audit-callout--${esc(tone)}">` +
          (typeof title === 'string' && title !== '' ? `<p class="audit-callout-title">${esc(title)}</p>` : '') +
          proseRefs(String((b as { markdown?: unknown }).markdown ?? ''), ctx) +
          `</aside>`,
      );
    }
    case 'stats': {
      const items = ((b as { items?: unknown }).items ?? []) as { value?: unknown; label?: unknown; delta?: unknown }[];
      return wrap(
        b.type,
        span,
        `<dl class="audit-stats">${items.map((it) => `<div><dt>${esc(String(it.label ?? ''))}</dt><dd>${esc(String(it.value ?? ''))}` +
          (typeof it.delta === 'string' && it.delta !== '' ? ` <span class="audit-stat-delta">${esc(it.delta)}</span>` : '') +
          `</dd></div>`).join('')}</dl>`,
      );
    }
    case 'finding': {
      const f = findingById(ctx.doc, String((b as { findingId?: unknown }).findingId ?? ''));
      if (!f) return '';
      if (ctx.renderedFindings?.has(f.id)) return '';
      ctx.renderedFindings?.add(f.id);
      return wrap(b.type, span, findingCard(ctx, f));
    }
    case 'findingsTable':
      return wrap(b.type, span, findingsTable(ctx, b as { severity?: string[]; status?: string[] }));
    case 'riskMatrix':
      return wrap(b.type, span, riskMatrix(ctx, (b as { title?: unknown }).title as string | undefined));
    case 'chart':
      return wrap(b.type, span, chart(ctx, b as { spec?: Record<string, unknown>; dataAsset?: string; caption?: string }));
    case 'figure':
      return wrap(b.type, span, figure(ctx, b as { asset: string; caption?: string; poster?: string }));
    case 'diagram': {
      const mermaid = String((b as { mermaid?: unknown }).mermaid ?? '');
      const caption = (b as { caption?: unknown }).caption;
      return wrap(
        b.type,
        span,
        `<figure class="audit-diagram" data-mermaid="${esc(mermaid)}">` +
          `<div class="audit-diagram-mount"></div>` +
          (typeof caption === 'string' && caption !== '' ? `<figcaption>${esc(caption)}</figcaption>` : '') +
          `</figure>`,
      );
    }
    case 'code':
      return wrap(b.type, span, code(ctx, b as { language: string; source?: string; sourceAsset?: string; highlight?: number[] }));
    case 'quote': {
      const text = String((b as { text?: unknown }).text ?? '');
      const attr = (b as { attribution?: unknown }).attribution;
      const sourceId = (b as { sourceId?: unknown }).sourceId;
      let cite = '';
      if (typeof attr === 'string' && attr !== '') cite = esc(attr);
      if (typeof sourceId === 'string' && sourceId !== '') {
        const s = ctx.doc.sources.find((x) => x.id === sourceId);
        if (s) {
          const inner = cite !== '' ? cite : esc(s.title);
          cite = `<a class="audit-ref" href="#audit-source-${esc(sourceId)}">${inner}</a>`;
        } else if (cite === '') {
          cite = esc(sourceId);
        }
      }
      return wrap(
        b.type,
        span,
        `<blockquote><p>${esc(text)}</p>${cite !== '' ? `<cite>${cite}</cite>` : ''}</blockquote>`,
      );
    }
    case 'table': {
      const columns = ((b as { columns?: unknown }).columns ?? []) as unknown[];
      const rows = ((b as { rows?: unknown }).rows ?? []) as unknown[][];
      const caption = (b as { caption?: unknown }).caption;
      return wrap(
        b.type,
        span,
        `<figure class="audit-table"><table>` +
          (typeof caption === 'string' && caption !== '' ? `<caption>${esc(caption)}</caption>` : '') +
          `<thead><tr>${columns.map((c) => `<th>${esc(String(c))}</th>`).join('')}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${(Array.isArray(r) ? r : []).map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>` +
          `</table></figure>`,
      );
    }
    case 'timeline': {
      const steps = ((b as { steps?: unknown }).steps ?? []) as { title?: unknown; description?: unknown; effort?: unknown; cost?: { amount: number; currency: string } }[];
      return wrap(
        b.type,
        span,
        `<ol class="audit-timeline">${steps.map((s) => `<li><p class="audit-timeline-title">${esc(String(s.title ?? ''))}</p>` +
          (typeof s.description === 'string' && s.description !== '' ? `<p>${esc(s.description)}</p>` : '') +
          (typeof s.effort === 'string' && s.effort !== '' ? `<p>${esc(ctx.t.finding.effort)}: ${esc(ctx.t.effort[s.effort as keyof typeof ctx.t.effort] ?? s.effort)}</p>` : '') +
          (s.cost ? `<p>${esc(ctx.t.finding.cost)}: ${costText(ctx.doc, s.cost)}</p>` : '') +
          `</li>`).join('')}</ol>`,
      );
    }
    case 'stepper':
      return wrap(b.type, span, stepper(ctx, ((b as { steps?: unknown }).steps ?? []) as { title: string; markdown: string }[]));
    case 'compare': {
      const before = String((b as { before?: unknown }).before ?? '');
      const after = String((b as { after?: unknown }).after ?? '');
      const caption = (b as { caption?: unknown }).caption;
      return wrap(
        b.type,
        span,
        `<figure class="audit-compare"><div>${proseRefs(before, ctx)}</div><div>${proseRefs(after, ctx)}</div>` +
          (typeof caption === 'string' && caption !== '' ? `<figcaption>${esc(caption)}</figcaption>` : '') +
          `</figure>`,
      );
    }
    case 'assetCard': {
      const a = typeof (b as { asset?: unknown }).asset === 'string' ? assetById(ctx.doc, (b as { asset: string }).asset) : null;
      if (!a) return '';
      const desc = (b as { description?: unknown }).description;
      return wrap(
        b.type,
        span,
        `<div class="audit-assetCard"><p class="audit-assetCard-title">${esc(a.title)}</p>` +
          (typeof desc === 'string' && desc !== '' ? `<p>${esc(desc)}</p>` : '') +
          `<a href="${esc(assetUrl(ctx.slug, a.path))}">${esc(a.title)}</a></div>`,
      );
    }
    case 'sources':
      return wrap(b.type, span, sources(ctx, (((b as { ids?: unknown }).ids ?? []) as unknown[]).map(String)));
    case 'divider': {
      const label = (b as { label?: unknown }).label;
      return wrap(
        b.type,
        span,
        typeof label === 'string' && label !== ''
          ? `<div class="audit-divider" role="separator">${esc(label)}</div>`
          : `<hr class="audit-divider">`,
      );
    }
    default:
      return '';
  }
}
