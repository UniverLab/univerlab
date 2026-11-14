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

/** Field rules mirror the service (`parseBooking` in the agenda worker):
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
  | { ok: true; slots: string[] }
  | { ok: false; reason: ServiceReason | 'network' };

export async function fetchSlots(
  api: string,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<SlotsResult> {
  try {
    const res = await fetchFn(`${api}/slots`);
    if (!res.ok) return { ok: false, reason: 'unavailable' };
    const data = (await res.json()) as { ok?: unknown; slots?: unknown };
    if (data.ok !== true || !Array.isArray(data.slots)) {
      return { ok: false, reason: 'unavailable' };
    }
    return {
      ok: true,
      slots: data.slots.filter((s): s is string => typeof s === 'string'),
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
  slot: { input: '#book-slots', error: '#book-slot-err' },
};

/** Wire the booking form inside `root` (the document). Reads config and
 *  copy from the DOM, lists the free slots, and books the chosen one. */
export function bindBookForm(root: ParentNode): void {
  const form = root.querySelector('#book-form') as HTMLFormElement | null;
  const status = root.querySelector('#book-status') as HTMLElement | null;
  const list = root.querySelector('#book-slot-list') as HTMLElement | null;
  const success = root.querySelector('#book-success') as HTMLElement | null;
  if (!form || !status || !list) return;
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
      list.querySelector('input')?.focus?.();
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

  const paintSlots = (groups: DayGroup[]): void => {
    const doc = form.ownerDocument;
    list.textContent = '';
    const tzLine = doc.createElement('p');
    tzLine.className = 'book-tz';
    tzLine.textContent = copy.tzLine.replace('{tz}', visitorTz);
    list.appendChild(tzLine);
    for (const group of groups) {
      const day = doc.createElement('fieldset');
      day.className = 'book-day';
      const legend = doc.createElement('legend');
      legend.textContent = group.dayLabel;
      day.appendChild(legend);
      for (const option of group.options) {
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
        day.appendChild(label);
      }
      list.appendChild(day);
    }
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
    paintSlots(groupSlotsByDay(result.slots, visitorTz, locale));
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

  list.addEventListener('change', () => {
    const err = root.querySelector(FIELD_IDS.slot.error) as HTMLElement | null;
    if (err) {
      err.textContent = '';
      err.hidden = true;
    }
  });

  void loadSlots();
}
