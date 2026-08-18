// Pushes the English tagline from src/i18n/en.ts to each experiment's GitHub
// repository description.  This is an explicit, manual command — it never runs
// as part of `build`.
//
// Requires a GITHUB_TOKEN (or GH_TOKEN) with repo scope.
//
// Runs on plain Node (24+) via native type-stripping.
// Usage: npm run apply:github
import { experiments } from '../src/lib/experiments.ts';
import { en } from '../src/i18n/en.ts';
import { parseGitHubUrl } from '../src/lib/github-sync.ts';

async function patchRepoDescription(
  owner: string,
  repo: string,
  description: string,
  token: string,
): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'univerlab-apply',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description }),
  });
  return res.ok;
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!token) {
    console.error('\n✗ apply:github — GITHUB_TOKEN (or GH_TOKEN) is required.\n');
    console.error('  Export a token with repo scope and re-run.\n');
    process.exit(1);
  }

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const exp of experiments) {
    const localTagline = en.experiments[exp.id]?.tagline;
    if (!localTagline) {
      console.log(`  ⏭  ${exp.id} — no tagline in i18n, skipping`);
      skipped++;
      continue;
    }

    const parsed = parseGitHubUrl(exp.github);
    if (!parsed) {
      console.log(`  ⏭  ${exp.id} — github URL is not a repository (${exp.github}), skipping`);
      skipped++;
      continue;
    }

    const ok = await patchRepoDescription(parsed.owner, parsed.repo, localTagline, token);
    if (ok) {
      console.log(`  ✓  ${exp.id} → ${parsed.owner}/${parsed.repo}`);
      applied++;
    } else {
      console.error(`  ✗  ${exp.id} → ${parsed.owner}/${parsed.repo} (API error)`);
      failed++;
    }
  }

  console.log(`\napply:github — ${applied} updated, ${skipped} skipped, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

main();
