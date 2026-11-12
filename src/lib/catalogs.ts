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

export interface FacetCapability {
  id: string;
  tool: string;
  kind: string;
  summary: string;
  facet: string;
  verify?: Record<string, number | string>;
  seed?: boolean;
}

export interface FacetGroup {
  facet: string;
  label: string;
  caps: FacetCapability[];
}

export function groupFacetCapabilities(
  caps: FacetCapability[],
  labels: Record<string, string>,
): FacetGroup[] {
  const byFacet = new Map<string, FacetCapability[]>();
  for (const cap of caps) {
    const f = cap.facet || 'other';
    const list = byFacet.get(f);
    if (list) list.push(cap);
    else byFacet.set(f, [cap]);
  }
  return [...byFacet.keys()].sort().map((facet) => ({
    facet,
    label: labels[facet] ?? facet,
    caps: byFacet.get(facet) ?? [],
  }));
}

export function parseFacetIndex(toml: string): string[] {
  const names: string[] = [];
  let inPackage = false;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^\[\[packages\]\]/.test(line)) {
      inPackage = true;
      continue;
    }
    if (/^\[/.test(line)) {
      inPackage = false;
      continue;
    }
    if (!inPackage) continue;
    const m = line.match(/^name\s*=\s*(["'])(.*?)\1/);
    if (m) names.push(m[2]);
  }
  return names;
}

export function parseFacetPackage(toml: string, pkg: string): FacetCapability[] {
  let tool = '';
  let facet = '';
  let section = '';
  let cap: Partial<FacetCapability> | null = null;
  const caps: FacetCapability[] = [];
  const verifyByCap = new Map<string, Record<string, number | string>>();
  const seedCaps = new Set<string>();
  const flush = () => {
    if (!cap || !cap.id) {
      cap = null;
      return;
    }
    caps.push({
      id: cap.id,
      tool,
      kind: cap.kind ?? '',
      summary: cap.summary ?? '',
      facet,
    });
    cap = null;
  };
  const parseThresholds = (value: string): Record<string, number | string> => {
    const out: Record<string, number | string> = {};
    const inner = value.match(/^\{(.*)\}$/s);
    if (!inner) return out;
    for (const part of inner[1].split(',')) {
      const kv = part.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/);
      if (!kv) continue;
      const rawValue = kv[2];
      const quoted = rawValue.match(/^["'](.*)["']$/);
      if (quoted) {
        out[kv[1]] = quoted[1];
        continue;
      }
      const num = Number(rawValue);
      out[kv[1]] = Number.isFinite(num) ? num : rawValue;
    }
    return out;
  };

  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      flush();
      section = sectionMatch[1].trim();
      const capMatch = section.match(/^capabilities\.([A-Za-z0-9_-]+)$/);
      if (capMatch) cap = { id: `${pkg}.${capMatch[1]}` };
      else {
        const verifyMatch = section.match(/^capabilities\.([A-Za-z0-9_-]+)\.verify$/);
        if (verifyMatch) verifyByCap.set(`${pkg}.${verifyMatch[1]}`, {});
        const seedMatch = section.match(/^capabilities\.([A-Za-z0-9_-]+)\.inputs\.seed$/);
        if (seedMatch) seedCaps.add(`${pkg}.${seedMatch[1]}`);
      }
      continue;
    }
    const verifySection = section.match(/^capabilities\.([A-Za-z0-9_-]+)\.verify$/);
    if (verifySection) {
      const tm = line.match(/^thresholds\s*=\s*(\{.*\})$/);
      if (tm) verifyByCap.set(`${pkg}.${verifySection[1]}`, parseThresholds(tm[1]));
      continue;
    }
    const m = line.match(/^([A-Za-z_-]+)\s*=\s*(["'])(.*?)\2/);
    if (!m) continue;
    if (!section && m[1] === 'tool_name') tool = m[3];
    else if (!section && m[1] === 'facet') facet = m[3];
    else if (cap && (m[1] === 'summary' || m[1] === 'kind')) {
      if (m[1] === 'summary') cap.summary = m[3];
      else cap.kind = m[3];
    }
  }
  flush();

  for (const c of caps) {
    const verify = verifyByCap.get(c.id);
    if (verify && Object.keys(verify).length > 0) c.verify = verify;
    if (seedCaps.has(c.id)) c.seed = true;
  }

  return caps;
}

export function readFacetCapabilities(root = resolve(process.cwd(), '../facetmedia-registry')): FacetCapability[] {
  const indexPath = resolve(root, 'index.toml');
  if (!existsSync(indexPath)) return [];
  let names: string[];
  try {
    names = parseFacetIndex(readFileSync(indexPath, 'utf-8'));
  } catch {
    return [];
  }
  const result: FacetCapability[] = [];
  for (const name of names) {
    const file = resolve(root, 'packages', name, 'package.toml');
    if (!existsSync(file)) continue;
    try {
      result.push(...parseFacetPackage(readFileSync(file, 'utf-8'), name));
    } catch {
      // skip unreadable packages
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
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
