/**
 * The newspaper sheet: below the desktop breakpoint the paper keeps its full
 * broadsheet composition at desktop width inside a viewport the reader pans
 * and zooms. Static asserts pin the hooks, the single Fit control and the
 * forced desktop composition; jsdom asserts drive the pan/zoom behaviour.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { initPaperSheet } from '../lib/paper-sheet';
import { SHEET_HEIGHT_REM, SHEET_WIDTH_REM } from '../lib/paper-sheet-size';

const paper = readFileSync(resolve(__dirname, '..', 'components', 'TodaysPaper.astro'), 'utf8');
const css = paper.slice(paper.indexOf('<style is:global>'), paper.indexOf('</style>'));
const news = readFileSync(resolve(__dirname, '..', 'pages', 'newspaper.astro'), 'utf8');
const newsEs = readFileSync(resolve(__dirname, '..', 'pages', 'es', 'newspaper.astro'), 'utf8');

describe('the sheet hooks wrap the paper', () => {
  it('wraps .paper in a viewport and a fixed-width sheet, with Fit hidden in the control bar', () => {
    expect(paper).toContain('data-paper-viewport');
    expect(paper).toContain('data-paper-sheet');
    expect(paper).toContain('data-paper-bar');
    // Fit moved out of the sheet into the bar, still hidden until activate.
    expect(paper).toMatch(/<button class="paper-fit" data-paper-fit[^>]*hidden[^>]*>\{t\.today\.fit\}<\/button>/);
    expect(paper.indexOf('data-paper-bar')).toBeLessThan(paper.indexOf('data-paper-fit'));
  });

  it('holds the page tabs, the date picker and Fit in a bar outside the sheet', () => {
    // The bar mirrors the masthead controls at touch size, outside the sheet.
    expect(paper).toContain('data-paper-bar');
    expect(paper).toContain('paper-bar-tabs');
    expect(paper).toContain('t.today.controls');
    expect(paper.match(/class="paper-tab[^"]*" data-page/g)).toHaveLength(6);
    expect(paper.match(/class="edition-pick[^"]*"/g)).toHaveLength(2);
    expect(paper).toContain('edition-pick--bar');
    // Only the masthead keeps the Print submit; the bar is tabs plus date.
    expect(paper.match(/iconSvg\(printer/g)).toHaveLength(1);
    expect(paper.match(/type="submit"/g)).toHaveLength(1);
  });

  it('pins the bar below the sheet on narrow screens and turns pages briefly', () => {
    expect(css).toContain('.paper-bar { display: none; }');
    expect(css).toContain('max-width: 63.99rem');
    expect(css).toContain('position: sticky');
    // Every bar control reaches a comfortable touch target.
    expect(css).toContain('2.75rem');
    expect(css).toContain('paper-turn-next');
    expect(css).toContain('paper-turn-prev');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('names the only control Fit / Ajustar, with no zoom-in or zoom-out buttons', () => {
    expect(en.today.fit).toBe('Fit');
    expect(es.today.fit).toBe('Ajustar');
    expect(paper).not.toContain('zoom-in');
    expect(paper).not.toContain('zoom-out');
    expect(paper).not.toContain('data-zoom');
  });

  it('both newspaper pages initialise the sheet beside the lab page bindings', () => {
    for (const page of [news, newsEs]) {
      expect(page).toContain('initPaperSheet');
      expect(page).toContain('initPaperSheet(document);');
    }
  });
});

describe('the sheet keeps the desktop composition', () => {
  it('draws the sheet at the single fixed size with the device gestures routed to it', () => {
    // The sheet size lives in src/lib/paper-sheet-size.ts; the stylesheet
    // only references its vars, so a second width literal breaks this.
    expect(SHEET_WIDTH_REM).toBe(68.5);
    expect(css).toContain('var(--paper-sheet-w)');
    expect(css).not.toContain('68.5rem');
    expect(css).toContain('touch-action');
    expect(css).toMatch(/\.paper-viewport\.sheet \.paper-sheet \{[^}]*width:\s*var\(--paper-sheet-w\)/);
    // Desktop widths below the sheet's 68.5rem (the wrap only reaches it at
    // ~72rem) must shrink the sheet to the container, never overflow it;
    // pan/zoom mode keeps the true fixed width via max-width: none.
    expect(css).toMatch(/\.paper-viewport \.paper-sheet \{[^}]*width:\s*var\(--paper-sheet-w\)[^}]*max-width:\s*100%/);
  });

  it('gives every page the same fixed sheet: one min-height, flex-filled pages', () => {
    // The .paper-sheet div carries both vars; every .paper-page flex-fills
    // the sheet, so switching tabs never changes the sheet's size.
    expect(paper).toContain('--paper-sheet-h:${SHEET_HEIGHT_REM}rem');
    expect(SHEET_HEIGHT_REM).toBe(224);
    expect(css).toContain('min-height: var(--paper-sheet-h)');
    expect(css).toMatch(/\.paper \.paper-page \{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.paper \.paper-page \{[^}]*flex:\s*1 1 auto/);
  });

  it('defines the sheet size in exactly one place', () => {
    const sheetSrc = readFileSync(resolve(__dirname, '..', 'lib', 'paper-sheet.ts'), 'utf8');
    expect(sheetSrc).toContain("from './paper-sheet-size'");
    expect(sheetSrc).not.toMatch(/const SHEET_WIDTH_REM/);
    expect(sheetSrc).not.toMatch(/const SHEET_HEIGHT_REM/);
  });

  it('pins the three-column front with the lead spanning two and the rail beside it', () => {
    expect(css).toMatch(/\.paper-viewport\.sheet \.paper \.front \{[^}]*grid-template-columns:\s*repeat\(3/);
    expect(css).toMatch(/\.paper-viewport\.sheet \.paper \.front \.lead \{[^}]*grid-column:\s*1 \/ span 2/);
    expect(css).toMatch(/\.paper-viewport\.sheet \.paper \.front \.rail \{[^}]*grid-column:\s*3/);
  });

  it('pins the three-column masthead instead of the stacked phone ears', () => {
    expect(css).toMatch(
      /\.paper-viewport\.sheet \.paper \.masthead \{[^}]*grid-template-columns:\s*1fr auto 1fr/,
    );
  });

  it('undoes the phone stack: ruled columns with gutters, never borderless rows', () => {
    expect(css).toMatch(/\.paper-viewport\.sheet \.paper \.col \+ \.col \{[^}]*border-left:\s*1px solid/);
    expect(css).toMatch(/\.paper-viewport\.sheet \.paper \.cols \{[^}]*grid-auto-flow:\s*column/);
  });

  it('sets type at the non-scaling maxima instead of the viewport clamps', () => {
    expect(css).toMatch(/\.paper-viewport\.sheet \.paper \.masthead-name \{[^}]*font-size:\s*86px/);
    expect(css).toMatch(/\.paper-viewport\.sheet \.paper \.lead h2 \{[^}]*font-size:\s*46px/);
    expect(css).toMatch(/\.paper-viewport\.sheet \.paper \.ad \.ad-display \{[^}]*font-size:\s*40px/);
  });
});

describe('the sheet pan/zoom behaviour', () => {
  const SHEET_W = 1096; // 68.5rem at 16px
  const SHEET_H = 2000;
  const VIEW_W = 390;

  function stubMatchMedia(desktop: boolean): void {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width: 64rem') ? desktop : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })) as unknown as typeof window.matchMedia;
  }

  function mount(): { viewport: HTMLElement; sheet: HTMLElement; button: HTMLButtonElement } {
    document.body.innerHTML =
      '<div class="paper-viewport" data-paper-viewport>' +
      '<div class="paper-sheet" data-paper-sheet><div class="paper"></div></div>' +
      '<button class="paper-fit" data-paper-fit type="button" hidden>Fit</button>' +
      '</div>';
    const viewport = document.querySelector('[data-paper-viewport]') as HTMLElement;
    const sheet = document.querySelector('[data-paper-sheet]') as HTMLElement;
    const button = document.querySelector('[data-paper-fit]') as HTMLButtonElement;
    Object.defineProperty(viewport, 'clientWidth', { value: VIEW_W, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(sheet, 'offsetWidth', { value: SHEET_W, configurable: true });
    Object.defineProperty(sheet, 'offsetHeight', { value: SHEET_H, configurable: true });
    return { viewport, sheet, button };
  }

  function pointer(type: string, id: number, x: number, y: number): Event {
    return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      pointerId: id,
      clientX: x,
      clientY: y,
    });
  }

  function scaleOf(transform: string): number {
    return Number(/scale\(([\d.]+)\)/.exec(transform)?.[1]);
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('bails when the hooks are missing', () => {
    stubMatchMedia(false);
    expect(() => initPaperSheet(document)).not.toThrow();
  });

  it('stays a plain responsive page on desktop: no sheet, no Fit button', () => {
    stubMatchMedia(true);
    const { viewport, button } = mount();
    initPaperSheet(document);
    expect(viewport.classList.contains('sheet')).toBe(false);
    expect(button.hidden).toBe(true);
  });

  it('opens fitted to the screen width on a narrow screen', () => {
    stubMatchMedia(false);
    const { viewport, sheet, button } = mount();
    initPaperSheet(document);
    expect(viewport.classList.contains('sheet')).toBe(true);
    expect(button.hidden).toBe(false);
    const fit = VIEW_W / SHEET_W;
    expect(scaleOf(sheet.style.transform)).toBeCloseTo(fit, 4);
  });

  it('ctrl+wheel grows the scale, a drag pans, and Fit returns to fitted width', () => {
    stubMatchMedia(false);
    const { viewport, sheet, button } = mount();
    initPaperSheet(document);
    const fit = VIEW_W / SHEET_W;

    viewport.dispatchEvent(
      Object.assign(new Event('wheel', { bubbles: true, cancelable: true }), {
        ctrlKey: true,
        deltaY: -100,
        clientX: 200,
        clientY: 300,
      }),
    );
    const zoomed = scaleOf(sheet.style.transform);
    expect(zoomed).toBeGreaterThan(fit);

    viewport.dispatchEvent(pointer('pointerdown', 1, 100, 100));
    viewport.dispatchEvent(pointer('pointermove', 1, 50, 80));
    viewport.dispatchEvent(pointer('pointerup', 1, 50, 80));
    expect(sheet.style.transform).not.toContain('translate(0px, 0px)');

    // A real tap starts a new gesture (pointerdown clears the drag's click
    // suppression) before the click lands on the Fit button.
    button.dispatchEvent(pointer('pointerdown', 2, 350, 20));
    button.dispatchEvent(pointer('pointerup', 2, 350, 20));
    button.click();
    expect(sheet.style.transform).toContain('translate(0px, 0px)');
    expect(scaleOf(sheet.style.transform)).toBeCloseTo(fit, 4);
  });

  it('keeps zoom and pan across height-only resizes, refits when the width changes', () => {
    stubMatchMedia(false);
    const { viewport, sheet } = mount();
    initPaperSheet(document);

    viewport.dispatchEvent(
      Object.assign(new Event('wheel', { bubbles: true, cancelable: true }), {
        ctrlKey: true,
        deltaY: -100,
        clientX: 200,
        clientY: 300,
      }),
    );
    const zoomed = sheet.style.transform;
    expect(scaleOf(zoomed)).toBeGreaterThan(VIEW_W / SHEET_W);

    // A height-only resize (mobile URL bar) must not reset the reader's zoom.
    window.dispatchEvent(new Event('resize'));
    expect(sheet.style.transform).toBe(zoomed);

    // A width change (rotation) changes the fitted scale: refit.
    Object.defineProperty(viewport, 'clientWidth', { value: 500, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(scaleOf(sheet.style.transform)).toBeCloseTo(500 / SHEET_W, 4);
  });
});
