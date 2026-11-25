// The executive summary: severity counts over all findings plus the risk
// picture (open, fixed, highest open severity), rendered before any prose.
import { SEVERITIES, type AuditDocument, type Severity } from './types';
import { esc } from './util';
import type { AuditStrings } from './blocks';

export type SeverityCounts = Record<Severity, number>;

export function severityCounts(doc: AuditDocument): SeverityCounts {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as SeverityCounts;
  for (const f of doc.findings) counts[f.severity] += 1;
  return counts;
}

/** The highest severity with at least one open finding, or null. */
function highestOpen(doc: AuditDocument): Severity | null {
  for (const sev of SEVERITIES) {
    if (doc.findings.some((f) => f.severity === sev && f.status === 'open')) return sev;
  }
  return null;
}

function fill(template: string, value: string): string {
  return template.replace('{n}', esc(value)).replace('{sev}', esc(value));
}

export function execSummaryHtml(doc: AuditDocument, t: AuditStrings): string {
  if (!doc.findings.length) return '';
  const counts = severityCounts(doc);
  const total = doc.findings.length;
  const items = SEVERITIES.map((sev) => {
    const n = counts[sev];
    const pct = Math.round((n / total) * 100);
    return (
      `<li data-severity="${sev}" style="--audit-bar:${pct}%">` +
      `<span class="audit-summary-sev audit-sev audit-sev--${sev}">${esc(t.severity[sev])}</span>` +
      `<span class="audit-summary-count">${n}</span></li>`
    );
  }).join('');
  const open = doc.findings.filter((f) => f.status === 'open').length;
  const fixed = doc.findings.filter((f) => f.status === 'fixed').length;
  const top = highestOpen(doc);
  const risk =
    `${fill(t.summary.open, String(open))} · ${fill(t.summary.fixed, String(fixed))}` +
    (top ? ` · ${t.summary.highest.replace('{sev}', esc(t.severity[top]))}` : '');
  return (
    `<section class="audit-summary" aria-label="${esc(t.summary.title)}">` +
    `<h2>${esc(t.summary.title)}</h2><ol>${items}</ol>` +
    `<p class="audit-summary-risk">${risk}</p></section>`
  );
}
