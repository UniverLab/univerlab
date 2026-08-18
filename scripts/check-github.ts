// Verifies that every experiment's English tagline (the source of truth in
// src/i18n/en.ts) matches the GitHub repository description. The tagline is the
// owner; GitHub is the mirror.
//
// Without a GITHUB_TOKEN the script exits 0 with "skipped" per experiment, so
// contributor builds never break. With a token it fetches each repo's
// description via the GitHub REST API and flags any drift.
//
// Runs on plain Node (24+) via native type-stripping.  Wired as `check:github`
// in package.json.  Run on demand: `npm run check:github`.
import { experiments } from '../src/lib/experiments.ts';
import { en } from '../src/i18n/en.ts';
import { parseGitHubUrl, compareDescriptions, getTagline } from '../src/lib/github-sync.ts';

// ── types ────────────────────────────────────────────────────────────────────

export interface ComparisonResult {
  experiment: string;
  status: 'match' | 'drift' | 'skip-no-repo' | 'skip-no-token' | 'skip-fetch-failed';
  localTagline?: string;
  remoteDescription?: string;
}

// ── github fetch ─────────────────────────────────────────────────────────────

async function fetchRepoDescription(owner: string, repo: string, token: string): Promise<string | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'univerlab-check',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { description?: string | null };
    return data.description ?? null;
  } catch {
    return null;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

  const results: ComparisonResult[] = [];

  for (const exp of experiments) {
    const localTagline = getTagline(en, exp.id);
    if (!localTagline) {
      results.push({ experiment: exp.id, status: 'skip-no-repo' });
      continue;
    }

    const parsed = parseGitHubUrl(exp.github);
    if (!parsed) {
      results.push({ experiment: exp.id, status: 'skip-no-repo' });
      continue;
    }

    if (!token) {
      results.push({
        experiment: exp.id,
        status: 'skip-no-token',
        localTagline,
      });
      continue;
    }

    const remote = await fetchRepoDescription(parsed.owner, parsed.repo, token);
    if (remote === null) {
      results.push({
        experiment: exp.id,
        status: 'skip-fetch-failed',
        localTagline,
      });
      continue;
    }

    const cmp = compareDescriptions(localTagline, remote);
    results.push({
      experiment: exp.id,
      status: cmp,
      localTagline,
      remoteDescription: remote,
    });
  }

  // ── report ───────────────────────────────────────────────────────────────

  const drifted = results.filter((r) => r.status === 'drift');
  const skipped = results.filter((r) => r.status.startsWith('skip'));
  const matched = results.filter((r) => r.status === 'match');

  if (!token) {
    console.log(`\n✓ check:github — skipped (no GITHUB_TOKEN). ${results.length} experiment(s) not checked.\n`);
    return;
  }

  if (drifted.length === 0) {
    console.log(`\n✓ check:github — all ${matched.length} repository description(s) match the English tagline.`);
    if (skipped.length > 0) {
      console.log(`  ${skipped.length} experiment(s) skipped (no repo or fetch failed).`);
    }
    console.log('');
    return;
  }

  console.error(`\n✗ check:github — ${drifted.length} drift(s) between English tagline and GitHub description:\n`);
  for (const d of drifted) {
    console.error(`  • ${d.experiment}`);
    console.error(`    local:  ${d.localTagline}`);
    console.error(`    remote: ${d.remoteDescription ?? '(empty/missing)'}`);
    console.error('');
  }
  console.error('  Fix: update the GitHub description to match the tagline in src/i18n/en.ts,\n');
  console.error('       or run `npm run apply:github` to push taglines to GitHub.\n');
  process.exit(1);
}

main();
