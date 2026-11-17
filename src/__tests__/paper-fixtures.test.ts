/**
 * Recorded editions for `npm run check:paper` (`src/__tests__/fixtures/paper/`):
 * the manifest lists every edition, each file parses, and every edition
 * carries a printable pool in both languages — so a bad refresh (an empty
 * pool, a truncated response, a missing file) breaks here, not silently in
 * the browser check.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildPool } from '../lib/science-filter';

const DIR = join(__dirname, 'fixtures', 'paper');

const FIXED = [
  '2026-07-22',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
  '2026-11-15',
  '2026-11-16',
  '2026-11-17',
];

describe('paper fixtures', () => {
  test('manifest holds the 7 fixed dates plus 3 coverage dates', () => {
    const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
    expect(manifest.dates).toHaveLength(FIXED.length + 3);
    for (const d of FIXED) expect(manifest.dates).toContain(d);
    for (const key of ['landscape', 'noPhoto', 'labMany']) {
      expect(manifest.dates).toContain(manifest.coverage[key].date);
    }
    // One fixture per month/day: the feed URL carries no year, so a shared
    // mm/dd would record (and route) the same response twice.
    const mmdd = manifest.dates.map((d: string) => d.slice(5));
    expect(new Set(mmdd).size).toBe(manifest.dates.length);
  });

  test('every edition parses with a printable pool in both languages', () => {
    const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
    for (const date of manifest.dates as string[]) {
      for (const lang of ['en', 'es']) {
        const otdFile = join(DIR, `${date}.${lang}.otd.json`);
        expect(existsSync(otdFile)).toBe(true);
        const otd = JSON.parse(readFileSync(otdFile, 'utf8'));
        for (const key of ['events', 'births', 'deaths']) {
          expect(Array.isArray(otd[key])).toBe(true);
        }
        expect(buildPool(otd, lang as 'en' | 'es').length).toBeGreaterThan(0);
      }
      const labFile = join(DIR, `${date}.lab.json`);
      expect(existsSync(labFile)).toBe(true);
      const lab = JSON.parse(readFileSync(labFile, 'utf8'));
      expect(Array.isArray(lab.entries)).toBe(true);
    }
  });

  test('the page web fonts are recorded so the check measures real metrics', () => {
    const file = join(DIR, 'fonts.json');
    expect(existsSync(file)).toBe(true);
    const fonts = JSON.parse(readFileSync(file, 'utf8')) as {
      entries?: Record<string, { file: string; contentType: string }>;
    };
    const entries = Object.entries(fonts.entries || {});
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.some(([url]) => url.endsWith('.woff2'))).toBe(true);
    for (const [, entry] of entries) {
      const asset = join(DIR, entry.file);
      expect(existsSync(asset)).toBe(true);
      expect(statSync(asset).size).toBeGreaterThan(0);
    }
    // The three families page one sets its type in.
    const css = entries
      .filter(([url]) => url.includes('fonts.googleapis.com/css2'))
      .map(([, entry]) => readFileSync(join(DIR, entry.file), 'utf8'))
      .join('\n');
    for (const family of ['Old Standard TT', 'EB Garamond', 'Sometype Mono']) {
      expect(css).toContain(family);
    }
  });
});
