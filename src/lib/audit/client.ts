// Browser behaviour for an audit page: glossary terms, reference back
// links, the findings-table filters, the stepper, charts (Vega-Lite),
// diagrams (Mermaid), code highlighting and animation videos. The heavy
// libraries load only when the page actually uses them.
import { esc } from './escape';
import { COPY_DONE_MS, setCopyState } from '../copy-morph';

function readData(): { slug: string; lang: string } | null {
  const el = document.getElementById('audit-data');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || '') as { slug: string; lang: string };
  } catch {
    return null;
  }
}

function toggleTerm(term: Element | null): void {
  const def = term?.querySelector('.audit-term-def');
  if (def) def.toggleAttribute('hidden');
}

function wireTerms(root: ParentNode): void {
  root.addEventListener('click', (ev) => {
    toggleTerm((ev.target as Element).closest?.('.audit-term') ?? null);
  });
  root.addEventListener('keydown', (ev) => {
    const key = (ev as KeyboardEvent).key;
    if (key !== 'Enter' && key !== ' ') return;
    const term = (ev.target as Element).closest?.('.audit-term');
    if (!term) return;
    ev.preventDefault();
    toggleTerm(term);
  });
}

function wireBack(root: ParentNode): void {
  let returnTo: string | null = null;
  root.addEventListener('click', (ev) => {
    const ref = (ev.target as Element).closest?.('.audit-ref');
    if (ref) {
      const href = ref.getAttribute('href') || '';
      if (href.startsWith('#')) returnTo = href;
      return;
    }
    if (!(ev.target as Element).closest?.('.audit-back')) return;
    ev.preventDefault();
    if (returnTo && returnTo !== window.location.hash) {
      const target = returnTo;
      returnTo = null;
      window.location.hash = target;
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.scrollTo({ top: 0 });
    }
  });
}

function auditFilterValues(raw: string | null): string[] {
  return (raw || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function auditFilterMatch(values: string[], actual: string | null): boolean {
  return values.length === 0 || values.includes('all') || values.includes(actual || '');
}

function wireTables(root: ParentNode): void {
  const apply = (box: Element): void => {
    const sev = auditFilterValues(box.getAttribute('data-sev'));
    const st = auditFilterValues(box.getAttribute('data-status'));
    box.querySelectorAll('tbody tr').forEach((tr) => {
      const ok = auditFilterMatch(sev, tr.getAttribute('data-severity')) && auditFilterMatch(st, tr.getAttribute('data-status'));
      (tr as HTMLElement).hidden = !ok;
    });
  };
  root.addEventListener('click', (ev) => {
    const btn = (ev.target as Element).closest?.('button[data-sev], button[data-status]');
    if (!btn) return;
    const box = btn.closest('.audit-findingsTable');
    if (!box) return;
    if (btn.hasAttribute('data-sev')) {
      box.setAttribute('data-sev', btn.getAttribute('data-sev') || 'all');
      box.querySelectorAll('button[data-sev]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b === btn)),
      );
    } else {
      box.setAttribute('data-status', btn.getAttribute('data-status') || 'all');
      box.querySelectorAll('button[data-status]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b === btn)),
      );
    }
    apply(box);
  });
  root.querySelectorAll('.audit-findingsTable').forEach(apply);
}

function wireSteppers(root: ParentNode): void {
  root.addEventListener('click', (ev) => {
    const btn = (ev.target as Element).closest?.('.audit-step-btn');
    if (!btn) return;
    const body = btn.parentElement?.querySelector('.audit-step-body');
    if (!body) return;
    const open = body.toggleAttribute('hidden');
    btn.setAttribute('aria-expanded', String(!open));
  });
}

async function wireCharts(root: ParentNode): Promise<void> {
  const figs = Array.from(root.querySelectorAll('.audit-chart[data-spec]'));
  if (!figs.length) return;
  const [{ default: vegaEmbed }, vl] = await Promise.all([
    import('vega-embed'),
    import('vega-lite'),
  ]);
  await Promise.all(
    figs.map(async (fig) => {
      try {
        const spec = JSON.parse(fig.getAttribute('data-spec') || '{}') as Record<string, unknown>;
        const url = fig.getAttribute('data-url');
        if (url) {
          const res = await fetch(url);
          if (!res.ok) return;
          spec['data'] = { values: await res.json() };
        }
        const vgSpec = (vl as { compile: (s: unknown) => { spec: unknown } }).compile(spec).spec;
        const mount = fig.querySelector('.audit-chart-mount');
        if (mount) await vegaEmbed(mount as HTMLElement, vgSpec as never, { actions: false, renderer: 'svg' });
      } catch {
        /* the static fallback text stays in place */
      }
    }),
  );
}

async function wireDiagrams(root: ParentNode): Promise<void> {
  const figs = Array.from(root.querySelectorAll('.audit-diagram[data-mermaid]'));
  if (!figs.length) return;
  const night = document.documentElement.dataset['benchTheme'] === 'night';
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: night ? 'dark' : 'default' });
  await Promise.all(
    figs.map(async (fig, i) => {
      try {
        const src = fig.getAttribute('data-mermaid') || '';
        const mount = fig.querySelector('.audit-diagram-mount');
        if (!mount) return;
        const { svg } = await mermaid.render(`audit-mermaid-${i}`, src);
        mount.innerHTML = svg;
      } catch {
        /* the empty mount stays; the caption still describes the figure */
      }
    }),
  );
}

