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
  gpu?: boolean;
  vramGb?: number;
  /** Per-language summaries from `[capabilities.<cap>.i18n.<lang>] summary`. */
  i18n?: Record<string, string>;
  verify?: Record<string, number | string>;
  seed?: boolean;
}

export interface FacetLabel {
  label: string;
  i18n: Record<string, string>;
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
  let reqGpu = false;
  let reqVram: number | undefined;
  let cap: Partial<FacetCapability> | null = null;
  const caps: FacetCapability[] = [];
  const verifyByCap = new Map<string, Record<string, number | string>>();
  const seedCaps = new Set<string>();
  const i18nByCap = new Map<string, Record<string, string>>();
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
        const i18nMatch = section.match(/^capabilities\.([A-Za-z0-9_-]+)\.i18n\.([A-Za-z-]+)$/);
        if (i18nMatch && !i18nByCap.has(`${pkg}.${i18nMatch[1]}`)) {
          i18nByCap.set(`${pkg}.${i18nMatch[1]}`, {});
        }
      }
      continue;
    }
    const i18nSection = section.match(/^capabilities\.([A-Za-z0-9_-]+)\.i18n\.([A-Za-z-]+)$/);
    if (i18nSection) {
      const sm = line.match(/^summary\s*=\s*(["'])(.*?)\1/);
      if (sm) {
        const entry = i18nByCap.get(`${pkg}.${i18nSection[1]}`);
        if (entry) entry[i18nSection[2]] = sm[2];
      }
      continue;
    }
    const verifySection = section.match(/^capabilities\.([A-Za-z0-9_-]+)\.verify$/);
    if (verifySection) {
      const tm = line.match(/^thresholds\s*=\s*(\{.*\})$/);
      if (tm) verifyByCap.set(`${pkg}.${verifySection[1]}`, parseThresholds(tm[1]));
      continue;
    }
    if (section === 'requirements') {
      const gm = line.match(/^gpu\s*=\s*(true|false)\s*$/);
      if (gm) {
        if (gm[1] === 'true') reqGpu = true;
        continue;
      }
      const vm = line.match(/^vram_gb\s*=\s*([0-9.]+)\s*$/);
      if (vm) {
        const n = Number(vm[1]);
        if (Number.isFinite(n)) reqVram = n;
        continue;
      }
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
    if (reqGpu) {
      c.gpu = true;
      if (reqVram !== undefined) c.vramGb = reqVram;
    }
    const i18n = i18nByCap.get(c.id);
    if (i18n && Object.keys(i18n).length > 0) c.i18n = i18n;
  }

  return caps;
}

/** A capability's summary in `lang`, falling back to its English summary. */
export function capabilitySummary(cap: FacetCapability, lang: string): string {
  return cap.i18n?.[lang] ?? cap.summary;
}

/** Facet labels from an index.toml: `[facets.<f>] label` plus per-language
 *  `[facets.<f>.i18n.<lang>] label`. Facets without a section stay absent. */
export function parseFacetLabels(toml: string): Record<string, FacetLabel> {
  const out: Record<string, FacetLabel> = {};
  const ensure = (facet: string): FacetLabel => (out[facet] ??= { label: '', i18n: {} });
  let section = '';
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    const facetMatch = section.match(/^facets\.([A-Za-z0-9_-]+)(\.i18n\.([A-Za-z-]+))?$/);
    if (!facetMatch) continue;
    const m = line.match(/^label\s*=\s*(["'])(.*?)\1/);
    if (!m) continue;
    if (facetMatch[3]) ensure(facetMatch[1]).i18n[facetMatch[3]] = m[2];
    else ensure(facetMatch[1]).label = m[2];
  }
  return out;
}

/** A facet's label in `lang`: registry translation, then the registry label,
 *  then the facet id. */
export function facetLabelsFor(facets: Record<string, FacetLabel>, lang: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [facet, entry] of Object.entries(facets)) {
    out[facet] = entry.i18n[lang] || entry.label || facet;
  }
  return out;
}

/** The command that tries one capability: `facet example <capability> --run`. */
export function facetTryCommand(id: string): string {
  return `facet example ${id} --run`;
}

/** The command that installs one facet: `facet pull <facet>`. */
export function facetPullCommand(facet: string): string {
  return `facet pull ${facet}`;
}

/** The command that installs one package: `facet pull --package <package>`. */
export function facetPackagePullCommand(pkg: string): string {
  return `facet pull --package ${pkg}`;
}

export interface FacetCatalog {
  caps: FacetCapability[];
  facets: Record<string, FacetLabel>;
}

export function readFacetCatalog(
  root = resolve(process.cwd(), '../facetmedia-registry'),
): FacetCatalog {
  const indexPath = resolve(root, 'index.toml');
  if (!existsSync(indexPath)) return { caps: [], facets: {} };
  let index: string;
  try {
    index = readFileSync(indexPath, 'utf-8');
  } catch {
    return { caps: [], facets: {} };
  }
  const names = parseFacetIndex(index);
  const facets = parseFacetLabels(index);
  const caps: FacetCapability[] = [];
  for (const name of names) {
    const file = resolve(root, 'packages', name, 'package.toml');
    if (!existsSync(file)) continue;
    try {
      caps.push(...parseFacetPackage(readFileSync(file, 'utf-8'), name));
    } catch {
      // skip unreadable packages
    }
  }
  return { caps: caps.sort((a, b) => a.id.localeCompare(b.id)), facets };
}

export function readFacetCapabilities(root = resolve(process.cwd(), '../facetmedia-registry')): FacetCapability[] {
  return readFacetCatalog(root).caps;
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
