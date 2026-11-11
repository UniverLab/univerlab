// Shared audit rendering helpers: escaping, safe markdown, asset URLs and
// the inline prose references (`{{finding:F-01}}`, `{{source:id}}`,
// `{{term:word}}`, `{{asset:id}}`) the renderer makes interactive.
import { marked } from 'marked';
import { PROSE_REF, type AuditAsset, type AuditDocument } from './types';
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
 *  paths are stored as `assets/<file>`; the route mounts them at
 *  `/audits/<slug>/assets/<file>`. */
export function assetUrl(slug: string, path: string): string {
  const rel = path.replace(/^assets\//, '');
  return `/audits/${slug}/assets/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

export function assetById(doc: AuditDocument, id: string): AuditAsset | null {
  return doc.assets.find((a) => a.id === id) ?? null;
}

export interface ProseCtx {
  slug: string;
  doc: AuditDocument;
}

/** Render prose markdown with its inline references resolved to interactive
 *  markup: finding/source links jump to their entry, glossary terms carry
 *  their definition, asset references link to the file. Unknown targets
 *  render as plain escaped text, never as a broken link. */
export function proseRefs(markdown: string, ctx: ProseCtx): string {
  const { slug, doc } = ctx;
  const findings = new Map(doc.findings.map((f) => [f.id, f]));
  const sources = new Map(doc.sources.map((s) => [s.id, s]));
  const glossary = new Map(doc.glossary.map((g) => [g.term, g.definition]));
  const assets = new Map(doc.assets.map((a) => [a.id, a]));
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
        `<a class="audit-ref" href="${esc(assetUrl(slug, a.path))}">${esc(a.title)}</a>`,
      );
    } else {
      parts.push(esc(m[0]));
    }
    last = m.index + m[0].length;
  }
  parts.push(md(markdown.slice(last)));
  return parts.join('');
}
