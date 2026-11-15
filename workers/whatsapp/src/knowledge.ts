import { en } from '../../../src/i18n/en.ts';
import { es } from '../../../src/i18n/es.ts';
import { contactEmail } from '../../../src/lib/contact-email';
import { formatFoundingLeft } from '../../../src/lib/founding-spots.ts';
import type { Lang } from './lang';

/** The founding offer carries the live count when it is known; a zero count
 *  drops the offer. Undefined keeps the legacy offer with no number. */
export function knowledge(lang: Lang, phone = '', foundingLeft?: number | null): string {
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
  if (foundingLeft !== 0) {
    let founding = '- ' + w.audits.offers.founding.title + ': ' + w.audits.offers.founding.text;
    if (foundingLeft !== null && foundingLeft !== undefined) {
      founding += ' (' + formatFoundingLeft(w.audits.offers.founding.left, foundingLeft) + ')';
    }
    lines.push(founding);
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
      ? 'Una solución agéntica trae 30 días de soporte contados desde la instalación: el código termina en tu repositorio.'
      : 'An agentic solution comes with 30 days of support counted from installation: the code ends up in your repository.'
  );
  lines.push(
    lang === 'es'
      ? 'Dentro de los 6 meses siguientes a la entrega se verifica una vez la corrección de hallazgos críticos y altos: el estado de cada hallazgo actualizado en la página y en el repositorio, con la versión que cerró cada corrección, más el documento actualizado. Cualquier revisión adicional se cobra como horas de consulta.'
      : 'Within 6 months of delivery the fixes to critical and high findings are verified once: the status of each finding updated on the page and in the repository, with the version that closed each fix, plus the updated document. Any further review is billed as consultation hours.'
  );
  lines.push('- ' + w.audits.offers.zenodoNote);
  lines.push(
    lang === 'es'
      ? 'Privacidad: las consultas se responden dentro de los 10 días hábiles siguientes (prorrogables una vez por 5) y los reclamos dentro de los 15 días hábiles siguientes (prorrogables una vez por 8); el borrado se confirma dentro de los 15 días hábiles siguientes.'
      : 'Privacy: requests are answered within 10 business days (extendable once by 5) and claims within 15 business days (extendable once by 8); erasure is confirmed within 15 business days.'
  );
  lines.push(
    lang === 'es'
      ? 'Auditoría privada: el informe, las evidencias, tus datos y el repositorio se eliminan 6 meses después de la entrega, salvo una auditoría con autorización de publicación firmada que aún no se publica, que se conserva hasta que se publique o hasta que el proceso de publicación se cierre. El repositorio pertenece al laboratorio y nunca se transfiere: damos acceso a las cuentas que indiques y guardas tu propia copia antes de la fecha de eliminación.'
      : 'Private audit: the report, the evidence, your data and the repository are deleted 6 months after delivery, except for an audit with a signed publication authorisation that is not yet published, which is kept until it is published or the publication process closes. The repository belongs to the lab and is never transferred: we give access to the accounts you name and you keep your own copy before the deletion date.'
  );
  lines.push(
    lang === 'es'
      ? 'Horario: el laboratorio responde entre las 07:00 y las 19:00, hora de Colombia, en días hábiles; lo que llegue fuera de ese horario se responde el siguiente día hábil.'
      : 'Hours: the lab answers between 07:00 and 19:00 Colombia time on business days; anything arriving outside those hours is answered on the next business day.'
  );
  lines.push(
    lang === 'es'
      ? 'Quejas y reclamos por correo a ' + contactEmail + ': no hay formulario de reclamos. Una solicitud de privacidad que llegue por otro canal se atiende señalando el agente de WhatsApp o el correo, y se tramita a mano.'
      : 'Complaints and claims go by email to ' + contactEmail + ': there is no claims form. A privacy request arriving through another channel is answered by pointing to the WhatsApp agent or the email, and is handled by hand.'
  );
  lines.push(
    lang === 'es'
      ? 'Derecho de retracto: 5 días hábiles desde la reserva cuando reservas con más de cinco días de anticipación, salvo que el servicio ya haya empezado a pedido tuyo (Ley 1480 de 2011, art. 47).'
      : 'Right of retraction: 5 business days from booking when you book more than five days ahead, unless the service has already started at your request (Ley 1480 de 2011, art. 47).'
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
