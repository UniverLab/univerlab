import { htmlToMarkdown, stripAriaHidden } from '../../scripts/build-md';

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
  // line of block characters ahead of the real heading in every experiment page.
  it('drops the aria-hidden ASCII banner but keeps the heading after it', () => {
    const html = `<!DOCTYPE html><html><head><title>Canopy</title></head><body><main>` +
      `<pre class="banner" aria-hidden="true"><code>#### ##  ##</code></pre>` +
      `<h1>Harness Canopy</h1><p>Real prose.</p></main></body></html>`;
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
