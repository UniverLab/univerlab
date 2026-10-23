/**
 * /experiments is the encyclopedia: one entry per registry experiment, in EXP order,
 * archived entries linking to /archive, every entry with an etymology in both languages.
 * The entry list is checked as data (entryModels); the view is checked to render it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { experiments, isArchived } from '../lib/experiments';
import { entryModels } from '../lib/experiment-entries';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const VIEW = readFileSync(resolve(__dirname, '../views/Experiments.astro'), 'utf8');
const entries = entryModels((path) => path);

describe('experiments encyclopedia entry list', () => {
  it('has one entry per registry experiment, in registry order', () => {
    expect(entries.map((e) => e.id)).toEqual(experiments.map((e) => e.id));
    expect(entries.length).toBe(experiments.length);
  });

  it('numbers the entries in EXP order and anchors them by lowercased number', () => {
    const anchors = entries.map((e) => e.anchor);
    expect(anchors).toEqual(experiments.map((e) => e.number.toLowerCase()));
    expect(anchors).toEqual([...anchors].sort());
  });

  it('links archived entries to /archive#exp-n and live ones to their page', () => {
    for (const entry of entries) {
      if (isArchived(experiments.find((e) => e.id === entry.id)!)) {
        expect(entry.archived).toBe(true);
        expect(entry.href).toBe(`/archive#${entry.anchor}`);
      } else {
        expect(entry.archived).toBe(false);
        expect(entry.href).toBe(`/${entry.id}`);
      }
    }
    // Production localizes with localizePath, which ends routes in `/`.
    expect(entryModels((path) => `${path}/`).find((e) => e.archived)?.href).toBe('/archive/#exp-005');
  });

  it('keeps the archive anchor literal when the page localizer adds a trailing slash', () => {
    const withSlash = entryModels((path) => `${path}/`);
    const archived = withSlash.find((e) => e.archived);
    expect(archived?.href).toBe('/archive/#exp-005');
    const esEntries = entryModels((path) => `/es${path}/`);
    expect(esEntries.find((e) => e.archived)?.href).toBe('/es/archive/#exp-005');
  });

  it('gives every entry an etymology in both languages', () => {
    for (const exp of experiments) {
      const enCopy = (en.experiments as Record<string, { etymology?: string }>)[exp.id];
      const esCopy = (es.experiments as Record<string, { etymology?: string }>)[exp.id];
      expect(enCopy?.etymology).toBeTruthy();
      expect(esCopy?.etymology).toBeTruthy();
    }
  });

  it('carries the tab labels and the key in both languages', () => {
    for (const dict of [en, es]) {
      expect(dict.encyclopedia.tabs.all).toBeTruthy();
      expect(dict.encyclopedia.tabs.active).toBeTruthy();
      expect(dict.encyclopedia.tabs.research).toBeTruthy();
      expect(dict.encyclopedia.tabs.archived).toBeTruthy();
      expect(dict.encyclopedia.key).toMatch(/§.*¶.*†/);
    }
  });
});

describe('experiments encyclopedia view', () => {
  it('renders the entry list by mapping over entryModels, not a hand-written list', () => {
    expect(VIEW).toContain('entryModels(');
    expect(VIEW).toContain('entries.map((entry)');
  });

  it('gives each article its anchor id and status', () => {
    expect(VIEW).toMatch(/<article class="entry" id=\{entry\.anchor\} data-status=\{status\}>/);
  });

  it('hides non-matching entries with the hidden attribute and keeps aria-pressed on the tabs', () => {
    expect(VIEW).toContain("setAttribute('hidden'");
    expect(VIEW).toContain("setAttribute('aria-pressed'");
  });
});
