// Private storage for the signing flow (FR8): originals, signed PDFs and
// their JSON sidecars live in the SIGN_DOCS R2 bucket and are never public.
// The JSON mirror follows the AUDITS pattern — R2 holds the bytes, a small
// sidecar holds what listings need without reading the PDFs.

import type { SigningRequest } from './evidence';

/** The R2 surface the signing flow needs: reads, writes and a prefix list. */
export interface SignBucket {
  get(key: string): Promise<{ body: ReadableStream | Uint8Array | string | null; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: Uint8Array | ArrayBuffer | string, opts?: { httpMetadata?: { contentType?: string } }): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ objects: { key: string }[] }>;
}

export const requestKey = (id: string): string => `requests/${id}.json`;
export const originalKey = (id: string): string => `originals/${id}.pdf`;
export const signedKey = (id: string): string => `signed/${id}.pdf`;

/** Request ids are hex tokens minted by the lab, never user input to trust. */
export function isRequestId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{32}$/.test(id);
}

function isRequest(v: unknown): v is SigningRequest {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r['id'] === 'string' &&
    typeof r['title'] === 'string' &&
    typeof r['signerEmail'] === 'string' &&
    typeof r['origHash'] === 'string' &&
    typeof r['createdAt'] === 'string'
  );
}

export async function loadRequest(bucket: SignBucket | undefined, id: string): Promise<SigningRequest | null> {
  try {
    if (!bucket || !isRequestId(id)) return null;
    const obj = await bucket.get(requestKey(id));
    if (!obj) return null;
    const parsed: unknown = JSON.parse(await obj.text());
    return isRequest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveRequest(bucket: SignBucket, req: SigningRequest): Promise<void> {
  await bucket.put(requestKey(req.id), JSON.stringify(req), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}

/** Every request sidecar, newest first. Only metadata is read, never PDFs. */
export async function listRequests(bucket: SignBucket | undefined): Promise<SigningRequest[]> {
  try {
    if (!bucket?.list) return [];
    const listed = await bucket.list({ prefix: 'requests/' });
    const out: SigningRequest[] = [];
    for (const obj of listed.objects) {
      const m = /^requests\/([0-9a-f]{32})\.json$/.exec(obj.key);
      if (!m) continue;
      const req = await loadRequest(bucket, m[1]);
      if (req) out.push(req);
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}
