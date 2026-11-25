// Control-room audit intake (FR1): edge-safe helpers shared by the panel
// client (preview before upload) and the upload handler (server recheck).
// No node:* imports, no new dependency: .zip files are read with the
// platform's own DecompressionStream, hashes with crypto.subtle.

export const MAX_FILES = 300;
export const MAX_FILE = 25 * 1024 * 1024;
export const MAX_TOTAL = 200 * 1024 * 1024;

export const ADMIN_UPLOAD_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export interface UploadIssue {
  path: string;
  message: string;
}

/** The system a slug belongs to: the slug minus a trailing -YYYY-MM[-DD]
 *  audit date, or the slug itself when there is no date to strip. Same rule
 *  as scripts/audit.ts deriveSystem. */
export function deriveSystem(name: string): string {
  const stripped = name.replace(/-\d{4}-\d{2}(-\d{2})?$/, '');
  if (stripped !== '' && ADMIN_UPLOAD_SLUG_RE.test(stripped)) return stripped;
  return name;
}

/** The edition defaults to the slug (or folder name), like the CLI. */
export function deriveEdition(name: string): string {
  return name;
}

/** Propose the system/edition pair for a folder or slug, or null when the
 *  name itself is not a valid slug segment. */
export function proposeTarget(name: string): { system: string; edition: string } | null {
  const base = name.trim().replace(/\/+$/, '');
  if (!ADMIN_UPLOAD_SLUG_RE.test(base)) return null;
  return { system: deriveSystem(base), edition: deriveEdition(base) };
}

type Doc = Record<string, unknown>;

