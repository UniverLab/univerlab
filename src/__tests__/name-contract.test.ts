/**
 * Name contract on the built site (FR1+FR4): the language corner, the mailbox
 * button and the experiment previous/next links each carry their visible text
 * inside their accessible name, in English and Spanish — the property axe's
 * label-content-name-mismatch audits. CI builds before it tests
 * (alt-contract pattern), so dist/ must exist.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experiments, liveExperiments } from '../lib/experiments';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const root = join(__dirname, '..', '..');
const dist = join(root, 'dist');

if (!existsSync(join(dist, 'index.html'))) {
  throw new Error('dist/index.html not found — run `npm run build` before `npm test`.');
}

const SHORT = { en: 'EN', es: 'ES' } as const;
const dict = { en, es } as const;

interface BuiltPage {
  file: string;
  lang: 'en' | 'es';
}

const pages: BuiltPage[] = [
  { file: join(dist, 'index.html'), lang: 'en' },
  { file: join(dist, 'es', 'index.html'), lang: 'es' },
  { file: join(dist, 'experiments', 'index.html'), lang: 'en' },
  { file: join(dist, 'es', 'experiments', 'index.html'), lang: 'es' },
];

/** Every experiment page ships in both languages (the archived one ships none). */
for (const exp of liveExperiments) {
  for (const lang of ['en', 'es'] as const) {
    const file =
      lang === 'en' ? join(dist, exp.id, 'index.html') : join(dist, 'es', exp.id, 'index.html');
    expect(existsSync(file)).toBe(true);
    pages.push({ file, lang });
  }
}
expect(pages.length).toBeGreaterThan(4);

/** Strip scripts, styles and comments: they can hold markup strings that never reach the page. */
function clean(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, '');
}

/** Axe's label-content-name-mismatch compares alphanumeric-folded: punctuation
 *  and case never hide a mismatch, so neither may hide one here. */
function folded(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Visible text the way the audit reads it: hidden spans contribute nothing,
 *  everything else concatenates. */
function visibleText(inner: string): string {
  return inner
    .replace(/<span[^>]*aria-hidden\s*=\s*"true"[^>]*>[\s\S]*?<\/span\s*>/gi, '')
    .replace(/<[^>]*>/g, '');
}

function langCorner(html: string): { label: string; inner: string } {
  const tags = [...html.matchAll(/<a[^>]*id="lang-corner"[^>]*>([\s\S]*?)<\/a\s*>/gi)];
  expect(tags).toHaveLength(1);
  const label = tags[0][0].match(/aria-label="([^"]*)"/i);
  expect(label).not.toBeNull();
  return { label: label![1], inner: tags[0][1] };
}

describe('name contract — the language corner carries its visible text', () => {
  it.each(pages.map((p) => [p.file, p.lang] as [string, 'en' | 'es']))('%s', (file, lang) => {
    const html = clean(readFileSync(file, 'utf8'));
    const other = lang === 'en' ? 'es' : 'en';
    const expected = `${dict[lang].header.switchTo} ${dict[lang].header.langLabel[other]} (${SHORT[other]})`;
    const { label, inner } = langCorner(html);
    // The exact format the header renders: switchTo + long + (short).
    expect(label).toBe(expected);
    // Long name first with a real space before the short code, so the folded
    // visible text ("españoles") sits inside the folded name.
    expect(inner).toMatch(/<span class="long"[^>]*>[\s\S]*?<\/span>\s<span class="short"/s);
    expect(folded(label)).toContain(folded(visibleText(inner)));
  });
});

describe('name contract — experiment previous/next links carry their visible text', () => {
  const expPages = pages.filter((p) => experiments.some((e) => p.file.includes(`${e.id}`)));
  it('every experiment page ships a prev and a next link', () => {
    expect(expPages.length).toBeGreaterThan(0);
    for (const { file } of expPages) {
      const html = clean(readFileSync(file, 'utf8'));
      const links = [...html.matchAll(/<a[^>]*class="exp-nav-link (?:prev|next)"[^>]*>/gi)];
      expect(links).toHaveLength(2);
    }
  });

  it.each(expPages.map((p) => [p.file] as [string]))('%s', (file) => {
    const html = clean(readFileSync(file, 'utf8'));
    const links = [
      ...html.matchAll(
        /<a[^>]*class="exp-nav-link (?:prev|next)"[^>]*aria-label="([^"]*)"[^>]*>([\s\S]*?)<\/a\s*>/gi,
      ),
    ];
    expect(links.length).toBe(2);
    for (const [, label, inner] of links) {
      const number = inner.match(/<span class="label n"[^>]*>([^<]*)<\/span\s*>/i);
      const name = inner.match(/<span class="nm"[^>]*>([^<]*)<\/span\s*>/i);
      expect(number).not.toBeNull();
      expect(name).not.toBeNull();
      // The label is exactly number + space + name, and the spans render in
      // that order with a real space between them.
      expect(label).toBe(`${number![1]} ${name![1]}`);
      expect(inner).toMatch(/<span class="label n"[^>]*>[^<]*<\/span>\s+<span class="nm"/s);
      expect(label).toContain(visibleText(inner));
    }
  });
});

describe('name contract — the mailbox button carries its visible text', () => {
  it.each(pages.map((p) => [p.file, p.lang] as [string, 'en' | 'es']))('%s', (file, lang) => {
    const html = clean(readFileSync(file, 'utf8'));
    const buttons = [
      ...html.matchAll(/<button[^>]*class="mailbox"[^>]*>([\s\S]*?)<\/button\s*>/gi),
    ];
    expect(buttons).toHaveLength(1);
    const label = buttons[0][0].match(/aria-label="([^"]*)"/i);
    expect(label).not.toBeNull();
    // At rest the queue is empty: the name is openNone and the badge hides.
    expect(label![1]).toBe(dict[lang].header.mailbox.openNone);
    expect(buttons[0][1]).toMatch(/<span class="badge"[^>]*hidden/);
  });
});
