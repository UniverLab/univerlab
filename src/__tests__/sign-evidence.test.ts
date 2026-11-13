/**
 * The evidence record: hashing, the canonical evidence text, the operator's
 * one line and the Colombia/UTC clocks. Pure functions, no I/O.
 *
 * @jest-environment node
 */
import {
  evidenceText,
  formatBogota,
  formatUtc,
  newRequestId,
  sha256Hex,
  signedNotice,
} from '../lib/sign/evidence';

describe('sha256Hex', () => {
  it('matches the SHA-256 test vector for "abc"', async () => {
    const bytes = new TextEncoder().encode('abc');
    await expect(sha256Hex(bytes)).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the exact bytes it is given', async () => {
    const a = await sha256Hex(new TextEncoder().encode('%PDF-1.4\n'));
    const b = await sha256Hex(new TextEncoder().encode('%PDF-1.5\n'));
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });
});

describe('newRequestId', () => {
  it('mints 32 lowercase hex chars', () => {
    for (let i = 0; i < 10; i++) {
      expect(newRequestId()).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('never repeats in a small batch', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRequestId()));
    expect(ids.size).toBe(50);
  });
});

describe('evidenceText', () => {
  const input = {
    signerName: 'María López',
    idNumber: '12345678',
    verifiedEmail: 'maria@example.com',
    signedAt: new Date('2026-11-13T19:05:07.000Z'),
    ip: '200.1.2.3',
    userAgent: 'TestAgent/1.0',
    origHash: 'a'.repeat(64),
    labAcceptedAt: '2026-11-13T18:00:00.000Z',
    requestId: 'b'.repeat(32),
  };

  it('names who signed what, when and from where', () => {
    const text = evidenceText(input);
    expect(text).toContain('EVIDENCE RECORD — SIMPLE ELECTRONIC SIGNATURE');
    expect(text).toContain('Signer: María López');
    expect(text).toContain('ID number: 12345678');
    expect(text).toContain('Verified email: maria@example.com');
    expect(text).toContain(`IP address: 200.1.2.3`);
    expect(text).toContain(`User agent: TestAgent/1.0`);
    expect(text).toContain(`Original SHA-256: ${'a'.repeat(64)}`);
    expect(text).toContain('Lab acceptance: 2026-11-13T18:00:00.000Z');
    expect(text).toContain(`Request: ${'b'.repeat(32)}`);
  });

  it('stamps Colombia wall time and UTC for the same instant', () => {
    const text = evidenceText(input);
    // 19:05 UTC is 14:05 in Bogotá (UTC-5, no daylight saving).
    expect(text).toContain('Signed (Colombia): 2026-11-13 14:05:07 UTC-05:00');
    expect(text).toContain('Signed (UTC): 2026-11-13T19:05:07Z');
  });
});

describe('clocks', () => {
  it('formats Bogotá without daylight saving', () => {
    expect(formatBogota(new Date('2026-06-13T19:05:07.000Z'))).toBe('2026-06-13 14:05:07 UTC-05:00');
  });

  it('formats UTC in compact ISO', () => {
    expect(formatUtc(new Date('2026-11-13T19:05:07.000Z'))).toBe('2026-11-13T19:05:07Z');
  });
});

describe('signedNotice', () => {
  it('is one line naming the document and its request', () => {
    expect(signedNotice('NDA Acme', 'c'.repeat(32))).toBe(`Firmado: NDA Acme (${'c'.repeat(32)})`);
    expect(signedNotice('NDA Acme', 'c'.repeat(32)).includes('\n')).toBe(false);
  });
});
