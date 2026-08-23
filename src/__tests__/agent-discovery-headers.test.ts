/**
 * Tests for agent discovery Link headers in public/_headers.
 *
 * Verifies that the homepage and Spanish homepage declare the three
 * registered Link relations (api-catalog, service-desc, describedby)
 * pointing at the resources agents should discover.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HEADERS = resolve(__dirname, '..', '..', 'public', '_headers');
const src = readFileSync(HEADERS, 'utf8');

describe('Agent discovery Link headers', () => {
  const validRels = ['api-catalog', 'service-desc', 'describedby'] as const;

  it('should have a / block with all three Link headers', () => {
    expect(src).toMatch(
      /^\/\n  Link: <\/\.well-known\/api-catalog>; rel="api-catalog"\n  Link: <\/\.well-known\/agent-card\.json>; rel="service-desc"; type="application\/json"\n  Link: <\/llms\.txt>; rel="describedby"; type="text\/plain"/m
    );
  });

  it('should have a /es/ block with all three Link headers', () => {
    expect(src).toMatch(
      /^\/es\/\n  Link: <\/\.well-known\/api-catalog>; rel="api-catalog"\n  Link: <\/\.well-known\/agent-card\.json>; rel="service-desc"; type="application\/json"\n  Link: <\/llms\.txt>; rel="describedby"; type="text\/plain"/m
    );
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