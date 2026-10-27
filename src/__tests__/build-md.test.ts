import {
  htmlToMarkdown,
  injectLatestRelease,
  main,
  statusOfflineBody,
  statusSnapshotBody,
  stripAriaHidden,
  withStatusSnapshot,
} from '../../scripts/build-md';
import { entryLine, type Entry } from '../../src/lib/lab-feed';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  it('keeps the content after a comment that mentions a stripped tag', () => {
    // The manifesto's index comment says "<nav> is deliberate": the nav strip
    // used to start inside the comment, eat its `-->`, and hide every section
    // up to the next comment's end from the twin.
    const html = `<!DOCTYPE html><html><head><title>T</title></head><body><main><p>Intro</p><!-- <nav> is deliberate: build-md strips <nav> --><nav><a href="#a">Index</a></nav><h2>First section</h2><p>Kept body</p><!-- later --><p>Tail</p></main></body></html>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('## First section');
    expect(md).toContain('Kept body');
    expect(md).toContain('Tail');
    expect(md).not.toContain('Index');
    expect(md).not.toContain('deliberate');
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
        '<time datetime="2026-10-09T14:00:00Z" data-mission="">2026 · Sol 282 · 14:00 UTC</time>' +
        '</p>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('2026 · Sol 282 · 14:00 UTC (2026-10-09T14:00Z)');
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

  it('marks the suffix on the genesis line — year + Sol, no time', () => {
    const html = [
      '<main>',
      '<span class="label">Genesis · <time datetime="2026-04-03" data-mission>2026 · Sol 93</time></span>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('2026 · Sol 93 (2026-04-03)');
  });

  it('marks the suffix on the living-document header, whose label carries a prefix', () => {
    const html = [
      '<main>',
      '<p class="doc-header"><time datetime="2026-06-17" data-mission>living document · v3.0 · 2026 · Sol 168</time></p>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('living document · v3.0 · 2026 · Sol 168 (2026-06-17)');
  });

  it('normalizes an offset datetime to the true UTC instant, matching its label', () => {
    // The docs "last updated" datetime is git's %cI — an offset timestamp.
    // The suffix must carry the instant the label names (09:45 UTC), not the
    // offset clock re-labelled Z (04:45Z, five hours off).
    const html = [
      '<main>',
      '<p class="doc-updated">Last updated ' +
        '<time datetime="2026-09-27T04:45:34-05:00" data-mission="">2026 · Sol 270 · 09:45 UTC</time>' +
        '</p>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('2026 · Sol 270 · 09:45 UTC (2026-09-27T09:45Z)');
    expect(md).not.toContain('04:45Z');
  });

  it('still suffixes a label-shaped <time> that lost its data-mission marker', () => {
    const html = [
      '<main>',
      '<time datetime="2026-10-09T14:00:00Z">2026 · Sol 282 · 14:00 UTC</time>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('2026 · Sol 282 · 14:00 UTC (2026-10-09T14:00Z)');
  });

  it('keeps matching the legacy TERRA label that lost its data-mission marker', () => {
    const html = [
      '<main>',
      '<time datetime="2026-10-09T14:00:00Z">TERRA 2026 · Sol 282 · 14:00 UTC</time>',
      '</main>',
    ].join('');
    const md = htmlToMarkdown(html);
    expect(md).toContain('TERRA 2026 · Sol 282 · 14:00 UTC (2026-10-09T14:00Z)');
  });
});

describe('status snapshot twin (build-md)', () => {
  const entries: Entry[] = [
    {
      id: 'e1',
      date: '2026-10-06T01:09:26.735Z',
      title: 'Newest entry',
      body: 'First paragraph.\n\nSecond paragraph that must not survive.',
      type: 'launch',
      topic: 'canopy',
      link: null,
    },
    {
      id: 'e2',
      date: '2026-10-05T10:00:00.000Z',
      title: 'Older entry',
      body: 'Older body.',
      type: 'note',
      topic: null,
      link: 'https://example.com/o',
    },
  ];
  const NOW = '2026-10-27T09:30:00.000Z';

  it('renders the logbook rows with the shared entryLine and the exact FR3 line', () => {
    const body = statusSnapshotBody(entries, NOW);
    expect(body.split('\n')).toEqual([
      '## Logbook',
      '',
      entryLine(entries[0]),
      entryLine(entries[1]),
      '',
      `Snapshot taken at build time (${NOW}); the live version is served at this same address.`,
    ]);
  });

  it('never renders an empty body: an empty log still carries heading and marker', () => {
    const body = statusSnapshotBody([], NOW);
    expect(body).toContain('## Logbook');
    expect(body).toContain('Nothing in the logbook at build time.');
    expect(body).toContain(
      `Snapshot taken at build time (${NOW}); the live version is served at this same address.`,
    );
    expect(body.trim()).not.toBe('## Logbook');
  });

  it('names the Atom feed and the roadmap twin when the API is down', () => {
    const body = statusOfflineBody();
    expect(body.startsWith('## Logbook\n\n')).toBe(true);
    expect(body).toContain('https://announcements.univerlab.org/feed.atom');
    expect(body).toContain('https://univerlab.org/roadmap/index.md');
    expect(body).toContain('this same address');
    expect(body).not.toContain('Snapshot taken at build time');
  });

  it('keeps the page front matter and replaces the body with the snapshot', () => {
    const html =
      '<!DOCTYPE html><html><head><title>Logbook — live status of every UniverLab experiment</title>' +
      '<link rel="canonical" href="https://univerlab.org/status/"></head>' +
      '<body><main><h1>Logbook</h1><p>The logbook now lives in the API, not here.</p></main></body></html>';
    const body = statusSnapshotBody(entries, NOW);
    const md = withStatusSnapshot(html, body);
    expect(md).toBe(
      '---\n' +
        'title: "Logbook — live status of every UniverLab experiment"\n' +
        'source: "https://univerlab.org/status/"\n' +
        '---\n\n' +
        `${body}\n`,
    );
  });
});

// ------------------------------------------------- main(): the wiring itself
// The helpers above are only as good as main()'s use of them: if the
// `status/index.html` branch ever disappears, every other test in this file
// stays green while dist/status/index.md regresses to the bare front matter
// this spec exists to replace (FR3 "never empty").

describe('main() — status/index.html gets the snapshot, other pages do not', () => {
  const entries: Entry[] = [
    {
      id: 'w1',
      date: '2026-10-26T12:00:00.000Z',
      title: 'Wired through main',
      body: 'Rendered from the API by the real build path.',
      type: 'launch',
      topic: 'canopy',
      link: null,
    },
  ];
  const STATUS_HTML =
    '<!DOCTYPE html><html><head><title>Logbook — live status of every UniverLab experiment</title>' +
    '<link rel="canonical" href="https://univerlab.org/status/"></head>' +
    '<body><main><p>The logbook lives in the API, not here.</p></main></body></html>';
  const ABOUT_HTML =
    '<!DOCTYPE html><html><head><title>About</title>' +
    '<link rel="canonical" href="https://univerlab.org/about/"></head>' +
    '<body><main><h1>About</h1><p>Ordinary page body.</p></main></body></html>';

  let dist: string;
  const realFetch = global.fetch;

  beforeEach(() => {
    dist = join(mkdtempSync(join(tmpdir(), 'build-md-')), 'dist');
    mkdirSync(join(dist, 'status'), { recursive: true });
    mkdirSync(join(dist, 'about'), { recursive: true });
    writeFileSync(join(dist, 'status', 'index.html'), STATUS_HTML, 'utf-8');
    writeFileSync(join(dist, 'about', 'index.html'), ABOUT_HTML, 'utf-8');
  });

  afterEach(() => {
    global.fetch = realFetch;
    rmSync(join(dist, '..'), { recursive: true, force: true });
  });

  const apiUp = () => {
    global.fetch = jest.fn(async () =>
      ({ ok: true, json: async () => ({ entries }) }) as unknown as Response,
    ) as unknown as typeof fetch;
  };
  const apiDown = () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
  };

  it('renders the status twin from the API and never the page shell (API up)', async () => {
    apiUp();
    await main(dist);
    const md = readFileSync(join(dist, 'status', 'index.md'), 'utf-8');

    expect(md).toContain('## Logbook');
    expect(md).toContain(entryLine(entries[0]));
    expect(md).toMatch(
      /^Snapshot taken at build time \(\d{4}-\d{2}-\d{2}T[\d:.]+Z\); the live version is served at this same address\.$/m,
    );
    // The page's own body must not leak in: only its front matter is kept.
    expect(md).not.toContain('The logbook lives in the API, not here.');
    expect(md.trim().split('\n').length).toBeGreaterThan(5);
  });

  it('writes the offline pointers when the API is unreachable', async () => {
    apiDown();
    await main(dist);
    const md = readFileSync(join(dist, 'status', 'index.md'), 'utf-8');

    expect(md).toContain('## Logbook');
    expect(md).toContain('https://announcements.univerlab.org/feed.atom');
    expect(md).toContain('https://univerlab.org/roadmap/index.md');
    expect(md).toContain('this same address');
    expect(md).not.toContain('Snapshot taken at build time');
    expect(md).not.toContain('The logbook lives in the API, not here.');
  });

  it('leaves every other page on the generic conversion', async () => {
    apiUp();
    await main(dist);
    const md = readFileSync(join(dist, 'about', 'index.md'), 'utf-8');

    expect(md).toContain('# About');
    expect(md).toContain('Ordinary page body.');
    expect(md).not.toContain('## Logbook');
    expect(md).not.toContain('Snapshot taken at build time');
  });
});
