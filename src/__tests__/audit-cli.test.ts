// The audit CLI is the contract gate agents run: exit 0 for a valid folder,
// exit 1 listing each error with its JSON path for a broken one.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'audit-contract');

function run(...args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, ['scripts/audit.ts', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 99, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const FAKE_WRANGLER = `#!/bin/bash
# Fake wrangler for the audit CLI tests: treats $FAKE_BUCKET_DIR as the
# univerlab-audits bucket and logs every invocation to $FAKE_LOG.
echo "$@" >> "$FAKE_LOG"
file_arg() {
  local prev=""
  for a in "$@"; do
    if [ "$prev" = "--file" ]; then printf '%s' "$a"; return; fi
    prev="$a"
  done
}
if [ "$1" = "r2" ] && [ "$2" = "object" ] && [ "$3" = "put" ]; then
  key="\${4#*/}"
  mkdir -p "$FAKE_BUCKET_DIR/$(dirname "$key")"
  cp "$(file_arg "$@")" "$FAKE_BUCKET_DIR/$key"
  exit 0
fi
if [ "$1" = "r2" ] && [ "$2" = "object" ] && [ "$3" = "get" ]; then
  key="\${4#*/}"
  if [ -f "$FAKE_BUCKET_DIR/$key" ]; then
    cp "$FAKE_BUCKET_DIR/$key" "$(file_arg "$@")"
    exit 0
  else
    echo "ERROR: object not found" >&2
    exit 1
  fi
fi
if [ "$1" = "r2" ] && [ "$2" = "object" ] && [ "$3" = "delete" ]; then
  key="\${4#*/}"
  rm -f "$FAKE_BUCKET_DIR/$key"
  exit 0
fi
echo "unknown command $*" >&2
exit 1
`;

/** A tmp dir with a fake `wrangler` first on PATH and an empty bucket dir. */
function fakeWranglerEnv(): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(join(tmpdir(), 'audit-wrangler-'));
  writeFileSync(join(dir, 'wrangler'), FAKE_WRANGLER);
  chmodSync(join(dir, 'wrangler'), 0o755);
  const bucket = join(dir, 'bucket');
  const log = join(dir, 'calls.log');
  writeFileSync(log, '');
  return {
    dir,
    env: {
      ...process.env,
      PATH: `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      FAKE_BUCKET_DIR: bucket,
      FAKE_LOG: log,
    },
  };
}

function runWithEnv(
  args: string[],
  env: NodeJS.ProcessEnv,
  input?: string,
): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, ['scripts/audit.ts', ...args], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      input,
    });
    return { code: 0, out: out as string };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 99, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function wranglerCalls(dir: string): string {
  const log = join(dir, 'calls.log');
  return existsSync(log) ? readFileSync(log, 'utf8') : '';
}

describe('audit CLI', () => {
  it('exits 0 for the valid contract fixture', () => {
    const { code, out } = run('validate', FIXTURE_DIR);
    expect(code).toBe(0);
    expect(out).toContain('valid audit');
  });

  it('exits 1 and prints the JSON path for a broken folder', () => {
    const folder = mkdtempSync(join(tmpdir(), 'audit-cli-'));
    try {
      writeFileSync(join(folder, 'audit.json'), JSON.stringify({ contract: 'univerlab.audit/1' }));
      const { code, out } = run('validate', folder);
      expect(code).toBe(1);
      expect(out).toContain("missing required property 'meta'");
      expect(out).toContain('error(s)');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('exits non-zero with usage when the folder is missing', () => {
    const { code, out } = run('validate', join(tmpdir(), 'audit-no-such-dir'));
    expect(code).toBe(1);
    expect(out).toContain('does not exist');
  });

  it('prints usage, not an unknown-command error, when validate has no folder', () => {
    const { code, out } = run('validate');
    expect(code).toBe(2);
    expect(out).toContain('usage: node scripts/audit.ts validate <folder>');
    expect(out).not.toContain('unknown command');
  });
});

describe('audit CLI push', () => {
  it('validates first, then uploads audit.json and every asset and prints the page URL', () => {
    const { dir, env } = fakeWranglerEnv();
    try {
      const { code, out } = runWithEnv(['push', FIXTURE_DIR, '--slug', 'push-slug'], env);
      expect(code).toBe(0);
      expect(out).toContain('valid audit');
      expect(out).toContain('https://univerlab.org/workbench/audits/push-slug/');
      const calls = wranglerCalls(dir);
      expect(calls).toContain('r2 object put univerlab-audits/push-slug/push-slug/audit.json');
      expect(existsSync(join(dir, 'bucket', 'push-slug', 'push-slug', 'audit.json'))).toBe(true);
      const doc = JSON.parse(readFileSync(join(FIXTURE_DIR, 'audit.json'), 'utf8')) as {
        assets: { path: string }[];
      };
      expect(doc.assets.length).toBeGreaterThan(0);
      for (const asset of doc.assets) {
        expect(calls).toContain(`r2 object put univerlab-audits/push-slug/push-slug/${asset.path}`);
        expect(existsSync(join(dir, 'bucket', 'push-slug', 'push-slug', asset.path))).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints the private page URL when the document visibility is private', () => {
    const { dir, env } = fakeWranglerEnv();
    const folder = mkdtempSync(join(tmpdir(), 'audit-cli-private-'));
    try {
      const doc = JSON.parse(readFileSync(join(FIXTURE_DIR, 'audit.json'), 'utf8')) as Record<string, unknown>;
      doc['visibility'] = 'private';
      doc['access'] = { emails: ['reader@example.com'] };
      cpSync(FIXTURE_DIR, folder, { recursive: true });
      writeFileSync(join(folder, 'audit.json'), JSON.stringify(doc));
      const { code, out } = runWithEnv(['push', folder, '--slug', 'private-slug'], env);
      expect(code).toBe(0);
      expect(out).toContain('https://univerlab.org/audits/private-slug/');
      expect(out).not.toContain('/workbench/audits/');
      expect(existsSync(join(dir, 'bucket', 'private-slug', 'private-slug', 'audit.json'))).toBe(true);
    } finally {
      rmSync(folder, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('adds a second edition under the same system without changing the address', () => {
    const { dir, env } = fakeWranglerEnv();
    try {
      const first = runWithEnv(['push', FIXTURE_DIR, '--system', 'canopy', '--edition', 'canopy-2026-10'], env);
      expect(first.code).toBe(0);
      expect(first.out).toContain('https://univerlab.org/workbench/audits/canopy/');
      const second = runWithEnv(['push', FIXTURE_DIR, '--system', 'canopy', '--edition', 'canopy-2026-11'], env);
      expect(second.code).toBe(0);
      expect(second.out).toContain('https://univerlab.org/workbench/audits/canopy/');
      // Both editions land under the system; the address stays one.
      expect(existsSync(join(dir, 'bucket', 'canopy', 'canopy-2026-10', 'audit.json'))).toBe(true);
      expect(existsSync(join(dir, 'bucket', 'canopy', 'canopy-2026-11', 'audit.json'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('derives the system from a dated slug when no system is given', () => {
    const { dir, env } = fakeWranglerEnv();
    const folder = join(mkdtempSync(join(tmpdir(), 'audit-ed-')), 'canopy-2026-11');
    try {
      cpSync(FIXTURE_DIR, folder, { recursive: true });
      const { code, out } = runWithEnv(['push', folder], env);
      expect(code).toBe(0);
      expect(out).toContain("Pushed audit 'canopy' edition 'canopy-2026-11'");
      expect(out).toContain('https://univerlab.org/workbench/audits/canopy/');
      expect(existsSync(join(dir, 'bucket', 'canopy', 'canopy-2026-11', 'audit.json'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses an invalid folder without calling wrangler', () => {
    const { dir, env } = fakeWranglerEnv();
    const folder = mkdtempSync(join(tmpdir(), 'audit-cli-push-'));
    try {
      writeFileSync(join(folder, 'audit.json'), JSON.stringify({ contract: 'univerlab.audit/1' }));
      const { code, out } = runWithEnv(['push', folder], env);
      expect(code).toBe(1);
      expect(out).toContain("missing required property 'meta'");
      expect(wranglerCalls(dir)).toBe('');
    } finally {
      rmSync(folder, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('audit CLI deposit usage', () => {
  it('prints usage, not an unknown-command error, when deposit has no folder', () => {
    const { code, out } = run('deposit');
    expect(code).toBe(2);
    expect(out).toContain('usage: node scripts/audit.ts validate <folder>');
    expect(out).toContain('deposit <folder>');
    expect(out).not.toContain('unknown command');
  });

  it('rejects an unknown flag without touching the network', () => {
    const { dir, env } = fakeWranglerEnv();
    try {
      const { code, out } = runWithEnv(['deposit', FIXTURE_DIR, '--sandboxx'], env, 'y\n');
      expect(code).toBe(2);
      expect(out).toContain('unknown flag');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses the fixture with open critical findings before asking for a token', () => {
    const { dir, env } = fakeWranglerEnv();
    try {
      const { code, out } = runWithEnv(['deposit', FIXTURE_DIR], env, 'y\n');
      expect(code).toBe(1);
      expect(out).toContain('open');
      expect(wranglerCalls(dir)).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('audit CLI remove', () => {
  it('lists the audit objects, asks for confirmation, then deletes them', () => {
    const { dir, env } = fakeWranglerEnv();
    try {
      const pushed = runWithEnv(['push', FIXTURE_DIR, '--slug', 'gone-slug'], env);
      expect(pushed.code).toBe(0);
      writeFileSync(join(dir, 'calls.log'), '');

      const { code, out } = runWithEnv(['remove', 'gone-slug/gone-slug'], env, 'y\n');
      expect(code).toBe(0);
      expect(out).toContain('gone-slug/gone-slug/audit.json');
      expect(out).toContain('object(s) deleted');
      expect(wranglerCalls(dir)).toContain('r2 object delete univerlab-audits/gone-slug/gone-slug/audit.json');
      expect(existsSync(join(dir, 'bucket', 'gone-slug', 'gone-slug', 'audit.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deletes nothing when the operator does not confirm', () => {
    const { dir, env } = fakeWranglerEnv();
    try {
      expect(runWithEnv(['push', FIXTURE_DIR, '--slug', 'keep-slug'], env).code).toBe(0);
      const { code, out } = runWithEnv(['remove', 'keep-slug/keep-slug'], env, 'n\n');
      expect(code).toBe(1);
      expect(out).toContain('Aborted');
      expect(wranglerCalls(dir)).not.toContain('r2 object delete');
      expect(existsSync(join(dir, 'bucket', 'keep-slug', 'keep-slug', 'audit.json'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails clearly when the slug is not in the bucket', () => {
    const { dir, env } = fakeWranglerEnv();
    try {
      const { code, out } = runWithEnv(['remove', 'no-such-audit/no-such-edition'], env, 'y\n');
      expect(code).toBe(1);
      expect(out).toContain("no audit 'no-such-audit/no-such-edition'");
      expect(wranglerCalls(dir)).not.toContain('r2 object delete');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a bare system with no legacy key: name the edition explicitly', () => {
    const { dir, env } = fakeWranglerEnv();
    try {
      const { code, out } = runWithEnv(['remove', 'some-system'], env, 'y\n');
      expect(code).toBe(1);
      expect(out).toContain('explicit system/edition pair');
      expect(wranglerCalls(dir)).not.toContain('r2 object delete');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removes a legacy pre-edition audit by its bare slug', () => {
    const { dir, env } = fakeWranglerEnv();
    try {
      // A legacy push stored the audit at the bare key; the migration
      // removes it after the edition-layout push is verified.
      const legacy = join(dir, 'bucket', 'legacy-slug');
      cpSync(FIXTURE_DIR, legacy, { recursive: true });
      const { code, out } = runWithEnv(['remove', 'legacy-slug'], env, 'y\n');
      expect(code).toBe(0);
      expect(out).toContain('legacy audit');
      expect(wranglerCalls(dir)).toContain('r2 object delete univerlab-audits/legacy-slug/audit.json');
      expect(existsSync(join(legacy, 'audit.json'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
