/**
 * Tests for agent discovery Link headers in public/_headers.
 *
 * Verifies that the homepage and Spanish homepage advertise the plain-text
 * site summary, and — the point of the last two cases — that they advertise
 * nothing else. A Link header is a promise that a resource exists; pointing
 * one at a 404 is worse than omitting it, and that is exactly what happened
 * when the api-catalog and agent-card specs were dropped after this file's
 * first version shipped.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HEADERS = resolve(__dirname, '..', '..', 'public', '_headers');
const src = readFileSync(HEADERS, 'utf8');

describe('Agent discovery Link headers', () => {
  const validRels = ['describedby'] as const;

  it('should have a / block advertising the site summary', () => {
    expect(src).toMatch(
      /^\/\n  Link: <\/llms\.txt>; rel="describedby"; type="text\/plain"/m
    );
  });

  it('should have a /es/ block advertising the site summary', () => {
    expect(src).toMatch(
      /^\/es\/\n  Link: <\/llms\.txt>; rel="describedby"; type="text\/plain"/m
    );
  });

  it('should not advertise resources this site does not serve', () => {
    // public/ holds no .well-known directory, so these would be 404s.
    expect(src).not.toContain('/.well-known/api-catalog');
    expect(src).not.toContain('/.well-known/agent-card.json');
  });

  it('should only point Link headers at files that exist under public/', () => {
    const targets = [...src.matchAll(/^  Link: <([^>]+)>/gm)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      const onDisk = resolve(__dirname, '..', '..', 'public', target.replace(/^\//, ''));
      expect(existsSync(onDisk)).toBe(true);
    }
  });

  it('should only use registered IANA relation types', () => {
    const linkLines = src.match(/^  Link: .*$/gm) || [];
    for (const line of linkLines) {
      const relMatch = line.match(/rel="([^"]+)"/);
      expect(relMatch).not.toBeNull();
      if (relMatch) {
        expect(validRels).toContain(relMatch[1]);
      }
    }
  });

  it('should preserve the global /* security block with Strict-Transport-Security', () => {
    expect(src).toMatch(/^\/\*\n  Strict-Transport-Security: max-age=31536000; includeSubDomains/m);
  });

  it('should preserve the X-Frame-Options and Permissions-Policy headers', () => {
    expect(src).toMatch(/X-Frame-Options: SAMEORIGIN/);
    expect(src).toMatch(/Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/);
  });
});