// Permanent Zenodo deposit for published audits. Pure fetch against the
// Zenodo REST API — no console, no process env: the operator CLI passes the
// token in and the tests inject their own fetch. Sandbox is the default
// until the operator has tested the flow against it.
//
// Flow: create an empty deposition (or a new version of the earlier audit's
// deposition for a re-audit) -> upload the TeXForge PDF plus the public
// annex files into the draft bucket -> set the metadata -> publish -> verify
// every uploaded file against the record's MD5 checksum. A Zenodo
// publication cannot be undone, so the CLI confirms before publishing and
// this module verifies before reporting success.
import { createHash } from 'node:crypto';
import type { AuditDocument } from './types.ts';

export const ZENODO_PROD_API = 'https://zenodo.org/api';
export const ZENODO_SANDBOX_API = 'https://sandbox.zenodo.org/api';

/** The Zenodo community every published audit is deposited into. */
export const AUDIT_COMMUNITY = 'univerlab-audits';

export interface ZenodoFile {
  filename: string;
  data: Uint8Array;
  contentType: string;
}

export interface ZenodoDepositResult {
  versionDoi: string;
  conceptDoi: string;
  recordId: number;
}

interface ZenodoDeps {
  apiBase: string;
  token: string;
  fetchImpl?: typeof fetch;
}

function authed(base: string, path: string, token: string): string {
  return `${base}${path}?access_token=${encodeURIComponent(token)}`;
}

async function readError(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}

async function checked(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  what: string,
): Promise<{ res: Response; json: Record<string, unknown> }> {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`zenodo ${what} failed (${res.status})${await readError(res).then((d) => (d ? `: ${d}` : ''))}`);
  try {
    return { res, json: (await res.json()) as Record<string, unknown> };
  } catch {
    throw new Error(`zenodo ${what} returned no JSON (${res.status})`);
  }
}

export function md5Hex(data: Uint8Array): string {
  return createHash('md5').update(data).digest('hex');
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Why this audit must not get a draft deposition, or null when it may.
 *  The draft step accepts what publication refuses — a private audit, open
 *  critical or high findings, a draft or delivered status, no consent — and
 *  refuses only an audit that already carries a published version DOI. */
export function draftRefusal(doc: AuditDocument): string | null {
  if (typeof doc.deposit?.versionDoi === 'string' && doc.deposit.versionDoi !== '') {
    return `already deposited as ${doc.deposit.versionDoi}: a re-audit is a new audit folder`;
  }
  return null;
}

/** Why this audit must not be deposited, or null when it may be. Private
 *  audits never get a DOI; open critical or high findings must be fixed
 *  first; and without the client's recorded consent to a permanent deposit
 *  nothing publishes. An audit that already carries a version DOI is done. */
export function depositRefusal(doc: AuditDocument): string | null {
  if (doc.visibility !== 'public') return 'refuses a private audit: only a public audit is deposited in Zenodo';
  const open = (doc.findings ?? []).filter(
    (f) => (f.severity === 'critical' || f.severity === 'high') && f.status === 'open',
  );
  if (open.length > 0) {
    return `refuses with open ${open.map((f) => f.id).join(', ')}: critical and high findings must be fixed first`;
  }
  if (doc.deposit?.consent !== true) {
    return 'refuses without the recorded permanent-deposit consent (deposit.consent must be true)';
  }
  if (typeof doc.deposit?.versionDoi === 'string' && doc.deposit.versionDoi !== '') {
    return `already deposited as ${doc.deposit.versionDoi}: a re-audit is a new audit folder`;
  }
  return null;
}

/** The catalogue asset ids the deposit uploads: the TeXForge PDF report
 *  plus every file of the public annexes, deduplicated. Private annexes
 *  stay out. Null when the PDF is missing — the caller refuses. */
export function depositAssetIds(doc: AuditDocument): { report: string; files: string[] } | null {
  const report = doc.deliverables?.report;
  if (typeof report !== 'string' || report === '') return null;
  const seen = new Set<string>([report]);
  const files = [report];
  for (const annex of doc.annexes ?? []) {
    if (annex.visibility !== 'public') continue;
    for (const id of annex.assets ?? []) {
      if (!seen.has(id)) {
        seen.add(id);
        files.push(id);
      }
    }
  }
  return { report, files };
}

/** The Zenodo deposit-API metadata for the audit: title, auditors as
 *  creators, the client as subject, date, language, the report resource
 *  type, the license from the document's `x-license`, and the UniverLab
 *  Audits community. */
export function depositMetadata(doc: AuditDocument): Record<string, unknown> {
  const creators = doc.meta.auditors.map((a) => ({ name: a.name }));
  const license = (doc as unknown as Record<string, unknown>)['x-license'];
  const metadata: Record<string, unknown> = {
    title: doc.meta.title,
    upload_type: 'publication',
    publication_type: 'report',
    description: doc.meta.scope,
    creators,
    publication_date: doc.badge?.issued ?? new Date().toISOString().slice(0, 10),
    access_right: 'open',
    language: doc.meta.language === 'es' ? 'spa' : 'eng',
    subjects: [{ term: doc.meta.client.name }],
    communities: [{ identifier: AUDIT_COMMUNITY }],
  };
  if (typeof license === 'string' && license !== '') metadata['license'] = license;
  return metadata;
}

/** The latest deposition id carrying this concept DOI, or null. The new
 *  version of a re-audit is created from it, so the audits of one system
 *  share one concept. */
export async function findDepositionByConceptDoi(
  deps: ZenodoDeps & { conceptDoi: string },
): Promise<number | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const q = encodeURIComponent(`conceptdoi:"${deps.conceptDoi}"`);
  const { json } = await checked(fetchImpl, authed(deps.apiBase, `/deposit/depositions?q=${q}`, deps.token), {}, 'deposition search');
  const hits = Array.isArray(json) ? (json as unknown[]) : [];
  let best: number | null = null;
  for (const hit of hits) {
    if (typeof hit !== 'object' || hit === null) continue;
    const id = (hit as Record<string, unknown>)['id'];
    if (typeof id === 'number' && (best === null || id > best)) best = id;
  }
  return best;
}

