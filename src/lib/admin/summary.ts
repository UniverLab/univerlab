// The admin audits panel reads every audit in the R2 bucket — private and
// public — and reduces each document to one row: slug, title, date,
// visibility, finding counts by severity and status, and the Zenodo DOI if
// any. Pure data shaping over an injected bucket surface, so the Pages
// Function adapters stay thin and jest runs it with a fake bucket.

import { validateAuditDocument } from '../audit/validate-document';
import type { AuditDocument, Severity } from '../audit/types';

/** The R2 surface the admin routes need: reads, visibility writes and
 *  removal. The edge binding satisfies this structurally. */
export interface AdminR2Bucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(
    key: string,
    value: Uint8Array | ArrayBuffer | string,
    opts?: { httpMetadata?: { contentType?: string } },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list?: (options?: { prefix?: string }) => Promise<{ objects: { key: string }[] }>;
}

export const ADMIN_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const AUDIT_JSON_RE = /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/audit\.json$/;

export interface AdminAuditFindings {
  total: number;
  open: number;
  bySeverity: Record<Severity, number>;
  openBySeverity: Record<Severity, number>;
}

export interface AdminAuditRow {
  slug: string;
  title: string;
  date: string;
  visibility: 'public' | 'private';
  doi: string | null;
  findings: AdminAuditFindings;
}

const emptyCounts = (): Record<Severity, number> => ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });

/** A valid audit document of any visibility, or null when the key must read
 *  as missing: no binding, no file, invalid JSON or a contract violation —
 *  the same validity rule the edge serves by. */
export async function loadAdminAuditDoc(
  bucket: AdminR2Bucket | undefined,
  slug: string,
): Promise<AuditDocument | null> {
  try {
    if (!bucket || !ADMIN_SLUG_RE.test(slug)) return null;
    const obj = await bucket.get(`${slug}/audit.json`);
    if (!obj) return null;
    const doc = JSON.parse(await obj.text()) as AuditDocument;
    if (validateAuditDocument(doc).errors.length > 0) return null;
    if (typeof doc !== 'object' || doc === null) return null;
    if (doc.visibility !== 'public' && doc.visibility !== 'private') return null;
    return doc;
  } catch {
    return null;
  }
}

/** Why this audit must not be published, or null when it may. Only the open
 *  critical/high findings check from the Zenodo deposit rule applies here: a
 *  visibility flip is not a deposit, so the consent and existing-DOI gates
 *  never block it. */
export function publishRefusal(doc: AuditDocument): string | null {
  const open = (doc.findings ?? []).filter(
    (f) => (f.severity === 'critical' || f.severity === 'high') && f.status === 'open',
  );
  if (open.length > 0) {
    return `refuses with open ${open.map((f) => f.id).join(', ')}: critical and high findings must be fixed first`;
  }
  return null;
}

function rowOf(slug: string, doc: AuditDocument): AdminAuditRow {
  const bySeverity = emptyCounts();
  const openBySeverity = emptyCounts();
  let open = 0;
  for (const f of doc.findings ?? []) {
    bySeverity[f.severity] += 1;
    if (f.status === 'open') {
      open += 1;
      openBySeverity[f.severity] += 1;
    }
  }
  return {
    slug,
    title: doc.meta.title,
    date: doc.badge?.issued ?? '',
    visibility: doc.visibility,
    doi: typeof doc.deposit?.versionDoi === 'string' && doc.deposit.versionDoi !== '' ? doc.deposit.versionDoi : null,
    findings: { total: (doc.findings ?? []).length, open, bySeverity, openBySeverity },
  };
}

/** Every audit in the bucket as panel rows, sorted by slug. An unbound
 *  bucket, a missing list surface or a listing failure yields no rows; an
 *  unreadable or invalid document is skipped, never fatal. */
export async function listAdminAudits(bucket: AdminR2Bucket | undefined): Promise<AdminAuditRow[]> {
  try {
    if (!bucket?.list) return [];
    const listed = await bucket.list();
    const rows: AdminAuditRow[] = [];
    for (const obj of listed.objects) {
      const m = AUDIT_JSON_RE.exec(obj.key);
      if (!m) continue;
      const doc = await loadAdminAuditDoc(bucket, m[1]);
      if (doc) rows.push(rowOf(m[1], doc));
    }
    rows.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    return rows;
  } catch {
    return [];
  }
}
