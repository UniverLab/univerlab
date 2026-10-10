/**
 * Mission-date UI (DATE1 §2/§3) — the shared tooltip on every
 * `time[data-mission]` and the `/date` translator overlay.
 *
 * The expected calendar strings are built with the same `Intl` calls the UI
 * uses (the tooltip formats in the reader's own zone, so a literal would be
 * timezone-fragile); what these tests pin is the wiring: tabindex, the one
 * shared tooltip, aria-describedby, Escape dismissal, the MutationObserver
 * that enhances late-rendered dates, and the translator's live rows.
 *
 * The module auto-boots `initMissionDateTooltip()` at import (the BaseLayout
 * path), so the observer path is already live; tests that target the
 * initial-scan or the Spanish closure call `initMissionDateTooltip()` again —
 * each call owns its own tooltip node, hence the visible-tip helper.
 */
import { initMissionDateTooltip, openDateTranslator } from '../lib/mission-date-ui';

const fullEn = new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short' });

function missionTime(datetime: string, text: string): HTMLElement {
  const el = document.createElement('time');
  el.setAttribute('datetime', datetime);
  el.setAttribute('data-mission', '');
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

/** The tooltip currently shown — the one just revealed, whichever closure owns it. */
function visibleTip(): HTMLElement | null {
  for (const t of Array.from(document.querySelectorAll<HTMLElement>('.mission-date-tooltip'))) {
    if (t.style.display !== 'none') return t;
  }
  return null;
}

/** One macrotask turn: enough for the MutationObserver to run. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.documentElement.lang = 'en';
  document.querySelectorAll('.mission-date-tooltip, .date-translator').forEach((n) => n.remove());
});

describe('initMissionDateTooltip', () => {
  it('enhances elements already on the page at boot: focusable, tooltip on hover', async () => {
    const el = missionTime('2026-10-09T14:00:00Z', 'TERRA 2026 · Sol 282 · 14:00 UTC');
    initMissionDateTooltip(); // the synchronous initial scan claims it
    el.dispatchEvent(new MouseEvent('mouseenter'));
    expect(el.getAttribute('tabindex')).toBe('0');
    const t = visibleTip();
    expect(t).not.toBeNull();
    expect(t!.textContent).toBe(fullEn.format(new Date('2026-10-09T14:00:00Z')) + ' (your time)');
    expect(el.getAttribute('aria-describedby')).toBe('mission-date-tip');
  });

  it('shares one tooltip element across dates', async () => {
    const a = missionTime('2026-10-09T14:00:00Z', 'TERRA 2026 · Sol 282 · 14:00 UTC');
    const b = missionTime('2026-04-03', 'Sol 93');
    await tick(); // the auto-booted observer enhances both
    a.dispatchEvent(new MouseEvent('mouseenter'));
    b.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelectorAll('.mission-date-tooltip')).toHaveLength(1);
  });

  it('reveals on focus too, and hides on blur and Escape', async () => {
    const el = missionTime('2026-10-09T14:00:00Z', 'TERRA 2026 · Sol 282 · 14:00 UTC');
    await tick();
    el.dispatchEvent(new FocusEvent('focus'));
    expect(visibleTip()).not.toBeNull();
    expect(el.getAttribute('aria-describedby')).toBe('mission-date-tip');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(visibleTip()).toBeNull();
    expect(el.hasAttribute('aria-describedby')).toBe(false);
    el.dispatchEvent(new FocusEvent('focus'));
    el.dispatchEvent(new FocusEvent('blur'));
    expect(visibleTip()).toBeNull();
  });

  it('omits the time segment for a date-only datetime', async () => {
    const el = missionTime('2026-04-03', 'Sol 93');
    await tick();
    el.dispatchEvent(new MouseEvent('mouseenter'));
    const dateOnlyEn = new Intl.DateTimeFormat('en', { dateStyle: 'full' });
    expect(visibleTip()!.textContent).toBe(dateOnlyEn.format(new Date('2026-04-03T00:00:00')));
    expect(visibleTip()!.textContent).not.toContain('(your time)');
  });

  it('enhances dates rendered after boot (the SSE stream path)', async () => {
    // Nothing in the DOM when the module booted; the entry arrives later.
    await tick();
    const el = missionTime('2026-10-09T14:00:00Z', 'TERRA 2026 · Sol 282 · 14:00 UTC');
    await tick();
    el.dispatchEvent(new MouseEvent('mouseenter'));
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(visibleTip()).not.toBeNull();
  });

  it('localizes the tooltip to the page language (es)', async () => {
    document.documentElement.lang = 'es';
    const el = missionTime('2026-10-09T14:00:00Z', 'TERRA 2026 · Sol 282 · 14:00 UTC');
    // Same synchronous turn as the insert, before any observer runs: this
    // init's scan() claims the element with the Spanish closure.
    initMissionDateTooltip();
    el.dispatchEvent(new MouseEvent('mouseenter'));
    const fullEs = new Intl.DateTimeFormat('es', { dateStyle: 'full', timeStyle: 'short' });
    expect(visibleTip()!.textContent).toBe(fullEs.format(new Date('2026-10-09T14:00:00Z')) + ' (tu hora)');
  });
});

/** A result row's value — the span also holds its copy button, so read the text node. */
const val = (n: Element): string | null => n.firstChild?.textContent ?? null;

describe('openDateTranslator', () => {
  const input = (): HTMLInputElement =>
    document.querySelector<HTMLInputElement>('.date-t-input')!;

  it('closes the palette and live-converts a mission date', () => {
    const close = jest.fn();
    openDateTranslator(close, 'en');
    expect(close).toHaveBeenCalled();
    expect(document.querySelector('.date-translator')).not.toBeNull();
    const inp = input();
    inp.value = 'TERRA 2026 · Sol 282 · 14:00 UTC';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    const labels = [...document.querySelectorAll('.date-t-label')].map((n) => n.textContent);
    expect(labels).toEqual(['Mission', 'ISO', 'Calendar']);
    const vals = [...document.querySelectorAll('.date-t-val')].map(val);
    expect(vals[0]).toBe('TERRA 2026 · Sol 282 · 14:00 UTC');
    expect(vals[1]).toBe('2026-10-09T14:00Z');
    // One copy button per form.
    expect(document.querySelectorAll('.date-t-copy')).toHaveLength(3);
  });

  it('converts the other way, from an ISO date', () => {
    openDateTranslator(jest.fn(), 'en');
    const inp = input();
    inp.value = '2026-10-09';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    const vals = [...document.querySelectorAll('.date-t-val')].map(val);
    // toMissionDate on a date-only input omits the time segment (§1).
    expect(vals[0]).toBe('Sol 282');
    expect(vals[1]).toBe('2026-10-09');
  });

  it('shows a localized error for unparseable input', () => {
    openDateTranslator(jest.fn(), 'en');
    const inp = input();
    inp.value = 'not a date';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('.date-t-error')?.textContent).toBe(
      'Not a mission date (TERRA/Sol) or ISO date.',
    );
  });

  it('is bilingual: Spanish labels, copy buttons and errors', () => {
    openDateTranslator(jest.fn(), 'es');
    const inp = input();
    expect(inp.getAttribute('placeholder')).toContain('o 2026-10-09');
    inp.value = 'nada';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelector('.date-t-error')?.textContent).toBe(
      'No es una fecha de misión (TERRA/Sol) ni una fecha ISO.',
    );
    inp.value = 'TERRA 2026 · Sol 282 · 14:00 UTC';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    const labels = [...document.querySelectorAll('.date-t-label')].map((n) => n.textContent);
    expect(labels).toEqual(['Misión', 'ISO', 'Calendario']);
    expect(document.querySelector('.date-t-copy')?.textContent).toBe('Copiar');
  });

  it('dismisses with Escape and cleans up its listener', () => {
    openDateTranslator(jest.fn(), 'en');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.date-translator')).toBeNull();
    // A later Escape must not throw (the listener removed itself).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
});
