// Simple electronic signature: the evidence record is the strength of the
// signature. This module is pure (no R2, no fetch, no DOM) so the signing
// pages, the API functions and later the WhatsApp agent all share it.

/** A signing request as stored in the SIGN_DOCS bucket (`requests/<id>.json`). */
export interface SigningRequest {
  id: string;
  /** Human title of the document, named in the acceptance sentence. */
  title: string;
  /** Full name of the person who must sign. */
  signerName: string;
  /** Email whose control the signer proves before seeing the document. */
  signerEmail: string;
  /** Private audit page this request belongs to, if any. */
  auditSlug: string | null;
  /** SHA-256 of the exact PDF the lab accepted, lowercase hex. */
  origHash: string;
  /** ISO time the request was created. */
  createdAt: string;
  /** ISO time the lab accepted the PDF (FR1): same instant as creation. */
  labAcceptedAt: string;
  status: 'pending' | 'signed' | 'expired';
  /** ISO time the signature was completed, once signed. */
  signedAt: string | null;
  /** SHA-256 of the signed PDF (original pages + evidence page), once signed. */
  signedHash: string | null;
}

/** Milliseconds a signing link stays valid: 30 days (FR7). */
export const SIGN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Request ids: 128 bits, URL-safe, unguessable (the link is the capability). */
export function newRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of bytes as lowercase hex. WebCrypto only: runs in workerd,
//  modern browsers and Node ≥ 15 without a single dependency. */
export async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  // `Uint8Array.buffer` can be a resizable SharedArrayBuffer whose type the
  // digest signature does not take; a same-length copy is always accepted.
  const copy = new Uint8Array(buf.length);
  copy.set(buf);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True once the request is older than the 30-day window. Exactly 30 days
 *  still signs; 30 days and one second does not. */
export function isExpired(createdAt: string, now: number = Date.now()): boolean {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return true;
  return now - created > SIGN_TTL_MS;
}

/** A request can be signed exactly once, while pending and unexpired. */
export function canSign(req: SigningRequest, now: number = Date.now()): boolean {
  return req.status === 'pending' && !isExpired(req.createdAt, now);
}

/** The derived state a link shows instead of the form when it cannot sign. */
export type LinkState = 'ready' | 'signed' | 'expired';

export function linkState(req: SigningRequest, now: number = Date.now()): LinkState {
  if (req.status === 'signed') return 'signed';
  if (req.status === 'expired' || isExpired(req.createdAt, now)) return 'expired';
  return 'ready';
}

export interface EvidenceInput {
  signerName: string;
  idNumber: string;
  verifiedEmail: string;
  signedAt: Date;
  ip: string;
  userAgent: string;
  origHash: string;
  labAcceptedAt: string;
  requestId: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `2026-11-13 14:05:07 UTC-05:00`: the wall clock where the signer stood. */
export function formatBogota(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} UTC-05:00`;
}

/** `2026-11-13T19:05:07Z`: the same instant in UTC. */
export function formatUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

/** The evidence record (FR6): who signed what, when and from where, plus
 *  the lab's acceptance of that exact PDF. One record, two languages in
 *  the PDF page; this English text is the canonical string the tests pin. */
export function evidenceText(e: EvidenceInput): string {
  return [
    'EVIDENCE RECORD — SIMPLE ELECTRONIC SIGNATURE',
    `Signer: ${e.signerName}`,
    `ID number: ${e.idNumber}`,
    `Verified email: ${e.verifiedEmail}`,
    `Signed (Colombia): ${formatBogota(e.signedAt)}`,
    `Signed (UTC): ${formatUtc(e.signedAt)}`,
    `IP address: ${e.ip}`,
    `User agent: ${e.userAgent}`,
    `Original SHA-256: ${e.origHash}`,
    `Lab acceptance: ${e.labAcceptedAt}`,
    `Request: ${e.requestId}`,
  ].join('\n');
}

/** The operator's one line when a document is signed (FR9). */
export function signedNotice(title: string, id: string): string {
  return `Firmado: ${title} (${id})`;
}

/** The operator's one line is built in evidence.ts so the WhatsApp agent
 *  reuses the same record logic; the acceptance sentence lives in page.ts
 *  beside the form templates. */
