/**
 * The English-only class: a top-level page with no /es twin is a real route,
 * but its Spanish spellings must not 404 — they redirect to the English page
 * (Cloudflare applies public/_redirects), and no page may ever link the
 * /es/<page>/ spelling. Regression: /es/roadmap/ answered 404 because only
 * /es/status/ had been fixed (the field-notes "Bitácora →" link on Spanish
 * experiment pages once went to /es/status/?topic=<id>).
 *
 * The class is derived from the two page dictionaries, so a future
 * English-only page fails here until it is added to the case list WITH its
 * redirect pair.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STATIC_RULES } from '../../scripts/build-redirects';
import { hasCounterpart } from '../i18n';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** Cloudflare applies the first match, so every rule must sit above it. */
const CATCH_ALL = '/es/:id/docs/* /:id/docs/:splat 301';

/**
 * Top-level `.astro` pages with no `es/` twin. `404.astro` builds to
 * /404.html (not a route), so it is not part of the class.
 */
const englishOnly = readdirSync(resolve(ROOT, 'src/pages'))
  .filter((f) => f.endsWith('.astro'))
  .map((f) => f.replace(/\.astro$/, ''))
  .filter((n) => n !== '404' && !existsSync(resolve(ROOT, `src/pages/es/${n}.astro`)))
  .sort();

/** Both spellings of the Spanish URL, in file order (no trailing slash first). */
const spellings = (n: string) => [`/es/${n} /${n}/ 301`, `/es/${n}/ /${n}/ 301`];

describe('English-only pages are never linked with the /es prefix', () => {
  it('the class today is exactly roadmap and status', () => {
    expect(englishOnly).toEqual(['roadmap', 'status']);
  });

  it.each(englishOnly)('%s has no Spanish twin', (n) => {
    expect(existsSync(resolve(ROOT, `src/pages/es/${n}.astro`))).toBe(false);
    expect(hasCounterpart(`/${n}/`, 'es')).toBe(false);
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
    expect(src).toContain("{ cmd: '/status', label: lang === 'es' ? 'Cuaderno de bitácora' : 'Logbook', href: '/status/' }");
    expect(src).not.toContain("base + '/status/'");
  });
});

describe('the Spanish spellings of an English-only page redirect', () => {
  const lines = read('public/_redirects').split('\n').map((l) => l.trim());
  const catchAllLine = lines.indexOf(CATCH_ALL);

  it('the docs catch-all is last, so it can shadow nothing above it', () => {
    expect(catchAllLine).toBeGreaterThan(0);
    expect(STATIC_RULES).toContain(CATCH_ALL);
  });

  it.each(englishOnly)('%s is a static rule above the docs catch-all', (n) => {
    for (const rule of spellings(n)) {
      expect(STATIC_RULES).toContain(rule);
      expect(STATIC_RULES.indexOf(rule)).toBeLessThan(STATIC_RULES.indexOf(CATCH_ALL));

      expect(lines).toContain(rule);
      expect(lines.indexOf(rule)).toBeLessThan(catchAllLine);
    }
  });
});
