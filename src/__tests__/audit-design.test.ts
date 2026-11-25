/**
 * The audit page as a finished deliverable: the stylesheet draws on the
 * bench tokens (never the raw dark-lab palette) and the severity scale
 * stays legible in both themes.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(__dirname, '../../public/audits/audit.css'), 'utf8');
const BENCH = readFileSync(resolve(__dirname, '../../src/styles/bench-tokens.css'), 'utf8');
const GLOBAL = readFileSync(resolve(__dirname, '../../src/styles/global.css'), 'utf8');

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The declarations inside the first block matching `open` (no nesting). */
function firstBlock(src: string, open: RegExp): string {
  const at = src.search(open);
  if (at < 0) throw new Error(`block not found: ${open}`);
  const body = src.slice(at).match(/\{([^}]*)\}/);
  if (!body) throw new Error(`block has no body: ${open}`);
  return body[1];
}

function parseDecls(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[`--${m[1]}`] = m[2].trim();
  return out;
}

// Token layers, day first then night overrides, in cascade order.
const DAY = {
  ...parseDecls(firstBlock(BENCH, /:root\s*\{/)),
  ...parseDecls(firstBlock(GLOBAL, /:root\s*\{/)),
};
const NIGHT = {
  ...parseDecls(firstBlock(BENCH, /\[data-bench-theme='night'\]\s*\{/)),
  ...parseDecls(firstBlock(GLOBAL, /html\[data-bench-theme='night'\]\s*\{/)),
};

/** Chase `var(--x)` chains through the night/day layers to a palette hex. */
function resolveToken(value: string | undefined, night: boolean, seen: string[] = []): string {
  if (!value) throw new Error('severity scale is missing a --audit-sev-* mapping');
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  if (!ref) {
    const hex = value.match(/#[0-9a-fA-F]{6}/);
    if (!hex) throw new Error(`not a colour: ${value}`);
    return hex[0];
  }
  const name = `--${ref[1]}`;
  if (seen.includes(name)) throw new Error(`token cycle: ${[...seen, name].join(' -> ')}`);
  const next = night ? (NIGHT[name] ?? DAY[name]) : DAY[name];
  if (!next) throw new Error(`unresolved token ${name}`);
  return resolveToken(next, night, [...seen, name]);
}

/** The plate the severity pills sit on: parchment-deep day, slate-deep night. */
function plateHex(night: boolean): string {
  const dayPlate = parseDecls(firstBlock(CSS, /\.audit\s*\{/))['--audit-plate'];
  if (!night) return resolveToken(dayPlate, false);
  const nightPlate =
    parseDecls(firstBlock(CSS, /\[data-bench-theme='night'\]\s*\.audit\s*\{/))['--audit-plate'];
  // The night block only overrides the severity scale; the plate inherits.
  return resolveToken(nightPlate ?? dayPlate, true);
}

describe('audit design tokens', () => {
  it('never names the raw dark-lab palette', () => {
    // --audit-* aliases and --bench-* tokens are fine; bare --bg, --ink
    // and --line would pin one theme. The exact-token match keeps
    // --audit-ink, --bench-line and the like out of the net.
    expect(CSS).not.toMatch(/var\(--(?:bg|bg-raise|ink|ink-dim|line)\)/);
  });

  it('aliases the audit surfaces to the bench roles', () => {
    expect(CSS).toContain('--audit-ink: var(--bench-line)');
    expect(CSS).toContain('--audit-ink-dim: var(--bench-line-soft)');
    expect(CSS).toContain('--audit-rule: var(--bench-rule)');
    expect(CSS).toContain('--audit-plate: var(--bench-ground-alt)');
  });

  it('keys the severity scale to the bench palette, day and night', () => {
    expect(CSS).toContain('--bench-c-garnet');
    expect(CSS).toContain('--bench-c-copper');
    expect(CSS).toContain('--bench-c-sepia');
    expect(CSS).toContain('--bench-c-graphite');
    expect(CSS).toContain('--bench-c-copper-bright');
    expect(CSS).toContain('--bench-c-chalk-dim');
    expect(CSS).toContain("[data-bench-theme='night'] .audit");
    expect(CSS).toContain('prefers-color-scheme');
  });

  it('clears 4.5:1 on the plate of each theme', () => {
    // Resolve what the stylesheet actually uses: --audit-sev-* in the day
    // `.audit` block and the night override, chased through the bench roles
    // (and global.css for shared tokens) down to palette hexes. Deleting the
    // scale or pointing it at a low-contrast token fails here, not silently.
    const day = parseDecls(firstBlock(CSS, /\.audit\s*\{/));
    const night = parseDecls(firstBlock(CSS, /\[data-bench-theme='night'\]\s*\.audit\s*\{/));
    expect(Object.keys(night).length).toBeGreaterThan(0);
    const severities = ['critical', 'high', 'medium', 'low', 'info'];
    for (const sev of severities) {
      const dayHex = resolveToken(day[`--audit-sev-${sev}`], false);
      expect(contrast(dayHex, plateHex(false))).toBeGreaterThanOrEqual(4.5);
      const nightHex = resolveToken(night[`--audit-sev-${sev}`], true);
      expect(contrast(nightHex, plateHex(true))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the diagram caption dark on its light plate', () => {
    // The diagram plate is paper in both themes, so its caption pins ink,
    // never the dim token that would wash out at night.
    const block = firstBlock(CSS, /\.audit-diagram figcaption\s*\{/);
    expect(block).toMatch(/color:\s*#1d1510/);
  });

  it('keeps the shell postcard small above the cover, never beside it', () => {
    // No float anywhere near the cover: the postcard stacks above at a
    // capped width, so the cover title holds the full column and the first
    // screen at 390 px and at 1280 px. Restoring the float fails here.
    expect(CSS).not.toMatch(/\.audit-page-pc\s*\{[^}]*float/);
    const block = firstBlock(CSS, /\.audit-page \.audit-page-pc\s*\{/);
    expect(block).toMatch(/width:\s*min\(/);
    expect(block).not.toMatch(/float/);
  });

  it('caps code transcripts with an expand control and measures prose', () => {
    expect(CSS).toContain('max-height: 22rem');
    expect(CSS).toContain('.audit-code[data-open] pre');
    expect(CSS).toContain('.audit-code-expand');
    expect(CSS).toContain('65ch');
    expect(CSS).toContain('.audit-summary');
    expect(CSS).toContain('.audit-finding-row');
  });
});
