/**
 * The signing API: create, list, complete and serve files, with the lab's
 * acceptance record, the email-match rule and the one-signature rule. A fake
 * R2 bucket, a stub verifier and a stub fetch stand in for the edge; pdf-lib
 * runs for real, so the signed PDF assertions mean something.
 *
 * @jest-environment node
 */
import { PDFDocument } from 'pdf-lib';
import {
  handleCreateRequest,
  handleListRequests,
  handleSignComplete,
  handleSignFile,
  type SignDeps,
  type SignEnv,
} from '../lib/sign/handlers';
import { sha256Hex } from '../lib/sign/evidence';
import type { SignBucket } from '../lib/sign/store';

const NOW = Date.parse('2026-11-13T19:00:00.000Z');
const OWNER = 'owner@univerlab.org';
const SIGNER = 'maria@example.com';
const TITLE = 'Service order 7';

function makeBucket(): SignBucket & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  const freeze = (v: Uint8Array | ArrayBuffer | string): Uint8Array => {
    if (typeof v === 'string') return new TextEncoder().encode(v);
    const u = v instanceof Uint8Array ? v : new Uint8Array(v);
    const copy = new Uint8Array(u.length);
    copy.set(u);
    return copy;
  };
  return {
    files,
    async get(key: string) {
      const b = files.get(key);
      if (!b) return null;
      return {
        body: b,
        text: async () => Buffer.from(b).toString('utf8'),
        arrayBuffer: async () => {
          const copy = new Uint8Array(b.length);
          copy.set(b);
          return copy.buffer as ArrayBuffer;
        },
      };
    },
    async put(key: string, value: Uint8Array | ArrayBuffer | string) {
      files.set(key, freeze(value));
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      return { objects: [...files.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

interface SeenCall {
  url: string;
  init?: RequestInit;
}

function makeFetch(): { calls: SeenCall[]; fetch: typeof globalThis.fetch } {
  const calls: SeenCall[] = [];
  const fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

const verify = async (token: string): Promise<string | null> => {
  if (token === 'owner-jwt') return OWNER;
  if (token === 'signer-jwt') return SIGNER;
  if (token === 'stranger-jwt') return 'stranger@example.com';
  return null;
};

type FetchImpl = typeof globalThis.fetch;

function envOf(bucket: SignBucket, fetchImpl: FetchImpl, extra: Partial<SignEnv> = {}): SignEnv {
  return {
    SIGN_DOCS: bucket,
    SIGN_OWNER_EMAILS: OWNER,
    RESEND_API_KEY: 'test-key',
    SIGN_NOTIFY_URL: 'https://hooks.test/internal/signed',
    SIGN_NOTIFY_SECRET: 's3cret',
    ...extra,
  };
}

const depsOf = (fetchImpl: FetchImpl, now: () => number = () => NOW): SignDeps => ({ verify, fetchImpl, now });

async function mintPdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]);
  return new Uint8Array(await doc.save());
}

function createForm(pdf: Uint8Array, over: Record<string, string> = {}): FormData {
  const form = new FormData();
  // A fresh ArrayBuffer: File wants BlobPart, never a shared-buffer view.
  const copy = new Uint8Array(pdf.length);
  copy.set(pdf);
  form.set('pdf', new File([copy.buffer as ArrayBuffer], 'service-order.pdf', { type: 'application/pdf' }));
  form.set('title', TITLE);
  form.set('name', 'María López');
  form.set('email', SIGNER);
  form.set('lang', 'en');
  for (const [k, v] of Object.entries(over)) form.set(k, v);
  return form;
}

const post = (path: string, body: FormData | string, token?: string, jsonBody = false): Request =>
  new Request(`https://univerlab.org${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}),
      ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  });

async function createOk(
  bucket: SignBucket,
  fetchImpl: FetchImpl,
  over: Record<string, string> = {},
  pdf?: Uint8Array,
): Promise<{ id: string; link: string; hash: string }> {
  const bytes = pdf ?? (await mintPdf());
  const res = await handleCreateRequest(
    post('/api/sign-request', createForm(bytes, over), 'owner-jwt'),
    envOf(bucket, fetchImpl),
    depsOf(fetchImpl),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean; id: string; link: string };
  expect(body.ok).toBe(true);
  return { id: body.id, link: body.link, hash: await sha256Hex(bytes) };
}

describe('handleCreateRequest', () => {
  it('refuses anonymous callers', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const res = await handleCreateRequest(
      post('/api/sign-request', createForm(await mintPdf())),
      envOf(bucket, fetch),
      depsOf(fetch),
    );
    expect(res.status).toBe(401);
  });

  it('refuses non-owner addresses', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const res = await handleCreateRequest(
      post('/api/sign-request', createForm(await mintPdf()), 'stranger-jwt'),
      envOf(bucket, fetch),
      depsOf(fetch),
    );
    expect(res.status).toBe(403);
  });

  it('refuses a non-PDF upload', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const form = createForm(new TextEncoder().encode('hello, not a pdf'));
    const res = await handleCreateRequest(post('/api/sign-request', form, 'owner-jwt'), envOf(bucket, fetch), depsOf(fetch));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('pdf');
  });

  it('refuses an oversized PDF', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode('%PDF-'));
    const form = createForm(big);
    const res = await handleCreateRequest(post('/api/sign-request', form, 'owner-jwt'), envOf(bucket, fetch), depsOf(fetch));
    expect(res.status).toBe(400);
  });

  it('records the lab acceptance and returns the signer link', async () => {
    const bucket = makeBucket();
    const { calls, fetch } = makeFetch();
    const { id, link, hash } = await createOk(bucket, fetch, { auditSlug: 'audit-7' });
    expect(link).toBe(`https://univerlab.org/sign/${id}`);
    const sidecar = JSON.parse(
      Buffer.from(bucket.files.get(`requests/${id}.json`)!).toString('utf8'),
    ) as Record<string, unknown>;
    expect(sidecar['title']).toBe(TITLE);
    expect(sidecar['signerEmail']).toBe(SIGNER);
    expect(sidecar['auditSlug']).toBe('audit-7');
    expect(sidecar['origHash']).toBe(hash);
    expect(sidecar['status']).toBe('pending');
    // The lab's acceptance of that exact PDF is recorded at creation.
    expect(sidecar['labAcceptedAt']).toBe(sidecar['createdAt']);
    expect(bucket.files.get(`originals/${id}.pdf`)!.length).toBeGreaterThan(0);
    const invite = calls.find((c) => c.url === 'https://api.resend.com/emails');
    expect(invite).toBeDefined();
    const payload = JSON.parse(String(invite!.init!.body)) as { from: string; to: string[] };
    expect(payload.from).toContain('@univerlab.org');
    expect(payload.to).toEqual([SIGNER]);
  });

  it('works with no mail key: nothing is emailed, nothing fails', async () => {
    const bucket = makeBucket();
    const { calls, fetch } = makeFetch();
    const bytes = await mintPdf();
    const res = await handleCreateRequest(
      post('/api/sign-request', createForm(bytes), 'owner-jwt'),
      envOf(bucket, fetch, { RESEND_API_KEY: undefined }),
      depsOf(fetch),
    );
    expect(res.status).toBe(200);
    expect(calls.filter((c) => c.url === 'https://api.resend.com/emails')).toHaveLength(0);
  });
});