function isRecord(v: unknown): v is Doc {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A staged file name escapes the audit folder when it is absolute, carries
 *  a backslash, or resolves outside the folder through `..`. */
export function uploadNameEscapes(name: string): boolean {
  if (name === '' || name.startsWith('/') || name.includes('\\')) return true;
  const parts = name.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return true;
  return false;
}

/** Catalogue paths of the document, or null when the shape is unusable. */
function cataloguePaths(doc: unknown): string[] | null {
  if (!isRecord(doc) || !Array.isArray(doc['assets'])) return null;
  const paths: string[] = [];
  for (const a of doc['assets'] as unknown[]) {
    if (!isRecord(a) || typeof a['path'] !== 'string' || a['path'] === '') return null;
    paths.push(a['path']);
  }
  return paths;
}

export interface UploadFile {
  name: string;
  bytes: Uint8Array;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input: Uint8Array<ArrayBuffer> = new Uint8Array(bytes.length);
  input.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Full server-and-preview check of one upload: escape, catalogue match,
 *  count/size caps, and bytes+sha256 against the catalogue. Every problem
 *  carries its JSON path; nothing is stored while any remains. */
export async function validateUploadEntries(files: UploadFile[], doc: unknown): Promise<UploadIssue[]> {
  const issues: UploadIssue[] = [];
  if (!isRecord(doc)) {
    issues.push({ path: 'audit.json', message: 'audit.json is not a JSON object' });
    return issues;
  }
  if (files.length > MAX_FILES) {
    issues.push({ path: 'audit.json', message: `upload holds ${files.length} files but at most ${MAX_FILES} are allowed` });
  }
  let total = 0;
  for (const f of files) {
    total += f.bytes.length;
    if (f.bytes.length > MAX_FILE) {
      issues.push({ path: `$.assets: '${f.name}'`, message: `file '${f.name}' is ${f.bytes.length} bytes but at most ${MAX_FILE} are allowed` });
    }
  }
  if (total > MAX_TOTAL) {
    issues.push({ path: 'audit.json', message: `upload is ${total} bytes in total but at most ${MAX_TOTAL} are allowed` });
  }
  for (const f of files) {
    if (uploadNameEscapes(f.name)) {
      issues.push({ path: `$.assets: '${f.name}'`, message: `file name '${f.name}' escapes the audit folder` });
    }
  }
  const paths = cataloguePaths(doc);
  if (paths === null) {
    issues.push({ path: '$.assets', message: 'the asset catalogue cannot be read' });
    return issues;
  }
  for (const p of paths) {
    if (uploadNameEscapes(p)) {
      issues.push({ path: '$.assets', message: `asset path '${p}' escapes the audit folder` });
    }
  }
  const byName = new Map(files.map((f) => [f.name, f]));
  if (!byName.has('audit.json')) {
    issues.push({ path: 'audit.json', message: 'audit.json is missing from the upload' });
  }
  for (const p of new Set(paths)) {
    if (!byName.has(p)) {
      issues.push({ path: '$.assets', message: `asset file '${p}' is missing from the upload` });
    }
  }
  const catalogued = new Set([...paths, 'audit.json']);
  for (const f of files) {
    if (!catalogued.has(f.name)) {
      issues.push({ path: `$.assets: '${f.name}'`, message: `file '${f.name}' is not in the catalogue` });
    }
  }
  if (!Array.isArray(doc['assets'])) return issues;
  const seen = new Set<string>();
  const assets = doc['assets'] as unknown[];
  for (let i = 0; i < assets.length; i += 1) {
    const a = assets[i];
    if (!isRecord(a) || typeof a['path'] !== 'string' || a['path'] === '') continue;
    if (seen.has(a['path'])) continue;
    seen.add(a['path']);
    const file = byName.get(a['path']);
    if (!file || uploadNameEscapes(a['path'])) continue;
    if (typeof a['bytes'] === 'number' && Number.isInteger(a['bytes'])) {
      if (file.bytes.length !== a['bytes']) {
        issues.push({
          path: `$.assets[${i}].bytes`,
          message: `asset file '${a['path']}' is ${file.bytes.length} bytes, catalogue says ${a['bytes']}`,
        });
      }
    }
    if (typeof a['sha256'] === 'string' && /^[0-9a-fA-F]{64}$/.test(a['sha256'])) {
      const digest = await sha256Hex(file.bytes);
      if (digest.toLowerCase() !== a['sha256'].toLowerCase()) {
        issues.push({
          path: `$.assets[${i}].sha256`,
          message: `asset file '${a['path']}' hash does not match the catalogue`,
        });
      }
    }
  }
  return issues;
}

/** The document as the upload stores it: always private, whatever the
 *  document says — publishing stays a separate action with its own rules.
 *  A stored private audit needs a reader allowlist, so an allowlist-less
 *  document gains the acting owner instead of failing validation later. */
export function forcePrivate(doc: Doc, owner: string): Doc {
  const next: Doc = { ...doc, visibility: 'private' };
  const emails = isRecord(next['access']) && Array.isArray(next['access']['emails'])
    ? (next['access']['emails'] as unknown[]).filter((e): e is string => typeof e === 'string' && e !== '')
    : [];
  if (emails.length === 0) next['access'] = { emails: [owner] };
  return next;
}

export interface UploadPreview {
  title: string;
  client: string;
  language: string;
  version: string;
  findings: { total: number; bySeverity: Record<string, number> };
  files: number;
  totalSize: number;
}

/** What the panel preview shows of a read folder or .zip: title, client,
 *  language, version, findings by severity, file count and total size. */
export function summarizeUpload(doc: unknown, files: UploadFile[]): UploadPreview {
  const meta = isRecord(doc) && isRecord(doc['meta']) ? doc['meta'] : {};
  const client = isRecord(meta['client']) && typeof meta['client']['name'] === 'string'
    ? (meta['client']['name'] as string)
    : '';
  const findings = isRecord(doc) && Array.isArray(doc['findings']) ? (doc['findings'] as unknown[]) : [];
  const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    if (isRecord(f) && typeof f['severity'] === 'string' && f['severity'] in bySeverity) {
      bySeverity[f['severity']] += 1;
    }
  }
  return {
    title: typeof meta['title'] === 'string' ? (meta['title'] as string) : '',
    client,
    language: typeof meta['language'] === 'string' ? (meta['language'] as string) : '',
    version: typeof meta['version'] === 'string' ? (meta['version'] as string) : '',
    findings: { total: findings.length, bySeverity },
    files: files.length,
    totalSize: files.reduce((n, f) => n + f.bytes.length, 0),
  };
}

// --- Minimal .zip reader: stored + deflate, no dependency. ---

function u16(view: DataView, at: number): number {
  return view.getUint16(at, true);
}

function u32(view: DataView, at: number): number {
  return view.getUint32(at, true);
}

function findEocd(bytes: Uint8Array): number {
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      const commentLen = bytes[i + 20] | (bytes[i + 21] << 8);
      if (i + 22 + commentLen === bytes.length) return i;
    }
    if (i < bytes.length - 22 - 65535) break;
  }
  return -1;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const input: Uint8Array<ArrayBuffer> = new Uint8Array(data.length);
  input.set(data);
  const stream = new Response(input).body?.pipeThrough(new DecompressionStream('deflate-raw'));
  if (!stream) throw new Error('deflate unavailable');
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/** Read every file out of a .zip: stored entries verbatim, deflated ones
 *  through DecompressionStream. Refuses encrypted and spanned archives and
 *  anything but stored/deflate. Directory entries are skipped. */
