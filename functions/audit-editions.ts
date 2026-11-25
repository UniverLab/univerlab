// The audit-edition edge: one audited system, many editions. All R2
// reads for the audit routes live here — `functions/_middleware.ts` only
// wires them to URLs — so the file stays under the size guard. Keys are
// `<system>/<edition>/audit.json` with assets under the same prefix; legacy
// dated slugs are edition ids that redirect to their system.
import { validateAuditDocument } from '../src/lib/audit/validate-document';
import type { AuditEditionLink, PublishedAuditLinks } from '../src/lib/audit/render';
import type { AuditDocument } from '../src/lib/audit/types';

/** The R2 surface the audit routes need: reads only, never writes. */
interface AuditR2Object {
  body: ReadableStream | Uint8Array | string | null;
  size: number;
  etag: string;
  httpMetadata?: { contentType?: string };
  text(): Promise<string>;
}

export interface AuditR2Bucket {
  get(
    key: string,
    opts?: { range?: { offset?: number; length?: number } },
  ): Promise<(AuditR2Object & { range?: { offset: number; length: number } }) | null>;
  /** Enumerate keys (`<system>/<edition>/audit.json` plus assets). Optional
   *  so a binding that only serves single keys still satisfies the type. */
  list?: (options?: { prefix?: string }) => Promise<{ objects: { key: string }[] }>;
}

/** Every public audit edition in the R2 bucket: only documents whose
 *  visibility is public are listed, so a private edition never leaks
 *  through an index. An unbound bucket or a listing failure yields no
 *  entries. Keys are `<system>/<edition>/audit.json`. */
export interface PublicAuditEntry {
  system: string;
  edition: string;
  doc: AuditDocument;
}

export async function listPublicAudits(env: { AUDITS?: AuditR2Bucket }): Promise<PublicAuditEntry[]> {
  try {
    if (!env.AUDITS?.list) return [];
    const listed = await env.AUDITS.list();
    const out: PublicAuditEntry[] = [];
    for (const obj of listed.objects) {
      const m = /^([^/]+)\/([^/]+)\/audit\.json$/.exec(obj.key);
      if (!m) continue;
      const doc = await loadAuditDoc(env, `${m[1]}/${m[2]}`);
      if (doc && doc.visibility === 'public') out.push({ system: m[1], edition: m[2], doc });
    }
    return out;
  } catch {
    return [];
  }
}

/** One edition of a system with its document. */
export interface AuditEditionEntry {
  edition: string;
  doc: AuditDocument;
}

/** Every edition of one system, newest first: by badge date, then by
 *  edition id. An unbound bucket or a listing failure yields no entries. */
export async function listEditions(
  env: { AUDITS?: AuditR2Bucket },
  system: string,
): Promise<AuditEditionEntry[]> {
  try {
    if (!env.AUDITS?.list) return [];
    const listed = await env.AUDITS.list({ prefix: `${system}/` });
    const out: AuditEditionEntry[] = [];
    for (const obj of listed.objects) {
      const key = obj.key;
      if (!key.startsWith(`${system}/`)) continue;
      const rest = key.slice(system.length + 1);
      const m = /^([^/]+)\/audit\.json$/.exec(rest);
      if (!m) continue;
      const doc = await loadAuditDoc(env, `${system}/${m[1]}`);
      if (doc) out.push({ edition: m[1], doc });
    }
    out.sort((a, b) => {
      const da = a.doc.badge?.issued ?? '';
      const db = b.doc.badge?.issued ?? '';
      if (da !== db) return da < db ? 1 : -1;
      if (a.edition === b.edition) return 0;
      return a.edition < b.edition ? 1 : -1;
    });
    return out;
  } catch {
    return [];
  }
}

/** The system holding a known edition id (a legacy dated slug), or null.
 *  One full listing, first match wins: edition ids are unique per system. */
