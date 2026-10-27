/**
 * Versiones en español de la política de privacidad y los términos.
 * Mismos `id` y mismo orden que en `legal-en.ts`. El token `{email}` se
 * reemplaza al renderizar con `founderEmail`: el correo nunca se reescribe
 * aquí. Sin marcadores mark de las plantillas.
 */
import type { LegalDoc } from './legal';

export const privacyEs: LegalDoc = {
  title: 'Política de Privacidad — servicios de UniverLab',
  description:
    'Qué registra UniverLab en univerlab.org, graphs, remote y la CLI de canopy: los datos, la finalidad, cuánto duran y los derechos que tienes.',
  kicker: 'Legal',
  heading: 'Política de Privacidad',
  intro:
    'UniverLab opera servicios públicos desde Colombia: este sitio y su canal de anuncios, el catálogo de grafos en graphs.univerlab.org, el relay remoto en remote.univerlab.org y la CLI y el daemon de canopy. Esta página dice qué registra cada uno, con qué fin, cuánto lo conserva y qué derechos tienes. En corto: el sitio no te pide nada, el catálogo solo lee datos públicos de GitHub, y el relay guarda una cookie de sesión de 12 horas y nada más.',
  updatedLabel: 'Última actualización',
  effectiveLabel: 'Vigente desde',
  prevails:
    'UniverLab es un proyecto colombiano y esta página existe en español y en inglés. Si las dos difieren, prevalece la versión en español.',
  credit:
    'Basado en plantillas de General Legal (general.legal), publicadas bajo CC0 1.0, adaptadas a la ley colombiana y a lo que los servicios de UniverLab realmente hacen.',
  sections: [
    {
      id: 'responsible-party',
      title: 'Responsable del tratamiento',
      paras: [
        'El responsable del tratamiento de tus datos (Ley 1581 de 2012) es <strong>UniverLab</strong>, un laboratorio independiente operado desde <strong>Colombia</strong>.',
        'Para ejercer cualquier derecho de esta política, escribe a <a href="mailto:{email}">{email}</a>. Esa dirección llega directo al laboratorio.',
      ],
    },
    {
      id: 'what-we-collect',
      title: 'Qué recogemos, por servicio',
      paras: [
        'Cada servicio recoge solo lo que necesita para funcionar. Nada aquí se usa para publicidad ni mercadeo, nada entrena modelos y nada se vende.',
        '<strong>univerlab.org y el canal de anuncios.</strong> Sin cuentas, sin inicio de sesión, sin cookies de rastreo. Leer las páginas o el canal no deja ningún perfil de ti. Como en todo sitio, las peticiones pasan por la infraestructura del hosting, así que Cloudflare conserva sus propios registros de las conexiones que atiende.',
        '<strong>graphs.univerlab.org.</strong> El catálogo muestra solo repositorios públicos que llevan el tópico <code>canopy-graph</code>: el usuario del dueño, el nombre del repositorio, su descripción, estrellas, fecha de actualización y los documentos de grafos y nodos publicados con sus READMEs.',
        'Lee esos datos de GitHub y guarda copias temporales en Cloudflare solo para servir el catálogo. Un documento o repositorio eliminado de GitHub, o al que le quiten el tópico, sale del catálogo dentro de los 30 minutos siguientes.',
        // Límite superior de 30 minutos frente a TTL en canopy-web apps/graphs/src/github.ts
        // (búsqueda 600 s, documentos 1800 s) y el índice programado previsto cada 15 minutos.
        'Los conteos de instalación registran el documento, una clase de cliente (CLI de canopy, navegador u otro), la versión de canopy, el país que deriva Cloudflare y el resultado. No guardan dirección IP, ni user-agent completo, ni cookie. Los guarda Cloudflare Analytics Engine y se muestran como totales de 90 días.',
        // Totales de 90 días frente a DOWNLOAD_WINDOW_DAYS en canopy-web apps/graphs/src/analytics.ts.
        '<strong>remote.univerlab.org.</strong> Iniciar sesión con GitHub guarda tu id numérico y tu usuario de GitHub en una cookie de sesión firmada que vence a las 12 horas. El token de acceso de GitHub se descarta de inmediato. El relay no almacena nada y solo reenvía la señalización que conecta un navegador con el canopy de su dueño. Las sesiones viajan de par a par, cifradas de extremo a extremo (WebRTC DTLS), con Cloudflare TURN retransmitiendo cifrado cuando falla la ruta directa. Las claves de dispositivo se quedan en el navegador y en el host.',
        // Cookie de 12 horas frente a SESSION_TTL_S en canopy-web apps/remote/worker/src/auth.ts.
        '<strong>CLI y daemon de canopy.</strong> Tus datos se quedan en local, en <code>~/.canopy</code> de tu propia máquina. Los servicios de UniverLab solo reciben contacto cuando los usas: al traer un grafo del catálogo o al emparejar por el relay. Los harnesses de agentes (Claude, Codex y demás) se rigen por los términos de sus propios proveedores.',
        '<strong>Reportes.</strong> Los reportes de errores y del catálogo son issues de GitHub en repositorios públicos: lo que escribas ahí es público bajo los términos de GitHub.',
      ],
    },
    {
      id: 'purposes',
      title: 'Finalidades',
      paras: ['Una línea por servicio:'],
      items: [
        'univerlab.org y el canal: publicar las páginas del laboratorio y su bitácora.',
        'graphs.univerlab.org: servir un catálogo de grafos comunitarios públicos y contar instalaciones en agregado.',
        'remote.univerlab.org: mantener tu sesión 12 horas para que tu navegador alcance tu propio host canopy.',
        'CLI y daemon de canopy: correr tus grafos en tu máquina; contactar servicios de UniverLab solo para la descarga o el emparejamiento que pediste.',
      ],
    },
    {
      id: 'legal-bases',
      title: 'Bases jurídicas',
      paras: [
        'Bajo la Ley 1581 de 2012, tratamos tus datos con estas bases. Para lectores bajo el RGPD, la base equivalente va entre corchetes.',
        'El inicio de sesión es tu autorización: entrar con GitHub autoriza la cookie de sesión de 12 horas [RGPD: consentimiento].',
        'Los datos del catálogo son datos de naturaleza pública publicados por su autor (Ley 1581, artículo 10): repositorios públicos que sus dueños eligieron etiquetar, tratados solo para el catálogo [RGPD: interés legítimo en operar un catálogo público de datos públicos].',
        'El contador de instalaciones es el interés legítimo del laboratorio en estadísticas agregadas y no identificables sobre qué documentos se instalan [RGPD: interés legítimo].',
      ],
    },
    {
      id: 'processors-transfer',
      title: 'Encargados y transferencia internacional',
      paras: [
        'Dos proveedores tratan datos por nuestra cuenta, ambos en Estados Unidos, así que tus datos salen de Colombia cuando usas los servicios:',
      ],
      items: [
        'Cloudflare: hosting, caché, conteos de Analytics Engine y retransmisión TURN.',
        'GitHub: identidad del inicio de sesión y los datos públicos de origen que lee el catálogo.',
      ],
      links: [
        { label: 'Política de privacidad de Cloudflare', href: 'https://www.cloudflare.com/privacypolicy/' },
        { label: 'Política de privacidad de GitHub', href: 'https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement' },
      ],
    },
    {
      id: 'retention',
      title: 'Conservación',
      paras: ['Cuánto dura cada dato anterior:'],
      items: [
        'univerlab.org: sin cuentas ni cookies de rastreo, así que nada tuyo se conserva; Cloudflare guarda sus propios registros bajo su política.',
        // Límite de 30 minutos frente a TTL en canopy-web apps/graphs/src/github.ts (y el índice programado previsto).
        'Copias del catálogo: temporales, refrescadas desde GitHub; lo eliminado sale del catálogo dentro de los 30 minutos siguientes.',
        // 90 días frente a DOWNLOAD_WINDOW_DAYS en canopy-web apps/graphs/src/analytics.ts.
        'Conteos de instalación: totales de 90 días, sin dirección IP, sin user-agent completo y sin cookie detrás.',
        // 12 horas frente a SESSION_TTL_S en canopy-web apps/remote/worker/src/auth.ts.
        'Cookie de sesión del relay: 12 horas y vence; el token de acceso se descarta de inmediato y el relay no almacena nada.',
        'CLI y daemon de canopy: tus datos se quedan en ~/.canopy hasta que los borres.',
      ],
    },
    {
      id: 'rights',
      title: 'Derechos del titular',
      paras: [
        'Como titular tienes los derechos del artículo 8 de la Ley 1581: conocer, actualizar y rectificar tus datos; solicitar prueba de tu autorización; ser informado del uso; revocar tu autorización y pedir la supresión; y reclamar ante la Superintendencia de Industria y Comercio (SIC). El acceso es gratuito.',
        'Bajo el RGPD tienes equivalentemente acceso, rectificación, supresión, limitación, portabilidad y oposición, y puedes retirar el consentimiento en cualquier momento.',
      ],
    },
    {
      id: 'procedure',
      title: 'Cómo ejercerlos',
      paras: [
        'Escríbenos a <a href="mailto:{email}">{email}</a>. Las consultas se responden dentro de los 10 días hábiles siguientes, prorrogables una vez por 5; los reclamos dentro de los 15 días hábiles siguientes, prorrogables una vez por 8 (Ley 1581, artículos 14 y 15).',
        'Los datos del catálogo tienen además un camino corto: el autor retira un documento quitando el tópico <code>canopy-graph</code> o el repositorio, y cualquiera puede reportar un documento abriendo un issue en UniverLab/canopy-web.',
      ],
    },
    {
      id: 'security-children-changes',
      title: 'Seguridad, menores, cambios',
      paras: [
        '<strong>Seguridad.</strong> Los servicios se apoyan en las protecciones de Cloudflare y GitHub, la cookie de sesión firmada y sesiones de relay cifradas de extremo a extremo. Ningún servicio de internet puede garantizar la seguridad, y no debes enviar datos sensibles por reportes o issues, que son públicos.',
        '<strong>Menores.</strong> Los servicios no están dirigidos a menores de 18 años.',
        '<strong>Cambios.</strong> Esta política cambia por revisión fechada: la fecha de arriba se mueve y la vigencia se mueve con ella.',
      ],
    },
  ],
};

