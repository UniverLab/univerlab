// The audit page shell: bails without #audit-data; glossary terms toggle
// on click, Enter and Space; reference links arm the back button (hash jump
// when there is a return target, history.back and scrollTo otherwise); the
// findings-table buttons filter rows by severity/status and set aria-pressed;
// stepper buttons toggle their bodies and aria-expanded.
jest.mock('../lib/copy-morph', () => ({ COPY_DONE_MS: 50, setCopyState: jest.fn() }));
import { initAuditPage } from '../lib/audit/client';

function mountShell(inner: string, data = { slug: 's', lang: 'en' }): HTMLElement {
  document.body.innerHTML =
    `<script id="audit-data" type="application/json">${JSON.stringify(data)}</script>` +
    `<div id="scope">${inner}</div>`;
  // A fresh scope per test: initAuditPage wires listeners on its root, so
  // wiring the shared document would stack handlers across tests.
  return document.getElementById('scope') as HTMLElement;
}

function click(el: Element): void {
  el.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
}

function key(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  jest.restoreAllMocks();
});

describe('initAuditPage guards', () => {
  it('bails when #audit-data is missing or unparseable', () => {
    expect(() => initAuditPage(document)).not.toThrow();
    document.body.innerHTML = '<script id="audit-data" type="application/json">nope{</script>';
    expect(() => initAuditPage(document)).not.toThrow();
  });

  it('wires an empty page without throwing', () => {
    expect(() => initAuditPage(mountShell(''))).not.toThrow();
  });
});

describe('glossary terms', () => {
  const TERMS = '<dl><div class="audit-term" tabindex="0">term' +
    '<dd class="audit-term-def" hidden>def</dd></div></dl>';

  it('click toggles the definition', () => {
    initAuditPage(mountShell(TERMS));
    const term = document.querySelector('.audit-term') as HTMLElement;
    const def = document.querySelector('.audit-term-def') as HTMLElement;
    click(term);
    expect(def.hasAttribute('hidden')).toBe(false);
    click(term);
    expect(def.hasAttribute('hidden')).toBe(true);
  });

  it('Enter and Space toggle, other keys do nothing', () => {
    initAuditPage(mountShell(TERMS));
    const term = document.querySelector('.audit-term') as HTMLElement;
    const def = document.querySelector('.audit-term-def') as HTMLElement;
    key(term, 'Enter');
    expect(def.hasAttribute('hidden')).toBe(false);
    key(term, 'x');
    expect(def.hasAttribute('hidden')).toBe(false);
    key(term, ' ');
    expect(def.hasAttribute('hidden')).toBe(true);
  });

  it('ignores clicks and keys outside a term', () => {
    initAuditPage(mountShell('<p>plain</p>' + TERMS));
    const def = document.querySelector('.audit-term-def') as HTMLElement;
    click(document.querySelector('p') as HTMLElement);
    const outside = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
    document.querySelector('p')?.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
    expect(def.hasAttribute('hidden')).toBe(true);
  });
});

describe('reference back links', () => {
  const PAGE = '<a class="audit-ref" href="#fn1">1</a>' +
    '<section id="fn1"><a class="audit-back">back</a></section>';

  it('jumps to the stored hash when the ref was visited', () => {
    initAuditPage(mountShell(PAGE));
    click(document.querySelector('.audit-ref') as HTMLElement);
    click(document.querySelector('.audit-back') as HTMLElement);
    expect(window.location.hash).toBe('#fn1');
  });

  it('falls back to history.back when there is no return target', () => {
    initAuditPage(mountShell(PAGE));
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => {});
    click(document.querySelector('.audit-back') as HTMLElement);
    expect(back).toHaveBeenCalled();
  });

  it('falls back to scrolling to top when history is a single entry', () => {
    initAuditPage(mountShell(PAGE));
    Object.defineProperty(window.history, 'length', { value: 1, configurable: true });
    const scroll = jest.fn();
    (window as unknown as Record<string, unknown>)['scrollTo'] = scroll;
    click(document.querySelector('.audit-back') as HTMLElement);
    expect(scroll).toHaveBeenCalledWith({ top: 0 });
  });
});

