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

  it('links archived entries to the archive anchor and live ones to their page', () => {
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

describe('experiments encyclopedia plate', () => {
  it('draws each entry from the Machine component in themed ink, not a video clip', () => {
    expect(VIEW).toContain('<Machine');
    expect(VIEW).toContain('ink="theme"');
    // The plate is the large engraving: 220–320 px tall, like the page-head postcards.
    expect(VIEW).toContain('height="clamp(220px, 24vw, 320px)"');
    expect(VIEW).not.toContain('<video');
    expect(VIEW).not.toContain('IntersectionObserver');
  });

  it('lays the entries out as a single column of plate-beside-body rows', () => {
    // One entry per row in exp order: no multi-column flow.
    expect(VIEW).not.toContain('columns: 2 340px');
    expect(VIEW).toContain('grid-template-columns: minmax(14rem, 22rem)');
    // Rows are separated by the solid bench rule (the old flow used a dotted one).
    expect(VIEW).toContain('border-bottom: 1px solid var(--bench-rule)');
  });

  it('rests each plate on a soft engraved baseline', () => {
    expect(VIEW).toContain('border-bottom: 1px solid var(--bench-line-soft)');
  });

  it('keeps the archived entry as its EXP number in a dotted frame of the plate size', () => {
    expect(VIEW).toContain('class="num-frame"');
    expect(VIEW).toContain('border: 1px dotted var(--bench-rule)');
    expect(VIEW).toContain("font-family: 'Old Standard TT', serif; font-size: 56px");
    expect(VIEW).toContain('.entry[data-status="archived"] { opacity: 0.7; }');
  });

  it('sets the definition at 18px on a 60ch measure now the body has room', () => {
    expect(VIEW).toContain('font-size: 18px; line-height: 1.55; max-width: 60ch');
  });

  it('keeps status.astro’s global board rule from pinning this body to a second row', () => {
    // status.astro ships `.entry .entry-body { grid-area: 2/1/auto/-1 }` globally;
    // this scoped reset (higher specificity) is what keeps body beside plate.
    expect(VIEW).toContain('.entry .entry-body { grid-column: auto; grid-row: auto; }');
  });

  it('puts the plate on top at phone width with a 200px machine height', () => {
    expect(VIEW).toContain('--machine-h-phone: 200px');
    // The phone rule must actually collapse the two columns, not merely exist.
    expect(VIEW).toMatch(
      /@media \(max-width: 40rem\) \{\s*\.entry \{ grid-template-columns: 1fr; gap: 14px; \}/,
    );
    expect(VIEW).toContain('.num-frame { height: 200px; }');
  });
});
