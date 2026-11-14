// The booking form DOM wiring: bail paths, the loading/empty/unavailable
// states, the token gate, field errors with focus, the slot-taken reload,
// and the success receipt with its Meet link and invite line.
import { bindBookForm, groupSlotsByDay } from '../lib/book-client';

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
    '<div id="book-slot-list"></div>' +
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

function slotsFetch(slots: unknown, ok = true): jest.Mock {
  return jest.fn().mockImplementation((url: string) => {
    if (String(url).endsWith('/slots')) {
      return Promise.resolve({ ok, json: async () => ({ ok, slots }) });
    }
    return Promise.resolve({ ok: false, json: async () => ({ ok: false, reason: 'unavailable' }) });
  });
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
  it('paints grouped slots and unhides the form on success', async () => {
    mount();
    (globalThis as Record<string, unknown>)['fetch'] = slotsFetch([SLOT]);
    bindBookForm(document);
    await flush();
    expect(status()).toBe('');
    expect((document.getElementById('book-form') as HTMLFormElement).hidden).toBe(false);
    expect(document.querySelector('.book-tz')?.textContent).toContain('Times in');
    expect(document.querySelectorAll('input[name="slot"]')).toHaveLength(1);
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

  it('focuses the slot list when only the slot is missing', async () => {
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
    setFields('Ada Lovelace', 'ada@example.com');
    submit();
    await flush();
    (document.querySelector('input[name="slot"]') as HTMLInputElement).checked = true;
    document.getElementById('book-slot-list')?.dispatchEvent(new Event('change', { bubbles: true }));
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
