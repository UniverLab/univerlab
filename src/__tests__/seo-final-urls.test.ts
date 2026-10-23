/**
 * Covers the final-URL invariant (Search Console "Page with redirect",
 * 2026-10-23) and the build-time counterpart check that decides whether a page
 * advertises hreflang alternates and a language-corner link at all.
 *
 * The invariant is tested against throwaway `dist/`-shaped fixtures, the same
 * way `seo-indexing.test.ts` tests the other checks.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { redirectSources } from '../../scripts/check-seo';
import { checkFinalUrls } from '../../scripts/seo/final-urls';
import { hasCounterpart } from '../i18n';

/** A throwaway `dist/`-shaped tree for the check-script tests. */
function distFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'seo-final-'));
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, content, 'utf-8');
  }
  return dir;
}

const page = (extra = '') => `<!doctype html><html><head><title>T</title>${extra}</head><body></body></html>`;

describe('checkFinalUrls', () => {
  it('fails an hreflang without the trailing slash', () => {
    const dist = distFixture({
      'index.html': page('<link rel="alternate" hreflang="es" href="https://univerlab.org/es" />'),
      'es/index.html': page(),
    });
    try {
      expect(checkFinalUrls(dist, new Set())).toEqual([
        '/: alternate hreflang "https://univerlab.org/es" does not end in /',
      ]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('fails an hreflang that _redirects redirects', () => {
    const dist = distFixture({
      'index.html': page('<link rel="alternate" hreflang="es" href="https://univerlab.org/es/status/" />'),
      'es/status/index.html': page(),
      'status/index.html': page(),
      '_redirects': '/es/status/ /status/ 301\n/legacy /status/ 301\n',
    });
    try {
      // Through the real parser: a broken `redirectSources` would silently
      // unplug this half of the invariant.
      expect(checkFinalUrls(dist, redirectSources(dist))).toEqual([
        '/: alternate hreflang "https://univerlab.org/es/status/" is a redirect source',
      ]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('fails a root-relative anchor without the trailing slash', () => {
    const dist = distFixture({
      'index.html': page('<a href="/gitkit">GitKit</a>'),
      'gitkit/index.html': page(),
    });
    try {
      expect(checkFinalUrls(dist, new Set())).toEqual(['/: a href "/gitkit" does not end in /']);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('fails a link whose target has no built page', () => {
    const dist = distFixture({
      'index.html': page('<a href="/gone/">Gone</a>'),
    });
    try {
      expect(checkFinalUrls(dist, new Set())).toEqual(['/: a href "/gone/" has no built page']);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('passes /gitkit/, /feed.atom and #top', () => {
    const dist = distFixture({
      'index.html': page('<a href="/gitkit/">GitKit</a><a href="/feed.atom">Feed</a><a href="#top">Top</a>'),
      'gitkit/index.html': page(),
    });
    try {
      expect(checkFinalUrls(dist, new Set())).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

describe('hasCounterpart', () => {
  it('/status/ has no Spanish counterpart', () => {
    expect(hasCounterpart('/status/', 'es')).toBe(false);
  });

  it('/gitkit/ has a Spanish counterpart', () => {
    expect(hasCounterpart('/gitkit/', 'es')).toBe(true);
  });

  it('/es/gitkit/ has an English counterpart', () => {
    expect(hasCounterpart('/es/gitkit/', 'en')).toBe(true);
  });
});
