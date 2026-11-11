// The types and the published schema must agree: every closed list in
// src/lib/audit/types.ts appears in public/schemas/audit/v1.json and every
// block the schema defines has a TypeScript twin. Every schema property
// carries a description so an agent can write a valid audit from it alone.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSET_KINDS,
  AUDIT_CONTRACT,
  CALLOUT_TONES,
  EFFORTS,
  FINDING_STATUSES,
  KNOWN_BLOCK_TYPES,
  LAYOUT_RATIOS,
  LAYOUT_TYPES,
  SEVERITIES,
} from '../lib/audit/types.ts';
import { AUDIT_SCHEMA_URL, loadAuditSchema } from '../lib/audit/schema.ts';

const schema = loadAuditSchema() as Record<string, unknown>;
const defs = (schema['$defs'] ?? {}) as Record<string, Record<string, unknown>>;

function collectConsts(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((v) => collectConsts(v, out));
    return;
  }
  if (node !== null && typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    if (typeof rec['const'] === 'string') out.add(rec['const']);
    Object.values(rec).forEach((v) => collectConsts(v, out));
  }
}

function collectEnums(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const v of node) {
      if (typeof v !== 'object' || v === null) continue;
      const rec = v as Record<string, unknown>;
      if (Array.isArray(rec['enum'])) rec['enum'].forEach((e) => typeof e === 'string' && out.add(e));
    }
    node.forEach((v) => collectEnums(v, out));
    return;
  }
  if (node !== null && typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    if (Array.isArray(rec['enum'])) rec['enum'].forEach((e) => typeof e === 'string' && out.add(e));
    Object.values(rec).forEach((v) => collectEnums(v, out));
  }
}

describe('audit schema identity', () => {
  it('is draft 2020-12 at the published URL for contract univerlab.audit/1', () => {
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema['$id']).toBe(AUDIT_SCHEMA_URL);
    expect(AUDIT_SCHEMA_URL).toBe('https://univerlab.org/schemas/audit/v1.json');
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['contract']['const']).toBe(AUDIT_CONTRACT);
    expect(AUDIT_CONTRACT).toBe('univerlab.audit/1');
  });

  it('covers exactly the 19 catalogue block types, no more and no fewer', () => {
    const consts = new Set<string>();
    for (const [name, def] of Object.entries(defs)) {
      if (!name.endsWith('Block') || name === 'extensionBlock') continue;
      const typeProp = ((def['properties'] ?? {}) as Record<string, Record<string, unknown>>)['type'];
      if (typeof typeProp?.['const'] === 'string') consts.add(typeProp['const']);
    }
    expect(consts).toEqual(new Set(KNOWN_BLOCK_TYPES));
    expect(KNOWN_BLOCK_TYPES).toHaveLength(19);
  });

  it('covers every other closed list from the TypeScript types', () => {
    const consts = new Set<string>();
    collectConsts(schema, consts);
    const enums = new Set<string>();
    collectEnums(schema, enums);
    for (const t of LAYOUT_TYPES) expect(enums.has(t)).toBe(true);
    for (const k of ASSET_KINDS) expect(enums.has(k)).toBe(true);
    for (const s of SEVERITIES) expect(enums.has(s)).toBe(true);
    for (const s of FINDING_STATUSES) expect(enums.has(s)).toBe(true);
    for (const e of EFFORTS) expect(enums.has(e)).toBe(true);
    for (const t of CALLOUT_TONES) expect(enums.has(t)).toBe(true);
    for (const t of KNOWN_BLOCK_TYPES) expect(consts.has(t)).toBe(true);
  });

  it('keeps each closed list exactly equal to its TypeScript twin, both ways', () => {
    const valuesAt = (path: string[]): string[] => {
      let node: unknown = schema;
      for (const key of path) node = (node as Record<string, unknown> | undefined)?.[key];
      return Array.isArray(node) ? (node as string[]) : [];
    };
    const exact: [string, readonly string[], string[]][] = [
      ['layout.type', LAYOUT_TYPES, ['$defs', 'layout', 'properties', 'type', 'enum']],
      ['layout.ratio', LAYOUT_RATIOS, ['$defs', 'layout', 'properties', 'ratio', 'enum']],
      ['asset.kind', ASSET_KINDS, ['$defs', 'asset', 'properties', 'kind', 'enum']],
      ['finding.severity', SEVERITIES, ['$defs', 'finding', 'properties', 'severity', 'enum']],
      ['finding.status', FINDING_STATUSES, ['$defs', 'finding', 'properties', 'status', 'enum']],
      ['finding.effort', EFFORTS, ['$defs', 'finding', 'properties', 'effort', 'enum']],
      ['callout.tone', CALLOUT_TONES, ['$defs', 'calloutBlock', 'properties', 'tone', 'enum']],
      ['findingsTable.severity', SEVERITIES, ['$defs', 'findingsTableBlock', 'properties', 'severity', 'items', 'enum']],
      ['findingsTable.status', FINDING_STATUSES, ['$defs', 'findingsTableBlock', 'properties', 'status', 'items', 'enum']],
      ['visibility', ['public', 'private'], ['properties', 'visibility', 'enum']],
      ['meta.language', ['es', 'en'], ['$defs', 'meta', 'properties', 'language', 'enum']],
      ['meta.status', ['draft', 'delivered', 'final'], ['$defs', 'meta', 'properties', 'status', 'enum']],
      ['accent', ['lab', 'experiment'], ['properties', 'accent', 'enum']],
      ['evidence.type', ['asset', 'source'], ['$defs', 'evidence', 'properties', 'type', 'enum']],
      ['extensionBlock excludes the catalogue', KNOWN_BLOCK_TYPES, ['$defs', 'extensionBlock', 'properties', 'type', 'not', 'enum']],
    ];
    for (const [name, expected, path] of exact) {
      expect({ name, values: [...valuesAt(path)].sort() }).toEqual({ name, values: [...expected].sort() });
    }
  });

  it('describes every property so an agent can write from the schema alone', () => {
    const missing: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (node === null || typeof node !== 'object') return;
      const rec = node as Record<string, unknown>;
      const props = rec['properties'];
      if (props !== null && typeof props === 'object' && !Array.isArray(props)) {
        for (const [name, sub] of Object.entries(props as Record<string, unknown>)) {
          const subRec = sub as Record<string, unknown>;
          if (typeof subRec['description'] !== 'string' || subRec['description'] === '') {
            missing.push(`${path}.properties.${name}`);
          }
          walk(sub, `${path}.properties.${name}`);
        }
      }
      for (const key of ['items', 'anyOf', 'allOf', 'oneOf', '$defs', 'patternProperties']) {
        if (rec[key] !== undefined) walk(rec[key], `${path}.${key}`);
      }
    };
    walk(schema, '$');
    expect(missing).toEqual([]);
  });
});

describe('audit contract fixture', () => {
  const dir = join(__dirname, 'fixtures', 'audit-contract');

  it('is clearly a fixture, never a real audit', () => {
    const doc = JSON.parse(readFileSync(join(dir, 'audit.json'), 'utf8')) as {
      meta: { title: string; client: { name: string } };
    };
    expect(doc.meta.title.toLowerCase()).toContain('fixture');
    expect(doc.meta.client.name.toLowerCase()).toContain('fixture');
  });

  it('is never published as a page', () => {
    const pages: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else pages.push(p);
      }
    };
    walk(join(__dirname, '..', 'pages'));
    const hits = pages.filter((p) => readFileSync(p, 'utf8').includes('audit-contract'));
    expect(hits).toEqual([]);
  });
});
