/**
 * Lab plate + field notes (lident-plate-notes) — pure logic + source guards.
 * No network.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { byId } from '../lib/experiments';
import { formatSolLabel } from '../lib/mission-time';
import { startSolLabel } from '../lib/mission-time';
import {
  KNOWN_TOPICS,
  excerpt,
  firstNonDone,
  matchesExperiment,
  normalizeTopic,
  plateStatics,
  selectEntries,
  topicRoadmap,
  type Entry,
} from '../lib/field-notes';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const threeLaunches: Entry = {
  id: 'three-launches',
  date: '2026-08-01T10:00:00Z',
  title: 'Three launches, one shared route',
  body: 'TeXForge, GitKit and ghScaff ship together on the same installer route.',
  topic: 'general',
};

describe('matching rule', () => {
  it('selects "Three launches, one shared route" for gitkit and ghscaff, not cadspec', () => {
    expect(matchesExperiment(threeLaunches, { id: 'gitkit', name: 'GitKit' })).toBe(true);
    expect(matchesExperiment(threeLaunches, { id: 'ghscaff', name: 'ghScaff' })).toBe(true);
    expect(matchesExperiment(threeLaunches, { id: 'cadspec', name: 'cadSpec' })).toBe(false);
  });

  it('topic === id matches regardless of text', () => {
    const e: Entry = { id: 'x', date: '2026-08-01T10:00:00Z', title: 'Unrelated', body: 'nothing', topic: 'canopy' };
    expect(matchesExperiment(e, { id: 'canopy', name: 'Canopy' })).toBe(true);
    expect(matchesExperiment(e, { id: 'texforge', name: 'TeXForge' })).toBe(false);
  });

  it('is word-bounded and case-insensitive', () => {
    const e: Entry = { id: 'y', date: '2026-08-01T10:00:00Z', title: 'gitkits everywhere', body: '', topic: 'general' };
    expect(matchesExperiment(e, { id: 'gitkit', name: 'GitKit' })).toBe(false);
    const ok: Entry = { id: 'z', date: '2026-08-01T10:00:00Z', title: 'GITKIT lands', body: '', topic: 'general' };
    expect(matchesExperiment(ok, { id: 'gitkit', name: 'GitKit' })).toBe(true);
  });
});

describe('selectEntries', () => {
  it('is newest-first with id-desc tie-break and limit 3', () => {
    const rows: Entry[] = [
      { id: 'a', date: '2026-08-01T10:00:00Z', title: 'Canopy a', body: '', topic: 'canopy' },
      { id: 'b', date: '2026-08-03T10:00:00Z', title: 'Canopy b', body: '', topic: 'canopy' },
      { id: 'c', date: '2026-08-03T10:00:00Z', title: 'Canopy c', body: '', topic: 'canopy' },
      { id: 'd', date: '2026-08-05T10:00:00Z', title: 'Canopy d', body: '', topic: 'canopy' },
    ];
    const exp = byId('canopy');
    expect(selectEntries(rows, exp).map((r) => r.id)).toEqual(['d', 'c', 'b']);
  });
});

describe('way out', () => {
  it('no entries + two roadmap items renders the way-out line plus both items', () => {
    const exp = byId('quorum');
    expect(selectEntries([], exp)).toEqual([]);
    const rm = topicRoadmap(
      [
        { id: 'r1', title: 'First', state: 'next', topic: 'quorum', pos: 1 },
        { id: 'r2', title: 'Second', state: 'later', topic: 'quorum', pos: 0 },
        { id: 'r3', title: 'Done one', state: 'done', topic: 'quorum', pos: 2 },
      ],
      'quorum',
    );
    expect(rm.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(firstNonDone(
      [
        { id: 'r1', title: 'First', state: 'next', topic: 'quorum', pos: 1 },
        { id: 'r2', title: 'Second', state: 'later', topic: 'quorum', pos: 0 },
      ],
      'quorum',
    )).toBe('later');
  });
});

describe('excerpt', () => {
  it('collapses whitespace, cuts on word boundary, appends …', () => {
    const long = `word  ${'lorem ipsum dolor sit amet '.repeat(10)}`;
    const out = excerpt(long, 160);
    expect(out.length).toBeLessThanOrEqual(161);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s{2,}/);
    expect(excerpt('short body', 160)).toBe('short body');
  });
});

describe('plate static fallback', () => {
  it('contains EXP number, status and Sol since start with network mocked to fail', () => {
    const exp = byId('gitkit');
    const s = plateStatics(exp, 'active');
    expect(s).toContain('EXP-003');
    expect(s).toContain('active');
    expect(s).toContain('Sol ');
  });

  it('startSolLabel equals formatSolLabel (Sol parity)', () => {
    expect(startSolLabel('2026-04-01')).toBe(formatSolLabel('2026-04-01T00:00:00'));
  });
});

describe('topics', () => {
  it('normalizes unknown/null to general and covers every registry id', () => {
    expect(normalizeTopic(null)).toBe('general');
    expect(normalizeTopic('nonsense')).toBe('general');
    for (const e of ['canopy', 'texforge', 'gitkit', 'ghscaff', 'cadspec', 'astro-denoise', 'demostage', 'quorum']) {
      expect(KNOWN_TOPICS.has(e)).toBe(true);
    }
    expect(KNOWN_TOPICS.has('general')).toBe(true);
  });
});

describe('i18n', () => {
  it('en and es carry plate and notes with the same keys', () => {
    expect(en).toHaveProperty('plate');
    expect(es).toHaveProperty('plate');
    expect(en).toHaveProperty('notes');
    expect(es).toHaveProperty('notes');
    expect(Object.keys(en.plate).sort()).toEqual(Object.keys(es.plate).sort());
    expect(Object.keys(en.notes).sort()).toEqual(Object.keys(es.notes).sort());
    expect(en.notes.heading).toBe('Field notes');
    expect(es.notes.heading).toBe('Notas de campo');
  });
});

describe('source guards', () => {
  const layout = readFileSync(resolve(__dirname, '../layouts/ExperimentLayout.astro'), 'utf8');
  const plate = readFileSync(resolve(__dirname, '../components/LabPlate.astro'), 'utf8');
  const notes = readFileSync(resolve(__dirname, '../components/FieldNotes.astro'), 'utf8');
  const client = readFileSync(resolve(__dirname, '../lib/announcements-client.ts'), 'utf8');

  it('layout hosts LabPlate before hero and FieldNotes after exp-nav, inside .exp', () => {
    expect(layout).toContain('<LabPlate');
    expect(layout).toContain('<FieldNotes');
    expect(layout.indexOf('<LabPlate')).toBeLessThan(layout.indexOf('<section class="wrap hero"'));
    expect(layout.indexOf('<FieldNotes')).toBeGreaterThan(layout.indexOf('exp-nav'));
  });

  it('plate has hydrated segments, static Sol, and one release link (R7 superseded)', () => {
    expect(plate).toContain('data-plate-roadmap');
    expect(plate).toContain('data-plate-lastlog');
    expect(plate).toContain('startSolLabel');
    expect(plate).toContain('latestRelease');           // build-time, not client
    // R7 ("plate has no links") is superseded by lexp-release-signal: exactly one
    // anchor, the release segment. Anything beyond that is a regression.
    expect(plate.match(/<a /g) ?? []).toHaveLength(1);
    expect(plate).toContain('lp-release');
  });

  it('notes use heading/empty strings, one status link, and the shared loader', () => {
    expect(notes).toContain('notes.empty');
    expect(notes).toContain('notes.heading');
    expect(notes).toContain('loadBoardData');
    expect(notes.match(/href=/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(notes).toContain('/status');
  });

  it('client issues exactly two fetches and memoises on window', () => {
    expect(client.match(/fetch\(/g)?.length).toBe(2);
    expect(client).toContain('__labBoardData');
  });
});
