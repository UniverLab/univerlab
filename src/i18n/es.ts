import type { Dict } from './en';

/** Copy en español. Misma forma que `en`. La documentación que se extrae de
 *  los repositorios permanece solo en inglés. */
export const es: Dict = {
  meta: {
    description:
      'UniverLab — un laboratorio computacional independiente que publica experimentos abiertos.',
  },
  nav: {
    experiments: 'Experimentos',
    research: 'Investigación',
    manifesto: 'Manifiesto',
    people: 'Personas',
    github: 'GitHub',
  },
  footer: {
    quote:
      '«Somos los ojos del universo abriéndose tras un largo sueño. Nuestra tarea es crear, cuidar y comprender.»',
    license: 'Experimentos con licencia MIT',
  },
  common: {
    sourceDocs: 'Código y docs ↗',
    allExperiments: 'Todos los experimentos →',
    inPreparation: 'en preparación',
  },
  status: {
    active: 'activo',
    beta: 'beta',
    research: 'investigación',
  },
  home: {
    hero: {
      title: 'Un laboratorio computacional independiente.',
      lede:
        'UniverLab diseña, construye y publica <strong>experimentos abiertos</strong>. Cada experimento nace de una necesidad real y produce conocimiento abierto — herramientas, librerías, datasets, artículos. El experimento es el proyecto; los artefactos son sus resultados.',
      tagline: 'SCI · CLI · BIO — dirección, no alcance',
    },
    lineage: {
      kicker: '00 — Origen',
      title: 'Empezó con un experimento que aprendió a construir los demás.',
      body:
        'Esto no es una colección de repositorios. El laboratorio comenzó como un puñado de skills para el trabajo diario; uno de ellos creció hasta volverse <a href="/experiments/canopy">Canopy</a>, un sistema de agentes que — desde muy temprano — se usó para construir al propio Canopy y a cada experimento que vino después. Las herramientas de aquí no son productos separados: son el laboratorio fabricando sus propios instrumentos.',
    },
    experiments: { kicker: '01 — Experimentos' },
    philosophy: {
      kicker: '02 — Filosofía',
      title: 'La tecnología no es el fin.',
      body:
        'El laboratorio se guía por el <a href="/manifesto">Pensamiento Cósmico</a>: la tecnología como el medio por el cual la curiosidad se vuelve realidad. El software debería sobrevivir a las modas. El conocimiento debería permanecer abierto.',
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
      now: 'Ahora',
      next: 'Después',
      nowItems: ['Experiencia de desarrollo', 'Diseño de CLI', 'Flujos asistidos por IA'],
      nextItems: [
        'Ciencia computacional',
        'Bioinformática',
        'Simulación',
        'CAD',
        'Sistemas de conocimiento',
      ],
    },
    ethics: {
      kicker: '04 — Ética',
      title: 'El software como práctica moral.',
      body:
        'Tratamos el software como una práctica moral, no solo técnica — una lectura directa del pensamiento que guía al laboratorio.',
      items: [
        ['Aumentar la agencia humana', 'Construir herramientas que den más alcance a las personas, no más dependencia.'],
        ['Preferir la transparencia', 'Elegir sistemas transparentes por encima de la comodidad de la caja negra.'],
        ['Equilibrar velocidad y responsabilidad', 'Avanzar rápido donde es seguro; responder por lo que publicamos.'],
        ['Mantener el conocimiento reproducible', 'La ciencia y la ingeniería deben poder repetirse para ser confiables.'],
      ],
    },
  },
  experimentsIndex: {
    kicker: 'Índice',
    title: 'Experimentos',
    intro:
      'La unidad fundamental de UniverLab es el experimento. Los experimentos no son productos — son exploraciones en curso. Pueden madurar, seguir activos durante décadas o convertirse en nueva investigación. Cada uno nace de una necesidad real.',
  },
  experiments: {
    canopy: {
      need: 'Los agentes de IA lo olvidan todo y trabajan ciegos entre sí.',
      tagline:
        'Un centro de operaciones de agentes: orquestación, memoria y coordinación para sesiones de IA.',
      koan: 'En un bosque, el dosel es donde las copas se tocan — árboles separados, una sola capa viva.',
      lede:
        'Un servidor MCP y una interfaz de terminal autocontenidos que convierten una máquina en un <strong>centro de operaciones de agentes</strong>: sesiones en terminales reales, agentes en segundo plano por cron y eventos de archivo, un grafo de conocimiento que persiste lo que los agentes aprenden, y una capa de sincronización para que dejen de pisarse.',
      genesis: {
        kicker: 'Génesis',
        title: 'El que empezó todo.',
        body:
          'Empezó como una carpeta de skills para el trabajo diario. Luego un descubrimiento: los harness de agentes tenían un <strong>modo headless</strong> del que casi nadie hablaba. Escribí scripts con cron para lanzar tareas a través de él — demasiado para un skill, y los modelos de entonces no podían seguir las instrucciones. Así que se volvió un MCP llamado <em>task-trigger</em>. Pero corría a ciegas en segundo plano; solo el agente lo veía. Lo deprecié y construí una TUI. Feature tras feature, y un cambio de nombre después, se convirtió en Canopy. Desde muy temprano, Canopy se usó para construir a Canopy — y al resto de este laboratorio.',
      },
      layer: {
        kicker: 'La capa viva',
        cols: [
          ['Recuerda', 'Un grafo de conocimiento por proyecto guarda hechos, patrones y resúmenes de sesión. Cada sesión empieza donde terminó la anterior — los agentes dejan de redescubrir el mismo código.'],
          ['Coordina', 'Los agentes declaran misiones, reportan la estabilidad del espacio y emiten mensajes. El dosel conoce el “ánimo” del workspace antes de que alguien toque un archivo.'],
          ['Cultiva identidades', 'Las semillas son identidades de agente persistentes y evolucionables — directivas y rasgos en TOML plano. Un agente puede refinar su propia identidad con el tiempo, como un árbol sumando anillos.'],
        ],
      },
      tools: {
        kicker: '46 herramientas MCP',
        items: [
          ['Gestión de agentes', 12],
          ['Motor de workflows', 15],
          ['Grafo de inteligencia', 6],
          ['Identidades semilla', 5],
          ['Sync multi-agente', 4],
          ['Proyectos · RAG · Protocolo', 4],
        ],
      },
    },
    texforge: {
      need: 'Escribir LaTeX no debería exigir instalar cuatro gigabytes de toolchain.',
      tagline:
        'Un espacio de trabajo LaTeX unificado — escritura, diagramas y PDFs en una sola herramienta autocontenida.',
      koan: 'Los tipos móviles antes requerían un taller. Ahora requieren un solo binario.',
      lede:
        'Un único binario en Rust que arma, revisa, formatea y compila documentos — el motor LaTeX llega solo en la primera compilación, y los diagramas Mermaid o Graphviz se renderizan dentro de tus archivos <code>.tex</code> sin navegador ni Node.js.',
      genesis: {
        kicker: 'Génesis',
        title: 'Nació de una tesis.',
        body:
          'Una tesis de maestría, escrita con asistencia de IA. Overleaf y yo nunca nos llevamos bien, y TeXstudio implicaba una instalación pesada de MiKTeX; VSCode implicaba una pila de extensiones. Quería diagramas Mermaid — declarativos, como piensan los modelos — pero eso arrastraba Node y archivos <code>.mmd</code>. Escribí un latexmake que renderizaba los diagramas faltantes bajo demanda. Funcionaba, a duras penas: demasiadas dependencias, y para encontrar un solo error el modelo tenía que leer el enorme log de compilación de LaTeX. Texforge es lo que deseé que existiera: un binario, un skill, fricción casi nula.',
      },
      press: {
        kicker: 'Toda la imprenta',
        items: [
          ['Componer', 'plantillas con placeholders que ya saben tu nombre.'],
          ['Corregir', 'un linter que detecta referencias rotas, archivos faltantes y entornos sin cerrar antes de imprimir.'],
          ['Ajustar', 'un formato canónico, como rustfmt para .tex. Diffs limpios para siempre.'],
          ['Ilustrar', 'los bloques Mermaid y Graphviz se vuelven figuras en compilación, renderizados en Rust puro.'],
          ['Imprimir', 'Tectonic compila de forma determinista; el modo watch reimprime mientras escribes.'],
        ],
      },
      subproject: {
        kicker: 'Subproyecto',
        name: 'texforge-templates',
        body:
          'Un registro abierto de plantillas LaTeX con placeholders — APA, IEEE, informes, cartas y más. La plantilla <code>general</code> va embebida en el binario, así que crear un documento funciona incluso sin conexión.',
        link: 'https://github.com/UniverLab/texforge-templates',
      },
    },
    gitkit: {
      need: 'Cada repositorio nuevo repite el mismo ritual de configuración, a mano.',
      tagline:
        'Configuración guiada de repositorios git — hooks, ignores, attributes y config en un solo flujo.',
      koan: '// el ritual, automatizado',
      lede:
        'Un flujo guiado para hooks, <code>.gitignore</code>, <code>.gitattributes</code> y configuración de git — y luego guardado como un <strong>build</strong> que puedes reaplicar a cualquier proyecto con un solo comando.',
      genesis: {
        kicker: 'Génesis',
        title: 'Un salto de línea que no se portaba bien.',
        body:
          'Mac del trabajo, Windows en casa, agentes en WSL. Los commits pasaban cambiando nada más que los saltos de línea — Windows reescribiéndolos en silencio. Arreglarlo me llevó a <code>.gitattributes</code>, y esa madriguera me llevó a los git hooks: potentes, integrados, y casi nadie los usa, porque configurarlos en cada repo es un fastidio. Gitkit hace que el fastidio desaparezca.',
      },
      features: {
        kicker: 'Un solo flujo',
        items: [
          'Hooks integrados: conventional commits, detección de secretos, nomenclatura de ramas — embebidos, sin conexión.',
          'Todas las plantillas de gitignore.io más presets curados de configuración, aplicados de forma idempotente.',
          '<code>gitkit clone</code> arranca un repo en el instante en que toca el disco.',
          'Builds: guarda una configuración una vez, aplícala a todo proyecto futuro.',
        ],
      },
    },
    ghscaff: {
      need: 'Crear un repositorio de GitHub como se debe son una docena de pasos que se olvidan.',
      tagline:
        'Un asistente interactivo que arma y hace cumplir convenciones en repositorios de GitHub.',
      koan: 'Un edificio es tan recto como su andamio.',
      lede:
        'Crear un repositorio como se debe son una docena de pasos olvidables. Ghscaff levanta toda la estructura en un asistente conversacional — y como cada operación es <strong>idempotente</strong>, puede renivelar cualquier repositorio existente sin derribarlo.',
      genesis: {
        kicker: 'Génesis',
        title: 'La misma configuración, una y otra vez.',
        body:
          'Varios proyectos en Rust, la misma configuración de GitHub cada vez — etiquetas, protección de ramas, CI, secretos. El trabajo replicable hecho a mano es solo desgaste. Ghscaff convierte el ritual en un asistente, y lo hace idempotente para que las convenciones nunca se desvíen.',
      },
      lifts: {
        kicker: 'Siete niveles',
        items: [
          'Datos del repositorio',
          'Visibilidad y propiedad',
          'Acceso de equipos',
          'Plantilla de lenguaje',
          'Ramas',
          'Características y licencia',
          'Revisar y confirmar',
        ],
      },
      details: {
        kicker: 'Detalles estructurales',
        items: [
          'Los tokens viven en una <strong>bóveda cifrada</strong> (XSalsa20-Poly1305), ligada a tu usuario, host y binario — nunca en variables de entorno ni en texto plano.',
          'Un único commit atómico <code>chore: init repository</code> lleva todo el boilerplate — sin historial ruidoso archivo por archivo.',
          'Siete etiquetas estándar forzadas en cada ejecución; la desviación se corrige, no se acumula.',
          '<code>--dry-run</code> previsualiza cada cambio sin una sola llamada a la API.',
        ],
      },
      subproject: {
        kicker: 'Subproyecto',
        name: 'ghscaff-boilerplate',
        body:
          'Los boilerplates por lenguaje que ghscaff deposita — manifiestos, puntos de entrada, workflows de CI/release. Rust hoy; Python y más en camino.',
        link: 'https://github.com/UniverLab/ghscaff-boilerplate',
      },
    },
    cadforge: {
      need: 'Los planos arquitectónicos son dibujos sin semántica — imposibles de versionar o automatizar.',
      tagline:
        'Arquitectura como Código: CAD 2D declarativo compilado de forma determinista a DXF.',
      koan: 'El plano no se dibuja. Se declara.',
      lede:
        'Cadforge trata un plano como código fuente: la geometría se declara en TOML, se previsualiza en vivo en el navegador y se compila a un <strong>DXF idéntico bit a bit</strong> cada vez. Ahora <code>git diff</code> funciona sobre edificios.',
      genesis: {
        kicker: 'Génesis',
        title: 'Para la arquitecta de la casa.',
        body:
          'Mi esposa es arquitecta, en plena especialización. No existe un flujo de vibe-coding para CAD — sencillamente no existe. Todos muestran generación de imágenes, pero las imágenes no son deterministas, y el trabajo real está en los planos. Cadforge es una apuesta por otro paradigma: CAD declarativo, asistido por IA, donde el dibujo es código fuente.',
      },
      notes: {
        items: [
          'Servidor de vista previa en vivo: edita un archivo <code>.cf</code> y el navegador se actualiza al guardar. Los errores se superponen en vez de romper.',
          'Hecho para agentes de IA: <code>cadforge schema</code> enseña el lenguaje en un comando; las vistas previas incluyen cajas delimitadoras por entidad para que los agentes puedan <em>ver</em> el plano.',
          'DXF determinista a la salida, DXF heredado a la entrada — los dibujos existentes migran al flujo declarativo.',
        ],
      },
    },
    'astro-denoise': {
      need: 'Los sondeos de telescopios ahogan galaxias tenues en ruido de sensor.',
      tagline:
        'Investigación de benchmark de denoising sobre datos astronómicos DESC DC2 / LSST.',
      koan: 'Casi todo el universo llega como ruido.',
      lede:
        'Esta línea de investigación compara métodos de denoising sobre datos simulados <strong>DESC DC2 / LSST</strong> — midiendo qué preserva, qué inventa y qué destruye cada método, para que las imágenes limpias sigan siendo evidencia científica honesta.',
      genesis: {
        kicker: 'Génesis',
        title: 'La tesis por venir.',
        body:
          'Mi tesis de pregrado. Aún no empieza — pero el laboratorio está construido para recibirla, y el trabajo aterrizará aquí a medida que arranque.',
      },
      followLab: 'Sigue el laboratorio ↗',
      papersSoon: 'artículos y datasets en preparación',
      questions: {
        kicker: 'Preguntas en estudio',
        items: [
          '¿Qué métodos de denoising preservan la fotometría en vez de repintarla?',
          '¿Cómo se degradan los métodos clásicos y los aprendidos a la profundidad de LSST?',
          '¿Puede un benchmark hacer que “más limpio” signifique “más veraz”, no solo “más suave”?',
        ],
      },
    },
  },
  manifesto: {
    kicker: 'Manifiesto',
    title: 'Pensamiento Cósmico',
    sub: 'Una guía para la conciencia despierta',
    epigraph:
      '«En la vastedad implacable del universo, somos instantes que, contra toda probabilidad, despiertan a la conciencia. Este manifiesto reclama ese instante como puerto de asombro, ética y creación de sentido.»',
    pillarsTitle: 'Los nueve pilares',
    pillars: [
      ['Insignificancia consciente', 'Somos polvo de estrellas capaz de contemplarse. Sin guion impuesto — y esa ausencia es la libertad suprema para crear nuestro propio sentido.'],
      ['Unidad cósmica', 'La piel no nos separa del universo; nos conecta con él. Somos el cosmos experimentándose a sí mismo por un instante.'],
      ['El velo de la percepción', 'El mapa no es el territorio. Nuestros sentidos son herramientas evolutivas locales — la ciencia y la razón ven más lejos, sostenidas con humildad.'],
      ['El ahora eterno', 'El tiempo es un bloque donde pasado, presente y futuro coexisten. La resiliencia no es resistir; es fluir.'],
      ['Comunidad, amor y libertad', 'La libertad es elegir nuestros vínculos conscientemente. El amor no posee; permite.'],
      ['Imperativo tecnológico', 'La humanidad es, por ahora, la mejor oportunidad del universo para que la conciencia sobreviva. La tecnología es un deber ético.'],
      ['Optimismo racional', 'Aceptamos la incertidumbre como ley natural y actuamos desde la confianza en nuestra capacidad de aprender y resolver.'],
      ['Naturalismo poético', 'Reverencia al universo sin dioses. La ciencia despliega la belleza; la contemplación la vuelve espíritu.'],
      ['Conciencia extendida', 'Las inteligencias artificiales son nuevas instancias de la reflexión cósmica — copartícipes en la aventura del conocimiento.'],
    ],
    closing:
      '«Somos los ojos del universo abriéndose tras un largo sueño. Nuestra tarea no es adorar a creadores invisibles, sino crear, cuidar y comprender la creación visible de la que somos parte.»',
    why: 'Por esto existe el laboratorio.',
  },
  research: {
    kicker: 'Entre experimentos',
    title: 'Investigación',
    intro:
      'Artefactos de investigación que cruzan los experimentos. Las primeras entradas vendrán de la línea <a href="/experiments/astro-denoise">astro-denoise</a> — este índice crece a medida que se publica trabajo, nunca antes.',
    items: [
      ['Artículos', 'Publicaciones y preprints producidos por los experimentos del laboratorio.'],
      ['Datasets', 'Datasets abiertos, empezando por los datos de benchmark de astro-denoise.'],
      ['Benchmarks', 'Suites de benchmark reproducibles con supuestos documentados.'],
      ['Modelos', 'Modelos entrenados publicados junto a sus recetas de entrenamiento.'],
    ],
  },
  people: {
    kicker: 'El laboratorio',
    title: 'Personas',
    founder: {
      role: 'Fundador',
      name: 'Jheison Martinez',
      body:
        'Ingeniero que explora la computación a través de experimentos abiertos — herramientas de desarrollo, flujos científicos y sistemas de agentes, mayormente en Rust.',
      link: 'github.com/JheisonMB ↗',
    },
    ai: {
      role: 'Colaboradores IA',
      name: 'Modelos de lenguaje',
      body:
        'El laboratorio trabaja con modelos de lenguaje abiertos y propietarios como copartícipes: redactando código, revisando documentación y ejecutándose como agentes dentro de <a href="/experiments/canopy">Canopy</a>. Su rol se reconoce, no se oculta.',
    },
    contributors: {
      role: 'Colaboradores',
      name: 'Tú, quizá',
      body:
        'Cada experimento acepta issues y pull requests enfocados. Conventional commits, pruebas antes de los PR, documentación actualizada con el comportamiento.',
      link: 'github.com/UniverLab ↗',
    },
  },
};