/** Create the draft: a new version of the earlier audit's deposition for a
 *  re-audit, else a fresh deposition. Returns the draft id and its bucket. */
async function createDraft(
  fetchImpl: typeof fetch,
  deps: ZenodoDeps,
  priorDepositionId: number | null,
): Promise<{ id: number; bucket: string }> {
  if (priorDepositionId !== null) {
    const { json } = await checked(
      fetchImpl,
      authed(deps.apiBase, `/deposit/depositions/${priorDepositionId}/actions/newversion`, deps.token),
      { method: 'POST' },
      'new version',
    );
    const id = json['id'];
    const bucket = (json['links'] as Record<string, unknown> | undefined)?.['bucket'];
    if (typeof id !== 'number' || typeof bucket !== 'string') throw new Error('zenodo new version returned no draft');
    // The new draft starts as a copy: list its files so same-named uploads replace, not duplicate.
    return { id, bucket };
  }
  const { json } = await checked(
    fetchImpl,
    authed(deps.apiBase, '/deposit/depositions', deps.token),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"metadata":{"prereserve_doi":true}}' },
    'deposition create',
  );
  const id = json['id'];
  const bucket = (json['links'] as Record<string, unknown> | undefined)?.['bucket'];
  if (typeof id !== 'number' || typeof bucket !== 'string') throw new Error('zenodo deposition create returned no draft');
  return { id, bucket };
}

async function draftFileIds(fetchImpl: typeof fetch, deps: ZenodoDeps, draftId: number): Promise<Map<string, number>> {
  const { json } = await checked(fetchImpl, authed(deps.apiBase, `/deposit/depositions/${draftId}`, deps.token), {}, 'draft read');
  const out = new Map<string, number>();
  const files = json['files'];
  if (!Array.isArray(files)) return out;
  for (const f of files) {
    if (typeof f !== 'object' || f === null) continue;
    const rec = f as Record<string, unknown>;
    const name = rec['filename'];
    const id = rec['id'];
    if (typeof name === 'string' && typeof id === 'number') out.set(name, id);
  }
  return out;
}

