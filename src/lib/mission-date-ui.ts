/**
 * Mission-date UI helpers: the hover/focus tooltip for every <time[data-mission]>
 * and the /date command-palette translator. Loaded once from BaseLayout.
 */
import { translateMissionDate } from './mission-time';

/** One shared tooltip element for every time[data-mission] on the page. */
export function initMissionDateTooltip(): void {
  var lang = document.documentElement.lang === 'es' ? 'es' : 'en';
  var tooltip: HTMLDivElement | null = null;
  var activeEl: HTMLElement | null = null;

  var tipId = 'mission-date-tip';
  function ensureTooltip(): HTMLDivElement {
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = tipId;
    tooltip.className = 'mission-date-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function calendarDate(el: HTMLElement): string | null {
    var dt = el.getAttribute('datetime') || '';
    if (!dt) return null;
    var d = new Date(dt + (dt.length > 10 ? '' : 'T00:00:00'));
    if (isNaN(d.getTime())) return null;
    var withTime = dt.length > 10;
    var opts: Intl.DateTimeFormatOptions = { dateStyle: 'full' };
    if (withTime) opts.timeStyle = 'short';
    var fmt = new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', opts);
    var cal = fmt.format(d);
    return withTime ? cal + (lang === 'es' ? ' (tu hora)' : ' (your time)') : cal;
  }

  function show(el: HTMLElement): void {
    var text = calendarDate(el);
    if (!text) return;
    var tip = ensureTooltip();
    tip.textContent = text;
    tip.style.display = 'block';
    var rect = el.getBoundingClientRect();
    var tipRect = tip.getBoundingClientRect();
    var left = rect.left + (rect.width - tipRect.width) / 2;
    tip.style.left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8)) + 'px';
    tip.style.top = (rect.top - tipRect.height - 8 + window.scrollY) + 'px';
    el.setAttribute('aria-describedby', tipId);
    activeEl = el;
  }

  function hide(): void {
    if (activeEl) activeEl.removeAttribute('aria-describedby');
    if (tooltip) tooltip.style.display = 'none';
    activeEl = null;
  }

  function enhance(el: HTMLElement): void {
    if (el.getAttribute('tabindex') === null) el.setAttribute('tabindex', '0');
    el.addEventListener('mouseenter', function () { show(el); });
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus', function () { show(el); });
    el.addEventListener('blur', hide);
  }

  function scan(): void {
    document.querySelectorAll<HTMLElement>('time[data-mission]').forEach(function (el) {
      if (!el.dataset.mdtEnhanced) {
        el.dataset.mdtEnhanced = '1';
        enhance(el);
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && activeEl) hide();
  });

  scan();
  var observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
}

/** /date command: live mission-date ↔ calendar translator overlay. */
export function openDateTranslator(closePalette: () => void, lang: string): void {
  closePalette();
  var existing = document.querySelector('.date-translator');
  if (existing) { existing.remove(); return; }
  var es = lang === 'es';
  var overlay = document.createElement('div');
  overlay.className = 'date-translator';
  overlay.innerHTML =
    '<div class="date-translator-inner">' +
      '<div class="date-input-row">' +
        '<span class="cmd-prefix">/</span>' +
        '<input class="cmd-input date-t-input" type="text" spellcheck="false" autocomplete="off" placeholder="' +
          (es ? 'TERRA 2026 \u00b7 Sol 282 \u2026 o 2026-10-09' : 'TERRA 2026 \u00b7 Sol 282 \u2026 or 2026-10-09') + '" />' +
        '<button class="date-t-close" type="button" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="date-t-results"></div>' +
    '</div>';
  document.body.appendChild(overlay);
  var inp = overlay.querySelector<HTMLInputElement>('.date-t-input');
  var results = overlay.querySelector<HTMLDivElement>('.date-t-results');
  if (!inp || !results) return;

  function copyBtn(text: string): HTMLButtonElement {
    var b = document.createElement('button');
    b.className = 'date-t-copy';
    b.type = 'button';
    b.textContent = es ? 'Copiar' : 'Copy';
    b.addEventListener('click', function () {
      navigator.clipboard.writeText(text).then(function () {
        b.textContent = es ? 'Copiado' : 'Copied';
        setTimeout(function () { b.textContent = es ? 'Copiar' : 'Copy'; }, 1200);
      });
    });
    return b;
  }
  function render(value: string): void {
    results.innerHTML = '';
    if (!value.trim()) return;
    var t = translateMissionDate(value, es ? 'es' : 'en');
    if (t.error) {
      results.innerHTML = '<div class="date-t-error">' + t.error + '</div>';
      return;
    }
    results.innerHTML =
      '<div class="date-t-row"><span class="date-t-label">' + (es ? 'Misión' : 'Mission') + '</span><span class="date-t-val">' + t.mission + '</span></div>' +
      '<div class="date-t-row"><span class="date-t-label">ISO</span><span class="date-t-val">' + t.iso + '</span></div>' +
      '<div class="date-t-row"><span class="date-t-label">' + (es ? 'Calendario' : 'Calendar') + '</span><span class="date-t-val">' + t.calendar + '</span></div>';
    results.querySelectorAll('.date-t-val').forEach(function (el) { el.appendChild(copyBtn(el.textContent)); });
  }
  inp.addEventListener('input', function () { render(inp.value); });
  overlay.querySelector('.date-t-close')?.addEventListener('click', function () { overlay.remove(); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
  });
  setTimeout(function () { inp.focus(); }, 50);
}

// Auto-boot the tooltip on every page.
if (typeof document !== 'undefined') initMissionDateTooltip();
