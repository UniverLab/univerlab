/**
 * Audit shells hide the language corner: an audit is a single-language
 * document, so the corner would leave the audit (the private page's corner
 * goes to /audits/, the public one to /audit-shell/, a 404).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('audit shells hide the language corner', () => {
  it('passes langCorner={false} to the layout', () => {
    for (const f of ['src/pages/audits/index.astro', 'src/pages/audit-shell.astro']) {
      expect(`${f}\n${read(f)}`).toContain('langCorner={false}');
    }
  });

  it('gates the corner behind langCorner in Header', () => {
    expect(read('src/components/Header.astro')).toContain('{langCorner && (');
  });

  it('threads langCorner through BaseLayout to Header', () => {
    expect(read('src/layouts/BaseLayout.astro')).toContain('langCorner={langCorner}');
  });
});
