/**
 * The field-notes helpers, at their edges: the general-topic mention loop,
 * the excerpt's word-boundary cut and its hard cut, and the plate without a
 * start date. (The lab-feed tests cover the main flow.)
 */
import {
  normalizeTopic,
  matchesExperiment,
  topicRoadmap,
  firstNonDone,
  excerpt,
  plateStatics,
} from '../lib/field-notes';
import type { Experiment } from '../lib/experiments';
import type { RoadmapItem } from '../lib/lab-feed';

const exp = { id: 'gitkit', name: 'GitKit', number: 'EXP-003' } as Experiment;

const entry = (over: any) => ({ id: 'e', title: '', body: '', topic: 'general', ...over });

describe('matchesExperiment', () => {
  it('matches its own topic id', () => {
    expect(matchesExperiment(entry({ topic: 'gitkit' }), exp)).toBe(true);
  });
  it('a general entry matches when the title or body names it', () => {
    expect(matchesExperiment(entry({ title: 'GitKit guards every commit', body: '' }), exp)).toBe(true);
    expect(matchesExperiment(entry({ title: '', body: '… with gitkit in the loop.' }), exp)).toBe(true);
  });
  it('a general entry without a mention does not match', () => {
    expect(matchesExperiment(entry({ title: 'A quiet note', body: 'nothing here' }), exp)).toBe(false);
  });
  it('a foreign topic never matches', () => {
    expect(matchesExperiment(entry({ topic: 'texforge', title: 'GitKit' }), exp)).toBe(false);
  });
  it('word edges count: gitkitting is not gitkit', () => {
    expect(matchesExperiment(entry({ title: 'gitkitting ahead', body: '' }), exp)).toBe(false);
  });
});

describe('normalizeTopic', () => {
  it('normalizeTopic: known ids, unknown vanish to general', () => {
    expect(normalizeTopic('  GitKit ')).toBe('gitkit');
    expect(normalizeTopic(42)).toBe('general');
    expect(normalizeTopic('nope')).toBe('general');
  });
});

describe('the roadmap lane probes', () => {
  const items = [
    { topic: 'gitkit', state: 'done', pos: 2 },
    { topic: 'GitKit', state: 'now', pos: 1 },
    { topic: 'canopy', state: 'next', pos: 0 },
  ] as RoadmapItem[];
  it('keeps only the experiment’s open items, in order', () => {
    expect(topicRoadmap(items, 'gitkit').map((i) => i.pos)).toEqual([1]);
  });
  it('the first non-done state answers, all-done answers null', () => {
    expect(firstNonDone(items, 'gitkit')).toBe('now');
    expect(firstNonDone(items, 'canopy')).toBe('next');
    expect(firstNonDone([{ topic: 'x', state: 'done', pos: 0 }] as RoadmapItem[], 'x')).toBeNull();
    expect(firstNonDone(items, 'nobody')).toBeNull();
  });
});

describe('excerpt', () => {
  it('passes short and empty text through', () => {
    expect(excerpt('')).toBe('');
    expect(excerpt('  a   b  ')).toBe('a b');
    expect(excerpt(null as any)).toBe('');
  });
  it('cuts on the last word boundary', () => {
    const body = 'word '.repeat(60).trim(); // 299 chars
    const out = excerpt(body, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toBe('word word word word word word word word…');
  });
  it('hard-cuts when no boundary sits past half the budget', () => {
    const out = excerpt('x'.repeat(100) + ' tail', 40);
    expect(out).toBe('x'.repeat(40) + '…');
  });
});

describe('plateStatics', () => {
  it('prints Sol only when the experiment has a start date', () => {
    expect(plateStatics({ ...exp, startDate: '2026-04-01' } as Experiment, 'active')).toMatch(/^EXP-003 · active · Sol \d+$/);
    expect(plateStatics(exp, 'active')).toBe('EXP-003 · active');
  });
});
