// The lab's own advertisements: period notices set in type, never the lead.
// Four shapes: the Workbench tall, the audits wide, the install and the
// collaborators small. The install commands are read from the experiments
// registry, never hardcoded.

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
  id === 'workbench' ? 'tall' : id === 'audits' ? 'wide' : 'small';

function frame(
  lang: PaperAdLang,
  id: PaperAdId,
  head: string,
  inner: string,
  href: string,
  link: string,
): string {
  const t = dict(lang);
  return (
    `<aside class="ad ad--${shapeOf(id)}" aria-label="${esc(t.ads.label)}">` +
    `<p class="kicker">${esc(t.ads.label)}</p>` +
    `<h3>${esc(head)}</h3>` +
    inner +
    `<a href="${esc(href)}">${esc(link)}</a></aside>`
  );
}

function linesHtml(lines: ReadonlyArray<string>): string {
  return lines.map((l) => `<p class="ad-line">${esc(l)}</p>`).join('');
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
      linesHtml(a.lines) + `<p class="tail">${esc(a.tail)}</p>`,
      `${p}/workbench/`,
      a.link,
    );
  }
  if (id === 'audits') {
    const a = t.ads.audits;
    return frame(
      lang,
      id,
      a.head,
      linesHtml(a.lines) + `<p class="tail">${esc(a.tail)}</p>`,
      `${p}/workbench/audits/`,
      a.link,
    );
  }
  if (id === 'install') {
    const a = t.ads.install;
    const canopy = installCmd('canopy');
    const facet = installCmd('facetmedia');
    return (
      `<aside class="ad ad--small" aria-label="${esc(t.ads.label)}">` +
      `<p class="kicker">${esc(t.ads.label)}</p>` +
      `<h3>${esc(a.head)}</h3>` +
      `<p class="cmd"><a href="${p}/canopy/">${esc(a.cmd1)}</a><code>${esc(canopy)}</code></p>` +
      `<p class="cmd"><a href="${p}/facetmedia/">${esc(a.cmd2)}</a><code>${esc(facet)}</code></p>` +
      `<a href="${p}/canopy/">${esc(a.link)}</a></aside>`
    );
  }
  const a = t.ads.collab;
  return frame(
    lang,
    id,
    a.head,
    linesHtml(a.lines) + `<p class="tail">${esc(a.tail)}</p>`,
    `${p}/contributors/`,
    a.link,
  );
}

/** Every advertisement as HTML, in reading order. */
export function paperAdsHtml(lang: PaperAdLang): string {
  const ids: PaperAdId[] = ['workbench', 'audits', 'install', 'collab'];
  return ids.map((id) => paperAdHtml(lang, id)).join('');
}

const abs = (lang: PaperAdLang): string =>
  lang === 'es' ? 'https://univerlab.org/es' : 'https://univerlab.org';

/** The twin's advertisements: one short labelled line with links per ad. */
export function paperAdsMarkdown(lang: PaperAdLang): string {
  const t = dict(lang);
  const b = abs(lang);
  const wb = t.ads.workbench;
  const au = t.ads.audits;
  const co = t.ads.collab;
  const inst = t.ads.install;
  return [
    `*${t.ads.label} — [${wb.head}](${b}/workbench/): ${wb.lines[0]}*`,
    `*${t.ads.label} — [${au.head}](${b}/workbench/audits/): ${au.lines[0]}*`,
    `*${t.ads.label} — [${inst.head}](${b}/canopy/): ${inst.cmd1}: ${installCmd('canopy')} · [${inst.cmd2}](${b}/facetmedia/): ${installCmd('facetmedia')}*`,
    `*${t.ads.label} — [${co.head}](${b}/contributors/): ${co.lines[0]}*`,
  ].join('\n');
}
