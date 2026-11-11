// The published audit's markdown twin: served live from the R2 listing at
// `/workbench/audits/<slug>/index.md`, never from dist/. Same front-matter
// shape as the built twins (`title` + `source` canonical), then the meta, the
// badge, the findings, the sources and the sections in order. Public asset
// URLs point at the public audit address; the allowlist never leaves the
// contract, so `access` is never rendered.
import type { AuditBlock, AuditDocument, AuditFinding } from './types';

export const PUBLIC_AUDIT_BASE = '/workbench/audits';

export function publicAuditUrl(slug: string): string {
  return `${PUBLIC_AUDIT_BASE}/${slug}/`;
}

function assetHref(slug: string, path: string): string {
  const rel = path.replace(/^assets\//, '');
  return `${PUBLIC_AUDIT_BASE}/${slug}/assets/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

function findingMarkdown(doc: AuditDocument, f: AuditFinding): string {
  const lang = doc.meta.language;
  const sevLabel = lang === 'es' ? 'Severidad' : 'Severity';
  const statusLabel = lang === 'es' ? 'estado' : 'status';
  const areaLabel = lang === 'es' ? 'área' : 'area';
  const recLabel = lang === 'es' ? 'Recomendación' : 'Recommendation';
  const fixedLabel = lang === 'es' ? 'Corregido en' : 'Fixed in';
  const lines = [
    `### ${f.id}: ${f.title}`,
    '',
    `${sevLabel}: ${f.severity} · likelihood ${f.likelihood} × impact ${f.impact} · ${statusLabel}: ${f.status} · ${areaLabel}: ${f.area}`,
    '',
    f.summary,
    '',
    `${recLabel}: ${f.recommendation}`,
  ];
  if (f.fixedIn) lines.push('', `${fixedLabel}: ${f.fixedIn}`);
  return lines.join('\n');
}

function cell(v: string | number): string {
  return String(v).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
}

function blockMarkdown(doc: AuditDocument, slug: string, b: AuditBlock): string {
  if (!b || typeof b.type !== 'string') return '';
  switch (b.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, (b as { level?: unknown }).level as number || 2));
      return `${'#'.repeat(level)} ${(b as { text?: unknown }).text ?? ''}`;
    }
    case 'prose':
    case 'callout':
      return String((b as { markdown?: unknown }).markdown ?? '');
    case 'stats': {
      const items = (b as { items?: { value?: unknown; label?: unknown }[] }).items ?? [];
      return items.map((s) => `- ${String(s.value ?? '')}: ${String(s.label ?? '')}`).join('\n');
    }
    case 'finding': {
      const f = doc.findings.find((x) => x.id === (b as { findingId?: unknown }).findingId);
      return f ? findingMarkdown(doc, f) : '';
    }
    case 'findingsTable': {
      const rows = doc.findings.map((f) =>
        `| ${cell(f.id)} | ${cell(f.title)} | ${cell(f.severity)} | ${cell(f.status)} |`,
      );
      const head =
        doc.meta.language === 'es'
          ? '| id | título | severidad | estado |'
          : '| id | title | severity | status |';
      return [head, '| --- | --- | --- | --- |', ...rows].join('\n');
    }
    case 'riskMatrix':
      return doc.findings.map((f) => `- ${f.id} (${f.severity}): likelihood ${f.likelihood} × impact ${f.impact} — ${f.title}`).join('\n');
    case 'chart': {
      const caption = String((b as { caption?: unknown }).caption ?? '');
      const graph = doc.meta.language === 'es' ? 'Gráfico' : 'Chart';
      const fallback =
        doc.meta.language === 'es'
          ? 'los datos están en el paquete descargable.'
          : 'the data is in the downloadable bundle.';
      return caption ? `*${graph}: ${caption}*` : `*${graph}: ${fallback}*`;
    }
    case 'figure':
    case 'assetCard': {
      const id = String((b as { asset?: unknown }).asset ?? '');
      const a = doc.assets.find((x) => x.id === id);
      const caption = String((b as { caption?: unknown }).caption ?? (b as { description?: unknown }).description ?? '');
      const link = a ? `([${a.title}](${assetHref(slug, a.path)}))` : '';
      return caption ? `${caption} ${link}`.trim() : link;
    }
    case 'diagram':
      return String((b as { caption?: unknown }).caption ?? '');
    case 'code': {
      const lang = String((b as { language?: unknown }).language ?? '');
      const src = String((b as { source?: unknown }).source ?? '');
      return `\`\`\`${lang}\n${src}\n\`\`\``;
    }
    case 'quote': {
      const text = String((b as { text?: unknown }).text ?? '');
      const attr = (b as { attribution?: unknown }).attribution;
      return `> ${text}${typeof attr === 'string' && attr ? `\n> — ${attr}` : ''}`;
    }
    case 'table': {
      const cols = (b as { columns?: unknown }).columns;
      const rows = (b as { rows?: unknown }).rows;
      if (!Array.isArray(cols) || !Array.isArray(rows)) return '';
      const line = (cs: (string | number)[]): string => `| ${cs.map(cell).join(' | ')} |`;
      const divider = `| ${cols.map(() => '---').join(' | ')} |`;
      return [line(cols as (string | number)[]), divider, ...(rows as (string | number)[][]).map(line)].join('\n');
    }
    case 'timeline': {
      const steps = (b as { steps?: { title?: unknown; description?: unknown }[] }).steps ?? [];
      return steps.map((s) => `- ${String(s.title ?? '')}${s.description ? `: ${String(s.description)}` : ''}`).join('\n');
    }
    case 'stepper': {
      const steps = (b as { steps?: { title?: unknown; markdown?: unknown }[] }).steps ?? [];
      return steps.map((s) => `### ${String(s.title ?? '')}\n\n${String(s.markdown ?? '')}`).join('\n\n');
    }
    case 'compare': {
      const before = doc.meta.language === 'es' ? 'Antes' : 'Before';
      const after = doc.meta.language === 'es' ? 'Después' : 'After';
      return `${before}: ${String((b as { before?: unknown }).before ?? '')}\n\n${after}: ${String((b as { after?: unknown }).after ?? '')}`;
    }
    case 'sources': {
      const ids = (b as { ids?: unknown }).ids;
      if (!Array.isArray(ids)) return '';
      return ids
        .map((id) => {
          const s = doc.sources.find((x) => x.id === id);
          return s ? `- ${s.title}${s.url ? ` (${s.url})` : ''}` : `- ${String(id)}`;
        })
        .join('\n');
    }
    case 'divider': {
      const label = String((b as { label?: unknown }).label ?? '');
      return label ? `---\n\n*${label}*` : '---';
    }
    default:
      return '';
  }
}

