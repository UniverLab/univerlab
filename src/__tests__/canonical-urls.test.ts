import { readFileSync } from 'fs';
import { resolve } from 'path';
import { localizePath, switchLangPath } from '../i18n';

describe('canonical URLs — trailing slash', () => {
  describe('localizePath produces trailing-slash paths', () => {
    it('localizePath("/", "en") is "/"', () => {
      expect(localizePath('/', 'en')).toBe('/');
    });

    it('localizePath("/manifesto", "en") is "/manifesto/"', () => {
      expect(localizePath('/manifesto', 'en')).toBe('/manifesto/');
    });

    it('localizePath("/", "es") is "/es/"', () => {
      expect(localizePath('/', 'es')).toBe('/es/');
    });

    it('localizePath("/manifesto", "es") is "/es/manifesto/"', () => {
      expect(localizePath('/manifesto', 'es')).toBe('/es/manifesto/');
    });
  });

  describe('localizePath is idempotent', () => {
    const paths = ['/', '/manifesto', '/contributors', '/status', '/canopy'];
    const langs = ['en', 'es'] as const;

    it.each(
      paths.flatMap((p) => langs.map((l) => [p, l] as const))
    )('localizePath(localizePath(%j, %j), %j) === localizePath(%j, %j)', (path, lang) => {
      const once = localizePath(path, lang);
      const twice = localizePath(once, lang);
      expect(twice).toBe(once);
    });

    it('no result ever contains // after the leading part', () => {
      for (const lang of ['en', 'es'] as const) {
        for (const path of paths) {
          const result = localizePath(path, lang);
          // Allow "://" from the protocol but no double slashes elsewhere
          const withoutProtocol = result.replace(/^https?:\/\//, '');
          expect(withoutProtocol).not.toMatch(/\/\//);
        }
      }
    });
  });

  describe('switchLangPath round-trips', () => {
    it('en → es → en returns the starting path', () => {
      const paths = ['/', '/manifesto/', '/contributors/', '/status/'];
      for (const path of paths) {
        const url = new URL(`http://localhost${path}`);
        const switched = switchLangPath(url, 'es');
        const switchedBack = switchLangPath(new URL(`http://localhost${switched}`), 'en');
        expect(switchedBack).toBe(path);
      }
    });
  });

  describe('astro.config.mjs', () => {
    it('contains trailingSlash: "ignore"', () => {
      const config = readFileSync(
        resolve(__dirname, '../../astro.config.mjs'),
        'utf8',
      );
      expect(config).toContain("trailingSlash: 'ignore'");
    });
  });

  describe('archive pages are not noindexed', () => {
    it('src/pages/archive.astro does not contain "noindex"', () => {
      const content = readFileSync(
        resolve(__dirname, '../pages/archive.astro'),
        'utf8',
      );
      expect(content).not.toContain('noindex');
    });

    it('src/pages/es/archive.astro does not contain "noindex"', () => {
      const content = readFileSync(
        resolve(__dirname, '../pages/es/archive.astro'),
        'utf8',
      );
      expect(content).not.toContain('noindex');
    });
  });
});

/**
 * A source-level sweep is not enough on its own: the six `/x/docs` links that
 * slipped through the first canonicalisation pass were built from a template
 * literal (`` href={`/${id}/docs`} ``), which no grep for `href="/…"` string
 * literals can see. This scans the layouts for interpolated hrefs instead, so
 * the template-literal form is covered too.
 */
describe('interpolated internal links', () => {
  const layouts = ['ExperimentLayout.astro', 'DocsLayout.astro'];

  for (const layout of layouts) {
    it(`${layout} ends every interpolated page href with a slash`, () => {
      const file = resolve(__dirname, '..', 'layouts', layout);
      const src = readFileSync(file, 'utf8');

      // href={`…`} — capture the template literal's contents.
      const hrefs = [...src.matchAll(/href=\{`([^`]+)`\}/g)].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThan(0);

      for (const href of hrefs) {
        // Only app-absolute page paths are canonicalised; assets and external
        // URLs are not, and neither is a path whose last segment has a suffix.
        if (!href.startsWith('/')) continue;
        const lastSegment = href.split('/').pop() ?? '';
        if (lastSegment.includes('.')) continue;
        expect(href.endsWith('/')).toBe(true);
      }
    });
  }
});
