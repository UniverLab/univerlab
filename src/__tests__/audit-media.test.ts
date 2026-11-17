// The audit media layers: charts (Vega-Lite), diagrams (Mermaid), code
// (highlight.js) and autoplay videos. The heavy libraries only load when the
// page uses them, so they are mocked here; fetch is mocked per test. Static
// fallbacks survive every failure path.
jest.mock('../lib/copy-morph', () => ({ COPY_DONE_MS: 50, setCopyState: jest.fn() }));
jest.mock('vega-embed', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('vega-lite', () => ({ __esModule: true, compile: jest.fn() }), { virtual: true });
jest.mock('mermaid', () => ({ __esModule: true, default: { initialize: jest.fn(), run: jest.fn() } }), { virtual: true });

import vegaEmbed from 'vega-embed';
import { compile } from 'vega-lite';
import mermaid from 'mermaid';
import { setCopyState } from '../lib/copy-morph';
import { initAuditPage } from '../lib/audit/client';

const vegaEmbedMock = vegaEmbed as unknown as jest.Mock;
const compileMock = compile as unknown as jest.Mock;
const runMock = (mermaid as unknown as { run: jest.Mock }).run;
const initMock = (mermaid as unknown as { initialize: jest.Mock }).initialize;

function mount(inner: string): HTMLElement {
  document.body.innerHTML =
    '<script id="audit-data" type="application/json">{"slug":"s","lang":"en"}</script>' +
    `<div id="scope">${inner}</div>`;
  return document.getElementById('scope') as HTMLElement;
}

function flush(times = 4): Promise<void> {
  let p: Promise<void> = Promise.resolve();
  for (let i = 0; i < times; i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-bench-theme');
  jest.clearAllMocks();
  compileMock.mockReturnValue({ spec: { compiled: true } });
  vegaEmbedMock.mockResolvedValue(undefined);
  runMock.mockResolvedValue(undefined);
});

describe('charts', () => {
  const CHART = '<figure class="audit-chart" data-spec=\'{"mark":"bar"}\'>' +
    '<div class="audit-chart-mount"></div><figcaption>static fallback</figcaption></figure>';

  it('compiles the inline spec and embeds it', async () => {
    initAuditPage(mount(CHART));
    await flush();
    expect(compileMock).toHaveBeenCalledWith({ mark: 'bar' });
    expect(vegaEmbedMock).toHaveBeenCalledTimes(1);
    const mountEl = document.querySelector('.audit-chart-mount');
    expect(vegaEmbedMock.mock.calls[0]?.[0]).toBe(mountEl);
  });

  it('fetches a data-url into the spec before compiling', async () => {
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ x: 1 }],
    });
    initAuditPage(mount(CHART.replace('data-spec=', 'data-url="/d.json" data-spec=')));
    await flush();
    expect(compileMock).toHaveBeenCalledWith({ mark: 'bar', data: { values: [{ x: 1 }] } });
    expect(vegaEmbedMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the static fallback when the data-url fails', async () => {
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue({ ok: false });
    initAuditPage(mount(CHART.replace('data-spec=', 'data-url="/d.json" data-spec=')));
    await flush();
    expect(vegaEmbedMock).not.toHaveBeenCalled();
    expect(document.querySelector('figcaption')?.textContent).toBe('static fallback');
  });

  it('loads nothing when the page has no charts', async () => {
    initAuditPage(mount('<p>no charts</p>'));
    await flush();
    expect(compileMock).not.toHaveBeenCalled();
    expect(vegaEmbedMock).not.toHaveBeenCalled();
  });
});

