import { htmlToMarkdown, injectLatestRelease, stripAriaHidden } from '../../scripts/build-md';

describe('htmlToMarkdown', () => {
  it('converts main content with heading and paragraph', () => {
    const html = `<!DOCTYPE html><html><head><title>Test</title></head><body><main><h1>Title</h1><p>Body</p></main></body></html>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('# Title');
    expect(md).toContain('Body');
  });

  it('drops script and nav content', () => {
    const html = `<!DOCTYPE html><html><head><title>T</title></head><body><main><p>Keep</p><script>alert(1)</script><nav><a href="/">Nav</a></nav></main></body></html>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('Keep');
    expect(md).not.toContain('alert');
    expect(md).not.toContain('Nav');
  });

  it('includes front-matter with title', () => {
    const html = `<!DOCTYPE html><html><head><title>My Page</title></head><body><main><p>Hi</p></main></body></html>`;
    const md = htmlToMarkdown(html);
    expect(md).toMatch(/^---/);
    expect(md).toContain('title: "My Page"');
  });

  it('falls back to body when no main element', () => {
    const html = `<!DOCTYPE html><html><head><title>NoMain</title></head><body><p>Fallback</p></body></html>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('Fallback');
  });

  it('includes canonical URL in front-matter', () => {
    const html = `<!DOCTYPE html><html><head><title>T</title><link rel="canonical" href="https://example.com/page"></head><body><main><p>X</p></main></body></html>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('source: "https://example.com/page"');
  });

  // The ASCII banner is the reason this exists: it rendered as one unreadable
  // line of block characters in every experiment page. The banner now closes
  // the hero, AFTER the heading — and it is still dropped, because the h1 is
  // the name markdown should carry.
  it('drops the trailing aria-hidden ASCII banner but keeps the heading', () => {
    const html = `<!DOCTYPE html><html><head><title>Canopy</title></head><body><main>` +
      `<h1>Harness Canopy</h1><p>Real prose.</p>` +
      `<pre class="banner" aria-hidden="true"><code>#### ##  ##</code></pre></main></body></html>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('# Harness Canopy');
    expect(md).toContain('Real prose.');
    expect(md).not.toContain('####');
  });
});

describe('stripAriaHidden', () => {
  it('removes a decorative element and its children', () => {
    const html = '<p>keep</p><div aria-hidden="true"><span>drop</span></div><p>keep2</p>';
    const out = stripAriaHidden(html);
    expect(out).toBe('<p>keep</p><p>keep2</p>');
  });

  // A non-greedy regex stops at the first </div>, which here belongs to the
  // child — it would leave a stray closing tag and swallow the sibling.
  it('matches the right closing tag when the same tag nests', () => {
    const html = '<div aria-hidden="true"><div>inner</div></div><p>survivor</p>';
    expect(stripAriaHidden(html)).toBe('<p>survivor</p>');
  });

  it('removes every decorative element, not just the first', () => {
    const html = '<span aria-hidden="true">a</span><p>mid</p><span aria-hidden="true">b</span>';
    expect(stripAriaHidden(html)).toBe('<p>mid</p>');
  });

  it('handles a self-closing decorative element', () => {
    expect(stripAriaHidden('<img aria-hidden="true" src="x.png"><p>t</p>')).toBe('<p>t</p>');
  });

  it('leaves markup without aria-hidden untouched', () => {
    const html = '<div class="real"><p>text</p></div>';
    expect(stripAriaHidden(html)).toBe(html);
  });

  it('terminates on unbalanced markup instead of looping', () => {
    const out = stripAriaHidden('<div aria-hidden="true"><p>orphan</p>');
    expect(out).not.toContain('aria-hidden');
  });
});

describe('injectLatestRelease', () => {
  const page = (plateAttrs: string) =>
    `<!DOCTYPE html><html><head><title>T</title></head><body><main><p class="lab-plate" ${plateAttrs}>plate</p><p>Body</p></main></body></html>`;

  it('injects the release line as its own paragraph', () => {
    const md = htmlToMarkdown(page('data-release="v0.9.0" data-release-date="2026-09-20"'));
    expect(md).toContain('Latest release: v0.9.0 (2026-09-20)');
    expect(md.split('\n\n')).toContainEqual(expect.stringContaining('Latest release: v0.9.0 (2026-09-20)'));
  });

  it('omits the line when attributes are absent (incl. astro scope attr)', () => {
    const md = htmlToMarkdown(page('data-exp-id="texforge" data-astro-cid-abc="x"'));
    expect(md).not.toContain('Latest release');
    expect(md).toContain('plate');
  });

  it('drops a value carrying an HTML entity instead of corrupting the twin', () => {
    expect(injectLatestRelease('<p class="lab-plate" data-release="v1.0&amp;x" data-release-date="2026-09-20">p</p>')).not.toContain('Latest release');
  });
});

describe('mission-date ISO suffix in markdown twin', () => {
  it('appends the ISO date in parentheses after a mission-date label', () => {
    const html = [
      '<main>',
      '<p class="doc-updated">Last updated ' +
        '<time datetime="2026-10-09T14:00:00Z" data-mission="">TERRA 2026 · Sol 282 · 14:00 UTC</time>' +
        '</p>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('TERRA 2026 · Sol 282 · 14:00 UTC (2026-10-09T14:00Z)');
  });

  it('appends the date-only ISO when no time is present', () => {
    const html = [
      '<main>',
      '<time datetime="2026-10-09" data-mission="">Sol 282</time>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('Sol 282 (2026-10-09)');
  });

  it('marks the suffix on the genesis line — TERRA year + Sol, no time', () => {
    const html = [
      '<main>',
      '<span class="label">Genesis · <time datetime="2026-04-03" data-mission>TERRA 2026 · Sol 93</time></span>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('TERRA 2026 · Sol 93 (2026-04-03)');
  });

  it('marks the suffix on the living-document header, whose label carries a prefix', () => {
    const html = [
      '<main>',
      '<p class="doc-header"><time datetime="2026-06-17" data-mission>living document · v3.0 · TERRA 2026 · Sol 168</time></p>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('living document · v3.0 · TERRA 2026 · Sol 168 (2026-06-17)');
  });

  it('normalizes an offset datetime to the true UTC instant, matching its label', () => {
    // The docs "last updated" datetime is git's %cI — an offset timestamp.
    // The suffix must carry the instant the label names (09:45 UTC), not the
    // offset clock re-labelled Z (04:45Z, five hours off).
    const html = [
      '<main>',
      '<p class="doc-updated">Last updated ' +
        '<time datetime="2026-09-27T04:45:34-05:00" data-mission="">TERRA 2026 · Sol 270 · 09:45 UTC</time>' +
        '</p>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('TERRA 2026 · Sol 270 · 09:45 UTC (2026-09-27T09:45Z)');
    expect(md).not.toContain('04:45Z');
  });

  it('still suffixes a label-shaped <time> that lost its data-mission marker', () => {
    const html = [
      '<main>',
      '<time datetime="2026-10-09T14:00:00Z">TERRA 2026 · Sol 282 · 14:00 UTC</time>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('TERRA 2026 · Sol 282 · 14:00 UTC (2026-10-09T14:00Z)');
  });
});
