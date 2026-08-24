import { wantsMarkdown, markdownTwinPath } from '../../functions/_middleware';

describe('wantsMarkdown', () => {
  it('recognises Accept: text/markdown', () => {
    expect(wantsMarkdown('text/markdown')).toBe(true);
  });

  it('recognises text/markdown among multiple types', () => {
    expect(wantsMarkdown('text/html, text/markdown, */*')).toBe(true);
  });

  it('rejects Accept: text/html', () => {
    expect(wantsMarkdown('text/html')).toBe(false);
  });

  it('rejects Accept: */*', () => {
    expect(wantsMarkdown('*/*')).toBe(false);
  });

  it('rejects a missing Accept header', () => {
    expect(wantsMarkdown(null)).toBe(false);
    expect(wantsMarkdown(undefined)).toBe(false);
    expect(wantsMarkdown('')).toBe(false);
  });
});

describe('markdownTwinPath', () => {
  it('maps / to /index.md', () => {
    expect(markdownTwinPath('/')).toBe('/index.md');
  });

  it('maps /canopy to /canopy/index.md', () => {
    expect(markdownTwinPath('/canopy')).toBe('/canopy/index.md');
  });

  it('maps /canopy/ to /canopy/index.md', () => {
    expect(markdownTwinPath('/canopy/')).toBe('/canopy/index.md');
  });

  it('does not rewrite paths ending in .md', () => {
    expect(markdownTwinPath('/llms.txt')).toBeNull();
  });

  it('does not rewrite paths ending in .json', () => {
    expect(markdownTwinPath('/.well-known/agent-card.json')).toBeNull();
  });

  it('does not rewrite paths ending in .png', () => {
    expect(markdownTwinPath('/og.png')).toBeNull();
  });

  it('does not rewrite paths ending in .xml', () => {
    expect(markdownTwinPath('/sitemap.xml')).toBeNull();
  });

  it('does not rewrite paths ending in .txt', () => {
    expect(markdownTwinPath('/llms.txt')).toBeNull();
  });
});
