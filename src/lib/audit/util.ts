// Shared audit rendering helpers: escaping, safe markdown, asset URLs and
// the inline prose references (`{{finding:F-01}}`, `{{source:id}}`,
// `{{term:word}}`, `{{asset:id}}`, `{{annex:id}}`) the renderer makes
// interactive.
import { marked } from 'marked';
import { PROSE_REF, type AuditAnnex, type AuditAsset, type AuditDocument } from './types';
import { esc } from './escape';

export { esc };

const URI_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** Absolute links the renderer will emit for document-supplied URLs. */
export function safeExternalUrl(url: string): string | null {
  const u = url.trim();
  return /^https?:\/\//i.test(u) || /^mailto:/i.test(u) ? u : null;
}

function safeMarkdownHref(href: string, image: boolean): string {
  const h = href.trim();
  if (h === '') return '#';
  if (h.startsWith('#') || h.startsWith('/') || h.startsWith('./') || h.startsWith('../') || h.startsWith('?')) return h;
  if (URI_SCHEME_RE.test(h)) {
    if (/^https?:/i.test(h) || (!image && /^mailto:/i.test(h))) return h;
    return '#';
  }
  return h;
}

/** Markdown without raw HTML: html tokens are escaped to text, and link and
 *  image targets outside http(s)/relative URLs are dropped. */
export function md(src: string): string {
  const html = marked.parse(src, {
    breaks: false,
    walkTokens(token) {
      if (token.type === 'html') {
        token.text = esc(token.text);
      } else if (token.type === 'link' || token.type === 'image') {
        token.href = safeMarkdownHref(String(token.href || ''), token.type === 'image');
      }
    },
  }) as string;
  return html.replace(/<a href="((?:https?:)?\/\/[^"]*)"/g, '<a href="$1" rel="noopener noreferrer"');
}

/** Public URL of an audit file, served through the assets route. Catalogue
 *  paths are stored as `assets/<file>`; the private route mounts them at
 *  `/audits/<slug>/assets/<file>`, the public one at
 *  `/workbench/audits/<slug>/assets/<file>`. */
export function assetUrl(slug: string, path: string, base: string = '/audits'): string {
  const rel = path.replace(/^assets\//, '');
  return `${base}/${slug}/assets/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

export function assetById(doc: AuditDocument, id: string): AuditAsset | null {
  return doc.assets.find((a) => a.id === id) ?? null;
}

export function annexById(doc: AuditDocument, id: string): AuditAnnex | null {
  return (doc.annexes ?? []).find((a) => a.id === id) ?? null;
}

/** Whether an annex shows on the public page: only explicit `public`. */
export function annexIsPublic(annex: AuditAnnex): boolean {
  return annex.visibility === 'public';
}

/** The annexes a view lists: the public ones on the published page, all of
 *  them on the private page. */
export function visibleAnnexes(doc: AuditDocument, published: boolean): AuditAnnex[] {
  const all = doc.annexes ?? [];
  return published ? all.filter(annexIsPublic) : all;
}

/** Human file size: `0 B`, `512 B`, `1.5 KB`, `200 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)} ${units[unit]}`;
}

export interface ProseCtx {
  slug: string;
  doc: AuditDocument;
  /** Route base for asset URLs: `/audits` private, `/workbench/audits` public. */
  assetBase?: string;
  /** True on the published page: private annexes stay unlinked, like
   *  unknown targets, so their titles never leak into public markup. */
  published?: boolean;
}

/** Render prose markdown with its inline references resolved to interactive
 *  markup: finding/source/annex links jump to their entry, glossary terms
 *  carry their definition, asset references link to the file. Unknown
 *  targets render as plain escaped text, never as a broken link. */
export function proseRefs(markdown: string, ctx: ProseCtx): string {
  const { slug, doc } = ctx;
  const assetBase = ctx.assetBase ?? '/audits';
  const findings = new Map(doc.findings.map((f) => [f.id, f]));
  const sources = new Map(doc.sources.map((s) => [s.id, s]));
  const glossary = new Map(doc.glossary.map((g) => [g.term, g.definition]));
  const assets = new Map(doc.assets.map((a) => [a.id, a]));
  const annexes = new Map((doc.annexes ?? []).map((a) => [a.id, a]));
  const parts: string[] = [];
  let last = 0;
  PROSE_REF.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROSE_REF.exec(markdown)) !== null) {
    parts.push(md(markdown.slice(last, m.index)));
    const kind = m[1];
    const id = m[2].trim();
    if (kind === 'finding' && findings.has(id)) {
      const f = findings.get(id)!;
      parts.push(
        `<a class="audit-ref" href="#audit-finding-${esc(id)}">${esc(f.title)}</a>`,
      );
    } else if (kind === 'source' && sources.has(id)) {
      const s = sources.get(id)!;
      parts.push(
        `<a class="audit-ref" href="#audit-source-${esc(id)}">${esc(s.title)}</a>`,
      );
    } else if (kind === 'term' && glossary.has(id)) {
      parts.push(
        `<span class="audit-term" tabindex="0">${esc(id)}` +
          `<span class="audit-term-def" hidden>${esc(glossary.get(id)!)}</span></span>`,
      );
    } else if (kind === 'asset' && assets.has(id)) {
      const a = assets.get(id)!;
      parts.push(
        `<a class="audit-ref" href="${esc(assetUrl(slug, a.path, assetBase))}">${esc(a.title)}</a>`,
      );
    } else if (kind === 'annex' && annexes.has(id)) {
      const a = annexes.get(id)!;
      if (ctx.published && a.visibility !== 'public') {
        parts.push(esc(m[0]));
      } else {
        parts.push(
          `<a class="audit-ref" href="#audit-annex-${esc(id)}">${esc(a.title)}</a>`,
        );
      }
    } else {
      parts.push(esc(m[0]));
    }
    last = m.index + m[0].length;
  }
  parts.push(md(markdown.slice(last)));
  return parts.join('');
}
