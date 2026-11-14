/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FOUNDING_TOTAL,
  fetchFoundingLeft,
  formatFoundingLeft,
  parseFoundingLeft,
  readFoundingLeft,
  writeFoundingLeft,
} from '../lib/founding-spots';
import { fillFoundingHtml, foundingRoute, rewriteFoundingSpots } from '../../functions/founding-spots';
import { labPageHtml, labPageMarkdown } from '../lib/lab-page';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

const AUDITS_HTML =
  '<ol class="wba-deliver"><li><b>Founding</b>' +
  '<span data-founding-body>The first 5 audits</span>' +
  '<span id="founding-left" class="wba-left"></span></li></ol>';
const CARD_HTML =
  '<p class="wb-founding"><a class="wb-more" href="/workbench/audits">card</a>' +
  '<span id="founding-left" class="wb-left"></span></p>';

/** workerd's HTMLRewriter is not in Node: this stub records what the
 *  rewrite asks it to write, like the newspaper middleware tests. */
class FakeHTMLRewriter {
  writes: Record<string, string> = {};
  on(selector: string, handler: { element: (el: { setInnerContent: (c: string) => void }) => void }) {
    handler.element({
      setInnerContent: (c: string) => {
        this.writes[selector] = c;
      },
    });
    return this;
  }
  transform(res: Response) {
    return res;
  }
}