export async function parseZipCentralDirectory(bytes: Uint8Array): Promise<UploadFile[]> {
  const eocd = findEocd(bytes);
  if (eocd < 0) throw new Error('not a .zip archive: end of central directory not found');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const diskNumber = u16(view, eocd + 4);
  const cdDisk = u16(view, eocd + 6);
  const cdCount = u16(view, eocd + 10);
  const cdOffset = u32(view, eocd + 16);
  if (diskNumber !== 0 || cdDisk !== 0) throw new Error('spanned .zip archives are not accepted');
  const decoder = new TextDecoder('utf-8');
  const files: UploadFile[] = [];
  let at = cdOffset;
  for (let i = 0; i < cdCount; i += 1) {
    if (u32(view, at) !== 0x02014b50) throw new Error('not a .zip archive: central directory is corrupt');
    const flags = u16(view, at + 8);
    const method = u16(view, at + 10);
    const compSize = u32(view, at + 20);
    const nameLen = u16(view, at + 28);
    const extraLen = u16(view, at + 30);
    const commentLen = u16(view, at + 32);
    const localOffset = u32(view, at + 42);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if ((flags & 0x1) !== 0) throw new Error(`encrypted .zip entry '${name}' is not accepted`);
    if (method !== 0 && method !== 8) throw new Error(`unsupported .zip compression in '${name}'`);
    if (u32(view, localOffset) !== 0x04034b50) throw new Error('not a .zip archive: local header is corrupt');
    const localNameLen = u16(view, localOffset + 26);
    const localExtraLen = u16(view, localOffset + 28);
    const dataAt = localOffset + 30 + localNameLen + localExtraLen;
    const comp = bytes.subarray(dataAt, dataAt + compSize);
    if (comp.length !== compSize) throw new Error('not a .zip archive: entry data is truncated');
    files.push({ name, bytes: method === 0 ? comp.slice() : await inflateRaw(comp) });
  }
  return files;
}

/** When a .zip was created by archiving the audit folder itself (so every
 *  entry sits under `<folder>/audit.json` instead of `audit.json` at root),
 *  strip that single common top-level directory. */
export function unwrapZipRoot(files: UploadFile[]): UploadFile[] {
  if (files.length === 0 || files.some((f) => f.name === 'audit.json')) return files;
  const firstSlash = files[0].name.indexOf('/');
  if (firstSlash <= 0) return files;
  const top = files[0].name.slice(0, firstSlash);
  if (top === '.' || top === '..') return files;
  const prefix = `${top}/`;
  if (!files.every((f) => f.name.startsWith(prefix)) || !files.some((f) => f.name === `${prefix}audit.json`)) {
    return files;
  }
  return files.map((f) => ({ name: f.name.slice(prefix.length), bytes: f.bytes }));
}
