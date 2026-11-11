// Audit operator CLI: `validate`, `push` and `remove`.
//
// - `node scripts/audit.ts validate <folder>` checks audit.json against the
//   contract (public/schemas/audit/v1.json) and every cross reference the
//   schema cannot express. Prints each issue with its JSON path; exits 1 on
//   any error. Warnings (unknown block types) never fail the run.
// - `node scripts/audit.ts push <folder> [--slug <slug>]` validates first
//   and refuses an invalid folder, then uploads audit.json and every
//   declared asset to the remote `univerlab-audits` R2 bucket with the
//   operator's own Wrangler login, and prints the page URL.
// - `node scripts/audit.ts remove <slug>` lists the audit's remote objects,
//   asks for confirmation on stdin, then deletes them.
//
// Runs on plain Node (24+) via native type-stripping, like the other
// scripts/*.ts tools.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { validateAuditFolder } from '../src/lib/audit/validate.ts';

const BUCKET = 'univerlab-audits';
const SITE = 'https://univerlab.org';
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function usage(): string {
  return 'usage: node scripts/audit.ts validate <folder> | push <folder> [--slug <slug>] | remove <slug>';
}

function reportValidation(folder: string): boolean {
  const { errors, warnings } = validateAuditFolder(folder);
  for (const w of warnings) console.log(`warning ${w.path}: ${w.message}`);
  for (const e of errors) console.log(`${e.path}: ${e.message}`);
  if (errors.length > 0) {
    console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
    return false;
  }
  console.log(`OK: ${folder} is a valid audit (${warnings.length} warning(s))`);
  return true;
}

/** Run wrangler with the operator's own login. Returns stdout on success;
 *  on failure prints what wrangler said (so a wrong bucket name is visible)
 *  and returns null. */
function wrangler(args: string[]): string | null {
  const res = spawnSync('wrangler', args, { encoding: 'utf8' });
  if (res.status === 0) return res.stdout ?? '';
  const detail = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  console.error(`wrangler ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  return null;
}

function readAuditJson(folder: string): { assets: { path: string }[] } | null {
  try {
    return JSON.parse(readFileSync(join(folder, 'audit.json'), 'utf8')) as { assets: { path: string }[] };
  } catch {
    return null;
  }
}

function push(folder: string, slugArg: string | undefined): void {
  if (!reportValidation(folder)) process.exit(1);
  const slug = slugArg ?? basename(resolve(folder));
  if (!SLUG_RE.test(slug)) {
    console.error(`invalid slug '${slug}': letters, digits, '-' and '_' only`);
    process.exit(2);
  }
  const doc = readAuditJson(folder);
  if (!doc || !Array.isArray(doc.assets)) {
    console.error(`${join(folder, 'audit.json')}: cannot read the asset catalogue`);
    process.exit(1);
  }
  const uploads: { key: string; file: string }[] = [
    { key: `${slug}/audit.json`, file: join(folder, 'audit.json') },
  ];
  for (const asset of doc.assets) {
    if (typeof asset?.path !== 'string' || asset.path === '') {
      console.error(`${join(folder, 'audit.json')}: asset with an empty path cannot be uploaded`);
      process.exit(1);
    }
    uploads.push({ key: `${slug}/${asset.path}`, file: join(folder, asset.path) });
  }
  for (const { key, file } of uploads) {
    const out = wrangler(['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--remote']);
    if (out === null) process.exit(1);
  }
  console.log(`Pushed audit '${slug}' (${uploads.length} object(s)): ${SITE}/audits/${slug}/`);
}

function confirm(question: string): boolean {
  process.stdout.write(`${question} [y/N] `);
  const answer = readFileSync(0, 'utf8').trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

function remove(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    console.error(`invalid slug '${slug}': letters, digits, '-' and '_' only`);
    process.exit(2);
  }
  // The remote audit.json is the source of truth for which objects belong to
  // the audit: wrangler has no object-list command, and the catalogue lists
  // every asset the push uploaded.
  const tmp = mkdtempSync(join(tmpdir(), 'audit-remove-'));
  const tmpDoc = join(tmp, 'audit.json');
  const fetched = wrangler(['r2', 'object', 'get', `${BUCKET}/${slug}/audit.json`, '--file', tmpDoc, '--remote']);
  if (fetched === null) {
    console.error(`no audit '${slug}' in bucket '${BUCKET}'`);
    process.exit(1);
  }
  let assets: { path: string }[] = [];
  try {
    const doc = JSON.parse(readFileSync(tmpDoc, 'utf8')) as { assets?: unknown };
    if (Array.isArray(doc.assets)) {
      assets = (doc.assets as { path?: unknown }[]).filter(
        (a): a is { path: string } => typeof a?.path === 'string',
      );
    }
  } catch {
    console.error(`remote audit '${slug}' has an unreadable audit.json; refusing to delete blindly`);
    process.exit(1);
  }
  const keys = [`${slug}/audit.json`, ...assets.map((a) => `${slug}/${a.path}`)];
  console.log(`Will delete ${keys.length} object(s) of audit '${slug}' from bucket '${BUCKET}':`);
  for (const key of keys) console.log(`  ${key}`);
  if (!confirm(`Delete these ${keys.length} object(s)?`)) {
    console.log('Aborted: nothing deleted.');
    process.exit(1);
  }
  let deleted = 0;
  for (const key of keys) {
    if (wrangler(['r2', 'object', 'delete', `${BUCKET}/${key}`, '--remote']) === null) process.exit(1);
    deleted += 1;
  }
  console.log(`Removed audit '${slug}': ${deleted} object(s) deleted.`);
}

const [, , command, ...rest] = process.argv;

if (command === 'validate') {
  const [folder] = rest;
  if (!folder) {
    console.error(usage());
    process.exit(2);
  }
  if (!reportValidation(folder)) process.exit(1);
} else if (command === 'push') {
  const [folder, ...flags] = rest;
  if (!folder) {
    console.error(usage());
    process.exit(2);
  }
  let slug: string | undefined;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--slug' && i + 1 < flags.length) {
      slug = flags[++i];
    } else {
      console.error(`${usage()}\nunknown flag '${flags[i]}'`);
      process.exit(2);
    }
  }
  push(folder, slug);
} else if (command === 'remove') {
  const [slug] = rest;
  if (!slug) {
    console.error(usage());
    process.exit(2);
  }
  remove(slug);
} else {
  console.error(command === undefined ? usage() : `${usage()}\nunknown command '${command}'`);
  process.exit(2);
}
