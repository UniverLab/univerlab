// The audit CLI is the contract gate agents run: exit 0 for a valid folder,
// exit 1 listing each error with its JSON path for a broken one.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
