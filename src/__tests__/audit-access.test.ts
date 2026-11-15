/**
 * Private audits at the edge: the page and the assets route serve only when
 * the request carries a valid Cloudflare Access JWT for an email on the
 * audit's own allowlist. Every other case answers the site 404 — the same
 * response as an audit that does not exist.
 *
 * @jest-environment node
 *
 * Node rather than jsdom: the middleware is exercised end to end and needs
 * `Request` / `Response`, which jsdom does not ship.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  auditAllowed,
  onRequest,
  resetAccessKeyCacheForTests,
  verifyAccessToken,
} from '../../functions/_middleware';

const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'audit-contract');
const PRIVATE_SLUG = 'private-audit';
const PUBLIC_SLUG = 'public-audit';
const TEAM = 'univerlab.cloudflareaccess.com';
const AUD = 'test-access-aud-tag';
const KID = 'test-key-1';
const LISTED = 'Reader@Example.com';

type Doc = Record<string, unknown>;

function fixtureDoc(): Doc {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, 'audit.json'), 'utf8')) as Doc;
}

function privateDoc(): Doc {
  const doc = fixtureDoc();
  doc['visibility'] = 'private';
  doc['access'] = { emails: [LISTED] };
  return doc;
}

/** In-memory AUDITS bucket holding the private and the public audit. */
function makeAudits() {
  const files = new Map<string, Uint8Array>();
  const docs: Record<string, Doc> = { [PRIVATE_SLUG]: privateDoc(), [PUBLIC_SLUG]: fixtureDoc() };
  const assets = (fixtureDoc()['assets'] ?? []) as { path: string }[];
  for (const [slug, doc] of Object.entries(docs)) {
    files.set(`${slug}/audit.json`, Buffer.from(JSON.stringify(doc)));
    for (const a of assets) {
      files.set(`${slug}/${a.path}`, new Uint8Array(readFileSync(join(FIXTURE_DIR, a.path))));
    }
  }
  return {
    async get(key: string, opts?: { range?: { offset?: number; length?: number } }) {
      const bytes = files.get(key);
      if (!bytes) return null;
      let body = bytes;
      if (opts?.range) {
        const { offset = 0, length = bytes.length } = opts.range;
        body = bytes.slice(offset, offset + length);
      }
      return {
        body,
        size: bytes.length,
        etag: '"fixture"',
        httpMetadata: {},
        text: async () => Buffer.from(bytes).toString('utf8'),
      };
    },
  };
}

const SHELL =
  '<html lang="en"><head><title>Audit — UniverLab</title>' +
  '<meta name="description" content="A UniverLab audit."></head>' +
  '<body><div id="audit"></div></body></html>';

/** workerd's HTMLRewriter is not in Node: this stub applies what the
 *  middleware asks it to write, so the test sees the filled shell. */
class FakeHTMLRewriter {
  handlers = new Map<string, { element: (el: Record<string, (a?: string, b?: unknown) => void>) => void }>();
  on(selector: string, handler: { element: (el: never) => void }) {
    this.handlers.set(selector, handler as never);
    return this;
  }
  transform(_res: Response) {
    return new Response(SHELL, { status: 200, headers: { 'Content-Type': 'text/html' } });
  }
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
  kid?: string;
  alg?: string;
  aud?: unknown;
  iss?: string;
  exp?: number;
  email?: unknown;
}

/** A JWT minted with the given RSA private key for the test team/audience. */
async function mint(opts: MintOpts): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: opts.alg ?? 'RS256', typ: 'JWT', kid: opts.kid ?? KID };
  const payload = {
    aud: opts.aud ?? AUD,
    iss: opts.iss ?? `https://${TEAM}`,
    exp: opts.exp ?? now + 3600,
    email: opts.email ?? LISTED.toLowerCase(),
  };
  const input = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    opts.key,
    new TextEncoder().encode(input),
  );
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

let signKey!: CryptoKey;
let otherKey!: CryptoKey;
let jwksKeys: Record<string, unknown>[] = [];

function accessEnv(extra?: Record<string, unknown>) {
  return {
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    ...extra,
  };
}

function context(
  pathname: string,
  opts?: { token?: string; envExtra?: Record<string, unknown>; noAccessEnv?: boolean },
) {
  const headers: Record<string, string> = { Accept: 'text/html' };
  if (opts?.token) headers['Cf-Access-Jwt-Assertion'] = opts.token;
  return {
    request: new Request(`https://univerlab.org${pathname}`, { headers }),
    env: {
      ASSETS: {
        fetch: jest.fn(async () => new Response(SHELL, { status: 200 })),
      },
      AUDITS: makeAudits(),
      ...(opts?.noAccessEnv ? {} : accessEnv(opts?.envExtra)),
    },
    next: jest.fn(async () => new Response('site 404', { status: 404 })),
  };
}

const pagePath = (slug: string) => `/audits/${slug}/`;
const assetPath = (slug: string) => `/audits/${slug}/assets/figure.svg`;

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
  const other = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  otherKey = other.privateKey;
  const pubJwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Record<string, unknown>;
  jwksKeys = [{ ...pubJwk, kid: KID, alg: 'RS256', use: 'sig' }];
});