const okFetch = (body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

afterEach(() => {
  delete (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter;
});

describe('parseFoundingLeft', () => {
  it('accepts integers 0..5 as strings or numbers', () => {
    expect(parseFoundingLeft('3')).toBe(3);
    expect(parseFoundingLeft(0)).toBe(0);
    expect(parseFoundingLeft('5')).toBe(5);
  });
  it('rejects anything outside 0..5 or not an integer', () => {
    for (const bad of ['6', '-1', 'x', '', '2.5', 2.5, null, undefined, {}, []]) {
      expect(parseFoundingLeft(bad)).toBeNull();
    }
  });
});

describe('read/writeFoundingLeft', () => {
  it('round-trips through KV', async () => {
    const store = new Map<string, string>();
    const kv = {
      get: async (k: string) => store.get(k) ?? null,
      put: async (k: string, v: string) => {
        store.set(k, v);
      },
    };
    await writeFoundingLeft(kv, 3);
    expect(await readFoundingLeft(kv)).toBe(3);
  });
  it('reads null when the value is missing, unreadable or out of range', async () => {
    expect(await readFoundingLeft(undefined)).toBeNull();
    expect(await readFoundingLeft({ get: async () => null })).toBeNull();
    expect(await readFoundingLeft({ get: async () => '9' })).toBeNull();
    expect(
      await readFoundingLeft({
        get: async () => {
          throw new Error('kv down');
        },
      }),
    ).toBeNull();
  });
});

describe('formatFoundingLeft', () => {
  it('fills both language templates', () => {
    expect(formatFoundingLeft('{n} of {total} left', 2)).toBe('2 of 5 left');
    expect(formatFoundingLeft('Quedan {n} de {total}', 4)).toBe('Quedan 4 de 5');
  });
});

describe('fetchFoundingLeft', () => {
  it('returns the announced count', async () => {
    await expect(fetchFoundingLeft(okFetch({ left: 3, total: 5 }))).resolves.toBe(3);
  });
  it('returns null when the read fails or lies outside 0..5', async () => {
    await expect(fetchFoundingLeft(okFetch({ left: 9, total: 5 }))).resolves.toBeNull();
    await expect(fetchFoundingLeft(okFetch({ left: 'x' }))).resolves.toBeNull();
    await expect(fetchFoundingLeft(async () => new Response('no', { status: 503 }))).resolves.toBeNull();
    await expect(
      fetchFoundingLeft(async () => {
        throw new Error('down');
      }),
    ).resolves.toBeNull();
  });
});

describe('foundingRoute', () => {
  it('matches the workbench pages in both languages and nothing else', () => {
    expect(foundingRoute('/workbench')).toBe('en');
    expect(foundingRoute('/workbench/')).toBe('en');
    expect(foundingRoute('/workbench/audits')).toBe('en');
    expect(foundingRoute('/workbench/audits/')).toBe('en');
    expect(foundingRoute('/es/workbench')).toBe('es');
    expect(foundingRoute('/es/workbench/audits/')).toBe('es');
    for (const path of ['/workbench/book', '/workbench/audits/slug', '/roadmap', '/es/newspaper/', '/']) {
      expect(foundingRoute(path)).toBeNull();
    }
  });
});

describe('fillFoundingHtml on the audits page', () => {
  it('shows the live count next to the offer without touching its body', () => {
    const out = fillFoundingHtml(AUDITS_HTML, 'en', 3);
    expect(out).toContain('3 of 5 left');
    expect(out).toContain('The first 5 audits');
  });
  it('marks the offer as taken at zero and clears the count', () => {
    const out = fillFoundingHtml(AUDITS_HTML, 'en', 0);
    expect(out).toContain(en.workbench.audits.offers.founding.taken);
    expect(out).not.toContain('The first 5 audits');
    expect(out).toContain('<span id="founding-left" class="wba-left"></span>');
  });
  it('clears the slot and keeps the body when the count is unreadable', () => {
    const out = fillFoundingHtml(AUDITS_HTML, 'es', null);
    expect(out).toContain('<span id="founding-left" class="wba-left"></span>');
    expect(out).toContain('The first 5 audits');
  });
  it('writes the Spanish line in Spanish', () => {
    expect(fillFoundingHtml(AUDITS_HTML, 'es', 4)).toContain('Quedan 4 de 5');
  });
});

describe('fillFoundingHtml on the workbench card', () => {
  it('names the card with its live count, and clears it when unreadable', () => {
    const out = fillFoundingHtml(CARD_HTML, 'es', 2);
    expect(out).toContain(es.workbench.audits.cardLink);
    expect(out).toContain('Quedan 2 de 5');
    expect(fillFoundingHtml(CARD_HTML, 'en', null)).toContain(
      '<span id="founding-left" class="wb-left"></span>',
    );
  });
});

describe('rewriteFoundingSpots', () => {
  it('fills the slot through the regex path when no HTMLRewriter exists', async () => {
    const res = new Response(AUDITS_HTML, { status: 200 });
    const out = await rewriteFoundingSpots(res, 'en', okFetch({ left: 1, total: 5 }));
    expect(await out.text()).toContain('1 of 5 left');
  });
  it('serves the page untouched when the count cannot be read', async () => {
    const res = new Response(AUDITS_HTML, { status: 200 });
    const out = await rewriteFoundingSpots(
      res,
      'es',
      okFetch({ left: 'x', total: FOUNDING_TOTAL }),
    );
    expect(await out.text()).toBe(AUDITS_HTML);
  });
  it('drives the edge rewriter with the live count and the taken line', async () => {
    const seen: FakeHTMLRewriter[] = [];
    (globalThis as { HTMLRewriter?: unknown }).HTMLRewriter = class extends FakeHTMLRewriter {
      constructor() {
        super();
        seen.push(this);
      }
    };
    await rewriteFoundingSpots(new Response(AUDITS_HTML, { status: 200 }), 'es', okFetch({ left: 2, total: 5 }));
    expect(seen[0].writes['#founding-left']).toBe('Quedan 2 de 5');
    await rewriteFoundingSpots(new Response(AUDITS_HTML, { status: 200 }), 'en', okFetch({ left: 0, total: 5 }));
    expect(seen[1].writes['[data-founding-body]']).toBe(en.workbench.audits.offers.founding.taken);
  });
});

describe('lab page coupons with a live count', () => {
  const one = [
    {
      id: 'e1', date: '2026-10-06T01:09:26.735Z', title: 'Newest', body: 'First.',
      type: 'launch', topic: 'canopy', link: null,
    },
  ];
  it('drops only the founding coupon at zero, in HTML and markdown', () => {
    // The coupons ride the classifieds as ads, so the count needs entries;
    // an unreadable feed prints the one unavailable line with no coupons.
    const html = labPageHtml(one, 'en', { foundingLeft: 0 });
    expect(html.match(/class="coupon"/g)).toHaveLength(3);
    expect(html).not.toContain('The first 5 audits');
    expect(html).toContain('Any other audit gets 20 % of the price');
    const md = labPageMarkdown([], 'en', { unavailable: true, foundingLeft: 0 });
    expect(md).not.toContain('The first 5 audits');
  });
  it('keeps all four coupons when the count is unreadable', () => {
    const html = labPageHtml(one, 'en', { foundingLeft: null });
    expect(html.match(/class="coupon"/g)).toHaveLength(4);
    expect(html).toContain('The first 5 audits');
  });
  it('prints no coupons with the unavailable line', () => {
    const html = labPageHtml([], 'en', { unavailable: true, foundingLeft: null });
    expect(html).toContain('lab-empty');
    expect(html).not.toContain('class="coupon"');
  });
});

describe('founding offer markers and copy', () => {
  it('both languages carry the left, taken and card lines', () => {
    for (const d of [en, es]) {
      expect(d.workbench.audits.offers.founding.spots).toBe(FOUNDING_TOTAL);
      expect(d.workbench.audits.offers.founding.left).toContain('{n}');
      expect(d.workbench.audits.offers.founding.taken.length).toBeGreaterThan(0);
      expect(d.workbench.audits.offers.founding.card).toContain('{left}');
    }
    expect(es.workbench.audits.offers.founding.left).toContain('Quedan');
    expect(en.workbench.audits.offers.founding.left).toContain('left');
  });
  it('the views carry the live-count slots the edge fills', () => {
    const audits = readFileSync(resolve(__dirname, '..', 'views', 'WorkbenchAudits.astro'), 'utf8');
    for (const marker of ['data-founding-body', 'id="founding-left"', 'wba-left']) {
      expect(audits).toContain(marker);
    }
    expect(audits).not.toContain('a.offers.founding.spots > 0');
    const workbench = readFileSync(resolve(__dirname, '..', 'views', 'Workbench.astro'), 'utf8');
    for (const marker of ['wb-founding', 'id="founding-left"', 'wb-left']) {
      expect(workbench).toContain(marker);
    }
  });
});
