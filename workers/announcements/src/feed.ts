export interface FeedEntry {
  id: string;
  date: string;
  title: string;
  body: string;
  type?: string;
  topic?: string;
  link?: string;
}

const FEED_ID = 'https://univerlab.org/';
const FEED_TITLE = 'UniverLab Mission Log';
const FEED_SELF = 'https://announcements.univerlab.org/feed.atom';
const FEED_ALT = 'https://univerlab.org/status';

export function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildFeedXml(entries: FeedEntry[]): string {
  let updated: string;
  if (entries.length === 0) {
    updated = '1970-01-01T00:00:00.000Z';
  } else {
    let max = entries[0].date;
    for (const e of entries) {
      if (e.date > max) max = e.date;
    }
    updated = max;
  }

  const entriesXml = entries
    .map((entry) => {
      const entryId = `tag:univerlab.org,2026:${entry.id}`;
      const title = xmlEscape(entry.title ?? '');
      const body = xmlEscape(entry.body ?? '');
      const date = xmlEscape(entry.date ?? updated);
      return (
        `  <entry>\n` +
        `    <id>${xmlEscape(entryId)}</id>\n` +
        `    <title>${title}</title>\n` +
        `    <updated>${date}</updated>\n` +
        `    <link rel="alternate" href="${FEED_ALT}"/>\n` +
        `    <content type="html">${body}</content>\n` +
        `  </entry>`
      );
    })
    .join('\n');

  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom">\n` +
    `  <id>${xmlEscape(FEED_ID)}</id>\n` +
    `  <title>${xmlEscape(FEED_TITLE)}</title>\n` +
    `  <updated>${xmlEscape(updated)}</updated>\n` +
    `  <link rel="self" href="${FEED_SELF}"/>\n` +
    `  <link rel="alternate" href="${FEED_ALT}"/>\n` +
    (entriesXml ? entriesXml + '\n' : '') +
    `</feed>`
  );
}

/**
 * Strong ETag derived deterministically from the rendered XML.
 * Synchronous and pure so tests and the Worker share the same value.
 */
export function etagForFeed(xml: string): string {
  // FNV-1a 32-bit + length for a strong validator without async crypto
  let hash = 2166136261;
  for (let i = 0; i < xml.length; i++) {
    hash ^= xml.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `"${hex}-${xml.length}"`;
}

export function etagForEntries(entries: FeedEntry[]): string {
  return etagForFeed(buildFeedXml(entries));
}
