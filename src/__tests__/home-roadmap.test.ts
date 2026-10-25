/**
 * The home looks ahead: the roadmap link in the directions section, and the
 * dotted background gone. User review, 2026-10-24:
 *
 * The cosmic canvas (particles joined by lines) still ran behind the
 * frontispiece — Home asked for bg="cosmic" and BaseLayout defaulted to
 * 'cosmic', so every page that passed no bg got the dots too. Now Home asks
 * for none, the default is none, and the built home (en and es) ships without
 * the background canvas. The cosmic theme itself stays in the code
 * (backgrounds.ts / orbit.ts) for REFACTOR-2 to delete.
 *
 * The directions section links the roadmap page under the Now/Next lists.
 * The href is fixed ('/roadmap/', the Footer.astro pattern): roadmap.astro is
 * English-only, so localizePath would build /es/roadmap/ and 404 — and
 * checkFinalUrls would fail the build. The text is localized.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const root = join(__dirname, '..', '..');

/** The built home pages — CI builds before it tests (see manifesto-gutter). */
let builtEn: string;
try {
  builtEn = readFileSync(join(root, 'dist/index.html'), 'utf8');
} catch {
  throw new Error('dist/index.html not found — run `npm run build` before `npm test`.');
}
const builtEs = readFileSync(join(root, 'dist/es/index.html'), 'utf8');

const home = readFileSync(join(root, 'src/views/Home.astro'), 'utf8');
const baseLayout = readFileSync(join(root, 'src/layouts/BaseLayout.astro'), 'utf8');
const docsLayout = readFileSync(join(root, 'src/layouts/DocsLayout.astro'), 'utf8');

/** The dotted background is this exact element. The scoped CSS keeps a
 * `.bg` selector in the shared bundle, so the element tag is the truth. */
const BG_ELEMENT = '<canvas class="bg"';

describe('home: no dotted background anywhere', () => {
  it('Home.astro stops asking for the cosmic canvas', () => {
    expect(home).toContain('bg={false}');
    expect(home).not.toContain('bg="cosmic"');
  });

  it('BaseLayout defaults bg to false, so pages that omit bg render no canvas', () => {
    expect(baseLayout).toContain('bg = false');
    expect(baseLayout).not.toMatch(/bg\s*=\s*'cosmic'/);
    // And the render honours it: false short-circuits to nothing at all.
    expect(baseLayout).toContain('bg === false ? null :');
  });

  it('DocsLayout passes bg={false} for its users', () => {
    expect(docsLayout).toContain('bg={false}');
  });

  it('the built home (en and es) ships no background canvas element', () => {
    for (const html of [builtEn, builtEs]) {
      expect(html).not.toContain(BG_ELEMENT);
      // The lantern's film grain is a different, wanted canvas.
      expect(html).toContain('<canvas class="film"');
    }
  });

  it('no built page mounts the background canvas at all', () => {
    // Nothing reads the bg default any more — experiment pages keep their
    // own fondos (LiveBackground, surface canvases), not this element —
    // so <canvas class="bg"> must be gone from the whole site.
    const pages = [
      'index.html',
      'es/index.html',
      '404.html',
      'archive/index.html',
      'es/archive/index.html',
      'manifesto/index.html',
      'es/manifesto/index.html',
      'contributors/index.html',
      'experiments/index.html',
      'status/index.html',
      'roadmap/index.html',
      'api/index.html',
      'es/api/index.html',
      'feed/index.html',
      'es/feed/index.html',
      'today/index.html',
      'es/today/index.html',
      'canopy/index.html',
      'es/texforge/index.html',
      'canopy/docs/index.html',
      'gitkit/docs/cli-reference/index.html',
      'texforge/docs/quickstart/index.html',
      'ghscaff/docs/index.html',
      'demostage/docs/index.html',
    ];
    for (const p of pages) {
      const html = readFileSync(join(root, 'dist', p), 'utf8');
      expect(html).not.toContain(BG_ELEMENT);
    }
  });

  it('leaves the cosmic theme in the code for REFACTOR-2 to delete', () => {
    // Out of scope here: backgrounds.ts keeps the theme; only its mounts are gone.
    const backgrounds = readFileSync(join(root, 'src/scripts/backgrounds.ts'), 'utf8');
    expect(backgrounds).toContain('cosmic');
  });
});

describe('home: the roadmap link', () => {
  /** The anchor of the directions section in one built page. */
  const roadmapAnchor = (html: string) => {
    const start = html.indexOf('class="dir-roadmap"');
    expect(start).toBeGreaterThan(-1);
    const end = html.indexOf('</a>', start);
    return html.slice(start, end);
  };

  it('sits under the Now/Next lists with the localized text and the fixed href', () => {
    for (const [html, text] of [
      [builtEn, en.home.directions.roadmap],
      [builtEs, es.home.directions.roadmap],
    ] as const) {
      const anchor = roadmapAnchor(html);
      // The href is NOT localized: /es/roadmap/ does not exist (roadmap is
      // English-only), localizePath there would 404 and break checkFinalUrls.
      expect(anchor).toContain('href="/roadmap/"');
      expect(anchor).not.toContain('/es/roadmap/');
      expect(anchor).toContain(text);
    }
    // And the link really is part of the directions section source.
    expect(home).toMatch(/<a class="dir-roadmap" href="\/roadmap\/">\{t\.home\.directions\.roadmap\}<\/a>/);
  });

  it('is styled by the scoped rule: under the lists, the section link ink, no new tokens', () => {
    expect(home).toContain(
      '.dir-roadmap { display: inline-block; margin-top: 1rem; color: var(--ink); }',
    );
  });

  it('keeps en/es key parity in the directions block', () => {
    expect(Object.keys(en.home.directions).sort())
      .toEqual(Object.keys(es.home.directions).sort());
  });
});