describe('diagrams', () => {
  const DIAGRAM = '<figure class="audit-diagram" data-mermaid="graph TD;A-->B">' +
    '<div class="audit-diagram-mount"></div><figcaption>caption</figcaption></figure>';

  it('hands the mount with the source as text to mermaid.run', async () => {
    initAuditPage(mount(DIAGRAM));
    await flush();
    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'default' }));
    const mountEl = document.querySelector('.audit-diagram-mount') as HTMLElement;
    expect(mountEl.textContent).toBe('graph TD;A-->B');
    expect(runMock).toHaveBeenCalledWith({ nodes: [mountEl], suppressErrors: true });
  });

  it('keeps a hostile diagram source as text, never markup', async () => {
    initAuditPage(mount(DIAGRAM.replace('graph TD;A-->B', '&lt;img src=x onerror=alert(1)&gt;')));
    await flush();
    const mountEl = document.querySelector('.audit-diagram-mount') as HTMLElement;
    expect(mountEl.querySelector('img')).toBeNull();
    expect(mountEl.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(runMock).toHaveBeenCalledWith({ nodes: [mountEl], suppressErrors: true });
  });

  it('uses the dark theme on a night bench and survives run failure', async () => {
    document.documentElement.dataset['benchTheme'] = 'night';
    runMock.mockRejectedValueOnce(new Error('bad diagram'));
    initAuditPage(mount(DIAGRAM));
    await flush();
    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
    expect((document.querySelector('.audit-diagram-mount') as HTMLElement).textContent).toBe('graph TD;A-->B');
  });
});

describe('code', () => {
  const CODE = (code: string): string =>
    `<pre class="audit-code">${code}</pre>`;

  it('renders plain-text lines and marks highlighted lines', async () => {
    initAuditPage(mount(CODE('<code data-inline="a\nb" data-lang="ts" data-highlight="2">a\nb</code>')));
    await flush();
    const el = document.querySelector('.audit-code code') as HTMLElement;
    expect(el.textContent).toBe('a\nb');
    expect(el.querySelectorAll('.is-hl')).toHaveLength(1);
    expect(el.querySelector('.is-hl')?.textContent).toBe('b');
    expect(el.classList.contains('language-ts')).toBe(true);
  });

  it('keeps a hostile inline payload as literal text', async () => {
    initAuditPage(mount(CODE('<code data-inline="&lt;img src=x onerror=alert(1)&gt;" data-lang="ts">x</code>')));
    await flush();
    const el = document.querySelector('.audit-code code') as HTMLElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('keeps fetched source as text, never markup', async () => {
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<b>fetched</b>',
    });
    initAuditPage(mount(CODE('<code data-src="/s.ts" data-lang="ts">inline</code>')));
    await flush();
    const el = document.querySelector('.audit-code code') as HTMLElement;
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toBe('<b>fetched</b>');
  });

  it('keeps the inline source when the data-src fetch fails', async () => {
    (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockResolvedValue({ ok: false });
    initAuditPage(mount(CODE('<code data-src="/s.ts" data-lang="ts">inline</code>')));
    await flush();
    expect((document.querySelector('.audit-code code') as HTMLElement).textContent).toBe('inline');
  });

  it('copies the row code and ignores a bad highlight list', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    initAuditPage(mount(CODE('<code data-inline="x" data-lang="ts" data-highlight="oops">x</code>') +
      '<div><button class="audit-code-copy">copy</button><code>row</code></div>'));
    await flush();
    (document.querySelector('.audit-code-copy') as HTMLElement).dispatchEvent(
      new Event('click', { bubbles: true, cancelable: true }));
    await flush();
    expect(writeText).toHaveBeenCalledWith('row');
    expect(setCopyState).toHaveBeenCalled();
  });
});

describe('videos and badge copy', () => {
  it('autoplays animation videos unless reduced motion is on', () => {
    const play = jest.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.play = play;
    (window as unknown as { matchMedia?: unknown })['matchMedia'] = () => ({ matches: false });
    initAuditPage(mount('<video data-autoplay src="a.mp4"></video>'));
    expect(play).toHaveBeenCalled();
    play.mockClear();
    (window as unknown as { matchMedia?: unknown })['matchMedia'] = () => ({ matches: true });
    initAuditPage(mount('<video data-autoplay src="a.mp4"></video>'));
    expect(play).not.toHaveBeenCalled();
    delete (window as unknown as { matchMedia?: unknown })['matchMedia'];
  });

  it('copies the badge snippet on click', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    initAuditPage(mount('<button class="audit-badge-copy" data-snippet="badge!">copy</button>'));
    (document.querySelector('.audit-badge-copy') as HTMLElement).dispatchEvent(
      new Event('click', { bubbles: true, cancelable: true }));
    await flush();
    expect(writeText).toHaveBeenCalledWith('badge!');
    expect(setCopyState).toHaveBeenCalled();
  });
});
