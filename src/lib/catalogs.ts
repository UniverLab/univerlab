import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Template {
  name: string;
  description: string;
  version: string;
}

export interface Boilerplate {
  name: string;
  language: string;
  description: string;
  version: string;
}

export function parseTemplateRegistry(toml: string): Template[] {
  const templates: Template[] = [];
  let current: Partial<Template> | null = null;
  const flush = () => {
    if (!current) return;
    templates.push({
      name: current.name ?? '',
      description: current.description ?? '',
      version: current.version ?? '',
    });
    current = null;
  };

  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[\[templates\]\]/.test(line)) {
      flush();
      current = {};
      continue;
    }
    if (/^\[/.test(line)) {
      flush();
      continue;
    }
    if (!current) continue;
    const m = line.match(/^([A-Za-z_]+)\s*=\s*["']([^"']*)["']/);
    if (!m) continue;
    const key = m[1];
    const value = m[2];
    if (key === 'nombre') current.name = value;
    else if (key === 'descripcion') current.description = value;
    else if (key === 'version') current.version = value;
  }
  flush();

  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

export function parseBoilerplate(toml: string): Boilerplate | null {
  let section = '';
  const obj: Partial<Boilerplate> = {};

  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    if (section !== 'template') continue;
    const m = line.match(/^([A-Za-z_]+)\s*=\s*["']([^"']*)["']/);
    if (!m) continue;
    const key = m[1];
    const value = m[2];
    if (key === 'name') obj.name = value;
    else if (key === 'language') obj.language = value;
    else if (key === 'description') obj.description = value;
    else if (key === 'version') obj.version = value;
  }

  if (!obj.name) return null;
  return {
    name: obj.name,
    language: obj.language ?? '',
    description: obj.description ?? '',
    version: obj.version ?? '',
  };
}

export function readTemplates(root = resolve(process.cwd(), '../texforge-templates')): Template[] {
  const registryPath = resolve(root, 'registry.toml');
  if (!existsSync(registryPath)) return [];
  try {
    const content = readFileSync(registryPath, 'utf-8');
    return parseTemplateRegistry(content);
  } catch {
    return [];
  }
}

export function readBoilerplates(root = resolve(process.cwd(), '../ghscaff-boilerplate')): Boilerplate[] {
  if (!existsSync(root)) return [];
  let entries: any[];
  try {
    entries = readdirSync(root, { withFileTypes: true }) as any;
  } catch {
    return [];
  }
  const result: Boilerplate[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = resolve(root, entry.name, 'template.toml');
    if (!existsSync(file)) continue;
    try {
      const parsed = parseBoilerplate(readFileSync(file, 'utf-8'));
      if (parsed) result.push(parsed);
    } catch {
      // skip unreadable files
    }
  }
  return result.sort((a, b) => {
    const lang = a.language.localeCompare(b.language);
    if (lang !== 0) return lang;
    return a.name.localeCompare(b.name);
  });
}
