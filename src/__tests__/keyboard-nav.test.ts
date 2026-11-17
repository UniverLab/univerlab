/**
 * Global keyboard navigation (the `document` keydown listener in
 * src/layouts/BaseLayout.astro): arrow keys belong to the browser, except
 * Shift+Down/Up on the home page (move between experiments) and
 * Shift+Right/Left on an experiment page (next/previous experiment).
 *
 * The listener is inline in the .astro file, so the tests below extract the
 * real shipped listener source and run it against fixture DOM: deleting or
 * regressing the handler breaks these tests.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LAYOUT = resolve(__dirname, '..', 'layouts', 'BaseLayout.astro');

/** The body of the global `document.addEventListener('keydown', ...)` handler. */
function handlerBody(): string {
  const src = readFileSync(LAYOUT, 'utf8');
  const startMarker = "document.addEventListener('keydown', function (e) {";
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error('global keydown listener not found in BaseLayout.astro');
  const endMarker = '\n        });\n      })();';
  const end = src.indexOf(endMarker, start);
  if (end === -1) throw new Error('end of global keydown listener not found in BaseLayout.astro');
  return src.slice(start + startMarker.length, end);
}

const BODY = handlerBody();

/** Fake window capturing navigations; `document` stays the real jsdom one. */
let fakeWindow: { location: { href: string } };
let scrolled: Element[];

function installHandler(): void {
  fakeWindow = { location: { href: '' } };
  scrolled = [];
  (Element.prototype as any).scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
  // `window` is a parameter shadowing the global, so `window.location.href = …`
  // lands on the fake; closure helpers (`isOpen`, `open`, …) are stubs and
  // `keySeq` is re-declared exactly as the layout script does.
  const setup = new Function(
    'window',
    'isOpen',
    'open',
    'close',
    'slip',
    'S',
    `var keySeq = '';\ndocument.addEventListener('keydown', function (e) {${BODY}\n});`,
  );
  setup(fakeWindow, () => false, () => {}, () => {}, () => {}, {});
}

function key(key: string, shiftKey: boolean, extra: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true, ...extra });
}

function homeFixture(): void {
  document.body.innerHTML = `
    <section><h1>home</h1></section>
    <section><p>more</p></section>
    <div class="entries">
      <article class="entry">
        <div class="plate"><a class="plate-link" href="/widgetforge">plate</a></div>
        <h2 class="hw"><a class="hw-link" href="/widgetforge">w</a></h2>
      </article>
      <article class="entry"><h2 class="hw"><a class="hw-link" href="/lantern">l</a></h2></article>
      <article class="entry"><h2 class="hw"><a class="hw-link" href="/mail">m</a></h2></article>
      <article class="entry" hidden><h2 class="hw"><a class="hw-link" href="/archived">a</a></h2></article>
    </div>`;
}

function docsFixture(): void {
  document.body.innerHTML = `
    <div class="docs"><nav>
      <a class="item" href="/docs/one">one</a>
      <a class="item" href="/docs/two">two</a>
    </nav></div>`;
}

function experimentFixture(): void {
  document.body.innerHTML = `
    <section><h1>experiment</h1></section>
    <section><p>body</p></section>
    <nav class="exp-nav">
      <a class="exp-nav-link prev" href="/widgetforge">prev</a>
      <a class="exp-nav-link next" href="/lantern">next</a>
    </nav>`;
}

const links = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a.hw-link'));

beforeAll(() => {
  installHandler();
});

beforeEach(() => {
  document.body.innerHTML = '';
  fakeWindow.location.href = '';
  scrolled.length = 0;
  (document.activeElement as HTMLElement | null)?.blur?.();
});

describe('global keyboard navigation', () => {
  it('does not prevent the default on a plain ArrowDown (browser scrolls)', () => {
    homeFixture();
    const ev = key('ArrowDown', false);
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('does not prevent the default on a plain ArrowDown on an experiment page', () => {
    experimentFixture();
    const ev = key('ArrowDown', false);
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Shift+ArrowDown on the home page focuses and reveals the next experiment', () => {
    homeFixture();
    links()[0].focus();
    const ev = key('ArrowDown', true);
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // Second link focused; the [hidden] entry is skipped, not landed on.
    expect(document.activeElement).toBe(links()[1]);
    expect(scrolled).toContain(links()[1]);
  });

  it('Shift+ArrowDown from another link inside an entry advances to the next entry', () => {
    homeFixture();
    // Focus lands on an entry's plate link when tabbing, not on the title.
    const plate = document.querySelector<HTMLAnchorElement>('a.plate-link')!;
    plate.focus();
    document.dispatchEvent(key('ArrowDown', true));
    expect(document.activeElement).toBe(links()[1]);
  });

  it('Shift+ArrowDown skips the tab-hidden entry and clamps at the last one', () => {
    homeFixture();
    links()[2].focus();
    const ev = key('ArrowDown', true);
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // Stays on the third link: the fourth entry is hidden, not focused.
    expect(document.activeElement).toBe(links()[2]);
    expect(document.activeElement?.getAttribute('href')).toBe('/mail');
    expect(scrolled).toContain(links()[2]);
  });

  it('Shift+ArrowUp on the home page focuses the previous experiment', () => {
    homeFixture();
    links()[1].focus();
    document.dispatchEvent(key('ArrowUp', true));
    expect(document.activeElement).toBe(links()[0]);
  });

  it('Shift+ArrowRight on an experiment page navigates to the next experiment', () => {
    experimentFixture();
    const ev = key('ArrowRight', true);
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(fakeWindow.location.href).toBe('/lantern');
  });

  it('Shift+ArrowLeft on an experiment page navigates to the previous experiment', () => {
    experimentFixture();
    document.dispatchEvent(key('ArrowLeft', true));
    expect(fakeWindow.location.href).toBe('/widgetforge');
  });

  it('Shift+ArrowRight outside an experiment page navigates nowhere', () => {
    homeFixture();
    const ev = key('ArrowRight', true);
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(fakeWindow.location.href).toBe('');
  });

  it('Shift+ArrowDown on a docs page is left to the browser', () => {
    docsFixture();
    const ev = key('ArrowDown', true);
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(fakeWindow.location.href).toBe('');
    expect(document.activeElement).not.toBe(document.querySelector('.docs a.item'));
  });

  it('leaves Ctrl/Meta/Alt+Shift+ArrowDown to the browser', () => {
    homeFixture();
    links()[0].focus();
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      const ev = key('ArrowDown', true, { [mod]: true });
      document.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(links()[0]);
    }
  });

  it('does not prevent the default on plain ArrowUp, ArrowLeft or ArrowRight', () => {
    homeFixture();
    for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      const ev = key(k, false);
      document.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(fakeWindow.location.href).toBe('');
  });
});