/** Delete one file from a draft deposition. */
async function deleteDraftFile(
  fetchImpl: typeof fetch,
  deps: ZenodoDeps,
  draftId: number,
  fileId: number,
  filename: string,
): Promise<void> {
  // A 204 carries no body, so the JSON-expecting helper does not apply.
  const gone = await fetchImpl(authed(deps.apiBase, `/deposit/depositions/${draftId}/files/${fileId}`, deps.token), {
    method: 'DELETE',
  });
  if (!gone.ok) {
    throw new Error(`zenodo stale file delete of ${filename} failed (${gone.status})${await readError(gone).then((d) => (d ? `: ${d}` : ''))}`);
  }
}

/** Upload every file into the draft bucket, replacing same-named files the
 *  new-version draft inherited. When prune is set, draft files outside the
 *  selection are deleted too, so the draft holds exactly what publication
 *  would upload. Returns the local MD5 of each file, used to verify the
 *  published record below. */
async function uploadFiles(
  fetchImpl: typeof fetch,
  deps: ZenodoDeps,
  draftId: number,
  bucket: string,
  files: ZenodoFile[],
  prune = false,
): Promise<Map<string, string>> {
  const inherited = await draftFileIds(fetchImpl, deps, draftId);
  if (prune) {
    const keep = new Set(files.map((f) => f.filename));
    for (const [name, id] of inherited) {
      if (!keep.has(name)) await deleteDraftFile(fetchImpl, deps, draftId, id, name);
    }
  }
  const md5s = new Map<string, string>();
  for (const file of files) {
    const old = inherited.get(file.filename);
    if (old !== undefined) {
      await deleteDraftFile(fetchImpl, deps, draftId, old, file.filename);
    }
    const put = await fetchImpl(`${bucket}/${encodeURIComponent(file.filename)}?access_token=${encodeURIComponent(deps.token)}`, {
      method: 'PUT',
      headers: { 'Content-Type': file.contentType },
      body: file.data as BodyInit,
    });
    if (!put.ok) throw new Error(`zenodo upload of ${file.filename} failed (${put.status})${await readError(put).then((d) => (d ? `: ${d}` : ''))}`);
    md5s.set(file.filename, md5Hex(file.data));
  }
  return md5s;
}

/** Read an existing unpublished draft deposition: its id and its file
 *  bucket. Throws when the deposition is gone or carries no bucket. */
export async function openDraft(
  deps: ZenodoDeps & { draftDepositionId: number },
): Promise<{ id: number; bucket: string }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const { json } = await checked(
    fetchImpl,
    authed(deps.apiBase, `/deposit/depositions/${deps.draftDepositionId}`, deps.token),
    {},
    'draft read',
  );
  const id = json['id'];
  const bucket = (json['links'] as Record<string, unknown> | undefined)?.['bucket'];
  if (typeof id !== 'number' || typeof bucket !== 'string') throw new Error('zenodo draft read returned no draft');
  return { id, bucket };
}

/** The DOI Zenodo reserved for this draft deposition: the prereserved DOI
 *  when present, else the record DOI. Throws when neither is present. */
export function reservedDoiOf(draft: Record<string, unknown>): string {
  const metadata = draft['metadata'];
  if (typeof metadata === 'object' && metadata !== null) {
    const prereserve = (metadata as Record<string, unknown>)['prereserve_doi'];
    if (typeof prereserve === 'object' && prereserve !== null) {
      const doi = (prereserve as Record<string, unknown>)['doi'];
      if (typeof doi === 'string' && doi !== '') return doi;
    }
  }
  const doi = draft['doi'];
  if (typeof doi === 'string' && doi !== '') return doi;
  throw new Error('zenodo draft returned no reserved DOI');
}

/** Set the deposition metadata, shared by the draft and publish flows. */
async function setMetadata(
  fetchImpl: typeof fetch,
  deps: ZenodoDeps,
  draftId: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  await checked(
    fetchImpl,
    authed(deps.apiBase, `/deposit/depositions/${draftId}`, deps.token),
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metadata }) },
    'metadata set',
  );
}

export interface ZenodoDraftResult {
  draftDepositionId: number;
  reservedDoi: string;
}

/** Create (or update, when draftDepositionId names an existing draft) an
 *  unpublished Zenodo deposition: files uploaded, metadata set, DOI
 *  reserved. A new draft is a new version of priorDepositionId for a
 *  re-audit, exactly like publication, so publishing it later keeps the
 *  concept chain. The draft holds exactly the selected files. Never
 *  publishes and never deletes. */