async function wireCode(root: ParentNode): Promise<void> {
  const blocks = Array.from(root.querySelectorAll('.audit-code'));
  if (!blocks.length) return;
  const { default: hljs } = await import('highlight.js');
  const timers = new WeakMap<Element, ReturnType<typeof globalThis.setTimeout>>();
  root.addEventListener('click', (ev) => {
    const btn = (ev.target as Element).closest?.('.audit-code-copy');
    if (!(btn instanceof HTMLElement)) return;
    const code = btn.parentElement?.querySelector('code');
    if (!code || !navigator.clipboard) return;
    const pending = timers.get(btn);
    if (pending !== undefined) globalThis.clearTimeout(pending);
    navigator.clipboard
      .writeText(code.textContent || '')
      .then(() => {
        setCopyState(btn, true);
        timers.set(
          btn,
          globalThis.setTimeout(() => {
            timers.delete(btn);
            setCopyState(btn, false);
          }, COPY_DONE_MS),
        );
      })
      .catch(() => {});
  });
  await Promise.all(
    blocks.map(async (block) => {
      const code = block.querySelector('code');
      if (!code) return;
      try {
        let src = code.getAttribute('data-inline') || '';
        const dataSrc = code.getAttribute('data-src');
        if (dataSrc) {
          const res = await fetch(dataSrc);
          if (!res.ok) return;
          src = await res.text();
        }
        const lang = code.getAttribute('data-lang') || 'text';
        let html: string;
        try {
          html = hljs.highlight(src, { language: lang }).value;
        } catch {
          html = esc(src);
        }
        const hl = (code.getAttribute('data-highlight') || '')
          .split(',')
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isInteger(n) && n >= 1);
        const lines = html.split('\n');
        code.innerHTML = lines
          .map((line, i) => (hl.includes(i + 1) ? `<span class="is-hl">${line || ' '}</span>` : `<span>${line || ' '}</span>`))
          .join('\n');
        code.classList.add(`language-${lang}`);
      } catch {
        /* the escaped inline source stays in place */
      }
    }),
  );
}

function wireVideos(root: ParentNode): void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  root.querySelectorAll('video[data-autoplay]').forEach((v) => {
    (v as HTMLVideoElement).play?.().catch(() => {});
  });
}

export function initAuditPage(root: ParentNode = document): void {
  if (!readData()) return;
  wireTerms(root);
  wireBack(root);
  wireTables(root);
  wireSteppers(root);
  void wireCharts(root).catch(() => {});
  void wireDiagrams(root).catch(() => {});
  void wireCode(root).catch(() => {});
  wireVideos(root);
}