beforeEach(() => {
  resetAccessKeyCacheForTests();
  (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = FakeHTMLRewriter;
  (globalThis as unknown as { fetch?: unknown }).fetch = jest.fn(async (url: string | URL | Request) => {
    if (String(url) === `https://${TEAM}/cdn-cgi/access/certs`) {
      return { ok: true, json: async () => ({ keys: jwksKeys }) };
    }
    throw new Error(`unexpected fetch ${String(url)}`);
  });
});

afterEach(() => {
  delete (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter;
  delete (globalThis as unknown as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

describe('private audit access', () => {
  it('serves the page and the asset to a valid token with a listed email', async () => {
    const token = await mint({ key: signKey });
    for (const path of [pagePath(PRIVATE_SLUG), assetPath(PRIVATE_SLUG)]) {
      const ctx = context(path, { token });
      const res = await onRequest(ctx);
      expect(res.status).toBe(200);
      expect(ctx.next).not.toHaveBeenCalled();
    }
  });

  it('matches the allowlist without case', async () => {
    expect(auditAllowed(privateDoc() as never, 'reader@example.com')).toBe(true);
    expect(auditAllowed(privateDoc() as never, 'READER@EXAMPLE.COM')).toBe(true);
    const token = await mint({ key: signKey, email: 'READER@EXAMPLE.COM' });
    const ctx = context(pagePath(PRIVATE_SLUG), { token });
    expect((await onRequest(ctx)).status).toBe(200);
  });

  it('answers 404 for page and asset on an unlisted email', async () => {
    const token = await mint({ key: signKey, email: 'stranger@example.com' });
    for (const path of [pagePath(PRIVATE_SLUG), assetPath(PRIVATE_SLUG)]) {
      const ctx = context(path, { token });
      const res = await onRequest(ctx);
      expect(res.status).toBe(404);
      expect(ctx.next).toHaveBeenCalled();
    }
  });

  it('answers 404 for page and asset on an expired token', async () => {
    const token = await mint({ key: signKey, exp: Math.floor(Date.now() / 1000) - 3600 });
    for (const path of [pagePath(PRIVATE_SLUG), assetPath(PRIVATE_SLUG)]) {
      const ctx = context(path, { token });
      expect((await onRequest(ctx)).status).toBe(404);
    }
  });

  it('answers 404 for page and asset on a wrong audience', async () => {
    const token = await mint({ key: signKey, aud: 'another-app' });
    for (const path of [pagePath(PRIVATE_SLUG), assetPath(PRIVATE_SLUG)]) {
      const ctx = context(path, { token });
      expect((await onRequest(ctx)).status).toBe(404);
    }
  });

  it('answers 404 for page and asset on a bad signature', async () => {
    const token = await mint({ key: otherKey });
    for (const path of [pagePath(PRIVATE_SLUG), assetPath(PRIVATE_SLUG)]) {
      const ctx = context(path, { token });
      expect((await onRequest(ctx)).status).toBe(404);
    }
  });

  it('answers 404 for page and asset with no token', async () => {
    for (const path of [pagePath(PRIVATE_SLUG), assetPath(PRIVATE_SLUG)]) {
      const ctx = context(path);
      const res = await onRequest(ctx);
      expect(res.status).toBe(404);
      expect(ctx.next).toHaveBeenCalled();
    }
  });

  it('answers 404 for page and asset when the Access configuration is missing', async () => {
    const token = await mint({ key: signKey });
    for (const noAccessEnv of [true]) {
      for (const path of [pagePath(PRIVATE_SLUG), assetPath(PRIVATE_SLUG)]) {
        const ctx = context(path, { token, noAccessEnv });
        expect((await onRequest(ctx)).status).toBe(404);
      }
    }
    const noAud = context(pagePath(PRIVATE_SLUG), {
      token,
      envExtra: { ACCESS_AUD: undefined },
    });
    delete (noAud.env as Record<string, unknown>)['ACCESS_AUD'];
    expect((await onRequest(noAud)).status).toBe(404);
    expect(await verifyAccessToken(token, {})).toBeNull();
  });

  it('serves a public audit with no token', async () => {
    for (const path of [pagePath(PUBLIC_SLUG), assetPath(PUBLIC_SLUG)]) {
      const ctx = context(path);
      const res = await onRequest(ctx);
      expect(res.status).toBe(200);
      expect(ctx.next).not.toHaveBeenCalled();
    }
  });

  it('never renders the allowlist or the reader identity', async () => {
    const token = await mint({ key: signKey });
    const ctx = context(pagePath(PRIVATE_SLUG), { token });
    const body = await (await onRequest(ctx)).text();
    expect(body).not.toContain(LISTED);
    expect(body).not.toContain(LISTED.toLowerCase());
    const asset = context(assetPath(PRIVATE_SLUG), { token });
    const assetBody = await (await onRequest(asset)).text();
    expect(assetBody).not.toContain(LISTED);
    expect(assetBody).not.toContain(LISTED.toLowerCase());
  });

  it('refetches the keys when a token names an unknown key id', async () => {
    const second = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const token = await mint({ key: second.privateKey, kid: 'rotated-key' });
    // The cache only knows KID: the first attempt fails closed …
    const denied = context(pagePath(PRIVATE_SLUG), { token });
    expect((await onRequest(denied)).status).toBe(404);
    // … then the team publishes the rotated key and the same token serves.
    const pubJwk = (await crypto.subtle.exportKey('jwk', second.publicKey)) as Record<string, unknown>;
    jwksKeys = [...jwksKeys, { ...pubJwk, kid: 'rotated-key', alg: 'RS256', use: 'sig' }];
    const allowed = context(pagePath(PRIVATE_SLUG), { token });
    expect((await onRequest(allowed)).status).toBe(200);
  });
});