describe('handleListRequests', () => {
  it('lists every request with its live state to the owner only', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const { id } = await createOk(bucket, fetch);
    const denied = await handleListRequests(
      new Request('https://univerlab.org/api/sign-request', { headers: { 'Cf-Access-Jwt-Assertion': 'signer-jwt' } }),
      envOf(bucket, fetch),
      depsOf(fetch),
    );
    expect(denied.status).toBe(403);
    const res = await handleListRequests(
      new Request('https://univerlab.org/api/sign-request', { headers: { 'Cf-Access-Jwt-Assertion': 'owner-jwt' } }),
      envOf(bucket, fetch),
      depsOf(fetch),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; requests: { id: string; state: string }[] };
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].id).toBe(id);
    expect(body.requests[0].state).toBe('ready');
  });
});

describe('handleSignComplete', () => {
  const complete = (id: string, over: Record<string, unknown> = {}, token = 'signer-jwt', hash?: string) =>
    post(
      '/api/sign-complete',
      JSON.stringify({ id, name: 'María López', idNumber: '12345678', accept: true, hash, ...over }),
      token,
      true,
    );

  it('signs once: original pages plus one evidence page, hash shown', async () => {
    const bucket = makeBucket();
    const { calls, fetch } = makeFetch();
    const orig = await mintPdf(2);
    const { id, hash } = await createOk(bucket, fetch, {}, orig);
    const res = await handleSignComplete(complete(id, {}, 'signer-jwt', hash), envOf(bucket, fetch), depsOf(fetch));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; signedHash: string };
    expect(body.ok).toBe(true);
    expect(body.signedHash).toMatch(/^[0-9a-f]{64}$/);

    const stored = bucket.files.get(`signed/${id}.pdf`)!;
    expect(await sha256Hex(stored)).toBe(body.signedHash);
    const signed = await PDFDocument.load(stored);
    const before = await PDFDocument.load(orig);
    expect(signed.getPageCount()).toBe(3);
    const kept = signed.getPage(0).getSize();
    expect([kept.width, kept.height]).toEqual([before.getPage(0).getSize().width, before.getPage(0).getSize().height]);

    const sidecar = JSON.parse(Buffer.from(bucket.files.get(`requests/${id}.json`)!).toString('utf8')) as Record<
      string,
      unknown
    >;
    expect(sidecar['status']).toBe('signed');
    expect(sidecar['signedHash']).toBe(body.signedHash);

    const notice = calls.find((c) => c.url === 'https://hooks.test/internal/signed');
    expect(notice).toBeDefined();
    expect(JSON.parse(String(notice!.init!.body)) as { text: string }).toEqual({ text: `Firmado: ${TITLE} (${id})` });
    const copy = calls.filter((c) => c.url === 'https://api.resend.com/emails');
    expect(copy).toHaveLength(2);
    const payload = JSON.parse(String(copy[1].init!.body)) as { attachments: { filename: string; content: string }[] };
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].content.length).toBeGreaterThan(0);
  });

  it('mails the signed copy in the signer page language, Spanish by default', async () => {
    const bucket = makeBucket();
    const { calls, fetch } = makeFetch();
    const { id, hash } = await createOk(bucket, fetch);
    const env = envOf(bucket, fetch);
    const deps = depsOf(fetch);
    const esRes = await handleSignComplete(complete(id, {}, 'signer-jwt', hash), env, deps);
    expect(esRes.status).toBe(200);
    const esCopy = calls.filter((c) => c.url === 'https://api.resend.com/emails').pop()!;
    expect(JSON.parse(String(esCopy.init!.body)).subject).toContain('Documento firmado');

    const bucket2 = makeBucket();
    const seen2 = makeFetch();
    const created = await createOk(bucket2, seen2.fetch);
    const enRes = await handleSignComplete(
      complete(created.id, { lang: 'en' }, 'signer-jwt', created.hash),
      envOf(bucket2, seen2.fetch),
      depsOf(seen2.fetch),
    );
    expect(enRes.status).toBe(200);
    const enCopy = seen2.calls.filter((c) => c.url === 'https://api.resend.com/emails').pop()!;
    expect(JSON.parse(String(enCopy.init!.body)).subject).toContain('Signed document');
  });

  it('refuses a second signature on the same link', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const { id, hash } = await createOk(bucket, fetch);
    const env = envOf(bucket, fetch);
    const deps = depsOf(fetch);
    const first = await handleSignComplete(complete(id, {}, 'signer-jwt', hash), env, deps);
    expect(first.status).toBe(200);
    const second = await handleSignComplete(complete(id, {}, 'signer-jwt', hash), env, deps);
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe('signed');
  });

  it('rejects a changed document: the hash must match the accepted one', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const { id } = await createOk(bucket, fetch);
    const res = await handleSignComplete(
      complete(id, {}, 'signer-jwt', 'f'.repeat(64)),
      envOf(bucket, fetch),
      depsOf(fetch),
    );
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe('hash');
    const sidecar = JSON.parse(Buffer.from(bucket.files.get(`requests/${id}.json`)!).toString('utf8')) as Record<
      string,
      unknown
    >;
    expect(sidecar['status']).toBe('pending');
  });

  it('rejects a stranger wearing a valid token for another address', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const { id, hash } = await createOk(bucket, fetch);
    const res = await handleSignComplete(
      complete(id, {}, 'stranger-jwt', hash),
      envOf(bucket, fetch),
      depsOf(fetch),
    );
    expect(res.status).toBe(403);
  });

  it('marks an old link expired instead of signing it', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const { id, hash } = await createOk(bucket, fetch);
    const sidecar = JSON.parse(Buffer.from(bucket.files.get(`requests/${id}.json`)!).toString('utf8')) as Record<
      string,
      unknown
    >;
    sidecar['createdAt'] = new Date(NOW - 31 * 24 * 60 * 60 * 1000).toISOString();
    bucket.files.set(`requests/${id}.json`, new TextEncoder().encode(JSON.stringify(sidecar)));
    const res = await handleSignComplete(
      complete(id, {}, 'signer-jwt', hash),
      envOf(bucket, fetch),
      depsOf(fetch),
    );
    expect(res.status).toBe(410);
  });

  it('requires the acceptance tick', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const { id, hash } = await createOk(bucket, fetch);
    const res = await handleSignComplete(
      complete(id, { accept: false }, 'signer-jwt', hash),
      envOf(bucket, fetch),
      depsOf(fetch),
    );
    expect(res.status).toBe(400);
  });
});

