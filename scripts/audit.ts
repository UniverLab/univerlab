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
import {
  AUDIT_COMMUNITY,
  ZENODO_PROD_API,
  ZENODO_SANDBOX_API,
  depositAssetIds,
  depositAudit,
  depositMetadata,
  depositRefusal,
  findDepositionByConceptDoi,
  sha256Hex,
} from '../src/lib/audit/zenodo.ts';
import type { AuditDocument } from '../src/lib/audit/types.ts';

const BUCKET = 'univerlab-audits';
const SITE = 'https://univerlab.org';
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function usage(): string {
  return 'usage: node scripts/audit.ts validate <folder> | push <folder> [--slug <slug>] | remove <slug> | deposit <folder> [--slug <slug>] [--sandbox|--prod]';
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

function readAuditJson(folder: string): { assets: { path: string }[]; visibility?: unknown } | null {
  try {
    return JSON.parse(readFileSync(join(folder, 'audit.json'), 'utf8')) as {
      assets: { path: string }[];
      visibility?: unknown;
    };
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
  const pageUrl = doc.visibility === 'public' ? `${SITE}/workbench/audits/${slug}/` : `${SITE}/audits/${slug}/`;
  console.log(`Pushed audit '${slug}' (${uploads.length} object(s)): ${pageUrl}`);
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

function contentTypeOf(path: string): string {
  const ext = path.split('.').pop()!.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'json': return 'application/json';
    case 'svg': return 'image/svg+xml';
    case 'png': return 'image/png';
    case 'zip': return 'application/zip';
    case 'txt':
    case 'md': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

/** The remote audit.json of an earlier audit, or null when the bucket does
 *  not hold that slug. Used to resolve a re-audit's concept DOI. */
function fetchRemoteAuditJson(slug: string): AuditDocument | null {
  const tmp = mkdtempSync(join(tmpdir(), 'audit-deposit-'));
  const tmpDoc = join(tmp, 'audit.json');
  if (wrangler(['r2', 'object', 'get', `${BUCKET}/${slug}/audit.json`, '--file', tmpDoc, '--remote']) === null) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(tmpDoc, 'utf8')) as AuditDocument;
  } catch {
    return null;
  }
}

// `deposit <folder>`: publish the audit's public deliverables in Zenodo and
// write the DOIs back into audit.json. Refuses a private audit, open
// critical or high findings, a missing permanent-deposit consent, and an
// audit that is already deposited. A re-audit (badge.previous naming an
// earlier slug) becomes a new version under the earlier audit's concept DOI,
// resolved from that audit's remote document. Sandbox is the default until
// the operator has tested the flow; the token comes from ZENODO_TOKEN only.
async function deposit(folder: string, slugArg: string | undefined, sandbox: boolean): Promise<void> {
  if (!reportValidation(folder)) process.exit(1);
  const slug = slugArg ?? basename(resolve(folder));
  if (!SLUG_RE.test(slug)) {
    console.error(`invalid slug '${slug}': letters, digits, '-' and '_' only`);
    process.exit(2);
  }
  let doc: AuditDocument;
  try {
    doc = JSON.parse(readFileSync(join(folder, 'audit.json'), 'utf8')) as AuditDocument;
  } catch {
    console.error(`${join(folder, 'audit.json')}: cannot be read`);
    process.exit(1);
  }
  const refusal = depositRefusal(doc);
  if (refusal !== null) {
    console.error(`cannot deposit audit '${slug}': ${refusal}`);
    process.exit(1);
  }
  const ids = depositAssetIds(doc);
  if (ids === null) {
    console.error(`cannot deposit audit '${slug}': no TeXForge PDF report in deliverables`);
    process.exit(1);
  }
  const token = process.env['ZENODO_TOKEN'];
  if (!token) {
    console.error('cannot deposit: set ZENODO_TOKEN in the operator environment (never in a commit)');
    process.exit(1);
  }
  const apiBase = process.env['ZENODO_API_BASE'] || (sandbox ? ZENODO_SANDBOX_API : ZENODO_PROD_API);
  const byId = new Map(doc.assets.map((a) => [a.id, a]));
  const seenNames = new Set<string>();
  const files: { filename: string; data: Uint8Array; contentType: string }[] = [];
  for (const id of ids.files) {
    const entry = byId.get(id);
    if (!entry) {
      console.error(`cannot deposit audit '${slug}': unknown asset '${id}'`);
      process.exit(1);
    }
    const filename = basename(entry.path);
    if (seenNames.has(filename)) {
      console.error(`cannot deposit audit '${slug}': two deposited files are both named '${filename}'`);
      process.exit(1);
    }
    seenNames.add(filename);
    let data: Uint8Array;
    try {
      data = readFileSync(join(folder, entry.path));
    } catch {
      console.error(`cannot deposit audit '${slug}': asset file '${entry.path}' cannot be read`);
      process.exit(1);
    }
    // The validator already checked this hash; re-check at deposit time so
    // the deposited bytes are exactly the catalogued ones.
    if (sha256Hex(data).toLowerCase() !== entry.sha256.toLowerCase()) {
      console.error(`cannot deposit audit '${slug}': asset file '${entry.path}' hash does not match the catalogue`);
      process.exit(1);
    }
    files.push({ filename, data, contentType: contentTypeOf(entry.path) });
  }
  let priorDepositionId: number | null = null;
  let conceptNote = 'a new Zenodo concept (first audit of this system)';
  const previous = doc.badge?.previous;
  if (typeof previous === 'string' && previous !== '') {
    const prevDoc = fetchRemoteAuditJson(previous);
    const conceptDoi = prevDoc?.deposit?.conceptDoi;
    if (typeof conceptDoi !== 'string' || conceptDoi === '') {
      console.error(
        `cannot deposit audit '${slug}': previous audit '${previous}' carries no Zenodo concept DOI; deposit it first`,
      );
      process.exit(1);
    }
    const found = await findDepositionByConceptDoi({ apiBase, token, conceptDoi });
    if (found === null) {
      console.error(`cannot deposit audit '${slug}': no Zenodo deposition found for concept ${conceptDoi}`);
      process.exit(1);
    }
    priorDepositionId = found;
    conceptNote = `a new version under concept ${conceptDoi} (previous audit '${previous}')`;
  }
  const metadata = depositMetadata(doc);
  const host = sandbox ? 'sandbox.zenodo.org' : 'zenodo.org';
  console.log(`Depositing audit '${slug}' to Zenodo (${host}) as ${conceptNote}:`);
  console.log('  files:');
  for (const file of files) {
    console.log(`    ${file.filename} (${file.data.length} bytes, sha256 ${sha256Hex(file.data)})`);
  }
  const creators = (metadata['creators'] as { name: string }[]).map((c) => c.name).join(', ');
  console.log('  metadata:');
  console.log(`    title: ${metadata['title']}`);
  console.log(`    creators: ${creators}`);
  console.log(`    subject (client): ${((metadata['subjects'] as { term: string }[])[0] ?? {}).term}`);
  console.log(`    publication date: ${metadata['publication_date']}`);
  console.log(`    language: ${metadata['language']}`);
  console.log(`    resource type: report; community: ${AUDIT_COMMUNITY}`);
  if (typeof metadata['license'] === 'string') console.log(`    license: ${metadata['license']}`);
  if (!confirm(`Publish these ${files.length} file(s) in Zenodo? A Zenodo publication is permanent and cannot be undone.`)) {
    console.log('Aborted: nothing published.');
    process.exit(1);
  }
  let result: { versionDoi: string; conceptDoi: string; recordId: number };
  try {
    result = await depositAudit({ apiBase, token, metadata, files, priorDepositionId });
  } catch (err) {
    console.error(`deposit failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  doc.deposit = {
    versionDoi: result.versionDoi,
    conceptDoi: result.conceptDoi,
    depositedAt: new Date().toISOString().slice(0, 10),
    consent: true,
  };
  writeFileSync(join(folder, 'audit.json'), `${JSON.stringify(doc, null, 2)}\n`);
  if (wrangler(['r2', 'object', 'put', `${BUCKET}/${slug}/audit.json`, '--file', join(folder, 'audit.json'), '--remote']) === null) {
    process.exit(1);
  }
  console.log(`Deposited audit '${slug}': version DOI ${result.versionDoi}, concept DOI ${result.conceptDoi}.`);
  console.log(`Record: https://doi.org/${result.versionDoi}`);
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
} else if (command === 'deposit') {
  const [folder, ...flags] = rest;
  if (!folder) {
    console.error(usage());
    process.exit(2);
  }
  let slug: string | undefined;
  let sandbox = true;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--slug' && i + 1 < flags.length) {
      slug = flags[++i];
    } else if (flags[i] === '--sandbox') {
      sandbox = true;
    } else if (flags[i] === '--prod') {
      sandbox = false;
    } else {
      console.error(`${usage()}\nunknown flag '${flags[i]}'`);
      process.exit(2);
    }
  }
  deposit(folder, slug, sandbox).then(undefined, (err: unknown) => {
    console.error(`deposit failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
} else {
  console.error(command === undefined ? usage() : `${usage()}\nunknown command '${command}'`);
  process.exit(2);
}
