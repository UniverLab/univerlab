/**
 * The public verification page: a signed and a pending request render the
 * title, both signatures with dates, the hashes and the status — with names
 * and masked emails as the only personal data. Unknown ids fall through to
 * the site's normal flow; the page stays noindex and uncached.
 *
 * @jest-environment node
 */
import { onRequest } from '../../functions/_middleware';
import { verifyHtml, verifyUrlFor } from '../lib/sign/verify';
import type { SigningRequest } from '../lib/sign/evidence';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const SIGNED_HASH = 'f'.repeat(64);

/** A pending fixture that stays inside its 30-day window whenever the suite
 *  runs: the verdict follows the clock, so the fixture must too. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function requestDoc(over: Partial<SigningRequest> = {}): SigningRequest {
  return {
    id: ID,
    title: 'Service order 7',
    signerName: 'María López',
    signerEmail: 'maria@example.com',
    auditSlug: null,
    origHash: 'a'.repeat(64),
    createdAt: '2026-11-13T18:00:00.000Z',
    labAcceptedAt: '2026-11-13T18:00:00.000Z',
    issuerName: 'UniverLab',
    issuerId: '901234567-8',
    issuerEmail: 'owner@univerlab.org',
    issuerSignedAt: '2026-11-13T18:00:00.000Z',
    lang: 'en',
    signerIp: '',
    signerUserAgent: '',
    status: 'pending',
    signedAt: null,
    signedHash: null,
    ...over,
  };
}

describe('verifyUrlFor', () => {
  it('points at the language-prefixed verify path', () => {
    expect(verifyUrlFor('https://univerlab.org', 'en', ID)).toBe(`https://univerlab.org/sign/verify/${ID}`);
    expect(verifyUrlFor('https://univerlab.org', 'es', ID)).toBe(`https://univerlab.org/es/sign/verify/${ID}`);
  });
});

describe('verifyHtml', () => {
  it('shows a signed request with both signatures, hashes and status', () => {
    const html = verifyHtml(
      requestDoc({ status: 'signed', signedAt: '2026-11-13T19:05:07.000Z', signedHash: SIGNED_HASH }),
      'en',
      en.sign,
    );
    expect(html).toContain('Service order 7');
    expect(html).toContain('Signed');
    expect(html).toContain('UniverLab');
    expect(html).toContain('María López');
    expect(html).toContain('o•••@univerlab.org');
    expect(html).toContain('m•••@example.com');
    expect(html).toContain('a'.repeat(64));
    expect(html).toContain(SIGNED_HASH);
    expect(html).toContain('2026-11-13 14:05:07 UTC-05:00');
    // Names and masked emails are the only personal data.
    expect(html).not.toContain('owner@univerlab.org');
    expect(html).not.toContain('maria@example.com');
    expect(html).not.toContain('901234567-8');
    expect(html).not.toContain('12345678');
  });

  it('shows a pending request with no signed hash', () => {
    const html = verifyHtml(requestDoc({ createdAt: daysAgo(1), labAcceptedAt: daysAgo(1) }), 'es', es.sign);
    expect(html).toContain('En espera de firma');
    expect(html).toContain('a'.repeat(64));
    expect(html).not.toContain(SIGNED_HASH);
  });

  it('shows an expired request as expired, never as waiting', () => {
    const html = verifyHtml(requestDoc({ createdAt: daysAgo(40), labAcceptedAt: daysAgo(40) }), 'en', en.sign);
    expect(html).toContain('Expired: no signature');
    expect(html).not.toContain('Waiting for signature');
    expect(html).not.toContain(SIGNED_HASH);
  });
});

const SHELL =
  '<html lang="en"><head><title>Sign — UniverLab</title>' +
  '<meta name="description" content="Sign a document.">' +
  '<link rel="canonical" href="https://univerlab.org/sign-shell/">' +
  '<meta name="robots" content="noindex"></head>' +
  '<body><div id="sign"></div></body></html>';

function context(pathname: string, doc: SigningRequest | null) {
  const sidecar = doc ? JSON.stringify(doc) : null;
  return {
    request: new Request(`https://univerlab.org${pathname}`, { headers: { Accept: 'text/html' } }),
    env: {
      ASSETS: {
        fetch: jest.fn(async () => new Response(SHELL, { status: 200 })),
      },
      SIGN_DOCS: {
        async get(key: string) {
          if (!sidecar || key !== `requests/${ID}.json`) return null;
          return {
            body: sidecar,
            text: async () => sidecar,
            arrayBuffer: async () => new TextEncoder().encode(sidecar).buffer as ArrayBuffer,
          };
        },
        async list() {
          return { objects: [] };
        },
      },
    },
    next: jest.fn(async () => new Response('origin page', { status: 200 })),
  };
}

describe('verify route', () => {
  it('serves a signed request publicly with its hashes, noindex and uncached', async () => {
    const ctx = context(
      `/sign/verify/${ID}`,
      requestDoc({ status: 'signed', signedAt: '2026-11-13T19:05:07.000Z', signedHash: SIGNED_HASH }),
    );
    const res = await onRequest(ctx);
    expect(ctx.next).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Service order 7');
    expect(body).toContain('a'.repeat(64));
    expect(body).toContain(SIGNED_HASH);
    expect(body).toContain('m•••@example.com');
    expect(body).not.toContain('maria@example.com');
    expect(body).not.toContain('901234567-8');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('serves a pending request in Spanish with the pending status', async () => {
    const ctx = context(
      `/es/sign/verify/${ID}`,
      requestDoc({ lang: 'es', createdAt: daysAgo(1), labAcceptedAt: daysAgo(1) }),
    );
    const res = await onRequest(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('En espera de firma');
    expect(body).toContain('a'.repeat(64));
    expect(body).not.toContain(SIGNED_HASH);
  });

  it('falls through for an unknown id', async () => {
    const ctx = context(`/sign/verify/${'0'.repeat(32)}`, requestDoc());
    const res = await onRequest(ctx);
    expect(ctx.next).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('origin page');
  });
});