describe('handleSignFile', () => {
  const get = (id: string, signed: boolean, token?: string): Request =>
    new Request(`https://univerlab.org/api/sign-file?id=${id}${signed ? '&signed=1' : ''}`, {
      headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {},
    });

  it('serves the original to the verified email, the signed copy after signing', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const { id, hash } = await createOk(bucket, fetch);
    const env = envOf(bucket, fetch);
    const deps = depsOf(fetch);
    const before = await handleSignFile(get(id, true, 'signer-jwt'), env, deps);
    expect(before.status).toBe(404);
    const orig = await handleSignFile(get(id, false, 'signer-jwt'), env, deps);
    expect(orig.status).toBe(200);
    expect(orig.headers.get('Content-Type')).toBe('application/pdf');
    const denied = await handleSignFile(get(id, false, 'stranger-jwt'), env, deps);
    expect(denied.status).toBe(403);
    const signed = await handleSignComplete(
      post(
        '/api/sign-complete',
        JSON.stringify({ id, name: 'María López', idNumber: '12345678', accept: true, hash }),
        'signer-jwt',
        true,
      ),
      env,
      deps,
    );
    expect(signed.status).toBe(200);
    const copy = await handleSignFile(get(id, true, 'signer-jwt'), env, deps);
    expect(copy.status).toBe(200);
    expect(copy.headers.get('Content-Disposition')).toContain('attachment');
    const ownerCopy = await handleSignFile(get(id, true, 'owner-jwt'), env, deps);
    expect(ownerCopy.status).toBe(200);
  });

  it('answers 401 with no token', async () => {
    const bucket = makeBucket();
    const { fetch } = makeFetch();
    const { id } = await createOk(bucket, fetch);
    const res = await handleSignFile(get(id, false), envOf(bucket, fetch), depsOf(fetch));
    expect(res.status).toBe(401);
  });
});
