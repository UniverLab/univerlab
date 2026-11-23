/**
 * Booking form client for the Workbench booking section (`#first-call`).
 *
 * The page ships with the form hidden and a visible contact fallback, so
 * visitors without JavaScript (or when the service is down) never see a
 * broken form. This module reads the service address, the language and the
 * copy from the DOM (`data-*` attributes plus the `#book-i18n` JSON island),
 * lists the free slots grouped by day in the visitor's time zone, validates
 * the fields before anything is sent, and posts the booking with a
 * Cloudflare Turnstile token. Nothing in here is framework-specific: every
 * network and pure-logic unit is exported for the jest suite.
 */

export type ServiceReason =
  | 'slot-taken'
  | 'limit'
  | 'verification'
  | 'unavailable'
  | 'invalid';

export type ReasonKey =
  | 'slotTaken'
  | 'limit'
  | 'verification'
  | 'unavailable'
  | 'invalid';

export interface BookErrors {
  slotTaken: string;
  limit: string;
  verification: string;
  unavailable: string;
  invalid: string;
}

export interface BookSuccess {
  title: string;
  when: string;
  meet: string;
  invite: string;
}

export interface BookFormCopy {
  nameError: string;
  emailError: string;
  noteError: string;
  slotError: string;
  submit: string;
  submitting: string;
}

export interface BookCopy {
  loading: string;
  empty: string;
  tzLine: string;
  colombiaSuffix: string;
  pickDay: string;
  prevMonth: string;
  nextMonth: string;
  dayFull: string;
  noTimes: string;
  chosenDay: string;
  form: BookFormCopy;
  errors: BookErrors;
  success: BookSuccess;
}

export type Field = 'name' | 'email' | 'note' | 'slot';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BOGOTA_TZ = 'America/Bogota';
const TURNSTILE_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileWidget {
  render(el: HTMLElement, opts: { sitekey: string }): string;
  reset(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
  }
}

/** Map a service refusal reason to the copy key that explains it. Unknown
 *  reasons and network failures read as the service being unavailable. */
export function reasonKey(reason: string): ReasonKey {
  if (reason === 'slot-taken') return 'slotTaken';
  if (reason === 'limit') return 'limit';
  if (reason === 'verification') return 'verification';
  if (reason === 'invalid') return 'invalid';
  return 'unavailable';
}

export function reasonMessage(reason: string, errors: BookErrors): string {
  return errors[reasonKey(reason)];
}

/** Field rules mirror the service (`parseBooking` in the booking worker):
 *  name on one line, well-formed email, short note, a slot chosen. Returns
 *  the invalid fields, so the caller can point at each one. */
export function validateBooking(input: {
  name: string;
  email: string;
  note: string;
  slot: string;
}): Field[] {
  const bad: Field[] = [];
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80 || /[\r\n]/.test(name)) {
    bad.push('name');
  }
  const email = input.email.trim();
  if (email.length > 254 || !EMAIL_RE.test(email)) bad.push('email');
  if (input.note.trim().length > 500) bad.push('note');
  if (!input.slot) bad.push('slot');
  return bad;
}

export interface SlotOption {
  iso: string;
  localLabel: string;
  bogotaLabel: string | null;
}

export interface DayGroup {
  dayKey: string;
  dayLabel: string;
  options: SlotOption[];
}

function dayKeyOf(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Group UTC slot starts by day in the visitor's time zone. Each option
 *  carries its local time and, when the visitor is outside Colombia, the
 *  same start in Colombia time. Invalid starts are dropped. */
export function groupSlotsByDay(
  slots: string[],
  timeZone: string,
  locale: string,
): DayGroup[] {
  const tz = timeZone || 'UTC';
  const differs = tz !== BOGOTA_TZ;
  const dayFmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  });
  const bogotaFmt = new Intl.DateTimeFormat(locale, {
    timeZone: BOGOTA_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
  const groups = new Map<string, DayGroup>();
  for (const iso of slots) {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) continue;
    const key = dayKeyOf(date, tz);
    let group = groups.get(key);
    if (!group) {
      group = { dayKey: key, dayLabel: dayFmt.format(date), options: [] };
      groups.set(key, group);
    }
    group.options.push({
      iso,
      localLabel: timeFmt.format(date),
      bogotaLabel: differs ? bogotaFmt.format(date) : null,
    });
  }
  return [...groups.values()].sort((a, b) =>
    a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0,
  );
}