export const termsEs: LegalDoc = {
  title: 'Términos de Uso — servicios de UniverLab',
  description:
    'Las reglas para usar los sitios y herramientas de UniverLab: uso aceptable, grafos comunitarios, licencias, garantías, responsabilidad y ley colombiana.',
  kicker: 'Legal',
  heading: 'Términos de Uso',
  intro:
    'Estos términos rigen univerlab.org, el canal de anuncios, el catálogo de grafos, el relay remoto y las herramientas de canopy. Están escritos en lenguaje claro: usa los servicios dentro de la ley, instala grafos comunitarios bajo tu propio criterio, y conoce qué promete y qué no promete UniverLab.',
  updatedLabel: 'Última actualización',
  effectiveLabel: 'Vigente desde',
  prevails:
    'UniverLab es un proyecto colombiano y estos términos existen en español y en inglés. Si las dos versiones difieren, prevalece la versión en español.',
  credit:
    'Basado en plantillas de General Legal (general.legal), publicadas bajo CC0 1.0, adaptadas a la ley colombiana y a lo que los servicios de UniverLab realmente hacen.',
  sections: [
    {
      id: 'using-the-services',
      title: 'Uso de los servicios',
      paras: [
        'UniverLab te concede una licencia limitada, no exclusiva, intransferible y revocable para acceder y usar los servicios con tus propios fines lícitos. Debes tener al menos 18 años.',
        'UniverLab puede modificar, suspender o descontinuar cualquier servicio, o tu acceso a él, en cualquier momento, con o sin aviso. No hay obligación de soporte: los servicios se operan como un laboratorio abierto, no como un producto contratado.',
        'Tu uso también se rige por la <a href="/es/privacy/">Política de Privacidad</a>, que describe qué datos registra cada servicio. Si estos términos y la política difieren sobre datos, manda la política.',
      ],
    },
    {
      id: 'acceptable-use',
      title: 'Uso aceptable',
      paras: ['Al usar los servicios, aceptas no:'],
      items: [
        'Violar la ley, ni usar los servicios para dañar, acosar, engañar o explotar a nadie.',
        'Examinar, perturbar o sobrecargar los servicios: nada de rastrear el catálogo evadiendo sus límites, inundar el relay ni falsificar cookies de sesión.',
        'Suplantar a UniverLab, a sus mantenedores o a otro usuario, ni presentar un grafo comunitario como revisado por el laboratorio.',
        'Publicar contenido ilícito o abusivo en reportes e issues públicos.',
        'Usar los servicios para construir un catálogo o relay competidor copiándolos por completo.',
      ],
    },
    {
      id: 'community-graphs',
      title: 'Grafos y nodos comunitarios',
      paras: [
        'El catálogo de grafos lista documentos comunitarios que UniverLab no revisa. Cada entrada es contenido de terceros: su código, comandos e instrucciones de agente vienen de su autor, no del laboratorio.',
        'Instalar un grafo deja que canopy ejecute sus comandos e instrucciones de agente en tu máquina con tus permisos. Lee un documento antes de instalarlo, como leerías un script antes de pasarlo a la terminal. Eres responsable de lo que instalas y ejecutas.',
        'Cualquiera puede reportar un documento abriendo un issue en el repositorio UniverLab/canopy-web en GitHub. Los mantenedores de UniverLab pueden retirar del catálogo los documentos reportados. Un autor retira el suyo quitando el tópico <code>canopy-graph</code> o el repositorio.',
      ],
    },
    {
      id: 'third-party',
      title: 'Contenido y servicios de terceros',
      paras: [
        'Los servicios dependen de terceros: GitHub para el inicio de sesión y los datos de origen, Cloudflare para hosting, caché, analítica y retransmisión, y los proveedores de harnesses de agentes cuyos modelos corren dentro de canopy. Al usarlos aplican sus propios términos y políticas de privacidad.',
        'Los enlaces y las entradas del catálogo pueden apuntar fuera de UniverLab. No controlamos, respaldamos ni respondemos por el contenido y los servicios de terceros; los usas bajo tu propio riesgo.',
      ],
    },
    {
      id: 'intellectual-property',
      title: 'Propiedad intelectual',
      paras: [
        'Los sitios y su contenido pertenecen a UniverLab o a sus contribuidores; estos términos no te transfieren propiedad alguna. El código abierto sigue bajo las licencias de sus repositorios: los repositorios de plataforma bajo Apache-2.0 y las CLI bajo MIT. Esas licencias, no estos términos, rigen lo que puedes hacer con el código.',
        'Si envías comentarios o sugerencias, concedes a UniverLab una licencia perpetua, mundial y gratuita para usarlos libremente, sin atribución. No envíes nada que consideres confidencial.',
      ],
    },
    {
      id: 'disclaimers',
      title: 'Exclusión de garantías',
      paras: [
        'Los servicios se prestan «tal cual» y «según disponibilidad». En la máxima medida permitida por la ley, UniverLab excluye toda garantía, expresa o implícita, incluidas las de comerciabilidad, idoneidad para un fin, titularidad y no infracción. No garantizamos que los servicios sean ininterrumpidos, libres de errores, seguros o libres de código dañino.',
      ],
    },
    {
      id: 'liability',
      title: 'Limitación de responsabilidad',
      paras: [
        'En la máxima medida permitida por la ley, UniverLab no responde por lucro cesante ni pérdida de datos, costos de sustitutos, ni daños indirectos, incidentales, especiales o consecuenciales derivados de tu uso de los servicios. Nuestra responsabilidad total por cualquier reclamo tiene un tope de USD 50.',
        'Nada en estos términos limita los derechos que la ley de consumo (Ley 1480 de 2011) o la ley de protección de datos declaran irrenunciables.',
      ],
    },
    {
      id: 'termination',
      title: 'Terminación del acceso',
      paras: [
        'Estos términos aplican mientras uses los servicios. UniverLab puede suspender o terminar tu acceso en cualquier momento, incluso cuando considere que violaste estos términos. Las secciones de propiedad intelectual, garantías, responsabilidad y ley aplicable sobreviven a la terminación.',
      ],
    },
    {
      id: 'changes',
      title: 'Cambios a los términos',
      paras: [
        'UniverLab puede actualizar estos términos; los cambios materiales se anuncian y se fechan. Seguir usando los servicios después de un cambio significa que aceptas los términos actualizados. La fecha de arriba siempre muestra la revisión vigente y el día en que empezó a regir.',
      ],
    },
    {
      id: 'general',
      title: 'Disposiciones generales',
      paras: [
        'Estos términos, junto con la Política de Privacidad, son el acuerdo completo entre tú y UniverLab para los servicios. Si alguna disposición es inválida, las demás siguen vigentes; no exigir una disposición no es renunciar a ella.',
        'Estos términos se rigen por las leyes de la República de Colombia, y las disputas van ante sus jueces competentes.',
      ],
    },
  ],
};
