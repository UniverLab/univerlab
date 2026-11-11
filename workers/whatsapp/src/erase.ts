import type { Lang } from './lang';

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .trim();
}

export function deletionRequest(text: string): Lang | null {
  const n = normalize(text);
  if (n === 'borrar mis datos') return 'es';
  if (n === 'delete my data') return 'en';
  return null;
}

export function retentionDeadline(ms: number): number {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + 6);
  return d.getTime();
}

export function alarmAt(sec: number, now: number = Date.now()): number {
  return retentionDeadline(sec > 0 ? sec * 1000 : now);
}

export const ERASED: Record<Lang, string> = {
  es: 'Listo: borré tus mensajes, el estado de tu conversación y las notas guardadas. Lo que ya enviaste sigue en tu propio WhatsApp.',
  en: 'Done: I deleted your messages, your conversation state and the stored notes. What you already sent stays in your own WhatsApp.',
};

export function operatorErased(phone: string): string {
  return (
    'UniverLab · +' +
    phone +
    ' borró sus datos: se eliminaron sus mensajes, el estado y las notas. Por favor elimina también su chat de este WhatsApp.'
  );
}
