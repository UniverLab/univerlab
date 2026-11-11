import { en } from '../../../src/i18n/en.ts';
import { es } from '../../../src/i18n/es.ts';
import type { Lang } from './lang';

export function knowledge(lang: Lang): string {
  const d = lang === 'es' ? es : en;
  const w = d.workbench;
  const lines: string[] = [];
  lines.push('# UniverLab');
  lines.push('univerlab.org — ' + w.intro);
  lines.push('## ' + w.head);
  lines.push('### ' + w.who.kicker);
  for (const [title, body] of w.who.items) lines.push('- ' + title + ': ' + body);
  lines.push('### ' + w.tags.kicker);
  for (const [title, price, body] of w.tags.items) lines.push('- ' + title + ' · ' + price + ': ' + body);
  lines.push('### ' + w.how.kicker);
  for (const [title, body] of w.how.steps) lines.push('- ' + title + ': ' + body);
  lines.push('### ' + w.policy.kicker);
  for (const item of w.policy.items) lines.push('- ' + item);
  lines.push('### ' + w.audits.head);
  lines.push(w.audits.lede);
  lines.push('### ' + w.audits.scope.kicker);
  for (const [title, body] of w.audits.scope.items) lines.push('- ' + title + ': ' + body);
  lines.push('### ' + w.audits.deliver.kicker);
  for (const [title, body] of w.audits.deliver.items) lines.push('- ' + title + ': ' + body);
  for (const para of w.audits.impl.paras) lines.push(para);
  lines.push(w.audits.price.text);
  lines.push('### ' + w.audits.offers.kicker);
  if (w.audits.offers.founding.spots > 0) {
    lines.push('- ' + w.audits.offers.founding.title + ': ' + w.audits.offers.founding.text);
  }
  lines.push('- ' + w.audits.offers.public.title + ': ' + w.audits.offers.public.text);
  lines.push('- ' + w.audits.offers.reaudit.title + ': ' + w.audits.offers.reaudit.text);
  for (const rule of w.audits.offers.rules) lines.push('- ' + rule);
  lines.push('### ' + w.money.kicker);
  lines.push(w.money.text);
  lines.push('### ' + w.principles.kicker);
  for (const item of w.principles.items) lines.push('- ' + item);
  lines.push('## ' + (lang === 'es' ? 'Experimentos del laboratorio' : 'The lab’s experiments'));
  for (const id of Object.keys(d.experiments)) {
    lines.push('- ' + id + ': ' + (d.experiments as Record<string, { tagline: string }>)[id].tagline);
  }
  lines.push('## ' + (lang === 'es' ? 'Contacto' : 'Contact'));
  lines.push('https://univerlab.org' + (lang === 'es' ? '/es' : '') + '/workbench/');
  return lines.join('\n');
}
