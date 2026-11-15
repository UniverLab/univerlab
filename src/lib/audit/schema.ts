// Locates and loads the published audit JSON Schema. The schema file itself
// lives at public/schemas/audit/v1.json so the Astro build publishes it at
// /schemas/audit/v1.json; this module resolves it from the repo root so both
// the CLI (plain Node) and jest can read the same document.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const AUDIT_SCHEMA_PUBLIC_PATH = 'public/schemas/audit/v1.json';
export const AUDIT_SCHEMA_URL = 'https://univerlab.org/schemas/audit/v1.json';

declare const __dirname: string | undefined;

function repoRoot(): string {
  const starts: string[] = [];
  if (typeof process?.cwd === 'function') starts.push(resolve(process.cwd()));
  // Guarded: defined under ts-jest/CommonJS, undefined in plain Node ESM.
  if (typeof __dirname === 'string') starts.push(resolve(__dirname));
  for (const start of starts) {
    for (let dir = start; ; dir = dirname(dir)) {
      if (existsSync(join(dir, AUDIT_SCHEMA_PUBLIC_PATH))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
    }
  }
  throw new Error(`cannot locate ${AUDIT_SCHEMA_PUBLIC_PATH} from ${starts.join(', ')}`);
}

export function auditSchemaPath(): string {
  return join(repoRoot(), AUDIT_SCHEMA_PUBLIC_PATH);
}

export function loadAuditSchema(): unknown {
  return JSON.parse(readFileSync(auditSchemaPath(), 'utf8'));
}
