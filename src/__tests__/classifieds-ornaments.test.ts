import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cutFor,
  hashSeed,
  ORNAMENTS,
  ornamentImg,
  typeOrnament,
  type CutEntry,
} from '../lib/classifieds-ornaments';

describe('typeOrnament', () => {
  it('maps launch and deploy to the launch cut', () => {
    expect(typeOrnament('launch')).toBe('launch');
    expect(typeOrnament('deploy')).toBe('launch');
  });

  it('maps update and bugfix to the update cut', () => {
    expect(typeOrnament('update')).toBe('update');
    expect(typeOrnament('bugfix')).toBe('update');
  });

  it('maps incident and note to their own cuts', () => {
    expect(typeOrnament('incident')).toBe('incident');
    expect(typeOrnament('note')).toBe('note');
  });

  it('leaves unknown types without a cut', () => {
    expect(typeOrnament('unknown')).toBeNull();
    expect(typeOrnament('')).toBeNull();
    expect(typeOrnament(null)).toBeNull();
    expect(typeOrnament(undefined)).toBeNull();
  });
});

describe('ornamentImg', () => {
  it('is decorative, lazy and sized', () => {
    const img = ornamentImg('head');
    expect(img).toContain('alt=""');
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('width="1200"');
    expect(img).toContain('height="451"');
    expect(img).toContain('src="/bench/classifieds/head.webp"');
  });

  it('carries the caller class when given', () => {
    expect(ornamentImg('manicule', 'manicule')).toContain('class="manicule"');
  });

  it('renders nothing for an unknown ornament', () => {
    expect(ornamentImg('nope')).toBe('');
  });
});

describe('ornament files', () => {
  it('exists on disk for every ornament', () => {
    for (const o of Object.values(ORNAMENTS)) {
      expect(existsSync(resolve(__dirname, '..', '..', 'public', o.src.replace(/^\//, '')))).toBe(true);
    }
  });

  it('holds the full period set: experiments, subjects, house ads and dividers', () => {
    for (const name of [
      'tree', 'press', 'keys', 'scaffold', 'cards', 'stage', 'gem', 'telescope', 'compass',
      'locomotive', 'launch', 'envelope', 'note', 'lantern', 'incident', 'update',
      'watch', 'trumpet', 'bulb', 'bench', 'loupe', 'hand', 'manicule',
      'head', 'fleuron', 'ribbon', 'rule',
    ]) {
      expect(ORNAMENTS[name]).toBeDefined();
    }
  });
});

describe('cutFor', () => {
  const DAY = '2026-10-06T01:09:26.735Z';
  const entry = (over: Partial<CutEntry>): CutEntry => ({
    id: 'lead-1', date: DAY, type: 'launch', topic: 'canopy', ...over,
  });

  it('gives an experiment announcement its experiment cut', () => {
    const pairs: Array<[string, string]> = [
      ['canopy', 'tree'],
      ['texforge', 'press'],
      ['gitkit', 'keys'],
      ['ghscaff', 'scaffold'],
      ['quorum', 'cards'],
      ['demostage', 'stage'],
      ['facetmedia', 'gem'],
      ['astro-denoise', 'telescope'],
      ['cadspec', 'compass'],
    ];
    for (const [topic, cut] of pairs) {
      const got = cutFor(entry({ topic }), 1, new Set());
      expect(got && got.name).toBe(cut);
    }
  });

  it('maps general announcements by subject, any subject to watch, trumpet or bulb', () => {
    expect(['locomotive', 'launch']).toContain(cutFor(entry({ topic: 'general', type: 'launch', id: 'n7' }), 1, new Set())?.name);
    expect(['envelope', 'note']).toContain(cutFor(entry({ topic: 'general', type: 'note', id: 'n7' }), 1, new Set())?.name);
    expect(['lantern', 'incident']).toContain(cutFor(entry({ topic: 'general', type: 'incident', id: 'n7' }), 1, new Set())?.name);
    expect(cutFor(entry({ topic: 'general', type: 'update', id: 'n7' }), 1, new Set())?.name).toBe('update');
    expect(['watch', 'trumpet', 'bulb']).toContain(cutFor(entry({ topic: 'general', type: 'mystery', id: 'n7' }), 1, new Set())?.name);
  });

  it('leaves roughly a third of the ads without a cut', () => {
    let empty = 0;
    for (let i = 0; i < 99; i += 1) {
      if (!cutFor(entry({ id: `id-${i}`, date: 'd' }), 1, new Set())) empty += 1;
    }
    expect(empty).toBeGreaterThan(20);
    expect(empty).toBeLessThan(45);
    expect(cutFor(entry({ id: 'e1' }), 1, new Set())).toBeNull();
  });

  it('never repeats a cut on one page, falling back to no cut', () => {
    const used = new Set<string>();
    expect(cutFor(entry({ topic: 'canopy' }), 1, used)?.name).toBe('tree');
    // A second canopy announcement on the same page goes without a cut,
    // even though its own hash would allow one.
    expect(hashSeed(`${DAY}|1|tex-9`) % 3).not.toBe(0);
    expect(cutFor(entry({ id: 'tex-9', topic: 'canopy' }), 1, used)).toBeNull();
    // Another experiment's cut is still available on that page.
    expect(cutFor(entry({ id: 'tex-9', topic: 'texforge' }), 1, used)?.name).toBe('press');
  });

  it('is deterministic for a given page and sizes cuts in three sizes', () => {
    const a = cutFor(entry({}), 1, new Set());
    const b = cutFor(entry({}), 1, new Set());
    expect(a).toEqual(b);
    expect(a?.size).toBe('lg');
    const sizes = new Set<string>();
    for (let i = 0; i < 99; i += 1) {
      const c = cutFor(entry({ id: `id-${i}`, date: 'd' }), 1, new Set());
      if (c) sizes.add(c.size);
    }
    expect([...sizes].sort()).toEqual(['lg', 'md', 'sm']);
  });
});
