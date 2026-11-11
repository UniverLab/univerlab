// Document-only audit validation: the checks the JSON Schema cannot express
// but that need no files on disk. This module is deliberately free of node:fs
// and node:crypto so the Pages middleware can run it at request time; the
// folder/file checks stay in validate.ts.
import { KNOWN_BLOCK_TYPES, MEDIA_KINDS, PROSE_REF } from './types.ts';
import { validateAgainstSchema, type SchemaIssue } from './validate-schema.ts';

export interface AuditWarning {
  path: string;
  message: string;
}

type Doc = Record<string, unknown>;

function isRecord(v: unknown): v is Doc {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function idOf(item: unknown): string | null {
  if (!isRecord(item)) return null;
  const id = item['id'];
  return typeof id === 'string' ? id : null;
}

function uniqueIds(errors: SchemaIssue[], items: unknown[], path: string, what: string, key: (item: unknown) => string | null): Map<string, unknown> {
  const seen = new Map<string, unknown>();
  items.forEach((item, i) => {
    const id = key(item);
    if (id === null || id === '') return;
    if (seen.has(id)) {
      errors.push({ path: `${path}[${i}]`, message: `duplicate ${what} id '${id}'` });
    } else {
      seen.set(id, item);
    }
  });
  return seen;
}

// Document-only checks: everything that needs no files on disk.
export function validateAuditDocument(doc: unknown): { errors: SchemaIssue[]; warnings: AuditWarning[] } {
  const errors: SchemaIssue[] = validateAgainstSchema(doc);
  const warnings: AuditWarning[] = [];
  if (!isRecord(doc)) return { errors, warnings };

  const assets = uniqueIds(errors, asArray(doc['assets']), '$.assets', 'asset', idOf);
  const findings = uniqueIds(errors, asArray(doc['findings']), '$.findings', 'finding', idOf);
  const sources = uniqueIds(errors, asArray(doc['sources']), '$.sources', 'source', idOf);
  const annexes = uniqueIds(errors, asArray(doc['annexes']), '$.annexes', 'annex', idOf);
  uniqueIds(errors, asArray(doc['sections']), '$.sections', 'section', idOf);
  const glossaryItems = asArray(doc['glossary']);
  const terms = new Set<string>();
  glossaryItems.forEach((g, i) => {
    if (isRecord(g) && typeof g['term'] === 'string') {
      if (terms.has(g['term'])) errors.push({ path: `$.glossary[${i}]`, message: `duplicate glossary term '${g['term']}'` });
      terms.add(g['term']);
    }
  });

  const assetKind = (id: string): string | null => {
    const a = assets.get(id);
    return isRecord(a) && typeof a['kind'] === 'string' ? a['kind'] : null;
  };
  const requireAsset = (id: unknown, path: string): void => {
    if (typeof id !== 'string' || id === '') return;
    if (!assets.has(id)) errors.push({ path, message: `unknown asset '${id}'` });
  };

  // Media assets need alt text.
  asArray(doc['assets']).forEach((a, i) => {
    if (!isRecord(a) || typeof a['kind'] !== 'string') return;
    if ((MEDIA_KINDS as readonly string[]).includes(a['kind']) && (typeof a['alt'] !== 'string' || a['alt'] === '')) {
      errors.push({ path: `$.assets[${i}].alt`, message: `media asset '${String(a['id'] ?? i)}' needs alt text` });
    }
  });

  // Private audits name their readers; the list itself never leaves the contract.
  if (doc['visibility'] === 'private') {
    const emails = isRecord(doc['access']) && Array.isArray(doc['access']['emails']) ? doc['access']['emails'] : [];
    if (emails.length === 0) {
      errors.push({ path: '$.access.emails', message: 'private audits need at least one access email' });
    }
  }

  // The badge links the re-audit history and dates the audit: the previous
  // slug must be a valid slug and the validity cannot end before it starts.
  // The JSON Schema covers shapes; only the date order needs code.
  if (isRecord(doc['badge'])) {
    const badge = doc['badge'];
    if (typeof badge['previous'] === 'string' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(badge['previous'])) {
      errors.push({ path: '$.badge.previous', message: `invalid audit slug '${badge['previous']}'` });
    }
    if (typeof badge['issued'] === 'string' && typeof badge['validUntil'] === 'string') {
      if (badge['validUntil'] < badge['issued']) {
        errors.push({ path: '$.badge.validUntil', message: 'badge validity cannot end before the issue date' });
      }
    }
  }

  // A recorded deposit consents to permanence: anything but literally
  // true refuses, so a missing or declined consent never publishes.
  if (isRecord(doc['deposit']) && (doc['deposit'] as Doc)['consent'] !== true) {
    errors.push({ path: '$.deposit.consent', message: 'a recorded deposit needs consent true' });
  }

  // Delivered and final audits ship the TeXForge PDF report (a PDF asset).
  const status = isRecord(doc['meta']) ? doc['meta']['status'] : undefined;
  const deliverables = isRecord(doc['deliverables']) ? doc['deliverables'] : null;
  if ((status === 'delivered' || status === 'final') && (!deliverables || typeof deliverables['report'] !== 'string' || deliverables['report'] === '')) {
    errors.push({ path: '$.deliverables.report', message: `audits with status '${String(status)}' need their TeXForge PDF report` });
  }
  if (deliverables) {
    if (typeof deliverables['report'] === 'string' && deliverables['report'] !== '') {
      requireAsset(deliverables['report'], '$.deliverables.report');
      const kind = assetKind(deliverables['report']);
      if (kind !== null && kind !== 'pdf') {
        errors.push({ path: '$.deliverables.report', message: 'the TeXForge report must be a pdf asset' });
      }
    }
    if (typeof deliverables['bundle'] === 'string' && deliverables['bundle'] !== '') {
      requireAsset(deliverables['bundle'], '$.deliverables.bundle');
      const kind = assetKind(deliverables['bundle']);
      if (kind !== null && kind !== 'archive') {
        errors.push({ path: '$.deliverables.bundle', message: 'the asset bundle must be an archive asset' });
      }
    }
  }

  // Annex files name catalogue assets by id.
  asArray(doc['annexes']).forEach((a, i) => {
    if (!isRecord(a)) return;
    const base = `$.annexes[${i}]`;
    asArray(a['assets']).forEach((id, k) => {
      if (typeof id === 'string' && id !== '' && !assets.has(id)) {
        errors.push({ path: `${base}.assets[${k}]`, message: `unknown asset '${id}'` });
      }
    });
  });

  // Finding evidence resolves to an asset, a source or an annex.
  asArray(doc['findings']).forEach((f, i) => {
    if (!isRecord(f)) return;
    asArray(f['evidence']).forEach((e, j) => {
      if (!isRecord(e)) return;
      const base = `$.findings[${i}].evidence[${j}]`;
      if (e['type'] === 'asset') {
        if (typeof e['id'] === 'string' && e['id'] !== '' && !assets.has(e['id'])) {
          errors.push({ path: `${base}.id`, message: `unknown asset '${e['id']}'` });
        }
      } else if (e['type'] === 'source') {
        if (typeof e['id'] === 'string' && e['id'] !== '' && !sources.has(e['id'])) {
          errors.push({ path: `${base}.id`, message: `unknown source '${e['id']}'` });
        }
      } else if (e['type'] === 'annex') {
        if (typeof e['id'] === 'string' && e['id'] !== '' && !annexes.has(e['id'])) {
          errors.push({ path: `${base}.id`, message: `unknown annex '${e['id']}'` });
        }
      }
    });
  });

  // Prose references resolve to a finding, source, glossary term, asset or annex.
  const checkProseRefs = (markdown: unknown, path: string): void => {
    if (typeof markdown !== 'string') return;
    PROSE_REF.lastIndex = 0;
    for (const m of markdown.matchAll(PROSE_REF)) {
      const kind = m[1];
      const ref = m[2];
      const at = `${path} (${m[0]})`;
      if (kind === 'finding' && !findings.has(ref)) errors.push({ path: at, message: `unknown finding '${ref}'` });
      if (kind === 'source' && !sources.has(ref)) errors.push({ path: at, message: `unknown source '${ref}'` });
      if (kind === 'term' && !terms.has(ref)) errors.push({ path: at, message: `unknown glossary term '${ref}'` });
      if (kind === 'asset' && !assets.has(ref)) errors.push({ path: at, message: `unknown asset '${ref}'` });
      if (kind === 'annex' && !annexes.has(ref)) errors.push({ path: at, message: `unknown annex '${ref}'` });
    }
    PROSE_REF.lastIndex = 0;
  };

  asArray(doc['sections']).forEach((s, i) => {
    if (!isRecord(s)) return;
    asArray(s['blocks']).forEach((b, j) => {
      if (!isRecord(b) || typeof b['type'] !== 'string') return;
      const base = `$.sections[${i}].blocks[${j}]`;
      switch (b['type']) {
        case 'finding':
          if (typeof b['findingId'] === 'string' && b['findingId'] !== '' && !findings.has(b['findingId'])) {
            errors.push({ path: `${base}.findingId`, message: `unknown finding '${b['findingId']}'` });
          }
          break;
        case 'chart':
          if (typeof b['dataAsset'] === 'string' && b['dataAsset'] !== '') requireAsset(b['dataAsset'], `${base}.dataAsset`);
          break;
        case 'figure':
          if (typeof b['asset'] === 'string' && b['asset'] !== '') requireAsset(b['asset'], `${base}.asset`);
          if (typeof b['poster'] === 'string' && b['poster'] !== '') requireAsset(b['poster'], `${base}.poster`);
          break;
        case 'code':
          if (typeof b['sourceAsset'] === 'string' && b['sourceAsset'] !== '') requireAsset(b['sourceAsset'], `${base}.sourceAsset`);
          break;
        case 'quote':
          if (typeof b['sourceId'] === 'string' && b['sourceId'] !== '' && !sources.has(b['sourceId'])) {
            errors.push({ path: `${base}.sourceId`, message: `unknown source '${b['sourceId']}'` });
          }
          break;
        case 'table': {
          const cols: unknown = b['columns'];
          if (Array.isArray(cols) && Array.isArray(b['rows'])) {
            b['rows'].forEach((row, r) => {
              if (Array.isArray(row) && row.length !== cols.length) {
                errors.push({ path: `${base}.rows[${r}]`, message: `row has ${row.length} cells but the table has ${cols.length} columns` });
              }
            });
          }
          break;
        }
        case 'assetCard':
          if (typeof b['asset'] === 'string' && b['asset'] !== '') requireAsset(b['asset'], `${base}.asset`);
          break;
        case 'sources':
          if (Array.isArray(b['ids'])) {
            b['ids'].forEach((id, k) => {
              if (typeof id === 'string' && !sources.has(id)) {
                errors.push({ path: `${base}.ids[${k}]`, message: `unknown source '${id}'` });
              }
            });
          }
          break;
        case 'prose':
          checkProseRefs(b['markdown'], `${base}.markdown`);
          break;
        case 'callout':
          checkProseRefs(b['markdown'], `${base}.markdown`);
          break;
        case 'stepper':
          if (Array.isArray(b['steps'])) {
            b['steps'].forEach((step, k) => {
              if (isRecord(step)) checkProseRefs(step['markdown'], `${base}.steps[${k}].markdown`);
            });
          }
          break;
        case 'heading':
        case 'stats':
        case 'findingsTable':
        case 'riskMatrix':
        case 'diagram':
        case 'timeline':
        case 'compare':
        case 'divider':
          // Known blocks with no cross references: structurally checked already.
          break;
        default:
          if (!(KNOWN_BLOCK_TYPES as readonly string[]).includes(b['type'])) {
            warnings.push({ path: base, message: `unknown block type '${b['type']}': renderers skip it` });
          }
          break;
      }
    });
  });

  return { errors, warnings };
}
