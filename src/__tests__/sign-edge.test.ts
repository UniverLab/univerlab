/**
 * The signing edge: a mismatched or missing Access session sees the identity
 * notice (masked link address, switch-account logout, no form or PDF); the
 * signer sees the form; the owner console opens to an owner token from the
 * second AUD; every other owner/shell peek answers the site 404 page.
 *
 * @jest-environment node
 *
 * Node rather than jsdom: the middleware is exercised end to end and needs
 * `Request` / `Response`, which jsdom does not ship.
 */

import { onRequest, resetAccessKeyCacheForTests } from '../../functions/_middleware';

const TEAM = 'univerlab.cloudflareaccess.com';
const AUD = 'test-site-app-aud';
const OWNER_AUD = 'test-owner-app-aud';
const KID = 'test-key-1';
const OWNER = 'owner@univerlab.org';
const SIGNER = 'maria@example.com';
const REQ_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const SHELL =
  '<html lang="en"><head><title>Sign — UniverLab</title>' +
  '<meta name="description" content="Sign a document.">' +
  '<link rel="canonical" href="https://univerlab.org/sign-shell/"></head>' +
  '<body><div id="sign"></div></body></html>';

const NOT_FOUND_PAGE = '<html lang="en"><head><title>Not found</title></head><body><h1>Page not found</h1></body></html>';

function requestDoc() {
  return {
    id: REQ_ID,
    title: 'Service order 7',
    signerName: 'Maria Perez',
    signerEmail: SIGNER,
    auditSlug: null,
    origHash: 'ab'.repeat(32),
    createdAt: new Date().toISOString(),
    labAcceptedAt: new Date().toISOString(),
    status: 'pending',
    signedAt: null,
    signedHash: null,
  };
}

/** In-memory SIGN_DOCS bucket holding the one pending request. */
function makeSignDocs() {
  const doc = JSON.stringify(requestDoc());
  return {
    async get(key: string) {
      if (key !== `requests/${REQ_ID}.json`) return null;
      return {
        body: doc,
        text: async () => doc,
        arrayBuffer: async () => new TextEncoder().encode(doc).buffer as ArrayBuffer,
      };
    },
    async list() {
      return { objects: [{ key: `requests/${REQ_ID}.json` }] };
    },
  };
}

function assetsFetch(url: string | URL | Request): Promise<Response> {
  const href = String(url);
  if (href.endsWith('/404.html')) {
    return Promise.resolve(new Response(NOT_FOUND_PAGE, { status: 200 }));
  }
  return Promise.resolve(new Response(SHELL, { status: 200 }));
}

function accessEnv(extra?: Record<string, unknown>) {
  return {
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: `${AUD}, ${OWNER_AUD}`,
    SIGN_OWNER_EMAILS: OWNER,
    ...extra,
  };
}

function context(pathname: string, opts?: { token?: string; envExtra?: Record<string, unknown> }) {
  const headers: Record<string, string> = { Accept: 'text/html' };
  if (opts?.token) headers['Cf-Access-Jwt-Assertion'] = opts.token;
  return {
    request: new Request(`https://univerlab.org${pathname}`, { headers }),
    env: {
      ASSETS: { fetch: jest.fn(assetsFetch) },
      SIGN_DOCS: makeSignDocs(),
      ...accessEnv(opts?.envExtra),
    },
    next: jest.fn(async () => new Response('origin page', { status: 200 })),
  };
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlJson(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}

interface MintOpts {
  key: CryptoKey;
  aud?: unknown;
  email?: unknown;
}

/** A JWT minted with the given RSA private key for the test team. */
async function mint(opts: MintOpts): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const payload = {
    aud: opts.aud ?? AUD,
    iss: `https://${TEAM}`,
    exp: now + 3600,
    email: opts.email ?? SIGNER,
  };
  const input = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, opts.key, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

let signKey!: CryptoKey;
let jwksKeys: Record<string, unknown>[] = [];

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  signKey = pair.privateKey;
  const pubJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Record<string, unknown>;
  jwksKeys = [{ ...pubJwk, kid: KID, alg: 'RS256', use: 'sig' }];
});

beforeEach(() => {
  resetAccessKeyCacheForTests();
  delete (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter;
  (globalThis as unknown as { fetch?: unknown }).fetch = jest.fn(async (url: string | URL | Request) => {
    if (String(url) === `https://${TEAM}/cdn-cgi/access/certs`) {
      return { ok: true, json: async () => ({ keys: jwksKeys }) };
    }
    throw new Error(`unexpected fetch ${String(url)}`);
  });
});

afterEach(() => {
  delete (globalThis as unknown as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

const signPath = `/sign/${REQ_ID}/`;

describe('signing page identity', () => {
  it('shows the identity notice with the masked address and the logout link on a wrong address', async () => {
    const token = await mint({ key: signKey, email: 'stranger@example.com' });
    const ctx = context(signPath, { token });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('This link is for another address');
    expect(body).toContain('m•••@example.com');
    expect(body).toContain(`https://${TEAM}/cdn-cgi/access/logout`);
    expect(body).not.toContain('id="sign-form"');
    expect(body).not.toContain('<iframe');
  });

  it('shows the notice with no form on a missing session', async () => {
    const ctx = context(signPath);
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('This link is for another address');
    expect(body).not.toContain('id="sign-form"');
    expect(body).not.toContain('<iframe');
  });

  it('shows the form and the PDF to the link address', async () => {
    const token = await mint({ key: signKey, email: 'MARIA@EXAMPLE.COM' });
    const ctx = context(signPath, { token });
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('id="sign-form"');
    expect(body).toContain('<iframe');
    expect(body).not.toContain('This link is for another address');
  });
});

describe('owner console gate', () => {
  it('lets an owner token from the second AUD through to the console', async () => {
    const token = await mint({ key: signKey, aud: OWNER_AUD, email: OWNER });
    const ctx = context('/sign/owner/', { token });
    const res = await onRequest(ctx);
    expect(ctx.next).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it.each([['/sign/owner/'], ['/es/sign/owner/'], ['/sign-shell/'], ['/audit-shell/']])(
    'answers the site 404 page, never bare text, on %s for a non-owner',
    async (pathname) => {
      const token = await mint({ key: signKey, aud: OWNER_AUD, email: 'stranger@example.com' });
      const ctx = context(pathname, { token });
      const res = await onRequest(ctx);
      expect(res.status).toBe(404);
      expect(ctx.next).not.toHaveBeenCalled();
      expect(await res.text()).toContain('Page not found');
    },
  );
});
