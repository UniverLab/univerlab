import { resolve, join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import {
  parseTemplateRegistry,
  parseBoilerplate,
  readTemplates,
  readBoilerplates,
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

describe('catalogs — readers', () => {
  it('readTemplates returns [] for a non-existent root', () => {
    const root = resolve(tmpdir(), 'no-such-root-' + Math.random());
    expect(readTemplates(root)).toEqual([]);
  });

  it('readBoilerplates returns [] for a non-existent root', () => {
    const root = resolve(tmpdir(), 'no-such-root-' + Math.random());
    expect(readBoilerplates(root)).toEqual([]);
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
