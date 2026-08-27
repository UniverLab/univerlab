import { buildFeedXml, etagForFeed, etagForEntries } from '../../workers/announcements/src/feed';

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function parseXml(xml: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(`XML parse error: ${err.textContent} -- ${xml.slice(0, 500)}`);
  return doc;
}

describe('buildFeedXml', () => {
  const entries = [
    {
      id: 'abc-123',
      date: '2026-03-10T12:00:00.000Z',
      title: 'First entry',
      body: '<p>Hello world</p>',
    },
    {
      id: 'def-456',
      date: '2026-03-12T09:30:00.000Z',
      title: 'Second entry',
      body: 'Another body',
    },
  ];

  it('produces well-formed Atom with one entry per input entry', () => {
    const xml = buildFeedXml(entries);
    const doc = parseXml(xml);

    // Root is feed with Atom namespace
    const feed = doc.documentElement;
    expect(feed.tagName).toBe('feed');
    expect(feed.getAttribute('xmlns')).toBe('http://www.w3.org/2005/Atom');

    // Feed-level elements
    const id = doc.querySelector('feed > id')?.textContent;
    expect(id).toBe('https://univerlab.org/');

    const title = doc.querySelector('feed > title')?.textContent;
    expect(title).toBe('UniverLab Mission Log');

    const links = Array.from(doc.querySelectorAll('feed > link'));
    const self = links.find((l) => l.getAttribute('rel') === 'self');
    expect(self?.getAttribute('href')).toBe('https://announcements.univerlab.org/feed.atom');
    const alt = links.find((l) => l.getAttribute('rel') === 'alternate');
    expect(alt?.getAttribute('href')).toBe('https://univerlab.org/status');

    // One <entry> per entry
    const entryEls = doc.querySelectorAll('feed > entry');
    expect(entryEls.length).toBe(entries.length);
  });

  it('uses RFC3339 dates and updated equals newest entry', () => {
    const xml = buildFeedXml(entries);
    const doc = parseXml(xml);

    const updated = doc.querySelector('feed > updated')?.textContent ?? '';
    expect(updated).toMatch(RFC3339);
    // Newest is 2026-03-12
    expect(updated).toBe('2026-03-12T09:30:00.000Z');

    // Per-entry updated also RFC3339
    const entryUpdated = Array.from(doc.querySelectorAll('entry > updated')).map((n) => n.textContent);
    for (const d of entryUpdated) expect(d).toMatch(RFC3339);
  });

  it('escapes &, <, " in title and still parses', () => {
    const tricky = [
      {
        id: 'x-1',
        date: '2026-04-01T00:00:00.000Z',
        title: 'A & B < C "quoted"',
        body: 'Body with & and <tag> and "quotes"',
      },
    ];
    const xml = buildFeedXml(tricky);

    // Raw XML must contain escaped forms, not literal & or <
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&quot;');
    // Must not contain unescaped sequence that would break parsing
    // Parsing should succeed and round-trip title correctly
    const doc = parseXml(xml);
    const titleText = doc.querySelector('entry > title')?.textContent;
    expect(titleText).toBe('A & B < C "quoted"');

    const contentText = doc.querySelector('entry > content')?.textContent;
    expect(contentText).toBe('Body with & and <tag> and "quotes"');
  });

  it('per-entry id is a tag: URI containing the entry id', () => {
    const xml = buildFeedXml(entries);
    const doc = parseXml(xml);
    const ids = Array.from(doc.querySelectorAll('entry > id')).map((n) => n.textContent);
    expect(ids[0]).toBe('tag:univerlab.org,2026:abc-123');
    expect(ids[1]).toBe('tag:univerlab.org,2026:def-456');
  });

  it('per-entry link points to status page and content type is html', () => {
    const xml = buildFeedXml(entries);
    const doc = parseXml(xml);
    const links = Array.from(doc.querySelectorAll('entry > link'));
    for (const l of links) {
      expect(l.getAttribute('rel')).toBe('alternate');
      expect(l.getAttribute('href')).toBe('https://univerlab.org/status');
    }
    const contents = Array.from(doc.querySelectorAll('entry > content'));
    for (const c of contents) expect(c.getAttribute('type')).toBe('html');
  });

  it('empty entries array produces valid feed with no entries', () => {
    const xml = buildFeedXml([]);
    const doc = parseXml(xml);
    expect(doc.querySelector('feed > id')?.textContent).toBe('https://univerlab.org/');
    expect(doc.querySelector('feed > title')?.textContent).toBeTruthy();
    expect(doc.querySelector('feed > updated')?.textContent).toMatch(RFC3339);
    expect(doc.querySelectorAll('feed > entry').length).toBe(0);
    // Still well-formed
    expect(xml).toContain('<feed');
    expect(xml).toContain('</feed>');
  });

  it('same input yields same ETag, different input yields different ETag', () => {
    const xml1 = buildFeedXml(entries);
    const xml2 = buildFeedXml(entries);
    expect(etagForFeed(xml1)).toBe(etagForFeed(xml2));
    expect(etagForEntries(entries)).toBe(etagForEntries([...entries]));

    const different = buildFeedXml([
      ...entries,
      { id: 'zzz', date: '2026-03-13T00:00:00.000Z', title: 'New', body: 'x' },
    ]);
    expect(etagForFeed(xml1)).not.toBe(etagForFeed(different));

    // Also via entries helper
    expect(etagForEntries(entries)).not.toBe(
      etagForEntries([...entries, { id: 'zzz', date: '2026-03-13T00:00:00.000Z', title: 'New', body: 'x' }])
    );
  });

  it('ETag is a strong validator (quoted)', () => {
    const xml = buildFeedXml(entries);
    const etag = etagForFeed(xml);
    expect(etag).toMatch(/^".+"$/);
  });
});