function annexMarkdown(doc: AuditDocument, slug: string, a: NonNullable<AuditDocument['annexes']>[number]): string {
  const lang = doc.meta.language;
  const usage = lang === 'es' ? 'Uso' : 'Usage';
  const lines = [`### ${a.title}`, '', a.description, ''];
  if (typeof a.instructions === 'string' && a.instructions !== '') {
    lines.push(`${usage}: ${a.instructions}`, '');
  }
  for (const id of a.assets) {
    const asset = doc.assets.find((x) => x.id === id);
    if (!asset) continue;
    lines.push(`- [${asset.title}](${assetHref(slug, asset.path)})`);
  }
  return lines.join('\n');
}

/** The markdown twin of a published audit. Public only: the caller gates,
 *  and only public annexes travel with it — a private annex stays out. */
export function auditMarkdown(doc: AuditDocument, slug: string): string {
  const canonical = `https://univerlab.org${publicAuditUrl(slug)}`;
  const m = doc.meta;
  const lang = m.language;
  const metaLine =
    lang === 'es'
      ? `Cliente: ${m.client.name} · Auditores: ${m.auditors.map((a) => a.name).join(', ')} · Periodo: ${m.auditPeriod.start} – ${m.auditPeriod.end} · Versión: ${m.version} · Estado: ${m.status}`
      : `Client: ${m.client.name} · Auditors: ${m.auditors.map((a) => a.name).join(', ')} · Period: ${m.auditPeriod.start} – ${m.auditPeriod.end} · Version: ${m.version} · Status: ${m.status}`;
  const head = [
    '---',
    `title: "${doc.meta.title.replace(/"/g, '\\"')}"`,
    `source: "${canonical}"`,
    '---',
    '',
    `# ${m.title}`,
    '',
    m.subtitle ?? '',
    '',
    metaLine,
    '',
    m.scope,
    '',
  ];
  if (doc.badge) {
    head.push(
      lang === 'es'
        ? `Insignia: auditado por UniverLab en ${doc.badge.issued}, alcance: ${doc.badge.scope}.`
        : `Badge: audited by UniverLab on ${doc.badge.issued}, scope: ${doc.badge.scope}.`,
      '',
    );
  }
  const findings = doc.findings.length
    ? [lang === 'es' ? '## Hallazgos' : '## Findings', '', ...doc.findings.map((f) => findingMarkdown(doc, f)), '']
    : [];
  const annexes = (doc.annexes ?? []).filter((a) => a.visibility === 'public');
  const annexLines = annexes.length
    ? [lang === 'es' ? '## Anexos' : '## Annexes', '', ...annexes.map((a) => annexMarkdown(doc, slug, a)), '']
    : [];
  const sources = doc.sources.length
    ? [
        lang === 'es' ? '## Fuentes' : '## Sources',
        '',
        ...doc.sources.map((s) => `- ${s.title}${s.url ? ` (${s.url})` : ''}`),
        '',
      ]
    : [];
  const sections = doc.sections.flatMap((s) => [
    `## ${s.title}`,
    '',
    ...s.blocks.map((b) => blockMarkdown(doc, slug, b)).filter((x) => x !== ''),
    '',
  ]);
  return [...head, ...findings, ...annexLines, ...sources, ...sections].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
