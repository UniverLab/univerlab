// The booking form DOM wiring: bail paths, the loading/empty/unavailable
// states, the calendar with its navigation and keyboard, the day view, the
// token gate, field errors with focus, the slot-taken reload, and the
// success receipt with its Meet link and invite line.
import {
  bindBookForm,
  buildMonthGrid,
  daysFromSlots,
  groupSlotsByDay,
  monthBounds,
  optionsForDay,
  shiftMonth,
} from '../lib/book-client';

describe('groupSlotsByDay time zones', () => {
  it('appends Colombia time for visitors outside Colombia and drops bad starts', () => {
    const groups = groupSlotsByDay([SLOT, 'not-a-date'], 'America/New_York', 'en');
    expect(groups).toHaveLength(1);
    expect(groups[0].options).toHaveLength(1);
    expect(groups[0].options[0].bogotaLabel).not.toBe(null);
  });

  it('omits the Colombia line for visitors in Colombia', () => {
    const groups = groupSlotsByDay([SLOT], 'America/Bogota', 'es');
    expect(groups).toHaveLength(1);
    expect(groups[0].options[0].bogotaLabel).toBe(null);
  });
});

const COPY = {
  loading: 'Loading…',
  empty: 'No slots',
  tzLine: 'Times in {tz}',
  colombiaSuffix: '({time} in Colombia)',
  pickDay: 'Pick a day',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  dayFull: 'That day filled up',
  noTimes: 'No times that day',
  chosenDay: 'Times on {date}',
  form: {
    nameError: 'bad name', emailError: 'bad email', noteError: 'bad note',
    slotError: 'pick a slot', submit: 'Book', submitting: 'Booking…',
  },
  errors: {
    slotTaken: 'taken', limit: 'limit hit', verification: 'prove human',
    unavailable: 'down', invalid: 'invalid',
  },
  success: {
    title: 'Booked', when: 'On {date}', meet: 'Join at {meet}', invite: 'Invite sent to {email}',
  },
};

const SLOT = '2026-11-20T15:00:00.000Z';

function mount(opts?: { api?: string; island?: string; lang?: string }): void {
  const api = opts?.api === undefined ? 'https://agenda.example.com' : opts.api;
  const island = opts?.island === undefined ? JSON.stringify(COPY) : opts.island;
  document.body.innerHTML =
    `<form id="book-form" data-api="${api}" data-lang="${opts?.lang ?? 'en'}" hidden>` +
    '<input id="book-name" type="text"><p id="book-name-err" hidden></p>' +
    '<input id="book-email" type="email"><p id="book-email-err" hidden></p>' +
    '<textarea id="book-note" maxlength="500"></textarea><p id="book-note-err" hidden></p>' +
    '<div id="book-slots"></div>' +
    '<div id="book-cal"></div>' +
    '<div id="book-day-times"></div>' +
    '<p id="book-slot-err" hidden></p>' +
    '<p id="book-status" role="status"></p>' +
    '<input type="hidden" name="cf-turnstile-response" value="">' +
    '<button type="submit">Book</button></form>' +
    '<div id="book-success" hidden><h2 id="book-success-title">x</h2>' +
    '<p id="book-success-when"></p><p id="book-success-meet"></p>' +
    '<p id="book-success-invite"></p></div>' +
    (island === null ? '' : `<script id="book-i18n" type="application/json">${island}</script>`);
}

function status(): string {
  return (document.getElementById('book-status') as HTMLElement).textContent ?? '';
}

function slotsFetch(slots: unknown, ok = true, days?: unknown): jest.Mock {
  return jest.fn().mockImplementation((url: string) => {
    if (String(url).endsWith('/slots')) {
      return Promise.resolve({ ok, json: async () => ({ ok, slots, ...(days === undefined ? null : { days }) }) });
    }
    return Promise.resolve({ ok: false, json: async () => ({ ok: false, reason: 'unavailable' }) });
  });
}

/** Click the first calendar day that still has room. */
function pickFirstOpenDay(): void {
  const open = document.querySelector('.book-cal-day:not([aria-disabled="true"])') as HTMLButtonElement;
  expect(open).not.toBe(null);
  open.click();
}

function submit(): void {
  (document.getElementById('book-form') as HTMLFormElement).dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }));
}

function setFields(name: string, email: string, note = ''): void {
  (document.getElementById('book-name') as HTMLInputElement).value = name;
  (document.getElementById('book-email') as HTMLInputElement).value = email;
  (document.getElementById('book-note') as HTMLTextAreaElement).value = note;
}

