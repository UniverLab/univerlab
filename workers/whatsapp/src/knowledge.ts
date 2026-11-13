import { en } from '../../../src/i18n/en.ts';
import { es } from '../../../src/i18n/es.ts';
import type { Lang } from './lang';

export function knowledge(lang: Lang, phone = ''): string {
  const d = lang === 'es' ? es : en;
  const w = d.workbench;
  const co = phone.replace(/\D/g, '').startsWith('57');
  const lines: string[] = [];
  lines.push('# UniverLab');
  lines.push('univerlab.org — ' + w.intro);
  lines.push('## ' + w.head);
  lines.push('### ' + w.who.kicker);
  for (const [title, body] of w.who.items) lines.push('- ' + title + ': ' + body);
  lines.push('### ' + w.tags.kicker);
  for (const [title, price, note, body] of w.tags.items) lines.push('- ' + title + ' · ' + (co && note ? note : price) + ': ' + body);
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
  lines.push('### ' + w.audits.how.kicker);
  for (const [title, body] of w.audits.how.steps) lines.push('- ' + title + ': ' + body);
  lines.push(w.audits.not.kicker + ': ' + w.audits.not.text);
  for (const para of w.audits.impl.paras) lines.push(para);
  lines.push(co ? w.audits.price.cop : w.audits.price.text);
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
  lines.push('## ' + (lang === 'es' ? 'Soporte, verificación y publicación' : 'Support, verification and publishing'));
  lines.push(
    lang === 'es'
      ? 'Un flujo agéntico trae 30 días de soporte: el código termina en tu repositorio.'
      : 'An agentic flow comes with 30 days of support: the code ends up in your repository.'
  );
  lines.push(
    lang === 'es'
      ? 'Dentro de los 60 días siguientes a la entrega se verifican las correcciones a hallazgos críticos y altos, registrada en la página con la versión que corrigió cada uno.'
      : 'Within 60 days of delivery the fixes to critical and high findings are verified, recorded on the page with the version that fixed each one.'
  );
  lines.push('- ' + w.audits.offers.zenodoNote);
  lines.push(
    lang === 'es'
      ? 'Privacidad: las consultas se responden dentro de los 10 días hábiles siguientes (prorrogables una vez por 5) y los reclamos dentro de los 15 días hábiles siguientes (prorrogables una vez por 8); el borrado se confirma dentro de los 15 días hábiles siguientes.'
      : 'Privacy: requests are answered within 10 business days (extendable once by 5) and claims within 15 business days (extendable once by 8); erasure is confirmed within 15 business days.'
  );
  lines.push('## ' + (lang === 'es' ? 'Herramientas abiertas: documentación e issues' : 'Open tools: docs and issues'));
  for (const id of ['canopy', 'texforge', 'gitkit', 'ghscaff', 'facetmedia', 'demostage']) {
    const tagline = (d.experiments as Record<string, { tagline: string }>)[id]?.tagline ?? id;
    const docs = 'https://univerlab.org' + (lang === 'es' ? '/es/' : '/') + id + '/';
    lines.push('- ' + id + ': docs ' + docs + ' · issues https://github.com/UniverLab/' + id + '/issues — ' + tagline);
  }
  lines.push('## ' + (lang === 'es' ? 'Contacto' : 'Contact'));
  lines.push('https://univerlab.org' + (lang === 'es' ? '/es' : '') + '/workbench/');
  return lines.join('\n');
}
