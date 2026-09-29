/**
 * GitKit de-copy — the hero must read as GitKit's own pastel surface, not a
 * Supahub product-shot stage. Astro/CSS aren't rendered in Jest here (see
 * ghscaff-decopy), so the contract is asserted on the source as text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SURFACES = readFileSync(resolve(__dirname, '..', 'styles', 'surfaces.css'), 'utf8');
const VIEW = readFileSync(resolve(__dirname, '..', 'views', 'experiments', 'Gitkit.astro'), 'utf8');

/** Body of a single rule, from its selector to the matching close brace. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) return '';
  return css.slice(start, css.indexOf('}', start));
}

describe('GitKit de-copy — pastel identity, no SaaS chrome', () => {
  it('has no gradient orb behind the hero cards', () => {
    expect(SURFACES).not.toMatch(/\.mock[a-b]?::before/);
    expect(SURFACES).not.toMatch(/pastel[^{}]*\.mock[^{}]*\{[^{}]*radial-gradient/);
    expect(VIEW).not.toMatch(/orb/i);
  });

  it('lays the two cards flat — no tilt, no float, no drop shadow', () => {
    expect(VIEW).not.toMatch(/mock-[ab][^{}]*\{[^{}]*transform/);
    expect(VIEW).not.toMatch(/rotate\(|translateY\(/);
    // the card plate carries no drop shadow; the git-rail active-node ring does
    expect(ruleBody(VIEW, '.card {')).not.toMatch(/box-shadow/);
    expect(VIEW).toMatch(/\.git-rail \.active \.node \{ box-shadow/);
    expect(SURFACES).not.toMatch(/mock-float/);
    expect(SURFACES).not.toMatch(/pastel[^{}]*\.mock-[ab][^{}]*\{[^{}]*animation/);
    // the skin used to re-shadow the card on top of the view's
    expect(ruleBody(SURFACES, `:root[data-surface='pastel'] .card {`)).not.toMatch(/box-shadow/);
  });

  it('titles the terminal in mono text — no macOS traffic lights', () => {
    expect(VIEW).not.toMatch(/●/);
    expect(VIEW).not.toMatch(/\.term-bar[^{}]*\{[^{}]*span/);
    expect(VIEW).toMatch(/<div class="term-bar mono">~\/repo/);
  });

  it('drops the hero pill row — the ascii motif already says it', () => {
    expect(VIEW).not.toMatch(/class="badges"/);
    expect(VIEW).not.toMatch(/hero\.badges/);
  });

  it('renders step/hook labels as plain mono text, not chips', () => {
    const tag = ruleBody(SURFACES, `html[data-surface='pastel'] .exp .tag {`);
    expect(tag).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(tag).not.toMatch(/border-radius/);
    expect(tag).not.toMatch(/background/);
    expect(tag).not.toMatch(/\bborder\b/);
    expect(tag).not.toMatch(/padding/);
  });

  it('keeps the GitKit identity: motif, both cards, session text, palette', () => {
    expect(VIEW).toMatch(/class="ascii-motif"/);
    expect(VIEW).toMatch(/class="mock mock-a"/);
    expect(VIEW).toMatch(/class="mock mock-b"/);
    expect(VIEW).toMatch(/<pre class="mono term-body">/);
    expect(VIEW).toMatch(/git commit -m/);
    expect(VIEW).toMatch(/step \{i \+ 1\}/); // step labels stay, only the pill goes
    const tokens = ruleBody(SURFACES, `:root[data-surface='pastel'] {`);
    expect(tokens).toMatch(/--voltage:/);
    expect(tokens).toMatch(/--bg:\s*#ffffff/);
  });
});
