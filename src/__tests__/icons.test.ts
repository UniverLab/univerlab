/**
 * The site's icon contract: one Lucide vocabulary (src/lib/icons.ts), one
 * server-rendered string (src/lib/icon-svg.ts), and one morphing copy state
 * (src/lib/copy-morph.ts) shared by every copy button on the site.
 *
 * The lib modules are imported directly (pure functions), while the .astro
 * consumers are pinned at source level — Astro components are not renderable
 * in Jest. Every assertion names the behaviour the spec asked for: a
 * recognisable Lucide icon in a fixed box (no layout shift) in both themes,
 * and a copy icon that morphs into a check and back.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { iconSvg, type IconNode } from '../lib/icon-svg';
import * as icons from '../lib/icons';
// morphicons ships ESM the CJS jest runtime cannot require (same reason the
// site only touches it from bundled client scripts): stub the element and
// prove the slot state machine around it.
jest.mock('morphicons/element', () => ({
  defineMorphIcon: jest.fn(),
}));
import { COPY_DONE_MS, setCopyState } from '../lib/copy-morph';

if (!customElements.get('morph-icon')) {
  customElements.define(
    'morph-icon',
    class extends HTMLElement {
      icon: unknown;
      morphTo(): void {}
      set(): void {}
    },
  );
}

const FOOTER = resolve(__dirname, '..', 'components', 'Footer.astro');
const LAYOUT = resolve(__dirname, '..', 'layouts', 'ExperimentLayout.astro');
const DOCS = resolve(__dirname, '..', 'layouts', 'DocsLayout.astro');

describe('icons — the shared Lucide vocabulary', () => {
  it('exports exactly the icons the site uses, each a Lucide IconNode', () => {
    const names = Object.keys(icons).sort();
    expect(names).toEqual(
      ['arrowUpRight', 'check', 'codeXml', 'copy', 'github', 'heart', 'menu', 'xIcon'].sort(),
    );
    for (const node of Object.values(icons) as unknown as IconNode[]) {
      expect(Array.isArray(node)).toBe(true);
      expect(node.length).toBeGreaterThan(0);
      for (const [tag, attrs] of node) {
        expect(typeof tag).toBe('string');
        expect(typeof attrs).toBe('object');
        expect(String(attrs.d ?? attrs.x ?? attrs.cx ?? '')).not.toBe('');
      }
    }
  });

  it('draws nothing outside lucide — no second icon import anywhere', () => {
    expect(readFileSync(resolve(__dirname, '..', 'lib', 'icons.ts'), 'utf8')).toMatch(
      /from 'lucide'/,
    );
    expect(readFileSync(resolve(__dirname, '..', 'lib', 'icons.ts'), 'utf8')).not.toMatch(
      /from '(?!lucide)/,
    );
  });
});

describe('iconSvg — one icon as an inline string', () => {
  const copy = icons.copy as unknown as IconNode;

  it('renders a fixed 16px box with Lucide strokes, hidden from assistive tech', () => {
    const svg = iconSvg(copy);
    expect(svg).toContain('width="16" height="16"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    // One consistent width and cap everywhere — the old hand-drawn copy/check
    // pair mixed 2 and 2.5.
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('stroke-linecap="round" stroke-linejoin="round"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain('role="img"');
    // The real Lucide drawing travels with the page.
    expect(svg).toContain('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>');
    expect(svg).toContain('<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
  });

  it('honours an explicit size and an accessible name', () => {
    const svg = iconSvg(copy, { size: 20, label: 'GitHub' });
    expect(svg).toContain('width="20" height="20"');
    expect(svg).not.toContain('aria-hidden');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title>GitHub</title>');
  });

  it('escapes the label so markup cannot break out of the title', () => {
    const svg = iconSvg(copy, { label: 'a"b<c>&d' });
    expect(svg).toContain('<title>a&quot;b&lt;c&gt;&amp;d</title>');
  });
});

describe('copy-morph — the copy/check morph contract', () => {
  it('keeps the success window the buttons restore on', () => {
    expect(COPY_DONE_MS).toBe(1500);
  });

  it('mounts the morpher on first success and flips the slot state', () => {
    document.body.innerHTML =
      '<button type="button" class="copy"><span class="copy-icon"><svg></svg></span></button>';
    const btn = document.querySelector('.copy')!;
    const host = btn.querySelector('.copy-icon')!;
    setCopyState(btn, true);
    expect(host.getAttribute('data-icon')).toBe('check');
    expect(host.querySelector('morph-icon')).not.toBeNull();
    setCopyState(btn, false);
    expect(host.getAttribute('data-icon')).toBe('copy');
  });

  it('leaves a button without an icon slot alone', () => {
    document.body.innerHTML = '<button type="button" class="copy">Copy</button>';
    const btn = document.querySelector('.copy')!;
    expect(() => setCopyState(btn, true)).not.toThrow();
    expect(btn.querySelector('morph-icon')).toBeNull();
  });
});

describe('copy consumers — every button ships the icon slot and morphs', () => {
  const files = {
    layout: readFileSync(LAYOUT, 'utf8'),
    docs: readFileSync(DOCS, 'utf8'),
    encyclopedia: readFileSync(resolve(__dirname, '..', 'components', 'Encyclopedia.astro'), 'utf8'),
    texforge: readFileSync(
      resolve(__dirname, '..', 'views', 'experiments', 'Texforge.astro'),
      'utf8',
    ),
    feedEn: readFileSync(resolve(__dirname, '..', 'pages', 'feed.astro'), 'utf8'),
    feedEs: readFileSync(resolve(__dirname, '..', 'pages', 'es', 'feed.astro'), 'utf8'),
    auditBlocks: readFileSync(resolve(__dirname, '..', 'lib', 'audit', 'blocks.ts'), 'utf8'),
    auditClient: readFileSync(resolve(__dirname, '..', 'lib', 'audit', 'client.ts'), 'utf8'),
    canopy: readFileSync(
      resolve(__dirname, '..', 'views', 'experiments', 'Canopy.astro'),
      'utf8',
    ),
    missionDateUi: readFileSync(resolve(__dirname, '..', 'lib', 'mission-date-ui.ts'), 'utf8'),
    header: readFileSync(resolve(__dirname, '..', 'components', 'Header.astro'), 'utf8'),
    footer: readFileSync(FOOTER, 'utf8'),
  };

  it('every copy button renders a static Lucide copy icon in a fixed slot', () => {
    for (const src of [
      files.layout,
      files.docs,
      files.encyclopedia,
      files.texforge,
      files.feedEn,
      files.feedEs,
      files.canopy,
    ]) {
      expect(src).toContain('copy-icon');
    }
    // The audit buttons and the /date translator buttons are built by string
    // renderers, not .astro slots — the same icon, the same fixed box.
    expect(files.auditBlocks).toContain('class="copy-icon"');
    expect(files.auditBlocks).toMatch(/iconSvg\(copy, \{ size: 16 \}\)/);
    expect(files.missionDateUi).toContain('class="copy-icon"');
    expect(files.missionDateUi).toMatch(/iconSvg\(copy, \{ size: 16 \}\)/);
  });

  it('no hand-drawn copy or check glyph survives in a button', () => {
    for (const src of [files.layout, files.docs, files.encyclopedia, files.texforge, files.canopy]) {
      expect(src).not.toContain('copy-idle');
      expect(src).not.toContain('copy-done');
      expect(src).not.toContain('⧉');
    }
    expect(files.docs).not.toContain('stroke-width="2.5"');
    expect(files.missionDateUi).not.toContain('⧉');
  });

  it('every success path morphs through setCopyState and restores', () => {
    for (const src of [
      files.layout,
      files.docs,
      files.encyclopedia,
      files.texforge,
      files.feedEn,
      files.feedEs,
      files.auditClient,
      files.canopy,
      files.missionDateUi,
    ]) {
      expect(src).toContain('setCopyState');
      expect(src).toMatch(/setCopyState\(\w+, true\)/);
      expect(src).toMatch(/setCopyState\(\w+, false\)/);
      expect(src).toContain('COPY_DONE_MS');
    }
  });

  it('the footer brands X and Bluesky keep their official marks as fill icons', () => {
    expect(files.footer).toContain('fill="currentColor"');
    expect(files.footer).toMatch(/brandSvg\(X_PATH\)/);
    expect(files.footer).toMatch(/brandSvg\(BLUESKY_PATH\)/);
    // …at the same 20px box as the Lucide shelf, each still named.
    expect(files.footer).toMatch(/const brandSvg = \(path: string, size = 20\)/);
  });

  it('the header burger and the experiment arrows come from the same lib', () => {
    expect(files.header).toMatch(/iconSvg\(menu, \{ size: 20 \}\)/);
    expect(files.header).toMatch(/iconSvg\(xIcon, \{ size: 20 \}\)/);
    expect(files.texforge).toMatch(/iconSvg\(arrowUpRight, \{ size: 12 \}\)/);
  });
});