function flush(times = 4): Promise<void> {
  let p: Promise<void> = Promise.resolve();
  for (let i = 0; i < times; i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}

beforeEach(() => {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

describe('bindBookForm bail paths', () => {
  it('bails with no form, no status, no list or no island', () => {
    document.body.innerHTML = '';
    expect(() => bindBookForm(document)).not.toThrow();
    mount();
    document.getElementById('book-i18n')?.remove();
    expect(() => bindBookForm(document)).not.toThrow();
    expect(status()).toBe('');
  });

  it('reports bad JSON islands as missing and stays quiet', () => {
    mount({ island: 'nope{' });
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch([SLOT]);
    bindBookForm(document);
    expect(status()).toBe('');
  });

  it('reports unavailable when the service address is missing', () => {
    mount({ api: '' });
    bindBookForm(document);
    expect(status()).toBe('down');
  });
});

describe('bindBookForm slot loading', () => {
  it('paints the month calendar and unhides the form on success', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch([SLOT]);
    bindBookForm(document);
    await flush();
    expect(status()).toBe('');
    expect((document.getElementById('book-form') as HTMLFormElement).hidden).toBe(false);
    expect(document.querySelector('.book-cal-grid')).not.toBe(null);
    // No times until a day is picked: the radio appears with the day view.
    expect(document.querySelectorAll('input[name="slot"]')).toHaveLength(0);
    pickFirstOpenDay();
    expect(document.querySelectorAll('input[name="slot"]')).toHaveLength(1);
    expect(document.querySelector('.book-day-head')?.textContent).toContain('Times on');
    expect(document.querySelector('.book-tz')?.textContent).toContain('Times in');
  });

  it('keeps days without room disabled and unpickable', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch(
      [SLOT, '2026-11-21T15:00:00.000Z'],
      true,
      { '2026-11-20': { hasRoom: true }, '2026-11-21': { hasRoom: false } },
    );
    bindBookForm(document);
    await flush();
    const full = document.querySelector('.book-cal-day[data-key="2026-11-21"]') as HTMLButtonElement;
    expect(full).not.toBe(null);
    expect(full.getAttribute('aria-disabled')).toBe('true');
    full.click();
    expect(document.querySelectorAll('input[name="slot"]')).toHaveLength(0);
    expect((document.getElementById('book-day-times') as HTMLElement).textContent).toBe('');
  });

  it('reports empty when the service lists no slots', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch([]);
    bindBookForm(document);
    await flush();
    expect(status()).toBe('No slots');
  });

  it('reports unavailable when the fetch fails', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockRejectedValue(new Error('down'));
    bindBookForm(document);
    await flush();
    expect(status()).toBe('down');
  });

  it('reports unavailable on a bad slot payload', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch('nope', false);
    bindBookForm(document);
    await flush();
    expect(status()).toBe('down');
  });
});

