/**
 * Link lifetime: a request signs once, while pending and inside 30 days. A
 * signed link stays signed, an old one reads expired — never the form.
 *
 * @jest-environment node
 */
import { canSign, isExpired, linkState, SIGN_TTL_MS, type SigningRequest } from '../lib/sign/evidence';

const NOW = Date.parse('2026-11-13T19:00:00.000Z');
const iso = (t: number): string => new Date(t).toISOString();

function req(over: Partial<SigningRequest> = {}): SigningRequest {
  return {
    id: 'd'.repeat(32),
    title: 'Service order 7',
    signerName: 'María López',
    signerEmail: 'maria@example.com',
    auditSlug: null,
    origHash: 'a'.repeat(64),
    createdAt: iso(NOW),
    labAcceptedAt: iso(NOW),
    status: 'pending',
    signedAt: null,
    signedHash: null,
    ...over,
  };
}

describe('SIGN_TTL_MS', () => {
  it('is exactly 30 days', () => {
    expect(SIGN_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('isExpired', () => {
  it('is fresh just before 30 days', () => {
    expect(isExpired(iso(NOW - SIGN_TTL_MS + 60_000), NOW)).toBe(false);
  });

  it('is still valid at exactly 30 days', () => {
    expect(isExpired(iso(NOW - SIGN_TTL_MS), NOW)).toBe(false);
  });

  it('expires 30 days and one second later', () => {
    expect(isExpired(iso(NOW - SIGN_TTL_MS - 1_000), NOW)).toBe(true);
  });

  it('fails closed on an unparseable timestamp', () => {
    expect(isExpired('not-a-date', NOW)).toBe(true);
  });
});

describe('canSign', () => {
  it('signs a fresh pending request', () => {
    expect(canSign(req(), NOW)).toBe(true);
  });

  it('refuses a second signature on a signed request', () => {
    expect(canSign(req({ status: 'signed', signedAt: iso(NOW), signedHash: 'e'.repeat(64) }), NOW)).toBe(false);
  });

  it('refuses an expired request', () => {
    expect(canSign(req({ createdAt: iso(NOW - SIGN_TTL_MS - 1_000) }), NOW)).toBe(false);
  });

  it('refuses a request the lab marked expired', () => {
    expect(canSign(req({ status: 'expired' }), NOW)).toBe(false);
  });
});

describe('linkState', () => {
  it('reads ready for a fresh pending request', () => {
    expect(linkState(req(), NOW)).toBe('ready');
  });

  it('reads signed once signed, however old', () => {
    expect(
      linkState(req({ status: 'signed', createdAt: iso(NOW - 60 * SIGN_TTL_MS) }), NOW),
    ).toBe('signed');
  });

  it('reads expired past the window, even when still pending', () => {
    expect(linkState(req({ createdAt: iso(NOW - SIGN_TTL_MS - 1_000) }), NOW)).toBe('expired');
  });
});
