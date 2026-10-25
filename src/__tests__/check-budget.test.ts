/**
 * The first-view byte counter is what holds the redesigned pages to their
 * load budget, so its counting rules are pinned here on a small fixture:
 * lazy images and preload="none" videos cost nothing, posters always cost
 * something, a picture costs exactly the one AVIF candidate a browser
 * picks, a module script costs nothing until it imports, and the Google
 * Fonts stylesheet never appears as an item (main counts it as a fixed
 * 120 KB). If a counting rule changes, these break.
 */
import { firstViewItems } from '../../scripts/check-budget';

const FIXTURE = `<!doctype html><html><head>
<link rel="stylesheet" href="/_astro/site.css">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Old+Standard+TT">
<script type="module" src="/_astro/page.js"></script>
<script src="/js/classic.js" defer></script>
</head><body>
<img id="eager" src="/bench/eager.webp" alt="">
<img id="lazy" src="/bench/lazy.webp" loading="lazy" alt="">
<img id="hero" srcset="/bench/hero-450.avif 450w, /bench/hero-900.avif 900w" alt="">
<video id="none" src="/bench/clip.mp4" poster="/bench/clip-poster.webp" preload="none"></video>
<video id="meta" poster="/bench/meta-poster.webp" preload="metadata"><source src="/bench/meta.mp4"></video>
<picture><source type="image/avif" srcset="/bench/pic-450.avif 450w, /bench/pic-900.avif 900w"><source type="image/webp" srcset="/bench/pic-450.webp 450w"><img src="/bench/pic-fallback.webp" alt=""></picture>
<picture><source type="image/avif" srcset="/bench/lazy-pic.avif"><img src="/bench/lazy-pic.webp" loading="lazy" alt=""></picture>
<script>const fake = '<img src="/bench/fake-in-script.webp">';
</script>
</body></html>`;

describe('firstViewItems', () => {
  const items = firstViewItems(FIXTURE);

  it('counts the local stylesheet, the classic script and the eager image', () => {
    expect(items).toEqual(expect.arrayContaining(['/_astro/site.css', '/js/classic.js', '/bench/eager.webp']));
  });

  it('counts only the first candidate of an img srcset', () => {
    expect(items).toContain('/bench/hero-450.avif');
    expect(items).not.toContain('/bench/hero-900.avif');
  });

  it('does not count a module script (its imports are dynamic)', () => {
    expect(items).not.toContain('/_astro/page.js');
  });

  it('does not count a lazy image', () => {
    expect(items).not.toContain('/bench/lazy.webp');
  });

  it('counts the poster of a preload="none" video but not its src', () => {
    expect(items).toContain('/bench/clip-poster.webp');
    expect(items).not.toContain('/bench/clip.mp4');
  });

  it('counts the inner source of a video that preloads', () => {
    expect(items).toContain('/bench/meta.mp4');
    expect(items).toContain('/bench/meta-poster.webp');
  });

  it('counts a picture as only its first AVIF candidate', () => {
    expect(items).toContain('/bench/pic-450.avif');
    expect(items).not.toContain('/bench/pic-900.avif'); // the 900w candidate
    expect(items).not.toContain('/bench/pic-450.webp'); // the webp source
    expect(items).not.toContain('/bench/pic-fallback.webp'); // the <img> fallback
  });

  it('counts nothing of a picture whose img is lazy', () => {
    expect(items).not.toContain('/bench/lazy-pic.avif');
    expect(items).not.toContain('/bench/lazy-pic.webp');
  });

  it('never lists the Google Fonts stylesheet (main adds a fixed 120 KB)', () => {
    expect(items.some((u) => u.includes('fonts.googleapis.com'))).toBe(false);
    expect(items.some((u) => u.includes('fonts.gstatic.com'))).toBe(false);
  });

  it('ignores fake tags inside inline script bodies', () => {
    expect(items).not.toContain('/bench/fake-in-script.webp');
  });
});
