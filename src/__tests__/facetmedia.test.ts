/**
 * facetMedia is EXP-009: registry entry, bilingual copy, page, encyclopedia
 * mark, palette command and Open Graph card.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { byId } from '../lib/experiments';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const VIEW = readFileSync(resolve(__dirname, '../views/experiments/FacetMedia.astro'), 'utf8');
const BANNER = readFileSync(resolve(__dirname, '../components/Banner.astro'), 'utf8');
const BANNERS = readFileSync(resolve(__dirname, '../lib/banners.ts'), 'utf8');
const ENC = readFileSync(resolve(__dirname, '../components/Encyclopedia.astro'), 'utf8');
const BASE = readFileSync(resolve(__dirname, '../layouts/BaseLayout.astro'), 'utf8');
const ROUTE = readFileSync(resolve(__dirname, '../pages/facetmedia.astro'), 'utf8');
const ROUTE_ES = readFileSync(resolve(__dirname, '../pages/es/facetmedia.astro'), 'utf8');
const CI = readFileSync(resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8');
// The release and preview deploys build through the shared build-site action.
const DEPLOY = readFileSync(resolve(__dirname, '../../.github/actions/build-site/action.yml'), 'utf8');
const REGISTRY_PIN = JSON.parse(
  readFileSync(resolve(__dirname, '../../scripts/facet-registry.json'), 'utf8'),
) as { repository: string; ref: string };

const enFm = en.experiments.facetmedia;
const esFm = es.experiments.facetmedia;

describe('facetmedia EXP-009', () => {
  it('facetMedia is EXP-009 in beta with the single uv install line', () => {
    const exp = byId('facetmedia');
    expect(exp.number).toBe('EXP-009');
    expect(exp.status).toBe('beta');
    expect(exp.surface).toBe('facet');
    expect(exp.install).toEqual({ unix: 'uv tool install facetmedia' });
  });

  it('both dictionaries carry the same facetmedia keys', () => {
    expect(Object.keys(enFm).sort()).toEqual(Object.keys(esFm).sort());
    for (const dict of [enFm, esFm]) {
      expect(dict.capabilities.columns).toHaveLength(6);
      expect(dict.verbs.items).toHaveLength(6);
      expect(dict.faq.items).toHaveLength(7);
    }
    // Summaries and facet labels live in the registry now, not in the site.
    for (const dict of [enFm, esFm]) {
      expect('summaries' in dict.capabilities).toBe(false);
      expect('facetLabels' in dict.capabilities).toBe(false);
    }
    expect(enFm.capabilities.all).toBe('All');
    expect(esFm.capabilities.all).toBe('Todas');
    expect(enFm.capabilities.copy).toBe('Copy command');
    expect(esFm.capabilities.copy).toBe('Copiar comando');
    expect(enFm.capabilities.copied).toBe('Copied');
    expect(esFm.capabilities.copied).toBe('Copiado');
  });

  it('takes each summary from the registry with its English fallback', () => {
    // Until the registry carries i18n keys, both languages show the English
    // summary — expected, not a defect.
    expect(VIEW).toContain('capabilitySummary(cap, lang)');
    expect(VIEW).not.toContain('e.capabilities.summaries');
  });

  it('takes the hero facet list from the registry, not a hardcoded list', () => {
    // The registry has seven facets today; a hand-kept list in the
    // dictionaries had five and drifted. FR3: labels come from the registry.
    for (const dict of [enFm, esFm]) expect('facets' in dict).toBe(false);
    expect(VIEW).not.toContain('e.facets');
    expect(VIEW).toContain("facets.map((f) => f.label).join(' / ')");
  });

  it('styles the copy buttons in this page palette, not the parchment bench roles', () => {
    // --bench-line is the parchment ground's ink (#1d1510): on the facet
    // surface (#161616) it is a 1.01:1 icon, i.e. invisible. The chip takes
    // the page's own surface tokens instead.
    expect(VIEW).not.toContain('var(--bench-');
    expect(VIEW).toContain('.copy-btn .copy-icon[data-icon=\'check\'] { color: var(--surface-ink); }');
  });

  it('titles and descriptions fit the SEO limits', () => {
    for (const dict of [enFm, esFm]) {
      expect(dict.title.length).toBeGreaterThanOrEqual(30);
      expect(dict.title.length).toBeLessThanOrEqual(90);
      expect(dict.description.length).toBeGreaterThanOrEqual(120);
      expect(dict.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('the page shows the shared hero plate with no dial', () => {
    expect(VIEW).not.toContain('hideMachine');
    expect(VIEW).not.toContain('<Machine');
    expect(VIEW).not.toContain("from '../../components/Machine.astro'");
    expect(VIEW).not.toContain('class="fm-dial"');
    expect(VIEW).not.toContain('data-fm-dial');
    expect(VIEW).not.toContain('class="fm-arch"');
    expect(VIEW).not.toContain('0/{caps.length}');
    expect(VIEW).toContain('id="capacidades"');
    expect(ROUTE).toContain('FacetMedia');
    expect(ROUTE_ES).toContain('FacetMedia');
  });

  it('reads the capability table from the registry and never ships it empty', () => {
    expect(VIEW).toContain('readFacetCatalog');
    expect(VIEW).toContain('groupFacetCapabilities');
    expect(VIEW).toContain('facetLabelsFor');
    expect(VIEW).toContain('g.caps.map((cap, i)');
    expect(VIEW).toContain('caps.length');
    expect(VIEW).not.toContain('dialArcs');
    expect(VIEW).not.toContain('demoCap');
    expect(VIEW).not.toContain('demoText');
    expect(VIEW).toContain('set:html');
    expect(VIEW).toContain('{e.subproject.kicker}');
    expect(VIEW).toContain('{e.subproject.body}');
  });

  it('asks the seven agreed questions in order, in both languages', () => {
    expect(enFm.faq.items.map(([q]) => q)).toEqual([
      'What does facet actually do?',
      'Can I use it yet?',
      'What is a facet?',
      'How does an agent use it?',
      'How do I know the output is right?',
      'Who decides how it looks or sounds?',
      'Do I need a GPU? And who accepts the licences?',
    ]);
    expect(esFm.faq.items.map(([q]) => q)).toEqual([
      '¿Qué hace facet, en concreto?',
      '¿Ya se puede usar?',
      '¿Qué es una faceta?',
      '¿Cómo lo usa un agente?',
      '¿Cómo sé que lo que salió está bien?',
      '¿Quién decide cómo se ve o cómo suena?',
      '¿Necesita GPU? ¿Y quién acepta las licencias?',
    ]);
  });

  it('renders the command names in the answers as inline code', () => {
    const answers = (items: [string, string][]) => items.map(([, a]) => a);
    const en = answers(enFm.faq.items);
    const es = answers(esFm.faq.items);
    expect(en[1]).toContain('<code>uv tool install facetmedia</code>');
    expect(en[3]).toContain('<code>--json</code>');
    expect(en[3]).toContain('<code>facet skill</code>');
    expect(en[4]).toContain('<code>.facet.json</code>');
    expect(en[4]).toContain('<code>facet check</code>');
    expect(en[6]).toContain('<code>facet license accept</code>');
    expect(es[1]).toContain('<code>uv tool install facetmedia</code>');
    expect(es[3]).toContain('<code>--json</code>');
    expect(es[3]).toContain('<code>facet skill</code>');
    expect(es[4]).toContain('<code>.facet.json</code>');
    expect(es[4]).toContain('<code>facet check</code>');
    expect(es[6]).toContain('<code>facet license accept</code>');
  });

  it('opens on an All tab listing every capability, then one tab per facet', () => {
    expect(VIEW).toContain('role="tablist"');
    expect(VIEW).toContain('role="tab"');
    expect(VIEW).toContain('role="tabpanel"');
    expect(VIEW).toContain('aria-selected');
    expect(VIEW).toContain("facet: 'all'");
    expect(VIEW).toContain('e.capabilities.all');
    // All is the FIRST group and carries the whole list; the facet groups follow.
    expect(VIEW).toContain("const groups = [{ facet: 'all', label: e.capabilities.all, caps }, ...facets];");
    expect(VIEW).toContain('fm-tab-${g.facet}');
    expect(VIEW).toContain('fm-panel-${g.facet}');
    expect(VIEW).toContain('g.caps.length');
    // Labels come from the registry now, not from the site dictionaries.
    expect(VIEW).not.toContain('e.capabilities.facetLabels');
    // The first tab is selected by default (j === 0).
    expect(VIEW).toMatch(/aria-selected=\{j === 0 \? 'true' : 'false'\}/);
    // No-JS shows every group: the tabpanel tags carry no hidden attribute.
    expect(VIEW).not.toMatch(/role="tabpanel"[^>]*hidden/);
  });

  it('shows how to try each capability and install each facet, with copy buttons', () => {
    expect(VIEW).toContain('copy-btn');
    expect(VIEW).toContain('setCopyState');
    expect(VIEW).toContain('fm-cmd');
    // The try command carries the capability id and the --run flag.
    expect(VIEW).toContain('facetTryCommand(cap.id)');
    expect(VIEW).toContain('data-cmd={facetTryCommand(cap.id)}');
    // Each facet panel names its install command; the All panel is not a
    // facet, so it must not offer `facet pull all`.
    expect(VIEW).toContain('facetPullCommand(g.facet)');
    expect(VIEW).toContain('data-cmd={facetPullCommand(g.facet)}');
    expect(VIEW).toContain("g.facet !== 'all'");
  });

  it('labels the tabs in both languages', () => {
    expect(enFm.capabilities.all).toBe('All');
    expect(esFm.capabilities.all).toBe('Todas');
    expect(enFm.capabilities.tabsAria).toBe('Capabilities by facet');
    expect(esFm.capabilities.tabsAria).toBe('Capacidades por faceta');
  });

  it('checks out the registry at one pinned ref in CI and on deploy', () => {
    expect(REGISTRY_PIN.repository).toBe('UniverLab/facetmedia-registry');
    expect(REGISTRY_PIN.ref).toBe('feature/v0.1');
    for (const workflow of [CI, DEPLOY]) {
      expect(workflow).toContain('scripts/facet-registry.json');
      expect(workflow).toContain('steps.facet-registry.outputs.repository');
      expect(workflow).toContain('steps.facet-registry.outputs.ref');
      expect(workflow).toContain('path: facetmedia-registry');
      // "At a ref set in one place": the workflows read it from the pin file,
      // they never carry a literal ref of their own.
      expect(workflow).not.toContain('ref: feature/v0.1');
      expect(workflow).not.toContain('ref: main');
    }
  });

  it('only verified values are yellow', () => {
    // Capability rows carry no .ok: the summary is not a verified value.
    // The three .ok spans left are exactly the record JSON values.
    expect(VIEW).not.toContain('<span class="ok">{');
    expect(VIEW.match(/class="ok"/g)).toHaveLength(3);
    // var(--essence) is used only by .ok now that the dial is gone.
    expect(VIEW.match(/var\(--essence\)/g)).toHaveLength(1);
  });

  it('beta entries show under the Active tab', () => {
    expect(ENC).toContain("beta: '‡'");
    expect(ENC).toContain("s === f || (f === 'active' && s === 'beta')");
  });

  it('stacks each capability as one entry on narrow screens, desktop table untouched', () => {
    // Desktop keeps its six-column table.
    expect(VIEW).toContain('grid-template-columns: 3rem 1.4fr 0.8fr 1.6fr 1fr 1.8fr');
    // Everything below must live inside the narrow-screen query: assert
    // against that slice so a desktop rule can never satisfy the test.
    const narrow = VIEW.slice(VIEW.indexOf('@media (max-width: 47.99rem)'));
    expect(narrow).toMatch(/\.fm-index \.fm-head \{\s*display: none;/);
    // On phones each row becomes a stacked entry: number + name, tool +
    // output, full-width summary, try command.
    expect(narrow).toMatch(/\.fm-index \.fm-row \{[^}]*grid-template-areas:/);
    for (const row of ['"no name"', '"tool out"', '"sum sum"', '"try try"']) {
      expect(narrow).toContain(row);
    }
    for (const area of ['grid-area: no;', 'grid-area: name;', 'grid-area: tool;', 'grid-area: out;', 'grid-area: sum;']) {
      expect(narrow).toContain(area);
    }
    expect(narrow).toMatch(/\.fm-index \.fm-try \{[^}]*grid-area: try;[^}]*flex-wrap: wrap;/);
  });

  it('scales the install banner down so the facetmedia art fits a 360px phone', () => {
    // The narrow rule must live inside the <=40rem query with a
    // viewport-relative glyph size, parsed from the CSS, not hardcoded.
    const query = BANNER.slice(BANNER.indexOf('@media (max-width: 40rem)'));
    const vw = Number(query.match(/\.banner \{ font-size: clamp\([\d.]+px, ([\d.]+)vw, [\d.]+px\); \}/)?.[1]);
    expect(vw).toBeGreaterThan(0);
    // Widest facetmedia art line, measured from the real banner source.
    const art = BANNERS.match(/facetmedia: `([\s\S]*?)`/)?.[1].replace(/^\r?\n/, '') ?? '';
    const cols = Math.max(...art.split('\n').map((l) => [...l].length));
    expect(cols).toBeGreaterThan(90);
    // Columns x 0.6023em DejaVu advance must fit the content column (viewport
    // minus the page gutter) minus the install plate padding (1rem a side).
    for (const px of [360, 412]) {
      expect(cols * 0.6023 * (px * (vw / 100))).toBeLessThan(px - 64);
    }
    // The structural guards stay: the banner can never force page scroll.
    expect(BANNER).toContain('max-width: 100%;');
    expect(BANNER).toContain('overflow: hidden;');
  });

  it('wraps the record figure instead of cutting its JSON lines', () => {
    // Scope to .fm-pre rules: overflow-wrap/overflow-x also appear on other
    // selectors, so a global contains() would pass without the fix.
    const pre = VIEW.match(/\.fm-pre \{[^}]*\}/g) ?? [];
    expect(pre.length).toBeGreaterThan(0);
    expect(pre.some((r) => r.includes('white-space: pre-wrap;'))).toBe(true);
    expect(pre.some((r) => r.includes('overflow-wrap: anywhere;') && r.includes('overflow-x: auto;') && r.includes('max-width: 100%;'))).toBe(true);
    // The figure itself flexes instead of holding its content rigid.
    expect(VIEW).toMatch(/\.fm-figure \{[^}]*min-width: 0;/);
  });

  it('keeps the headline and hero copy clear of the language corner on phones', () => {
    const narrow = VIEW.slice(VIEW.indexOf('@media (max-width: 47.99rem)'));
    expect(narrow).toMatch(/\.fm-hero-text \{[^}]*min-width: 0;[^}]*max-width: 100%;/);
    expect(narrow).toContain('font-size: clamp(34px, 11vw, 52px);');
  });

  it('the palette knows facetmedia', () => {
    expect(BASE.match(/'quorum', 'facetmedia'\]/g)).toHaveLength(2);
    expect(BASE).toContain('facetmedia: \'https://github.com/UniverLab/facetmedia\'');
  });
});
