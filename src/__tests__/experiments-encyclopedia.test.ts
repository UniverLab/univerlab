/**
 * /experiments is the encyclopedia: one entry per registry experiment, in EXP order,
 * archived entries linking to /archive, every entry with an etymology in both languages.
 * The entry list is checked as data (entryModels); the view is checked to render it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { experiments, byId, isArchived } from '../lib/experiments';
import { entryModels } from '../lib/experiment-entries';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const VIEW = readFileSync(resolve(__dirname, '../views/Experiments.astro'), 'utf8');
const entries = entryModels((path) => path);

/** The pronunciation every entry shows right after its headword, slashes included. */
const IPA: Record<string, string> = {
  canopy: '/ˈkæn.ə.pi/',
  texforge: '/ˈtɛk.fɔːrdʒ/',
  gitkit: '/ˈɡɪt.kɪt/',
  ghscaff: '/ˌdʒiː.eɪtʃ ˈskæf/',
  cadspec: '/ˈkæd.spɛk/',
  'astro-denoise': '/ˈæs.troʊ diːˈnɔɪz/',
  demostage: '/ˈdɛm.oʊ.steɪdʒ/',
  quorum: '/ˈkwɔː.rəm/',
};

/** GitKit's figurative sense, copied from the spec for both languages. */
const GITKIT_FIGURE = {
  en: "The craftsman's case that gets the most out of git: the hooks nobody sets up and the rules everybody forgets, kept in one case that opens the same way in every repository.",
  es: 'Estuche del artesano que le saca a git todo el jugo: los ganchos que nadie configura y las reglas que todos olvidan, guardados en un solo estuche que se abre igual en cada repositorio.',
};

type ExperimentCopy = { etymology?: string; figure?: string };
/** Read one experiment's copy from either dictionary without constraining its shape. */
const copyOf = (dict: unknown, id: string): ExperimentCopy | undefined =>
  (dict as { experiments: Record<string, ExperimentCopy> }).experiments[id];

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

describe('experiments encyclopedia pronunciation and second sense', () => {
  it('gives every experiment the IPA value the entry renders', () => {
    expect(Object.keys(IPA).sort()).toEqual(experiments.map((e) => e.id).sort());
    for (const exp of experiments) expect(exp.ipa).toBe(IPA[exp.id]);
  });

  it('writes a figurative sense for every entry in both languages', () => {
    for (const exp of experiments) {
      expect(copyOf(en, exp.id)?.figure?.trim()).toBeTruthy();
      expect(copyOf(es, exp.id)?.figure?.trim()).toBeTruthy();
    }
    expect(copyOf(en, 'gitkit')?.figure).toBe(GITKIT_FIGURE.en);
    expect(copyOf(es, 'gitkit')?.figure).toBe(GITKIT_FIGURE.es);
  });

  it('renders the pronunciation right after the headword, as IPA, in every entry', () => {
    expect(VIEW).toContain('class="ipa"');
    expect(VIEW).toContain('lang="und-fonipa"');
    expect(VIEW).toContain('{exp.ipa}');
    // It sits between the headword and the status mark, inside the same h2.
    const hw = VIEW.match(/<h2 class="hw">.*<\/h2>/);
    expect(hw).toBeTruthy();
    expect(hw![0]).toContain('<span class="ipa" lang="und-fonipa">{exp.ipa}</span>');
    expect(hw![0].indexOf('</b>')).toBeLessThan(hw![0].indexOf('class="ipa"'));
    expect(hw![0].indexOf('class="ipa"')).toBeLessThan(hw![0].indexOf('class="mark"'));
  });

  it('renders the figurative sense as the second numbered sense after the first definition', () => {
    expect(VIEW).toContain('<p class="def fig">');
    expect(VIEW).toContain('{enc.definitionNumber2}');
    expect(VIEW).toContain('{enc.figLabel}');
    expect(VIEW).toContain('{ec.figure}');
    const first = VIEW.indexOf('<p class="def">');
    const second = VIEW.indexOf('<p class="def fig">');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(second - first).toBeLessThan(600);
    // Both senses share the .def style so they read as one entry.
    expect(VIEW).toContain('.def.fig { margin-top: 2px; }');
  });

  it('labels the second sense the same way in both languages', () => {
    for (const dict of [en, es]) {
      expect(dict.encyclopedia.definitionNumber2).toBe('2.');
      expect(dict.encyclopedia.figLabel).toBe('fig.');
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
    // The plate is the large engraving, sized by --plate-h so the machine and
    // the archived number frame always share one height.
    expect(VIEW).toContain('height="var(--plate-h)"');
    expect(VIEW).toContain('clamp(180px, 19vw, 260px)');
    expect(VIEW).not.toContain('<video');
    expect(VIEW).not.toContain('IntersectionObserver');
  });

  it('lays the entries out as a single column of plate-beside-body rows', () => {
    // One entry per row in exp order: no multi-column flow.
    expect(VIEW).not.toContain('columns: 2 340px');
  });

  it('separates the entries by space, never by a rule', () => {
    // Neither this view nor status.astro's global `.entry` may draw a line.
    expect(VIEW).not.toMatch(/\.(entry|plate) \{[^}]*border-bottom/);
    expect(VIEW).toMatch(/\.entry \{[^}]*border: 0;/);
    expect(VIEW).toContain('padding-block: 2.25rem');
  });

  it('leaves no phantom board row under the entry body', () => {
    // status.astro's global `grid-template-rows: auto auto` would add an empty
    // second row (and its 2.5rem row-gap) below every entry body.
    expect(VIEW).toMatch(/\.entry \{[^}]*grid-template-rows: none;/);
  });

  it('centres the text block against a smaller plate from 900px up', () => {
    expect(VIEW).toMatch(
      /@media \(min-width: 900px\) \{\s*\.entry \{ grid-template-columns: minmax\(12rem, 17rem\) minmax\(0, 1fr\); align-items: center; \}/,
    );
    expect(VIEW).toContain('--plate-h: clamp(180px, 19vw, 260px)');
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

describe('experiments encyclopedia links under each entry', () => {
  it('renders a links block holding the plate link then the repo link', () => {
    const blocks = VIEW.match(/<p class="links">[\s\S]*?<\/p>/);
    expect(blocks).toBeTruthy();
    const block = blocks![0];
    expect(block).toContain('href={entry.href}');
    expect(block).toContain('{linkLabel}');
    // Plate first, repo second.
    expect(block.indexOf('entry.href')).toBeLessThan(block.indexOf('href={repo}'));
    expect(block).toMatch(/href=\{repo\}.*target="_blank".*rel="noopener noreferrer"/s);
    expect(block).toContain('enc.use.repo');
    expect(block).toContain('aria-hidden="true"');
  });

  it('keeps the plate link out of the .use row', () => {
    const useBlock = VIEW.match(/<div class="use">[\s\S]*?<\/div>/);
    expect(useBlock).toBeTruthy();
    expect(useBlock![0]).not.toContain('entry.href');
  });

  it('gives every entry a github URL, archived entries included', () => {
    for (const e of entries) {
      expect(byId(e.id).github).toMatch(/^https:\/\/github\.com\/UniverLab\//);
    }
    expect(byId('cadspec').github).toMatch(/^https:\/\/github\.com\/UniverLab\//);
  });

  it('labels the repository link in both languages', () => {
    expect(en.encyclopedia.use.repo).toBe('Repository ↗');
    expect(es.encyclopedia.use.repo).toBe('Repositorio ↗');
  });
});
