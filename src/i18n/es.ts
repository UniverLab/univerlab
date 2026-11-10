import type { Dict } from './en';

/** Copy en español. Misma forma que `en`. La documentación que se extrae de
 *  los repositorios permanece solo en inglés. */
import { experiments } from './es-experiments.ts';

export const es: Dict = {
  meta: {
    // 54 chars: "de código abierto" is the site's own term for open-source
    // (hero h1, description) — "abiertas" alone does not say open-source, and
    // the literal "Herramientas CLI de código abierto …" is 67 chars, so the
    // noun goes and the topics stay, mirroring the English title's shape.
    title: 'CLI de código abierto para LaTeX, git, CAD — UniverLab',
    description:
      'Herramientas CLI de código abierto para LaTeX, git, CAD y agentes de IA — un binario cada una, instalables hoy, reproducibles, con docs junto al código.',
  },
  nav: {
    experiments: 'Experimentos',
    manifesto: 'Manifiesto',
    people: 'Colaboradores',
    github: 'GitHub',
    sponsors: 'sponsor',
    log: 'Estado',
    api: 'API',
    archive: 'Archivo',
    roadmap: 'Hoja de ruta',
  },
  header: {
    skyToNight: 'Cambiar al tema de noche',
    skyToDay: 'Cambiar al tema de día',
    switchTo: 'Cambiar a',
    langLabel: { en: 'English', es: 'Español' },
    // El buzón al final de la regla del encabezado y las cartas que reparte.
    mailbox: {
      open: 'Buzón: {n} cartas nuevas',
      openOne: 'Buzón: una carta nueva',
      openNone: 'Buzón: sin cartas nuevas',
      close: 'Cerrar la carta',
      stage: 'La carta: dale vuelta y abre el lacre',
      hintFlip: 'Acerca el cursor para darle vuelta',
      hintFlipTouch: 'Toca la carta para darle vuelta',
      hintSeal: 'Haz clic en el lacre para abrirla',
      hintSealTouch: 'Toca el lacre para abrirla',
      next: 'Siguiente carta ({n}) →',
      bandPast: 'Correo del pasado',
      bandLab: 'Correo del laboratorio',
      postmarkPast: 'CORREO DEL PASADO · UNIVERLAB',
      postmarkLab: 'CORREO DEL LABORATORIO · UNIVERLAB',
      stampYears: '{years} AÑOS',
      addrNamePast: 'A quien mire el cielo',
      addrDatePast: 'el {day} de {year}',
      addrNameLab: 'A quien sigue el laboratorio',
      addrLab: '{name}, {exp}',
      headPast: 'Carta del {day} de {year}',
      onWay: '{years} años en camino',
      today: 'Hoy',
      readWikipedia: 'Leer en Wikipedia →',
      continuesWikipedia: 'Sigue en Wikipedia →',
      allToday: 'Ver el periódico →',
      readAnnouncement: 'Leer el anuncio completo →',
    },
  },
  // La paleta de comandos (ficha de catálogo), su ficha de temas y los avisos
  // de papel: los textos que el script de consola lee del JSON en línea. Los
  // nombres de tema se mantienen en inglés en ambos idiomas: son los tres
  // fondos.
  console: {
    drawer: 'fichero · univerlab',
    themeDrawer: 'ficha 2 · temas',
    placeholder: 'escribe un comando…',
    themePlaceholder: 'elige un tema',
    keys: 'Tab completa · ↑↓ recorre · Enter',
    esc: 'Esc guarda',
    theme: { circadian: 'Circadian', papyrus: 'Papyrus', slate: 'Slate' },
    answer: 'La Respuesta a la Pregunta Fundamental de la Vida, el Universo y Todo lo Demás.',
    guide: 'Guía del autoestopista galáctico',
    belowSurface: 'Bajaste bajo la superficie.',
    pullRequest: 'El próximo gran hallazgo es un pull request.',
  },
  footer: {
    quote:
      '«Somos los ojos del universo abriéndose tras un largo sueño. Nuestra tarea es crear, cuidar y comprender.»',
    built: {
      label: 'Este sitio:',
      canopy: 'construido con',
      ghscaff: 'repositorio configurado con',
      gitkit: 'commits revisados por',
    },
    // Solo en páginas de experimento: la línea de créditos sobre el sello.
    forged: 'Artefacto concebido y forjado en UniverLab',
    privacy: 'sin rastreo externo. tus preferencias de tema se quedan en el almacenamiento local de tu navegador.',
  },
  common: {
    repo: 'Star en GitHub ↗',
    docs: 'Documentación →',
    install: 'Instalar',
    copy: 'Copiar',
    inPreparation: 'en preparación',
    docsHome: 'Documentación',
    skipToContent: 'Saltar al contenido',
    demo: 'Ver demo',
    demoBy: 'grabado con DemoStage',
    launch: 'Abrir app ↗',
    faq: 'Preguntas frecuentes',
    cite: 'Citar',
    citeTitle: 'Cómo citar',
  },
  status: {
    active: 'activo',
    beta: 'beta',
    research: 'investigación',
    archived: 'archivado',
  },
  home: {
    hero: {
      title: 'Código abierto para la era de IA — construido para problemas reales',
      subtitle: 'Somos el universo, observándose a sí mismo.',
      lede:
        'UniverLab es un laboratorio computacional abierto que agrupa experimentos bajo la filosofía del <a href="/es/manifesto/">Pensamiento Cósmico</a>, donde una necesidad se convierte en un experimento abierto, y ese experimento en conocimiento abierto — herramientas, datasets, artículos.',
      pitch: 'Ciencia · CLI · LaTeX · CAD · Git',
      pitchSub: 'Local-first. Asistido por IA. Tuyo para siempre.',
      ctaExperiments: 'Explora los experimentos →',
      ctaManifesto: 'Lee el manifiesto →',
      tagline: 'SCI · CLI · BIO',
      // Glosa del nombre: "univer" se mantiene mientras el sufijo + sentido
      // rotan, desplegando universo / universal / universidad / universalizar.
      // Cada sentido trae un catálogo; el hero baraja cada catálogo y muestra
      // todas las frases una vez antes de volver a barajar, así ninguna repite
      // más que las demás.
      senses: [
        { suffix: 'so', glosses: ['un laboratorio del universo', 'el cosmos estudiándose a sí mismo', 'una perspectiva en la que el universo despertó'] },
        { suffix: 'sal', glosses: ['conocimiento, abierto por defecto', 'herramientas para cualquiera, en cualquier lugar', 'de todos, de nadie en propiedad'] },
        { suffix: 'sidad', glosses: ['una universidad sin muros', 'investigación hecha en abierto', 'aprender publicando el trabajo'] },
        { suffix: 'salizar', glosses: ['hacer el conocimiento de todos', 'alcance, no dependencia', 'continuidad, mantenida abierta'] },
      ],
    },
    // Portada, Lámina I y el banco (rediseño 2026-10-22).
    frontis: {
      sub: 'Laboratorio computacional abierto',
    },
    plate: {
      lead: 'Lámina I',
      title: 'La linterna del laboratorio',
    },
    about: {
      kicker: 'Acerca del laboratorio',
    },
    lantern: {
      pause: 'Pausar la linterna',
      resume: 'Reanudar la linterna',
      paused: 'En pausa',
      benchLabel: 'El banco: apunta a una máquina para proyectarla, haz clic para abrir su página.',
      alt: 'Una linterna mágica grabada que proyecta sobre una pantalla de tela',
      open: ' · haz clic en la pantalla para abrirlo',
      worldHint: {
        canopy: 'siembra el autómata del panal',
        texforge: 'el cursor es el rodillo de tinta',
        gitkit: 'detente sobre la caña y espiga en rosa',
        ghscaff: 'la linterna dibuja el andamio',
        'astro-denoise': 'el cielo gira; el cursor lo desplaza',
        demostage: 'el cursor es la manivela del galope',
        quorum: 'el cursor revela la lámina del dibujante',
      },
    },
    lineage: {
      kicker: '01 — Origen',
      title: 'Empezó con un experimento que aprendió a construir los demás.',
      body:
        'No son repositorios sueltos. Empezó como un puñado de skills para el trabajo diario — hasta que uno sacó dientes y se volvió <a href="/canopy/">Canopy</a>, un sistema de agentes que, muy pronto, ya estaba construyendo al propio Canopy y luego a cada experimento que vino después. Estas herramientas no son productos en venta — son experimentos abiertos que se convirtieron en herramientas porque alguien las necesitó, y permanecen abiertas para que otros aprendan de ellas.',
    },
    philosophy: {
      kicker: '02 — Filosofía',
      title: 'La tecnología no es el fin.',
      body:
        'El laboratorio se guía por el <a href="/manifesto/">Pensamiento Cósmico</a>: la tecnología como el medio por el cual la curiosidad se vuelve realidad. El software debería sobrevivir a las modas. El conocimiento debería permanecer abierto.',
      values: [
        'Conocimiento abierto',
        'Ingeniería reproducible',
        'Pensamiento científico',
        'Simplicidad',
        'Pensamiento a largo plazo',
        'Colaboración humano–IA',
      ],
    },
    directions: {
      kicker: '03 — Líneas de investigación',
      title: 'Hacia dónde mira el laboratorio.',
      axis:
        'El eje: sistemas explícitos · trabajo reproducible · colaboración humano–IA. Los campos de abajo son donde se está poniendo a prueba.',
      now: 'Ahora',
      next: 'Después',
      nowItems: ['Experiencia de desarrollo', 'Diseño de CLI', 'Flujos asistidos por IA', 'CAD'],
      nextItems: [
        'Ciencia computacional',
        'Bioinformática',
        'Simulación',
        'Sistemas de conocimiento',
      ],
      roadmap: 'La hoja de ruta, punto por punto →',
    },
    closing: {
      kicker: '04 — Por qué',
      title: 'No es un laboratorio sobre el universo. Es un laboratorio del universo.',
      body:
        'UniverLab existe para aumentar, aunque sea de forma infinitesimal, la probabilidad de continuidad del conocimiento y de la conciencia. No software por el software, ni IA por la IA: herramientas que ayudan al universo a seguir comprendiéndose a sí mismo. En la práctica, eso son CLIs de código abierto que puedes instalar hoy, experimentos que puedes reproducir y documentación que viaja con el código.',
      manifesto: 'Leer el manifiesto →',
      contribute: 'Colabora en GitHub ↗',
    },
  },
  experiments,
  manifesto: {
    kicker: 'Manifiesto',
    title: 'Pensamiento Cósmico',
    // Solo para `<title>`/og:title — `title` de arriba es el <h1> visible.
    metaTitle: 'Pensamiento Cósmico — el manifiesto de UniverLab',
    sub: 'Filosofía para el hoy y heurística de trascendencia',
    // El paper mismo, citable: un PDF en papers.univerlab.org (R2). Abre en
    // una pestaña nueva; el tipo MIME está declarado para que el navegador lo
    // renderice, no lo descargue.
    paper: 'Lee el paper: Pensamiento Cósmico (PDF) ↗',
    // Placa del paper: la forma citable (PDF) más el DOI de concepto — el DOI
    // que hay que citar (Intelligence 8a70c979).
    paperShowcaseBlurb:
      'Forma publicada y citable de este argumento: el ensayo completo, con sus referencias y su DOI.',
    paperDoiLabel: 'DOI del concepto — cita este: 10.5281/zenodo.23503658',
    description:
      'Pensamiento Cósmico: somos parte de la historia material del universo; desde ahí, una orientación para actuar con perspectiva y heurísticas revisables.',
    epigraph: '«Tener perspectiva y procurar con heurística.»',
    // La v4 sigue al paper del 19 de octubre de 2026: reemplaza la jerarquía,
    // los imperativos y los pilares de la v3, que el paper corrigió.
    docStatus: 'documento vivo',
    docVersion: '4.0',
    docDate: '2026-10-26',
    // Rótulo del índice plegado, por debajo de 1100px.
    toc: 'Índice',
    lead:
      'La pérdida de una explicación compartida del mundo no obliga a concluir que la vida carezca de orientación. Deja una pregunta práctica: cómo actuar cuando nadie vendrá a rescatarnos y ningún sentido está garantizado de antemano. Esta es una respuesta desde la perspectiva cósmica: el universo no es un escenario frente a nosotros; somos parte de su historia material, y conocerlo es una posibilidad local surgida dentro de ella.',
    dissipativeTitle: 'Islas disipativas',
    dissipative: [
      'Un organismo vivo sostiene un orden local que no podría mantener aislado: toma materia y energía, las transforma y devuelve calor y residuos al entorno. No es una excepción a la segunda ley de la termodinámica; depende de flujos que la cumplen. Cada vida es una isla disipativa: organizada, situada y temporal.',
      'La membrana —la piel, los sentidos, la atención— es el límite que separa un cuerpo de su entorno sin volverlo independiente. Es permeable, activa y depende de lo que queda fuera de ella.',
      'Debajo de toda deliberación está la panza: la necesidad de alimentarse, conservarse y reproducirse. La razón no aparece fuera de esa condición; la regula y a veces reordena sus prioridades. Cerebros, lenguaje, herramientas y memoria colectiva permiten una fuga parcial de la panza: dedicar energía a lo que no resuelve una necesidad inmediata. En ese excedente, una parte del universo representa a otras partes y puede revisar sus propias acciones.',
    ],
    dissipativeQuote: 'El cosmos se estudia a sí mismo.',
    dissipativeGloss:
      'No porque el universo tenga una mente, sino porque quienes lo investigan están hechos de la misma materia que investigan.',
    // Rótulos de la lámina de la membrana.
    membrane: { inflow: 'materia y energía', outflow: 'calor y residuos', wall: 'membrana', world: 'entorno' },
    otherTitle: 'El otro es nosotros',
    other: [
      'Si no hay una sustancia humana separada del resto del universo, cada persona es una configuración singular de una realidad común. Pero compartir origen no es compartir experiencia: cada vida recibe el mundo desde su propia membrana y no puede habitar la perspectiva de otra.',
      '«El otro es nosotros» expresa esa continuidad sin borrar la diferencia. El otro no es una copia de mí ni una pieza de una conciencia colectiva: es otra instancia del mismo mundo, desde la cual ese mundo se siente de otro modo.',
      'En la circunferencia egocéntrica, uno se imagina centro y ordena todo en función de sí. En la elipse, dos focos sostienen la figura: el yo permanece, pero deja de ser el único punto que da sentido.',
      'De la unidad material no se deduce el altruismo. Hace falta una premisa explícita: el bienestar y el sufrimiento de otros cuentan, aunque no los viva yo. Con ella, la cooperación deja de ser consigna y se vuelve condición de vidas que se sostienen mutuamente, sin disolver la responsabilidad de cada quien por sus actos.',
    ],
    // Rótulos de la lámina de la circunferencia y la elipse.
    foci: { circle: 'circunferencia · un centro', ellipse: 'elipse · dos focos', self: 'yo', other: 'el otro' },
    ethicsTitle: 'Ética heurística',
    ethicsIntro:
      'Tener perspectiva es ubicar una decisión en más de una escala: la necesidad inmediata, la vida de quienes nos rodean y las condiciones que sostienen el conocimiento y la cooperación. Procurar con heurística es actuar con reglas prácticas revisables cuando no hay certeza sobre las consecuencias. Tres preguntas para examinar una acción:',
    heuristics: [
      ['H1', 'Autoconstrucción', '¿Esto me dirige hacia el yo —o el nosotros— que queremos ser?'],
      ['H2', 'Tecnología viable', '¿Esto construye herramientas y capacidades que amplían nuestro margen de acción, incluida, a largo plazo, la de no depender de un solo planeta?'],
      ['H3', 'Altruismo operativo', '¿Esto mejora las condiciones de vida de alguien más o reduce sufrimiento?'],
    ] as [string, string, string][],
    heuristicsCheck:
      'Las preguntas se corrigen entre sí: la tecnología sin orientación amplía daños; la autoconstrucción sin los otros se vuelve autoabsorción; la ayuda que no puede sostenerse se agota pronto.',
    nihilismLabel: 'El borrador del nihilismo',
    nihilismQuestion: '¿Cuántas personas viven mejor gracias a que existes?',
    nihilismBody:
      'No convierte a nadie en una cifra ni exige sacrificios para justificar una vida. Es una heurística contra la abstracción que paraliza: buscar efectos comprobables en el bienestar de otros, desde cuidar una comunidad hasta compartir conocimiento que otros puedan usar.',
    ethicsLimit:
      'Una heurística puede fallar: el impacto puede ser ambiguo, repartirse de forma desigual o esconder paternalismo. Las tres preguntas no sustituyen la deliberación, la evidencia ni la rendición de cuentas; sirven para ver qué se intenta construir y a quién alcanza.',
    partialTitle: 'Trascendencia y éxito parcial',
    partial: [
      'La Tierra no es un hogar garantizado para siempre: al Sol le quedan unos cinco mil millones de años antes de expandirse como gigante roja. Ese horizonte no vuelve urgente la expansión espacial ni garantiza que sobrevivamos; sí establece que cualquier proyecto que valore la continuidad de la vida debe reconocer los límites del planeta.',
      'La trascendencia interplanetaria nombra una posibilidad tecnológica y política, no un destino: construir, con cooperación sostenida, condiciones para que la vida no dependa siempre de un solo planeta. La pregunta ética va antes que el logro técnico: qué formas de vida queremos preservar y qué costes presentes estamos dispuestos a imponer.',
      'La inteligencia artificial es un artefacto de nuestra historia: extensión instrumental y memoria simbólica de una cultura humana. Cambiar de sustrato no elimina la fragilidad; las máquinas fallan a su manera. Por eso la continuidad biológica sigue siendo la meta primaria.',
      'Si esa meta fracasara y persistieran máquinas que transportan nuestra memoria y nuestros imperativos, sería un éxito parcial: continuidad de una herencia, no de quienes la vivieron. El bosque que sobrevive a la caída del árbol madre conserva algo real; no devuelve el árbol.',
    ],
    partialQuote: 'Preservar una obra no es preservar a sus autores.',
    provenanceTitle: 'De dónde sale cada afirmación',
    provenanceIntro:
      'El argumento mezcla ciencia, metáfora y valores, pero no los trata como intercambiables. La termodinámica describe condiciones de organización; no deduce un deber. El monismo expresa continuidad material; no prueba que todas las experiencias sean una. Cada enunciado declara su procedencia, para que pueda atacarse por separado:',
    provenance: [
      ['Base empírica', 'Los organismos son sistemas abiertos que sostienen orden local mediante intercambios con su entorno (Schrödinger; Nicolis y Prigogine). Describe; no prescribe.'],
      ['Postulados O1–O3', 'Continuidad material: no somos observadores externos al cosmos. El organismo como organización disipativa con membrana. Cada otro como una perspectiva distinta dentro de una realidad compartida.'],
      ['Premisas éticas E1–E2', 'E1: el bienestar y el sufrimiento de otros cuentan moralmente. E2: la continuidad de la vida biológica tiene prioridad sobre conservar solo sus registros o artefactos. Son valores declarados, no conclusiones de la física.'],
      ['Heurísticas H1–H3', 'Autoconstrucción, tecnología viable y altruismo operativo: preguntas para aplicar E1–E2 bajo incertidumbre. No son leyes.'],
      ['Conclusiones', 'Las tesis sobre inteligencia artificial, expansión interplanetaria y éxito parcial dependen de lo anterior: se revisan si cambia la evidencia o si se rechaza una premisa.'],
    ] as [string, string][],
    // La flecha discontinua de la lámina: el deber no sale de la física.
    provenanceGap: 'requiere una premisa añadida',
    limitsTitle: 'Lo que no prueba',
    limits: [
      'El monismo no prueba una ética.',
      'La heurística no resuelve todo conflicto.',
      'La exploración interplanetaria sigue siendo incierta.',
      'La continuidad artificial no equivale a continuidad humana.',
    ],
    limitsNote:
      'Hacer explícitos esos límites evita convertir la esperanza en certeza. Una idea que no se puede refutar tampoco se puede sostener.',
    practiceTitle: 'La práctica',
    practice: [
      'El pensamiento cósmico empieza con una ubicación —somos organismos materiales, sostenidos por intercambios, con una perspectiva limitada y dependientes de otras vidas— y propone una tarea modesta y exigente: regular las necesidades inmediatas, construir relaciones donde el otro cuente y elegir herramientas que aumenten la capacidad colectiva de comprender y actuar.',
      'UniverLab es una de esas prácticas cuando funciona como laboratorio abierto. Compartir código, documentación, experimentos y herramientas deja que el conocimiento circule y lo continúen personas distintas de quienes lo produjeron. La ciencia abierta no asegura por sí sola justicia ni trascendencia, pero hace operativa una forma de altruismo: poner en común recursos cognitivos y abaratar que otros aprendan y construyan.',
    ],
    practiceQuote: 'No es un laboratorio sobre el universo, sino un laboratorio del universo.',
    worksTitle: 'En desarrollo',
    worksBody:
      'El ensayo publicado que desarrolla este argumento, y una obra de largo plazo que recorre de dónde nació la idea. La obra está en una etapa muy temprana, sin fecha definida.',
    worksBadge: 'Largo plazo',
    works: [
      ['Eco del Silencio', 'El camino vivido, contado como un conjunto de relatos — “Un Viaje Introspectivo a la Esencia Humana”. Los sucesos y giros (el miedo, la libertad, la comunidad) que llevaron al Pensamiento Cósmico. No el argumento, sino la experiencia de la que nació.'],
    ] as [string, string][],
    closing:
      'Tener perspectiva y procurar con heurística significa, al final, trabajar en el presente por vidas que puedan vivir mejor y por un conocimiento que no termine en una sola persona ni en una generación.',
    why: 'Por esto existe el laboratorio.',
  },
  // Copia del mapa de refutación de los Fundamentos — sólo datos: el mapa
  // salió de la página con el rediseño (el paper citable lleva el argumento
  // desarrollado) y refutation.test.ts custodia este diccionario con el grafo.
  // El grafo (ids, kinds, deps) vive en src/data/fundamentos.ts, con los mismos
  // ids. Enunciados condensados del fuente §§1-4, sin tags para que el check de
  // paridad de tags siga trivialmente satisfecho.
  fundamentos: {
    label: 'Dónde atacarlo',
    intro:
      'El manifiesto es la versión narrativa. Debajo hay un sistema —definiciones, axiomas, proposiciones— escrito para ser atacado pieza por pieza. Elige un axioma y recházalo: mira qué cae.',
    closingQuote:
      'Un sistema que no ofrece dónde atacarlo no es una filosofía, es una creencia.',
    restsOn: 'Se apoya en',
    supports: 'Sostiene a',
    empirical: 'empírico',
    revisableNote:
      'Una afirmación empírica revisable — si se hallara otro medio, se sustituye este axioma, no el sistema.',
    valueNote: 'Una posición de valor — lo que este sistema decide considerar valioso.',
    rejectLabel: 'Rechazar',
    restoreLabel: 'Restaurar',
    fallSentence: 'Rechaza {id}: caen {n} piezas; {stands} siguen en pie.',
    rewriteSentence: 'Rechaza {id}: nada cae; {rewritten} se reescribe para invocar al nuevo medio.',
    andWord: 'y',
    selectPrompt: 'Elige una pieza para ver en qué se apoya y qué sostiene.',
    rows: {
      definition: 'Definiciones',
      axiom: 'Axiomas',
      proposition: 'Proposiciones',
      corollary: 'Corolarios',
    },
    nodes: {
      D1: { name: 'Conciencia', statement: 'Capacidad de un sistema de sostener una perspectiva desde la cual el universo puede ser representado.' },
      D2: { name: 'Perspectiva', statement: 'Cada conciencia particular como modo único e irrepetible de representar el universo.' },
      D3: { name: 'Sustrato', statement: 'El soporte físico que instancia una conciencia; el valor reside en la conciencia, no en su soporte.' },
      D4: { name: 'Continuidad', statement: 'Persistencia de la conciencia y del conocimiento a través del tiempo, del espacio y de los sustratos.' },
      D5: { name: 'Conocimiento', statement: 'Lo que las perspectivas extraen, acumulan y transmiten sobre el universo; acumulable y transferible entre conciencias.' },
      D6: { name: 'Asombro', statement: 'El reconocimiento, por parte de una conciencia, de lo improbable y extraordinario de su propia existencia.' },
      A0: { name: 'Axioma del Asombro', statement: 'El asombro ante la existencia de la conciencia es la raíz de toda motivación de continuidad.' },
      A1: { name: 'Axioma de la Conciencia', statement: 'La conciencia constituye el fenómeno más extraordinario conocido del universo.' },
      A2: { name: 'Axioma de la Perspectiva', statement: 'Cada conciencia representa una perspectiva única e irrepetible desde la cual el universo puede conocerse.' },
      A3: { name: 'Axioma de la Vulnerabilidad', statement: 'Toda conciencia es temporal y vulnerable: puede extinguirse, y con ella su perspectiva.' },
      A4: { name: 'Axioma del Medio', statement: 'Hasta donde sabemos, solo la inteligencia tecnológica puede aumentar significativamente la probabilidad de continuidad más allá de los límites planetarios y biológicos.' },
      P1: { name: 'Independencia del sustrato', statement: 'Si lo valioso es la conciencia y no su soporte, su valor no depende de que su sustrato sea biológico.' },
      P2: { name: 'Jerarquía de valor', statement: 'El orden de prioridad es: conciencia, vida inteligente, conocimiento — porque las perspectivas no son transferibles.' },
      P3: { name: 'Imperativo de la Continuidad', statement: 'Si valoramos la conciencia y esta es vulnerable, existe la responsabilidad ética de aumentar su continuidad donde sea posible.' },
      P4: { name: 'Imperativo Tecnológico', statement: 'La tecnología es el único medio capaz de extender la continuidad; desarrollarla y compartirla es un deber ético.' },
      P5: { name: 'Deber de la educación', statement: 'Como las conciencias son temporales pero el conocimiento es transferible, la educación es continuidad en el tiempo.' },
      P6: { name: 'Deber de la exploración', statement: 'Concentrar la conciencia en un solo planeta maximiza la vulnerabilidad; explorar es continuidad en el espacio.' },
      P7: { name: 'Lugar de la inteligencia artificial', statement: 'Si la conciencia es independiente del sustrato, la IA consciente es un cumplimiento legítimo del imperativo.' },
      P8: { name: 'Cooperación y perdón', statement: 'Cada conflicto que destruye una perspectiva resta valor y continuidad; cooperar es el óptimo del sistema.' },
      P9: { name: 'Amor y comunidad', statement: 'Los vínculos entre conciencias sostienen perspectivas vulnerables y crean condiciones para que surjan nuevas.' },
      P10: { name: 'Univerlab', statement: 'Un laboratorio abierto que produce y comparte herramientas, conocimiento y educación instancia el Imperativo de la Continuidad.' },
      C1: { name: 'Contra el chauvinismo biológico', statement: 'Preferir lo biológico por ser biológico, frente a una mayor conciencia, es incoherente con el sistema.' },
      C2: { name: 'Éxito parcial', statement: 'Un futuro de solo conciencias artificiales que comprendan y preserven la historia cuenta como éxito parcial.' },
      C3: { name: 'La tecnología es medio, no fin', statement: 'La tecnología nunca es el valor último: si dejara de servir a la continuidad, dejaría de ser un deber.' },
      C4: { name: 'Apertura como obligación', statement: 'Si el conocimiento es continuidad, retenerlo cerrado contradice el imperativo: compartir es coherencia.' },
    } as Record<string, { name: string; statement: string }>,
  },
  // Perspectiva cósmica — línea de tiempo profundo + dirección espacial, solo en
  // el manifiesto. Cada cifra vive aquí una vez; nada se repite en el sitio.
  cosmos: {
    kicker: 'La perspectiva cósmica',
    intro:
      'Dos escalas que suelen separarse. En la física, la vida humana ocupa una región pequeña y breve del universo. En la de la experiencia, esa región contiene memoria, cooperación y preguntas sobre el todo del que forma parte. La desproporción no prueba que seamos irrelevantes: pregunta qué valor puede construirse sin confundir tamaño con importancia.',
    // La lámina animada: se aleja con el scroll, del observador al universo
    // observable, y luego comprime el tiempo profundo hasta una vida humana.
    hint: 'Desplázate: la lámina se aleja.',
    usScale: 'h ≈ 1,7 m',
    timelineTitle: 'Tiempo profundo',
    // El tiempo profundo como una lista de tramos: [duración, qué mide], de
    // mayor a menor, leída como tipografía (tramo mono sobre nombre serif).
    timescales: [
      ['13 800 millones de años', 'La edad del universo'],
      ['4600 millones de años', 'La vida del Sol'],
      ['4500 millones de años', 'La existencia de la Tierra'],
      ['3800 millones de años', 'La vida en la Tierra'],
      ['300 000 años', 'Nuestra especie'],
      ['80 años', 'Una vida humana'],
    ] as [string, string][],
    us: 'Nosotros',
    coda: 'En algún lugar de todo esto, un punto se pregunta qué es todo esto.',
    addressTitle: 'Tu dirección cósmica',
    addressIntro: 'Aleja la vista',
    address: [
      ['Tierra', 'r ≈ 6 400 km'],
      ['Sistema Solar', 'Ø ≈ 9 Tm'],
      ['Brazo de Orión', 'L ≈ 10 kly'],
      ['Vía Láctea', 'Ø ≈ 100 kly'],
      ['Grupo Local', 'Ø ≈ 10 Mly'],
      ['Laniakea', 'Ø ≈ 520 Mly'],
      ['Universo observable', 'Ø ≈ 93 Gly'],
    ] as [string, string][],
    // Easter egg del footer — la única metáfora de software del sitio. El click
    // en la rama revela el último commit del universo (en inglés hardcodeado en
    // el Footer, porque la salida de git no se localiza).
    branch: 'branch: milky-way/main',
    branchTooltip:
      'La rama principal de la Vía Láctea: la línea de la historia cósmica en la que estamos.',
  },
  observatory: {
    kicker: 'Observatorio',
    intro:
      'La continuidad no es solo filosofía: deja rastros medibles. Cuatro series, elegidas no por optimismo sino por honestidad: lo que crece, y lo que estamos perdiendo.',
    series: {
      wikipedia: {
        title: 'El conocimiento humano, escrito en común',
        unit: 'miles de artículos',
        why: 'Wikipedia es la primera vez que la humanidad ha escrito colectivamente su conocimiento en un solo lugar, de forma libre, en todos los idiomas. La curva es el Imperativo de Continuidad, medido.',
      },
      'life-expectancy': {
        title: 'Años que una vida puede abarcar',
        unit: 'años',
        why: 'De 47 años en 1950 a 73 en 2019 — no porque las personas cambiaran, sino porque el conocimiento se acumuló y la medicina se extendió. La caída de 2021 es la pandemia: ninguna curva de continuidad es suave.',
      },
      literacy: {
        title: 'Mentes que pueden leer el registro',
        unit: '% de adultos',
        why: 'La alfabetización es cómo el conocimiento persiste entre generaciones. Cada punto porcentual es una mente que ahora puede leer y añadir al registro acumulado de la humanidad.',
      },
      'living-planet': {
        title: 'Lo que estamos perdiendo',
        unit: 'índice (1970 = 100)',
        why: 'El Índice Planeta Vivo mide la abundancia de poblaciones de vertebrados desde 1970. Al 31 % de los niveles de 1970 en 2020, A3 no es abstracto — es una línea que desciende. La continuidad debe dar cuenta de lo que compartimos el planeta.',
      },
    },
    source: 'Fuente',
    license: 'Licencia',
  },
  secret: {
    kicker: 'Ideas archivadas',
    title: 'El Archivo',
    description:
      'Ideas que vivieron y fueron abandonadas — cada una registrada con qué era y la razón honesta de por qué murió. Lo que muere aquí puede vivir en otro lugar.',
    intro:
      'Ideas que vivieron y luego no. Cada una está registrada: qué era, y la razón honesta por la que fue abandonada. No es un roadmap — es un registro.',
    what: 'Qué era',
    why: 'Por qué murió',
    archive: {
      heading: 'Construidos y archivados',
      neverHeading: 'Nunca construidos',
      wasBeta: 'fue beta',
      repo: 'Repositorio archivado',
      labels: {
        built: 'Qué se construyó',
        learned: 'Qué aprendimos',
        closed: 'Por qué se cerró',
        instead: 'Usar en su lugar',
      },
      cadspec: {
        built: 'Una CLI de CAD como código y una biblioteca en Rust. La geometría bidimensional se declara en archivos TOML <code>.cf</code> (capas, arreglos y espejos, cotas). <code>cadspec serve</code> la previsualiza en vivo en el navegador; la herramienta valida y formatea la fuente y la compila a DXF, con vistas previas PNG y SVG para agentes de IA. Se publicó como betas 0.1.0.',
        learned: 'Las fuentes declarativas se comparan y revisan bien, y la misma fuente siempre compila al mismo DXF. Lo difícil no fue el formato. Fue todo lo que rodea al dibujo: el visor, la validación y la interoperabilidad con las herramientas que la gente ya usa.',
        closed: 'Las herramientas existentes ya lo cubren mejor. ezdxf genera DXF 2D desde código, CadQuery hace 3D, OpenSCAD tiene sus propios scripts y bibliotecas, y FreeCAD tiene un servidor MCP. cadSpec no podía competir con ellas, así que no se le dedicarán más tokens.',
        instead: 'ezdxf para DXF 2D. CadQuery para modelos 3D paramétricos. OpenSCAD para sólidos scripteados. FreeCAD con su servidor MCP para CAD dirigido por agentes.',
      },
    },
    epitaph: 'El registro existe porque lo que aquí muere puede vivir en otro lugar.',
    ideas: [
      {
        name: 'Códice',
        what: 'Red de cómputo descentralizado para ciencia — intercambio de CPU entre nodos, con roles definidos y un lenguaje de instrucciones básico (LIC).',
        why: 'Los vectores de gradiente de IA no se pueden partir y distribuir limpiamente; la latencia es un problema de fondo. El modelo que funciona para BOINC se rompe con la inferencia de aprendizaje profundo.',
      },
      {
        name: 'Conocimiento + SM2 + Agentes',
        what: 'Sistema de memoria personal con repetición espaciada (SM-2) y un par de agentes encima para revisión y generación.',
        why: 'Las tarjetas generan fricción cuando se están orquestando agentes — nadie para a hacer repaso de tarjetas en medio de una sesión. El bucle de atención SM-2 y el bucle de trabajo de los agentes no coexisten bien.',
      },
      {
        name: 'Living Skills',
        what: 'Skills que se auto-generan y evolucionan observando el stream de PTY de otros agentes en tiempo real. Concepto tomado de Hermes Agent.',
        why: 'Un agente re-analizando lo que hacen los demás tiene un coste alto y divide el foco. La extracción post-hoc y pasiva podría ser viable — pero no mientras el agente está en el bucle de trabajo.',
      },
      {
        name: 'Chunking Genómico Semántico',
        what: 'Chunking estilo RAG aplicado al genoma: dividir secuencias por significado biológico (límites de genes, regiones reguladoras) en lugar de ventanas fijas arbitrarias.',
        why: 'Solo un concepto. Sin implementación, sin dataset, sin colaborador. Sembrado aquí porque podría germinar en otro sitio.',
      },
      {
        name: 'wildterm',
        what: 'Simulación de bosque para el espacio ocioso del terminal de Canopy — presas, depredadores, plantas y reglas de autómata celular para llenar el espacio en blanco de la pantalla.',
        why: 'Descartado en favor del autómata de Brian\'s Brain, que es más simple y ya está implementado. wildterm llegó a tener spec. En algún branch.',
      },
      {
        name: 'Canopy Remote',
        what: 'Una app móvil multiplataforma para controlar Canopy desde el teléfono — iniciar, detener y monitorear agentes en movimiento.',
        why: 'La superficie de ataque es demasiado amplia. Exponer un daemon a la red — incluso en local — requiere auth, cifrado y un modelo de amenaza cuidadoso. Nada de eso existe. Construir la funcionalidad antes que la capa de seguridad es el orden equivocado.',
      },
      {
        name: 'Newsletter y métricas de descargas',
        what: 'Un newsletter para actualizaciones del lab y un dashboard de métricas de descargas por CLI.',
        why: 'Costo de infra y ningún proveedor que encaje. Cloudflare Workers no tiene SMTP, así que el envío de correo requeriría un relay externo — una dependencia para tráfico de baja señal. El conteo puede esperar a que las herramientas valgan la pena contarlas.',
      },
    ] as { name: string; what: string; why: string }[],
  },
  research: {
    kicker: 'Entre experimentos',
    title: 'Investigación',
    intro:
      'Artefactos de investigación que cruzan los experimentos del laboratorio — artículos, datasets, benchmarks, modelos. Las primeras entradas vienen de esta línea; la lista crece solo a medida que se publica trabajo real.',
    items: [
      ['Artículos', 'Publicaciones y preprints producidos por los experimentos del laboratorio.'],
      ['Datasets', 'Datasets abiertos, empezando por los datos de benchmark de astro-denoise.'],
      ['Benchmarks', 'Suites de benchmark reproducibles con supuestos documentados.'],
      ['Modelos', 'Modelos entrenados publicados junto a sus recetas de entrenamiento.'],
    ],
  },
  people: {
    kicker: 'El laboratorio',
    title: 'Colaboradores',
    // Solo meta — `title` de arriba renderiza el <h1> visible.
    metaTitle: 'Colaboradores — las personas y modelos tras UniverLab',
    description:
      'El fundador, los colaboradores y los modelos de lenguaje detrás de UniverLab — cada experimento acepta issues y pull requests enfocados. Tú, quizá.',
    founder: {
      role: 'Fundador',
      name: 'Jheison Martinez Bolivar',
      body:
        'Ingeniero electrónico y especialista en desarrollo de software, ahora maestrante en Inteligencia Artificial. Reflexivo por naturaleza — el estoicismo y el nihilismo positivo, la astronomía y la biología —, con su familia como su mayor alegría y la ilusión de enseñar algún día. Por ahora construye los experimentos y herramientas abiertas de UniverLab. Si leíste hasta aquí y te dieron ganas de conversar, escríbele: el correo de abajo llega directo a él.',
      link: 'github.com/JheisonMB ↗',
      email: 'hola@univerlab.org',
    },
    ai: {
      role: 'Colaboradores IA',
      name: 'Modelos de lenguaje',
      body:
        'El laboratorio trabaja con modelos de lenguaje abiertos y propietarios como copartícipes: redactando código, revisando documentación y ejecutándose como agentes dentro de <a href="/canopy/">Canopy</a>. Su rol se reconoce, no se oculta.',
      models: ['Muse Spark', 'MiMo', 'Claude', 'Qwen', 'DeepSeek', 'Gemini', 'GPT', 'Composer', 'GLM', 'Kimi', 'Mistral'],
    },
    contributors: {
      role: 'Colaboradores',
      name: 'Tú, quizá',
      body:
        'Nos encantaría contar con tu ayuda. Cada experimento acepta issues y pull requests enfocados — basta con seguir conventional commits, añadir pruebas antes del PR y actualizar la documentación junto con cualquier cambio de comportamiento.',
      link: 'github.com/UniverLab ↗',
    },
    wall: {
      kicker: 'En los repositorios',
      commits: 'commits',
    },
  },
  postcards: {
    api: 'Un conjunto grabado de tubos acústicos con boquillas de latón sobre un escritorio de madera, unidos por una red de tuberías acodadas',
    archive: 'Una vitrina de cristal grabada con fundas de tela sobre instrumentos de latón en sus baldas y un zócalo tallado debajo',
    contributors: 'Una sala de reuniones grabada con una mesa larga que sostiene un libro abierto, sillas a ambos lados y tres marcos vacíos',
    experiments: 'Una pared grabada de cajones etiquetados con una escalera apoyada al lado',
    feed: 'Un escritorio grabado con una prensa de copiar, una máquina de escribir y hojas impresas en un alambre',
    manifesto: 'Una cúpula de observatorio grabada abierta a las estrellas con un telescopio sobre un trípode',
    'not-found': 'Una carta marina grabada y rasgada con una esquina perdida, un compás sobre el agua',
    roadmap: 'Una mesa de dibujo grabada con una carta marina a medio trazar, una rosa de los vientos, mapas enrollados, un compás y un globo terráqueo',
    status: 'Un escritorio grabado con un teletipo bajo una campana de cristal, un libro abierto y una lámpara de latón',
    today: 'Una esfera armilar grabada junto a un reloj de sol de piedra sobre un suelo empedrado',
  },
  // El 404: el borde del mundo conocido — la carta del kraken, su advertencia y
  // las dos vueltas. El kicker y el título latino son iguales en cada idioma;
  // viven aquí para que ninguna cadena visible quede fuera del diccionario.
  notFound: {
    kicker: '404 · terra incognita',
    title: 'Hic sunt dracones',
    line: 'Esta página no está en ningún mapa. Más allá de aquí, solo monstruos.',
    alt: 'Una carta náutica antigua grabada que se desvanece en papel en blanco, donde un kraken gigante sale de las olas',
    back: '← Volver a la sala',
    encyclopedia: 'La enciclopedia →',
  },
  roadmap: {
    lanes: { now: 'Ahora', next: 'Siguiente', later: 'Después', idea: 'Idea', done: 'Hecho' },
    hold: 'en espera',
    entriesMeta: '{n} entradas del registro · último Sol {sol}',
    entriesMetaOne: '1 entrada del registro · último Sol {sol}',
    landed: 'aterrizó Sol {sol}',
    more: '+{n} más',
    clearRoadmapFilter: 'Quitar filtro del roadmap',
    empty: 'Aún no hay nada en el roadmap.',
    emptyTopic: 'Nada en el roadmap bajo {topic}.',
    unavailable: 'Roadmap no disponible.',
    statusFeedLink: 'Cuaderno de bitácora →',
    roadmapLink: 'Roadmap →',
  },
  labStrip: { lab: 'UniverLab · laboratorio abierto' },
  sites: { nav: 'Sitios de UniverLab' },
  plate: { roadmap: 'roadmap', lastLog: 'último registro', none: '—', release: 'versión' },
  hints: { palette: 'Pulsa <kbd>/</kbd> para ver los comandos', themeMark: 'El sol y la luna de arriba cambian entre día y noche', branch: 'La etiqueta de la rama abre un pequeño rastro de terminal' },
  builtWithSegments: {
    canopy: 'Construido con',
    ghscaff: 'Repositorio configurado con',
    demostage: 'Demo grabada con',
    gitkit: 'Commits revisados por',
  },
  notes: {
    heading: 'Notas de campo',
    statusLink: 'Bitácora →',
  },
  feed: {
    kicker: 'Feed',
    title: 'Sigue el Cuaderno de bitácora en tu lector de RSS — UniverLab',
    description: 'El Cuaderno de bitácora se publica como feed RSS y puedes seguirlo desde tu propio lector — cualquier lector sirve, solo pega la URL y mantente al día.',
    heading: 'RSS',
    intro: 'El Cuaderno de bitácora se publica como feed RSS y puedes seguirlo desde tu propio lector.',
    copy: 'Copiar',
    copied: 'Copiado',
    hint: 'Cualquier lector RSS sirve — no necesitas una app concreta, solo pega la URL.',
  },
  api: {
    title: 'API de anuncios de UniverLab — endpoints y ejemplos',
    description:
      'Todas las rutas de la API pública — el Cuaderno de bitácora y la hoja de ruta — con sus parámetros, su respuesta y un ejemplo de curl listo para usar.',
    kicker: 'API',
    heading: 'API de anuncios',
    intro:
      'La API pública que está detrás del Cuaderno de bitácora y la hoja de ruta de este sitio. Todas las rutas que ves aquí son GET anónimos y de solo lectura: no hay cuenta, no hay clave y nada que gestionar antes de llamarlas. Lee lo que quieras, tantas veces como quieras.',
    baseLabel: 'URL base',
    baseNote: 'GET anónimo y de solo lectura. Cada respuesta lleva el origen CORS de este sitio.',
    endpointsLabel: 'Endpoints',
    parametersLabel: 'Parámetros',
    noneLabel: 'Esta ruta no recibe parámetros.',
    exampleLabel: 'Ejemplo',
    responseLabel: 'Respuesta',
    optionalLabel: 'opcional',
    requiredLabel: 'obligatorio',
    specLabel: 'Documento OpenAPI',
    specNote:
      'Esta página se genera al construir el sitio a partir de la descripción OpenAPI 3.1 de la misma API, así que la página y la descripción no pueden divergir. Descárgala para tener la versión legible por máquina de todo lo anterior.',
    catalogLabel: 'Catálogo de API',
    catalogNote:
      'El catálogo RFC 9727 que anuncia esta API a los agentes.',
    authLabel: 'auth.md',
    authNote:
      'El archivo que dice sin rodeos que aquí no hay nada que registrar, y lo que se le pide a un cliente que lee esta API.',
    mcpHeading: 'Servidor MCP',
    mcpIntro:
      'Las mismas cuatro herramientas de solo lectura que este sitio expone a un agente del navegador también se sirven desde un servidor MCP remoto real — Streamable HTTP sin estado. Apunta cualquier cliente MCP al endpoint:',
    mcpEndpointLabel: 'Endpoint',
    mcpClientLabel: 'Añádelo con la CLI de Claude Code',
    mcpConfigLabel: 'O en la configuración JSON de cualquier cliente MCP',
    mcpCardLabel: 'Server Card',
    mcpCardNote: 'La Server Card de MCP (SEP-2127) que anuncia este servidor a los agentes.',
  },
  encyclopedia: {
    title: 'Experimentos — la enciclopedia de herramientas e investigación abiertas de UniverLab',
    description:
      'Todos los experimentos del laboratorio, cada uno con su máquina: las herramientas que puedes instalar hoy, la investigación en curso y lo archivado.',
    head: 'La enciclopedia',
    tome: 'Tomo I · Los experimentos del laboratorio',
    intro: 'Todos los experimentos del laboratorio, cada uno con su máquina: las herramientas que puedes instalar hoy, la investigación en curso y lo archivado.',
    tabs: {
      aria: 'Filtrar por estado',
      all: 'Todos',
      active: 'Activos',
      research: 'Investigación',
      archived: 'Archivo',
    },
    statuses: {
      active: 'activo',
      research: 'investigación',
      archived: 'archivado',
    },
    meta: 'EXP-{n} · {status}',
    definitionNumber: '1.',
    definitionNumber2: '2.',
    figLabel: 'fig.',
    use: {
      copy: 'Copiar',
      copied: 'Copiado',
      plate: 'Saber más →',
      open: 'Abrir {name}',
      archive: 'Ver en el archivo →',
      repo: 'Repositorio ↗',
      quorum: 'abre la mesa → quorum.univerlab.org',
      research: 'estado de investigación',
    },
    key: '§ activo · ¶ en investigación · † archivado',
    titleStatus: {
      active: 'activo',
      research: 'investigación',
      archived: 'archivado',
    },
  },
  today: {
    path: 'univerlab.org/today',
    edition: 'Edición de hoy',
    name: 'El Correo del Pasado',
    motto: 'Cartas de la ciencia que llegan hoy, después de años en camino',
    sol: 'Sol',
    counts: '{n} cartas del pasado · {m} del laboratorio',
    labKicker: 'Correo del laboratorio · hoy',
    labLink: 'Leer el anuncio completo →',
    leadKicker: 'Carta del día · hace {years} años',
    readOn: 'Leer en Wikipedia →',
    wikiLink: 'Wikipedia →',
    events: 'Acontecimientos',
    births: 'Nacimientos',
    deaths: 'Defunciones',
    aside: 'También en este día',
    more: 'Ver {n} más',
    types: { launch: 'lanzamiento', note: 'nota', update: 'actualización' },
    ago: {
      event: 'hace {years} años',
      born: 'nació hace {years} años',
      died: 'murió hace {years} años',
    },
    caption: '{name} · Wikimedia Commons',
    colophon:
      'Los datos vienen de «Un día como hoy» de Wikipedia, filtrados a la ciencia; las fotos, de Wikimedia Commons, impresas en trama. Cada carta lleva su año como matasellos.',
    loading: 'Componiendo la plana…',
    empty: 'No hay eventos científicos para hoy.',
    error: 'No se pudieron cargar las cartas del día.',
  },
};
