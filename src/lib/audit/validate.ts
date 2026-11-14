// Folder validation for audit documents on disk: audit.json plus every
// catalogued file, verified for size and SHA-256. The document-only checks
// live in validate-document.ts so the edge can run them without node:fs.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { SchemaIssue } from './validate-schema.ts';
import { validateAuditDocument, type AuditWarning } from './validate-document.ts';

export { validateAuditDocument };
export type { AuditWarning };

export interface FolderValidation {
  errors: SchemaIssue[];
  warnings: AuditWarning[];
}

type Doc = Record<string, unknown>;

function isRecord(v: unknown): v is Doc {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assetFile(folder: string, rel: string): string | null {
  const abs = resolve(folder, rel);
  const root = resolve(folder) + sep;
  if (abs !== resolve(folder) && !abs.startsWith(root)) return null;
  return abs;
}

// Full folder validation: audit.json plus every catalogued file on disk.
export function validateAuditFolder(folder: string): FolderValidation {
  const errors: SchemaIssue[] = [];
  const warnings: AuditWarning[] = [];
  if (!existsSync(folder)) {
    return { errors: [{ path: folder, message: 'audit folder does not exist' }], warnings };
  }
  const docPath = join(folder, 'audit.json');
  if (!existsSync(docPath)) {
    return { errors: [{ path: docPath, message: 'audit.json not found in the audit folder' }], warnings };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(docPath, 'utf8'));
  } catch {
    return { errors: [{ path: docPath, message: 'audit.json is not valid JSON' }], warnings };
  }
  const result = validateAuditDocument(doc);
  errors.push(...result.errors);
  warnings.push(...result.warnings);
  if (!isRecord(doc) || !Array.isArray(doc['assets'])) return { errors, warnings };

  doc['assets'].forEach((a, i) => {
    if (!isRecord(a) || typeof a['path'] !== 'string' || a['path'] === '') return;
    const base = `$.assets[${i}]`;
    const abs = assetFile(folder, a['path']);
    if (abs === null) {
      errors.push({ path: `${base}.path`, message: `asset path '${a['path']}' escapes the audit folder` });
      return;
    }
    if (!existsSync(abs)) {
      errors.push({ path: `${base}.path`, message: `asset file '${a['path']}' is missing from the audit folder` });
      return;
    }
    const stat = statSync(abs);
    if (!stat.isFile()) {
      errors.push({ path: `${base}.path`, message: `asset path '${a['path']}' is not a file` });
      return;
    }
    if (typeof a['bytes'] === 'number' && Number.isInteger(a['bytes'])) {
      if (stat.size !== a['bytes']) {
        errors.push({ path: `${base}.bytes`, message: `asset file '${a['path']}' is ${stat.size} bytes, catalogue says ${a['bytes']}` });
      }
    }
    if (typeof a['sha256'] === 'string' && /^[0-9a-fA-F]{64}$/.test(a['sha256'])) {
      const digest = createHash('sha256').update(readFileSync(abs)).digest('hex');
      if (digest.toLowerCase() !== a['sha256'].toLowerCase()) {
        errors.push({ path: `${base}.sha256`, message: `asset file '${a['path']}' hash does not match the catalogue` });
      }
    }
  });
  return { errors, warnings };
}
