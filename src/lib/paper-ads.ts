// The lab's own advertisements: period notices set in type, never the lead.
// Shapes: the Workbench tall, the audits wide, the install and the
// collaborators small — plus the front page's two duos, the Workbench duo
// (wide, both offers) and the house duo (small, both notices). The install
// commands are read from the experiments registry, never hardcoded.

import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { experiments } from './experiments';

export type PaperAdLang = 'en' | 'es';
export type PaperAdId = 'workbench' | 'audits' | 'install' | 'collab';

type Dict = (typeof en)['today'];

const dict = (lang: PaperAdLang): Dict => (lang === 'es' ? es.today : en.today);

const prefix = (lang: PaperAdLang): string => (lang === 'es' ? '/es' : '');

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The one-line install command of a shipped tool, as the registry serves it. */
function installCmd(id: string): string {
  return experiments.find((e) => e.id === id)?.install?.unix ?? '';
}

const shapeOf = (id: PaperAdId): string =>
  id === 'audits' ? 'feature' : id === 'workbench' ? 'tall' : 'small';

/** A period display advertisement: the kicker, one large display line, the
 *  copy at two weights and the close — the tail over its rule, then the
 *  boxed call to action last. Sized to its content, with no inner blank. */
function frame(
  lang: PaperAdLang,
  id: PaperAdId,
  head: string,
  copy: string,
  close: string,
): string {
  const t = dict(lang);
  return (
    `<aside class="ad ad--${shapeOf(id)}" aria-label="${esc(t.ads.label)}">` +
    `<p class="kicker">${esc(t.ads.label)}</p>` +
    `<h3 class="ad-display">${esc(head)}</h3>` +
    `<div class="ad-copy">${copy}</div>` +
    `<div class="ad-close">${close}</div></aside>`
  );
}

function closeHtml(tail: string, href: string, link: string): string {
  const tailHtml = tail ? `<p class="ad-tail">${esc(tail)}</p>` : '';
  return tailHtml + `<a class="ad-cta" href="${esc(href)}">${esc(link)}</a>`;
}

function linesHtml(lines: ReadonlyArray<string>): string {
  return lines
    .map((l, i) => `<p class="${i === 0 ? 'ad-line--lead' : 'ad-line'}">${esc(l)}</p>`)
    .join('');
}

/** One advertisement as HTML. Every ad links only to a real lab offering. */
export function paperAdHtml(lang: PaperAdLang, id: PaperAdId): string {
  const t = dict(lang);
  const p = prefix(lang);
  if (id === 'workbench') {
    const a = t.ads.workbench;
    return frame(
      lang,
      id,
      a.head,
      linesHtml(a.lines),
      closeHtml(a.tail, `${p}/workbench/`, a.link),
    );
  }
  if (id === 'audits') {
    const a = t.ads.audits;
    return frame(
      lang,
      id,
      a.head,
      linesHtml(a.lines),
      closeHtml(a.tail, `${p}/workbench/audits/`, a.link),
    );
  }
  if (id === 'install') {
    const a = t.ads.install;
    const canopy = installCmd('canopy');
    const facet = installCmd('facetmedia');
    return frame(
      lang,
      id,
      a.head,
      `<p class="cmd ad-line--lead"><a href="${p}/canopy/">${esc(a.cmd1)}</a><code>${esc(canopy)}</code></p>` +
        `<p class="cmd ad-line"><a href="${p}/facetmedia/">${esc(a.cmd2)}</a><code>${esc(facet)}</code></p>`,
      closeHtml('', `${p}/canopy/`, a.link),
    );
  }
  const a = t.ads.collab;
  return frame(
    lang,
    id,
    a.head,
    linesHtml(a.lines),
    closeHtml(a.tail, `${p}/contributors/`, a.link),
  );
}

/** Every advertisement as HTML, in reading order. */
export function paperAdsHtml(lang: PaperAdLang): string {
  const ids: PaperAdId[] = ['workbench', 'audits', 'install', 'collab'];
  return ids.map((id) => paperAdHtml(lang, id)).join('');
}

/** The front page's single Workbench display: one advertisement carrying both
 *  offers — the free first call and the audits — each with its own link. It
 *  takes the audits display's full-bleed place under the lead. */
export function paperWorkbenchDuoHtml(lang: PaperAdLang): string {
  const t = dict(lang);
  const p = prefix(lang);
  const wb = t.ads.workbench;
  const au = t.ads.audits;
  return frame(
    lang,
    'audits',
    wb.head,
    linesHtml([...wb.lines, ...au.lines]),
    closeHtml(wb.tail, `${p}/workbench/`, wb.link) +
      closeHtml(au.tail, `${p}/workbench/audits/`, au.link),
  );
}

/** The two square house notices merged into one: the lab's machines and the
 *  call for correspondents, each with its own link. */
export function paperHouseDuoHtml(lang: PaperAdLang): string {
  const t = dict(lang);
  const p = prefix(lang);
  const inst = t.ads.install;
  const co = t.ads.collab;
  const canopy = installCmd('canopy');
  const facet = installCmd('facetmedia');
  return frame(
    lang,
    'install',
    inst.head,
    `<p class="cmd ad-line--lead"><a href="${p}/canopy/">${esc(inst.cmd1)}</a><code>${esc(canopy)}</code></p>` +
      `<p class="cmd ad-line"><a href="${p}/facetmedia/">${esc(inst.cmd2)}</a><code>${esc(facet)}</code></p>` +
      linesHtml(co.lines),
    closeHtml('', `${p}/canopy/`, inst.link) +
      closeHtml(co.tail, `${p}/contributors/`, co.link),
  );
}

const abs = (lang: PaperAdLang): string =>
  lang === 'es' ? 'https://univerlab.org/es' : 'https://univerlab.org';

/** The twin's advertisements: the Workbench duo as one short labelled line
 *  with both links, then the house lines matching the page's footing — one
 *  merged line, or the two notices apart. */
export function paperAdsMarkdown(lang: PaperAdLang, house: 'split' | 'merged' = 'split'): string {
  const t = dict(lang);
  const b = abs(lang);
  const wb = t.ads.workbench;
  const au = t.ads.audits;
  const co = t.ads.collab;
  const inst = t.ads.install;
  const lines = [
    `*${t.ads.label} — [${wb.head}](${b}/workbench/): ${wb.lines[0]} · [${au.head}](${b}/workbench/audits/): ${au.lines[0]}*`,
  ];
  if (house === 'split') {
    lines.push(
      `*${t.ads.label} — [${inst.head}](${b}/canopy/): ${inst.cmd1}: ${installCmd('canopy')} · [${inst.cmd2}](${b}/facetmedia/): ${installCmd('facetmedia')}*`,
      `*${t.ads.label} — [${co.head}](${b}/contributors/): ${co.lines[0]}*`,
    );
  } else {
    lines.push(
      `*${t.ads.label} — [${inst.head}](${b}/canopy/): ${inst.cmd1}: ${installCmd('canopy')} · [${co.head}](${b}/contributors/): ${co.lines[0]}*`,
    );
  }
  return lines.join('\n');
}