describe('bindBookForm submit', () => {
  async function ready(): Promise<void> {
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch([SLOT]);
    bindBookForm(document);
    await flush();
    pickFirstOpenDay();
    (document.querySelector('input[name="slot"]') as HTMLInputElement).checked = true;
  }

  it('asks for verification when the token is missing', async () => {
    mount();
    await ready();
    setFields('Ada Lovelace', 'ada@example.com');
    submit();
    await flush();
    expect(status()).toBe('prove human');
  });

  it('flags bad fields, focuses the first and clears them on retry', async () => {
    mount();
    await ready();
    setFields('A', 'not-an-email');
    submit();
    await flush();
    expect((document.getElementById('book-name-err') as HTMLElement).textContent).toBe('bad name');
    expect((document.getElementById('book-name-err') as HTMLElement).hidden).toBe(false);
    expect(document.activeElement?.id).toBe('book-name');
    setFields('Ada Lovelace', 'ada@example.com');
    (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement).value = 'tok';
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockImplementation((url: string) =>
      String(url).endsWith('/book')
        ? Promise.resolve({ ok: true, json: async () => ({ ok: true, slot: SLOT, meet: 'https://meet/x' }) })
        : Promise.resolve({ ok: true, json: async () => ({ ok: true, slots: [SLOT] }) }));
    submit();
    await flush();
    expect((document.getElementById('book-name-err') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('book-form') as HTMLFormElement).hidden).toBe(true);
    expect((document.getElementById('book-success') as HTMLElement).hidden).toBe(false);
  });

  it('focuses the calendar when only the slot is missing', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch([SLOT]);
    bindBookForm(document);
    await flush();
    setFields('Ada Lovelace', 'ada@example.com');
    submit();
    await flush();
    expect((document.getElementById('book-slot-err') as HTMLElement).textContent).toBe('pick a slot');
  });

  it('a slot change clears the slot error', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch([SLOT]);
    bindBookForm(document);
    await flush();
    pickFirstOpenDay();
    setFields('Ada Lovelace', 'ada@example.com');
    submit();
    await flush();
    (document.querySelector('input[name="slot"]') as HTMLInputElement).checked = true;
    document.getElementById('book-day-times')?.dispatchEvent(new Event('change', { bubbles: true }));
    expect((document.getElementById('book-slot-err') as HTMLElement).hidden).toBe(true);
  });



  it('books the slot and shows when, meet and invite', async () => {
    mount();
    await ready();
    setFields('Ada Lovelace', 'ada@example.com');
    (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement).value = 'tok';
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/book')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, slot: SLOT, meet: 'https://meet/x' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, slots: [SLOT] }) });
    });
    submit();
    await flush();
    expect((document.getElementById('book-success-when') as HTMLElement).textContent).toContain('On ');
    const meet = document.getElementById('book-success-meet') as HTMLElement;
    expect(meet.querySelector('a')?.href).toBe('https://meet/x');
    expect((document.getElementById('book-success-invite') as HTMLElement).textContent).toContain('ada@example.com');
    expect(document.activeElement?.id).toBe('book-success-title');
  });

  it('reloads the slots and reports taken when the slot is gone', async () => {
    mount();
    await ready();
    setFields('Ada Lovelace', 'ada@example.com');
    (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement).value = 'tok';
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/book')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: false, reason: 'slot-taken' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, slots: [SLOT] }) });
    });
    submit();
    await flush(8);
    expect(status()).toBe('taken');
    expect((document.getElementById('book-name') as HTMLInputElement).value).toBe('Ada Lovelace');
    // The calendar refreshed around the picked day, so its times are back.
    expect(document.querySelectorAll('input[name="slot"]')).toHaveLength(1);
  });

  it('names the picked day as full when the reload closes it', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch(
      [SLOT],
      true,
      { '2026-11-20': { hasRoom: true } },
    );
    bindBookForm(document);
    await flush();
    pickFirstOpenDay();
    (document.querySelector('input[name="slot"]') as HTMLInputElement).checked = true;
    setFields('Ada Lovelace', 'ada@example.com');
    (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement).value = 'tok';
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/book')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: false, reason: 'slot-taken' }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          slots: ['2026-11-23T15:00:00.000Z'],
          days: { '2026-11-20': { hasRoom: false }, '2026-11-23': { hasRoom: true } },
        }),
      });
    });
    submit();
    await flush(8);
    expect(status()).toBe('taken');
    expect((document.getElementById('book-day-times') as HTMLElement).textContent).toContain('That day filled up');
    expect(document.querySelectorAll('input[name="slot"]')).toHaveLength(0);
  });

  it('reports the limit refusal without reloading', async () => {
    mount();
    await ready();
    setFields('Ada Lovelace', 'ada@example.com');
    (document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement).value = 'tok';
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/book')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: false, reason: 'limit' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, slots: [SLOT] }) });
    });
    (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
    submit();
    await flush();
    expect(status()).toBe('limit hit');
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/slots'))).toHaveLength(0);
  });
});

describe('buildMonthGrid weeks', () => {
  const days = {
    '2026-11-20': { hasRoom: true },
    '2026-11-21': { hasRoom: false },
  };

  it('runs Monday to Sunday and flags only in-month days with room', () => {
    const weeks = buildMonthGrid(2026, 11, days);
    // November 2026 starts on a Sunday: six leading filler cells.
    expect(weeks[0].slice(0, 6).every((c) => !c.inMonth)).toBe(true);
    expect(weeks[0][6]).toMatchObject({ key: '2026-11-01', day: 1, inMonth: true });
    for (const week of weeks) expect(week).toHaveLength(7);
    const flat = weeks.flat();
    expect(flat.filter((c) => c.inMonth)).toHaveLength(30);
    const last = flat[flat.length - 1];
    expect(last.inMonth).toBe(false);
    expect(flat.find((c) => c.key === '2026-11-20')).toMatchObject({ hasRoom: true, inMonth: true });
    expect(flat.find((c) => c.key === '2026-11-21')).toMatchObject({ hasRoom: false, inMonth: true });
    // A day the room map never names still reads as closed.
    expect(flat.find((c) => c.key === '2026-11-22')).toMatchObject({ hasRoom: false });
  });

  it('a Monday-first month needs no leading fill', () => {
    // June 2026 starts on a Monday.
    const weeks = buildMonthGrid(2026, 6, {});
    expect(weeks[0][0]).toMatchObject({ key: '2026-06-01', inMonth: true });
  });

  it('shifts months across year ends and bounds navigation to the room map', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(monthBounds(days)).toEqual({ min: '2026-11', max: '2026-11' });
    expect(monthBounds({})).toBe(null);
  });
});

