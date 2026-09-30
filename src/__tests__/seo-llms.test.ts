/**
 * The markdown-twin surface (lgeo-agent-surfaces): every indexable page
 * advertises `<link rel="alternate" type="text/markdown">`, llms.txt links
 * only built files, and llms-full.txt exists under 2 MB.
 *
 * Split out of `seo-indexing.test.ts` — the file-size gate caps changed
 * test files at 1200 lines.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import {
  BEGIN as LLMS_BEGIN,
  END as LLMS_END,
  MAX_FULL_BYTES,
  decodeEntities,
  docsBlock,
  escapeLinkText,
  generatedBlock as generatedLlmsBlock,
  llmsFull,
  sidebarOrder,
  spliceGeneratedBlock as spliceLlmsBlock,
  stripFrontMatter,
  stripGeneratedBlock,
} from '../../scripts/build-llms';
import {
  checkLlmsFull,
  checkLlmsLinks,
  checkLlmsTxt,
  checkMarkdownTwins,
  distFileForLlmsUrl,
  llmsDocsLines,
  llmsFullBytes,
  markdownTwinStats,
} from '../../scripts/check-seo';

/** A throwaway `dist/`-shaped tree for the check-script tests. */
function distFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'seo-'));
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, content, 'utf-8');
  }
  return dir;
}

const page = (extra = '') => `<!doctype html><html><head><title>T</title>${extra}</head><body></body></html>`;
const NOINDEX = '<meta name="robots" content="noindex, nofollow" />';

