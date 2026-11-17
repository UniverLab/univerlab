// The ad-blocker gate: no class, id or aria-label in the built newspaper
// HTML may match a generic EasyList cosmetic selector. Brave (and uBlock
// Origin, AdBlock) ship EasyList's generic `##` rules, which once hid the
// lab's own classifieds lead (`article.log-entry.ad-display`) and the
// display notices (`.ad-cta`, `.ad-line`). The vocabulary is now `notice`
// throughout; this test vendors EasyList's generic `##.ad-…` rules and
// fails the build if any of them can match what the paper renders.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { todayEditionHtml } from '../lib/today-edition';
import { labPageHtml, labPageHtml2 } from '../lib/lab-page';
import {
  paperHouseNoticeDuoHtml,
  paperNoticesHtml,
  paperWorkbenchNoticeDuoHtml,
} from '../lib/paper-ads';
import type { Entry } from '../lib/lab-feed';

const RULES = readFileSync(resolve(__dirname, 'data/easylist-generic.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith('//'));

if (RULES.length < 1000) {
  throw new Error(`easylist-generic.txt looks truncated: ${RULES.length} rules`);
}

// The vendored copy must hold the three rules that hid the lab's content.
for (const known of ['##.ad-display', '##.ad-cta', '##.ad-line']) {
  if (!RULES.includes(known)) throw new Error(`easylist-generic.txt lost ${known}`);
}

const stripNots = (sel: string): string => sel.replace(/:not\([^)]*\)/g, '');

const classOf = (sel: string): string[] =>
  [...stripNots(sel).matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);

const idOf = (sel: string): string[] =>
  [...stripNots(sel).matchAll(/#([A-Za-z_][\w-]*)/g)].map((m) => m[1]);

const quotedOf = (sel: string): string[] =>
  [...sel.matchAll(/\[[\w-]+\s*[~|^$*]?=\s*"([^"]+)"\]/g)].map((m) => m[1]);

const RULE_CLASSES = new Set(RULES.flatMap(classOf));
const RULE_IDS = new Set(RULES.flatMap(idOf));
const RULE_QUOTED = new Set(RULES.flatMap(quotedOf));

const entries: Entry[] = [
  { id: 'n1', date: '2026-11-10T12:00:00.000Z', title: 'FacetMedia launches', body: 'The launch. Second sentence.', type: 'launch', topic: 'facetmedia', link: null },
  { id: 'n2', date: '2026-11-09T12:00:00.000Z', title: 'Canopy notes', body: 'Body two.', type: 'note', topic: 'canopy', link: null },
  { id: 'n3', date: '2026-11-08T12:00:00.000Z', title: 'Deployed fix', body: 'Body three.', type: 'deploy', topic: 'texforge', link: null },
  { id: 'n4', date: '2026-11-07T12:00:00.000Z', title: 'General note', body: 'Body four.', type: 'note', topic: null, link: null },
  { id: 'n5', date: '2026-11-06T12:00:00.000Z', title: 'Bugfix', body: 'Body five.', type: 'bugfix', topic: 'gitkit', link: null },
  { id: 'n6', date: '2026-11-05T12:00:00.000Z', title: 'Old launch', body: 'Body six.', type: 'launch', topic: 'quorum', link: null },
];

const DATE = new Date(2026, 10, 11, 12);

function paperHtml(lang: 'en' | 'es'): string {
  const feed = {
    facts: [],
    lab: entries.map(({ id, date, title, body, type, topic, link }) => ({
      id, date, title, body, type, topic, link,
    })),
  };
  return (
    todayEditionHtml(feed, lang, DATE) +
    labPageHtml(entries, lang) +
    labPageHtml2(entries, lang) +
    paperNoticesHtml(lang) +
    paperWorkbenchNoticeDuoHtml(lang) +
    paperHouseNoticeDuoHtml(lang)
  );
}

const classesIn = (html: string): Set<string> => {
  const out = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  }
  return out;
};

const idsIn = (html: string): Set<string> => {
  const out = new Set<string>();
  for (const m of html.matchAll(/id="([^"]*)"/g)) if (m[1]) out.add(m[1]);
  return out;
};

const labelsIn = (html: string): string[] =>
  [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);

// The static shell around the renderers, as built: everything before the
// component's own script holds the masthead, the folio lines and the paper
// bar. Its classes and ids join the gate; its aria-labels are i18n key
// paths resolved against each language dict below.
const SHELL = readFileSync(resolve(__dirname, '../components/TodaysPaper.astro'), 'utf8');
const SHELL_MARKUP = SHELL.slice(0, SHELL.indexOf('<script'));
const shellClasses = new Set(
  [...SHELL_MARKUP.matchAll(/class="([^"]*)"/g)].flatMap((m) =>
    m[1].split(/\s+/).filter(Boolean),
  ),
);
const shellIds = new Set(
  [...SHELL_MARKUP.matchAll(/id="([^"]*)"/g)].map((m) => m[1]).filter(Boolean),
);
const shellLabelKeys = [...SHELL_MARKUP.matchAll(/aria-label=\{([^}]+)\}/g)].map((m) =>
  m[1].trim(),
);

const resolveLabel = (key: string, dict: typeof en): string | null => {
  const path = key.startsWith('t.') ? key.slice(2).split('.') : [];
  let node: unknown = dict;
  for (const part of path) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : null;
};

// Every selector in the paper's own stylesheet, including the ones nested
// under @media: at-rule heads and keyframe steps are not selectors.
const shellSelectors = (): string[] => {
  const style = SHELL.slice(SHELL.indexOf('<style'), SHELL.lastIndexOf('</style>'));
  const bare = style.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const m of bare.matchAll(/([^{}]+)\{/g)) {
    const head = m[1].trim();
    if (!head || head.startsWith('@') || head === 'from' || head === 'to') continue;
    out.push(...head.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return out;
};

// A bare `.notice` class in a selector: `.notice-run`, `.notice-line`,
// `.notice--feature` and the rest of the longer names never count.
const hasBareNotice = (sel: string): boolean =>
  /\.notice(?![\w-])/.test(stripNots(sel));

describe('newspaper easylist gate', () => {
  for (const lang of ['en', 'es'] as const) {
    it(`no vendored generic selector matches the ${lang} paper`, () => {
      const html = paperHtml(lang);
      const dict = lang === 'es' ? es : en;
      // The static shell (masthead, folio lines, paper bar) is built
      // newspaper HTML too: a class/id/aria-label added there faces the
      // same gate as renderer output.
      const classes = new Set([...classesIn(html), ...shellClasses]);
      const ids = new Set([...idsIn(html), ...shellIds]);
      const labels = [
        ...labelsIn(html),
        ...shellLabelKeys
          .map((key) => resolveLabel(key, dict))
          .filter((label): label is string => label !== null),
      ];
      const hitClasses = [...classes].filter((c) => RULE_CLASSES.has(c));
      const hitIds = [...ids].filter((id) => RULE_IDS.has(id));
      const hitLabels = labels.filter(
        (label) =>
          RULE_QUOTED.has(label) ||
          /advertisement|anuncio|publicidad/i.test(label),
      );
      expect({ hitClasses, hitIds, hitLabels }).toEqual({
        hitClasses: [],
        hitIds: [],
        hitLabels: [],
      });
    });
  }

  it('keeps one-line notices out of the boxed house-notice styles', () => {
    // The one-line overflow notices predate the rename: they have always
    // been `<article class="log-entry notice">` inside `.notice-run`, while
    // the house notices are `<aside class="notice">`. The boxed styles must
    // match only the asides, so the run keeps its dotted-rule look.
    const kinds: Array<Entry['type']> = [
      ...Array<Entry['type']>(28).fill('launch'),
      ...Array<Entry['type']>(26).fill('note'),
      ...Array<Entry['type']>(10).fill('update'),
      'incident',
    ];
    const live: Entry[] = kinds.map((type, i) => ({
      id: `m${i}`,
      date: new Date(Date.UTC(2026, 9, 6) - i * 86400000).toISOString(),
      title: `Live ${i}`,
      body: 'Body.',
      type,
      topic: 'canopy',
      link: null,
    }) as Entry);
    const html = labPageHtml(live, 'en') + labPageHtml2(live, 'en') + paperNoticesHtml('en');
    // Guard: the fixture must exercise the defect — exactly one line notice.
    expect(html.match(/<article class="log-entry notice"/g)).toHaveLength(1);
    document.body.innerHTML = `<div class="paper">${html}</div>`;
    const lineEl = document.querySelector('.notice-run article.log-entry.notice');
    const lineCopy = lineEl?.querySelector('.notice-line');
    expect(lineEl).not.toBeNull();
    expect(lineCopy).not.toBeNull();
    // The one pre-existing exception: `.notice-run .notice` only keeps the
    // run unbroken across columns and carries no box.
    const grandfathered = new Set(['.paper .notice-run .notice']);
    const offending: string[] = [];
    for (const sel of shellSelectors()) {
      if (grandfathered.has(sel) || !hasBareNotice(sel)) continue;
      let hits = false;
      try {
        hits =
          (lineEl as Element).matches(sel) || (lineCopy as Element).matches(sel);
      } catch {
        continue;
      }
      if (hits) offending.push(sel);
    }
    expect(offending).toEqual([]);
    // The house styling itself still reaches the house asides, whatever
    // the box selector is spelled.
    const aside = document.querySelector('aside.notice');
    expect(aside).not.toBeNull();
    expect(
      (aside as Element).matches('.paper .notice') ||
        (aside as Element).matches('.paper aside.notice'),
    ).toBe(true);
  });

  it('keeps the classifieds lead rendering as the lead story', () => {
    const html = labPageHtml(entries, 'en') + labPageHtml2(entries, 'en');
    expect(html).toContain('log-entry display-notice lead-story');
    expect(html).toContain('FacetMedia launches');
    for (const dead of [
      'ad-display',
      'ad-cta',
      'ad-line',
      'ad-boxed',
      'ad-small',
      'ad-art',
      'ad-figure',
      'ad-copy',
      'ad-close',
      'ad-tail',
      'ad-cut',
      'ad-lead',
      'ad--feature',
      'aside class="ad',
    ]) {
      expect(html).not.toContain(dead);
    }
  });
});
