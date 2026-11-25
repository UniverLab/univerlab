// The admin audits panel reads every audit in the R2 bucket — private and
// public — and reduces each document to one row: slug, title, date,
// visibility, finding counts by severity and status, and the Zenodo DOI if
// any. Pure data shaping over an injected bucket surface, so the Pages
// Function adapters stay thin and jest runs it with a fake bucket.

import { validateAuditDocument } from '../audit/validate-document';
import type { AuditDocument, Severity } from '../audit/types';

/** One stored object: text for documents, binary where the binding
 *  offers it (staged upload files are hashed byte-exact). */
export interface AdminR2Object {
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

/** The R2 surface the admin routes need: reads, visibility writes and
 *  removal. The edge binding satisfies this structurally. */
export interface AdminR2Bucket {
  get(key: string): Promise<AdminR2Object | null>;
  put(
    key: string,
    value: Uint8Array | ArrayBuffer | string,
    opts?: { httpMetadata?: { contentType?: string } },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list?: (options?: { prefix?: string }) => Promise<{ objects: { key: string }[] }>;
}

export const ADMIN_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const AUDIT_JSON_RE = /^([^/]+)\/([^/]+)\/audit\.json$/;
const LEGACY_AUDIT_JSON_RE = /^([^/]+)\/audit\.json$/;

export interface AdminAuditFindings {
  total: number;
  open: number;
  bySeverity: Record<Severity, number>;
  openBySeverity: Record<Severity, number>;
}

export interface AdminAuditRow {
  /** The edition id: old bare slugs are edition ids, so stored panel links
   *  keep resolving (through the legacy redirect). */
  slug: string;
  /** The audited system: the stable address is `/audits/<system>/`. */
  system: string;
  /** The edition within the system (`<system>/<edition>/audit.json`). */
  edition: string;
  /** Whether this row reads from an old bare-slug `<slug>/audit.json` key. */
  legacy: boolean;
  /** Whether this row is the system's newest edition. */
  isLatest: boolean;
  title: string;
  date: string;
  visibility: 'public' | 'private';
  doi: string | null;
  findings: AdminAuditFindings;
}

const emptyCounts = (): Record<Severity, number> => ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });

/** Read and validate one `audit.json` key, or null when it must read as
 *  missing: no binding, no file, invalid JSON or a contract violation —
 *  the same validity rule the edge serves by. */
