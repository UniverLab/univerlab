import { htmlToMarkdown } from '../../scripts/build-md';

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
});
