import { resolve, join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import {
  parseTemplateRegistry,
  parseBoilerplate,
  readTemplates,
  readBoilerplates,
  parseFacetIndex,
  parseFacetPackage,
  readFacetCapabilities,
  groupFacetCapabilities,
} from '../lib/catalogs';

describe('catalogs — parseTemplateRegistry', () => {
  it('parses three registry entries with Spanish keys', () => {
    const toml = `[[templates]]
nombre = "article"
descripcion = "Single-column academic article"
version = "0.3.0"

[[templates]]
nombre = "book"
descripcion = "Long-form book layout"
version = "0.2.0"

[[templates]]
nombre = "cv"
descripcion = "Clean CV"
version = "0.1.0"
`;
    const out = parseTemplateRegistry(toml);
    expect(out).toHaveLength(3);
    expect(out).toEqual([
      { name: 'article', description: 'Single-column academic article', version: '0.3.0' },
      { name: 'book', description: 'Long-form book layout', version: '0.2.0' },
      { name: 'cv', description: 'Clean CV', version: '0.1.0' },
    ]);
  });

  it('sorts by name', () => {
    const toml = `[[templates]]
nombre = "zeta"
descripcion = "z"
version = "1.0.0"

[[templates]]
nombre = "alpha"
descripcion = "a"
version = "1.0.0"
`;
    const out = parseTemplateRegistry(toml);
    expect(out.map((t) => t.name)).toEqual(['alpha', 'zeta']);
  });
});

describe('catalogs — parseBoilerplate', () => {
  it('parses the rust template.toml head', () => {
    const toml = `[template]
name = "rust"
language = "Rust"
description = "Rust CLI template with cargo, CI/CD, and standard structure"
version = "1.0.0"

[placeholders]
name = "Project name"
`;
    const out = parseBoilerplate(toml);
    expect(out).toEqual({
      name: 'rust',
      language: 'Rust',
      description: 'Rust CLI template with cargo, CI/CD, and standard structure',
      version: '1.0.0',
    });
  });

  it('parses the python-module template.toml head', () => {
    const toml = `[template]
name = "python-module"
language = "Python"
description = "Python scientific module with CLI, tests, and optional publish to PyPI"
version = "1.0.0"

[placeholders]
name = "Project name (snake_case)"
`;
    const out = parseBoilerplate(toml);
    expect(out).toEqual({
      name: 'python-module',
      language: 'Python',
      description: 'Python scientific module with CLI, tests, and optional publish to PyPI',
      version: '1.0.0',
    });
  });

  it('returns null when name is missing', () => {
    const toml = `[template]
language = "Rust"
description = "no name here"
version = "1.0.0"
`;
    expect(parseBoilerplate(toml)).toBeNull();
  });

  it('does not confuse placeholders name with template name', () => {
    const toml = `[template]
language = "Rust"
description = "x"
version = "1.0.0"

[placeholders]
name = "Project name"
`;
    expect(parseBoilerplate(toml)).toBeNull();
  });
});

describe('catalogs — parseFacetIndex', () => {
  it('lists the package names in order', () => {
    const toml = `version = 1\n\n[[packages]]\nname = "whisper"\n\n[[packages]]\nname = "kokoro"\n`;
    expect(parseFacetIndex(toml)).toEqual(['whisper', 'kokoro']);
  });

  it('ignores keys outside [[packages]] blocks', () => {
    const toml = `version = 1\nname = "not-a-package"\n\n[[packages]]\nname = "kokoro"\n`;
    expect(parseFacetIndex(toml)).toEqual(['kokoro']);
  });
});

describe('catalogs — parseFacetPackage', () => {
  it('reads tool, kind and summary per capability, skipping subsections', () => {
    const toml = `name = "kokoro"
tool_name = "Kokomo"
facet = "voice"

[capabilities.speak]
summary = "Narration from text"
kind = "audio"

[capabilities.speak.inputs.text]
type = "string"

[capabilities.speak.preview]
viewer = "audio"
`;
    expect(parseFacetPackage(toml, 'kokoro')).toEqual([
      { id: 'kokoro.speak', tool: 'Kokomo', kind: 'audio', summary: 'Narration from text', facet: 'voice' },
    ]);
  });

  it('ignores a facet key inside a [capabilities.*] section', () => {
    const toml = `tool_name = "T"
facet = "voice"

[capabilities.a]
summary = "first"
kind = "audio"
facet = "video"
`;
    expect(parseFacetPackage(toml, 'pkg')).toEqual([
      { id: 'pkg.a', tool: 'T', kind: 'audio', summary: 'first', facet: 'voice' },
    ]);
  });

  it('ignores requires_facet when reading the package facet', () => {
    const toml = `tool_name = "T"
requires_facet = "video"

[capabilities.a]
summary = "first"
kind = "audio"
`;
    expect(parseFacetPackage(toml, 'pkg')).toEqual([
      { id: 'pkg.a', tool: 'T', kind: 'audio', summary: 'first', facet: '' },
    ]);
  });

  it('keeps an apostrophe inside a double-quoted summary', () => {
    const toml = `tool_name = "T"\n\n[capabilities.banner]\nsummary = "A text banner in the lab's figlet font (DOS Rebel by default)."\nkind = "text"\n`;
    expect(parseFacetPackage(toml, 'ascii')).toEqual([
      {
        id: 'ascii.banner',
        tool: 'T',
        kind: 'text',
        summary: "A text banner in the lab's figlet font (DOS Rebel by default).",
        facet: '',
      },
    ]);
  });

  it('builds one row per capability as <package>.<cap>', () => {
    const toml = `tool_name = "T"

[capabilities.b]
summary = "second"
kind = "text"

[capabilities.a]
summary = "first"
kind = "audio"
`;
    expect(parseFacetPackage(toml, 'pkg').map((c) => c.id)).toEqual(['pkg.b', 'pkg.a']);
    for (const cap of parseFacetPackage(toml, 'pkg')) {
      expect(cap.facet).toBe('');
    }
  });
});

describe('catalogs — groupFacetCapabilities', () => {
  const pick = (facet: string, id: string) => ({ id, tool: 'T', kind: 'k', summary: 's', facet });

  it('orders facets alphabetically and keeps input order inside each group', () => {
    const caps = [pick('voice', 'b.z'), pick('audio', 'a.y'), pick('voice', 'a.x')];
    const groups = groupFacetCapabilities(caps, { voice: 'Voice', audio: 'Audio' });
    expect(groups.map((g) => g.facet)).toEqual(['audio', 'voice']);
    expect(groups.map((g) => g.label)).toEqual(['Audio', 'Voice']);
    expect(groups[1].caps.map((c) => c.id)).toEqual(['b.z', 'a.x']);
  });

  it('falls back to the registry id when a facet has no label', () => {
    const groups = groupFacetCapabilities([pick('slides', 'd.p')], { voice: 'Voice' });
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('slides');
  });

  it('groups facet-less capabilities under other', () => {
    const groups = groupFacetCapabilities([pick('', 'x.a'), pick('voice', 'k.s')], { other: 'Other', voice: 'Voice' });
    expect(groups.map((g) => g.facet)).toEqual(['other', 'voice']);
    expect(groups[0].caps.map((c) => c.id)).toEqual(['x.a']);
    expect(groups[0].label).toBe('Other');
  });
});

describe('catalogs — readers', () => {
  it('readTemplates returns [] for a non-existent root', () => {
    const root = resolve(tmpdir(), 'no-such-root-' + Math.random());
    expect(readTemplates(root)).toEqual([]);
  });

  it('readBoilerplates returns [] for a non-existent root', () => {
    const root = resolve(tmpdir(), 'no-such-root-' + Math.random());
    expect(readBoilerplates(root)).toEqual([]);
  });

  it('readFacetCapabilities returns [] for a non-existent root', () => {
    const root = resolve(tmpdir(), 'no-such-root-' + Math.random());
    expect(readFacetCapabilities(root)).toEqual([]);
  });

  it('readFacetCapabilities reads the real registry sorted, one row per capability', () => {
    const caps = readFacetCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.map((c) => c.id)).toEqual([...caps.map((c) => c.id)].sort());
    for (const cap of caps) {
      expect(cap.id).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+$/);
      expect(cap.tool.length).toBeGreaterThan(0);
      expect(cap.kind.length).toBeGreaterThan(0);
      expect(cap.summary.length).toBeGreaterThan(0);
      expect(cap.facet.length).toBeGreaterThan(0);
    }
  });

  it('groupFacetCapabilities groups by facet in alphabetical order', () => {
    const caps = readFacetCapabilities();
    const groups = groupFacetCapabilities(caps, {});
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.map((g) => g.facet)).toEqual([...groups.map((g) => g.facet)].sort());
    const total = groups.reduce((n, g) => n + g.caps.length, 0);
    expect(total).toBe(caps.length);
  });

  it('every registry capability resolves to a non-empty page summary', async () => {
    const { es } = await import('../i18n/es');
    const summaries = es.experiments.facetmedia.capabilities.summaries;
    for (const cap of readFacetCapabilities()) {
      expect(summaries[cap.id] ?? cap.summary).not.toBe('');
    }
  });

  it('readTemplates reads from a temp root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cat-'));
    try {
      writeFileSync(
        resolve(dir, 'registry.toml'),
        `[[templates]]\nnombre = "t"\ndescripcion = "d"\nversion = "1"\n`,
      );
      expect(readTemplates(dir)).toEqual([{ name: 't', description: 'd', version: '1' }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('readBoilerplates reads and sorts by language then name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cat-'));
    try {
      mkdirSync(resolve(dir, 'a'));
      mkdirSync(resolve(dir, 'b'));
      writeFileSync(resolve(dir, 'a', 'template.toml'), `[template]\nname = "z"\nlanguage = "Python"\ndescription = "d"\nversion = "1"\n`);
      writeFileSync(resolve(dir, 'b', 'template.toml'), `[template]\nname = "a"\nlanguage = "Rust"\ndescription = "d"\nversion = "1"\n`);
      const out = readBoilerplates(dir);
      expect(out.map((x) => x.language)).toEqual(['Python', 'Rust']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
