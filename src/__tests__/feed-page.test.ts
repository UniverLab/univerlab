import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const FEED_URL = 'https://announcements.univerlab.org/feed.atom';

describe('feed page', () => {
  const feedEn = readFileSync(resolve(__dirname, '../pages/feed.astro'), 'utf8');
  const feedEs = readFileSync(resolve(__dirname, '../pages/es/feed.astro'), 'utf8');

  it('renders the exact feed URL verbatim', () => {
    expect(feedEn).toContain(FEED_URL);
    expect(feedEs).toContain(FEED_URL);
  });

  it('feed URL is in a selectable element (code or element with id feed-url)', () => {
    expect(feedEn).toMatch(/id="feed-url"/);
    expect(feedEs).toMatch(/id="feed-url"/);
    // ensure the URL is rendered via FEED_URL constant inside that element
    expect(feedEn).toMatch(/<code[^>]*id="feed-url"[^>]*>\{FEED_URL\}<\/code>/);
    expect(feedEs).toMatch(/<code[^>]*id="feed-url"[^>]*>\{FEED_URL\}<\/code>/);
    // and the constant itself is the exact URL
    expect(feedEn).toContain(`const FEED_URL = '${FEED_URL}'`);
  });

  it('has a copy-to-clipboard button beside the URL', () => {
    expect(feedEn).toMatch(/data-feed-copy/);
    expect(feedEs).toMatch(/data-feed-copy/);
    expect(feedEn).toMatch(/<button[^>]*data-feed-copy/);
    expect(feedEs).toMatch(/<button[^>]*data-feed-copy/);
    // button uses clipboard API
    expect(feedEn).toContain('navigator.clipboard.writeText');
    expect(feedEs).toContain('navigator.clipboard.writeText');
  });

  it('copy button reports success in place and falls back to selectable URL', () => {
    // reports success: adds done class / swapped text, with copied label
    expect(feedEn).toMatch(/data-copied/);
    expect(feedEs).toMatch(/data-copied/);
    expect(feedEn).toMatch(/classList\.add\('done'\)/);
    expect(feedEs).toMatch(/classList\.add\('done'\)/);
    // when clipboard unavailable, leaves URL selectable rather than failing silently:
    // fallback uses execCommand and does not hide URL; also catch block is empty / no error throw
    expect(feedEn).toMatch(/execCommand\('copy'\)/);
    // ensures URL element remains selectable (user-select: all)
    expect(feedEn).toMatch(/user-select:\s*all/);
  });

  it('content order is intro, URL, button, hint', () => {
    // check order in the rendered section markup (after the frontmatter)
    const markupEn = feedEn.split('---').slice(2).join('---');
    const introIdx = markupEn.indexOf('f.intro');
    const urlIdx = markupEn.indexOf('feed-url');
    const btnIdx = markupEn.indexOf('data-feed-copy');
    const hintIdx = markupEn.indexOf('f.hint');
    expect(introIdx).toBeGreaterThan(-1);
    expect(urlIdx).toBeGreaterThan(introIdx);
    expect(btnIdx).toBeGreaterThan(urlIdx);
    expect(hintIdx).toBeGreaterThan(btnIdx);
  });

  it('works with JS disabled: URL is visible without JS (not injected via script)', () => {
    // URL is in static markup, not only in script
    expect(feedEn).toMatch(/<code[^>]*id="feed-url"[^>]*>\{FEED_URL\}<\/code>/);
    // ensure no noscript hiding
    expect(feedEn).not.toMatch(/<noscript.*feed-url/);
  });

  it('uses BaseLayout (site layout) and no new dependency / icon set', () => {
    expect(feedEn).toContain("import BaseLayout");
    expect(feedEs).toContain("import BaseLayout");
    expect(feedEn).not.toMatch(/import.*icon/i);
    expect(feedEs).not.toMatch(/import.*icon/i);
    expect(feedEn).not.toMatch(/analytics/i);
    expect(feedEs).not.toMatch(/analytics/i);
  });

  it('does not recommend a specific reader and does not add newsletter/email capture', () => {
    expect(feedEn).not.toMatch(/Feedly|Inoreader|NetNewsWire|Reeder/i);
    expect(feedEs).not.toMatch(/Feedly|Inoreader|NetNewsWire|Reeder/i);
    expect(feedEn).not.toMatch(/newsletter|email/i);
    expect(feedEs).not.toMatch(/newsletter|email/i);
  });
});

describe('status page links to feed', () => {
  const status = readFileSync(resolve(__dirname, '../pages/status.astro'), 'utf8');

  it('contains a link to /feed next to the Mission Log heading', () => {
    expect(status).toMatch(/href="\/feed\/?"/);
    // link text is RSS (same word as feed page heading)
    expect(status).toMatch(/>RSS<\/a>/);
    // near the MISSION LOG label
    const logIdx = status.indexOf('MISSION LOG');
    const feedIdx = status.indexOf('href="/feed');
    expect(feedIdx).toBeGreaterThan(-1);
    expect(Math.abs(feedIdx - logIdx)).toBeLessThan(500);
  });

  it('status feed link uses the same label as feed heading', () => {
    const statusFeedLabel = status.match(/<a[^>]*href="\/feed\/?"[^>]*>([^<]+)<\/a>/)?.[1]?.trim();
    expect(statusFeedLabel).toBe('RSS');
    expect(en.feed.heading).toBe('RSS');
    expect(es.feed.heading).toBe('RSS');
  });
});

describe('feed i18n', () => {
  it('both locales carry feed strings', () => {
    expect(en).toHaveProperty('feed');
    expect(es).toHaveProperty('feed');
    expect(en.feed).toHaveProperty('intro');
    expect(es.feed).toHaveProperty('intro');
    expect(en.feed).toHaveProperty('hint');
    expect(es.feed).toHaveProperty('hint');
    expect(en.feed).toHaveProperty('heading');
    expect(es.feed).toHaveProperty('heading');
    expect(en.feed).toHaveProperty('title');
    expect(es.feed).toHaveProperty('title');
  });

  it('calls it RSS in every visible string, both languages', () => {
    // intro and hint must contain RSS
    expect(en.feed.intro).toMatch(/RSS/);
    expect(es.feed.intro).toMatch(/RSS/);
    expect(en.feed.hint).toMatch(/RSS/);
    expect(es.feed.hint).toMatch(/RSS/);
    expect(en.feed.heading).toMatch(/RSS/);
    expect(es.feed.heading).toMatch(/RSS/);
    // should not mention Atom in visible strings
    expect(en.feed.intro).not.toMatch(/Atom/);
    expect(en.feed.hint).not.toMatch(/Atom/);
    expect(es.feed.intro).not.toMatch(/Atom/);
    expect(es.feed.hint).not.toMatch(/Atom/);
  });

  it('feed strings have no product-specific reader named', () => {
    expect(en.feed.hint).not.toMatch(/Feedly|Inoreader|NetNewsWire|Reeder/i);
    expect(es.feed.hint).not.toMatch(/Feedly|Inoreader|NetNewsWire|Reeder/i);
  });

  it('feed url is identical in both locales', () => {
    expect(en.feed.url).toBe(FEED_URL);
    expect(es.feed.url).toBe(FEED_URL);
  });

  it('has same keys in both languages', () => {
    expect(Object.keys(en.feed).sort()).toEqual(Object.keys(es.feed).sort());
  });
});
