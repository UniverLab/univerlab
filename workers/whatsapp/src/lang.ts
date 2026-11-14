export type Lang = 'es' | 'en';

export function detectLang(text: string): Lang {
  if (/[ñ¿¡áéíóú]/i.test(text)) return 'es';
  if (/\b(hola|buenas|gracias|precio|cu[aá]nto|quiero|agendar|cita|consulta|qu[eé]|c[oó]mo)\b/i.test(text))
    return 'es';
  if (/\b(hello|hi|hey|price|how|book|want|thanks|session)\b/i.test(text)) return 'en';
  return 'es';
}