export interface CalCell {
  /** Bogota calendar day (YYYY-MM-DD). */
  key: string;
  day: number;
  inMonth: boolean;
  hasRoom: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function calKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * The weeks of a month calendar, Monday to Sunday. Leading and trailing
 * cells belong to the neighbouring months (`inMonth: false`) and never
 * open. A day opens only when the room map says it still has room.
 * `month` is 1-based.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  days: DaysMap,
): CalCell[][] {
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const inMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevLen = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const cells: CalCell[] = [];
  for (let i = leading - 1; i >= 0; i--) {
    const day = prevLen - i;
    cells.push({ key: calKey(prev.year, prev.month, day), day, inMonth: false, hasRoom: false });
  }
  for (let day = 1; day <= inMonth; day++) {
    const key = calKey(year, month, day);
    cells.push({ key, day, inMonth: true, hasRoom: days[key]?.hasRoom === true });
  }
  let fill = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ key: calKey(next.year, next.month, fill), day: fill, inMonth: false, hasRoom: false });
    fill += 1;
  }
  const weeks: CalCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Shift a 1-based month by `delta` months. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const at = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1 };
}

/** The navigable range of the calendar, from the room map's own months. */
export function monthBounds(days: DaysMap): { min: string; max: string } | null {
  const months = Object.keys(days)
    .filter((k) => DAY_KEY_RE.test(k))
    .map((k) => k.slice(0, 7))
    .sort();
  if (months.length === 0) return null;
  return { min: months[0], max: months[months.length - 1] };
}

/**
 * Room map derived from the slot starts themselves, for owners that predate
 * the room map: every Bogota day holding a start still has room. Used only
 * when the service sends no `days`.
 */
export function daysFromSlots(slots: string[]): DaysMap {
  const keyFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const out: DaysMap = {};
  for (const iso of slots) {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) continue;
    out[keyFmt.format(date)] = { hasRoom: true };
  }
  return out;
}

/**
 * The free start times of one Bogota day (`dayKey`), formatted like
 * `groupSlotsByDay` options so the day view reuses the slot radios. Invalid
 * starts are dropped and the options run earliest first.
 */
export function optionsForDay(
  slots: string[],
  dayKey: string,
  timeZone: string,
  locale: string,
): SlotOption[] {
  const tz = timeZone || 'UTC';
  const differs = tz !== BOGOTA_TZ;
  const keyFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  });
  const bogotaFmt = new Intl.DateTimeFormat(locale, {
    timeZone: BOGOTA_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
  const out: SlotOption[] = [];
  for (const iso of slots) {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) continue;
    if (keyFmt.format(date) !== dayKey) continue;
    out.push({
      iso,
      localLabel: timeFmt.format(date),
      bogotaLabel: differs ? bogotaFmt.format(date) : null,
    });
  }
  return out.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
}

/** The booked start rendered in the visitor's time zone, with Colombia time
 *  appended when it differs. */
