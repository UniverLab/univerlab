/**
 * The TeXForge page's registry table copies the command a visitor actually
 * runs: one `copy-btn` per template row, `data-cmd` =
 * `texforge new my-doc -t <name>`.
 *
 * Astro views are not renderable in Jest, so the contract is read over the
 * built HTML (CI builds before it tests, so dist/ is present) — the same
 * pattern as manifesto-gutter.test.ts. The button lives inside the name cell,
 * so the table keeps its three columns and still fits at phone width.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { readTemplates } from '../lib/catalogs';

const ROOT = resolve(__dirname, '..', '..');
const DIST = join(ROOT, 'dist');
const VIEW = resolve(__dirname, '..', 'views', 'experiments', 'Texforge.astro');

const names = readTemplates().map((t) => t.name);
const expected = names.map((n) => `texforge new my-doc -t ${n}`);

const PAGES = [
  { file: 'texforge/index.html', dict: en },
  { file: 'es/texforge/index.html', dict: es },
] as const;

function pageHtml(file: string): string {
  const path = join(DIST, file);
  if (!existsSync(path)) {
    throw new Error(`${file} not found in dist/ — run \`npm run build\` before \`npm test\`.`);
  }
  return readFileSync(path, 'utf8');
}

function templateRows(html: string): string[] {
  return (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []).filter((r) => r.includes('<td class="name"'));
}

describe('TeXForge template rows copy the start command', () => {
  it('should carry the copy keys in both dictionaries', () => {
    for (const dict of [en, es]) {
      const t = dict.experiments.texforge.templates;
      expect(t.copy).toBeTruthy();
      expect(t.copied).toBeTruthy();
      expect(t.copyLabel).toContain('{name}');
    }
    expect(en.experiments.texforge.templates.copy).toBe('Copy');
    expect(es.experiments.texforge.templates.copy).toBe('Copiar');
    expect(en.experiments.texforge.templates.copied).toBe('Copied');
    expect(es.experiments.texforge.templates.copied).toBe('Copiado');
    // The line under the table now says every row copies the command.
    expect(en.experiments.texforge.templates.use).toBe(
      'Every row copies the command; my-doc is your project name:',
    );
    expect(es.experiments.texforge.templates.use).toBe(
      'Cada fila copia el comando; my-doc es el nombre de tu proyecto:',
    );
  });

  // Sibling repo absent at build time: no table, so no buttons — as before.
  if (names.length === 0) {
    it('should render no copy button when no template is registered', () => {
      for (const { file } of PAGES) {
        expect(pageHtml(file)).not.toContain('copy-btn');
      }
    });
    return;
  }

  it.each(PAGES)('should give every row of $file a button with its command', ({ file, dict }) => {
    const rows = templateRows(pageHtml(file));
    expect(rows).toHaveLength(names.length);

    rows.forEach((row, i) => {
      const name = names[i];
      const btn = row.match(/<button[^>]*copy-btn[^>]*>([^<]*)</);
      expect(btn).not.toBeNull();

      const cmd = row.match(/data-cmd="([^"]*)"/)?.[1];
      const label = row.match(/aria-label="([^"]*)"/)?.[1];
      const copy = row.match(/data-copy="([^"]*)"/)?.[1];
      const copied = row.match(/data-copied="([^"]*)"/)?.[1];

      expect(cmd).toBe(expected[i]);
      expect(cmd).toBe(`texforge new my-doc -t ${name}`);
      expect(label).toBe(dict.experiments.texforge.templates.copyLabel.replace('{name}', name));
      expect(copy).toBe(dict.experiments.texforge.templates.copy);
      expect(copied).toBe(dict.experiments.texforge.templates.copied);
      expect(btn![1]).toBe(dict.experiments.texforge.templates.copy);
    });
  });

  it('should keep three columns and put the button in the name cell, not a fourth one', () => {
    for (const { file } of PAGES) {
      const html = pageHtml(file);
      const head = html.match(/<thead[^>]*>[\s\S]*?<\/thead>/)?.[0] ?? '';
      expect((head.match(/<th\b/g) ?? []).length).toBe(3);
      for (const row of templateRows(html)) {
        const cells = row.match(/<td\b[^>]*>/g) ?? [];
        expect(cells).toHaveLength(3);
        expect(row.indexOf('copy-btn')).toBeGreaterThan(row.indexOf('class="name"'));
      }
    }
  });

  it('should copy on click, swap the label for 1.5s, and leave the button alone on failure', () => {
    const src = readFileSync(VIEW, 'utf8');
    expect(src).toContain('navigator.clipboard.writeText');
    expect(src).toMatch(/data-cmd=\{`texforge new my-doc -t \$\{tpl\.name\}`\}/);
    expect(src).toContain('}, 1500)');
    expect(src).toMatch(/catch \{ return; \}/);
    expect(src).toContain("querySelectorAll('.catalog .copy-btn')");
  });
});