/** Run a check over a fixture and always clean it up. */
function withDist(files: Record<string, string>, check: (dist: string) => string[]): string[] {
  const dist = distFixture(files);
  try {
    return check(dist);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}
/**
 * The markdown-twin surface (lgeo-agent-surfaces): every indexable page
 * advertises `<link rel="alternate" type="text/markdown">`, llms.txt links
 * only built files, and llms-full.txt exists under 2 MB.
 */
describe('checkMarkdownTwins', () => {
  const twinPage = (canon: string, extra = '') =>
    `<!doctype html><html><head><title>T</title><link rel="canonical" href="${canon}" />` +
    `<link rel="alternate" type="text/markdown" href="${canon}index.md" />${extra}</head><body></body></html>`;
  const barePage = (canon: string) =>
    `<!doctype html><html><head><title>T</title><link rel="canonical" href="${canon}" /></head><body></body></html>`;

  it('passes when every indexable page advertises exactly its built twin', () => {
    const dist = distFixture({
      'index.html': twinPage('https://univerlab.org/'),
      'canopy/index.html': twinPage('https://univerlab.org/canopy/'),
      'index.md': '# home',
      'canopy/index.md': '# canopy',
    });
    try {
      expect(checkMarkdownTwins(dist)).toEqual([]);
      expect(markdownTwinStats(dist)).toEqual({ indexable: 2, twins: 2, links: 2 });
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('requires no link on noindex pages and on 404.html', () => {
    const dist = distFixture({
      'index.html': twinPage('https://univerlab.org/'),
      'today/index.html': page(NOINDEX),
      '404.html': page(),
      'index.md': '# home',
    });
    try {
      expect(checkMarkdownTwins(dist)).toEqual([]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a missing link', () => {
    const failures = withDist(
      { 'a/index.html': barePage('https://univerlab.org/a/'), 'a/index.md': '# a' },
      checkMarkdownTwins,
    );
    expect(failures.join('\n')).toMatch(/\/a\/: expected one text\/markdown alternate link, found 0/);
  });

  it('flags a link whose href is not the canonical twin URL', () => {
    const failures = withDist(
      {
        'b/index.html': twinPage('https://univerlab.org/b/').replace(
          'https://univerlab.org/b/index.md',
          'https://univerlab.org/wrong/index.md',
        ),
        'b/index.md': '# b',
      },
      checkMarkdownTwins,
    );
    expect(failures.join('\n')).toMatch(/is not "https:\/\/univerlab\.org\/b\/index\.md"/);
  });

  it('flags a link whose twin file was not built', () => {
    const failures = withDist(
      { 'c/index.html': twinPage('https://univerlab.org/c/') },
      checkMarkdownTwins,
    );
    expect(failures.join('\n')).toMatch(/was not built/);
  });

  it('flags a twin advertisement on a noindex page and on 404.html', () => {
    const failures = withDist(
      {
        'index.html': twinPage('https://univerlab.org/'),
        'today/index.html': twinPage('https://univerlab.org/today/', NOINDEX),
        '404.html': twinPage('https://univerlab.org/404/'),
        'index.md': '# home',
        'today/index.md': '# today',
      },
      checkMarkdownTwins,
    );
    expect(failures.join('\n')).toMatch(/\/today\/: noindex page must not advertise/);
    expect(failures.join('\n')).toMatch(/\/404\.html: must not advertise/);
  });

  it('flags twins nobody advertises', () => {
    const failures = withDist(
      { 'index.html': barePage('https://univerlab.org/'), 'index.md': '# orphan' },
      checkMarkdownTwins,
    );
    expect(failures.join('\n')).toMatch(/0 pages advertise a twin but 1 twins were built/);
  });
});

describe('checkLlmsLinks', () => {
  it('resolves directories, twins and the root to dist files', () => {
    const dist = distFixture({});
    try {
      expect(distFileForLlmsUrl('/', dist)).toBe(resolve(dist, 'index.html'));
      expect(distFileForLlmsUrl('/canopy/', dist)).toBe(resolve(dist, 'canopy/index.html'));
      expect(distFileForLlmsUrl('/canopy/docs/hooks/index.md', dist)).toBe(
        resolve(dist, 'canopy/docs/hooks/index.md'),
      );
      expect(distFileForLlmsUrl('/canopy', dist)).toBe(resolve(dist, 'canopy/index.html'));
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('passes when every llms.txt URL has a built file', () => {
    const failures = withDist(
      {
        'index.html': page(),
        'canopy/docs/hooks/index.html': page(),
        'canopy/docs/hooks/index.md': '# Hooks',
        'llms.txt': '- [H](https://univerlab.org/)\n- [K](https://univerlab.org/canopy/docs/hooks/index.md): d\n',
      },
      checkLlmsLinks,
    );
    expect(failures).toEqual([]);
  });

  it('flags a URL with no built file and a missing llms.txt', () => {
    const failures = withDist(
      { 'llms.txt': '- [G](https://univerlab.org/gone/)\n' },
      checkLlmsLinks,
    );
    expect(failures).toEqual(['llms.txt: "https://univerlab.org/gone/" has no built file']);
    expect(withDist({}, checkLlmsLinks)).toEqual(['llms.txt: not found in dist/ — build-llms did not run']);
  });
});

describe('checkLlmsFull', () => {
  it('passes a non-empty file under the limit and reports its size', () => {
    const dist = distFixture({ 'llms-full.txt': '# Head\n' });
    try {
      expect(checkLlmsFull(dist)).toEqual([]);
      expect(llmsFullBytes(dist)).toBeGreaterThan(0);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('flags a missing or empty file', () => {
    expect(withDist({}, checkLlmsFull)).toEqual(['llms-full.txt: not found in dist/ — build-llms did not run']);
    expect(withDist({ 'llms-full.txt': '' }, checkLlmsFull)).toEqual(['llms-full.txt: empty']);
  });

  it('flags a file over the limit', () => {
    const dist = distFixture({ 'llms-full.txt': 'x'.repeat(MAX_FULL_BYTES + 1) });
    try {
      expect(checkLlmsFull(dist).join('\n')).toMatch(/over the 2097152 byte limit/);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

describe('llmsDocsLines', () => {
  it('counts only index.md documentation lines', () => {
    const text = [
      '- [Home](https://univerlab.org/): x',
      '- [Hooks](https://univerlab.org/gitkit/docs/hooks/index.md): y',
      '- [Index](https://univerlab.org/gitkit/docs/index.md): z',
    ].join('\n');
    expect(llmsDocsLines(text)).toBe(2);
  });

  it('flags a docs line count that drifted from the built docs pages', () => {
    const failures = withDist(
      {
        'gitkit/docs/a/index.html': page(),
        'gitkit/docs/b/index.html': page(),
        'llms.txt': '- [A](https://univerlab.org/gitkit/docs/a/index.md): x\n',
      },
      checkLlmsTxt,
    );
    expect(failures).toEqual(['llms.txt: 1 documentation lines for 2 built docs pages']);
  });
});

describe('build-llms helpers', () => {
  it('reads the sidebar order, excluding the back link', () => {
    const html =
      '<aside><a class="back label" href="/canopy/">← Canopy</a><nav>' +
      '<a href="/canopy/docs/" class="item active">Canopy</a>' +
      '<a href="/canopy/docs/graphs/" class="item">Graphs</a>' +
      '<a href="/canopy/docs/intelligence-and-sync/" class="item">Intelligence &amp; Sync</a>' +
      '</nav></aside>';
    expect(sidebarOrder('canopy', html)).toEqual([
      { slugPath: '/canopy/docs/', title: 'Canopy' },
      { slugPath: '/canopy/docs/graphs/', title: 'Graphs' },
      { slugPath: '/canopy/docs/intelligence-and-sync/', title: 'Intelligence & Sync' },
    ]);
  });

  it('escapes markdown link text', () => {
    expect(escapeLinkText('A] (b)')).toBe('A\\] \\(b\\)');
    expect(decodeEntities('Intelligence &amp; Sync')).toBe('Intelligence & Sync');
  });

  it('emits one line per page grouped by experiment', () => {
    const groups = [
      {
        id: 'gitkit',
        name: 'GitKit',
        pages: [
          {
            slugPath: '/gitkit/docs/hooks/',
            title: 'Hooks',
            description: 'd',
            canonical: 'https://univerlab.org/gitkit/docs/hooks/',
            twinFile: '/tmp/x.md',
          },
        ],
      },
    ];
    expect(docsBlock(groups)).toBe(
      '## Documentation\n\n### GitKit\n\n- [Hooks](https://univerlab.org/gitkit/docs/hooks/index.md): d',
    );
    expect(generatedLlmsBlock(groups)).toBe(`${LLMS_BEGIN}\n${docsBlock(groups)}\n${LLMS_END}`);
  });

  it('splices idempotently and strips back to the hand-written head', () => {
    const template = '# Head\n\n## Optional\n\n- [x](https://univerlab.org/): y\n';
    const block = `${LLMS_BEGIN}\n## Documentation\n${LLMS_END}`;
    const once = spliceLlmsBlock(template, block);
    expect(spliceLlmsBlock(once, block)).toBe(once);
    expect(stripGeneratedBlock(once)).toBe(template);
  });

  it('strips twin front-matter', () => {
    expect(stripFrontMatter('---\ntitle: "T"\nsource: "U"\n---\n\n# Body\n')).toBe('# Body\n');
  });

  it('concatenates twins under Source lines and fails over the limit', () => {
    const dist = distFixture({
      'g/docs/a/index.md': '---\ntitle: "A"\n---\n\nBody A\n',
    });
    try {
      const groups = [
        {
          id: 'g',
          name: 'G',
          pages: [
            {
              slugPath: '/g/docs/a/',
              title: 'A',
              description: 'd',
              canonical: 'https://univerlab.org/g/docs/a/',
              twinFile: resolve(dist, 'g/docs/a/index.md'),
            },
          ],
        },
      ];
      const full = llmsFull(dist, '# Head\n', groups);
      expect(full).toContain('# A\nSource: https://univerlab.org/g/docs/a/\n\nBody A\n');
      expect(full).not.toContain('title: "A"');
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it('throws naming the size when the full text would exceed 2 MB', () => {
    const dist = distFixture({ 'g/docs/a/index.md': '---\ntitle: "A"\n---\n\n' + 'x'.repeat(MAX_FULL_BYTES) });
    try {
      const groups = [
        {
          id: 'g',
          name: 'G',
          pages: [
            {
              slugPath: '/g/docs/a/',
              title: 'A',
              description: 'd',
              canonical: 'https://univerlab.org/g/docs/a/',
              twinFile: resolve(dist, 'g/docs/a/index.md'),
            },
          ],
        },
      ];
      expect(() => llmsFull(dist, '# Head\n', groups)).toThrow(/over the 2097152 byte limit/);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