export function formatBookedWhen(
  iso: string,
  locale: string,
  timeZone: string,
  colombiaSuffix: string,
): string {
  const tz = timeZone || 'UTC';
  const date = new Date(iso);
  const local = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
  if (tz === BOGOTA_TZ) return local;
  const bogota = new Intl.DateTimeFormat(locale, {
    timeZone: BOGOTA_TZ,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
  return `${local} · ${colombiaSuffix.replace('{time}', bogota)}`;
}

export type SlotsResult =
  | { ok: true; slots: string[]; days?: DaysMap }
  | { ok: false; reason: ServiceReason | 'network' };

export interface DayAvailability {
  hasRoom: boolean;
}

export type DaysMap = Record<string, DayAvailability>;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Read the per-day room map; anything malformed reads as absent so the
 *  caller falls back to the slots themselves. */
function parseDays(value: unknown): DaysMap | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const out: DaysMap = {};
  for (const [key, day] of Object.entries(value as Record<string, unknown>)) {
    if (!DAY_KEY_RE.test(key)) continue;
    if (!day || typeof day !== 'object' || Array.isArray(day)) continue;
    out[key] = { hasRoom: (day as { hasRoom?: unknown }).hasRoom === true };
  }
  return out;
}

export async function fetchSlots(
  api: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<SlotsResult> {
  try {
    const res = await fetchFn(`${api}/slots`);
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    const data = (await res.json()) as { ok?: unknown; slots?: unknown; days?: unknown };
    if (data.ok !== true || !Array.isArray(data.slots)) {
      return { ok: false, reason: 'unavailable' };
    }
    const days = parseDays(data.days);
    return {
      ok: true,
      slots: data.slots.filter((s): s is string => typeof s === 'string'),
      ...(days === undefined ? null : { days }),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export interface Booking {
  name: string;
  email: string;
  lang: 'en' | 'es';
  note: string;
  slot: string;
  turnstileToken: string;
}

export type BookResult =
  | { ok: true; slot: string; meet: string }
  | { ok: false; reason: ServiceReason | 'network' };

const KNOWN_REASONS: ServiceReason[] = [
  'slot-taken',
  'limit',
  'verification',
  'unavailable',
  'invalid',
];

export async function postBooking(
  api: string,
  booking: Booking,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<BookResult> {
  try {
    const res = await fetchFn(`${api}/book`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(booking),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: unknown;
      slot?: unknown;
      meet?: unknown;
      reason?: unknown;
    } | null;
    if (!res.ok || !data || data.ok !== true) {
      const reason =
        data && typeof data.reason === 'string' ? data.reason : 'unavailable';
      return {
        ok: false,
        reason: (KNOWN_REASONS as string[]).includes(reason)
          ? (reason as ServiceReason)
          : 'unavailable',
      };
    }
    if (typeof data.slot !== 'string' || typeof data.meet !== 'string') {
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true, slot: data.slot, meet: data.meet };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

function readCopy(root: ParentNode): BookCopy | null {
  const island = root.querySelector('#book-i18n');
  if (!island || !island.textContent) return null;
  try {
    return JSON.parse(island.textContent) as BookCopy;
  } catch {
    return null;
  }
}

function ensureTurnstile(form: HTMLFormElement, sitekey: string): void {
  const doc = form.ownerDocument;
  const host = form.querySelector('.cf-turnstile') as HTMLElement | null;
  if (!host || !sitekey) return;
  const win = doc.defaultView as Window | null;
  if (!win) return;
  if (win.turnstile) {
    renderTurnstile(host, win.turnstile, sitekey);
    return;
  }
  if (doc.getElementById('cf-turnstile-api')) return;
  const script = doc.createElement('script');
  script.id = 'cf-turnstile-api';
  script.src = TURNSTILE_SRC;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    const api = (doc.defaultView as Window | null)?.turnstile;
    if (api) renderTurnstile(host, api, sitekey);
  };
  doc.head.appendChild(script);
}

function renderTurnstile(
  host: HTMLElement,
  api: TurnstileWidget,
  sitekey: string,
): void {
  if (host.dataset.rendered) return;
  host.dataset.rendered = '1';
  host.dataset.widgetId = api.render(host, { sitekey });
}

function resetTurnstile(form: HTMLFormElement): void {
  const host = form.querySelector('.cf-turnstile') as HTMLElement | null;
  const api = form.ownerDocument.defaultView?.turnstile;
  if (!api) return;
  api.reset(host?.dataset.widgetId);
}

function tokenOf(form: HTMLFormElement): string {
  const input = form.querySelector(
    'input[name="cf-turnstile-response"]',
  ) as HTMLInputElement | null;
  return input?.value ?? '';
}

const FIELD_IDS: Record<Field, { input: string; error: string }> = {
  name: { input: '#book-name', error: '#book-name-err' },
  email: { input: '#book-email', error: '#book-email-err' },
  note: { input: '#book-note', error: '#book-note-err' },
  slot: { input: '#book-day-times', error: '#book-slot-err' },
};

/** Wire the booking form inside `root` (the document). Reads config and
 *  copy from the DOM, shows the month calendar of days with room and the
 *  picked day's free times, and books the chosen one. */
export function bindBookForm(root: ParentNode): void {
  const form = root.querySelector('#book-form') as HTMLFormElement | null;
  const status = root.querySelector('#book-status') as HTMLElement | null;
  const cal = root.querySelector('#book-cal') as HTMLElement | null;
  const dayTimes = root.querySelector('#book-day-times') as HTMLElement | null;
  const success = root.querySelector('#book-success') as HTMLElement | null;
  if (!form || !status || !cal || !dayTimes) return;
  const copy = readCopy(root);
  if (!copy) return;
  const api = form.dataset.api ?? '';
  const lang = form.dataset.lang === 'es' ? 'es' : 'en';
  const locale = lang === 'es' ? 'es' : 'en';
  const visitorTz =
    globalThis.Intl?.DateTimeFormat()?.resolvedOptions()?.timeZone ?? 'UTC';
  if (!api) {
    status.textContent = copy.errors.unavailable;
    return;
  }

  const say = (message: string): void => {
    status.textContent = message;
  };

  const showFieldErrors = (
    bad: Field[],
    messages: Record<Field, string>,
  ): void => {
    let firstBad: HTMLElement | null = null;
    for (const field of Object.keys(FIELD_IDS) as Field[]) {
      const ids = FIELD_IDS[field];
      const input = root.querySelector(ids.input) as HTMLElement | null;
      const err = root.querySelector(ids.error) as HTMLElement | null;
      const isBad = bad.includes(field);
      if (err) {
        err.textContent = isBad ? messages[field] : '';
        err.hidden = !isBad;
      }
      if (input) input.setAttribute('aria-invalid', isBad ? 'true' : 'false');
      if (isBad && field !== 'slot' && input instanceof HTMLElement && !firstBad) {
        firstBad = input;
      }
    }
    if (firstBad) {
      firstBad.focus();
    } else if (bad.includes('slot')) {
      const radio = dayTimes.querySelector('input');
      if (radio instanceof HTMLElement) radio.focus();
      else cal.querySelector<HTMLButtonElement>('.book-cal-day:not([aria-disabled="true"])')?.focus();
    }
  };

  const clearFieldErrors = (): void => {
    for (const field of Object.keys(FIELD_IDS) as Field[]) {
      const ids = FIELD_IDS[field];
      const input = root.querySelector(ids.input) as HTMLElement | null;
      const err = root.querySelector(ids.error) as HTMLElement | null;
      if (err) {
        err.textContent = '';
        err.hidden = true;
      }
      if (input) input.setAttribute('aria-invalid', 'false');
    }
  };

  /** Calendar state: every free start, the room map, the shown month and
   *  the picked Bogota day. */
  let allSlots: string[] = [];
  let daysMap: DaysMap = {};
  let viewYear = 0;
  let viewMonth = 0;
  let selected: string | null = null;

  const monthName = (year: number, month: number): string =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      month: 'long',
      year: 'numeric',
    }).format(new Date(Date.UTC(year, month - 1, 1)));

  const dayName = (key: string): string =>
    new Intl.DateTimeFormat(locale, {
      timeZone: BOGOTA_TZ,
      dateStyle: 'full',
    }).format(new Date(key + 'T12:00:00Z'));

  const weekHeads = (): string[] => {
    const fmt = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' });
    // 2026-11-09 is a Monday: the header runs Monday to Sunday.
    return [0, 1, 2, 3, 4, 5, 6].map((i) =>
      fmt.format(new Date(Date.UTC(2026, 10, 9 + i))),
    );
  };

  const boundsOf = (): { min: string; max: string } | null => monthBounds(daysMap);

  /** Paint the picked day's free times as slot radios; an empty day names
   *  it instead of leaving a bare choice. */
  const renderDayTimes = (dayKey: string): void => {
    const doc = form.ownerDocument;
    const options = optionsForDay(allSlots, dayKey, visitorTz, locale);
    dayTimes.textContent = '';
    const head = doc.createElement('p');
    head.className = 'book-day-head';
    head.textContent = copy.chosenDay.replace('{date}', dayName(dayKey));
    dayTimes.appendChild(head);
    if (options.length === 0) {
      const none = doc.createElement('p');
      none.className = 'book-day-empty';
      none.textContent = copy.noTimes;
      dayTimes.appendChild(none);
      return;
    }
    const tzLine = doc.createElement('p');
    tzLine.className = 'book-tz';
    tzLine.textContent = copy.tzLine.replace('{tz}', visitorTz);
    dayTimes.appendChild(tzLine);
    for (const option of options) {
      const label = doc.createElement('label');
      label.className = 'book-slot';
      const radio = doc.createElement('input');
      radio.type = 'radio';
      radio.name = 'slot';
      radio.value = option.iso;
      const text = doc.createElement('span');
      text.textContent = option.localLabel;
      label.appendChild(radio);
      label.appendChild(text);
      if (option.bogotaLabel) {
        const co = doc.createElement('span');
        co.className = 'book-co';
        co.textContent = ` · ${copy.colombiaSuffix.replace('{time}', option.bogotaLabel)}`;
        label.appendChild(co);
      }
      dayTimes.appendChild(label);
    }
  };

  const markDayTimesFull = (): void => {
    dayTimes.textContent = '';
    const doc = form.ownerDocument;
    const full = doc.createElement('p');
    full.className = 'book-day-empty';
    full.textContent = copy.dayFull;
    dayTimes.appendChild(full);
  };

  /** Paint one month: navigation clamped to the horizon, weeks Monday to
   *  Sunday, and only days with room enabled. */
  const paintCalendar = (): void => {
    const doc = form.ownerDocument;
    cal.textContent = '';
    const bounds = boundsOf();
    const nav = doc.createElement('div');
    nav.className = 'book-cal-nav';
    const prev = doc.createElement('button');
    prev.type = 'button';
    prev.className = 'book-cal-move';
    prev.textContent = '‹';
    prev.setAttribute('aria-label', copy.prevMonth);
    const next = doc.createElement('button');
    next.type = 'button';
    next.className = 'book-cal-move';
    next.textContent = '›';
    next.setAttribute('aria-label', copy.nextMonth);
    const title = doc.createElement('p');
    title.className = 'book-cal-title';
    title.setAttribute('aria-live', 'polite');
    title.textContent = monthName(viewYear, viewMonth);
    const key = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
    prev.disabled = bounds === null || key <= bounds.min;
    next.disabled = bounds === null || key >= bounds.max;
    prev.addEventListener('click', () => {
      const at = shiftMonth(viewYear, viewMonth, -1);
      viewYear = at.year;
      viewMonth = at.month;
      paintCalendar();
    });
    next.addEventListener('click', () => {
      const at = shiftMonth(viewYear, viewMonth, 1);
      viewYear = at.year;
      viewMonth = at.month;
      paintCalendar();
    });
    nav.append(prev, title, next);
    const label = doc.createElement('p');
    label.className = 'book-cal-label';
    label.textContent = copy.pickDay;
    cal.append(label, nav);
    const grid = doc.createElement('div');
    grid.className = 'book-cal-grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', `${copy.pickDay}: ${title.textContent}`);
    const headRow = doc.createElement('div');
    headRow.className = 'book-cal-row';
    headRow.setAttribute('role', 'row');
    for (const name of weekHeads()) {
      const head = doc.createElement('span');
      head.className = 'book-cal-head';
      head.setAttribute('role', 'columnheader');
      head.textContent = name;
      headRow.appendChild(head);
    }
    grid.appendChild(headRow);
    const weeks = buildMonthGrid(viewYear, viewMonth, daysMap);
    const open = weeks.flat().some((c) => c.inMonth && c.hasRoom);
    let tabbed = false;
    for (const week of weeks) {
      const row = doc.createElement('div');
      row.className = 'book-cal-row';
      row.setAttribute('role', 'row');
      for (const cell of week) {
        if (!cell.inMonth) {
          const fill = doc.createElement('span');
          fill.className = 'book-cal-fill';
          fill.setAttribute('aria-hidden', 'true');
          fill.textContent = String(cell.day);
          row.appendChild(fill);
          continue;
        }
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'book-cal-day';
        btn.dataset.key = cell.key;
        btn.textContent = String(cell.day);
        btn.setAttribute('aria-label', dayName(cell.key));
        if (!cell.hasRoom) btn.setAttribute('aria-disabled', 'true');
        if (cell.key === selected) {
          btn.setAttribute('aria-pressed', 'true');
          btn.classList.add('is-picked');
        }
        // One tab stop for the month: the picked day, else the first open
        // day, else the first of the month.
        const tab = selected
          ? cell.key === selected
          : !tabbed && (!open || cell.hasRoom);
        btn.tabIndex = tab ? 0 : -1;
        if (tab) tabbed = true;
        btn.addEventListener('click', () => {
          if (btn.getAttribute('aria-disabled') === 'true') return;
          selected = cell.key;
          for (const other of grid.querySelectorAll('.book-cal-day')) {
            if (!(other instanceof HTMLElement)) continue;
            const on = other.dataset.key === selected;
            other.tabIndex = on ? 0 : -1;
            if (on) {
              other.setAttribute('aria-pressed', 'true');
              other.classList.add('is-picked');
            } else {
              other.removeAttribute('aria-pressed');
              other.classList.remove('is-picked');
            }
          }
          renderDayTimes(cell.key);
        });
        row.appendChild(btn);
      }
      grid.appendChild(row);
    }
    // Arrow keys walk the month grid; Home/End jump to its ends. Only
    // enabled days take focus, and Enter picks the focused day.
    grid.addEventListener('keydown', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains('book-cal-day')) return;
      const order = [...grid.querySelectorAll('.book-cal-day')].filter(
        (el) => el instanceof HTMLElement && el.getAttribute('aria-disabled') !== 'true',
      ) as HTMLElement[];
      const at = order.indexOf(target);
      if (at < 0) return;
      let to: number | null = null;
      if (event.key === 'ArrowRight') to = at + 1;
      else if (event.key === 'ArrowLeft') to = at - 1;
      else if (event.key === 'ArrowDown') to = at + 7;
      else if (event.key === 'ArrowUp') to = at - 7;
      else if (event.key === 'Home') to = 0;
      else if (event.key === 'End') to = order.length - 1;
      else return;
      event.preventDefault();
      const nextEl = order[Math.min(Math.max(to, 0), order.length - 1)];
      for (const el of order) el.tabIndex = el === nextEl ? 0 : -1;
      nextEl.focus();
    });
    cal.appendChild(grid);
  };

  const firstOpenMonth = (): { year: number; month: number } | null => {
    const keys = Object.keys(daysMap)
      .filter((k) => daysMap[k]?.hasRoom === true)
      .sort();
    if (keys.length === 0) return null;
    const [y, m] = keys[0].split('-').map(Number);
    return { year: y, month: m };
  };

  const bogotaMonth = (): { year: number; month: number } => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BOGOTA_TZ,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const get = (type: string): string =>
      parts.find((p) => p.type === type)?.value ?? '';
    return { year: Number(get('year')), month: Number(get('month')) };
  };

  // The service verifies the token before any refusal, and Turnstile tokens
  // are single-use: every failed attempt must reset the widget or the next
  // submit fails the check before reaching the real error.
  const loadSlots = async (): Promise<'ok' | 'empty' | 'unavailable'> => {
    say(copy.loading);
    const result = await fetchSlots(api);
    if (!result.ok) {
      say(copy.errors.unavailable);
      return 'unavailable';
    }
    if (result.slots.length === 0) {
      say(copy.empty);
      return 'empty';
    }
    allSlots = result.slots;
    daysMap = result.days ?? daysFromSlots(result.slots);
    if (viewYear === 0) {
      const first = firstOpenMonth() ?? bogotaMonth();
      viewYear = first.year;
      viewMonth = first.month;
    }
    if (selected && daysMap[selected]?.hasRoom === true) {
      renderDayTimes(selected);
    } else if (selected) {
      selected = null;
      markDayTimesFull();
    }
    paintCalendar();
    form.hidden = false;
    say('');
    ensureTurnstile(form, sitekeyOf(form));
    return 'ok';
  };

  const sitekeyOf = (el: HTMLFormElement): string =>
    (el.querySelector('.cf-turnstile') as HTMLElement | null)?.dataset
      .sitekey ?? '';

  const fieldMessages = (): Record<Field, string> => ({
    name: copy.form.nameError,
    email: copy.form.emailError,
    note: copy.form.noteError,
    slot: copy.form.slotError,
  });

  const values = (): {
    name: string;
    email: string;
    note: string;
    slot: string;
  } => ({
    name:
      (root.querySelector('#book-name') as HTMLInputElement | null)?.value ??
      '',
    email:
      (root.querySelector('#book-email') as HTMLInputElement | null)?.value ??
      '',
    note:
      (root.querySelector('#book-note') as HTMLTextAreaElement | null)?.value ??
      '',
    slot:
      (form.querySelector('input[name="slot"]:checked') as HTMLInputElement | null)
        ?.value ?? '',
  });

  const showSuccess = (slot: string, meet: string, email: string): void => {
    if (!success) return;
    const when = root.querySelector('#book-success-when');
    const meetLine = root.querySelector('#book-success-meet');
    const invite = root.querySelector('#book-success-invite');
    const title = root.querySelector('#book-success-title');
    if (when) {
      when.textContent = copy.success.when.replace(
        '{date}',
        formatBookedWhen(slot, locale, visitorTz, copy.colombiaSuffix),
      );
    }
    if (meetLine) {
      meetLine.textContent = '';
      const doc = form.ownerDocument;
      const [before] = copy.success.meet.split('{meet}');
      meetLine.appendChild(doc.createTextNode(before ?? ''));
      const link = doc.createElement('a');
      link.href = meet;
      link.textContent = meet;
      meetLine.appendChild(link);
    }
    if (invite) {
      invite.textContent = copy.success.invite.replace('{email}', email);
    }
    form.hidden = true;
    success.hidden = false;
    say('');
    if (title instanceof HTMLElement) {
      title.setAttribute('tabindex', '-1');
      title.focus();
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      clearFieldErrors();
      const current = values();
      const bad = validateBooking(current);
      if (bad.length > 0) {
        showFieldErrors(bad, fieldMessages());
        say('');
        return;
      }
      ensureTurnstile(form, sitekeyOf(form));
      const token = tokenOf(form);
      if (!token) {
        say(copy.errors.verification);
        return;
      }
      const submit = form.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement | null;
      if (submit) {
        submit.disabled = true;
        submit.textContent = copy.form.submitting;
      }
      try {
        const result = await postBooking(api, {
          name: current.name.trim(),
          email: current.email.trim().toLowerCase(),
          lang,
          note: current.note.trim(),
          slot: current.slot,
          turnstileToken: token,
        });
        if (result.ok) {
          showSuccess(result.slot, result.meet, current.email.trim());
          return;
        }
        resetTurnstile(form);
        if (result.reason === 'slot-taken') {
          // The reload rewrites the slot list and clears the status, so the
          // refusal message goes on after it; typed fields stay untouched.
          const state = await loadSlots();
          if (state === 'ok') say(copy.errors.slotTaken);
          return;
        }
        say(reasonMessage(result.reason, copy.errors));
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = copy.form.submit;
        }
      }
    })();
  });

  dayTimes.addEventListener('change', () => {
    const err = root.querySelector(FIELD_IDS.slot.error) as HTMLElement | null;
    if (err) {
      err.textContent = '';
      err.hidden = true;
    }
  });

  void loadSlots();
}
