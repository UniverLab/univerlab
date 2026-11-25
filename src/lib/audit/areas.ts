// Localised labels for finding `area` ids. Areas are kebab-case ids in the
// contract (`host-exposure`, `access-control`); the pages show words in the
// edition's language. Unknown ids show the raw id so a half translation
// never ships.
const EN: Record<string, string> = {
  'host-exposure': 'Host exposure',
  authentication: 'Authentication',
  authorization: 'Authorization',
  'access-control': 'Access control',
  secrets: 'Secrets',
  configuration: 'Configuration',
  injection: 'Injection',
  'supply-chain': 'Supply chain',
};

const ES: Record<string, string> = {
  'host-exposure': 'Exposición de hosts',
  authentication: 'Autenticación',
  authorization: 'Autorización',
  'access-control': 'Control de acceso',
  secrets: 'Secretos',
  configuration: 'Configuración',
  injection: 'Inyección',
  'supply-chain': 'Cadena de suministro',
};

/** Words for one kebab-case area id in the edition's language. Pure. */
export function areaLabel(area: string, lang: 'es' | 'en'): string {
  const hit = (lang === 'es' ? ES : EN)[area];
  if (hit) return hit;
  return area;
}
