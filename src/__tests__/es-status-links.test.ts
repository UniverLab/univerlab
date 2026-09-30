/**
 * The status page is English-only: there is no /es/status/ page. Every link to
 * it must point at /status/ directly, and the Spanish spellings must redirect.
 * Regression: the field-notes "Bitácora →" link on Spanish experiment pages
 * went to /es/status/?topic=<id> and returned 404.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STATIC_RULES } from '../../scripts/build-redirects';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('status links never take the /es prefix', () => {
  it('there is no Spanish status page to link to', () => {
    expect(existsSync(resolve(ROOT, 'src/pages/es/status.astro'))).toBe(false);
  });

  it('field notes link to /status/?topic=<id> in every language', () => {
    const src = read('src/components/FieldNotes.astro');
    expect(src).toContain('const statusHref = `/status/?topic=${exp.id}`;');
    expect(src).not.toMatch(/localizePath\(`\/status/);
  });

  it('the header nav links to /status/', () => {
    const src = read('src/components/Header.astro');
    expect(src).toContain("{ href: '/status/', label: t.nav.log }");
    expect(src).not.toMatch(/localizePath\('\/status'/);
  });

  it('the command palette links to /status/', () => {
    const src = read('src/layouts/BaseLayout.astro');
    expect(src).toContain("{ cmd: '/status', label: 'Mission Log', href: '/status/' }");
    expect(src).not.toContain("base + '/status/'");
  });
});

describe('Spanish status spellings redirect to the English page', () => {
  const rules = read('public/_redirects').split('\n').map((l) => l.trim());

  it.each(['/es/status /status/ 301', '/es/status/ /status/ 301'])('%s is a static rule and is live', (rule) => {
    expect(STATIC_RULES).toContain(rule);
    expect(rules).toContain(rule);
  });
});
