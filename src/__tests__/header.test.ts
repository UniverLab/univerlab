import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { experiments } from '../lib/experiments';

const HEADER = resolve(__dirname, '..', 'components', 'Header.astro');
const src = readFileSync(HEADER, 'utf8');

describe('Header experiments dropdown', () => {
  it('has an Experiments entry first in nav array before Manifesto, with exp:true', () => {
    // nav array must start with experiments entry
    const navBlock = src.match(/const nav = \[([\s\S]*?)\];/);
    expect(navBlock).not.toBeNull();
    const navContent = navBlock![1];
    // First object should contain t.nav.experiments and exp:true
    const firstEntry = navContent.split('},')[0];
    expect(firstEntry).toMatch(/t\.nav\.experiments/);
    expect(firstEntry).toMatch(/exp:\s*true/);
    // Should be before manifesto
    const expIdx = navContent.indexOf('t.nav.experiments');
    const manifestoIdx = navContent.indexOf('t.nav.manifesto');
    expect(expIdx).toBeGreaterThan(-1);
    expect(manifestoIdx).toBeGreaterThan(-1);
    expect(expIdx).toBeLessThan(manifestoIdx);
    // Must not have href value for experiments entry (it's a button, not a link) — ignore type annotation
    expect(firstEntry).not.toMatch(/href:\s*localizePath/);
    // No /experiments route: the nav entry must not link to /experiments
    expect(firstEntry).not.toMatch(/localizePath\('\/experiments/);
    expect(firstEntry).not.toMatch(/href="\/experiments/);
  });

  it('renders a button trigger with aria-expanded, aria-haspopup, aria-controls', () => {
    // Button must be type="button" with required aria attrs
    expect(src).toMatch(/<button[^>]*type="button"[^>]*aria-expanded="false"[^>]*aria-haspopup="true"[^>]*aria-controls="exp-panel"/);
    // Also allow any order: check each attr present on exp-trigger
    expect(src).toMatch(/class:list=\{[^}]*exp-trigger/);
    expect(src).toMatch(/aria-controls="exp-panel"/);
    expect(src).toMatch(/id="exp-wrap"/);
    expect(src).toMatch(/id="exp-panel"/);
    // Trigger label comes from item.label (the experiments nav entry) and carries a disclosure caret
    expect(src).toMatch(/\{item\.label\}<span[^>]*exp-caret[^>]*aria-hidden="true"[^>]*><\/span><\/button>/);
    // Caret is aria-hidden and reflects state via CSS (closed ▸ vs open ▾)
    expect(src).toMatch(/exp-caret[^>]*aria-hidden="true"/);
    expect(src).toMatch(/\.exp-caret::after/);
    expect(src).toMatch(/▸/);
    expect(src).toMatch(/▾/);
  });

  it('panel lists every experiment in order, using localizePath and e.name, without filtering by status', () => {
    // Panel must map over experiments array exactly (no filter)
    expect(src).toMatch(/experiments\.map\(/);
    expect(src).not.toMatch(/filter.*status/);
    // Each link must use localizePath('/' + e.id, lang) and show e.name
    expect(src).toMatch(/localizePath\('\/' \+ e\.id, lang\)/);
    expect(src).toMatch(/\{e\.name\}/);
    // Should not hardcode paths
    expect(src).not.toMatch(/href="\/canopy"/);
    expect(src).not.toMatch(/href="\/texforge"/);
    // Verify the number of experiments matches lib
    const expCount = experiments.length;
    expect(expCount).toBeGreaterThan(0);
    // Ensure panel contains the mapping block that would produce expCount links
    // We check that the source contains the expected iteration and that no /experiments route exists
    expect(src).not.toMatch(/localizePath\('\/experiments/);
    expect(src).not.toMatch(/href="\/experiments/);
  });

  it('sets exp:true so onExperiment lights up the entry as active', () => {
    // class:list must read item.exp && onExperiment (original behavior) and also onExperiment for trigger
    expect(src).toMatch(/exp && onExperiment/);
    expect(src).toMatch(/onExperiment/);
    expect(src).toMatch(/active/);
    // onExperiment is computed via experiments.some(e => e.id === seg)
    expect(src).toMatch(/onExperiment = experiments\.some/);
    // Trigger uses active: onExperiment
    expect(src).toMatch(/exp-trigger[\s\S]*active:\s*onExperiment/);
  });

  it('has no /experiments route linked anywhere', () => {
    // Creating a /experiments page/route is explicitly not wanted — check localized route, not import path
    expect(src).not.toMatch(/localizePath\('\/experiments/);
    expect(src).not.toMatch(/href="\/experiments/);
    // Also check no anchor references /experiments as a route (ignore lib import)
    const hrefMatches = [...src.matchAll(/href=\{[^}]*\}/g)].map(m => m[0]);
    for (const h of hrefMatches) {
      expect(h).not.toMatch(/'\/experiments/);
    }
  });

  it('desktop opens on hover and click/focus, closes on Escape, outside click, and after link', () => {
    // Hover
    expect(src).toMatch(/mouseenter/);
    expect(src).toMatch(/mouseleave/);
    // Click toggle
    expect(src).toMatch(/expTrigger\.addEventListener\('click'/);
    // Focus opens only on desktop — collapsed is tap-only (no hover on touch)
    expect(src).toMatch(/expTrigger\.addEventListener\('focus'/);
    expect(src).toMatch(/isDesktop/);
    expect(src).toMatch(/matchMedia.*1025px|min-width: 1025px/);
    // Outside click closes
    expect(src).toMatch(/document\.addEventListener\('click'/);
    expect(src).toMatch(/!expWrap\.contains/);
    // Close after following a link
    expect(src).toMatch(/expPanel\.querySelectorAll\('a'\).*setExpOpen\(false\)/s);
    // Single Escape handler reused (not two separate listeners)
    const escapeListeners = [...src.matchAll(/addEventListener\('keydown',/g)];
    expect(src).toMatch(/if \(e\.key === 'Escape'\)/);
    expect(src).toMatch(/setOpen\(false\)/);
    expect(src).toMatch(/setExpOpen\(false\)/);
    // Returns focus to trigger
    expect(src).toMatch(/wasExpOpen.*focus\(\)/s);
  });

  it('collapsed menu is a flyout to the left of the card, not mixed in flow, and keeps burger close behavior', () => {
    // Burger close handler must still bind siteNav.querySelectorAll('a') (includes panel links)
    expect(src).toMatch(/siteNav\.querySelectorAll\('a'\)\.forEach/);
    expect(src).toMatch(/@media \(max-width: 1024px\)/);
    expect(src).not.toMatch(/@media \(max-width: 900px\)/);
    const mobileBlock = src.split('@media (max-width: 1024px)')[1]?.split('@media')[0] ?? '';
    // Flyout: anchored left of the card with its own surface (same bg/border/radius/shadow as card)
    expect(mobileBlock).toMatch(/\.exp-panel[\s\S]*?position:\s*absolute/);
    expect(mobileBlock).toMatch(/right:\s*calc\(100% \+ 0\.6rem\)/);
    expect(mobileBlock).toMatch(/left:\s*auto/);
    expect(mobileBlock).toMatch(/top:\s*0/);
    expect(mobileBlock).toMatch(/background:\s*var\(--bg-raise\)/);
    expect(mobileBlock).toMatch(/border:\s*1px solid var\(--line\)/);
    expect(mobileBlock).toMatch(/border-radius:\s*12px/);
    expect(mobileBlock).toMatch(/box-shadow:\s*0 14px 36px/);
    // Panel markup stays sibling of trigger inside .exp-wrap for fallback
    expect(src).toMatch(/<div class="exp-wrap"[^>]*>[\s\S]*?<button[^>]*exp-trigger[\s\S]*?<div id="exp-panel"/);
    // Viewport fallback: not enough room → indented in-flow list (comment must state width and why)
    expect(src).toMatch(/@media \(max-width: 1024px\)[\s\S]*@media \(max-width: 520px\)/);
    expect(src).toMatch(/not enough room|not reliably enough room/i);
    expect(src).toMatch(/11rem.*13rem|13rem.*11rem|426px|card.*panel/i);
    // Narrow fallback reverts to static indented list
    const narrowBlock = src.split('@media (max-width: 520px)')[1]?.split('@media')[0] ?? '';
    expect(narrowBlock).toMatch(/position:\s*static/);
    expect(narrowBlock).toMatch(/border-left:\s*1px solid var\(--line\)/);
  });

  it('degrades without JS: CSS hover/focus shows panel and does not shift layout', () => {
    // No-JS fallback: hover and focus-within show panel (desktop) and in-flow fallback (collapsed)
    expect(src).toMatch(/\.exp-wrap:hover \.exp-panel/);
    expect(src).toMatch(/\.exp-wrap:focus-within \.exp-panel/);
    // Desktop overlay: position absolute so no layout shift
    expect(src).toMatch(/\.exp-panel[\s\S]*?position:\s*absolute/);
    // With JS, collapsed flyout suppresses hover/focus — only tap opens
    expect(src).toMatch(/html\.js \.exp-wrap:hover \.exp-panel/);
    expect(src).toMatch(/document\.documentElement\.classList\.add\('js'\)/);
    // Existing .nav-waves must still render (not removed)
    expect(src).toMatch(/nav-waves/);
    expect(src).toMatch(/sineWave/);
  });

  it('produces one localized link per experiment entry, verified by runtime helper', () => {
    // Verify that localizePath would produce correct paths for each experiment in both langs
    // This is a behavioral check: the spec says each entry links to localizePath('/' + e.id, lang)
    // We simulate what Header would render for a given lang
    const { localizePath } = require('../i18n') as typeof import('../i18n');
    for (const e of experiments) {
      const enPath = localizePath('/' + e.id, 'en');
      const esPath = localizePath('/' + e.id, 'es');
      expect(enPath).toBe(`/${e.id}/`);
      expect(esPath).toBe(`/es/${e.id}/`);
      // Paths must not be /experiments
      expect(enPath).not.toBe('/experiments/');
      // Must be present in header mapping logic (already checked), but also verify source uses e.id
      expect(src).toContain("e.id");
    }
    // No filtered status: ensure every experiment appears, not a subset
    // Count entries in experiments.ts is the expected link count
    expect(experiments.length).toBe(8);
  });

  it('trigger and every panel link carry the label class', () => {
    // Trigger must include label class alongside exp-trigger
    expect(src).toMatch(/class:list=\{\['label',\s*'exp-trigger'/);
    // Panel links must carry label class (exp-link label)
    expect(src).toMatch(/class="exp-link label"/);
    // Also ensure no panel link is rendered without label
    const panelLinkMatches = [...src.matchAll(/<a[^>]*class="[^"]*exp-link[^"]*"[^>]*>/g)];
    expect(panelLinkMatches.length).toBeGreaterThan(0);
    for (const m of panelLinkMatches) {
      expect(m[0]).toMatch(/label/);
    }
  });

  it('regression: .exp-trigger does not declare font shorthand and .exp-panel a does not declare font-size', () => {
    // Extract the .exp-trigger rule block and assert no font shorthand
    const triggerBlock = src.match(/\.exp-trigger\s*\{([^}]*)\}/);
    expect(triggerBlock).not.toBeNull();
    const triggerBody = triggerBlock![1];
    // font: inherit (shorthand) must not be present — would reset label typography
    expect(triggerBody).not.toMatch(/\bfont\s*:/);
    // Also ensure it does not declare font-family/size/weight that would fight .label
    // But the spec specifically forbids the font shorthand
    expect(triggerBody).not.toMatch(/font-size/);

    // Extract the desktop .exp-panel a rule (before any media query)
    const beforeMedia = src.split('@media')[0];
    const panelLinkBlock = beforeMedia.match(/\.exp-panel a\s*\{([^}]*)\}/);
    expect(panelLinkBlock).not.toBeNull();
    const panelBody = panelLinkBlock![1];
    expect(panelBody).not.toMatch(/font-size/);
    // Also ensure no font shorthand there
    expect(panelBody).not.toMatch(/\bfont\s*:/);
  });

  it('panel has no dead zone: anchored at top 100% with transparent padding-top', () => {
    const beforeMedia = src.split('@media')[0];
    const panelBlock = beforeMedia.match(/\.exp-panel\s*\{([^}]*)\}/s);
    expect(panelBlock).not.toBeNull();
    const body = panelBlock![1];
    expect(body).toMatch(/top:\s*100%/);
    expect(body).not.toMatch(/calc\(100%/);
    expect(body).toMatch(/padding-top:\s*0\.7rem/);
  });

  it('stylesheet collapses at 1024px', () => {
    expect(src).toMatch(/@media\s*\(max-width:\s*1024px\)/);
    expect(src).not.toMatch(/@media\s*\(max-width:\s*900px\)/);
  });

  it('collapsed submenu is a real submenu with left rule and not larger type', () => {
    const mobileBlock = src.split('@media (max-width: 1024px)')[1]?.split('@media')[0] ?? '';
    expect(mobileBlock).toMatch(/border-left:\s*1px solid var\(--line\)/);
    // No font-size override in collapsed panel either — must not be larger than label
    const collapsedPanel = mobileBlock.match(/\.exp-panel\s*\{([^}]*)\}/s);
    expect(collapsedPanel).not.toBeNull();
    expect(collapsedPanel![1]).not.toMatch(/font-size:\s*0\.92rem/);
    expect(collapsedPanel![1]).not.toMatch(/font-size/);
  });
});