export async function findEditionSystem(
  env: { AUDITS?: AuditR2Bucket },
  edition: string,
): Promise<string | null> {
  try {
    if (!env.AUDITS?.list) return null;
    const listed = await env.AUDITS.list();
    for (const obj of listed.objects) {
      const m = /^([^/]+)\/([^/]+)\/audit\.json$/.exec(obj.key);
      if (m && m[2] === edition) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

/** The re-audit history around one published edition: the previous edition
 *  only when it is public itself, and every public edition naming this one.
 *  Links are `system/edition` paths under the public audit base. */
export function publicAuditHistory(system: string, edition: string, doc: AuditDocument, all: PublicAuditEntry[]): PublishedAuditLinks {
  const known = new Map(all.map((e) => [`${e.system}/${e.edition}`, e]));
  let previous: string | null = null;
  const prevId = doc.badge?.previous;
  if (typeof prevId === 'string' && prevId !== '') {
    if (known.has(`${system}/${prevId}`)) {
      previous = `${system}/${prevId}`;
    } else {
      const elsewhere = all.find((e) => e.edition === prevId);
      if (elsewhere) previous = `${elsewhere.system}/${elsewhere.edition}`;
    }
  }
  const next = all
    .filter((e) => e.doc.badge?.previous === edition)
    .map((e) => `${e.system}/${e.edition}`)
    .sort();
  return { previous, next };
}

/** Resolve a page route to its edition: the named edition, or the newest
 *  when none is named. When `onlyPublic` is true, only public editions are
 *  considered so a newer private draft never shadows an older public
 *  edition. Null when nothing matches. */
export async function resolveAuditEdition(
  env: { AUDITS?: AuditR2Bucket },
  system: string,
  edition: string | null,
  onlyPublic = false,
): Promise<{ edition: string; doc: AuditDocument; entries: AuditEditionEntry[] } | null> {
  const all = await listEditions(env, system);
  const entries = onlyPublic ? all.filter((e) => e.doc.visibility === 'public') : all;
  if (!entries.length) return null;
  const pick = edition ? entries.find((e) => e.edition === edition) : entries[0];
  if (!pick) return null;
  return { edition: pick.edition, doc: pick.doc, entries };
}

/** The key prefix an asset, badge or twin route reads: the named edition,
 *  or the newest when none is named. When `onlyPublic` is true, only public
 *  editions are considered. Null when nothing is there to serve. */
export async function auditRoutePrefix(
  env: { AUDITS?: AuditR2Bucket },
  system: string,
  edition: string | null,
  onlyPublic = false,
): Promise<string | null> {
  if (edition) {
    const doc = await loadAuditDoc(env, `${system}/${edition}`);
    if (!doc) return null;
    if (onlyPublic && doc.visibility !== 'public') return null;
    return `${system}/${edition}`;
  }
  const entries = await listEditions(env, system);
  const pick = onlyPublic ? entries.find((e) => e.doc.visibility === 'public') : entries[0];
  return pick ? `${system}/${pick.edition}` : null;
}

/** The edition nav for one page: every given edition newest-first, each
 *  opening its own page under `pageBase` (`/audits/<sys>` or the public
 *  audits base). */
export function editionNavEntries(entries: AuditEditionEntry[], current: string, pageBase: string): AuditEditionLink[] {
  return entries.map((e) => ({
    id: e.edition,
    date: e.doc.badge?.issued ?? '',
    version: e.doc.meta.version,
    status: e.doc.meta.status,
    url: `${pageBase}/${e.edition}/`,
    current: e.edition === current,
  }));
}

/** Catalogue paths become both R2 keys and public URLs; keep them plain
 *  relative paths so `/audits/<slug>/assets/` cannot be escaped. */
export function safeAuditAssetPath(path: string): boolean {
  if (path.startsWith('/') || path.includes('\\')) return false;
  return path.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** A valid audit document of any visibility, or null when the route must
 *  answer 404: no binding, no file, invalid JSON or a contract violation.
 *  Visibility is gated by the caller: public audits serve to anyone, private
 *  audits only after `auditRequestAllowed` passes. */
export async function loadAuditDoc(
  env: { AUDITS?: AuditR2Bucket },
  prefix: string,
): Promise<AuditDocument | null> {
  try {
    if (!env.AUDITS) return null;
    const obj = await env.AUDITS.get(`${prefix}/audit.json`);
    if (!obj) return null;
    const doc = JSON.parse(await obj.text()) as AuditDocument;
    if (validateAuditDocument(doc).errors.length > 0) return null;
    if (typeof doc !== 'object' || doc === null) return null;
    if (doc.visibility !== 'public' && doc.visibility !== 'private') return null;
    if (!doc.assets.every((a) => safeAuditAssetPath(a.path))) return null;
    return doc;
  } catch {
    return null;
  }
}