export async function draftAudit(
  deps: ZenodoDeps & {
    metadata: Record<string, unknown>;
    files: ZenodoFile[];
    priorDepositionId?: number | null;
    draftDepositionId?: number | null;
  },
): Promise<ZenodoDraftResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const existing = deps.draftDepositionId ?? null;
  const draft = existing !== null ? await openDraft({ ...deps, draftDepositionId: existing }) : await createDraft(fetchImpl, deps, deps.priorDepositionId ?? null);
  await uploadFiles(fetchImpl, deps, draft.id, draft.bucket, deps.files, true);
  await setMetadata(fetchImpl, deps, draft.id, deps.metadata);
  const { json } = await checked(
    fetchImpl,
    authed(deps.apiBase, `/deposit/depositions/${draft.id}`, deps.token),
    {},
    'draft read',
  );
  return { draftDepositionId: draft.id, reservedDoi: reservedDoiOf(json) };
}

/** Delete an unpublished draft deposition. Throws when Zenodo refuses. */
export async function discardDraft(
  deps: ZenodoDeps & { draftDepositionId: number },
): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const res = await fetchImpl(authed(deps.apiBase, `/deposit/depositions/${deps.draftDepositionId}`, deps.token), {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`zenodo draft discard failed (${res.status})${await readError(res).then((d) => (d ? `: ${d}` : ''))}`);
  }
}

/** Publish the draft and verify every uploaded file against the record's
 *  MD5 checksum: the SHA-256 was already checked against the catalogue
 *  before upload, the record side is checked here. When draftDepositionId
 *  names an existing draft, that draft is published as-is; otherwise a new
 *  draft is created. A created draft is removed when publishing fails; a
 *  reused draft is kept so the operator can retry. */
export async function depositAudit(
  deps: ZenodoDeps & {
    metadata: Record<string, unknown>;
    files: ZenodoFile[];
    priorDepositionId?: number | null;
    draftDepositionId?: number | null;
  },
): Promise<ZenodoDepositResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const existing = deps.draftDepositionId ?? null;
  const created = existing === null;
  const draft = created ? await createDraft(fetchImpl, deps, deps.priorDepositionId ?? null) : await openDraft({ ...deps, draftDepositionId: existing });
  try {
    // A reused draft is pruned to the selection; a created draft keeps the
    // files a new-version draft inherits, as publication always has.
    const md5s = await uploadFiles(fetchImpl, deps, draft.id, draft.bucket, deps.files, existing !== null);
    await setMetadata(fetchImpl, deps, draft.id, deps.metadata);
    const { json: published } = await checked(
      fetchImpl,
      authed(deps.apiBase, `/deposit/depositions/${draft.id}/actions/publish`, deps.token),
      { method: 'POST' },
      'publish',
    );
    const versionDoi = published['doi'];
    const conceptDoi = published['conceptdoi'];
    const recordId = published['record_id'] ?? published['id'];
    if (typeof versionDoi !== 'string' || typeof conceptDoi !== 'string' || typeof recordId !== 'number') {
      throw new Error('zenodo publish returned no DOIs');
    }
    const { json: record } = await checked(
      fetchImpl,
      authed(deps.apiBase, `/records/${recordId}`, deps.token),
      {},
      'record read',
    );
    const recordFiles = Array.isArray(record['files']) ? (record['files'] as Record<string, unknown>[]) : [];
    for (const [filename, md5] of md5s) {
      const match = recordFiles.find((f) => f['key'] === filename || f['filename'] === filename);
      const checksum = typeof match?.['checksum'] === 'string' ? (match['checksum'] as string) : '';
      if (checksum !== `md5:${md5}`) {
        throw new Error(`zenodo record checksum mismatch for ${filename}: expected md5:${md5}, got ${checksum || 'nothing'}`);
      }
    }
    return { versionDoi, conceptDoi, recordId };
  } catch (err) {
    // A failed deposit on a created draft leaves it behind: remove it so a
    // retry starts clean. A reused draft is kept so the operator can retry
    // the same draft.
    if (created) {
      try {
        await fetchImpl(authed(deps.apiBase, `/deposit/depositions/${draft.id}`, deps.token), { method: 'DELETE' });
      } catch {
        // The draft cleanup is best effort; the original error is what matters.
      }
    }
    throw err;
  }
}