describe('findings-table filters', () => {
  const TABLE = '<div class="audit-findingsTable" data-sev="all" data-status="all">' +
    '<button data-sev="high">H</button><button data-sev="all">All</button>' +
    '<button data-status="open">O</button>' +
    '<table><tbody>' +
    '<tr data-severity="high" data-status="open"><td>a</td></tr>' +
    '<tr data-severity="low" data-status="fixed"><td>b</td></tr>' +
    '</tbody></table></div>';

  function rows(): HTMLElement[] {
    return Array.from(document.querySelectorAll('tbody tr')) as HTMLElement[];
  }

  it('shows every row before any filter is pressed', () => {
    initAuditPage(mountShell(TABLE));
    expect(rows().map((r) => r.hidden)).toEqual([false, false]);
  });

  it('a severity button hides the other rows and marks itself pressed', () => {
    initAuditPage(mountShell(TABLE));
    click(document.querySelector('button[data-sev="high"]') as HTMLElement);
    expect(rows().map((r) => r.hidden)).toEqual([false, true]);
    expect((document.querySelector('button[data-sev="high"]') as HTMLElement).getAttribute('aria-pressed')).toBe('true');
    expect((document.querySelector('button[data-sev="all"]') as HTMLElement).getAttribute('aria-pressed')).toBe('false');
    click(document.querySelector('button[data-sev="all"]') as HTMLElement);
    expect(rows().map((r) => r.hidden)).toEqual([false, false]);
  });

  it('a status button hides the other rows and marks itself pressed', () => {
    initAuditPage(mountShell(TABLE));
    click(document.querySelector('button[data-status="open"]') as HTMLElement);
    expect(rows().map((r) => r.hidden)).toEqual([false, true]);
    expect((document.querySelector('button[data-status="open"]') as HTMLElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores clicks outside filter buttons', () => {
    initAuditPage(mountShell(TABLE + '<p>plain</p>'));
    click(document.querySelector('p') as HTMLElement);
    expect(rows().map((r) => r.hidden)).toEqual([false, false]);
  });
});

describe('copy buttons', () => {
  function flush(): Promise<void> {
    return new Promise((r) => setTimeout(r, 0));
  }

  it('a second badge copy clears the pending timer first', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    initAuditPage(mountShell('<button class="audit-badge-copy" data-snippet="s">c</button>'));
    const btn = document.querySelector('.audit-badge-copy') as HTMLElement;
    btn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    await flush();
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('never copies a badge that carries no snippet', () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    initAuditPage(mountShell('<button class="audit-badge-copy">c</button>'));
    click(document.querySelector('.audit-badge-copy') as HTMLElement);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('ignores badge clicks when there is no clipboard', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    initAuditPage(mountShell('<button class="audit-badge-copy" data-snippet="s">c</button>'));
    click(document.querySelector('.audit-badge-copy') as HTMLElement);
  });
});

describe('steppers', () => {
  const STEPS = '<div><button class="audit-step-btn" aria-expanded="false">1</button>' +
    '<div class="audit-step-body" hidden>body</div></div>';

  it('toggles the body and aria-expanded', () => {
    initAuditPage(mountShell(STEPS));
    const btn = document.querySelector('.audit-step-btn') as HTMLElement;
    const body = document.querySelector('.audit-step-body') as HTMLElement;
    click(btn);
    expect(body.hasAttribute('hidden')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    click(btn);
    expect(body.hasAttribute('hidden')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores clicks outside step buttons', () => {
    initAuditPage(mountShell(STEPS + '<p>plain</p>'));
    click(document.querySelector('p') as HTMLElement);
    expect((document.querySelector('.audit-step-body') as HTMLElement).hasAttribute('hidden')).toBe(true);
  });
});
