/**
 * The free-first-call booking page (/workbench/book/): a form that lists
 * the service's free slots and books one, in both languages, with the
 * WhatsApp line and the lab email as the no-JS fallback.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bindBookForm,
  fetchSlots,
  formatBookedWhen,
  groupSlotsByDay,
  postBooking,
  reasonMessage,
  validateBooking,
  type BookErrors,
} from '../lib/book-client';
import { privacyEn } from '../data/legal-en';
import { privacyEs } from '../data/legal-es';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const VIEW = readFileSync(resolve(__dirname, '../views/WorkbenchBook.astro'), 'utf8');
const ROUTE = readFileSync(resolve(__dirname, '../pages/workbench/book.astro'), 'utf8');
const ROUTE_ES = readFileSync(resolve(__dirname, '../pages/es/workbench/book.astro'), 'utf8');
const CARD = readFileSync(resolve(__dirname, '../views/Workbench.astro'), 'utf8');
const AUDITS = readFileSync(resolve(__dirname, '../views/WorkbenchAudits.astro'), 'utf8');

const ERRORS: BookErrors = {
  slotTaken: 'taken',
  limit: 'limit',
  verification: 'check',
  unavailable: 'down',
  invalid: 'bad',
};

describe('workbench-book routes', () => {
  it('both language routes render the booking view', () => {
    expect(ROUTE).toContain('WorkbenchBook');
    expect(ROUTE_ES).toContain('WorkbenchBook');
    expect(ROUTE_ES).toContain('../../../views/WorkbenchBook.astro');
  });

  it('the view carries the page title and description from the dictionary', () => {
    expect(VIEW).toContain('title={b.title}');
    expect(VIEW).toContain('description={b.description}');
    expect(VIEW).toContain('<BaseLayout');
    expect(VIEW).toContain('<Watermark kind="blueprint" />');
  });
});

describe('workbench-book copy', () => {
  it('both languages carry the same book keys', () => {
    expect(Object.keys(en.book).sort()).toEqual(Object.keys(es.book).sort());
    expect(Object.keys(en.book.form).sort()).toEqual(Object.keys(es.book.form).sort());
    expect(Object.keys(en.book.errors).sort()).toEqual(Object.keys(es.book.errors).sort());
    expect(Object.keys(en.book.success).sort()).toEqual(Object.keys(es.book.success).sort());
  });

  it('titles and descriptions fit the SEO limits', () => {
    for (const b of [en.book, es.book]) {
      expect(b.title.length).toBeGreaterThanOrEqual(30);
      expect(b.title.length).toBeLessThanOrEqual(60);
      expect(b.description.length).toBeGreaterThanOrEqual(120);
      expect(b.description.length).toBeLessThanOrEqual(160);
    }
  });

  it('no law is named on the booking page', () => {
    for (const json of [JSON.stringify(en.book), JSON.stringify(es.book)]) {
      expect(json).not.toMatch(/Ley \d/);
      expect(json).not.toMatch(/1[0-9]{3} de 20\d\d/);
    }
  });

  it('Spanish keeps Banco de trabajo and spells out inteligencia artificial', () => {
    const json = JSON.stringify(es.book);
    expect(json).toContain('Banco de trabajo');
    expect(json).toContain('inteligencia artificial');
    expect(json).not.toMatch(/\bbanco\b(?!\s+de\s+trabajo)/i);
    expect(json).not.toMatch(/\bIA\b/);
  });

  it('the form only books the free call', () => {
    expect(en.book.intro).toContain('only books the free first call');
    expect(es.book.intro).toContain('solo agenda la primera llamada gratis');
  });
});

describe('workbench-book view', () => {
  it('the form starts hidden behind a visible WhatsApp and email fallback', () => {
    expect(VIEW).toContain('id="book-fallback"');
    expect(VIEW).not.toContain('id="book-fallback" hidden');
    expect(VIEW).toContain('https://wa.me/573053892323');
    expect(VIEW).toContain('mailto:');
    expect(VIEW).toContain('contactEmail');
    expect(VIEW).toContain('id="book-form" hidden');
    expect(VIEW).toContain('novalidate');
  });

  it('the Turnstile widget and the JSON copy island are wired', () => {
    expect(VIEW).toContain('cf-turnstile');
    expect(VIEW).toContain('data-sitekey={sitekey}');
    expect(VIEW).toContain('id="book-i18n"');
    expect(VIEW).toContain('bindBookForm(document)');
    expect(VIEW).toContain("import { bindBookForm } from '../lib/book-client'");
  });

  it('the service address and site key are build configuration with local defaults', () => {
    expect(VIEW).toContain('PUBLIC_BOOKING_API');
    expect(VIEW).toContain('PUBLIC_TURNSTILE_SITE_KEY');
    expect(VIEW).toContain('https://agenda.univerlab.org');
    expect(VIEW).toContain('1x00000000000000000000AA');
    expect(VIEW).toContain('data-api={api}');
    expect(VIEW).toContain('data-lang={lang}');
  });

  it('labels, per-field errors, the slot choice and the announced status exist', () => {
    for (const id of ['book-name', 'book-email', 'book-note']) {
      expect(VIEW).toContain(`for="${id}"`);
      expect(VIEW).toContain(`id="${id}-err"`);
    }
    expect(VIEW).toContain('id="book-slots"');
    expect(VIEW).toContain('id="book-slot-list"');
    expect(VIEW).toContain('id="book-slot-err"');
    expect(VIEW).toContain('id="book-status" role="status"');
    expect(VIEW).toContain('maxlength="500"');
    expect(VIEW).toContain('aria-invalid');
    expect(VIEW).toContain('id="book-success" hidden');
    expect(VIEW).toContain('id="book-success-when"');
    expect(VIEW).toContain('id="book-success-meet"');
    expect(VIEW).toContain('id="book-success-invite"');
  });
});

describe('workbench-book client validation', () => {
  it('rejects each invalid field and accepts a complete booking', () => {
    const good = { name: 'Ada Lovelace', email: 'ada@example.com', note: '', slot: '2026-11-20T15:00:00.000Z' };
    expect(validateBooking(good)).toEqual([]);
    expect(validateBooking({ ...good, name: 'A' })).toEqual(['name']);
    expect(validateBooking({ ...good, name: 'x'.repeat(81) })).toEqual(['name']);
    expect(validateBooking({ ...good, name: 'Ada\nLovelace' })).toEqual(['name']);
    expect(validateBooking({ ...good, email: 'not-an-email' })).toEqual(['email']);
    expect(validateBooking({ ...good, note: 'x'.repeat(501) })).toEqual(['note']);
    expect(validateBooking({ ...good, slot: '' })).toEqual(['slot']);
    expect(validateBooking({ ...good, note: 'x'.repeat(500) })).toEqual([]);
  });
});

describe('workbench-book refusal reasons', () => {
  it('maps all five service reasons to their own message', () => {
    expect(reasonMessage('slot-taken', ERRORS)).toBe('taken');
    expect(reasonMessage('limit', ERRORS)).toBe('limit');
    expect(reasonMessage('verification', ERRORS)).toBe('check');
    expect(reasonMessage('unavailable', ERRORS)).toBe('down');
    expect(reasonMessage('invalid', ERRORS)).toBe('bad');
    expect(reasonMessage('network', ERRORS)).toBe('down');
    expect(reasonMessage('bogus', ERRORS)).toBe('down');
  });
});

describe('workbench-book slots', () => {
  const SLOTS = [
    '2026-11-20T15:00:00.000Z',
    '2026-11-20T16:00:00.000Z',
    '2026-11-21T15:00:00.000Z',
  ];

  it('groups by day in the visitor time zone with Colombia time alongside', () => {
    const groups = groupSlotsByDay(SLOTS, 'America/New_York', 'en');
    expect(groups).toHaveLength(2);
    expect(groups[0].options).toHaveLength(2);
    expect(groups[1].options).toHaveLength(1);
    expect(groups[0].dayKey < groups[1].dayKey).toBe(true);
    for (const g of groups) {
      expect(g.dayLabel.length).toBeGreaterThan(0);
      for (const o of g.options) {
        expect(o.localLabel.length).toBeGreaterThan(0);
        expect(o.bogotaLabel).not.toBeNull();
      }
    }
  });

  it('names no second time zone when the visitor is in Colombia', () => {
    const groups = groupSlotsByDay(SLOTS, 'America/Bogota', 'es');
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      for (const o of g.options) expect(o.bogotaLabel).toBeNull();
    }
  });

  it('drops starts that are not dates', () => {
    expect(groupSlotsByDay(['not-a-date', ...SLOTS], 'America/Bogota', 'es')).toHaveLength(2);
  });

  it('formats the booked start with Colombia time when it differs', () => {
    const when = formatBookedWhen(SLOTS[0], 'en', 'America/New_York', '{time} Colombia time');
    expect(when).toContain('Colombia time');
    const local = formatBookedWhen(SLOTS[0], 'en', 'America/Bogota', '{time} Colombia time');
    expect(local).not.toContain('Colombia time');
  });
});

describe('workbench-book service calls', () => {
  const jsonRes = (payload: unknown, ok = true): Response =>
    ({ ok, json: async () => payload }) as Response;
  const stub = (handler: (url: string) => Response): typeof fetch =>
    (async (input: unknown) => handler(String(input))) as typeof fetch;

  it('lists slots, reports an empty list, and survives a down service', async () => {
    await expect(
      fetchSlots('https://x.test', stub(() => jsonRes({ ok: true, slots: ['a'] }))),
    ).resolves.toEqual({ ok: true, slots: ['a'] });
    await expect(
      fetchSlots('https://x.test', stub(() => jsonRes({ ok: true, slots: 'nope' }))),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(
      fetchSlots('https://x.test', stub(() => jsonRes({ ok: false }, false))),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(
      fetchSlots(
        'https://x.test',
        stub(() => {
          throw new Error('down');
        }),
      ),
    ).resolves.toEqual({ ok: false, reason: 'network' });
  });

  it('books a slot and surfaces every refusal reason', async () => {
    const book = { name: 'Ada', email: 'a@e.com', lang: 'en' as const, note: '', slot: 's', turnstileToken: 't' };
    await expect(
      postBooking('https://x.test', book, stub(() => jsonRes({ ok: true, slot: 's', meet: 'https://meet/x' }))),
    ).resolves.toEqual({ ok: true, slot: 's', meet: 'https://meet/x' });
    for (const reason of ['slot-taken', 'limit', 'verification', 'unavailable', 'invalid']) {
      await expect(
        postBooking('https://x.test', book, stub(() => jsonRes({ ok: false, reason }))),
      ).resolves.toEqual({ ok: false, reason });
    }
    await expect(
      postBooking('https://x.test', book, stub(() => jsonRes({ ok: true, slot: 's' }))),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(
      postBooking(
        'https://x.test',
        book,
        stub(() => {
          throw new Error('down');
        }),
      ),
    ).resolves.toEqual({ ok: false, reason: 'network' });
  });
});

describe('workbench-book form', () => {
  const flush = async (): Promise<void> => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  };

  const skeleton = (island: string): HTMLDivElement => {
    const root = document.createElement('div');
    root.innerHTML = `
<form id="book-form" hidden data-api="https://x.test" data-lang="en" novalidate>
<p id="book-status" role="status"></p>
<fieldset id="book-slots"><legend>slots</legend><div id="book-slot-list"></div><p id="book-slot-err" hidden></p></fieldset>
<div><label for="book-name">n</label><input id="book-name" name="name" type="text" /><p id="book-name-err" hidden></p></div>
<div><label for="book-email">e</label><input id="book-email" name="email" type="email" /><p id="book-email-err" hidden></p></div>
<div><label for="book-note">t</label><textarea id="book-note" name="note"></textarea><p id="book-note-err" hidden></p></div>
<div class="cf-turnstile" data-sitekey="test"></div>
<button type="submit">Book</button>
</form>
<div id="book-success" hidden><h2 id="book-success-title">T</h2><p id="book-success-when"></p><p id="book-success-meet"></p><p id="book-success-invite"></p></div>
<script type="application/json" id="book-i18n">${island}</script>`;
    document.body.appendChild(root);
    return root;
  };

  const island = JSON.stringify({
    loading: en.book.loading,
    empty: en.book.empty,
    tzLine: en.book.tzLine,
    colombiaSuffix: en.book.colombiaSuffix,
    form: en.book.form,
    errors: en.book.errors,
    success: en.book.success,
  });

  const slotsFetch = (slots: string[]): typeof fetch =>
    (async (input: unknown) => {
      if (String(input).endsWith('/slots')) {
        return { ok: true, json: async () => ({ ok: true, slots }) } as Response;
      }
      throw new Error(`unexpected fetch ${String(input)}`);
    }) as typeof fetch;

  afterEach(() => {
    document.body.innerHTML = '';
    document.getElementById('cf-turnstile-api')?.remove();
  });

  it('renders the free slots as radios and unhides the form', async () => {
    const realFetch = globalThis.fetch;
    (globalThis as { fetch?: typeof fetch }).fetch = slotsFetch([
      '2026-11-20T15:00:00.000Z',
      '2026-11-21T15:00:00.000Z',
    ]);
    try {
      const root = skeleton(island);
      bindBookForm(root);
      await flush();
      const radios = root.querySelectorAll('input[name="slot"]');
      expect(radios).toHaveLength(2);
      expect(root.querySelector('#book-form')?.hasAttribute('hidden')).toBe(false);
      expect(root.querySelector('#book-status')?.textContent).toBe('');
    } finally {
      (globalThis as { fetch?: typeof fetch }).fetch = realFetch;
    }
  });

  it('sends nothing until a slot is chosen and the fields are valid', async () => {
    const realFetch = globalThis.fetch;
    let booked = 0;
    (globalThis as { fetch?: typeof fetch }).fetch = (async (input: unknown) => {
      if (String(input).endsWith('/slots')) {
        return { ok: true, json: async () => ({ ok: true, slots: ['2026-11-20T15:00:00.000Z'] }) } as Response;
      }
      booked += 1;
      throw new Error('must not book');
    }) as typeof fetch;
    try {
      const root = skeleton(island);
      bindBookForm(root);
      await flush();
      const form = root.querySelector('#book-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();
      expect(booked).toBe(0);
      expect(root.querySelector('#book-name-err')?.hasAttribute('hidden')).toBe(false);
      expect(root.querySelector('#book-email-err')?.hasAttribute('hidden')).toBe(false);
      expect(root.querySelector('#book-slot-err')?.hasAttribute('hidden')).toBe(false);
    } finally {
      (globalThis as { fetch?: typeof fetch }).fetch = realFetch;
    }
  });

  it('a taken slot reloads the list, keeps typed fields and shows its own message', async () => {
    const realFetch = globalThis.fetch;
    let bookCalls = 0;
    (globalThis as { fetch?: typeof fetch }).fetch = (async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/slots')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            slots: ['2026-11-20T15:00:00.000Z', '2026-11-21T15:00:00.000Z'],
          }),
        } as Response;
      }
      bookCalls += 1;
      return {
        ok: false,
        json: async () => ({ ok: false, reason: 'slot-taken' }),
      } as Response;
    }) as typeof fetch;
    try {
      const root = skeleton(island);
      bindBookForm(root);
      await flush();
      const form = root.querySelector('#book-form') as HTMLFormElement;
      (root.querySelector('#book-name') as HTMLInputElement).value = 'Ada Lovelace';
      (root.querySelector('#book-email') as HTMLInputElement).value = 'ada@example.com';
      (root.querySelector('#book-note') as HTMLTextAreaElement).value = 'agents';
      (root.querySelector('input[name="slot"]') as HTMLInputElement).click();
      const token = document.createElement('input');
      token.name = 'cf-turnstile-response';
      token.value = 'tok';
      form.appendChild(token);
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();
      await flush();
      expect(bookCalls).toBe(1);
      expect(root.querySelector('#book-status')?.textContent).toBe(
        en.book.errors.slotTaken,
      );
      expect((root.querySelector('#book-name') as HTMLInputElement).value).toBe(
        'Ada Lovelace',
      );
      expect((root.querySelector('#book-email') as HTMLInputElement).value).toBe(
        'ada@example.com',
      );
      expect((root.querySelector('#book-note') as HTMLTextAreaElement).value).toBe(
        'agents',
      );
      expect(root.querySelectorAll('input[name="slot"]')).toHaveLength(2);
    } finally {
      (globalThis as { fetch?: typeof fetch }).fetch = realFetch;
    }
  });
});

describe('workbench-book privacy', () => {
  it('both privacy pages cover the booking form, the calendar and deletion', () => {
    const sectionOf = (d: { sections: { id: string; paras: string[] }[] }) =>
      d.sections.find((s) => s.id === 'first-call-booking');
    const enSection = sectionOf(privacyEn);
    const esSection = sectionOf(privacyEs);
    expect(enSection).toBeDefined();
    expect(esSection).toBeDefined();
    const enText = enSection!.paras.join(' ');
    const esText = esSection!.paras.join(' ');
    for (const word of ['name', 'email', 'note']) expect(enText).toContain(word);
    expect(enText).toContain('Google Calendar');
    expect(enText).toContain('Turnstile');
    expect(enText).toContain('{email}');
    expect(esText).toContain('nombre');
    expect(esText).toContain('correo');
    expect(esText).toContain('Google Calendar');
    expect(esText).toContain('Turnstile');
    expect(esText).toContain('{email}');
  });
});

describe('workbench-book entry points', () => {
  it('the Workbench and audits pages lead the first call to the booking page', () => {
    for (const view of [CARD, AUDITS]) {
      expect(view).toContain("localizePath('/workbench/book', lang)");
      expect(view).toContain('{w.altCta}');
      // WhatsApp stays as the secondary way to write.
      expect(view).toContain('https://wa.me/573053892323');
      expect(view).toContain('encodeURIComponent(w.ctaMessage)');
    }
  });

  it('the close band still writes on WhatsApp', () => {
    for (const view of [CARD, AUDITS]) {
      expect(view).toContain('{w.close.cta}');
      expect(view).toContain('{w.close.phone}');
    }
    expect(en.workbench.altCta.length).toBeGreaterThan(0);
    expect(es.workbench.altCta.length).toBeGreaterThan(0);
  });
});
