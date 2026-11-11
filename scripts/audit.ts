// Audit contract validator CLI: `node scripts/audit.ts validate <folder>`.
// Checks audit.json against the contract (public/schemas/audit/v1.json) and
// every cross reference the schema cannot express: referenced findings,
// sources, glossary terms and assets exist, asset files are present with their
// declared sizes and hashes, and delivered/final audits name their TeXForge
// PDF. Prints each issue with its JSON path; exits 1 on any error. Warnings
// (unknown block types) never fail the run.
//
// Runs on plain Node (24+) via native type-stripping, like the other
// scripts/*.ts tools.
import { validateAuditFolder } from '../src/lib/audit/validate.ts';

function usage(): string {
  return 'usage: node scripts/audit.ts validate <folder>';
}

const [, , command, folder] = process.argv;

if (command !== 'validate') {
  console.error(command === undefined ? usage() : `${usage()}\nunknown command '${command}'`);
  process.exit(2);
}
if (!folder) {
  console.error(usage());
  process.exit(2);
}

const { errors, warnings } = validateAuditFolder(folder);
for (const w of warnings) console.log(`warning ${w.path}: ${w.message}`);
for (const e of errors) console.log(`${e.path}: ${e.message}`);
if (errors.length > 0) {
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`OK: ${folder} is a valid audit (${warnings.length} warning(s))`);