async function readAuditKey(
  bucket: AdminR2Bucket,
  key: string,
): Promise<AuditDocument | null> {
  try {
    const obj = await bucket.get(key);
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

/** One addressed audit: the system, the edition, its storage key and its
 *  document. `scope` is `edition` when a single edition was named and
 *  `system` when the address covers the whole system. */
export interface AdminAuditRef {
  system: string;
  edition: string;
  key: string;
  doc: AuditDocument;
  legacy: boolean;
  scope: 'edition' | 'system';
}

/** Resolve a panel address to its audit: a `system/edition` pair, a legacy
 *  bare slug (an old `<slug>/audit.json` key, while it still exists), or a
 *  bare system (its newest edition, by badge date then edition id). */
export async function resolveAdminAudit(
  bucket: AdminR2Bucket | undefined,
  ref: string,
): Promise<AdminAuditRef | null> {
  try {
    if (!bucket) return null;
    // Staged uploads are never an addressable audit: a half-finished
    // upload leaves no edition visible in the panel or on the site.
    if (ref === '_staging' || ref.startsWith('_staging/')) return null;
    if (ref.includes('/')) {
      const [system, edition, ...rest] = ref.split('/');
      if (!system || !edition || rest.length > 0) return null;
      if (!ADMIN_SLUG_RE.test(system) || !ADMIN_SLUG_RE.test(edition)) return null;
      const doc = await readAuditKey(bucket, `${system}/${edition}/audit.json`);
      if (!doc) return null;
      return { system, edition, key: `${system}/${edition}/audit.json`, doc, legacy: false, scope: 'edition' };
    }
    if (!ADMIN_SLUG_RE.test(ref)) return null;
    const legacyDoc = await readAuditKey(bucket, `${ref}/audit.json`);
    if (legacyDoc) {
      return { system: ref, edition: ref, key: `${ref}/audit.json`, doc: legacyDoc, legacy: true, scope: 'system' };
    }
    if (!bucket.list) return null;
    const listed = await bucket.list({ prefix: `${ref}/` });
    const editions: { edition: string; doc: AuditDocument }[] = [];
    for (const obj of listed.objects) {
      const key = obj.key;
      if (!key.startsWith(`${ref}/`)) continue;
      const m = /^([^/]+)\/audit\.json$/.exec(key.slice(ref.length + 1));
      if (!m) continue;
      const doc = await readAuditKey(bucket, key);
      if (doc) editions.push({ edition: m[1], doc });
    }
    if (!editions.length) return null;
    editions.sort((a, b) => {
      const da = a.doc.badge?.issued ?? '';
      const db = b.doc.badge?.issued ?? '';
      if (da !== db) return da < db ? 1 : -1;
      if (a.edition === b.edition) return 0;
      return a.edition < b.edition ? 1 : -1;
    });
    const [latest] = editions;
    return {
      system: ref,
      edition: latest.edition,
      key: `${ref}/${latest.edition}/audit.json`,
      doc: latest.doc,
      legacy: false,
      scope: 'system',
    };
  } catch {
    return null;
  }
}

/** A valid audit document of any visibility, or null when the address must
 *  read as missing: a `system/edition` pair, a legacy bare slug, or a bare
 *  system (its newest edition). */
export async function loadAdminAuditDoc(
  bucket: AdminR2Bucket | undefined,
  ref: string,
): Promise<AuditDocument | null> {
  return (await resolveAdminAudit(bucket, ref))?.doc ?? null;
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

function rowOf(system: string, edition: string, doc: AuditDocument, isLatest: boolean, legacy: boolean): AdminAuditRow {
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
    slug: edition,
    system,
    edition,
    legacy,
    isLatest,
    title: doc.meta.title,
    date: doc.badge?.issued ?? '',
    visibility: doc.visibility,
    doi: typeof doc.deposit?.versionDoi === 'string' && doc.deposit.versionDoi !== '' ? doc.deposit.versionDoi : null,
    findings: { total: (doc.findings ?? []).length, open, bySeverity, openBySeverity },
  };
}

/** Newest first: by badge date, then by edition id. */
function newestFirst(a: { date: string; edition: string }, b: { date: string; edition: string }): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.edition === b.edition) return 0;
  return a.edition < b.edition ? 1 : -1;
}

/** Every audit edition in the bucket as panel rows, grouped by system:
 *  systems sort by name, editions newest first, and exactly one row per
 *  system carries `isLatest`. Legacy bare-slug keys read as their own
 *  single-edition system while they still exist. An unbound bucket, a
 *  missing list surface or a listing failure yields no rows; an unreadable
 *  or invalid document is skipped, never fatal. */
export async function listAdminAudits(bucket: AdminR2Bucket | undefined): Promise<AdminAuditRow[]> {
  try {
    if (!bucket?.list) return [];
    const listed = await bucket.list();
    const bySystem = new Map<string, { date: string; edition: string; doc: AuditDocument; legacy: boolean }[]>();
    for (const obj of listed.objects) {
      // Staged uploads never read as panel rows: only finished editions do.
      if (obj.key === '_staging' || obj.key.startsWith('_staging/')) continue;
      const m = AUDIT_JSON_RE.exec(obj.key) ?? LEGACY_AUDIT_JSON_RE.exec(obj.key);
      if (!m) continue;
      const system = m[1];
      const edition = m[2] ?? m[1];
      const doc = await loadAdminAuditDoc(bucket, m[2] ? `${system}/${edition}` : system);
      if (doc) {
        const group = bySystem.get(system) ?? [];
        group.push({ date: doc.badge?.issued ?? '', edition, doc, legacy: !m[2] });
        bySystem.set(system, group);
      }
    }
    const rows: AdminAuditRow[] = [];
    for (const system of [...bySystem.keys()].sort()) {
      const group = bySystem.get(system)!;
      group.sort(newestFirst);
      group.forEach(({ edition, doc, legacy }, i) => rows.push(rowOf(system, edition, doc, i === 0, legacy)));
    }
    return rows;
  } catch {
    return [];
  }
}