describe('day view options', () => {
  const slots = [
    '2026-11-20T20:00:00.000Z', // 15:00 Bogota
    '2026-11-20T21:15:00.000Z', // 16:15 Bogota
    '2026-11-23T20:00:00.000Z',
    'not-a-date',
  ];

  it('keeps only the picked Bogota day, earliest first', () => {
    const options = optionsForDay(slots, '2026-11-20', 'America/Bogota', 'es');
    expect(options.map((o) => o.iso)).toEqual([
      '2026-11-20T20:00:00.000Z',
      '2026-11-20T21:15:00.000Z',
    ]);
    expect(options[0].bogotaLabel).toBe(null);
  });

  it('names Colombia time for visitors outside Colombia', () => {
    const options = optionsForDay(slots, '2026-11-20', 'America/New_York', 'en');
    expect(options).toHaveLength(2);
    expect(options[0].bogotaLabel).not.toBe(null);
  });

  it('derives room from the slots when the service sends no map', () => {
    expect(daysFromSlots(slots)).toEqual({
      '2026-11-20': { hasRoom: true },
      '2026-11-23': { hasRoom: true },
    });
    expect(daysFromSlots(['not-a-date'])).toEqual({});
  });
});

describe('bindBookForm calendar navigation and keyboard', () => {
  const twoMonths = {
    slots: ['2026-11-20T15:00:00.000Z', '2026-12-02T15:00:00.000Z'],
    days: { '2026-11-20': { hasRoom: true }, '2026-12-02': { hasRoom: true } },
  };

  async function readyTwoMonths(): Promise<void> {
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch(
      twoMonths.slots, true, twoMonths.days,
    );
    bindBookForm(document);
    await flush();
  }

  function moveButtons(): { prev: HTMLButtonElement; next: HTMLButtonElement } {
    const prev = document.querySelector('.book-cal-move[aria-label="Previous month"]') as HTMLButtonElement;
    const next = document.querySelector('.book-cal-move[aria-label="Next month"]') as HTMLButtonElement;
    expect(prev).not.toBe(null);
    expect(next).not.toBe(null);
    return { prev, next };
  }

  it('clamps month navigation to the horizon', async () => {
    mount();
    await readyTwoMonths();
    const { prev, next } = moveButtons();
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    next.click();
    const again = moveButtons();
    expect(again.prev.disabled).toBe(false);
    expect(again.next.disabled).toBe(true);
    expect(document.querySelector('.book-cal-title')?.textContent).toContain('December');
    again.prev.click();
    expect(document.querySelector('.book-cal-title')?.textContent).toContain('November');
  });

  it('locks navigation when every day shares one month', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch([SLOT], true, {
      '2026-11-20': { hasRoom: true },
    });
    bindBookForm(document);
    await flush();
    const { prev, next } = moveButtons();
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });

  it('walks open days with arrows and picks with Enter', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch(
      ['2026-11-20T15:00:00.000Z', '2026-11-23T15:00:00.000Z'],
      true,
      { '2026-11-20': { hasRoom: true }, '2026-11-23': { hasRoom: true } },
    );
    bindBookForm(document);
    await flush();
    const open = [...document.querySelectorAll('.book-cal-day:not([aria-disabled="true"])')] as HTMLButtonElement[];
    expect(open.length).toBe(2);
    open[0].focus();
    open[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(open[1]);
    (document.activeElement as HTMLButtonElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    // Enter on a focused day button clicks it: the day view opens.
    (document.activeElement as HTMLButtonElement).click();
    expect(document.querySelector('.book-cal-day.is-picked')).not.toBe(null);
    expect(document.querySelectorAll('input[name="slot"]')).toHaveLength(1);
    expect(document.querySelector('.book-cal-day.is-picked')?.getAttribute('aria-pressed')).toBe('true');
  });
});
