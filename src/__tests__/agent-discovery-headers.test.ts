/**
 * Tests for agent discovery Link headers in public/_headers.
 *
 * Verifies that the homepage and Spanish homepage advertise the plain-text
 * site summary and the RFC 9727 api-catalog, and — the point of the last
 * cases — that they advertise no resource this site does not serve. A Link
 * header is a promise that a resource exists; pointing one at a 404 is worse
 * than omitting it. The api-catalog was dropped for that reason before the
 * announcements API existed, and came back with it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HEADERS = resolve(__dirname, '..', '..', 'public', '_headers');
const src = readFileSync(HEADERS, 'utf8');

describe('Agent discovery Link headers', () => {
  const validRels = ['describedby', 'api-catalog'] as const;

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

  it('should advertise the api-catalog now that it is served, and never an agent card', () => {
    // The announcements API made the api-catalog real: the file exists under
    // public/, so the homepage may point at it — and must, per RFC 9727.
    expect(src).toContain('/.well-known/api-catalog');
    expect(existsSync(resolve(__dirname, '..', '..', 'public', '.well-known', 'api-catalog'))).toBe(true);
    // No agent card exists, so nothing advertises one.
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